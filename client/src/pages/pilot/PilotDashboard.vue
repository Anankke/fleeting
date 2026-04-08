<template>
  <div class="pilot-dashboard">
    <AppNav :me="me">
      <Select
        v-if="me"
        :modelValue="selectedCharId"
        :options="characterOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('pilot.selectCharacter')"
        class="char-select"
        @update:modelValue="onCharacterModelUpdate"
      />
      <Button
        v-if="!logRunning"
        :label="t('pilot.openLogs')"
        icon="pi pi-folder-open"
        outlined
        @click="openLogs"
      />
      <Button
        v-else
        :label="t('pilot.stopLogs')"
        icon="pi pi-stop"
        severity="danger"
        outlined
        @click="stopAndForget"
      />
      <OverviewManager :me="me" @change="onOverviewChange" />
      <Button :label="t('logout')" icon="pi pi-sign-out" text @click="logout" />
    </AppNav>

    <main v-if="me">
      <!-- Log loading indicator -->
      <div v-if="logLoading" class="log-loading-banner">
        <i class="pi pi-spin pi-spinner" />
        {{ t('pilot.scanningLogs') }}
      </div>

      <!-- Settings bar -->
      <div class="settings-bar">
        <label>{{ t('pilot.dpsWindow') }}
          <InputNumber v-model="windowSec" :min="10" :max="300" :step="5" show-buttons />
        </label>
        <span v-if="fleetInfo" class="fleet-badge">
          {{ t('pilot.fleetUploading', { id: fleetInfo.fleetId }) }}
        </span>
        <span v-if="!fleetInfo && logRunning" class="fleet-badge muted">
          {{ t('pilot.noFleetLocal') }}
        </span>
      </div>

      <div class="charts-grid">
        <!-- All-characters aggregate (left) -->
        <div class="chart-section">
          <div class="section-heading">{{ t('pilot.allCharsAggregate') }}</div>
          <StatsStrip :snapshot="allSnap" />
          <DpsChart :snapshot="allSnap" :window-sec="windowSec" />
        </div>

        <!-- Per-character live stats (right) -->
        <div class="chart-section">
          <div class="section-heading">{{ selectedCharName ?? t('pilot.characterFallback') }}</div>
          <StatsStrip :snapshot="snap" />
          <!-- One DpsChart per character kept alive with v-show to preserve chart history -->
          <template v-for="char in me!.characters" :key="char.id">
            <DpsChart
              v-show="char.id === selectedCharIdNum"
              :snapshot="charSnapshots[char.id] ?? null"
              :window-sec="windowSec"
            />
          </template>
        </div>
      </div>

      <div class="bottom-row">
        <BreakdownTable :rows="snap?.breakdown ?? []" :dominant-hit-quality="snap?.dominantHitQuality ?? null" class="breakdown" />
        <HitQualityBar
          :distribution-out="snap?.hitQualityDistribution ?? {}"
          :distribution-in="snap?.hitQualityDistributionIn ?? {}"
          class="hq-bar"
        />
      </div>

      <LiveEventLog ref="liveLogRef" class="live-log-section" />
    </main>

    <div v-else class="loading-state">{{ t('authenticating') }}</div>
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { useTranslation } from 'i18next-vue';
import { api, getMe, type MeResponse } from '@/api/client';
import { clearMeCache } from '@/router';
import { IDB_KEYS, deleteIdbValue, loadIdbValue, saveIdbValue, type PilotSessionCache } from '@/lib/logCache';
import { useLogReader } from '@/composables/useLogReader';
import { useOverviewSettings } from '@/composables/useOverviewSettings';
import { useDpsEngine } from '@/composables/useDpsEngine';
import type { LogEntry } from '@/lib/logRegex';
import AppNav from '@/components/AppNav.vue';
import DpsChart from '@/components/DpsChart.vue';
import StatsStrip from '@/components/StatsStrip.vue';
import BreakdownTable from '@/components/BreakdownTable.vue';
import HitQualityBar from '@/components/HitQualityBar.vue';
import OverviewManager from '@/components/OverviewManager.vue';
import LiveEventLog from '@/components/LiveEventLog.vue';

const toast  = useToast();
const { t } = useTranslation();
const me     = ref<MeResponse | null>(null);
const selectedCharId = ref<number | string | null>(null);
const windowSec = ref(60);
const fleetInfo = ref<{ fleetId: string } | null>(null);
const isOnline  = ref(false);
const PILOT_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

