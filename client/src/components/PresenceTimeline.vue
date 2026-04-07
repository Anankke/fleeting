<template>
  <div ref="el" class="presence-timeline" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface PresenceRecord {
  characterId: number;
  characterName: string;
  checkedAt: string; // ISO
  solarSystemId: number;
  shipTypeId: number;
}

const props = defineProps<{ presence: PresenceRecord[][] }>();

const el = ref<HTMLDivElement | null>(null);
let chart: uPlot | null = null;

function buildData(): uPlot.AlignedData {
  if (!props.presence.length) return [[] as number[], [] as number[]];
  const timestamps = props.presence.map(row => new Date(row[0]?.checkedAt ?? 0).getTime() / 1000);
  const memberCount = props.presence.map(row => row.length);
  return [timestamps, memberCount];
}

function initChart() {
  if (!el.value) return;
  chart?.destroy();
  const opts: uPlot.Options = {
    width:  el.value.clientWidth || 700,
    height: 140,
    series: [
      {},
      { label: 'Online Members', stroke: '#7eb8ff', fill: 'rgba(126,184,255,0.2)', width: 2 },
    ],
    axes: [
      { stroke: '#8a9cc0' },
      { stroke: '#8a9cc0', grid: { stroke: '#1e2a45' }, label: 'Members' },
    ],
    scales: { x: { time: true } },
  };
  chart = new uPlot(opts, buildData(), el.value);
}

watch(() => props.presence, () => { chart?.setData(buildData()); }, { deep: true });

const ro = new ResizeObserver(() => {
  if (el.value && chart) chart.setSize({ width: el.value.clientWidth, height: 140 });
});

onMounted(() => { initChart(); if (el.value) ro.observe(el.value); });
onUnmounted(() => { ro.disconnect(); chart?.destroy(); });
</script>

<style scoped>
.presence-timeline { background: #141928; border: 1px solid #2a3050; border-radius: 8px; overflow: hidden; padding: 0.5rem; }
</style>
