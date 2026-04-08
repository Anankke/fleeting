<template>
  <div class="stats-strip">
    <div v-for="cat in CATEGORIES" :key="cat.key" class="stat-tile">
      <div class="tile-label">{{ t(cat.labelKey) }}</div>
      <div class="tile-value">{{ fmt(snapshot?.[cat.key] ?? 0) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTranslation } from 'i18next-vue';

/** Minimal duck-typed snapshot — accepts DpsSnapshot, FleetAggregate, or null. */
interface StatsLike {
  dpsOut: number; dpsIn: number;
  logiOut: number; logiIn: number;
  capDamageOut: number; capDamageIn: number;
  capTransfered: number; capRecieved: number;
  mined: number;
}

const props = defineProps<{ snapshot: StatsLike | null }>();
const { t } = useTranslation();

const CATEGORIES = [
  { key: 'dpsOut',        labelKey: 'stat.dpsOut' },
  { key: 'dpsIn',         labelKey: 'stat.dpsIn' },
  { key: 'logiOut',       labelKey: 'stat.logiOut' },
  { key: 'logiIn',        labelKey: 'stat.logiIn' },
  { key: 'capDamageOut',  labelKey: 'stat.neutOut' },
  { key: 'capDamageIn',   labelKey: 'stat.neutIn' },
  { key: 'capTransfered', labelKey: 'stat.capXfer' },
  { key: 'capRecieved',   labelKey: 'stat.capRcvd' },
  { key: 'mined',         labelKey: 'stat.mining' },
] as const;

function fmt(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(1) + 'K';
  return v.toFixed(0);
}
</script>

<style scoped>
.stats-strip {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 0.5rem;
}

@media (max-width: 1400px) {
  .stats-strip { grid-template-columns: repeat(5, 1fr); }
}

@media (max-width: 1100px) {
  .stats-strip { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 640px) {
  .stats-strip { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 420px) {
  .stats-strip { grid-template-columns: 1fr; }
}

.stat-tile {
  background: #141928;
  border: 1px solid #2a3050;
  border-radius: 8px;
  padding: 0.6rem 0.5rem;
  text-align: center;
  min-width: 0;
}
.dom-tile { grid-column: span 2; }
.tile-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8a9cc0;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile-value { font-size: 1.4rem; font-weight: 700; color: #7eb8ff; }
.dom-val   { font-size: 1.1rem; font-weight: 700; }
</style>
