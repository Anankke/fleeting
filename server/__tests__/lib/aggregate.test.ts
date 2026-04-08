import { describe, it, expect } from 'vitest';
import { computeFleetAggregate, type PilotSnapshot } from '../../lib/aggregate.js';

describe('computeFleetAggregate', () => {
  it('sums numeric fields across snapshots', () => {
    const snapshots: PilotSnapshot[] = [
      { characterId: 1, dpsOut: 100, dpsIn: 50, logiOut: 0, logiIn: 0 },
      { characterId: 2, dpsOut: 200, dpsIn: 30, logiOut: 10, logiIn: 0 },
    ];
    const agg = computeFleetAggregate(snapshots);
    expect(agg.memberCount).toBe(2);
    expect(agg.dpsOut).toBe(300);
    expect(agg.dpsIn).toBe(80);
    expect(agg.logiOut).toBe(10);
  });

  it('merges hit quality distributions', () => {
    const snapshots: PilotSnapshot[] = [
      { characterId: 1, hitQualityDistribution: { 'Wrecks': 5, 'Grazes': 2 } },
      { characterId: 2, hitQualityDistribution: { 'Wrecks': 3, 'Penetrates': 1 } },
    ];
    const agg = computeFleetAggregate(snapshots);
    expect(agg.hitQualityDistribution).toEqual({ 'Wrecks': 8, 'Grazes': 2, 'Penetrates': 1 });
  });

  it('caps breakdown at MAX_BREAKDOWN_ENTRIES', () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({ amount: i, weaponType: `weapon_${i}` }));
    const snapshots: PilotSnapshot[] = [{ characterId: 1, breakdown: entries }];
    const agg = computeFleetAggregate(snapshots);
    expect(agg.breakdown.length).toBeLessThanOrEqual(20);
    expect(agg.breakdown[0].amount).toBe(29);
  });

  it('handles empty snapshot array', () => {
    const agg = computeFleetAggregate([]);
    expect(agg.memberCount).toBe(0);
    expect(agg.dpsOut).toBe(0);
  });

  it('handles snapshots with missing optional fields', () => {
    const snapshots: PilotSnapshot[] = [{ characterId: 1 }, { characterId: 2 }];
    const agg = computeFleetAggregate(snapshots);
    expect(agg.dpsOut).toBe(0);
    expect(agg.memberCount).toBe(2);
  });
});
