<template>
  <DataTable
    :value="members"
    size="small"
    class="member-table"
    scrollable
    scroll-height="400px"
    :sort-field="'characterName'"
    :sort-order="1"
  >
    <Column field="characterName" :header="t('col.pilot')" sortable style="min-width:140px" />
    <Column field="shipName"      :header="t('col.ship')"  sortable style="min-width:120px">
      <template #body="{ data }">
        <span>{{ shipName(data.shipName) }}</span>
      </template>
    </Column>
    <Column :header="t('col.class')" sortable style="min-width:110px" :sort-field="(r: any) => shipCategory(r.shipName)">
      <template #body="{ data }">
        <span class="ship-cat">{{ shipCategory(data.shipName) }}</span>
      </template>
    </Column>
    <Column field="location"      :header="t('col.system')" sortable style="min-width:100px" />
    <Column field="totalDps"      :header="t('col.dps')"   sortable style="min-width:80px">
      <template #body="{ data }">{{ fmt(data.totalDps ?? 0) }}</template>
    </Column>
    <Column field="participation" :header="t('col.status')" style="min-width:100px">
      <template #body="{ data }">
        <ParticipationBadge
          :status="data.participation ?? 'participant'"
          :reason="data.participationReason"
        />
      </template>
    </Column>
  </DataTable>
</template>

<script setup lang="ts">
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ParticipationBadge from './ParticipationBadge.vue';
import { useEveNames } from '@/composables/useEveNames';
import { useTranslation } from 'i18next-vue';

const { shipName, shipCategory } = useEveNames();
const { t } = useTranslation();

defineProps<{ members: any[]; fleetId?: string | null }>();

function fmt(v: number) {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toFixed(0);
}
</script>

<style scoped>
.member-table { background: #141928; border-radius: 8px; overflow: hidden; }
.ship-cat { font-size: 0.8rem; color: #8a9cc0; }
</style>
