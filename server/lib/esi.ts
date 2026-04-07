/**
 * server/lib/esi.ts — EVE Swagger Interface helper
 *
 * ESI compliance:
 *  • User-Agent header identifying the application (required by ESI best practices).
 *  • Error-limit tracking: monitors X-ESI-Error-Limit-Remain / X-ESI-Error-Limit-Reset
 *    on every response. When remain drops to 0 (window exhausted), all outbound requests
 *    are blocked until the window resets to prevent an IP ban.
 *  • Conditional GET (ETag / Last-Modified + 304): per-path cache entries stored
 *    in-process (Map). On 304 the cached body is returned without re-parsing.
 *    The Expires header is also stored so callers know when new data is available;
 *    a warning metric is incremented if a request fires before Expires elapses.
 *  • Transient-error retry: 429 and 503 are retried once after a short delay.
 *    520 (EVE monolith rate limit) is NOT retried — callers must back off.
 *  • All observations are reported to Prometheus via server/lib/metrics.ts.
 *
 * See: https://docs.esi.evetech.net/docs/esi_introduction.html
 */

import {
  esiRequestsTotal,
  esiRequestDuration,
  esiErrorLimitRemain,
  esiErrorLimitReset,
  esiErrorLimitExhausted,
  esiCacheHitsTotal,
  esiPrematureRequestsTotal,
  esiRetriesTotal,
} from './metrics.js';
import { resolveGroup, updateFromHeaders, getThrottleDelay } from './esiRateLimiter.js';

const ESI_BASE          = process.env.ESI_BASE_URL ?? 'https://esi.evetech.net';
const ESI_COMPATIBILITY = '2026-04-07';

/**
 * ESI_USER_AGENT env var allows operators to override the default User-Agent.
 * Format should be: "<app-name>/<version> (<contact-url>)"
 * Example: ESI_USER_AGENT="my-tool/1.0 (https://github.com/me/my-tool)"
 */
const USER_AGENT = process.env.ESI_USER_AGENT
  ?? 'peld-online/0.1 (https://github.com/your-org/peld-online; contact via GitHub issues)';

// ── Error-limit state ─────────────────────────────────────────────────────────

interface ErrorLimitState {
  remain: number;          // X-ESI-Error-Limit-Remain (100 when window is fresh)
  resetAt: number;         // unix-ms timestamp when the window resets
}

let errorLimit: ErrorLimitState = { remain: 100, resetAt: 0 };

/** Returns true when the error-limit window is currently exhausted (remain === 0). */
function isErrorLimitExhausted(): boolean {
  if (errorLimit.remain > 0) return false;
  if (Date.now() >= errorLimit.resetAt) {
    // Window has rolled over; reset optimistically so we don't block forever.
    errorLimit = { remain: 100, resetAt: 0 };
    return false;
  }
  return true;
}

function updateErrorLimit(res: Response): void {
  const remain = parseInt(res.headers.get('x-esi-error-limit-remain') ?? '', 10);
  const reset  = parseInt(res.headers.get('x-esi-error-limit-reset')  ?? '', 10);

  if (!Number.isNaN(remain)) {
    errorLimit.remain = remain;
    esiErrorLimitRemain.set(remain);
    if (remain === 0) esiErrorLimitExhausted.inc();
  }
  if (!Number.isNaN(reset)) {
    errorLimit.resetAt = Date.now() + reset * 1000;
    esiErrorLimitReset.set(reset);
  }
}

/** Expose current error-limit state for logging / health checks. */
export function getErrorLimitState(): Readonly<ErrorLimitState> {
  return errorLimit;
}

// ── Conditional-GET cache (ETag / Last-Modified) ──────────────────────────────

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  expiresAt: number;   // unix-ms; 0 means unknown
  body: unknown;
}

/**
 * Key: the canonical URL string (path + query, without host).
 * This is a per-process, non-shared cache. It is intentionally lightweight —
 * we do NOT store ESI data in Memcached to avoid keeping duplicate copies of
 * data that is already persisted in PostgreSQL. The only purpose of this Map
 * is to carry ETag / Last-Modified tokens so we can send conditional GETs and
 * accept 304 responses, reducing bandwidth and avoiding cache-circumvention bans.
 */
const conditionalCache = new Map<string, CacheEntry>();

// ── Error classes ─────────────────────────────────────────────────────────────

export class EsiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'EsiError';
  }
}