const DEBUG_CHAR = true;

function debugChar(...args: unknown[]) {
  if (!DEBUG_CHAR) return;
  console.info('[char-debug][PilotDashboard]', ...args);
}

function onCharacterModelUpdate(value: number | string | null | undefined) {
  const normalized = value == null ? null : value;
  debugChar('select:update:model-value', {
    raw: value,
    normalized,
    previous: selectedCharId.value,
  });
  selectedCharId.value = normalized;
}

const selectedCharIdNum = computed<number | null>(() => {
  if (selectedCharId.value == null) return null;
  const parsed = Number(selectedCharId.value);
  return Number.isFinite(parsed) ? parsed : null;
});

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

const characterOptions = computed(() =>
  (me.value?.characters ?? []).map(c => ({ label: c.name, value: c.id })),
);

// Log reader
const { running: logRunning, isLoading: logLoading, pickDirectory: openDirectory, tryRestoreDirectory, forgetDirectory, stop: stopLogs, syncOverviews, onEntries } = useLogReader();

type LiveLogController = {
  push(entries: LogEntry[]): void;
  clear(): void;
  snapshot(): LogEntry[];
  restore(entries: LogEntry[]): void;
};

const liveLogRef = ref<LiveLogController | null>(null);

// Overview settings — per character, persisted in localStorage
const { getAll: getAllOverviews } = useOverviewSettings();

/** Called when the user uploads, duplicates, or resets any character's overview */
function onOverviewChange() {
  syncOverviews(getAllOverviews());
}

// DPS engine — one per character, kept alive forever so switching back restores history.
// Using reactive Record so Vue can track changes and per-char computed snapshots update.
type Engine = ReturnType<typeof useDpsEngine>;
const charEngines = reactive<Record<number, Engine>>({});

function getOrCreateEngine(charId: number): Engine {
  if (!charEngines[charId]) charEngines[charId] = useDpsEngine(windowSec);
  return charEngines[charId];
}

// Map character id → current DpsSnapshot (reactive, auto-updates as logs arrive)
const charSnapshots = computed<Record<number, typeof charEngines[number]['snapshot']['value'] | null>>(() => {
  const result: Record<number, typeof charEngines[number]['snapshot']['value'] | null> = {};
  for (const id of Object.keys(charEngines).map(Number)) {
    result[id] = charEngines[id]?.snapshot.value ?? null;
  }
  return result;
});

// Snapshot for whichever character is currently selected
const snap = computed(() => selectedCharIdNum.value != null ? (charSnapshots.value[selectedCharIdNum.value] ?? null) : null);

// DPS engine — aggregate across ALL characters (never reset on char switch)
const allEngine = useDpsEngine(windowSec);
const { addEntries: addEntriesAll, snapshot: allSnap } = allEngine;

const selectedCharName = computed(() =>
  me.value?.characters.find(c => c.id === selectedCharIdNum.value)?.name ?? null,
);

watch(selectedCharId, (val, prev) => {
  debugChar('watch:selectedCharId', { prev, val, type: typeof val });
});

watch(selectedCharIdNum, (val, prev) => {
  debugChar('watch:selectedCharIdNum', { prev, val });
});

watch(selectedCharName, (val, prev) => {
  debugChar('watch:selectedCharName', { prev, val });
});

watch(selectedCharId, () => {
  void persistPilotSessionCache();
});

async function clearPilotSessionCache() {
  await deleteIdbValue(IDB_KEYS.pilotSession);
}

async function persistPilotSessionCache() {
  const perCharacterEntries: Record<string, ReturnType<Engine['exportBuffer']>> = {};
  for (const [charId, engine] of Object.entries(charEngines)) {
    perCharacterEntries[charId] = engine.exportBuffer();
  }
  const payload: PilotSessionCache = {
    version: 1,
    cachedAt: Date.now(),
    selectedCharId: selectedCharId.value,
    allEntries: allEngine.exportBuffer(),
    perCharacterEntries,
    liveEntries: liveLogRef.value?.snapshot() ?? [],
  };
  await saveIdbValue(IDB_KEYS.pilotSession, payload);
}

