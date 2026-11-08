<script setup>
import { state } from '../state'
</script>

<template>
  <div class="wrap">
    <h1>Configuracoes</h1>
    <p>Empresa: <b>{{ state.branding.company_name }}</b></p>
    <p>Unidade de distancia: <b>{{ state.settings.distance_unit }}</b></p>
    <router-link to="/">Voltar ao mapa</router-link>
  </div>
</template>

<style scoped>
.wrap { max-width: 640px; margin: 40px auto; padding: 0 16px; }
</style>
