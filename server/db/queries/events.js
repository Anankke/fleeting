'use strict';

const { query, getClient } = require('../pg');

/**
 * Bulk-insert combat event records.
 *
 * @param {Array<{
 *   fleetSessionId, sourceCharacterId, targetName, weaponType,
 *   shipType, category, amount, hitQuality, occurredAt
 * }>} events
 */
async function insertBatch(events) {
  if (!events.length) return;

  const cols = [
    'fleet_session_id', 'source_character_id', 'target_name',
    'weapon_type', 'ship_type', 'category', 'amount', 'hit_quality', 'occurred_at',
  ];
  const numCols = cols.length;
  const valuePlaceholders = events.map((_, i) =>
    `(${cols.map((_, j) => `$${i * numCols + j + 1}`).join(', ')})`,
  );

  const params = events.flatMap((e) => [
    e.fleetSessionId,
    e.sourceCharacterId,
    e.targetName ?? null,
    e.weaponType ?? null,
    e.shipType ?? null,
    e.category,
    e.amount,
    e.hitQuality ?? null,
    e.occurredAt,
  ]);

  await query(
    `INSERT INTO combat_events (${cols.join(', ')}) VALUES ${valuePlaceholders.join(', ')}`,
    params,
  );
}

/**
 * Paginated, filtered search across combat_events for a fleet.
 *
 * @param {string} fleetSessionId
 * @param {{
 *   charId?: number, category?: string, target?: string,
 *   weapon?: string, hitQuality?: string, from?: string, to?: string
 * }} filters
 * @param {{ page: number, limit: number }} pagination
 * @returns {{ total: number, rows: any[] }}
 */
async function search(fleetSessionId, filters = {}, { page = 1, limit = 100 } = {}) {
  const conditions = ['fleet_session_id = $1'];
  const params     = [fleetSessionId];
  let n = 2;

  if (filters.charId) {
    conditions.push(`source_character_id = $${n++}`);
    params.push(filters.charId);
  }
  if (filters.category) {
    conditions.push(`category = $${n++}`);
    params.push(filters.category);
  }
  if (filters.target) {
    conditions.push(`target_name ILIKE $${n++}`);
    params.push(`%${filters.target}%`);
  }
  if (filters.weapon) {
    conditions.push(`weapon_type ILIKE $${n++}`);
    params.push(`%${filters.weapon}%`);
  }
  if (filters.hitQuality) {
    conditions.push(`hit_quality = $${n++}`);
    params.push(filters.hitQuality);
  }
  if (filters.from) {
    conditions.push(`occurred_at >= $${n++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`occurred_at <= $${n++}`);
    params.push(filters.to);
  }

  const where  = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [countRes, rowsRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM combat_events WHERE ${where}`, params),
    query(
      `SELECT * FROM combat_events WHERE ${where}
       ORDER BY occurred_at DESC LIMIT $${n} OFFSET $${n + 1}`,
      [...params, limit, offset],
    ),
  ]);

  return {
    total: parseInt(countRes.rows[0].count, 10),
    rows:  rowsRes.rows,
  };
}

module.exports = { insertBatch, search };
