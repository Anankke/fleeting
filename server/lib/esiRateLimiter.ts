/**
 * server/lib/esiRateLimiter.ts
 *
 * Per-group ESI rate-limit tracker.
 *
 * ESI uses a token-bucket model per rate-limit group (e.g. "fleet", "char-detail").
 * The group, max-tokens, and window-size are defined in the OpenAPI spec via the
 * `x-rate-limit` extension on each path+method.
 *
 * At startup, `loadRateLimitGroups()` fetches https://esi.evetech.net/meta/openapi.json
 * and extracts every `x-rate-limit` block, building a path-to-group map.
 *
 * On every outbound ESI response, `updateFromHeaders()` reconciles the in-process
 * token-bucket state with the live ESI response headers:
 *   X-Ratelimit-Remaining  — tokens remaining in this window
 *   X-Ratelimit-Reset      — seconds until window resets
 *   X-Ratelimit-Limit      — total tokens in this window (== max-tokens)
 *
 * `checkRateLimit(group)` returns the current remaining count and whether we should
 * slow down. When remaining drops below THROTTLE_THRESHOLD we add a delay so the
 * caller can space out requests before the window resets.
 *
 * ESI rate limits are separate from the error limit system. See esi.ts for the
 * error-limit (X-ESI-Error-Limit-Remain) implementation.
 */

import {
  esiRateLimitRemaining,
  esiRateLimitLimit,
  esiRateLimitResetSeconds,
  esiRateLimitThrottledTotal,
} from './metrics.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RateLimitSpec {
  group:       string;
  maxTokens:   number;
  windowSize:  string; // e.g. "15m"
}

/** Live state for one rate-limit group, reconciled from response headers. */
interface GroupState {
  remaining: number;   // last known X-Ratelimit-Remaining (or maxTokens if unknown)
  limit:     number;   // X-Ratelimit-Limit == maxTokens
  resetAt:   number;   // unix-ms timestamp when the window resets
}

// ── Config ────────────────────────────────────────────────────────────────────

/** When remaining tokens drop below this fraction of the limit, add inter-request delays. */
const THROTTLE_FRACTION = 0.15;

/** Maximum delay to add when throttling, in ms. */
const MAX_THROTTLE_DELAY_MS = 5_000;

const ESI_OPENAPI_URL =
  process.env.ESI_OPENAPI_URL ?? 'https://esi.evetech.net/meta/openapi.json';

// ── Internal state ─────────────────────────────────────────────────────────────

/** Maps URL path template (e.g. "/fleets/{fleet_id}/members/") → rate-limit spec. */
const pathToSpec = new Map<string, RateLimitSpec>();

/** Maps group name → live state (updated from response headers). */
const groupState = new Map<string, GroupState>();

// ── Startup: parse OpenAPI spec ───────────────────────────────────────────────

/**
 * Fetch the ESI OpenAPI spec and build the path→group map.
 * Called once at server startup. Safe to call multiple times (idempotent after first success).
 *
 * @param intervalMs  How often to re-fetch (refresh) the spec. Defaults to 24 hours.
 */
export async function loadRateLimitGroups(intervalMs = 24 * 3600_000): Promise<void> {
  await fetchAndParse();

  // Re-fetch on a timer so group definitions stay current after ESI updates.
  setInterval(() => {
    fetchAndParse().catch((err: unknown) =>
      console.warn('[esiRateLimiter] Failed to refresh OpenAPI spec:', (err as Error).message),
    );
  }, intervalMs).unref(); // don't keep the process alive just for this
}

async function fetchAndParse(): Promise<void> {
  const res = await fetch(ESI_OPENAPI_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`OpenAPI fetch failed: ${res.status}`);
  }

  // The spec is large (~1 MB); we stream-parse only what we need.
  // Because we're in Node.js ESM without a streaming JSON parser dep, just parse normally —
  // it's a one-time startup cost.
  const spec = await res.json() as {
    paths?: Record<string, Record<string, {
      'x-rate-limit'?: { group: string; 'max-tokens': number; 'window-size': string };
    }>>;
  };

  let parsed = 0;
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const operation of Object.values(methods)) {
      const rl = operation['x-rate-limit'];
      if (!rl) continue;

      const spec: RateLimitSpec = {
        group:      rl.group,
        maxTokens:  rl['max-tokens'],
        windowSize: rl['window-size'],
      };

      pathToSpec.set(path, spec);

      // Pre-populate groupState if we haven't seen this group before.
      if (!groupState.has(rl.group)) {
        groupState.set(rl.group, {
          remaining: rl['max-tokens'],
          limit:     rl['max-tokens'],
          resetAt:   0,
        });
      }
      parsed++;
    }
  }

  console.info(`[esiRateLimiter] Parsed ${parsed} rate-limit entries from OpenAPI spec`);
}

