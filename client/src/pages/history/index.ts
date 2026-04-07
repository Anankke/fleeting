import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import HistoryPage from './HistoryPage.vue';

const app = createApp(HistoryPage);
app.use(PrimeVue, { theme: { preset: Aura } });
app.use(ToastService);
app.mount('#app');
