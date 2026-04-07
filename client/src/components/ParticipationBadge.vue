<template>
  <span
    class="participation-badge"
    :style="{ background: color }"
    :title="reason"
  >{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: 'participant' | 'partial' | 'non-participant';
  reason?: string;
}>();

const LABELS: Record<string, string> = {
  participant:     'Active',
  partial:         'Partial',
  'non-participant': 'Inactive',
};
const COLORS: Record<string, string> = {
  participant:     '#1b7a2e',
  partial:         '#7a5c1b',
  'non-participant': '#7a1b1b',
};

const label  = computed(() => LABELS[props.status] ?? props.status);
const color  = computed(() => COLORS[props.status] ?? '#333');
const reason = computed(() => props.reason ?? '');
</script>

<style scoped>
.participation-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fff;
}
</style>