// ── Path → group lookup ───────────────────────────────────────────────────────

/**
 * Convert a concrete ESI path (e.g. "/characters/12345/fleet/") to the canonical
 * path template (e.g. "/characters/{character_id}/fleet/") so we can look up
 * the rate-limit group.
 *
 * Strategy: find the matching path template by replacing numeric segments with
 * their placeholder equivalents. We try an exact match first, then a regex match.
 */
export function resolveGroup(concretePath: string): string | undefined {
  // Exact match (only works for paths without IDs)
  if (pathToSpec.has(concretePath)) {
    return pathToSpec.get(concretePath)!.group;
  }

  // Replace numeric and UUID-like path segments with {placeholder} and find a match.
  const normalized = concretePath.replace(/\/\d[\w-]*/g, '/{x}');

  for (const [template, spec] of pathToSpec) {
    const pattern = template.replace(/\{[^}]+\}/g, '{x}');
    if (normalized === pattern) {
      return spec.group;
    }
  }

  return undefined;
}

// ── Header reconciliation ─────────────────────────────────────────────────────

/**
 * Called after every ESI response. Updates the group's live state from the
 * response headers. ESI does not always return rate-limit headers (e.g. on
 * endpoints without a rate-limit group, or on 304 responses), so all reads
 * are optional.
 */
export function updateFromHeaders(group: string | undefined, res: Response): void {
  if (!group) return;

  const remaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '', 10);
  const limit     = parseInt(res.headers.get('x-ratelimit-limit')     ?? '', 10);
  const reset     = parseInt(res.headers.get('x-ratelimit-reset')     ?? '', 10);

  const state = groupState.get(group);
  if (!state) return; // unknown group — shouldn't happen after spec parse

  if (!Number.isNaN(remaining)) {
    state.remaining = remaining;
    esiRateLimitRemaining.set({ group }, remaining);
  }
  if (!Number.isNaN(limit)) {
    state.limit = limit;
    esiRateLimitLimit.set({ group }, limit);
  }
  if (!Number.isNaN(reset)) {
    state.resetAt = Date.now() + reset * 1000;
    esiRateLimitResetSeconds.set({ group }, reset);
  }
}

// ── Throttle ──────────────────────────────────────────────────────────────────

/**
 * Returns a delay (ms) that callers should `await` before making a request, if
 * the group's remaining tokens are low. Returns 0 if no throttling needed.
 *
 * The delay scales linearly from 0 (at THROTTLE_FRACTION of limit) up to
 * MAX_THROTTLE_DELAY_MS (at 0 remaining). This creates back-pressure without
 * blocking entirely.
 */
export function getThrottleDelay(group: string | undefined): number {
  if (!group) return 0;

  const state = groupState.get(group);
  if (!state || state.limit === 0) return 0;

  const threshold = state.limit * THROTTLE_FRACTION;
  if (state.remaining >= threshold) return 0;

  // Window has already reset
  if (state.resetAt > 0 && Date.now() >= state.resetAt) {
    state.remaining = state.limit;
    return 0;
  }

  // Scale: 0 remaining → MAX_THROTTLE_DELAY_MS; threshold remaining → 0 ms
  const fraction = 1 - state.remaining / threshold;
  const delayMs  = Math.round(fraction * MAX_THROTTLE_DELAY_MS);

  esiRateLimitThrottledTotal.inc({ group });
  return delayMs;
}

/** Expose current group state (read-only). Used by health/debug routes. */
export function getRateLimitState(): ReadonlyMap<string, Readonly<GroupState>> {
  return groupState;
}
