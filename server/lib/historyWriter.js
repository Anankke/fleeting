'use strict';

/**
 * server/lib/historyWriter.js
 *
 * Called on every POST /api/pilot/data.
 * Three parallel write paths:
 *   A — Raw events: bulk-insert breakdown[] into combat_events
 *   B — 5s snapshot: write pilot_snapshots row (throttled to once per 5s per pilot)
 *   C — 30s timeline: upsert pilot_timeline bucket (throttled to once per 30s per pilot)
 */

const mem       = require('../store/memcached');
const events    = require('../db/queries/events');
const snapshots = require('../db/queries/snapshots');
const timeline  = require('../db/queries/timeline');

const SNAPSHOT_INTERVAL_S = 5;
const TIMELINE_INTERVAL_S = 30;

function snapshotKey(charId)  { return `hw:snap:${charId}`;     }
function timelineKey(charId)  { return `hw:tl:${charId}`;       }
function tlBufKey(charId)     { return `hw:tlbuf:${charId}`;    }

/**
 * @param {{
 *   fleetSessionId: string,
 *   characterId:    number,
 *   snapshot:       import('../routes/pilot').PilotSnapshot,
 * }} opts
 */
async function write({ fleetSessionId, characterId, snapshot }) {
  const now = new Date();

  // ── Path A: Raw events ─────────────────────────────────────────────────────
  if (snapshot.breakdown?.length) {
    const eventRows = snapshot.breakdown.map((b) => ({
      fleetSessionId,
      sourceCharacterId: characterId,
      targetName:   b.pilotName ?? null,
      weaponType:   b.weaponType ?? null,
      shipType:     b.shipType ?? null,
      category:     b.category,
      amount:       b.amount,
      hitQuality:   b.hitQuality ?? null,
      occurredAt:   b.occurredAt ?? now.toISOString(),
    }));
    // Fire-and-forget to avoid blocking the HTTP response
    events.insertBatch(eventRows).catch((err) =>
      console.error('[historyWriter] Event insert error:', err.message),
    );
  }

  // ── Path B: 5s pilot snapshot ─────────────────────────────────────────────
  const lastSnapTs = await mem.get(snapshotKey(characterId));
  if (!lastSnapTs || now.getTime() - lastSnapTs >= SNAPSHOT_INTERVAL_S * 1000) {
    await mem.set(snapshotKey(characterId), now.getTime(), SNAPSHOT_INTERVAL_S * 4);
    const p = snapshot.percentiles ?? {};
    snapshots.insert({
      fleetSessionId,
      characterId,
      recordedAt:    now,
      dpsOut:        snapshot.dpsOut,
      dpsIn:         snapshot.dpsIn,
      logiOut:       snapshot.logiOut,
      logiIn:        snapshot.logiIn,
      capTransferred: snapshot.capTransfered,
      capReceived:   snapshot.capRecieved,
      capDamageOut:  snapshot.capDamageOut,
      capDamageIn:   snapshot.capDamageIn,
      mined:         snapshot.mined,
      dmgOutP50:     p.p50,
      dmgOutP90:     p.p90,
      dmgOutP95:     p.p95,
      dmgOutP99:     p.p99,
      dmgOutAvg:     p.avg,
      dmgOutMedian:  p.median,
      hitQualityDist: snapshot.hitQualityDistribution,
    }).catch((err) =>
      console.error('[historyWriter] Snapshot insert error:', err.message),
    );
  }

  // ── Path C: 30s timeline bucket ───────────────────────────────────────────
  const lastTlTs = await mem.get(timelineKey(characterId));
  const bucketAt = bucketTimestamp(now, TIMELINE_INTERVAL_S);

  // Accumulate a rolling average buffer for this bucket
  const buf = (await mem.get(tlBufKey(characterId))) ?? {
    count: 0, dpsOut: 0, dpsIn: 0, logiOut: 0, logiIn: 0,
    capTransferred: 0, capReceived: 0, capDamageOut: 0, capDamageIn: 0,
    mined: 0, maxDpsOut: 0,
  };

  buf.count++;
  buf.dpsOut         = (buf.dpsOut         * (buf.count - 1) + snapshot.dpsOut)        / buf.count;
  buf.dpsIn          = (buf.dpsIn          * (buf.count - 1) + snapshot.dpsIn)         / buf.count;
  buf.logiOut        = (buf.logiOut        * (buf.count - 1) + snapshot.logiOut)       / buf.count;
  buf.logiIn         = (buf.logiIn         * (buf.count - 1) + snapshot.logiIn)        / buf.count;
  buf.capTransferred = (buf.capTransferred * (buf.count - 1) + snapshot.capTransfered) / buf.count;
  buf.capReceived    = (buf.capReceived    * (buf.count - 1) + snapshot.capRecieved)   / buf.count;
  buf.capDamageOut   = (buf.capDamageOut   * (buf.count - 1) + snapshot.capDamageOut)  / buf.count;
  buf.capDamageIn    = (buf.capDamageIn    * (buf.count - 1) + snapshot.capDamageIn)   / buf.count;
  buf.mined          = (buf.mined          * (buf.count - 1) + snapshot.mined)         / buf.count;
  buf.maxDpsOut      = Math.max(buf.maxDpsOut, snapshot.dpsOut);

  await mem.set(tlBufKey(characterId), buf, TIMELINE_INTERVAL_S * 4);

  if (!lastTlTs || now.getTime() - lastTlTs >= TIMELINE_INTERVAL_S * 1000) {
    await mem.set(timelineKey(characterId), now.getTime(), TIMELINE_INTERVAL_S * 4);
    timeline.upsert({
      fleetSessionId,
      characterId,
      bucketAt,
      avgDpsOut:        buf.dpsOut,
      maxDpsOut:        buf.maxDpsOut,
      avgDpsIn:         buf.dpsIn,
      avgLogiOut:       buf.logiOut,
      avgLogiIn:        buf.logiIn,
      avgCapTransferred: buf.capTransferred,
      avgCapReceived:   buf.capReceived,
      avgCapDamageOut:  buf.capDamageOut,
      avgCapDamageIn:   buf.capDamageIn,
      avgMined:         buf.mined,
      hitQualityDist:   snapshot.hitQualityDistribution,
    }).catch((err) =>
      console.error('[historyWriter] Timeline upsert error:', err.message),
    );
    // Reset buffer for next bucket
    await mem.del(tlBufKey(characterId));
  }
}

/** Floor a Date to the nearest N-second boundary */
function bucketTimestamp(date, intervalSeconds) {
  const ms = date.getTime();
  const bucketMs = Math.floor(ms / (intervalSeconds * 1000)) * intervalSeconds * 1000;
  return new Date(bucketMs);
}

module.exports = { write };
