'use strict';

const { query } = require('../pg');

/**
 * Bulk-insert member presence records (from ESI poll).
 * @param {Array<{fleetSessionId, characterId, solarSystemId, shipTypeId}>} records
 */
async function insertPresenceBatch(records) {
  if (!records.length) return;

  const values = [];
  const params = [];
  let n = 1;
  for (const r of records) {
    values.push(`($${n++}, $${n++}, $${n++}, $${n++})`);
    params.push(r.fleetSessionId, r.characterId, r.solarSystemId, r.shipTypeId);
  }

  await query(
    `INSERT INTO member_presence (fleet_session_id, character_id, solar_system_id, ship_type_id)
     VALUES ${values.join(',')}`,
    params,
  );
}

/**
 * Return full presence history for a fleet, optionally filtered to one character.
 */
async function getPresenceTimeline(fleetSessionId, characterId = null) {
  if (characterId) {
    const { rows } = await query(
      `SELECT * FROM member_presence
        WHERE fleet_session_id = $1 AND character_id = $2
        ORDER BY recorded_at`,
      [fleetSessionId, characterId],
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT * FROM member_presence WHERE fleet_session_id = $1 ORDER BY recorded_at`,
    [fleetSessionId],
  );
  return rows;
}

/**
 * Latest presence per member at or before `at` (defaults to NOW).
 * Returns Map<characterId, { solarSystemId, shipTypeId, recordedAt }>
 */
async function getFleetSystemSnapshot(fleetSessionId, at = null) {
  const timeFilter = at ? '$2' : 'NOW()';
  const params = at ? [fleetSessionId, at] : [fleetSessionId];

  const { rows } = await query(
    `SELECT DISTINCT ON (character_id)
            character_id, solar_system_id, ship_type_id, recorded_at
       FROM member_presence
      WHERE fleet_session_id = $1
        AND recorded_at <= ${timeFilter}
      ORDER BY character_id, recorded_at DESC`,
    params,
  );
  return rows;
}

/**
 * Update fleet_members.last_seen for each character.
 */
async function touchFleetMembers(fleetSessionId, characterIds) {
  if (!characterIds.length) return;

  const values = characterIds.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
  const params = characterIds.flatMap((id) => [fleetSessionId, id]);

  await query(
    `INSERT INTO fleet_members (fleet_session_id, character_id)
     VALUES ${values.replace(/\(\$\d+, \$\d+\)/g, (_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)}
     ON CONFLICT (fleet_session_id, character_id)
     DO UPDATE SET last_seen = NOW(), is_active = TRUE`,
    params,
  );
}

/**
 * Add a single character to fleet_members if not present.
 */
async function upsertFleetMember(fleetSessionId, characterId) {
  await query(
    `INSERT INTO fleet_members (fleet_session_id, character_id)
     VALUES ($1, $2)
     ON CONFLICT (fleet_session_id, character_id)
     DO UPDATE SET last_seen = NOW(), is_active = TRUE`,
    [fleetSessionId, characterId],
  );
}

module.exports = {
  insertPresenceBatch,
  getPresenceTimeline,
  getFleetSystemSnapshot,
  touchFleetMembers,
  upsertFleetMember,
};
