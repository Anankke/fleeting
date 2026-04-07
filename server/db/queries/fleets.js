'use strict';

const { query } = require('../pg');

async function createFleet({ name, eveFleetId, fcCharacterId }) {
  const { rows } = await query(
    `INSERT INTO fleet_sessions (name, eve_fleet_id, fc_character_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, eveFleetId ?? null, fcCharacterId],
  );
  return rows[0];
}

async function getFleetById(id) {
  const { rows } = await query('SELECT * FROM fleet_sessions WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function getOpenFleets() {
  const { rows } = await query('SELECT * FROM fleet_sessions WHERE is_open = TRUE');
  return rows;
}

async function getFleetsByFc(fcCharacterId) {
  const { rows } = await query(
    'SELECT * FROM fleet_sessions WHERE fc_character_id = $1 ORDER BY created_at DESC',
    [fcCharacterId],
  );
  return rows;
}

async function closeFleet(id) {
  await query(
    `UPDATE fleet_sessions SET is_open = FALSE, closed_at = NOW() WHERE id = $1`,
    [id],
  );
}

async function getAllFleets({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT fs.*,
            COUNT(DISTINCT fm.character_id) AS member_count
       FROM fleet_sessions fs
       LEFT JOIN fleet_members fm ON fm.fleet_session_id = fs.id
      GROUP BY fs.id
      ORDER BY fs.created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

async function createPartitionForFleet(fleetSessionId) {
  const safeName = fleetSessionId.replace(/-/g, '_');
  await query(
    `CREATE TABLE IF NOT EXISTS combat_events_${safeName}
       PARTITION OF combat_events
       FOR VALUES IN ($1)`,
    [fleetSessionId],
  );
}

module.exports = {
  createFleet,
  getFleetById,
  getOpenFleets,
  getFleetsByFc,
  closeFleet,
  getAllFleets,
  createPartitionForFleet,
};
