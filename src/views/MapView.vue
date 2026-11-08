<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api, { errText } from '../api'
import { state, formatDist } from '../state'
import { ICONS } from '../icons'
import CableStyle from '../components/CableStyle.vue'
import { pathLengthM } from '../data'

const STATUS = [['active', 'Ativo'], ['planned', 'Planejado'], ['maintenance', 'Em manutenção'], ['inactive', 'Inativo']]
const TYPES = {
  olt: { label: 'OLT', plural: 'olts', color: '#6d28d9', size: 30, geo: true, fields: [{ k: 'name', l: 'Nome' }] },
  cto: { label: 'CTO', plural: 'ctos', color: '#0e7c86', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'capacity', l: 'Portas', t: 'number' }, { k: 'splitter', l: 'Splitter' },
    { k: 'olt', l: 'OLT', t: 'ref', ref: 'olt', nullable: true }, { k: 'pon_port', l: 'Porta PON' }, { k: 'address', l: 'Endereço' }] },
  ceo: { label: 'CEO', plural: 'ceos', color: '#d97706', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'model', l: 'Modelo' }, { k: 'fiber_capacity', l: 'Capacidade (fibras)', t: 'number' }] },
  pole: { label: 'Poste', plural: 'poles', color: '#64748b', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'code', l: 'Código' }, { k: 'material', l: 'Material' }, { k: 'height_m', l: 'Altura (m)', t: 'number', nullable: true }] },
  tower: { label: 'Torre', plural: 'towers', color: '#111827', size: 46, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'address', l: 'Endereço' }, { k: 'height_m', l: 'Altura (m)', t: 'number', nullable: true }] },
  customer: { label: 'Cliente', plural: 'customers', color: '#be185d', size: 28, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'document', l: 'CPF/CNPJ' }, { k: 'phone', l: 'Telefone' },
    { k: 'address', l: 'Endereço' }, { k: 'plan', l: 'Plano' },
    { k: 'cto', l: 'CTO', t: 'ref', ref: 'cto', nullable: true }, { k: 'port', l: 'Porta na CTO', t: 'number', nullable: true }] },
  cable: { label: 'Cabo', plural: 'cables', color: '#dc2626', geo: false, fields: [
    { k: 'name', l: 'Nome' },
    { k: 'cable_type', l: 'Tipo', t: 'select', opts: [['aerial', 'Aéreo'], ['underground', 'Subterrâneo'], ['backbone', 'Backbone'], ['drop', 'Drop']] },
    { k: 'fiber_count', l: 'Fibras', t: 'number' }] },
}
const CABLE_TYPES = { aerial: 'Aéreo', underground: 'Subterrâneo', backbone: 'Backbone', drop: 'Drop' }
const ADD_ORDER = ['olt', 'cto', 'ceo', 'pole', 'tower']
const DEFAULT_CABLE_COLOR = '#dc2626'
const DEFAULT_CABLE_WEIGHT = 4

const mapEl = ref(null)
let map
let groups = {}
let markers = {}
let drawLine
let drawDots = []

const items = reactive({ olt: [], cto: [], ceo: [], pole: [], tower: [], customer: [], cable: [] })
const visible = reactive({ olt: true, cto: true, ceo: true, pole: true, tower: true, customer: true, cable: true })
const mode = ref('select')
const panel = ref(null)
const panelError = ref('')
const saving = ref(false)
const drawPts = ref([])
const redoStack = ref([])
const q = ref('')
const showResults = ref(false)

const canEdit = computed(() => state.user && state.user.role !== 'viewer')
const counts = computed(() => Object.fromEntries(Object.keys(TYPES).map((t) => [t, items[t].length])))
const totalCable = computed(() => items.cable.reduce((a, c) => a + (c.length_m || 0), 0))
const drawDist = computed(() => pathLengthM(drawPts.value))
const panelCableLen = computed(() => (panel.value?.type === 'cable' ? pathLengthM(panel.value.form.path || []) : 0))
const results = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (s.length < 2) return []
  const out = []
  for (const t of Object.keys(TYPES)) {
    for (const it of items[t]) {
      const hay = [it.name, it.address, it.observation, it.code, it.plan].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(s)) continue
      out.push({ type: t, id: it.id, name: it.name, subtitle: TYPES[t].label + (it.address ? ' - ' + it.address : ''), item: it })
      if (out.length >= 20) return out
    }
  }
  return out
})