async function restorePilotSessionCache() {
  const cache = await loadIdbValue<PilotSessionCache>(IDB_KEYS.pilotSession);
  if (!cache || cache.version !== 1) return false;
  if (Date.now() - cache.cachedAt > PILOT_SESSION_MAX_AGE_MS) {
    await clearPilotSessionCache();
    return false;
  }

  allEngine.restoreBuffer(cache.allEntries);
  for (const [charId, entries] of Object.entries(cache.perCharacterEntries)) {
    getOrCreateEngine(Number(charId)).restoreBuffer(entries);
  }

  if (cache.selectedCharId != null) {
    const selected = Number(cache.selectedCharId);
    if (me.value?.characters.some(char => char.id === selected)) {
      selectedCharId.value = selected;
    }
  }

  await nextTick();
  liveLogRef.value?.restore(cache.liveEntries);
  return true;
}

onEntries(entries => {
  debugChar('onEntries:batch', {
    count: entries.length,
    selectedCharId: selectedCharId.value,
    selectedCharIdNum: selectedCharIdNum.value,
    selectedCharName: selectedCharName.value,
  });
  // All entries from every character go into the aggregate engine.
  addEntriesAll(entries);
  const selectedOwner = normalizeName(selectedCharName.value ?? '');
  const visibleEntries = selectedOwner
    ? entries.filter(e => normalizeName(e.logOwner) === selectedOwner)
    : entries;
  liveLogRef.value?.push(visibleEntries);

  // Route each entry into the per-character engine matching logOwner.
  const byChar = new Map<string, typeof entries>();
  for (const e of entries) {
    const arr = byChar.get(e.logOwner) ?? [];
    arr.push(e);
    byChar.set(e.logOwner, arr);
  }
  const chars = me.value?.characters ?? [];
  const charByName = new Map(chars.map(c => [normalizeName(c.name), c]));
  const unmatchedOwners: string[] = [];
  for (const [ownerName, ownerEntries] of byChar) {
    const char = charByName.get(normalizeName(ownerName));
    if (char) {
      getOrCreateEngine(char.id).addEntries(ownerEntries);
    } else {
      unmatchedOwners.push(ownerName);
    }
  }

  if (unmatchedOwners.length) {
    debugChar('onEntries:unmatchedOwners', {
      unmatchedOwners,
      knownCharacters: chars.map(c => c.name),
    });
  }

  void persistPilotSessionCache();

  if (isOnline.value && fleetInfo.value && selectedCharIdNum.value) uploadSnapshot();
});

// Online status polling — check every 60 s; gates all fleet endpoint calls
const appEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const ONLINE_POLL_MS      = parseInt(appEnv.VITE_ONLINE_POLL_MS      ?? '60000', 10);
const UPLOAD_INTERVAL_MS  = parseInt(appEnv.VITE_UPLOAD_INTERVAL_MS  ?? '2000',  10);
const FLEET_POLL_MS       = parseInt(appEnv.VITE_FLEET_POLL_MS       ?? '30000', 10);
let onlinePollTimer: ReturnType<typeof setInterval> | null = null;

async function checkOnlineStatus() {
  if (!selectedCharIdNum.value) return;
  try {
    const data = await api.get<{ online: boolean }>(`/api/character/${selectedCharIdNum.value}/online`);
    isOnline.value = data.online;
  } catch {
    isOnline.value = false;
  }
}

async function openLogs() {
  try {
    await openDirectory();
    await clearPilotSessionCache();
    syncOverviews(getAllOverviews());
  } catch (e: any) {
    if (e?.name !== 'AbortError') toast.add({ severity: 'error', summary: t('pilot.cannotOpenFolder'), detail: String(e), life: 4000 });
  }
}

async function stopAndForget() {
  await forgetDirectory();
  await clearPilotSessionCache();
  liveLogRef.value?.clear();
}

// Fleet polling
let fleetPollTimer: ReturnType<typeof setInterval> | null = null;

async function discoverFleet() {
  if (!selectedCharIdNum.value || !isOnline.value) return;
  try {
    const data = await api.get<{ fleet?: { id: string } | null }>(`/api/fleet/discover?characterId=${selectedCharIdNum.value}`);
    fleetInfo.value = data.fleet ? { fleetId: data.fleet.id } : null;
  } catch {
    fleetInfo.value = null;
  }
}

// Upload snapshot to server every 2s via pilot route
let uploadTimer: ReturnType<typeof setInterval> | null = null;

