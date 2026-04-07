'use strict';

/**
 * server/lib/auth.js
 *
 * OIDC (in-house) auth flow + session helpers.
 *
 * Expected OIDC id_token claims:
 *   sub, name, roles[], eve_characters[]
 *
 * The OIDC provider manages EVE SSO — eve_characters contains
 *   [{ id: bigint, name: string, access_token, refresh_token, expires_at }]
 */

const crypto = require('crypto');
const { query } = require('../db/pg');

const OIDC_ISSUER      = process.env.OIDC_ISSUER;
const CLIENT_ID        = process.env.OIDC_CLIENT_ID;
const CLIENT_SECRET    = process.env.OIDC_CLIENT_SECRET;
const REDIRECT_URI     = process.env.OIDC_REDIRECT_URI;

/** Kick off OIDC authorization code + PKCE flow */
async function oidcLogin(req, reply) {
  const state        = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  req.session.oidcState        = state;
  req.session.oidcCodeVerifier = codeVerifier;

  const discoveryUrl = `${OIDC_ISSUER}/.well-known/openid-configuration`;
  const discovery = await fetch(discoveryUrl).then((r) => r.json());

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  reply.redirect(url.toString());
}

/** OIDC callback — exchange code for tokens, upsert user, set session */
async function oidcCallback(req, reply) {
  const { code, state } = req.query;

  if (!code || state !== req.session.oidcState) {
    return reply.code(400).send({ error: 'Invalid state' });
  }

  const codeVerifier = req.session.oidcCodeVerifier;
  delete req.session.oidcState;
  delete req.session.oidcCodeVerifier;

  const discoveryUrl = `${OIDC_ISSUER}/.well-known/openid-configuration`;
  const discovery = await fetch(discoveryUrl).then((r) => r.json());

  // Exchange code for tokens
  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return reply.code(502).send({ error: 'Token exchange failed' });
  }

  const tokens = await tokenRes.json();

  // Decode id_token (no sig verification — OIDC provider is in-house and trusted via HTTPS)
  const idTokenPayload = JSON.parse(
    Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString(),
  );

  const { sub, name, roles = [], eve_characters = [] } = idTokenPayload;

  // Upsert user
  const { rows } = await query(
    `INSERT INTO users (oidc_sub, name, roles)
     VALUES ($1, $2, $3)
     ON CONFLICT (oidc_sub) DO UPDATE
       SET name = EXCLUDED.name, roles = EXCLUDED.roles, updated_at = NOW()
     RETURNING id`,
    [sub, name, roles],
  );
  const userId = rows[0].id;

  // Upsert eve_characters
  for (const char of eve_characters) {
    await query(
      `INSERT INTO eve_characters (id, user_id, character_name, access_token, refresh_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET character_name = EXCLUDED.character_name,
             access_token   = EXCLUDED.access_token,
             refresh_token  = EXCLUDED.refresh_token,
             token_expires_at = EXCLUDED.token_expires_at`,
      [char.id, userId, char.name, char.access_token, char.refresh_token, char.expires_at ? new Date(char.expires_at * 1000) : null],
    );
  }

  req.session.userId     = userId;
  req.session.roles      = roles;
  req.session.characters = eve_characters.map((c) => ({ id: c.id, name: c.name }));

  reply.redirect('/pilot.html');
}

/** Middleware: require any authenticated session */
async function requireAuth(req, reply) {
  if (!req.session.userId) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

/** Middleware factory: require a specific role */
function requireRole(role) {
  return async function (req, reply) {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!req.session.roles?.includes(role)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

/**
 * Get a valid EVE access token for a character, refreshing if expired.
 * Returns the access_token string.
 */
async function exchangeEveToken(characterId) {
  const { rows } = await query(
    'SELECT access_token, refresh_token, token_expires_at FROM eve_characters WHERE id = $1',
    [characterId],
  );
  if (!rows.length) throw new Error(`Character ${characterId} not found`);

  const char = rows[0];
  const now = Date.now();
  const expiry = char.token_expires_at ? new Date(char.token_expires_at).getTime() : 0;

  if (expiry - now > 60_000) {
    // Token still valid
    return char.access_token;
  }

  // Refresh
  const discoveryUrl = `${OIDC_ISSUER}/.well-known/openid-configuration`;
  const discovery = await fetch(discoveryUrl).then((r) => r.json());

  const refreshRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: char.refresh_token,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!refreshRes.ok) throw new Error('Token refresh failed');
  const newTokens = await refreshRes.json();

  const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);
  await query(
    `UPDATE eve_characters SET access_token=$1, refresh_token=$2, token_expires_at=$3 WHERE id=$4`,
    [newTokens.access_token, newTokens.refresh_token ?? char.refresh_token, newExpiry, characterId],
  );

  return newTokens.access_token;
}

module.exports = { oidcLogin, oidcCallback, requireAuth, requireRole, exchangeEveToken };
