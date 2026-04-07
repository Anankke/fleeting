'use strict';

/**
 * server/lib/retentionJob.js
 *
 * Daily scheduled job that prunes combat_events partitions and pilot_snapshots
 * according to retention_config.
 */

const { query } = require('../db/pg');

const MS_PER_DAY = 86_400_000;

async function runRetention() {
  console.info('[retention] Running retention job...');

  // Fetch config — fleet-specific first, fall back to global (fleet_session_id IS NULL)
  const { rows: configs } = await query(
    `SELECT fleet_session_id, raw_events_ttl_days, snapshots_ttl_days, timeline_ttl_days
       FROM retention_config
      ORDER BY fleet_session_id NULLS LAST`,
  );

  // Global defaults (last row with fleet_session_id IS NULL)
  const global = configs.find((c) => c.fleet_session_id === null) ?? {
    raw_events_ttl_days: 30,
    snapshots_ttl_days:  90,
    timeline_ttl_days:   null,
  };

  // Build per-fleet config map
  const perFleet = new Map();
  for (const c of configs) {
    if (c.fleet_session_id) perFleet.set(c.fleet_session_id, c);
  }

  // ── Prune pilot_snapshots ─────────────────────────────────────────────────
  const ttlDays = global.snapshots_ttl_days;
  if (ttlDays != null) {
    const cutoff = new Date(Date.now() - ttlDays * MS_PER_DAY);
    const { rowCount } = await query(
      `DELETE FROM pilot_snapshots WHERE recorded_at < $1`,
      [cutoff],
    );
    console.info(`[retention] Deleted ${rowCount} pilot_snapshots rows older than ${ttlDays}d`);
  }

  // ── Prune pilot_timeline (if configured — default is NULL = keep forever) ─
  if (global.timeline_ttl_days != null) {
    const cutoff = new Date(Date.now() - global.timeline_ttl_days * MS_PER_DAY);
    const { rowCount } = await query(
      `DELETE FROM pilot_timeline WHERE bucket_at < $1`,
      [cutoff],
    );
    console.info(`[retention] Deleted ${rowCount} pilot_timeline rows older than ${global.timeline_ttl_days}d`);
  }

  // ── Drop expired combat_events partitions ─────────────────────────────────
  const rawTtl = global.raw_events_ttl_days;
  if (rawTtl != null) {
    // Find partitions created for fleet sessions whose data is older than the TTL
    const cutoff = new Date(Date.now() - rawTtl * MS_PER_DAY);
    const { rows: expiredFleets } = await query(
      `SELECT id FROM fleet_sessions WHERE closed_at IS NOT NULL AND closed_at < $1`,
      [cutoff],
    );

    for (const { id } of expiredFleets) {
      const safeName = id.replace(/-/g, '_');
      const partitionName = `combat_events_${safeName}`;
      // Check if the partition exists before dropping
      const { rows: exists } = await query(
        `SELECT 1 FROM pg_class WHERE relname = $1`,
        [partitionName],
      );
      if (exists.length) {
        await query(`DROP TABLE ${partitionName}`);
        console.info(`[retention] Dropped partition ${partitionName}`);
      }
    }
  }

  console.info('[retention] Done.');
}

function startRetentionJob() {
  // Run once immediately after startup, then daily
  setTimeout(() => {
    runRetention().catch(console.error);
    setInterval(() => runRetention().catch(console.error), MS_PER_DAY);
  }, 60_000); // delay 60s to let app fully start
}

module.exports = { startRetentionJob, runRetention };
