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
    <Column field="target"     header="Target"   sortable style="min-width:120px" />
    <Column field="weapon"     header="Weapon"   sortable style="min-width:140px" />
    <Column field="shipName"   header="Ship"     sortable style="min-width:100px" />
    <Column field="amount"     header="Damage"   sortable style="min-width:90px">
      <template #body="{ data }">{{ fmtNum(data.amount) }}</template>
    </Column>
    <Column field="hitQuality" header="Quality"  sortable style="min-width:100px">
      <template #body="{ data }">
        <Tag
          :value="data.hitQuality"
          :style="{ background: hqColor(data.hitQuality), color: '#fff', fontSize: '0.75rem' }"
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { HIT_QUALITY_COLOR } from '@/lib/hitQuality';

export interface BreakdownRow {
  target: string;
  weapon: string;
  shipName: string;
  amount: number;
  hitQuality: string;
}

defineProps<{ rows: BreakdownRow[] }>();

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function hqColor(hq: string) { return HIT_QUALITY_COLOR[hq] ?? '#555'; }
</script>

<style scoped>
.breakdown-table { background: #141928; border-radius: 8px; overflow: hidden; }
</style>
