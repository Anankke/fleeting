/**
 * useDpsEngine.ts
 *
 * Maintains a sliding window of combat events and computes:
 *  - per-category DPS/rates (dpsOut, dpsIn, logiOut, logiIn, capTransfered,
 *    capRecieved, capDamageOut, capDamageIn, mined)
 *  - breakdown[] — top entries by amount with pilot, weapon, ship, hitQuality, occurredAt
 *  - hitQualityDistribution — counts per qualifier in current window
 *  - percentiles (p50, p90, p95, p99, avg, median) for dpsOut hits in current window
 *
 * The window duration is configurable (default 60s).
 */

import { ref, computed, type Ref } from 'vue';
import type { LogEntry, Category, HitQuality } from '../lib/logRegex';
import { emptyDistribution } from '../lib/hitQuality';

export interface BreakdownEntry {
  pilotName:   string;
  weaponType:  string;
  shipType:    string;
  amount:      number;
  category:    Category;
  hitQuality:  HitQuality | null;
  occurredAt:  string;
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
  hitQualityDistribution: ReturnType<typeof emptyDistribution>;
  percentiles:    Percentiles;
}

interface BufferedEntry {
  timestamp: number; // Date.now() when received
  entry:     LogEntry;
}

export function useDpsEngine(windowSecondsRef?: Ref<number>) {
  const defaultWindow = ref(60);
  const windowSec = windowSecondsRef ?? defaultWindow;

  const buffer = ref<BufferedEntry[]>([]);

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
    // Keep only entries within the window
    let start = 0;
    while (start < buffer.value.length && buffer.value[start].timestamp < cutoff) {
      start++;
    }
    if (start > 0) buffer.value = buffer.value.slice(start);
  }

  const snapshot = computed<DpsSnapshot>(() => {
    prune();
    const win = windowSec.value;
    const now = Date.now();
    const cutoff = now - win * 1000;

    // Sum amounts by category
    const sums: Record<Category, number> = {
      dpsOut: 0, dpsIn: 0, logiOut: 0, logiIn: 0,
      capTransfered: 0, capRecieved: 0, capDamageOut: 0, capDamageIn: 0, mined: 0,
    };
    const dist = emptyDistribution();
    const dpsOutAmounts: number[] = [];
    const breakdown: BreakdownEntry[] = [];

    for (const { entry } of buffer.value) {
      sums[entry.category] += entry.amount;
      if (entry.hitQuality && entry.category === 'dpsOut') {
        dist[entry.hitQuality]++;
        dpsOutAmounts.push(entry.amount);
      }
      breakdown.push({
        pilotName:  entry.pilotName,
        weaponType: entry.weaponType,
        shipType:   entry.shipType,
        amount:     entry.amount,
        category:   entry.category,
        hitQuality: entry.hitQuality,
        occurredAt: entry.occurredAt,
      });
    }

    // Sort breakdown by amount desc, keep top 100
    breakdown.sort((a, b) => b.amount - a.amount);
    if (breakdown.length > 100) breakdown.length = 100;

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
      hitQualityDistribution: dist,
      percentiles,
    };
  });

  function reset() {
    buffer.value = [];
  }

  return { addEntries, snapshot, reset, windowSec };
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
