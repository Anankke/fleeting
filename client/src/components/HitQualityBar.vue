<template>
  <div class="hq-wrap">
    <div class="hq-charts">
      <!-- Outgoing (dpsOut) -->
      <div class="hq-half">
        <div class="hq-label">{{ t('hitQuality.outgoing') }}</div>
        <div v-if="totalOut === 0" class="hq-empty">{{ t('hitQuality.noData') }}</div>
        <Doughnut v-else :data="outData" :options="makeOptions(totalOut)" class="hq-chart" />
      </div>

      <!-- Incoming (dpsIn) -->
      <div class="hq-half">
        <div class="hq-label">{{ t('hitQuality.incoming') }}</div>
        <div v-if="totalIn === 0" class="hq-empty">{{ t('hitQuality.noData') }}</div>
        <Doughnut v-else :data="inData" :options="makeOptions(totalIn)" class="hq-chart" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTranslation } from 'i18next-vue';
import { Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { HIT_QUALITIES, HIT_QUALITY_COLOR } from '@/lib/hitQuality';

ChartJS.register(ArcElement, Tooltip, Legend);
const { t } = useTranslation();

const props = defineProps<{
  distributionOut: Record<string, number>;
  distributionIn:  Record<string, number>;
}>();

/** Return indices of HIT_QUALITIES sorted by count descending. */
function sortedIndices(dist: Record<string, number>) {
  return [...HIT_QUALITIES.keys()].sort(
    (a, b) => (dist[HIT_QUALITIES[b]] ?? 0) - (dist[HIT_QUALITIES[a]] ?? 0),
  );
}

function buildChartData(dist: Record<string, number>) {
  const indices = sortedIndices(dist);
  // Omit zero-count slices to avoid clutter
  const active  = indices.filter(i => (dist[HIT_QUALITIES[i]] ?? 0) > 0);
  return {
    labels: active.map(i => HIT_QUALITIES[i]),
    data:   active.map(i => dist[HIT_QUALITIES[i]] ?? 0),
    colors: active.map(i => HIT_QUALITY_COLOR[HIT_QUALITIES[i] as keyof typeof HIT_QUALITY_COLOR] ?? '#4b5563'),
  };
}

const totalOut = computed(() => Object.values(props.distributionOut).reduce((s, v) => s + v, 0));
const totalIn  = computed(() => Object.values(props.distributionIn).reduce((s, v) => s + v, 0));

const outData = computed(() => {
  const { labels, data, colors } = buildChartData(props.distributionOut);
  return { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#0d0f14', borderWidth: 2, hoverOffset: 6 }] };
});

const inData = computed(() => {
  const { labels, data, colors } = buildChartData(props.distributionIn);
  return { labels, datasets: [{ data, backgroundColor: colors, borderColor: '#0d0f14', borderWidth: 2, hoverOffset: 6 }] };
});

function makeOptions(total: number) {
  return {
    cutout: '62%',
    maintainAspectRatio: false,
    animation: { animateRotate: true, duration: 400 },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#cfd9ee', font: { size: 12 }, boxWidth: 12, padding: 8,
          generateLabels(chart: ChartJS) {
            const ds = chart.data.datasets[0];
            const t  = total || 1;
            return (chart.data.labels as string[]).map((label, i) => {
              const val = (ds.data[i] as number) ?? 0;
              const pct = ((val / t) * 100).toFixed(0);
              return {
                text: `${label}  ${val} (${pct}%)`,
                fillStyle: (ds.backgroundColor as string[])[i],
                strokeStyle: 'transparent', lineWidth: 0,
                fontColor: '#cfd9ee', hidden: false,
                index: i, datasetIndex: 0,
              };
            });
          },
        },
      },
      tooltip: {
        callbacks: {
          label(ctx: { label: string; parsed: number }) {
            const pct = ((ctx.parsed / (total || 1)) * 100).toFixed(1);
            return t('hitQuality.tooltip', {
              label: ctx.label,
              count: ctx.parsed,
              pct,
            });
          },
        },
      },
    },
  };
}
</script>

<style scoped>
.hq-wrap {
  background: #141928;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.hq-charts { display: flex; gap: 1.5rem; }
.hq-half   { flex: 1; min-width: 0; }
.hq-label  {
  font-size: 0.78rem;
  color: #8a9cc0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.5rem;
  text-align: center;
}
.hq-empty  { text-align: center; color: #5b6f8e; font-size: 0.88rem; padding: 1.5rem 0; }
.hq-chart  { width: 100%; height: 260px; }
</style>