async function uploadSnapshot() {
  if (!snap.value || !fleetInfo.value || !selectedCharIdNum.value || !isOnline.value) return;
  try {
    await api.post('/api/pilot/data', {
      characterId: selectedCharIdNum.value,
      fleetId: fleetInfo.value.fleetId,
      snapshot: snap.value,
    });
  } catch {
    // silently ignore upload errors
  }
}

watch(selectedCharIdNum, async (charId) => {
  if (!charId) return;
  debugChar('watch:selectedCharIdNum:timersReset', { charId });
  // Engines are persistent — do not clear historical view on switch.
  isOnline.value = false;
  fleetInfo.value = null;
  // Clear old timers
  if (onlinePollTimer) clearInterval(onlinePollTimer);
  if (uploadTimer) clearInterval(uploadTimer);
  if (fleetPollTimer) clearInterval(fleetPollTimer);
  // Check online first, then start fleet discovery
  await checkOnlineStatus();
  await discoverFleet();
  onlinePollTimer = setInterval(checkOnlineStatus, ONLINE_POLL_MS);
  uploadTimer     = setInterval(uploadSnapshot, UPLOAD_INTERVAL_MS);
  fleetPollTimer  = setInterval(discoverFleet, FLEET_POLL_MS);
});

function logout() {
  api.post('/auth/logout', {}).then(() => {
    clearMeCache();
    window.location.href = '/auth/login';
  });
}

onMounted(async () => {
  try {
    me.value = await getMe();
    debugChar('onMounted:getMe', {
      characterCount: me.value.characters.length,
      characters: me.value.characters,
    });
    // Pre-create engines for ALL characters so all begin tracking immediately
    for (const char of me.value.characters) {
      getOrCreateEngine(char.id);
    }
    if (me.value.characters.length) {
      selectedCharId.value = me.value.characters[0].id;
    }
  } catch {
    clearMeCache();
    window.location.href = '/auth/login';
    return;
  }
  // Attempt to silently re-open the last log directory (no user prompt needed
  // if the browser still has permission for the stored handle).
  const restored = await tryRestoreDirectory();
  debugChar('onMounted:restoreDirectory', { restored });
  if (restored) {
    await restorePilotSessionCache();
    syncOverviews(getAllOverviews());
  }
});

onUnmounted(() => {
  void persistPilotSessionCache();
  if (onlinePollTimer) clearInterval(onlinePollTimer);
  if (uploadTimer) clearInterval(uploadTimer);
  if (fleetPollTimer) clearInterval(fleetPollTimer);
  stopLogs();
});
</script>

<style scoped>
/* ── EVE Online palette ───────────────────────────────────────────── */
:root {
  --eve-bg:       #0d0f14;
  --eve-panel:    #13181f;
  --eve-surface:  #1a2030;
  --eve-border:   #253048;
  --eve-gold:     #c8a84b;
  --eve-gold-dim: #8a6e2e;
  --eve-cyan:     #4fc3d1;
  --eve-text:     #cfd9ee;
  --eve-muted:    #5b6f8e;
}

.pilot-dashboard { display: flex; flex-direction: column; min-height: 100vh; background: var(--eve-bg); color: var(--eve-text); }
.char-select { min-width: 180px; }
main { padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.settings-bar { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
.fleet-badge {
  padding: 0.2rem 0.65rem;
  background: var(--eve-surface);
  border: 1px solid var(--eve-border);
  border-radius: 3px;
  font-size: 0.8rem;
  color: var(--eve-cyan);
}
.fleet-badge.muted { color: var(--eve-muted); border-color: transparent; }
.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  min-width: 0;
}
@media (max-width: 1200px) {
  .charts-grid { grid-template-columns: 1fr; }
}
.chart-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--eve-panel);
  border: 1px solid var(--eve-border);
  border-radius: 4px;
  min-width: 0;
}
.section-heading {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--eve-gold);
}
.bottom-row { display: grid; grid-template-columns: 1fr 300px; gap: 1rem; }
.live-log-section { margin-top: 0; }
.loading-state { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; opacity: 0.5; }
.log-loading-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: #1a1e10;
  border: 1px solid #4a5e20;
  border-radius: 6px;
  color: #a8c050;
  font-size: 0.9rem;
}

@media (max-width: 1200px) {
  main { padding: 1rem; }
}

@media (max-width: 900px) {
  .char-select { min-width: 140px; }
  .bottom-row { grid-template-columns: 1fr; }
}
</style>
