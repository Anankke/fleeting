<template>
  <div class="fleet-replay">
    <div class="replay-header">
      <Button icon="pi pi-arrow-left" text @click="$emit('back')" label="Back to fleet list" />
      <h2 v-if="summary">Fleet {{ summary.id?.slice(0, 12) }}… &mdash; {{ fmtDate(summary.created_at) }}</h2>
      <span v-if="summary?.closed_at" class="duration">{{ summary.duration_min }} min</span>
    </div>

    <TabView class="replay-tabs">
      <!-- Overview tab -->
      <TabPanel header="Overview">
        <div v-if="summary" class="overview-grid">
          <div class="kv-row"><span>FC</span><b>{{ summary.fc_name ?? '—' }}</b></div>
          <div class="kv-row"><span>Members</span><b>{{ summary.member_count }}</b></div>
          <div class="kv-row"><span>Total Damage</span><b>{{ fmtNum(summary.total_damage ?? 0) }}</b></div>
        </div>
        <PresenceTimeline :presence="presence" class="presence-chart" />
      </TabPanel>

      <!-- Combat Timeline tab -->
      <TabPanel header="Timeline">
        <CombatTimeline :points="timelinePoints" @scrub="onScrub" />
        <div v-if="scrubTime" class="scrub-info">
          Showing snapshot at {{ fmtTime(scrubTime) }}
        </div>
        <MemberTable :members="snapshotAtScrub" />
      </TabPanel>

      <!-- Percentiles tab -->
      <TabPanel header="Percentiles">
        <div class="pilot-selector">
          <Select
            v-model="selectedCharId"
            :options="pilotOptions"
            option-label="label"
            option-value="value"
            placeholder="Select pilot"
          />
        </div>
        <PercentileChart :points="pilotPercentilePoints" />
      </TabPanel>

      <!-- Participation tab -->
      <TabPanel header="Participation">
        <DataTable :value="participation" size="small" class="part-table">
          <Column field="characterName" header="Pilot"  sortable />
          <Column field="shipName"      header="Ship"   sortable />
          <Column field="totalDamage"   header="Damage" sortable>
            <template #body="{ data }">{{ fmtNum(data.totalDamage ?? 0) }}</template>
          </Column>
          <Column field="nonCombatPct"  header="Non-Combat %" sortable>
            <template #body="{ data }">{{ (data.nonCombatPct ?? 0).toFixed(1) }}%</template>
          </Column>
          <Column field="status" header="Status">
            <template #body="{ data }">
              <ParticipationBadge :status="data.status" :reason="data.reason" />
            </template>
          </Column>
        </DataTable>
      </TabPanel>

      <!-- Events tab -->
      <TabPanel header="Events">
        <div class="event-filters">
          <InputText v-model="eventFilters.target"  placeholder="Target…"  size="small" />
          <InputText v-model="eventFilters.weapon"  placeholder="Weapon…"  size="small" />
          <InputText v-model="eventFilters.charId"  placeholder="Char ID…" size="small" />
          <Button label="Apply" size="small" @click="loadEvents(1)" />
        </div>
        <EventLogTable :rows="eventData" @page="loadEvents" />
      </TabPanel>
    </TabView>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Select from 'primevue/select';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { api } from '@/api/client';
import CombatTimeline from '@/components/CombatTimeline.vue';
import PercentileChart, { type PercentilePoint } from '@/components/PercentileChart.vue';
import PresenceTimeline from '@/components/PresenceTimeline.vue';
import MemberTable from '@/components/MemberTable.vue';
import BreakdownTable from '@/components/BreakdownTable.vue';
import HitQualityBar from '@/components/HitQualityBar.vue';
import ParticipationBadge from '@/components/ParticipationBadge.vue';
import EventLogTable from '@/components/EventLogTable.vue';

const props = defineProps<{ fleetId: string }>();
defineEmits<{ back: [] }>();

