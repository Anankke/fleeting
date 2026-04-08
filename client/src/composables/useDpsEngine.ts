/**
 * useDpsEngine.ts
 *
 * Maintains a sliding window of combat events and computes:
 *  - per-category DPS/rates (dpsOut, dpsIn, logiOut, logiIn, capTransfered,
 *    capRecieved, capDamageOut, capDamageIn, mined)
 *  - breakdown[] — top entries by amount with pilot, weapon, ship, hitQualityDistribution, occurredAt
 *  - hitQualityDistribution — counts per qualifier in current window
 *  - percentiles (p50, p90, p95, p99, avg, median) for dpsOut hits in current window
 *
 * The window duration is configurable (default 60s).
 */

import { ref, computed, type Ref } from 'vue';
import type { LogEntry, Category } from '../lib/logRegex';
import { emptyDistribution } from '../lib/hitQuality';

export interface BreakdownEntry {
  pilotName:              string;
  weaponType:             string;
  shipType:               string;
  targetName:             string;
  amount:                 number;  // total damage/repair in the window for this distinct group
  hits:                   number;  // number of hits contributing to this group
  category:               Category;
  hitQualityDistribution: ReturnType<typeof emptyDistribution>; // counts per quality tier for this group
  occurredAt:             string;                              // most recent occurrence in the group
}

export interface Percentiles {
  p50:    number;
  p90:    number;
  p95:    number;
  p99:    number;
  avg:    number;
  median: number;
}

export interface DpsSnapshot {
  dpsOut:         number;
  dpsIn:          number;
  logiOut:        number;
  logiIn:         number;
  capTransfered:  number;
  capRecieved:    number;
  capDamageOut:   number;
  capDamageIn:    number;
  mined:          number;
  breakdown:      BreakdownEntry[];
  hitQualityDistribution:   ReturnType<typeof emptyDistribution>; // outgoing (dpsOut)
  hitQualityDistributionIn: ReturnType<typeof emptyDistribution>; // incoming (dpsIn)
  dominantHitQuality: string | null; // most frequent outgoing quality in last 15 s
  percentiles:    Percentiles;
}

export interface BufferedLogEntry {
  timestamp: number; // Date.now() when received
  entry:     LogEntry;
}

