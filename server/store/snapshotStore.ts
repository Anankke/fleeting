import * as mem from './memcached.js';
import { computeFleetAggregate, computeWarAggregate, type PilotSnapshot, type FleetAggregate } from '../lib/aggregate.js';

const PILOT_TTL = 15; // seconds
const FLEET_TTL = 5;  // seconds

function pilotKey(fleetSessionId: string, characterId: number) {
  return `pilot:${fleetSessionId}:${characterId}`;
}

function memberListKey(fleetSessionId: string) {
  return `fleet:members:${fleetSessionId}`;
}

function fleetAggKey(fleetSessionId: string) {
  return `fleet:agg:${fleetSessionId}`;
}

export async function setPilotSnapshot(
  fleetSessionId: string,
  characterId: number,
  snapshot: PilotSnapshot,
): Promise<void> {
  await mem.set(pilotKey(fleetSessionId, characterId), snapshot, PILOT_TTL);
}

export async function getPilotSnapshot(
  fleetSessionId: string,
  characterId: number,
): Promise<PilotSnapshot | null> {
  return mem.get<PilotSnapshot>(pilotKey(fleetSessionId, characterId));
}

export async function addFleetMember(fleetSessionId: string, characterId: number): Promise<void> {
  const key  = memberListKey(fleetSessionId);
  const list = (await mem.get<number[]>(key)) ?? [];
  if (!list.includes(characterId)) list.push(characterId);
  await mem.set(key, list, 3600);
}

export async function getFleetMemberIds(fleetSessionId: string): Promise<number[]> {
  return (await mem.get<number[]>(memberListKey(fleetSessionId))) ?? [];
}

export async function getFleetAggregate(fleetSessionId: string): Promise<FleetAggregate | null> {
  const cached = await mem.get<FleetAggregate>(fleetAggKey(fleetSessionId));
  if (cached) return cached;

  const memberIds = await getFleetMemberIds(fleetSessionId);
  const snapshots = (
    await Promise.all(memberIds.map((id) => getPilotSnapshot(fleetSessionId, id)))
  ).filter((s): s is PilotSnapshot => s !== null);

  if (!snapshots.length) return null;

  const agg = computeFleetAggregate(snapshots);
  await mem.set(fleetAggKey(fleetSessionId), agg, FLEET_TTL);
  return agg;
}

export async function getWarAggregate(fleetSessionIds: string[]): Promise<ReturnType<typeof computeWarAggregate> | null> {
  const fleetAggregates = (
    await Promise.all(fleetSessionIds.map(getFleetAggregate))
  ).filter((a): a is FleetAggregate => a !== null);

  if (!fleetAggregates.length) return null;
  return computeWarAggregate(fleetAggregates);
}
