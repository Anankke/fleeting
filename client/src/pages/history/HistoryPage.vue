<template>
  <div class="history-page">
    <header class="top-bar">
      <span class="logo">PELD Online — Fleet History</span>
      <Button label="Logout" icon="pi pi-sign-out" text @click="logout" />
    </header>

    <main v-if="!selectedFleetId">
      <div class="page-header">
        <h2>Past Fleets</h2>
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
        <Column field="id"            header="Fleet ID"    style="min-width:160px">
          <template #body="{ data }">{{ data.id.slice(0, 12) }}…</template>
        </Column>
        <Column field="fc_name"       header="FC"          style="min-width:120px" />
        <Column field="member_count"  header="Members"     style="min-width:80px" />
        <Column field="created_at"    header="Started"     style="min-width:140px">
          <template #body="{ data }">{{ fmtDate(data.created_at) }}</template>
        </Column>
        <Column field="closed_at"     header="Ended"       style="min-width:140px">
          <template #body="{ data }">{{ data.closed_at ? fmtDate(data.closed_at) : '—' }}</template>
        </Column>
        <Column field="duration_min"  header="Duration"    style="min-width:80px">
          <template #body="{ data }">{{ data.duration_min != null ? data.duration_min + ' min' : '—' }}</template>
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
import { useRouter } from 'vue-router';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Button from 'primevue/button';
import Toast from 'primevue/toast';
import { api } from '@/api/client';
import { clearMeCache } from '@/router';
import FleetReplayView from './FleetReplayView.vue';

const router         = useRouter();
const fleets         = ref<any[]>([]);
const totalFleets    = ref(0);
const pageSize       = 20;
const selectedFleetId = ref<string | null>(null);

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
  api.post('/auth/logout', {}).then(() => { clearMeCache(); router.push('/login'); });
}

onMounted(async () => {
  try {
    await api.get('/api/me');
  } catch {
    clearMeCache();
    router.push('/login');
    return;
  }
  await loadFleets();
});
</script>

<style scoped>
.history-page { display: flex; flex-direction: column; min-height: 100vh; background: #0a0e1a; color: #e0e8ff; }
.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.5rem; background: #141928; border-bottom: 1px solid #2a3050; }
.logo { font-size: 1.2rem; font-weight: 700; letter-spacing: 1px; }
main { padding: 1rem 1.5rem; }
.page-header h2 { margin: 0 0 1rem; }
.fleet-list { background: #141928; border-radius: 8px; overflow: hidden; cursor: pointer; }
</style>
