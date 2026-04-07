import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import CommanderDashboard from './CommanderDashboard.vue';

const app = createApp(CommanderDashboard);
app.use(PrimeVue, { theme: { preset: Aura } });
app.use(ToastService);
app.mount('#app');
