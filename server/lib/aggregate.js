'use strict';

/**
 * server/lib/aggregate.js
 *
 * Aggregation functions for fleet and war-level dashboards.
 */

const NUMERIC_FIELDS = [
  'dpsOut', 'dpsIn', 'logiOut', 'logiIn',
  'capTransfered', 'capRecieved', 'capDamageOut', 'capDamageIn', 'mined',
];

const MAX_BREAKDOWN_ENTRIES = 20;

/**
 * Merge an array of pilot snapshots into a single fleet aggregate.
 * @param {Object[]} snapshots — raw pilot snapshot objects from Memcached
 * @returns {Object} fleet aggregate
 */
function computeFleetAggregate(snapshots) {
  const agg = {
    memberCount: snapshots.length,
    dpsOut: 0, dpsIn: 0, logiOut: 0, logiIn: 0,
    capTransfered: 0, capRecieved: 0, capDamageOut: 0, capDamageIn: 0, mined: 0,
    hitQualityDistribution: {},
    breakdown: [],
    memberSnapshots: {},
  };

  for (const snap of snapshots) {
    // Sum numeric DPS fields
    for (const field of NUMERIC_FIELDS) {
      agg[field] += snap[field] ?? 0;
    }

    // Merge hitQualityDistribution
    if (snap.hitQualityDistribution) {
      for (const [qual, count] of Object.entries(snap.hitQualityDistribution)) {
        agg.hitQualityDistribution[qual] =
          (agg.hitQualityDistribution[qual] ?? 0) + count;
      }
    }

    // Accumulate breakdown entries
    if (Array.isArray(snap.breakdown)) {
      agg.breakdown.push(...snap.breakdown);
    }

    // Keep per-member snapshot for member table (sans breakdown to reduce payload)
    if (snap.characterId) {
      agg.memberSnapshots[snap.characterId] = {
        dpsOut:    snap.dpsOut,
        dpsIn:     snap.dpsIn,
        logiOut:   snap.logiOut,
        logiIn:    snap.logiIn,
        mined:     snap.mined,
        shipTypeId:    snap.shipTypeId,
        solarSystemId: snap.solarSystemId,
      };
    }
  }

  // Cap breakdown to top MAX_BREAKDOWN_ENTRIES by amount
  agg.breakdown.sort((a, b) => b.amount - a.amount);
  if (agg.breakdown.length > MAX_BREAKDOWN_ENTRIES) {
    agg.breakdown = agg.breakdown.slice(0, MAX_BREAKDOWN_ENTRIES);
  }

  return agg;
}

/**
 * Merge an array of fleet aggregates into a war-level aggregate.
 * @param {Object[]} fleetAggregates
 */
function computeWarAggregate(fleetAggregates) {
  const war = {
    fleetCount: fleetAggregates.length,
    memberCount: 0,
    dpsOut: 0, dpsIn: 0, logiOut: 0, logiIn: 0,
    capTransfered: 0, capRecieved: 0, capDamageOut: 0, capDamageIn: 0, mined: 0,
    hitQualityDistribution: {},
    breakdown: [],
    fleetBreakdown: [],
  };

  for (const fa of fleetAggregates) {
    war.memberCount += fa.memberCount ?? 0;
    for (const field of NUMERIC_FIELDS) {
      war[field] += fa[field] ?? 0;
    }
    for (const [qual, count] of Object.entries(fa.hitQualityDistribution ?? {})) {
      war.hitQualityDistribution[qual] =
        (war.hitQualityDistribution[qual] ?? 0) + count;
    }
    war.breakdown.push(...(fa.breakdown ?? []));
    war.fleetBreakdown.push({
      fleetSessionId: fa.fleetSessionId,
      dpsOut:         fa.dpsOut,
      memberCount:    fa.memberCount,
    });
  }

  war.breakdown.sort((a, b) => b.amount - a.amount);
  if (war.breakdown.length > MAX_BREAKDOWN_ENTRIES) {
    war.breakdown = war.breakdown.slice(0, MAX_BREAKDOWN_ENTRIES);
  }

  return war;
}

module.exports = { computeFleetAggregate, computeWarAggregate };
