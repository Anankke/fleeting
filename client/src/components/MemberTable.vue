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
    <Column field="characterName" header="Pilot" sortable style="min-width:140px" />
    <Column field="shipName"      header="Ship"  sortable style="min-width:120px" />
    <Column field="location"      header="System" sortable style="min-width:100px" />
    <Column field="totalDps"      header="DPS"   sortable style="min-width:80px">
      <template #body="{ data }">{{ fmt(data.totalDps ?? 0) }}</template>
    </Column>
    <Column field="participation" header="Status" style="min-width:100px">
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

defineProps<{ members: any[]; fleetId?: string | null }>();

function fmt(v: number) {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toFixed(0);
}
</script>

<style scoped>
.member-table { background: #141928; border-radius: 8px; overflow: hidden; }
</style>
