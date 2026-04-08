import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import ToastService from 'primevue/toastservice';
import 'primeicons/primeicons.css';
import router from './router';
import App from './App.vue';
import { i18nReady, I18NextVue } from './i18n';
import i18next from 'i18next';

// Wait for i18next + Tolgee to initialise before mounting so the first render
// already has translations (avoids a flash of untranslated content).
await i18nReady;

const app = createApp(App);
app.use(router);
app.use(PrimeVue, { theme: { preset: Aura } });
app.use(ToastService);
app.use(I18NextVue, { i18next });
app.mount('#app');
