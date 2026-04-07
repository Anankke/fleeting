<template>
  <div class="commander-dashboard">
    <header class="top-bar">
      <span class="logo">PELD Online — Commander</span>
      <div class="top-bar-right">
        <Tag v-if="mode === 'war'" value="War Commander" severity="danger" />
        <Tag v-else value="Fleet Commander" severity="info" />
        <Button label="Logout" icon="pi pi-sign-out" text @click="logout" />
      </div>
    </header>

    <main v-if="me">
      <!-- War commander fleet selector -->
      <div v-if="mode === 'war'" class="war-controls">
        <FleetSelect v-model="selectedFleetIds" />
      </div>

      <!-- Live aggregate stats -->
      <div class="stats-section">
        <StatsStrip :snapshot="aggregate" />
      </div>

      <!-- Per-member table -->
      <MemberTable
        :members="memberRows"
        :fleet-id="primaryFleetId"
        class="member-table"
      />

      <!-- Breakdown + hit quality for war mode -->
      <div v-if="mode === 'war'" class="bottom-row">
        <BreakdownTable :rows="aggregate?.breakdown ?? []" />
        <HitQualityBar :distribution="aggregate?.hitQualityDistribution ?? {}" />
      </div>
    </main>

    <div v-else class="loading-state">Authenticating…</div>
    <Toast />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Toast from 'primevue/toast';
import { getMe, api, type MeResponse } from '@/api/client';
import { clearMeCache } from '@/router';
import { useFleetSSE } from '@/composables/useFleetSSE';
import { useParticipation } from '@/composables/useParticipation';
import MemberTable from '@/components/MemberTable.vue';
import FleetSelect from '@/components/FleetSelect.vue';
import StatsStrip from '@/components/StatsStrip.vue';
import BreakdownTable from '@/components/BreakdownTable.vue';
import HitQualityBar from '@/components/HitQualityBar.vue';

const router = useRouter();
const me   = ref<MeResponse | null>(null);
const mode = ref<'fc' | 'war'>('fc');

// War mode fleet selection
const selectedFleetIds = ref<string[]>([]);
const myFleetId        = ref<string | null>(null);

const primaryFleetId = computed(() => myFleetId.value ?? selectedFleetIds.value[0] ?? null);

const channelIds = computed(() => {
  if (mode.value === 'war') return selectedFleetIds.value;
  return myFleetId.value ? [myFleetId.value] : [];
});

// SSE subscription
const { latestMessages } = useFleetSSE(channelIds);

// Aggregate across all subscribed fleets
const aggregate = computed(() => {
  // Build a flat list of pilot snapshots from all fleet messages
  const snapshots: any[] = [];
  for (const [, msg] of latestMessages.value) {
    if (msg.type === 'fleet') snapshots.push(...(msg.pilots ?? []));
    if (msg.type === 'war')   snapshots.push(...(msg.pilots ?? []));
  }
  if (!snapshots.length) return null;
  // Simple merge: pick latest snapshot per character
  const byChar = new Map<number, any>();
  for (const s of snapshots) byChar.set(s.characterId, s);
  return { pilots: [...byChar.values()], breakdown: [], hitQualityDistribution: {} };
});

// Presence history for participation analysis (loaded once per fleet close)
const memberRows = computed(() => {
  const rows: any[] = [];
  for (const [, msg] of latestMessages.value) {
    if (msg.type === 'fleet' || msg.type === 'war') {
      for (const p of msg.pilots ?? []) rows.push(p);
    }
  }
  return rows;
});

async function discoverMyFleet() {
  if (!me.value?.characters.length) return;
  try {
    const data = await api.get(`/api/fleet/discover?characterId=${me.value.characters[0].characterId}`);
    if (data.fleet) myFleetId.value = data.fleet.id;
  } catch { /* not in fleet */ }
}

function logout() {
  api.post('/auth/logout', {}).then(() => { clearMeCache(); router.push('/login'); });
}

onMounted(async () => {
  try {
    me.value = await getMe();
    mode.value = me.value.roles.includes('war_commander') ? 'war' : 'fc';
    await discoverMyFleet();
  } catch {
    clearMeCache();
    router.push('/login');
  }
});
</script>

<style scoped>
.commander-dashboard { display: flex; flex-direction: column; min-height: 100vh; background: #0a0e1a; color: #e0e8ff; }
.top-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.5rem; background: #141928; border-bottom: 1px solid #2a3050; }
.logo { font-size: 1.2rem; font-weight: 700; letter-spacing: 1px; }
.top-bar-right { display: flex; align-items: center; gap: 0.75rem; }
main { padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.war-controls { display: flex; align-items: center; gap: 1rem; }
.bottom-row { display: grid; grid-template-columns: 1fr 300px; gap: 1rem; }
.loading-state { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; opacity: 0.6; }
</style>
