/**
 * server/lib/metrics.ts
 *
 * Central Prometheus metrics registry for peld-online.
 * Import `registry` to expose via GET /metrics.
 * Import individual metrics to record observations from other modules.
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ app: 'peld-online' });

// ── ESI outbound request metrics ──────────────────────────────────────────────

/** Total ESI requests made, labelled by HTTP method and route path template. */
export const esiRequestsTotal = new Counter({
  name: 'esi_requests_total',
  help: 'Total number of outbound ESI requests',
  labelNames: ['method', 'path', 'status'] as const,
  registers: [registry],
});

/** Duration of ESI requests in seconds. */
export const esiRequestDuration = new Histogram({
  name: 'esi_request_duration_seconds',
  help: 'Latency of outbound ESI requests',
  labelNames: ['path'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// ── ESI error-limit tracking ──────────────────────────────────────────────────

/**
 * Current value of X-ESI-Error-Limit-Remain as reported by the last ESI response.
 * ESI gives each IP 100 errors per 60-second window; this counts down toward 0.
 */
export const esiErrorLimitRemain = new Gauge({
  name: 'esi_error_limit_remain',
  help: 'Errors remaining in the current ESI error-limit window (X-ESI-Error-Limit-Remain)',
  registers: [registry],
});

/**
 * Seconds until the ESI error-limit window resets (X-ESI-Error-Limit-Reset).
 */
export const esiErrorLimitReset = new Gauge({
  name: 'esi_error_limit_reset_seconds',
  help: 'Seconds until the ESI error-limit window resets (X-ESI-Error-Limit-Reset)',
  registers: [registry],
});

/** Number of times the ESI error limit was exhausted (remain reached 0). */
export const esiErrorLimitExhausted = new Counter({
  name: 'esi_error_limit_exhausted_total',
  help: 'Number of times the ESI error-limit was fully exhausted',
  registers: [registry],
});

// ── ESI conditional-request (ETag / 304) metrics ────────────────────────────

/** 304 Not Modified responses — confirms ETag caching is working. */
export const esiCacheHitsTotal = new Counter({
  name: 'esi_cache_hits_total',
  help: 'ESI responses that returned 304 Not Modified (ETag cache hit)',
  labelNames: ['path'] as const,
  registers: [registry],
});

/** Requests sent before the ESI Expires window — warns of cache circumvention. */
export const esiPrematureRequestsTotal = new Counter({
  name: 'esi_premature_requests_total',
  help: 'ESI requests fired before the Expires window elapsed (potential cache circumvention)',
  labelNames: ['path'] as const,
  registers: [registry],
});

// ── ESI retry metrics ─────────────────────────────────────────────────────────

/** Retries triggered by transient ESI errors (429, 503, 520). */
export const esiRetriesTotal = new Counter({
  name: 'esi_retries_total',
  help: 'Number of retried ESI requests due to transient errors',
  labelNames: ['path', 'status'] as const,
  registers: [registry],
});

// ── ESI per-group rate-limit metrics ─────────────────────────────────────────
// These are populated by esiRateLimiter.ts from X-Ratelimit-* response headers.
// Groups come from the x-rate-limit extension in the ESI OpenAPI spec.

/** X-Ratelimit-Remaining per group — how many tokens are left in this window. */
export const esiRateLimitRemaining = new Gauge({
  name: 'esi_ratelimit_remaining',
  help: 'Tokens remaining in the current ESI rate-limit window (X-Ratelimit-Remaining)',
  labelNames: ['group'] as const,
  registers: [registry],
});

/** X-Ratelimit-Limit per group — total tokens available in each window. */
export const esiRateLimitLimit = new Gauge({
  name: 'esi_ratelimit_limit',
  help: 'Total tokens per ESI rate-limit window (X-Ratelimit-Limit / max-tokens from spec)',
  labelNames: ['group'] as const,
  registers: [registry],
});

/** X-Ratelimit-Reset per group — seconds until the window resets. */
export const esiRateLimitResetSeconds = new Gauge({
  name: 'esi_ratelimit_reset_seconds',
  help: 'Seconds until the ESI rate-limit window resets (X-Ratelimit-Reset)',
  labelNames: ['group'] as const,
  registers: [registry],
});

/** Number of requests that were throttled (delayed) because remaining was low. */
export const esiRateLimitThrottledTotal = new Counter({
  name: 'esi_ratelimit_throttled_total',
  help: 'Number of ESI requests delayed by the rate-limit throttler',
  labelNames: ['group'] as const,
  registers: [registry],
});

// ── Fleet-tracker metrics ─────────────────────────────────────────────────────

/** Active fleet sessions currently being tracked. */
export const activeFleetTrackers = new Gauge({
  name: 'fleet_trackers_active',
  help: 'Number of fleet sessions currently being polled by memberTracker',
  registers: [registry],
});

/** Total poll cycles completed by memberTracker. */
export const fleetTrackerPollsTotal = new Counter({
  name: 'fleet_tracker_polls_total',
  help: 'Total memberTracker poll cycles',
  labelNames: ['result'] as const,
  registers: [registry],
});
