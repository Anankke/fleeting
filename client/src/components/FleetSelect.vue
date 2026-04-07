<template>
  <div class="fleet-select">
    <label class="fs-label">Monitor Fleets</label>
    <MultiSelect
      v-model="model"
      :options="options"
      option-label="label"
      option-value="value"
      placeholder="Select fleets to monitor"
      display="chip"
      :loading="loading"
      class="fleet-ms"
      @focus="loadOptions"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import MultiSelect from 'primevue/multiselect';
import { api } from '@/api/client';

const model   = defineModel<string[]>({ default: () => [] });
const options = ref<{ label: string; value: string }[]>([]);
const loading = ref(false);

async function loadOptions() {
  if (options.value.length) return;
  loading.value = true;
  try {
    const data = await api.get('/api/war/fleets');
    options.value = (data.fleets ?? []).map((f: any) => ({
      label: `Fleet ${f.id.slice(0, 8)}… (${f.memberCount ?? 0} members)`,
      value: f.id,
    }));
  } finally {
    loading.value = false;
  }
}

onMounted(loadOptions);
</script>

<style scoped>
.fleet-select { display: flex; align-items: center; gap: 0.75rem; }
.fs-label { color: #8a9cc0; font-size: 0.85rem; white-space: nowrap; }
.fleet-ms { min-width: 280px; }
</style>
