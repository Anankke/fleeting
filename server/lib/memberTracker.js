'use strict';

/**
 * server/lib/memberTracker.js
 *
 * Polls ESI every 30s for fleet member location + ship type, writes to member_presence.
 * One interval per open fleet session.
 */

const { exchangeEveToken } = require('./auth');
const { getFleetMembers }  = require('./esi');
const { insertPresenceBatch, touchFleetMembers } = require('../db/queries/members');
const { getOpenFleets }    = require('../db/queries/fleets');

const POLL_INTERVAL_MS = 30_000;

/** Map<fleetSessionId, { timer, fcCharacterId, eveFleetId }> */
const activeTrackers = new Map();

/**
 * Start tracking a fleet session.
 */
function startTracking(fleetSessionId, fcCharacterId, eveFleetId) {
  if (activeTrackers.has(fleetSessionId)) return;

  const timer = setInterval(
    () => poll(fleetSessionId, fcCharacterId, eveFleetId),
    POLL_INTERVAL_MS,
  );

  activeTrackers.set(fleetSessionId, { timer, fcCharacterId, eveFleetId });

  // Immediate first poll
  poll(fleetSessionId, fcCharacterId, eveFleetId).catch(console.error);
}

/**
 * Stop tracking a fleet session (data is retained).
 */
function stopTracking(fleetSessionId) {
  const tracker = activeTrackers.get(fleetSessionId);
  if (!tracker) return;
  clearInterval(tracker.timer);
  activeTrackers.delete(fleetSessionId);
}

async function poll(fleetSessionId, fcCharacterId, eveFleetId) {
  try {
    const token   = await exchangeEveToken(fcCharacterId);
    const members = await getFleetMembers(token, eveFleetId);

    const records = members.map((m) => ({
      fleetSessionId,
      characterId:  m.character_id,
      solarSystemId: m.solar_system_id,
      shipTypeId:   m.ship_type_id,
    }));

    await insertPresenceBatch(records);
    await touchFleetMembers(fleetSessionId, members.map((m) => m.character_id));
  } catch (err) {
    // ESI can return 404 when fleet disbands — stop polling on persistent errors
    if (err.status === 404) {
      console.warn(`[memberTracker] Fleet ${fleetSessionId} not found on ESI — stopping tracker`);
      stopTracking(fleetSessionId);
    } else {
      console.error(`[memberTracker] Poll error for fleet ${fleetSessionId}:`, err.message);
    }
  }
}

/**
 * On server restart: re-register timers for all open fleet sessions.
 */
async function resumeOpenFleets() {
  const fleets = await getOpenFleets();
  for (const fleet of fleets) {
    if (fleet.eve_fleet_id) {
      startTracking(fleet.id, fleet.fc_character_id, fleet.eve_fleet_id);
    }
  }
  console.info(`[memberTracker] Resumed tracking for ${fleets.length} open fleet(s)`);
}

module.exports = { startTracking, stopTracking, resumeOpenFleets };