export function useDpsEngine(windowSecondsRef?: Ref<number>) {
  const defaultWindow = ref(60);
  const windowSec = windowSecondsRef ?? defaultWindow;

  const buffer = ref<BufferedLogEntry[]>([]);

  /** Ingest new log entries from useLogReader */
  function addEntries(entries: LogEntry[]) {
    const now = Date.now();
    for (const e of entries) {
      buffer.value.push({ timestamp: now, entry: e });
    }
    prune();
  }

  function prune() {
    const cutoff = Date.now() - windowSec.value * 1000;
    let start = 0;
    while (start < buffer.value.length && buffer.value[start].timestamp < cutoff) {
      start++;
    }
    if (start > 0) buffer.value = buffer.value.slice(start);
  }

  function exportBuffer(): BufferedLogEntry[] {
    prune();
    return buffer.value.map(({ timestamp, entry }) => ({ timestamp, entry }));
  }

  function restoreBuffer(entries: BufferedLogEntry[]) {
    buffer.value = entries.map(({ timestamp, entry }) => ({ timestamp, entry }));
    prune();
  }

  const snapshot = computed<DpsSnapshot>(() => {
    const win = windowSec.value;
    const now = Date.now();
    const cutoff = now - win * 1000;

    // Sum amounts by category
    const sums: Record<Category, number> = {
      dpsOut: 0, dpsIn: 0, logiOut: 0, logiIn: 0,
      capTransfered: 0, capRecieved: 0, capDamageOut: 0, capDamageIn: 0, mined: 0,
    };
    const dist   = emptyDistribution(); // outgoing (dpsOut)
    const distIn = emptyDistribution(); // incoming (dpsIn)
    const dpsOutAmounts: number[] = [];
    // Short window for dominant quality: configurable window or the full window if smaller
    const DOMINANT_QUALITY_WINDOW_MS = parseInt(import.meta.env.VITE_DOMINANT_QUALITY_WINDOW_MS ?? '15000', 10);
    const shortCutoff = now - Math.min(DOMINANT_QUALITY_WINDOW_MS, win * 1000);
    const shortDist: Record<string, number> = {};
    // Group hits by distinct (pilotName, weaponType, shipType, category, targetName)
    // to avoid storing every individual hit while still representing per-group totals.
    const groupMap = new Map<string, BreakdownEntry>();

    for (const { timestamp, entry } of buffer.value) {
      if (timestamp < cutoff) continue; // entry outside the current window
      sums[entry.category] += entry.amount;
      if (entry.hitQuality && entry.category === 'dpsOut') {
        dist[entry.hitQuality]++;
        dpsOutAmounts.push(entry.amount);
        if (timestamp >= shortCutoff) {
          shortDist[entry.hitQuality] = (shortDist[entry.hitQuality] ?? 0) + 1;
        }
      }
      if (entry.hitQuality && entry.category === 'dpsIn') {
        distIn[entry.hitQuality]++;
      }
      const key = `${entry.pilotName}\x00${entry.weaponType}\x00${entry.shipType}\x00${entry.category}\x00${entry.targetName}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.amount    += entry.amount;
        existing.hits      += 1;
        existing.occurredAt = entry.occurredAt;
        if (entry.hitQuality) existing.hitQualityDistribution[entry.hitQuality]++;
      } else {
        const groupDist = emptyDistribution();
        if (entry.hitQuality) groupDist[entry.hitQuality]++;
        groupMap.set(key, {
          pilotName:              entry.pilotName,
          weaponType:             entry.weaponType,
          shipType:               entry.shipType,
          targetName:             entry.targetName,
          amount:                 entry.amount,
          hits:                   1,
          category:               entry.category,
          hitQualityDistribution: groupDist,
          occurredAt:             entry.occurredAt,
        });
      }
    }

    // Sort grouped breakdown by total amount desc, keep top 100
    const breakdown = [...groupMap.values()].sort((a, b) => b.amount - a.amount);
    if (breakdown.length > 100) breakdown.length = 100;

    // Dominant outgoing hit quality in the recent 15-second window
    let dominantHitQuality: string | null = null;
    let dominated = 0;
    for (const [q, c] of Object.entries(shortDist)) {
      if (c > dominated) { dominated = c; dominantHitQuality = q; }
    }

    const percentiles = computePercentiles(dpsOutAmounts);

    return {
      dpsOut:        sums.dpsOut / win,
      dpsIn:         sums.dpsIn / win,
      logiOut:       sums.logiOut / win,
      logiIn:        sums.logiIn / win,
      capTransfered: sums.capTransfered / win,
      capRecieved:   sums.capRecieved / win,
      capDamageOut:  sums.capDamageOut / win,
      capDamageIn:   sums.capDamageIn / win,
      mined:         sums.mined / win,
      breakdown,
      hitQualityDistribution:   dist,
      hitQualityDistributionIn: distIn,
      dominantHitQuality,
      percentiles,
    };
  });

  function reset() {
    buffer.value = [];
  }

  return { addEntries, snapshot, reset, windowSec, exportBuffer, restoreBuffer };
}

// ── Percentile helpers ─────────────────────────────────────────────────────────

function computePercentiles(amounts: number[]): Percentiles {
  if (!amounts.length) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, median: 0 };
  }
  const sorted = [...amounts].sort((a, b) => a - b);
  const avg    = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return {
    p50:    percentile(sorted, 50),
    p90:    percentile(sorted, 90),
    p95:    percentile(sorted, 95),
    p99:    percentile(sorted, 99),
    avg:    Math.round(avg),
    median: percentile(sorted, 50),
  };
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
