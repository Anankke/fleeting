<template>
  <DataTable
    :value="rows.rows"
    :total-records="rows.total"
    :rows="pageSize"
    :first="(page - 1) * pageSize"
    lazy
    paginator
    size="small"
    class="event-log"
    scrollable
    scroll-height="350px"
    @page="onPage"
  >
    <Column field="ts"          :header="t('col.time')"     style="min-width:90px">
      <template #body="{ data }">{{ fmtTime(data.ts) }}</template>
    </Column>
    <Column field="characterId" :header="t('col.pilot')"    style="min-width:120px">
      <template #body="{ data }">{{ data.characterName ?? data.characterId }}</template>
    </Column>
    <Column field="category"    :header="t('col.category')" style="min-width:90px">
      <template #body="{ data }">{{ translateCategoryLabel(t, data.category) }}</template>
    </Column>
    <Column field="target"      :header="t('col.target')"   style="min-width:110px" />
    <Column field="weapon"      :header="t('col.weapon')"   style="min-width:130px">
      <template #body="{ data }">{{ weaponName(data.weapon) }}</template>
    </Column>
    <Column field="amount"      :header="t('col.damage')"   style="min-width:80px">
      <template #body="{ data }">{{ fmtNum(data.amount ?? 0) }}</template>
    </Column>
    <Column field="hitQuality"  :header="t('col.quality')"  style="min-width:90px">
      <template #body="{ data }">
        <Tag
          v-if="data.hitQuality"
          :value="data.hitQuality"
          :style="{ background: hqColor(data.hitQuality), color: '#fff', fontSize: '0.75rem' }"
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTranslation } from 'i18next-vue';
import { useEveNames } from '@/composables/useEveNames';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import { translateCategoryLabel } from '@/lib/categoryLabels';
import { HIT_QUALITY_COLOR } from '@/lib/hitQuality';

defineProps<{ rows: { total: number; rows: any[] } }>();
const emit = defineEmits<{ page: [p: number] }>();
const { t } = useTranslation();
const { weaponName } = useEveNames();


const page     = ref(1);
const pageSize = 100;

function onPage(e: { page: number }) {
  page.value = e.page + 1;
  emit('page', page.value);
}

function fmtTime(ts: string | number) {
  return new Date(ts).toLocaleTimeString();
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function hqColor(hq: string) { return HIT_QUALITY_COLOR[hq] ?? '#555'; }
</script>

<style scoped>
.event-log { background: #141928; border-radius: 8px; overflow: hidden; }
</style>
