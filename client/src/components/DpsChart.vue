<template>
  <div ref="el" class="dps-chart" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { DpsSnapshot } from '@/composables/useDpsEngine';
import { HIT_QUALITY_COLOR, HIT_QUALITIES } from '@/lib/hitQuality';

const props = defineProps<{
  snapshot: DpsSnapshot | null;
  windowSec: number;
}>();

const DEFAULT_STROKE = '#7eb8ff';
const DEFAULT_FILL   = 'rgba(126,184,255,0.15)';

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

const el  = ref<HTMLDivElement | null>(null);
let chart: uPlot | null = null;

// Mutable color state read by series stroke/fill functions each redraw
let activeStroke = DEFAULT_STROKE;
let activeFill   = DEFAULT_FILL;

// Circular ring buffer of (timestamp, dps) pairs
const MAX_POINTS = 600;
const tsArr  = new Float64Array(MAX_POINTS);
const dpsArr = new Float64Array(MAX_POINTS);
let head = 0, count = 0;

function buildData(): uPlot.AlignedData {
  const n = Math.min(count, MAX_POINTS);
  const ts  = new Array<number>(n);
  const dps = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const idx = (head - n + i + MAX_POINTS) % MAX_POINTS;
    ts[i]  = tsArr[idx];
    dps[i] = dpsArr[idx];
  }
  return [ts, dps];
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
        label: 'DPS',
        stroke: () => activeStroke,
        fill:   () => activeFill,
        width: 2,
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

watch(() => props.snapshot, (snap) => {
  if (!snap) return;
  const ts = Date.now() / 1000;
  tsArr[head]  = ts;
  dpsArr[head] = snap.dpsOut;
  head = (head + 1) % MAX_POINTS;
  if (count < MAX_POINTS) count++;
  if (chart) {
    const { stroke, fill } = dominantColor(snap.hitQualityDistribution);
    activeStroke = stroke;
    activeFill   = fill;
    chart.setData(buildData());
  }
});

const ro = new ResizeObserver(() => { if (el.value && chart) chart.setSize({ width: el.value.clientWidth, height: 180 }); });

onMounted(() => {
  initChart();
  if (el.value) ro.observe(el.value);
});

onUnmounted(() => {
  ro.disconnect();
  chart?.destroy();
});
</script>

<style scoped>
.dps-chart { background: #141928; border: 1px solid #2a3050; border-radius: 8px; overflow: hidden; padding: 0.5rem; }
</style>
