<template>
  <div ref="el" class="dps-chart" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { HIT_QUALITY_COLOR, HIT_QUALITIES } from '@/lib/hitQuality';

/** Minimal duck-typed snapshot — works with DpsSnapshot and FleetAggregate alike. */
export interface ChartSnapshot {
  dpsOut: number;
  dpsIn: number;
  logiOut: number;
  logiIn: number;
  capTransfered: number;
  capRecieved: number;
  capDamageOut: number;
  capDamageIn: number;
  mined: number;
  dominantHitQuality?: string | null;
  hitQualityDistribution: Record<string, number>;
}

export type ChartMetricKey =
  | 'dpsOut'
  | 'dpsIn'
  | 'logiOut'
  | 'logiIn'
  | 'capTransfered'
  | 'capRecieved'
  | 'capDamageOut'
  | 'capDamageIn'
  | 'mined';

const props = defineProps<{
  snapshot: ChartSnapshot | null;
  metric?: ChartMetricKey;
  historySec?: number;
  sampleMs?: number;
}>();

const DEFAULT_STROKE = '#7eb8ff';
const DEFAULT_FILL   = 'rgba(126,184,255,0.15)';
const DEFAULT_METRIC: ChartMetricKey = 'dpsOut';
const DEFAULT_HISTORY_SEC = 300;
const DEFAULT_SAMPLE_MS = 1000;

/** Returns the color of the most frequently occurring hit quality, or the default. */
function dominantColor(dist: Record<string, number>): { stroke: string; fill: string } {
  let best: string | null = null;
  let bestCount = 0;
  for (const hq of HIT_QUALITIES) {
    const c = dist[hq] ?? 0;
    if (c > bestCount) { bestCount = c; best = hq; }
  }
  if (!best || bestCount === 0) return { stroke: DEFAULT_STROKE, fill: DEFAULT_FILL };
  const hex = HIT_QUALITY_COLOR[best as keyof typeof HIT_QUALITY_COLOR];
  // Parse hex to rgba for fill
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { stroke: hex, fill: `rgba(${r},${g},${b},0.18)` };
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function blendHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = parseHexColor(from);
  const [tr, tg, tb] = parseHexColor(to);
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function readMetric(snap: ChartSnapshot | null, metric: ChartMetricKey): number {
  if (!snap) return 0;
  return Number(snap[metric] ?? 0);
}

const el  = ref<HTMLDivElement | null>(null);
let chart: uPlot | null = null;
let sampleTimer: ReturnType<typeof setInterval> | null = null;

// Mutable color state read by series stroke/fill functions each redraw
let activeStroke = DEFAULT_STROKE;
let activeFill   = DEFAULT_FILL;

// Fixed-timer history points
const tsPoints: number[] = [];
const metricPoints: Record<ChartMetricKey, number[]> = {
  dpsOut: [],
  dpsIn: [],
  logiOut: [],
  logiIn: [],
  capTransfered: [],
  capRecieved: [],
  capDamageOut: [],
  capDamageIn: [],
  mined: [],
};

function clearBuffer() {
  tsPoints.length = 0;
  for (const values of Object.values(metricPoints)) values.length = 0;
  if (chart) chart.setData([[], []]);
}

defineExpose({ clear: clearBuffer });

function buildData(): uPlot.AlignedData {
  const metric = props.metric ?? DEFAULT_METRIC;
  return [tsPoints.slice(), metricPoints[metric].slice()];
}

function initChart() {
  if (!el.value) return;
  chart?.destroy();
  const opts: uPlot.Options = {
    width:  el.value.clientWidth || 800,
    height: 180,
    series: [
      {},
      {
        label: 'Metric',
        stroke: () => activeStroke,
        fill:   () => activeFill,
        width: 2,
        points: { show: false },
      },
    ],
    axes: [
      { stroke: '#8a9cc0', ticks: { stroke: '#2a3050' } },
      { stroke: '#8a9cc0', ticks: { stroke: '#2a3050' }, grid: { stroke: '#1e2a45' } },
    ],
    scales: { x: { time: true } },
    cursor: { show: true },
  };
  chart = new uPlot(opts, buildData(), el.value);
}

function sampleTick() {
  const metric = props.metric ?? DEFAULT_METRIC;
  const nowSec = Date.now() / 1000;
  const historySec = Math.max(30, props.historySec ?? DEFAULT_HISTORY_SEC);
  const cutoff = nowSec - historySec;

  tsPoints.push(nowSec);
  for (const key of Object.keys(metricPoints) as ChartMetricKey[]) {
    metricPoints[key].push(readMetric(props.snapshot, key));
  }

  while (tsPoints.length > 0 && tsPoints[0] < cutoff) {
    tsPoints.shift();
    for (const values of Object.values(metricPoints)) values.shift();
  }

  const target = dominantColor(props.snapshot?.hitQualityDistribution ?? {});
  activeStroke = blendHex(activeStroke, target.stroke, 0.25);
  const [r, g, b] = parseHexColor(activeStroke);
  activeFill = `rgba(${r},${g},${b},0.18)`;

  if (!chart) return;
  chart.setData(buildData());
  chart.setScale('x', { min: cutoff, max: nowSec });
}

function restartTimer() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
  const sampleMs = Math.max(250, props.sampleMs ?? DEFAULT_SAMPLE_MS);
  sampleTick();
  sampleTimer = setInterval(sampleTick, sampleMs);
}

watch(() => props.sampleMs, restartTimer);
watch(() => props.metric, () => {
  if (!chart) return;
  const nowSec = Date.now() / 1000;
  const historySec = Math.max(30, props.historySec ?? DEFAULT_HISTORY_SEC);
  chart.setData(buildData());
  chart.setScale('x', { min: nowSec - historySec, max: nowSec });
});
watch(() => props.historySec, () => sampleTick());

const ro = new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width;
  if (width && chart) chart.setSize({ width, height: 180 });
});

onMounted(() => {
  initChart();
  restartTimer();
  if (el.value) ro.observe(el.value);
});

onUnmounted(() => {
  if (sampleTimer) clearInterval(sampleTimer);
  ro.disconnect();
  chart?.destroy();
});
</script>

<style scoped>
.dps-chart { width: 100%; min-width: 0; background: #141928; border: 1px solid #2a3050; border-radius: 8px; overflow: hidden; padding: 0.5rem; }
</style>
