<template>
  <div class="stats-strip">
    <div v-for="cat in CATEGORIES" :key="cat.key" class="stat-tile">
      <div class="tile-label">{{ cat.label }}</div>
      <div class="tile-value">{{ fmt(snap?.[cat.key] ?? 0) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DpsSnapshot } from '@/composables/useDpsEngine';

defineProps<{ snapshot: DpsSnapshot | null }>();

const snap = defineModel<DpsSnapshot | null>('snapshot', { default: null });

const CATEGORIES = [
  { key: 'totalDps',     label: 'Total DPS' },
  { key: 'gunDps',       label: 'Gun' },
  { key: 'missileDps',   label: 'Missile' },
  { key: 'droneDps',     label: 'Drone' },
  { key: 'smartbombDps', label: 'Smartbomb' },
  { key: 'turretDps',    label: 'Turret' },
  { key: 'neut',         label: 'Neut' },
  { key: 'remote',       label: 'Remote' },
  { key: 'mining',       label: 'Mining' },
] as const;

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
  return v.toFixed(0);
}
</script>

<script lang="ts">
// Allow passing snapshot as prop directly
export default { inheritAttrs: false };
</script>

<style scoped>
.stats-strip { display: flex; gap: 0.75rem; flex-wrap: wrap; }
.stat-tile {
  flex: 1 1 90px;
  background: #141928;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  text-align: center;
}
.tile-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: #8a9cc0; margin-bottom: 0.25rem; }
.tile-value { font-size: 1.4rem; font-weight: 700; color: #7eb8ff; }
</style>
