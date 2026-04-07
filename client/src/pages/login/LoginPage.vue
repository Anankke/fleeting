<template>
  <div class="login-page">
    <div class="login-card">
      <h1>PELD Online</h1>
      <p>Fleet combat analytics for EVE Online</p>
      <Button label="Login with EVE SSO" icon="pi pi-sign-in" size="large" @click="login" />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';

function login() {
  window.location.href = '/auth/login';
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #0a0e1a;
}
.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 3rem;
  background: #141928;
  border-radius: 12px;
  border: 1px solid #2a3050;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #e0e8ff;
  text-align: center;
}
h1 { margin: 0; font-size: 2.5rem; letter-spacing: 2px; }
p  { margin: 0; color: #8a9cc0; }
</style>
