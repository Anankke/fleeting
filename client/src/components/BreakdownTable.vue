<template>
  <DataTable
    :value="rows"
    :rows="15"
    paginator
    size="small"
    class="breakdown-table"
    scroll-height="300px"
    scrollable
    sort-field="amount"
    :sort-order="-1"
    v-tooltip.top="t('breakdown.tooltip')"
  >
    <template #header>
      <div class="table-header">
        <span class="table-title">{{ t('breakdown.title') }}</span>
        <span class="table-hint">{{ t('breakdown.hint') }}</span>
      </div>
    </template>
    <Column field="pilotName"  :header="t('col.pilot')"    sortable style="min-width:120px" />
    <Column field="targetName" :header="t('col.target')"   sortable style="min-width:120px" />
    <Column field="weaponType" :header="t('col.weapon')"   sortable style="min-width:140px">
      <template #body="{ data }">{{ weaponName(data.weaponType) }}</template>
    </Column>
    <Column field="shipType"   :header="t('col.ship')"     sortable style="min-width:100px">
      <template #body="{ data }">
        <span>{{ shipName(data.shipType) }}</span>
      </template>
    </Column>
    <Column :header="t('col.class')" sortable style="min-width:110px" :sort-field="(r: BreakdownRow) => shipCategory(r.shipType)">
      <template #body="{ data }">
        <span class="ship-cat">{{ shipCategory(data.shipType) }}</span>
      </template>
    </Column>
    <Column field="category"   :header="t('col.category')" sortable style="min-width:105px">
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
    <Column field="amount" :header="t('col.total')" sortable style="min-width:80px">
      <template #body="{ data }">{{ fmtNum(data.amount) }}</template>
    </Column>
    <Column field="hits" :header="t('col.hits')" sortable style="min-width:55px" />
    <Column :header="t('col.quality')" sortable style="min-width:100px">
      <template #body="{ data }">
        <Tag
          v-if="getDominantQuality(data.hitQualityDistribution)"
          :value="getDominantQuality(data.hitQualityDistribution)"
          :pt="{ root: { style: {
            background: hitQualityColor(getDominantQuality(data.hitQualityDistribution)!),
            color: contrastColor(hitQualityColor(getDominantQuality(data.hitQualityDistribution)!)),
            fontSize: '0.8rem',
          } } }"
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { useTranslation } from 'i18next-vue';
import type { Category } from '@/lib/logRegex';
import { translateCategoryLabel } from '@/lib/categoryLabels';
import { contrastColor, hitQualityColor } from '@/lib/hitQuality';
import { useEveNames } from '@/composables/useEveNames';

const { shipName, shipCategory, weaponName } = useEveNames();
const { t } = useTranslation();

export interface BreakdownRow {
  pilotName:              string;
  targetName:             string;
  weaponType:             string;
  shipType:               string;
  category:               Category;
  amount:                 number;
  hits:                   number;
  hitQualityDistribution: Record<string, number>;
}

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

defineProps<{ rows: BreakdownRow[] }>();

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/** Compute dominant hit quality for a single breakdown row */
function getDominantQuality(dist: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [quality, count] of Object.entries(dist)) {
    if (count > bestCount) {
      bestCount = count;
      best = quality;
    }
  }
  return best;
}
</script>

<style scoped>
.breakdown-table { background: #141928; border-radius: 8px; overflow: hidden; }
.ship-cat { font-size: 0.8rem; color: #8a9cc0; }
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
