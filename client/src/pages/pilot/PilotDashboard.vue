<template>
  <div class="pilot-dashboard">
    <header class="top-bar">
      <span class="logo">PELD Online</span>
      <div class="top-bar-right">
        <Select
          v-if="me"
          v-model="selectedCharId"
          :options="characterOptions"
          option-label="label"
          option-value="value"
          placeholder="Select character"
          class="char-select"
        />
        <Button
          v-if="!logRunning"
          label="Open Log Folder"
          icon="pi pi-folder-open"
          outlined
          @click="openLogs"
        />
        <Button
          v-else
          label="Stop Log Reading"
          icon="pi pi-stop"
          severity="danger"
          outlined
          @click="stopLogs"
        />
        <Button label="Logout" icon="pi pi-sign-out" text @click="logout" />
      </div>
    </header>

    <main v-if="me">
      <!-- Settings bar -->
      <div class="settings-bar">
        <label>DPS Window (s)
          <InputNumber v-model="windowSec" :min="10" :max="300" :step="5" show-buttons />
        </label>
        <span v-if="fleetInfo" class="fleet-badge">
          Fleet: <b>{{ fleetInfo.fleetId }}</b> — uploading every 2s
        </span>
        <span v-if="!fleetInfo && logRunning" class="fleet-badge muted">
          No fleet found — local-only mode
        </span>
      </div>

      <!-- Live stats -->
      <StatsStrip :snapshot="snap" />
      <DpsChart :snapshot="snap" :window-sec="windowSec" />

      <div class="bottom-row">
        <BreakdownTable :rows="snap?.breakdown ?? []" class="breakdown" />
        <HitQualityBar :distribution="snap?.hitQualityDistribution ?? {}" class="hq-bar" />
      </div>
    </main>

    <div v-else class="loading-state">Authenticating…</div>
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { api, getMe, type MeResponse } from '@/api/client';
import { clearMeCache } from '@/router';
import { useLogReader } from '@/composables/useLogReader';
import { useDpsEngine } from '@/composables/useDpsEngine';
import DpsChart from '@/components/DpsChart.vue';
import StatsStrip from '@/components/StatsStrip.vue';
import BreakdownTable from '@/components/BreakdownTable.vue';
import HitQualityBar from '@/components/HitQualityBar.vue';

const router = useRouter();
const toast  = useToast();
const me     = ref<MeResponse | null>(null);
const selectedCharId = ref<number | null>(null);
const windowSec = ref(60);
const fleetInfo = ref<{ fleetId: string } | null>(null);
const isOnline  = ref(false);

const characterOptions = computed(() =>
  (me.value?.characters ?? []).map(c => ({ label: c.name, value: c.characterId })),
);

// Log reader
const { running: logRunning, openDirectory, stop: stopLogs, onEntries } = useLogReader();

// DPS engine
const { addEntries, snapshot: snap, reset } = useDpsEngine(windowSec);

onEntries(entries => {
  addEntries(entries);
  if (isOnline.value && fleetInfo.value && selectedCharId.value) uploadSnapshot();
});

// Online status polling — check every 60 s; gates all fleet endpoint calls
let onlinePollTimer: ReturnType<typeof setInterval> | null = null;

async function checkOnlineStatus() {
  if (!selectedCharId.value) return;
  try {
    const data = await api.get<{ online: boolean }>(`/api/character/${selectedCharId.value}/online`);
    isOnline.value = data.online;
  } catch {
    isOnline.value = false;
  }
}

async function openLogs() {
  try {
    await openDirectory();
  } catch (e: any) {
    if (e?.name !== 'AbortError') toast.add({ severity: 'error', summary: 'Cannot open folder', detail: String(e), life: 4000 });
  }
}

// Fleet polling
let fleetPollTimer: ReturnType<typeof setInterval> | null = null;

async function discoverFleet() {
  if (!selectedCharId.value || !isOnline.value) return;
  try {
    const data = await api.get(`/api/fleet/discover?characterId=${selectedCharId.value}`);
    fleetInfo.value = data.fleet ? { fleetId: data.fleet.id } : null;
  } catch {
    fleetInfo.value = null;
  }
}

// Upload snapshot to server every 2s via pilot route
let uploadTimer: ReturnType<typeof setInterval> | null = null;

async function uploadSnapshot() {
  if (!snap.value || !fleetInfo.value || !selectedCharId.value || !isOnline.value) return;
  try {
    await api.post('/api/pilot/data', {
      characterId: selectedCharId.value,
      fleetId: fleetInfo.value.fleetId,
      snapshot: snap.value,
    });
  } catch {
    // silently ignore upload errors
  }
}

watch(selectedCharId, async (charId) => {
  if (!charId) return;
  reset();
  isOnline.value = false;
  fleetInfo.value = null;
  // Clear old timers
  if (onlinePollTimer) clearInterval(onlinePollTimer);
  if (uploadTimer) clearInterval(uploadTimer);
  if (fleetPollTimer) clearInterval(fleetPollTimer);
  // Check online first, then start fleet discovery
  await checkOnlineStatus();
  await discoverFleet();
  onlinePollTimer = setInterval(checkOnlineStatus, 60_000);
  uploadTimer     = setInterval(uploadSnapshot, 2000);
  fleetPollTimer  = setInterval(discoverFleet, 30_000);
});

function logout() {
  api.post('/auth/logout', {}).then(() => { clearMeCache(); router.push('/login'); });
}

onMounted(async () => {
  try {
    me.value = await getMe();
    if (me.value.characters.length) selectedCharId.value = me.value.characters[0].characterId;
  } catch {
    clearMeCache();
    router.push('/login');
  }
});

onUnmounted(() => {
  if (onlinePollTimer) clearInterval(onlinePollTimer);
  if (uploadTimer) clearInterval(uploadTimer);
  if (fleetPollTimer) clearInterval(fleetPollTimer);
  stopLogs();
});
</script>

<style scoped>
.pilot-dashboard { display: flex; flex-direction: column; min-height: 100vh; background: #0a0e1a; color: #e0e8ff; }
.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.5rem; background: #141928; border-bottom: 1px solid #2a3050; }
.logo { font-size: 1.2rem; font-weight: 700; letter-spacing: 1px; }
.top-bar-right { display: flex; align-items: center; gap: 0.75rem; }
.char-select { min-width: 180px; }
main { padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.settings-bar { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
.fleet-badge { padding: 0.25rem 0.75rem; background: #1e2a45; border-radius: 6px; font-size: 0.85rem; }
.fleet-badge.muted { opacity: 0.5; }
.bottom-row { display: grid; grid-template-columns: 1fr 300px; gap: 1rem; }
.loading-state { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; opacity: 0.6; }
</style>
