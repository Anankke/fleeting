/**
 * src/i18n.ts
 *
 * Initialises i18next with the Tolgee bridge.
 *
 * Translation namespaces:
 *   translation — Human-translated UI strings (src/locales/<lang>.json)
 *                 These are the only files intended for translators / Tolgee.
 *   sde         — EVE Online entity names auto-generated from CCP SDE (src/sde/sde.<lang>.json)
 *                 These are NOT translator-managed and are excluded from Tolgee staticData.
 */

import i18next from 'i18next';
import I18NextVue from 'i18next-vue';
import LanguageDetector from 'i18next-browser-languagedetector';
import { withTolgee, Tolgee, I18nextPlugin, DevTools } from '@tolgee/i18next';
import enTranslation from './locales/en.json';
import zhTranslation from './locales/zh.json';
import sdeEn from './sde/sde.en.json';
import sdeDe from './sde/sde.de.json';
import sdeFr from './sde/sde.fr.json';
import sdeJa from './sde/sde.ja.json';
import sdeKo from './sde/sde.ko.json';
import sdeRu from './sde/sde.ru.json';
import sdeZh from './sde/sde.zh.json';

export const SUPPORTED_LANGS = ['en', 'de', 'fr', 'ja', 'ko', 'ru', 'zh'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];
export const LANG_PREFERENCE_KEY = 'peldLang';
const DEBUG_I18N = true;

function debugI18n(...args: unknown[]) {
  if (!DEBUG_I18N) return;
  console.info('[i18n-debug]', ...args);
}

const appEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const tolgeeApiUrl = appEnv.PUBLIC_TOLGEE_API_URL?.trim();
const tolgeeApiKey = appEnv.PUBLIC_TOLGEE_API_KEY?.trim();

function readSavedLanguagePreference(): SupportedLang | undefined {
  const saved = localStorage.getItem(LANG_PREFERENCE_KEY)?.split('-')[0].toLowerCase();
  debugI18n('readSavedLanguagePreference', {
    rawSaved: localStorage.getItem(LANG_PREFERENCE_KEY),
    normalizedSaved: saved,
  });
  if (!saved) return undefined;
  return (SUPPORTED_LANGS as readonly string[]).includes(saved) ? (saved as SupportedLang) : undefined;
}

const tolgee = Tolgee()
  .use(DevTools())        // tree-shaken in production builds
  .use(I18nextPlugin())
  .init({
    staticData: {
      // Static resources are bundled with the app JS. Placeholder languages stay
      // as empty objects so Tolgee can still resolve without a backend.
      'en:translation': enTranslation,
      'de:translation': {},
      'fr:translation': {},
      'ja:translation': {},
      'ko:translation': {},
      'ru:translation': {},
      'zh:translation': zhTranslation,
    },
    ns: ['translation'],
    defaultNs: 'translation',
    availableLanguages: [...SUPPORTED_LANGS],
    defaultLanguage: readSavedLanguagePreference() ?? 'en',
    fallbackLanguage: 'en',
    ...(tolgeeApiUrl && tolgeeApiKey ? { apiUrl: tolgeeApiUrl, apiKey: tolgeeApiKey } : {}),
  });

/**
 * Fully configured i18next instance.  Await this before mounting the Vue app
 * so that translations are ready on first render.
 */
export const i18nReady = withTolgee(i18next, tolgee)
  .use(LanguageDetector)
  .init({
    lng: readSavedLanguagePreference(),
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGS],
    load: 'languageOnly',
    // Both namespaces declared; SDE resources are loaded via i18next directly (not Tolgee).
    ns: ['translation', 'sde'],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: enTranslation, sde: sdeEn },
      de: { translation: enTranslation, sde: sdeDe },
      fr: { translation: enTranslation, sde: sdeFr },
      ja: { translation: enTranslation, sde: sdeJa },
      ko: { translation: enTranslation, sde: sdeKo },
      ru: { translation: enTranslation, sde: sdeRu },
      zh: { translation: zhTranslation, sde: sdeZh },
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_PREFERENCE_KEY,
      caches: [],
    },
  });

// ── Reactive language ref ─────────────────────────────────────────────────────
import { ref, watch } from 'vue';

/** Reactive language code, kept in sync with i18next. Use to drive UI and to change language. */
export const currentLanguage = ref<string>(i18next.language ?? 'en');

/** Change the active language (updates i18next + localStorage, triggers reactivity). */
export async function changeLanguage(lang: string) {
  debugI18n('changeLanguage:start', {
    requested: lang,
    beforeI18nextLanguage: i18next.language,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
    navigatorLanguage: navigator.language,
  });
  const target = lang === 'auto'
    ? (() => {
        localStorage.removeItem(LANG_PREFERENCE_KEY);
        const detected = navigator.language.split('-')[0];
        return (SUPPORTED_LANGS as readonly string[]).includes(detected) ? detected : 'en';
      })()
    : lang;

  if (lang !== 'auto') {
    localStorage.setItem(LANG_PREFERENCE_KEY, target);
  }
  debugI18n('changeLanguage:targetResolved', {
    requested: lang,
    target,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
  });

  // Preload ALL namespaces for the target language before switching.
  // This ensures the 'languageChanged' event only fires after translations
  // are already in the i18next store, avoiding the $t("") flash.
  await i18next.loadLanguages(target);
  await i18next.changeLanguage(target);
  currentLanguage.value = i18next.language ?? 'en';
  debugI18n('changeLanguage:done', {
    requested: lang,
    target,
    afterI18nextLanguage: i18next.language,
    currentLanguage: currentLanguage.value,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
  });
}

// Keep the ref in sync when i18next changes language externally (e.g. detector)
i18nReady.then(() => {
  currentLanguage.value = i18next.language ?? 'en';
  debugI18n('i18nReady:resolved', {
    i18nextLanguage: i18next.language,
    currentLanguage: currentLanguage.value,
    storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
  });
  i18next.on('languageChanged', (lng) => { currentLanguage.value = lng; });
  i18next.on('languageChanged', (lng) => {
    debugI18n('event:languageChanged', {
      lng,
      i18nextLanguage: i18next.language,
      storedPreference: localStorage.getItem(LANG_PREFERENCE_KEY),
    });
  });
});

export { I18NextVue };
export default i18next;
