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
  background: #0d0f14;
}
.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  padding: 3rem;
  background: #13181f;
  border-radius: 4px;
  border: 1px solid #8a6e2e;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.7);
  color: #cfd9ee;
  text-align: center;
}
h1 { margin: 0; font-size: 2.2rem; letter-spacing: 3px; text-transform: uppercase; color: #c8a84b; }
p  { margin: 0; color: #5b6f8e; font-size: 0.9rem; letter-spacing: 0.04em; }
</style>
