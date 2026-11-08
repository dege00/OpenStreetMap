<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { seedData } from '../data'
import { state } from '../state'

const TYPES = {
  olt: { label: 'OLT', color: '#6d28d9' },
  cto: { label: 'CTO', color: '#0e7c86' },
  ceo: { label: 'CEO', color: '#d97706' },
  pole: { label: 'Poste', color: '#64748b' },
  tower: { label: 'Torre', color: '#111827' },
  customer: { label: 'Cliente', color: '#be185d' },
  cable: { label: 'Cabo', color: '#dc2626' },
}

const mapEl = ref(null)
let map

const items = reactive({
  olt: seedData.olt,
  cto: seedData.cto,
  ceo: seedData.ceo,
  pole: seedData.pole,
  tower: seedData.tower,
  customer: seedData.customer,
  cable: seedData.cable,
})

const counts = computed(() => Object.fromEntries(Object.keys(TYPES).map((t) => [t, items[t].length])))

onMounted(() => {
  const s = state.settings
  map = L.map(mapEl.value, { zoomControl: false, maxZoom: 21 }).setView([s.map_lat, s.map_lng], s.map_zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  for (const c of items.cable) {
    L.polyline(c.path, { color: c.color, weight: c.weight }).addTo(map)
  }

  const pts = []
  for (const t of ['olt', 'cto', 'ceo', 'pole', 'tower', 'customer']) {
    for (const it of items[t]) {
      if (it.latitude == null) continue
      pts.push([it.latitude, it.longitude])
      L.circleMarker([it.latitude, it.longitude], {
        radius: 7,
        color: TYPES[t].color,
        fillColor: TYPES[t].color,
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(`<b>${TYPES[t].label}: ${it.name}</b>`)
    }
  }

  if (pts.length) map.fitBounds(L.latLngBounds(pts), { maxZoom: 16, padding: [50, 50] })
})

onBeforeUnmount(() => {
  if (map) map.remove()
})
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <strong>{{ state.branding.company_name }}</strong>
        <span>Mapa FTTH</span>
      </div>
    </header>

    <div class="body">
      <aside class="tools">
        <h2>Camadas</h2>
        <label v-for="(T, t) in TYPES" :key="t" class="layer">
          <span class="dot" :style="{ background: T.color }"></span>
          {{ T.label }}
          <small>{{ counts[t] }}</small>
        </label>
      </aside>

      <main class="mapwrap">
        <div ref="mapEl" class="map"></div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.top { background: var(--ink); color: #fff; display: flex; align-items: center; gap: 16px; padding: 0 14px; height: 52px; flex: none; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 17px; }
.brand span { font-size: 13px; color: #aab8c8; }
.body { flex: 1; display: flex; min-height: 0; }
.tools { width: 190px; flex: none; background: #fff; border-right: 1px solid var(--line); padding: 8px 12px; overflow: auto; }
.tools h2 { font-size: 12px; font-weight: 600; color: var(--muted); margin: 16px 0 6px; }
.layer { display: flex; align-items: center; gap: 8px; margin: 0; padding: 4px 0; color: var(--ink); font-size: 13px; }
.layer small { margin-left: auto; color: var(--muted); }
.dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.mapwrap { flex: 1; position: relative; min-width: 0; }
.map { position: absolute; inset: 0; }
</style>