function ctoFree(cto) {
  const used = items.customer.filter((c) => c.cto === cto.id).length
  return Math.max(0, (Number(cto.capacity) || 0) - used)
}

function makeIcon(t, it) {
  const dim = it.status === 'inactive' ? ' dim' : it.status === 'planned' ? ' plan' : ''
  const free = t === 'cto' ? ctoFree(it) : null
  const full = t === 'cto' && free === 0 ? ' full' : ''
  const badge = t === 'cto' ? `<i class="bd">${free}</i>` : ''
  const size = TYPES[t].size || 30
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="mk${dim}${full}" style="--c:${TYPES[t].color}"><span class="ic">${ICONS[t]}</span>${badge}</div>`,
  })
}

function renderAll() {
  markers = {}
  for (const t of Object.keys(TYPES)) {
    if (!groups[t]) continue
    groups[t].clearLayers()
    for (const it of items[t]) {
      if (t === 'cable') {
        const line = L.polyline(it.path || [], {
          color: it.color || DEFAULT_CABLE_COLOR,
          weight: Number(it.weight) || DEFAULT_CABLE_WEIGHT,
          opacity: it.status === 'inactive' ? 0.4 : 0.95,
          dashArray: it.status === 'planned' ? '8 6' : null,
        }).addTo(groups[t])
        line.bindTooltip(`${it.name} - ${formatDist(it.length_m)} - ${it.fiber_count} FO`)
        line.on('click', () => openPanel('cable', it))
        continue
      }
      if (it.latitude == null) continue
      const m = L.marker([it.latitude, it.longitude], { icon: makeIcon(t, it), draggable: !!canEdit.value }).addTo(groups[t])
      const tip = t === 'cto' ? `${it.name} - ${ctoFree(it)} livres de ${it.capacity}` : it.name
      m.bindTooltip(tip)
      m.on('click', () => openPanel(t, it))
      m.on('dragend', async () => {
        const ll = m.getLatLng()
        try {
          const { data } = await api.patch(`/${TYPES[t].plural}/${it.id}/`, {
            latitude: +ll.lat.toFixed(7),
            longitude: +ll.lng.toFixed(7),
          })
          Object.assign(it, data)
        } catch (e) {
          alert(errText(e))
          renderAll()
        }
      })
      markers[t + it.id] = m
    }
  }
}

async function loadAll() {
  await Promise.all(Object.keys(TYPES).map(async (t) => {
    items[t] = (await api.get(`/${TYPES[t].plural}/`)).data
  }))
  renderAll()
}

/* ---------- painel ---------- */
function openPanel(t, it, preset) {
  panelError.value = ''
  if (it) {
    panel.value = { type: t, id: it.id, form: JSON.parse(JSON.stringify(it)) }
  } else {
    const form = { name: '', status: 'active', observation: '', ...preset }
    TYPES[t].fields.forEach((f) => {
      if (!(f.k in form)) form[f.k] = f.t === 'number' ? '' : f.k === 'cable_type' ? 'aerial' : f.t === 'ref' ? null : ''
    })
    if (t === 'cable') {
      form.color = form.color || DEFAULT_CABLE_COLOR
      form.weight = form.weight || DEFAULT_CABLE_WEIGHT
      form.path = form.path || []
    }
    panel.value = { type: t, id: null, form }
  }
}
function closePanel() {
  panel.value = null
  panelError.value = ''
}
function cleanPayload(t, form) {
  const out = { ...form }
  for (const f of TYPES[t].fields) {
    if (f.t === 'number') {
      if (out[f.k] === '' || out[f.k] === null) {
        if (f.nullable) out[f.k] = null
        else delete out[f.k]
      } else out[f.k] = Number(out[f.k])
    } else if (f.nullable && out[f.k] === '') out[f.k] = null
  }
  if (t === 'cable') out.weight = Number(out.weight) || DEFAULT_CABLE_WEIGHT
  return out
}
async function save() {
  const p = panel.value
  if (!p) return
  const { type: t, id, form } = p
  saving.value = true
  panelError.value = ''
  try {
    const body = cleanPayload(t, form)
    const { data } = id ? await api.put(`/${TYPES[t].plural}/${id}/`, body) : await api.post(`/${TYPES[t].plural}/`, body)
    const list = items[t]
    const i = list.findIndex((x) => x.id === data.id)
    if (i >= 0) list[i] = data
    else list.push(data)
    panel.value = { type: t, id: data.id, form: JSON.parse(JSON.stringify(data)) }
    renderAll()
  } catch (e) {
    panelError.value = errText(e)
  } finally {
    saving.value = false
  }
}
async function remove() {
  const p = panel.value
  if (!p || !p.id) return
  if (!confirm(`Excluir ${p.form.name || 'este item'}? Esta ação não pode ser desfeita.`)) return
  try {
    await api.delete(`/${TYPES[p.type].plural}/${p.id}/`)
    items[p.type] = items[p.type].filter((x) => x.id !== p.id)
    closePanel()
    renderAll()
  } catch (e) {
    panelError.value = errText(e)
  }
}
const refOptions = (k) => (k === 'olt' ? items.olt : items.cto)

function pick(r) {
  showResults.value = false
  if (r.type === 'cable') {
    if (r.item.path?.length) map.fitBounds(L.latLngBounds(r.item.path), { maxZoom: 19, padding: [60, 60] })
  } else if (r.item.latitude != null) {
    map.flyTo([r.item.latitude, r.item.longitude], Math.max(map.getZoom(), 18))
  }
  openPanel(r.type, r.item)
}

/* ---------- modos / desenho ---------- */
function setMode(m) {
  cancelDraw()
  mode.value = mode.value === m ? 'select' : m
  map.getContainer().style.cursor = mode.value === 'select' ? '' : 'crosshair'
}
function onMapClick(e) {
  if (mode.value.startsWith('add:')) {
    const t = mode.value.slice(4)
    openPanel(t, null, { latitude: +e.latlng.lat.toFixed(7), longitude: +e.latlng.lng.toFixed(7) })
    mode.value = 'select'
    map.getContainer().style.cursor = ''
  } else if (mode.value === 'measure') {
    drawPts.value.push([e.latlng.lat, e.latlng.lng])
    redrawDraw()
  }
}
function styleDrawLine() {
  if (drawLine) drawLine.setStyle({ color: '#f59e0b', weight: 3, dashArray: '6 6' })
}
function redrawDraw() {
  if (!drawLine) return
  drawLine.setLatLngs(drawPts.value)
  drawDots.forEach((d) => d.remove())
  drawDots = drawPts.value.map((p) => L.circleMarker(p, { radius: 4, color: '#f59e0b', fillOpacity: 1 }).addTo(map))
}
function undoDraw() {
  if (!drawPts.value.length) return
  redoStack.value.push(drawPts.value.pop())
  redrawDraw()
}
function redoDraw() {
  const r = redoStack.value.pop()
  if (!r) return
  drawPts.value.push(r)
  redrawDraw()
}
function cancelDraw() {
  redoStack.value = []
  drawPts.value = []
  if (drawLine) redrawDraw()
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    showResults.value = false
    if (panel.value) closePanel()
    if (mode.value !== 'select') {
      cancelDraw()
      mode.value = 'select'
      map.getContainer().style.cursor = ''
    }
  }
}

watch(
  visible,
  (v) => {
    for (const t in v) {
      if (v[t]) map.addLayer(groups[t])
      else map.removeLayer(groups[t])
    }
  },
  { deep: true },
)

onMounted(async () => {
  const s = state.settings
  map = L.map(mapEl.value, { zoomControl: false, maxZoom: 21 }).setView([s.map_lat, s.map_lng], s.map_zoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

  for (const t in TYPES) groups[t] = L.layerGroup().addTo(map)
  drawLine = L.polyline([], { color: '#f59e0b', weight: 3, dashArray: '6 6' }).addTo(map)
  map.on('click', onMapClick)
  window.addEventListener('keydown', onKeydown)

  try {
    await loadAll()
  } catch (e) {
    alert(errText(e))
  }

  const pts = [...items.cto, ...items.olt, ...items.ceo].map((x) => [x.latitude, x.longitude])
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { maxZoom: 17, padding: [60, 60] })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
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
      <div class="search">
        <input
          v-model="q"
          placeholder="Buscar CTO, cliente, cabo ou observação..."
          @focus="showResults = true"
          @keydown.esc="showResults = false"
          aria-label="Buscar"
        />
        <ul v-if="showResults && q.trim().length >= 2" class="results">
          <li v-if="!results.length" class="muted empty">Nada encontrado para "{{ q }}".</li>
          <li v-for="r in results" :key="r.type + r.id" @click="pick(r)">
            <b>{{ r.name }}</b><small>{{ r.subtitle }}</small>
          </li>
        </ul>
      </div>
      <nav>
        <span class="muted who">{{ state.user?.username }}</span>
        <router-link class="btn ghost" to="/settings">Configurações</router-link>
      </nav>
    </header>

    <div class="body" @click="showResults = false">
      <aside class="tools">
        <template v-if="canEdit">
          <h2>Adicionar</h2>
          <button v-for="t in ADD_ORDER" :key="t" class="tool" :class="{ on: mode === 'add:' + t }" @click="setMode('add:' + t)">
            <span class="ti" :style="{ color: TYPES[t].color }" v-html="ICONS[t]"></span>{{ TYPES[t].label }}
          </button>
        </template>
        <h2>Ferramentas</h2>
        <button class="tool" :class="{ on: mode === 'select' }" @click="setMode('select')">Selecionar</button>
        <button class="tool" :class="{ on: mode === 'measure' }" @click="setMode('measure')">
          <span class="ti" v-html="ICONS.ruler"></span>Régua
        </button>
        <h2>Camadas</h2>
        <label v-for="(T, t) in TYPES" :key="t" class="layer">
          <input type="checkbox" v-model="visible[t]" />
          <span class="ti" :style="{ color: T.color }" v-html="ICONS[t]"></span>
          {{ T.label }}
          <small>{{ counts[t] }}</small>
        </label>
        <h2>Rede</h2>
        <div v-for="(l, k) in CABLE_TYPES" :key="k" class="layer"><span class="cline"></span>{{ l }}</div>
        <p class="muted total">Rede de cabos: <b>{{ formatDist(totalCable) }}</b></p>
      </aside>

      <main class="mapwrap">
        <div ref="mapEl" class="map"></div>
        <div v-if="mode === 'measure'" class="drawbar">
          <span>Distância: <b>{{ formatDist(drawDist) }}</b> - {{ drawPts.length }} pontos</span>
          <button class="btn" @click="undoDraw" :disabled="!drawPts.length">Desfazer</button>
          <button class="btn" @click="redoDraw" :disabled="!redoStack.length">Refazer</button>
          <button class="btn" @click="setMode('select')">Cancelar</button>
        </div>
      </main>

      <aside v-if="panel" class="panel" @click.stop>
        <div class="phead">
          <h3>{{ panel.id ? 'Editar' : 'Novo' }} {{ TYPES[panel.type].label }}</h3>
          <button class="btn ghost" @click="closePanel" aria-label="Fechar">x</button>
        </div>
        <fieldset :disabled="!canEdit" class="fs">
          <template v-for="f in TYPES[panel.type].fields" :key="f.k">
            <label :for="'f_' + f.k">{{ f.l }}</label>
            <select v-if="f.t === 'select'" :id="'f_' + f.k" v-model="panel.form[f.k]">
              <option v-for="o in f.opts" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
            </select>
            <select v-else-if="f.t === 'ref'" :id="'f_' + f.k" v-model="panel.form[f.k]">
              <option :value="null">- nenhuma -</option>
              <option v-for="o in refOptions(f.ref)" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
            <input v-else :id="'f_' + f.k" v-model="panel.form[f.k]" :type="f.t === 'number' ? 'number' : 'text'" step="any" />
          </template>

          <template v-if="panel.type !== 'olt'">
            <label for="f_status">Status</label>
            <select id="f_status" v-model="panel.form.status">
              <option v-for="s in STATUS" :key="s[0]" :value="s[0]">{{ s[1] }}</option>
            </select>
          </template>

          <template v-if="TYPES[panel.type].geo">
            <div class="two">
              <div><label>Latitude</label><input v-model="panel.form.latitude" type="number" step="any" /></div>
              <div><label>Longitude</label><input v-model="panel.form.longitude" type="number" step="any" /></div>
            </div>
          </template>

          <template v-if="panel.type === 'cable'">
            <CableStyle v-model:color="panel.form.color" v-model:weight="panel.form.weight" />
            <p class="len">Comprimento: <b>{{ formatDist(panelCableLen) }}</b> <small class="muted">({{ panel.form.path.length }} pontos)</small></p>
          </template>

          <label for="f_obs">Observação</label>
          <textarea id="f_obs" v-model="panel.form.observation" rows="4"></textarea>
        </fieldset>
        <p v-if="panelError" class="err" role="alert">{{ panelError }}</p>
        <div v-if="canEdit" class="actions">
          <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Salvando...' : 'Salvar alterações' }}</button>
          <button v-if="panel.id" class="btn danger" @click="remove">Excluir</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style>
.mk {
  position: relative;
  width: 100%;
  height: 100%;
  color: var(--c);
  display: grid;
  place-items: center;
  filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 1px 1.5px rgba(0, 0, 0, .35));
}
.mk .ic { width: 100%; height: 100%; display: grid; place-items: center; }
.mk .ic svg { width: 100%; height: 100%; }
.mk .ic img { width: 100%; height: 100%; object-fit: contain; }
.mk .bd {
  position: absolute; top: -6px; right: -8px; min-width: 16px; height: 16px; padding: 0 3px;
  border-radius: 50%; background: var(--c); color: #fff; font-size: 10px; font-style: normal;
  font-weight: 700; line-height: 1; display: grid; place-items: center;
}
.mk.dim { opacity: .5; }
.mk.plan { opacity: .75; }
.mk.full { color: #b91c1c; }
.mk.full .bd { background: #b91c1c; }
</style>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.top { background: var(--ink); color: #fff; display: flex; align-items: center; gap: 16px; padding: 0 14px; height: 52px; flex: none; }
.brand { display: flex; align-items: center; gap: 10px; font-size: 17px; min-width: 130px; }
.brand span { font-size: 13px; color: #aab8c8; }
.search { position: relative; flex: 1; max-width: 560px; }
.search input { background: var(--ink-2); border-color: #2c4560; color: #fff; }
.search input::placeholder { color: #8ea1b6; }
.results { position: absolute; top: 40px; left: 0; right: 0; background: #fff; color: var(--ink); list-style: none; margin: 0; padding: 4px 0;
  border-radius: var(--radius); max-height: 60vh; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,.3); z-index: 2000; }
.results li { padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; }
.results li:hover { background: #eef3f6; }
.results small, .empty { color: var(--muted); }
.empty { padding: 10px 12px; cursor: default; }
nav { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.who { color: #aab8c8; margin-right: 6px; }
.btn.ghost { background: transparent; border-color: transparent; color: inherit; }
.body { flex: 1; display: flex; min-height: 0; }
.tools { width: 190px; flex: none; background: #fff; border-right: 1px solid var(--line); padding: 8px 12px; overflow: auto; }
.tools h2 { font-size: 12px; font-weight: 600; color: var(--muted); margin: 16px 0 6px; }
.tool { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; margin-bottom: 3px; background: none; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; text-align: left; }
.tool:hover { background: var(--paper); }
.tool.on { background: color-mix(in srgb, var(--primary) 14%, white); border-color: var(--primary); }
.layer { display: flex; align-items: center; gap: 8px; margin: 0; padding: 4px 0; color: var(--ink); font-size: 13px; }
.layer input { width: auto; }
.layer small { margin-left: auto; color: var(--muted); }
.cline { width: 18px; height: 3px; background: var(--primary); border-radius: 2px; flex: none; }
.ti { width: 18px; height: 18px; display: inline-block; flex: none; }
.ti :deep(svg) { width: 100%; height: 100%; }
.ti :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.total { margin-top: 6px; font-size: 12px; }
.mapwrap { flex: 1; position: relative; min-width: 0; }
.map { position: absolute; inset: 0; }
.drawbar { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fff; padding: 10px 14px;
  border-radius: 8px; display: flex; gap: 8px; align-items: center; box-shadow: 0 4px 16px rgba(0,0,0,.25); flex-wrap: wrap; }
.panel { width: 330px; flex: none; background: #fff; border-left: 1px solid var(--line); padding: 12px 16px 20px; overflow: auto; }
.phead { display: flex; align-items: center; justify-content: space-between; }
.phead h3 { margin: 0; font-size: 16px; }
.fs { border: 0; padding: 0; margin: 0; min-width: 0; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.len { margin: 14px 0 8px; }
.small { font-size: 12px; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
.actions .primary { flex: 1; }
@media (max-width: 800px) {
  .tools { width: 120px; padding: 6px; }
  .search { max-width: none; }
  .who { display: none; }
  .panel { position: absolute; right: 0; bottom: 0; top: 52px; width: min(330px, 92vw); z-index: 1500; }
}
</style>
