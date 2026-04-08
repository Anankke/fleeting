<template>
  <div class="history-page">
    <AppNav :me="me">
      <Button :label="t('logout')" icon="pi pi-sign-out" text @click="logout" />
    </AppNav>

    <main v-if="!selectedFleetId">
      <div class="page-header">
        <h2>{{ t('history.pageTitle') }}</h2>
      </div>
      <DataTable
        :value="fleets"
        :total-records="totalFleets"
        :rows="pageSize"
        lazy
        paginator
        size="small"
        class="fleet-list"
        @page="loadFleets($event.page + 1)"
        @row-click="openFleet($event.data.id)"
        row-hover
      >
        <Column field="id"            :header="t('col.fleetId')"  style="min-width:160px">
          <template #body="{ data }">{{ data.id.slice(0, 12) }}…</template>
        </Column>
        <Column field="fc_name"       :header="t('col.fc')"       style="min-width:120px" />
        <Column field="member_count"  :header="t('col.members')"  style="min-width:80px" />
        <Column field="created_at"    :header="t('col.started')"  style="min-width:140px">
          <template #body="{ data }">{{ fmtDate(data.created_at) }}</template>
        </Column>
        <Column field="closed_at"     :header="t('col.ended')"    style="min-width:140px">
          <template #body="{ data }">{{ data.closed_at ? fmtDate(data.closed_at) : '—' }}</template>
        </Column>
        <Column field="duration_min"  :header="t('col.duration')" style="min-width:80px">
          <template #body="{ data }">{{ data.duration_min != null ? t('history.durationMin', { count: data.duration_min }) : '—' }}</template>
        </Column>
      </DataTable>
    </main>

    <FleetReplayView
      v-else
      :fleet-id="selectedFleetId"
      @back="selectedFleetId = null"
    />

    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTranslation } from 'i18next-vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Toast from 'primevue/toast';
import { api, getMe, type MeResponse } from '@/api/client';
import { clearMeCache } from '@/router';
import AppNav from '@/components/AppNav.vue';
import FleetReplayView from './FleetReplayView.vue';

const me             = ref<MeResponse | null>(null);
const fleets         = ref<any[]>([]);
const totalFleets    = ref(0);
const pageSize       = 20;
const selectedFleetId = ref<string | null>(null);

const { t } = useTranslation();

async function loadFleets(page = 1) {
  try {
    const data = await api.get(`/api/history/fleets?page=${page}&limit=${pageSize}`);
    fleets.value      = data.fleets;
    totalFleets.value = data.total;
  } catch (e) {
    console.error(e);
  }
}

function openFleet(id: string) { selectedFleetId.value = id; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function logout() {
  api.post('/auth/logout', {}).then(() => { clearMeCache(); window.location.href = '/auth/login'; });
}

onMounted(async () => {
  try {
    me.value = await getMe();
  } catch {
    clearMeCache();
    window.location.href = '/auth/login';
    return;
  }
  await loadFleets();
});
</script>

<style scoped>
.history-page { display: flex; flex-direction: column; min-height: 100vh; background: #0d0f14; color: #cfd9ee; }
main { padding: 1rem 1.5rem; }
.page-header h2 { margin: 0 0 1rem; color: #c8a84b; }
.fleet-list { background: #13181f; border-radius: 4px; overflow: hidden; cursor: pointer; }
</style>