/** Thrown when the ESI error-limit window is exhausted (remain === 0). */
export class EsiErrorLimitError extends Error {
  constructor(public readonly resetInMs: number) {
    super(`ESI error-limit exhausted; resets in ${Math.ceil(resetInMs / 1000)}s`);
    this.name = 'EsiErrorLimitError';
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

const TRANSIENT_STATUSES = new Set([429, 503]);
const RETRY_DELAY_MS     = 1_000;

async function esiGet<T>(
  path: string,
  accessToken?: string,
  params: Record<string, string> = {},
): Promise<T> {
  // Block outbound calls when the error-limit window is exhausted.
  if (isErrorLimitExhausted()) {
    const resetInMs = errorLimit.resetAt - Date.now();
    throw new EsiErrorLimitError(Math.max(0, resetInMs));
  }

  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', 'tranquility');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  // Resolve the rate-limit group for this path (from OpenAPI spec, loaded at startup).
  const group    = resolveGroup(path);
  const throttle = getThrottleDelay(group);
  if (throttle > 0) {
    await new Promise((r) => setTimeout(r, throttle));
  }

  const cacheKey = `${path}?${url.searchParams.toString()}`;
  const cached   = conditionalCache.get(cacheKey);

  // Warn (metric) if we are re-requesting before the Expires window has elapsed.
  if (cached && cached.expiresAt > 0 && Date.now() < cached.expiresAt) {
    esiPrematureRequestsTotal.inc({ path });
  }

  const headers: Record<string, string> = {
    Accept:                 'application/json',
    'User-Agent':           USER_AGENT,
    'X-Compatibility-Date': ESI_COMPATIBILITY,
  };
  if (accessToken)          headers['Authorization']    = `Bearer ${accessToken}`;
  if (cached?.etag)         headers['If-None-Match']    = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  return attemptEsiGet<T>(url.toString(), path, cacheKey, headers, cached ?? null, false, group);
}

async function attemptEsiGet<T>(
  urlStr: string,
  path: string,
  cacheKey: string,
  headers: Record<string, string>,
  cached: CacheEntry | null,
  isRetry = false,
  group?: string,
): Promise<T> {
  const timerEnd = esiRequestDuration.startTimer({ path });

  let res: Response;
  try {
    res = await fetch(urlStr, { headers });
  } finally {
    timerEnd();
  }

  updateErrorLimit(res);
  updateFromHeaders(group, res);
  esiRequestsTotal.inc({ method: 'GET', path, status: String(res.status) });

  // ── 304 Not Modified ───────────────────────────────────────────────────────
  if (res.status === 304 && cached) {
    esiCacheHitsTotal.inc({ path });
    return cached.body as T;
  }

  // ── Transient errors: retry once ──────────────────────────────────────────
  if (!isRetry && TRANSIENT_STATUSES.has(res.status)) {
    esiRetriesTotal.inc({ path, status: String(res.status) });
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return attemptEsiGet<T>(urlStr, path, cacheKey, headers, cached, true, group);
  }

  // ── All other non-2xx ────────────────────────────────────────────────────
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EsiError(`ESI ${res.status}: ${path}`, res.status, body);
  }

  // ── Success: parse body and update conditional-GET cache entry ────────────
  const body = await res.json() as T;

  const newEntry: CacheEntry = {
    body,
    expiresAt:    0,
    etag:         res.headers.get('etag')          ?? cached?.etag,
    lastModified: res.headers.get('last-modified') ?? cached?.lastModified,
  };

  const expiresHeader = res.headers.get('expires');
  if (expiresHeader) {
    const expiresMs = Date.parse(expiresHeader);
    if (!Number.isNaN(expiresMs)) newEntry.expiresAt = expiresMs;
  }

  if (newEntry.etag || newEntry.lastModified) {
    conditionalCache.set(cacheKey, newEntry);
  }

  return body;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FleetInfo {
  fleet_id: bigint;
  role: string;
  squad_id: bigint;
  wing_id: bigint;
}

export interface FleetMember {
  character_id: number;
  solar_system_id: number;
  ship_type_id: number;
  role: string;
  squad_id: bigint;
  wing_id: bigint;
}

export interface CharacterInfo {
  name: string;
  corporation_id: number;
  alliance_id?: number;
}

/**
 * GET /characters/{character_id}/fleet/
 */
export async function getFleetForCharacter(
  accessToken: string,
  characterId: number,
): Promise<FleetInfo> {
  return esiGet<FleetInfo>(`/characters/${characterId}/fleet/`, accessToken);
}

/**
 * GET /fleets/{fleet_id}/members/
 */
export async function getFleetMembers(
  accessToken: string,
  fleetId: bigint | number,
): Promise<FleetMember[]> {
  return esiGet<FleetMember[]>(`/fleets/${fleetId}/members/`, accessToken);
}

/**
 * GET /characters/{character_id}/
 * Public endpoint — no access token required.
 * Character data already stored in eve_characters (PostgreSQL); this function
 * is used when looking up characters not yet in the local DB.
 */
export async function getCharacterInfo(characterId: number): Promise<CharacterInfo> {
  return esiGet<CharacterInfo>(`/characters/${characterId}/`);
}

export interface CharacterOnlineStatus {
  online: boolean;
  last_login?: string;
  last_logout?: string;
  logins?: number;
}

/**
 * GET /characters/{character_id}/online/
 * Requires a valid access token for the character.
 */
export async function getCharacterOnlineStatus(
  accessToken: string,
  characterId: number,
): Promise<CharacterOnlineStatus> {
  return esiGet<CharacterOnlineStatus>(`/characters/${characterId}/online/`, accessToken);
}
