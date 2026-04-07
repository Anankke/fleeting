/**
 * server/lib/esi.ts — EVE Swagger Interface helper
 *
 * ESI no longer uses versioned routes (/v1/, /v2/ etc.).
 * Instead, we set the X-Compatibility-Date header so ESI
 * returns behaviour as of that date.
 * See: https://developers.eveonline.com/docs/services/esi/overview/
 */

const ESI_BASE            = process.env.ESI_BASE_URL ?? 'https://esi.evetech.net';
const ESI_COMPATIBILITY   = '2026-04-07';

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

async function esiGet<T>(
  path: string,
  accessToken?: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${ESI_BASE}${path}`);
  url.searchParams.set('datasource', 'tranquility');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Compatibility-Date': ESI_COMPATIBILITY,
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new EsiError(`ESI ${res.status}: ${path}`, res.status, body);
  }
  return res.json() as Promise<T>;
}

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
 */
export async function getCharacterInfo(characterId: number): Promise<CharacterInfo> {
  return esiGet<CharacterInfo>(`/characters/${characterId}/`);
}
