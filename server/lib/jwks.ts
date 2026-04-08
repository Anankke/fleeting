/**
 * server/lib/jwks.ts
 *
 * JWKS cache and JWT verification utilities.
 *
 * Design notes:
 *  - `kid` is NOT required in token headers. If absent, all keys with a
 *    matching algorithm are tried in turn.
 *  - Two separate JWKS stores are maintained:
 *      1. In-house OIDC provider (for validating id_token / access_token
 *         issued by the app's own OIDC server)
 *      2. EVE Online SSO (for validating passthrough access tokens issued
 *         by login.eveonline.com)
 */

import { importJWK, jwtVerify, type JWTPayload, type JWK } from 'jose';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface JwksCache {
  keys: JWK[];
  fetchedAt: number;
}

const caches = new Map<string, JwksCache>();

async function fetchJwks(jwksUrl: string): Promise<JWK[]> {
  const cached = caches.get(jwksUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.keys;
  }
  const res  = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status} ${jwksUrl}`);
  const data = (await res.json()) as { keys: JWK[] };
  caches.set(jwksUrl, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

/**
 * Verify a JWT against the JWKS at the given URL.
 * `kid` in the token header is optional — if absent, all alg-matching keys
 * are tried. Throws if no key produces a valid signature.
 *
 * Pass `issuer` and/or `audience` to enforce those claims.
 */
export async function verifyJwt(
  token: string,
  jwksUrl: string,
  options?: { issuer?: string; audience?: string },
): Promise<JWTPayload> {
  const keys = await fetchJwks(jwksUrl);

  // Decode header without verification to determine kid / alg
  const headerB64 = token.split('.')[0];
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as {
    kid?: string;
    alg?: string;
  };

  // Filter candidate keys
  let candidates = keys;
  if (header.kid) {
    candidates = keys.filter((k) => k.kid === header.kid);
    if (candidates.length === 0) {
      // kid not found in current cache — force refresh once
      caches.delete(jwksUrl);
      const fresh = await fetchJwks(jwksUrl);
      candidates = fresh.filter((k) => k.kid === header.kid);
      if (candidates.length === 0) throw new Error(`No JWKS key found for kid: ${header.kid}`);
    }
  } else if (header.alg) {
    candidates = keys.filter((k) => !k.alg || k.alg === header.alg);
  }

  if (candidates.length === 0) throw new Error('No candidate JWKS keys found');

  let lastErr: unknown;
  for (const jwk of candidates) {
    try {
      const publicKey = await importJWK(jwk, header.alg ?? jwk.alg ?? 'RS256');
      const { payload } = await jwtVerify(token, publicKey, {
        issuer:         options?.issuer,
        audience:       options?.audience,
        clockTolerance: 30, // tolerate up to 30 s of clock skew
      });
      return payload;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('JWT verification failed');
}

// ── Per-provider JWKS URL helpers ─────────────────────────────────────────────

/**
 * Returns the JWKS URL for the in-house OIDC provider.
 * Falls back to `<ISSUER>/.well-known/jwks.json` if the well-known discovery
 * document isn't available.
 */
let oidcJwksUrl: string | null = null;

export async function getOidcJwksUrl(): Promise<string> {
  if (oidcJwksUrl) return oidcJwksUrl;
  const issuer = process.env.OIDC_ISSUER;
  if (!issuer) throw new Error('OIDC_ISSUER is not set');
  try {
    const meta = await fetch(`${issuer}/.well-known/openid-configuration`).then((r) => r.json()) as { jwks_uri?: string };
    oidcJwksUrl = meta.jwks_uri ?? `${issuer}/.well-known/jwks.json`;
  } catch {
    oidcJwksUrl = `${issuer}/.well-known/jwks.json`;
  }
  return oidcJwksUrl;
}

/** JWKS URL for EVE Online SSO (login.eveonline.com). */
const EVE_SSO_META = 'https://login.eveonline.com/.well-known/oauth-authorization-server';
let eveSsoJwksUrl: string | null = null;

export async function getEveSsoJwksUrl(): Promise<string> {
  if (eveSsoJwksUrl) return eveSsoJwksUrl;
  const meta = await fetch(EVE_SSO_META).then((r) => r.json()) as { jwks_uri: string };
  eveSsoJwksUrl = meta.jwks_uri;
  return eveSsoJwksUrl;
}
