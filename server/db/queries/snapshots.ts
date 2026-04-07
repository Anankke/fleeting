import { query } from '../pg.js';

interface SnapshotRow {
  fleetSessionId: string;
  characterId: number;
  recordedAt?: Date;
  dpsOut: number;
  dpsIn: number;
  logiOut: number;
  logiIn: number;
  capTransferred: number;
  capReceived: number;
  capDamageOut: number;
  capDamageIn: number;
  mined: number;
  dmgOutP50: number;
  dmgOutP90: number;
  dmgOutP95: number;
  dmgOutP99: number;
  dmgOutAvg: number;
  dmgOutMedian: number;
  hitQualityDist?: Record<string, number> | null;
}

export async function insert(row: SnapshotRow) {
  await query(
    `INSERT INTO pilot_snapshots
       (fleet_session_id, character_id, recorded_at,
        dps_out, dps_in, logi_out, logi_in,
        cap_transferred, cap_received, cap_damage_out, cap_damage_in, mined,
        dmg_out_p50, dmg_out_p90, dmg_out_p95, dmg_out_p99, dmg_out_avg, dmg_out_median,
        hit_quality_dist)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      row.fleetSessionId, row.characterId, row.recordedAt ?? new Date(),
      row.dpsOut, row.dpsIn, row.logiOut, row.logiIn,
      row.capTransferred, row.capReceived, row.capDamageOut, row.capDamageIn, row.mined,
      row.dmgOutP50, row.dmgOutP90, row.dmgOutP95, row.dmgOutP99, row.dmgOutAvg, row.dmgOutMedian,
      row.hitQualityDist ? JSON.stringify(row.hitQualityDist) : null,
    ],
  );
}

export async function getForPilot(fleetSessionId: string, characterId: number) {
  const { rows } = await query(
    `SELECT * FROM pilot_snapshots
      WHERE fleet_session_id = $1 AND character_id = $2
      ORDER BY recorded_at`,
    [fleetSessionId, characterId],
  );
  return rows;
}
