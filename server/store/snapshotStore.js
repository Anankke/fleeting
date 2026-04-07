'use strict';

/**
 * server/store/snapshotStore.js
 *
 * Memcached-backed storage for live pilot snapshots and fleet aggregates.
 */

const mem       = require('./memcached');
const aggregate = require('../lib/aggregate');

const PILOT_TTL   = 15; // seconds
const FLEET_TTL   = 5;  // seconds

// ── Pilot snapshots ────────────────────────────────────────────────────────────

function pilotKey(fleetSessionId, characterId) {
  return `pilot:${fleetSessionId}:${characterId}`;
}

async function setPilotSnapshot(fleetSessionId, characterId, snapshot) {
  await mem.set(pilotKey(fleetSessionId, characterId), snapshot, PILOT_TTL);
}

async function getPilotSnapshot(fleetSessionId, characterId) {
  return mem.get(pilotKey(fleetSessionId, characterId));
}

// ── Fleet member list (for aggregate computation) ────────────────────────────

function memberListKey(fleetSessionId) {
  return `fleet:members:${fleetSessionId}`;
}

async function addFleetMember(fleetSessionId, characterId) {
  const key  = memberListKey(fleetSessionId);
  const list = (await mem.get(key)) ?? [];
  if (!list.includes(characterId)) list.push(characterId);
  await mem.set(key, list, 3600); // 1h — refreshed on each new POST
}

async function getFleetMemberIds(fleetSessionId) {
  return (await mem.get(memberListKey(fleetSessionId))) ?? [];
}

// ── Fleet aggregate ───────────────────────────────────────────────────────────

function fleetAggKey(fleetSessionId) {
  return `fleet:agg:${fleetSessionId}`;
}

async function getFleetAggregate(fleetSessionId) {
  const cached = await mem.get(fleetAggKey(fleetSessionId));
  if (cached) return cached;

  // Recompute from live pilot snapshots
  const memberIds = await getFleetMemberIds(fleetSessionId);
  const snapshots = (
    await Promise.all(memberIds.map((id) => getPilotSnapshot(fleetSessionId, id)))
  ).filter(Boolean);

  if (!snapshots.length) return null;

  const agg = aggregate.computeFleetAggregate(snapshots);
  await mem.set(fleetAggKey(fleetSessionId), agg, FLEET_TTL);
  return agg;
}

// ── War aggregate ─────────────────────────────────────────────────────────────

async function getWarAggregate(fleetSessionIds) {
  const fleetAggregates = (
    await Promise.all(fleetSessionIds.map(getFleetAggregate))
  ).filter(Boolean);

  if (!fleetAggregates.length) return null;
  return aggregate.computeWarAggregate(fleetAggregates);
}

module.exports = {
  setPilotSnapshot,
  getPilotSnapshot,
  addFleetMember,
  getFleetMemberIds,
  getFleetAggregate,
  getWarAggregate,
};
