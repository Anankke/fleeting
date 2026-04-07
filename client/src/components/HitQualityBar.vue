<template>
  <div class="hq-bar-wrap">
    <div class="hq-label">Hit Quality Distribution</div>
    <div class="bar-outer">
      <div
        v-for="hq in HIT_QUALITIES"
        :key="hq.key"
        class="bar-segment"
        :style="{ width: pct(hq.key) + '%', background: HIT_QUALITY_COLOR[hq.key] }"
        :title="`${hq.label}: ${pct(hq.key).toFixed(1)}%`"
      />
    </div>
    <div class="legend">
      <div v-for="hq in HIT_QUALITIES" :key="hq.key" class="legend-item">
        <span class="dot" :style="{ background: HIT_QUALITY_COLOR[hq.key] }" />
        <span>{{ hq.label }}</span>
        <span class="pct-val">{{ pct(hq.key).toFixed(0) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { HIT_QUALITIES, HIT_QUALITY_COLOR } from '@/lib/hitQuality';

const props = defineProps<{ distribution: Record<string, number> }>();

const total = computed(() => Object.values(props.distribution).reduce((s, v) => s + v, 0));
function pct(key: string) {
  return total.value > 0 ? ((props.distribution[key] ?? 0) / total.value) * 100 : 0;
}
</script>

<style scoped>
.hq-bar-wrap { background: #141928; border: 1px solid #2a3050; border-radius: 8px; padding: 0.75rem 1rem; }
.hq-label { font-size: 0.75rem; color: #8a9cc0; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px; }
.bar-outer { display: flex; height: 18px; border-radius: 4px; overflow: hidden; }
.bar-segment { transition: width 0.3s; }
.legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.5rem; }
.legend-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem; color: #8a9cc0; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.pct-val { margin-left: auto; min-width: 2.5em; text-align: right; color: #e0e8ff; }
</style>
