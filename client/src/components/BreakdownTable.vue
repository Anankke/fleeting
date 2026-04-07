<template>
  <DataTable
    :value="rows"
    :rows="20"
    paginator
    size="small"
    class="breakdown-table"
    scroll-height="300px"
    scrollable
    sort-field="amount"
    :sort-order="-1"
  >
    <Column field="pilotName"  header="Pilot"    sortable style="min-width:120px" />
    <Column field="targetName" header="Target"   sortable style="min-width:120px" />
    <Column field="weaponType" header="Weapon"   sortable style="min-width:140px" />
    <Column field="shipType"   header="Ship"     sortable style="min-width:100px" />
    <Column field="category"   header="Category" sortable style="min-width:100px">
      <template #body="{ data }">
        <Tag
          :value="data.category"
          :style="{ background: CATEGORY_COLOR[data.category] ?? '#555', color: '#fff', fontSize: '0.75rem' }"
        />
      </template>
    </Column>
    <Column field="amount"     header="Amount"   sortable style="min-width:90px">
      <template #body="{ data }">{{ fmtNum(data.amount) }}</template>
    </Column>
    <Column field="hits"       header="Hits"     sortable style="min-width:60px" />
  </DataTable>
</template>

<script setup lang="ts">
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import type { Category } from '@/lib/logRegex';

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
  dpsOut:       '#c0392b',
  dpsIn:        '#e74c3c',
  logiOut:      '#27ae60',
  logiIn:       '#2ecc71',
  capTransfered:'#2980b9',
  capRecieved:  '#3498db',
  capDamageOut: '#8e44ad',
  capDamageIn:  '#9b59b6',
  mined:        '#d4ac0d',
};

defineProps<{ rows: BreakdownRow[] }>();

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
</script>

<style scoped>
.breakdown-table { background: #141928; border-radius: 8px; overflow: hidden; }
</style>
