<template>
  <DataTable
    :value="visible"
    size="small"
    class="live-log"
    scrollable
    scroll-height="300px"
  >
    <template #header>
      <div class="table-header">
        <span class="table-title">{{ t('liveLog.title') }}</span>
        <span class="table-hint">{{ t('liveLog.hint', { count: MAX_ROWS }) }}</span>
      </div>
    </template>

    <Column field="occurredAt" :header="t('col.time')" style="min-width:80px; white-space:nowrap">
      <template #body="{ data }">{{ fmtTime(data.occurredAt) }}</template>
    </Column>
    <Column field="pilotName"  :header="t('col.pilot')"    style="min-width:110px" />
    <Column field="targetName" :header="t('col.target')"   style="min-width:110px" />
    <Column field="weaponType" :header="t('col.weapon')"   style="min-width:130px">
      <template #body="{ data }">{{ weaponName(data.weaponType) }}</template>
    </Column>
    <Column field="shipType"   :header="t('col.ship')"     style="min-width:90px">
      <template #body="{ data }">{{ shipName(data.shipType) }}</template>
    </Column>
    <Column field="category"   :header="t('col.category')" style="min-width:100px">
      <template #body="{ data }">
        <Tag
          :value="translateCategoryLabel(t, data.category)"
          :pt="{ root: { style: {
            background: CATEGORY_COLOR[data.category] ?? '#555',
            color: contrastColor(CATEGORY_COLOR[data.category] ?? '#555'),
            fontSize: '0.8rem',
          } } }"
        />
      </template>
    </Column>
    <Column field="amount" :header="t('col.damage')" style="min-width:75px">
      <template #body="{ data }">{{ fmtNum(data.amount) }}</template>
    </Column>
    <Column field="hitQuality" :header="t('col.quality')" style="min-width:100px">
      <template #body="{ data }">
        <Tag
          v-if="data.hitQuality"
          :value="data.hitQuality"
          :pt="{ root: { style: {
            background: hitQualityColor(data.hitQuality),
            color: contrastColor(hitQualityColor(data.hitQuality)),
            fontSize: '0.85rem',
          } } }"
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTranslation } from 'i18next-vue';
import { useEveNames } from '@/composables/useEveNames';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import type { LogEntry } from '@/lib/logRegex';
import { translateCategoryLabel } from '@/lib/categoryLabels';
import { hitQualityColor, contrastColor } from '@/lib/hitQuality';

const { t } = useTranslation();
const { shipName, weaponName } = useEveNames();

const MAX_ROWS = 200;

const CATEGORY_COLOR: Record<string, string> = {
  dpsOut:        '#c0392b',
  dpsIn:         '#e74c3c',
  logiOut:       '#27ae60',
  logiIn:        '#2ecc71',
  capTransfered: '#2980b9',
  capRecieved:   '#3498db',
  capDamageOut:  '#8e44ad',
  capDamageIn:   '#9b59b6',
  mined:         '#d4ac0d',
};

/** Rolling ring buffer — newest items prepended, capped at MAX_ROWS */
const ring = ref<LogEntry[]>([]);

/** Push a batch of new entries (call from onEntries callback). */
function push(entries: LogEntry[]) {
  if (!entries.length) return;
  // Newest entries first: reverse the incoming batch then prepend
  const reversed = [...entries].reverse();
  const next     = [...reversed, ...ring.value];
  ring.value     = next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
}

function clear() {
  ring.value = [];
}

function snapshot(): LogEntry[] {
  return ring.value.map(entry => ({ ...entry }));
}

function restore(entries: LogEntry[]) {
  ring.value = [...entries].slice(0, MAX_ROWS);
}

/** Expose methods so parent can drive the log */
defineExpose({ push, clear, snapshot, restore });

const visible = computed(() => ring.value);

function fmtTime(iso: string) {
  // EVE log timestamps are already ISO-ish; show HH:MM:SS only
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return iso;
  }
}

function fmtNum(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
</script>

<style scoped>
.live-log { background: #141928; border-radius: 8px; overflow: hidden; }
.table-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.table-title {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #c8a84b;
}
.table-hint {
  font-size: 0.82rem;
  color: #8a9cc0;
}
</style>
