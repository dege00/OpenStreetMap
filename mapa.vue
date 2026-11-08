<template>
  <div class="app">
    <h1>Meu mapa ai kkk</h1>
    <p>Clique no mapa pra pegar as coordenada 👇</p>

    <div ref="mapaEl" class="mapa"></div>

    <div class="info" v-if="lat">
      <p><b>Lat:</b> {{ lat }}</p>
      <p><b>Lng:</b> {{ lng }}</p>
    </div>
    <div class="info" v-else>
      <p>clica ai q aparece as coord kkk</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const mapaEl = ref(null)
const lat = ref(null)
const lng = ref(null)

onMounted(() => {
  // aq eu crio o mapa (peguei a api do openstreetmap msm)
  const mapa = L.map(mapaEl.value).setView([-23.55, -46.63], 12)

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa)

  // qndo clica eu salvo o lugar
  mapa.on('click', (e) => {
    lat.value = e.latlng.lat.toFixed(6)
    lng.value = e.latlng.lng.toFixed(6)
  })
})
</script>

<style scoped>
.app {
  font-family: Arial, sans-serif;
  text-align: center;
  padding: 10px;
}
.mapa {
  height: 400px;
  width: 100%;
  border-radius: 10px;
}
.info {
  margin-top: 10px;
  font-size: 15px;
}
</style>
