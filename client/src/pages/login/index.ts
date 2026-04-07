import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import LoginPage from './LoginPage.vue';

const app = createApp(LoginPage);
app.use(PrimeVue, { theme: { preset: Aura } });
app.mount('#app');
