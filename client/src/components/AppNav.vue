<template>
  <header class="app-nav">
    <RouterLink to="/" class="nav-logo">PELD Online</RouterLink>
    <nav v-if="me" class="nav-links">
      <RouterLink to="/pilot" class="nav-link">{{ $t('nav.pilot') }}</RouterLink>
      <RouterLink
        v-if="canCommander"
        to="/commander"
        class="nav-link"
      >{{ $t('nav.commander') }}</RouterLink>
      <RouterLink
        v-if="canCommander"
        to="/history"
        class="nav-link"
      >{{ $t('nav.history') }}</RouterLink>
    </nav>
    <div class="nav-actions">
      <slot />
      <!-- Language switcher -->
      <Select
        :modelValue="selectedLang"
        :options="langOptions"
        option-label="label"
        option-value="value"
        class="lang-select"
        @update:modelValue="onLanguageModelUpdate"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Select from 'primevue/select';
import type { MeResponse } from '@/api/client';
import i18next from 'i18next';
import { changeLanguage, SUPPORTED_LANGS, LANG_PREFERENCE_KEY } from '@/i18n';

const DEBUG_LANG = true;

function debugLang(...args: unknown[]) {
  if (!DEBUG_LANG) return;
  console.info('[lang-debug][AppNav]', ...args);
}

const props = defineProps<{ me: MeResponse | null }>();

const canCommander = computed(() =>
  props.me?.roles.some(r => r === 'fc' || r === 'war_commander') ?? false,
);

// "English name - Native name" — fully static, not translatable.
const LANG_OPTIONS: Record<string, string> = {
  auto: '🌐 Auto',
  en:   'English',
  de:   'English - Deutsch',
  fr:   'French - Français',
  ja:   'Japanese - 日本語',
  ko:   'Korean - 한국어',
  ru:   'Russian - Русский',
  zh:   'Chinese - 中文',
};

const langOptions = [
  { label: LANG_OPTIONS.auto, value: 'auto' },
  ...SUPPORTED_LANGS.map(l => ({ label: LANG_OPTIONS[l] ?? l.toUpperCase(), value: l })),
];

// Read whether the user has explicitly chosen a language (vs. browser auto-detect).
// i18next-browser-languagedetector stores the explicit choice under 'i18nextLng'.
function getInitialLang(): string {
  const stored = localStorage.getItem(LANG_PREFERENCE_KEY);
  if (!stored) return 'auto';
  const base = stored.split('-')[0].toLowerCase();
  return (SUPPORTED_LANGS as readonly string[]).includes(base) ? base : 'auto';
}

const selectedLang = ref<string>(getInitialLang());

async function applyLanguage(lang: string) {
  debugLang('applyLanguage:start', {
    incoming: lang,
    selectedLang: selectedLang.value,
    i18nextLanguage: i18next.language,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
  });
  await changeLanguage(lang);
  if (!localStorage.getItem(LANG_PREFERENCE_KEY)) {
    selectedLang.value = 'auto';
  } else {
    selectedLang.value = lang;
  }
  debugLang('applyLanguage:done', {
    selectedLang: selectedLang.value,
    i18nextLanguage: i18next.language,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
  });
}

function onLanguageModelUpdate(value: string | null | undefined) {
  const next = value ?? 'auto';
  debugLang('select:update:model-value', { raw: value, normalized: next });
  void applyLanguage(next);
}

watch(selectedLang, (lang, prev) => {
  debugLang('watch:selectedLang', { prev, lang });
});

i18next.on('languageChanged', () => {
  const stored = localStorage.getItem(LANG_PREFERENCE_KEY);
  debugLang('i18next:languageChanged', {
    i18nextLanguage: i18next.language,
    storedPreference: stored,
  });
  if (!stored) {
    selectedLang.value = 'auto';
  }
});
</script>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.6rem 1.5rem;
  background: #13181f;
  border-bottom: 1px solid #8a6e2e;
  flex-shrink: 0;
}
.nav-logo {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #c8a84b;
  text-decoration: none;
  flex-shrink: 0;
}
.nav-links { display: flex; align-items: center; gap: 0.25rem; }
.nav-link {
  padding: 0.3rem 0.75rem;
  border-radius: 3px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  color: #5b6f8e;
  border: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.nav-link:hover,
.nav-link.router-link-active { color: #c8a84b; border-color: #8a6e2e; }
.nav-actions { display: flex; align-items: center; gap: 0.75rem; margin-left: auto; }
.lang-select { width: 13rem; }

@media (max-width: 1200px) {
  .app-nav {
    flex-wrap: wrap;
    row-gap: 0.75rem;
  }
  .nav-actions {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}

@media (max-width: 900px) {
  .app-nav {
    gap: 0.75rem;
    padding: 0.6rem 1rem;
  }
  .nav-links {
    order: 3;
    width: 100%;
    flex-wrap: wrap;
  }
  .nav-actions {
    order: 2;
  }
  .lang-select {
    width: 10rem;
  }
}
</style>
