import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import PilotDashboard from './PilotDashboard.vue';

const app = createApp(PilotDashboard);
app.use(PrimeVue, { theme: { preset: Aura } });
app.use(ToastService);
app.mount('#app');
