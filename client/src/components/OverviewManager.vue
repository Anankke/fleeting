<template>
  <Button
    :label="t('overview.button')"
    icon="pi pi-sliders-h"
    text
    :title="t('overview.buttonTitle')"
    @click="open"
  />

  <Dialog
    v-model:visible="visible"
    :header="t('overview.dialogTitle')"
    modal
    :style="{ width: '700px', maxWidth: '96vw' }"
    :pt="dialogPt"
  >
    <p class="hint">
      {{ t('overview.hint') }}
    </p>

    <div v-if="!characters.length" class="empty">{{ t('overview.noCharacters') }}</div>

    <div v-else class="char-list">
      <div v-for="char in characters" :key="char.id" class="char-row">
        <!-- Left: character name + loaded status -->
        <div class="char-info">
          <span class="char-name">{{ char.name }}</span>
          <template v-if="overviews[char.id]">
            <span class="ov-filename">{{ overviews[char.id].filename }}</span>
            <span class="ov-date">{{ formatDate(overviews[char.id].uploadedAt) }}</span>
          </template>
          <span v-else class="ov-none">{{ t('overview.noOverviewLoaded') }}</span>
        </div>

        <!-- Right: action buttons -->
        <div class="char-actions">
          <!-- Upload -->
          <Button
            :label="t('overview.upload')"
            icon="pi pi-upload"
            size="small"
            outlined
            :loading="uploading === char.id"
            @click="doUpload(char)"
          />

          <!-- Duplicate from another char -->
          <template v-if="sourceCandidates(char.id).length">
            <Select
              v-model="dupSelections[char.id]"
              :options="sourceCandidates(char.id)"
              option-label="name"
              option-value="id"
              :placeholder="t('overview.copyFrom')"
              size="small"
              class="dup-select"
            />
            <Button
              :label="t('overview.apply')"
              icon="pi pi-copy"
              size="small"
              outlined
              :disabled="!dupSelections[char.id]"
              @click="doDuplicate(char)"
            />
          </template>

          <!-- Reset -->
          <Button
            v-if="overviews[char.id]"
            :label="t('overview.clear')"
            icon="pi pi-trash"
            size="small"
            severity="danger"
            outlined
            @click="doReset(char)"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <Button :label="t('overview.close')" icon="pi pi-times" @click="visible = false" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useTranslation } from 'i18next-vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { useOverviewSettings } from '@/composables/useOverviewSettings';
import type { MeResponse } from '@/api/client';

const props = defineProps<{ me: MeResponse | null }>();
const emit  = defineEmits<{ (e: 'change'): void }>();
const { t } = useTranslation();

const toast     = useToast();
const visible   = ref(false);
const uploading = ref<number | null>(null);

const { overviews, upload, duplicate, reset } = useOverviewSettings();
const characters = computed(() => props.me?.characters ?? []);
const dupSelections = reactive<Record<number, number | null>>({});

function open() { visible.value = true; }

function sourceCandidates(excludeId: number) {
  return characters.value.filter(c => c.id !== excludeId && overviews.value[c.id]);
}

function formatDate(isoStr: string) {
  return new Date(isoStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function doUpload(char: { id: number; name: string }) {
  uploading.value = char.id;
  try {
    const ok = await upload(char.id, char.name);
    if (ok) {
      toast.add({ severity: 'success', summary: t('overview.loadedSummary'), detail: t('overview.loadedDetail', { name: char.name }), life: 3000 });
      emit('change');
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: t('overview.uploadFailed'), detail: e.message, life: 4000 });
  } finally {
    uploading.value = null;
  }
}

function doDuplicate(char: { id: number; name: string }) {
  const fromId = dupSelections[char.id];
  if (!fromId) return;
  const ok = duplicate(fromId, char.id, char.name);
  if (ok) {
    const fromName = characters.value.find(c => c.id === fromId)?.name ?? String(fromId);
    toast.add({ severity: 'success', summary: t('overview.copiedSummary'), detail: t('overview.copiedDetail', { from: fromName, to: char.name }), life: 3000 });
    dupSelections[char.id] = null;
    emit('change');
  }
}

function doReset(char: { id: number; name: string }) {
  reset(char.id);
  toast.add({ severity: 'info', summary: t('overview.clearedSummary'), detail: t('overview.clearedDetail', { name: char.name }), life: 3000 });
  emit('change');
}

const dialogPt = {
  header:  { style: 'background:#13181f; border-bottom:1px solid #253048; color:#c8a84b; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-size:1rem;' },
  content: { style: 'background:#0d0f14; color:#cfd9ee; padding:1.25rem 1.5rem;' },
  footer:  { style: 'background:#13181f; border-top:1px solid #253048; display:flex; justify-content:flex-end; padding:0.75rem 1.5rem;' },
};
</script>

<style scoped>
.hint {
  font-size: 0.9rem;
  color: #8a9cc0;
  margin: 0 0 1.25rem;
  line-height: 1.6;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #5b6f8e;
  font-size: 0.95rem;
}

/* ── Character rows ── */
.char-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.char-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #1a2030;
}
.char-row:last-child { border-bottom: none; }

.char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.char-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: #c8a84b;
}

.ov-filename {
  font-size: 0.85rem;
  color: #4fc3d1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ov-date {
  font-size: 0.8rem;
  color: #5b6f8e;
}

.ov-none {
  font-size: 0.85rem;
  color: #5b6f8e;
  font-style: italic;
}

/* ── Actions ── */
.char-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dup-select {
  min-width: 140px;
  font-size: 0.85rem;
}
</style>