const summary      = ref<any>(null);
const timelineFull = ref<any[]>([]);
const presence     = ref<any[][]>([]);
const participation = ref<any[]>([]);
const eventData    = ref<{ total: number; rows: any[] }>({ total: 0, rows: [] });
const selectedCharId = ref<number | null>(null);
const pilotSnapshots = ref<Record<number, any[]>>({});
const scrubTime    = ref<number | null>(null);

const eventFilters = ref({ target: '', weapon: '', charId: '' });

const timelinePoints = computed(() =>
  timelineFull.value.map(r => ({ ts: new Date(r.bucket_time).getTime() / 1000, totalDps: r.avg_total_dps ?? 0 })),
);

const pilotOptions = computed(() =>
  (summary.value?.members ?? []).map((m: any) => ({ label: m.characterName ?? String(m.characterId), value: m.characterId })),
);

const pilotPercentilePoints = computed((): PercentilePoint[] => {
  if (!selectedCharId.value) return [];
  return (pilotSnapshots.value[selectedCharId.value] ?? []).map(r => ({
    ts:  new Date(r.bucket_ts).getTime() / 1000,
    p50: r.p50, p90: r.p90, p95: r.p95, p99: r.p99, avg: r.avg_dps,
  }));
});

const snapshotAtScrub = computed(() => {
  if (!scrubTime.value || !timelineFull.value.length) return [];
  // Find row closest to scrubTime
  let closest = timelineFull.value[0];
  let minDiff = Infinity;
  for (const row of timelineFull.value) {
    const diff = Math.abs(new Date(row.bucket_time).getTime() / 1000 - scrubTime.value);
    if (diff < minDiff) { minDiff = diff; closest = row; }
  }
  return closest?.pilots ?? [];
});

function onScrub(ts: number) { scrubTime.value = ts; }

async function loadEvents(page = 1) {
  const q = new URLSearchParams({ page: String(page), limit: '100' });
  if (eventFilters.value.target)  q.set('target',  eventFilters.value.target);
  if (eventFilters.value.weapon)  q.set('weapon',  eventFilters.value.weapon);
  if (eventFilters.value.charId)  q.set('charId',  eventFilters.value.charId);
  eventData.value = await api.get(`/api/history/fleet/${props.fleetId}/events?${q}`);
}

watch(selectedCharId, async (charId) => {
  if (!charId || pilotSnapshots.value[charId]) return;
  const rows = await api.get(`/api/history/fleet/${props.fleetId}/snapshots/${charId}`);
  pilotSnapshots.value[charId] = rows;
});

function fmtDate(iso: string) { return new Date(iso).toLocaleString(); }
function fmtTime(ts: number)  { return new Date(ts * 1000).toLocaleTimeString(); }
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

onMounted(async () => {
  const [sum, tl, pres, part] = await Promise.all([
    api.get(`/api/history/fleet/${props.fleetId}/summary`),
    api.get(`/api/history/fleet/${props.fleetId}/timeline`),
    api.get(`/api/history/fleet/${props.fleetId}/presence`),
    api.get(`/api/history/fleet/${props.fleetId}/participation`),
  ]);
  summary.value      = sum;
  timelineFull.value = tl;
  presence.value     = pres;
  participation.value = part.members ?? [];
  await loadEvents();
});
</script>

<style scoped>
.fleet-replay { padding: 1rem 1.5rem; color: #e0e8ff; }
.replay-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.replay-header h2 { margin: 0; font-size: 1.2rem; }
.duration { color: #8a9cc0; font-size: 0.9rem; }
.overview-grid { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
.kv-row { display: flex; gap: 0.5rem; background: #141928; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid #2a3050; }
.kv-row span { color: #8a9cc0; }
.presence-chart { margin-top: 1rem; }
.pilot-selector { margin-bottom: 0.75rem; }
.scrub-info { margin: 0.5rem 0; font-size: 0.85rem; color: #8a9cc0; }
.event-filters { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.part-table { background: #141928; border-radius: 8px; overflow: hidden; }
.replay-tabs :deep(.p-tabview-panels) { background: transparent; }
</style>
