'use strict';

const { query } = require('../pg');

async function getFleetList({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT
        fs.id, fs.name, fs.created_at, fs.closed_at, fs.is_open,
        COUNT(DISTINCT fm.character_id)::int AS member_count,
        ROUND(AVG(ps.dps_out)::numeric, 2)   AS avg_dps_out
     FROM fleet_sessions fs
     LEFT JOIN fleet_members fm ON fm.fleet_session_id = fs.id
     LEFT JOIN pilot_snapshots ps ON ps.fleet_session_id = fs.id
     GROUP BY fs.id
     ORDER BY fs.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

async function getFleetSummary(fleetSessionId) {
  // Per-member aggregate totals
  const { rows } = await query(
    `SELECT
        source_character_id AS character_id,
        COUNT(*)::int                          AS total_hits,
        ROUND(AVG(amount)::numeric, 0)         AS avg_hit,
        SUM(amount)::bigint                    AS total_damage,
        MAX(weapon_type)                       AS top_weapon
     FROM combat_events
     WHERE fleet_session_id = $1 AND category = 'dpsOut'
     GROUP BY source_character_id
     ORDER BY total_damage DESC`,
    [fleetSessionId],
  );
  return rows;
}

async function getFleetParticipation(fleetSessionId) {
  // Server-side participation: % non-combat ship + % location outlier per member
  const { rows: presence } = await query(
    `SELECT character_id, solar_system_id, ship_type_id, recorded_at
       FROM member_presence
      WHERE fleet_session_id = $1
      ORDER BY character_id, recorded_at`,
    [fleetSessionId],
  );
  if (!presence.length) return [];

  // Compute mode system per 30s bucket for location outlier
  // Group by character_id and compute ratios
  const byChar = new Map();
  for (const r of presence) {
    if (!byChar.has(r.character_id)) byChar.set(r.character_id, []);
    byChar.get(r.character_id).push(r);
  }

  // For brevity, compute global mode system across all records
  const systemCounts = new Map();
  for (const r of presence) {
    systemCounts.set(r.solar_system_id, (systemCounts.get(r.solar_system_id) ?? 0) + 1);
  }
  let modeSystem = -1, modeCount = 0;
  for (const [sys, cnt] of systemCounts) {
    if (cnt > modeCount) { modeSystem = sys; modeCount = cnt; }
  }

  const NON_COMBAT = [29,31,22,380,513,902,463,543,941,1022,237,1];

  const results = [];
  for (const [charId, records] of byChar) {
    const total   = records.length;
    const nonCombatCount = records.filter((r) => NON_COMBAT.includes(r.ship_type_id)).length;
    const outlierCount   = records.filter((r) => r.solar_system_id !== modeSystem).length;
    const nonCombatPct   = nonCombatCount / total;
    const outlierPct     = outlierCount  / total;

    let verdict = 'participant';
    if (nonCombatPct > 0.5 || outlierPct > 0.5) verdict = 'non-participant';
    else if (nonCombatPct > 0.2 || outlierPct > 0.2) verdict = 'partial';

    results.push({
      characterId:       charId,
      shipNonCombatPct:  Math.round(nonCombatPct * 100),
      locationOutlierPct: Math.round(outlierPct * 100),
      verdict,
    });
  }
  return results;
}

module.exports = { getFleetList, getFleetSummary, getFleetParticipation };
