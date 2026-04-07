'use strict';

/**
 * server/lib/esi.js — EVE Swagger Interface helper
 */

const ESI_BASE = process.env.ESI_BASE_URL || 'https://esi.evetech.net';

async function esiGet(path, accessToken, params = {}) {
  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', 'tranquility');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const headers = { Accept: 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`ESI ${res.status}: ${path}`), { status: res.status, body });
  }
  return res.json();
}

/**
 * GET /v2/characters/{character_id}/fleet/
 * Returns { fleet_id, role, squad_id, wing_id } for the character's current fleet.
 */
async function getFleetForCharacter(accessToken, characterId) {
  return esiGet(`/v2/characters/${characterId}/fleet/`, accessToken);
}

/**
 * GET /v1/fleets/{fleet_id}/members/
 * Returns array of { character_id, solar_system_id, ship_type_id, role, squad_id, wing_id, ... }
 */
async function getFleetMembers(accessToken, fleetId) {
  return esiGet(`/v1/fleets/${fleetId}/members/`, accessToken);
}

/**
 * GET /v4/characters/{character_id}/
 */
async function getCharacterInfo(characterId) {
  return esiGet(`/v4/characters/${characterId}/`);
}

module.exports = { getFleetForCharacter, getFleetMembers, getCharacterInfo };
