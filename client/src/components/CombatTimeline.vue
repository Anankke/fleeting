<template>
  <div ref="el" class="combat-timeline" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface TimelinePoint {
  ts: number;          // unix seconds
  totalDps: number;
}

const props = defineProps<{
  points: TimelinePoint[];
  /** Emits a unix-seconds timestamp when user scrubs */
  onScrub?: (ts: number) => void;
}>();

const emit = defineEmits<{ scrub: [ts: number] }>();

const el = ref<HTMLDivElement | null>(null);
let chart: uPlot | null = null;

function buildData(): uPlot.AlignedData {
  const ts  = props.points.map(p => p.ts);
  const dps = props.points.map(p => p.totalDps);
  return [ts, dps];
}

function initChart() {
  if (!el.value) return;
  chart?.destroy();
  const opts: uPlot.Options = {
    width:  el.value.clientWidth || 700,
    height: 160,
    series: [
      {},
      { label: 'DPS', stroke: '#ff6b6b', fill: 'rgba(255,107,107,0.15)', width: 2 },
    ],
    axes: [
      { stroke: '#8a9cc0' },
      { stroke: '#8a9cc0', grid: { stroke: '#1e2a45' } },
    ],
    scales: { x: { time: true } },
    hooks: {
      setSelect: [
        (u) => {
          const ts = u.posToVal(u.select.left, 'x');
          emit('scrub', ts);
        },
      ],
    },
  };
  chart = new uPlot(opts, buildData(), el.value);
}

watch(() => props.points, () => { chart?.setData(buildData()); }, { deep: true });

const ro = new ResizeObserver(() => {
  if (el.value && chart) chart.setSize({ width: el.value.clientWidth, height: 160 });
});

onMounted(() => { initChart(); if (el.value) ro.observe(el.value); });
onUnmounted(() => { ro.disconnect(); chart?.destroy(); });
</script>

<style scoped>
.combat-timeline { background: #141928; border: 1px solid #2a3050; border-radius: 8px; overflow: hidden; padding: 0.5rem; }
</style>
