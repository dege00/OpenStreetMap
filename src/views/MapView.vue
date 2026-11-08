<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api, { logout, errText } from '../api'
import { state, formatDist } from '../state'
import { ICONS } from '../icons'
import CableStyle from '../components/CableStyle.vue'

const router = useRouter()

const STATUS = [['active', 'Ativo'], ['planned', 'Planejado'], ['maintenance', 'Em manutenção'], ['inactive', 'Inativo']]
const TYPES = {
  olt: { label: 'OLT', plural: 'olts', color: '#6d28d9', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }] },
  cto: { label: 'CTO', plural: 'ctos', color: '#0e7c86', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'capacity', l: 'Portas', t: 'number' }, { k: 'splitter', l: 'Splitter' },
    { k: 'olt', l: 'OLT', t: 'ref', ref: 'olt', nullable: true }, { k: 'pon_port', l: 'Porta PON' },
    { k: 'address', l: 'Endereço' }] },
  ceo: { label: 'CEO', plural: 'ceos', color: '#d97706', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'model', l: 'Modelo' }, { k: 'fiber_capacity', l: 'Capacidade (fibras)', t: 'number' }] },
  pole: { label: 'Poste', plural: 'poles', color: '#64748b', size: 30, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'code', l: 'Código' }, { k: 'material', l: 'Material' },
    { k: 'height_m', l: 'Altura (m)', t: 'number', nullable: true }] },
  tower: { label: 'Torre', plural: 'towers', color: '#111827', size: 46, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'address', l: 'Endereço' },
    { k: 'height_m', l: 'Altura (m)', t: 'number', nullable: true }] },
  customer: { label: 'Cliente', plural: 'customers', color: '#be185d', size: 28, geo: true, fields: [
    { k: 'name', l: 'Nome' }, { k: 'document', l: 'CPF/CNPJ' }, { k: 'phone', l: 'Telefone' },
    { k: 'address', l: 'Endereço' }, { k: 'plan', l: 'Plano' },
    { k: 'cto', l: 'CTO', t: 'ref', ref: 'cto', nullable: true }, { k: 'port', l: 'Porta na CTO', t: 'number', nullable: true }] },
  cable: { label: 'Cabo', plural: 'cables', color: '#dc2626', geo: false, fields: [
    { k: 'name', l: 'Nome' },
    { k: 'cable_type', l: 'Tipo', t: 'select', opts: [['aerial', 'Aéreo'], ['underground', 'Subterrâneo'], ['backbone', 'Backbone'], ['drop', 'Drop']] },
    { k: 'fiber_count', l: 'Fibras', t: 'number' }] },
}
const DEFAULT_CABLE_COLOR = '#dc2626' // vermelho
const DEFAULT_CABLE_WEIGHT = 4
const SAT_MAX_ZOOM = 18 // acima deste zoom o satélite (Esri) costuma não ter imagem: troca para o mapa de ruas
const BOX_TYPES = ['olt', 'cto', 'ceo', 'pole', 'tower'] // elementos que podem ser ligados a um cabo
const ADD_ORDER = ['olt', 'cto', 'ceo', 'pole', 'tower']

const items = reactive({ olt: [], cto: [], ceo: [], pole: [], tower: [], customer: [], cable: [] })
const visible = reactive({ olt: true, cto: true, ceo: true, pole: true, tower: true, customer: true, cable: true })
const mode = ref('select') // select | add:<type> | cable | measure
const panel = ref(null)
const panelError = ref('')
const saving = ref(false)
const drawPts = ref([])
const drawNodes = ref([])
const redoStack = ref([])
const trecho = ref(null)
const trechoRedo = ref([])
const pathEdit = ref(false)
const dropCto = ref(null)
const ctoModal = ref(null)
const pendingDrop = ref(null)
const drawColor = ref(DEFAULT_CABLE_COLOR)
const drawWeight = ref(DEFAULT_CABLE_WEIGHT)
const baseNotice = ref('')
const q = ref('')
const results = ref([])
const showResults = ref(false)
const mapEl = ref(null)

let map, groups = {}, objs = {}, drawLine, drawDots = [], vertexMarkers = [], searchTimer, linkLayer, dropPreview
let cableHit = null, pendingAttach = null // cabo clicado (modo adicionar) / cabo ao qual o novo elemento será ligado
let baseOsm, baseSat, wantSat = false, noticeTimer // controle da troca automática satélite → ruas
let trechoLayer, visibleBackup = null, trechoVertices = []

const tipsOn = computed(() => mode.value === 'select' && !panel.value)
const canEdit = computed(() => state.user && state.user.role !== 'viewer')
const drawDist = computed(() => pathLength(drawPts.value))
const panelCableLen = computed(() => panel.value?.type === 'cable' ? pathLength(panel.value.form.path || []) : 0)
const trechoInfo = computed(() => trechoEnds())
const modeHint = computed(() => {
  if (mode.value === 'add:customer') {
    if (dropCto.value) return `Cliente ligado à ${dropCto.value.name} — clique no mapa para posicionar (Esc para trocar).`
    return 'Clique no mapa para posicionar o cliente, ou passe o mouse sobre uma CTO para ligá-lo a ela.'
  }
  if (mode.value === 'del:customer') return 'Clique em um cliente para removê-lo.'
  if (mode.value.startsWith('add:')) return `Clique no mapa para posicionar: ${TYPES[mode.value.slice(4)].label}`
  if (mode.value === 'cable') return 'Clique no mapa para traçar o cabo, ponto a ponto. Ctrl+Z desfaz o último ponto e Ctrl+Shift+Z refaz. Enter conclui o cabo.'
  if (mode.value === 'measure') return 'Régua: clique para medir distâncias (nada é salvo). Ctrl+Z desfaz o último ponto e Ctrl+Shift+Z refaz.'
  return ''
})

function pathLength(pts) {
  let t = 0
  for (let i = 1; i < pts.length; i++) t += L.latLng(pts[i - 1]).distanceTo(L.latLng(pts[i]))
  return t
}

function ctoFree(cto) {
  if (!cto) return 0
  return Math.max(0, (Number(cto.capacity) || 0) - (Number(cto.used_ports) || 0))
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const baseWeight = (c) => Number(c?.weight) || DEFAULT_CABLE_WEIGHT

function makeIcon(t, it) {
  const dim = it.status === 'inactive' ? ' dim' : it.status === 'planned' ? ' plan' : ''
  const free = t === 'cto' ? ctoFree(it) : null
  const full = t === 'cto' && free === 0 ? ' full' : ''
  const badge = t === 'cto' ? `<i class="bd">${free}</i>` : ''
  const size = TYPES[t].size || 30
  return L.divIcon({
    className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="mk${dim}${full}" style="--c:${TYPES[t].color}"><span class="ic">${ICONS[t]}</span>${badge}</div>`,
  })
}

function itemName(t, id) {
  return (items[t] || []).find((x) => x.id === id)?.name || `#${id}`
}
function sameNode(a, b) {
  return !!a && !!b && a.type === b.type && a.id === b.id
}
function connectedCables(t, id) {
  return items.cable.filter((c) => (c.nodes || []).some((n) => n.type === t && n.id === id))
}
// drop ligado a um cliente
function isCustomerDrop(c) {
  return c?.cable_type === 'drop' && (c.nodes || []).some((n) => n.type === 'customer')
}
// geometria exibida no mapa: drop de cliente = linha reta entre as pontas
function cableLine(c) {
  const p = c.path || []
  return isCustomerDrop(c) && p.length > 2 ? [p[0], p[p.length - 1]] : p
}

function position(t, it) {
  if (it.latitude != null && it.longitude != null) return [it.latitude, it.longitude]
  if (t === 'customer' && it.cto) {
    const c = items.cto.find((x) => x.id === it.cto)
    if (c) return [c.latitude + 0.00008, c.longitude + 0.00008]
  }
  return null
}

function renderItem(t, it) {
  if (t === 'cable') {
    const line = L.polyline(cableLine(it), { color: it.color || DEFAULT_CABLE_COLOR, weight: baseWeight(it), opacity: it.status === 'inactive' ? .4 : .95, dashArray: it.status === 'planned' ? '8 6' : null })
    line.bindTooltip(`${esc(it.name)} • ${esc(formatDist(it.length_m))} • ${esc(it.fiber_count)} FO`, { sticky: true })
    line.on('click', (e) => {
      // com ferramenta ativa (adicionar/traçar/medir/editar traçado) o clique segue para o mapa, sem abrir dados do cabo
      if (mode.value !== 'select' || pathEdit.value) { cableHit = it; setTimeout(() => { cableHit = null }, 0); return }
      L.DomEvent.stopPropagation(e)
      if (panel.value?.id && panel.value.type !== 'cable' && !isCustomerDrop(it)) {
        if (canEdit.value) attachToCable(panel.value.type, panel.value.id, it)
        return
      }
      openPanel('cable', it)
    })
    line.addTo(groups.cable); objs['cable' + it.id] = line
    return
  }
  const pos = position(t, it)
  if (!pos) return
  const m = L.marker(pos, { icon: makeIcon(t, it), draggable: !!canEdit.value })
  const size = TYPES[t].size || 30
  const tip = t === 'cto' ? `${it.name} • ${ctoFree(it)} livres de ${it.capacity}`
    : t === 'tower' ? `${it.name} • ${(it.radios || []).length} rádio(s)` : it.name
  m.bindTooltip(esc(tip), { direction: 'top', offset: [0, -size / 2] })
  if (t === 'cto') {
    m.on('mouseover', () => {
      if (mode.value !== 'add:customer') return
      if (dropCto.value && dropCto.value.id === it.id) return
      dropCto.value = it
      paintDropCto()
    })
  }
  m.on('click', (e) => {
    L.DomEvent.stopPropagation(e)
    if (mode.value === 'del:customer' && t === 'customer') { deleteItem('customer', it.id, it.name); return }
    if (mode.value === 'add:customer') { placeCustomer(m.getLatLng(), t === 'cto' ? it : null); return }
    if (mode.value === 'cable' || mode.value === 'measure') { addDrawPoint(m.getLatLng(), { type: t, id: it.id }); return }
    if (pathEdit.value && panel.value?.type === 'cable') { addEditPoint(m.getLatLng(), { type: t, id: it.id }); return }
    if (mode.value === 'select') openPanel(t, it)
  })
  m.on('dragend', async () => {
    const { lat, lng } = m.getLatLng()
    try {
      const { data } = await api.patch(`/${TYPES[t].plural}/${it.id}/`, { latitude: lat, longitude: lng })
      Object.assign(it, data)
      if (panel.value?.id === it.id && panel.value.type === t) { panel.value.form.latitude = lat; panel.value.form.longitude = lng }
      await syncCables(t, it.id, lat, lng)
    } catch (e) { alert(errText(e)); renderAll() }
  })
  m.addTo(groups[t]); objs[t + it.id] = m
}

function renderAll() {
  for (const t in TYPES) { groups[t].clearLayers(); items[t].forEach((it) => renderItem(t, it)) }
  highlight()
  paintDropCto()
}

function markNode(n) {
  const m = objs[n.type + n.id]
  const el = m && m.getElement && m.getElement()
  if (el && el.firstChild) el.firstChild.classList.add('hl')
}
function highlightCable(c) {
  const line = objs['cable' + c.id]
  if (line) { line.setStyle({ weight: baseWeight(c) + 4 }); line.bringToFront() }
  const nodes = c.nodes || []
  nodes.forEach((n) => markNode(n))
}
function link(c) {
  if (!linkLayer || !c || !c.cto) return
  const cto = items.cto.find((x) => x.id === c.cto)
  const cp = position('customer', c)
  const tp = cto && position('cto', cto)
  if (!cp || !tp) return
  L.polyline([tp, cp], { color: '#000', weight: 1.5, opacity: 0.9, interactive: false }).addTo(linkLayer)
}
function highlight() {
  if (!linkLayer) return
  if (trecho.value) { linkLayer.clearLayers(); return }
  linkLayer.clearLayers()
  items.cable.forEach((c) => { const l = objs['cable' + c.id]; if (l) l.setStyle({ color: c.color || DEFAULT_CABLE_COLOR, weight: baseWeight(c) }) })
  document.querySelectorAll('.mk.hl').forEach((el) => el.classList.remove('hl'))
  const p = panel.value
  if (!p || !p.id) return
  if (p.type === 'cable') {
    const line = objs['cable' + p.id]
    if (line) { line.setStyle({ color: p.form.color || DEFAULT_CABLE_COLOR, weight: baseWeight(p.form) + 4 }); line.bringToFront() }
    const nodes = p.form.nodes || []
    nodes.forEach((n) => markNode(n))
  } else if (p.type === 'cto') {
    connectedCables('cto', p.id).forEach((c) => highlightCable(c))
    items.customer.filter((c) => c.cto === p.id).forEach((c) => link(c))
  } else if (p.type === 'customer') {
    const c = items.customer.find((x) => x.id === p.id)
    if (c) link(c)
  } else {
    connectedCables(p.type, p.id).forEach((c) => highlightCable(c))
  }
}
function addDrawPoint(latlng, node) {
  const last = drawNodes.value[drawNodes.value.length - 1]
  if (node && sameNode(node, last)) return
  redoStack.value = []
  drawPts.value.push([latlng.lat, latlng.lng])
  drawNodes.value.push(node)
  redrawDraw()
}
function addEditPoint(latlng, node) {
  const p = panel.value
  if (!p || p.type !== 'cable') return
  p.form.path.push([latlng.lat, latlng.lng])
  if (node) {
    p.form.nodes = p.form.nodes || []
    p.form.nodes.push({ ...node, index: p.form.path.length - 1 })
  }
  rebuildVertices(); previewPath()
}
async function syncCables(t, id, lat, lng) {
  for (const c of connectedCables(t, id)) {
    const node = (c.nodes || []).find((n) => n.type === t && n.id === id)
    if (!node || node.index == null) continue
    const path = (c.path || []).map((p) => [p[0], p[1]])
    if (node.index < 0 || node.index >= path.length) continue
    path[node.index] = [lat, lng]
    try {
      const { data } = await api.patch(`/cables/${c.id}/`, { path })
      Object.assign(c, data)
    } catch (e) { alert(errText(e)) }
  }
  renderAll()
}

function nearestOnPath(path, lat, lng) {
  const P = map.project([lat, lng], 18)
  let best = null
  for (let i = 1; i < path.length; i++) {
    const A = map.project(path[i - 1], 18)
    const B = map.project(path[i], 18)
    const dx = B.x - A.x, dy = B.y - A.y
    const len2 = dx * dx + dy * dy
    let t = len2 ? ((P.x - A.x) * dx + (P.y - A.y) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    const Q = L.point(A.x + t * dx, A.y + t * dy)
    const d = P.distanceTo(Q)
    if (!best || d < best.dist) best = { dist: d, t, index: i, pt: Q }
  }
  return best
}
function snapToPath(path, latlng) {
  const near = nearestOnPath(path, latlng.lat, latlng.lng)
  return near ? map.unproject(near.pt, 18) : null
}
async function attachToCable(t, id, cable) {
  const item = (items[t] || []).find((x) => x.id === id)
  const pos = item && position(t, item)
  if (!pos) { panelError.value = 'Este item não tem coordenadas para ligar ao cabo.'; return }
  const path = (cable.path || []).map((p) => [p[0], p[1]])
  const nodes = (cable.nodes || []).map((n) => ({ ...n }))
  if (!nodes.some((n) => n.type === t && n.id === id)) {
    const ll = L.latLng(pos)
    let index = path.findIndex((p) => ll.distanceTo(L.latLng(p)) <= 0.5)
    if (index < 0) {
      const near = nearestOnPath(path, pos[0], pos[1])
      if (!near) return
      if (near.t <= 0.02) index = near.index - 1
      else if (near.t >= 0.98) index = near.index
      else {
        index = near.index
        path.splice(index, 0, [+pos[0].toFixed(7), +pos[1].toFixed(7)])
        nodes.forEach((n) => { if (n.index >= index) n.index += 1 })
      }
    }
    nodes.push({ type: t, id, index })
    try {
      const { data } = await api.patch(`/cables/${cable.id}/`, { path, nodes })
      Object.assign(cable, data)
    } catch (e) { panelError.value = errText(e); return }
  }
  renderAll()
}

/* ---------- cliente + cabo drop ---------- */
function freePortsOf(ctoId, excludeId) {
  const cto = items.cto.find((x) => x.id === Number(ctoId))
  const capacity = Number(cto?.capacity) || 0
  const used = new Set()
  for (const c of items.customer) {
    if (c.cto !== Number(ctoId)) continue
    if (excludeId && c.id === excludeId) continue
    if (c.port != null && c.port !== '') used.add(Number(c.port))
  }
  const free = []
  for (let i = 1; i <= capacity; i++) if (!used.has(i)) free.push(i)
  return free
}
function paintDropCto() {
  document.querySelectorAll('.mk.pick').forEach((el) => el.classList.remove('pick'))
  const cto = dropCto.value
  if (!cto) return
  const m = objs['cto' + cto.id]
  const el = m && m.getElement && m.getElement()
  if (el && el.firstChild) el.firstChild.classList.add('pick')
}
function hideDropPreview() {
  if (dropPreview) { dropPreview.remove(); dropPreview = null }
}
function showDropPreview(ctoId, lat, lng) {
  hideDropPreview()
  const cto = items.cto.find((x) => x.id === Number(ctoId))
  const tp = cto && position('cto', cto)
  if (!tp || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  dropPreview = L.polyline([tp, [lat, lng]], { color: '#16a34a', weight: 3, dashArray: '6 6', opacity: .9, interactive: false }).addTo(map)
}
function openCustomerAt(lat, lng, cto) {
  pendingDrop.value = null
  const preset = { latitude: lat, longitude: lng }
  if (cto) {
    pendingDrop.value = cto.id
    preset.cto = cto.id
    const free = freePortsOf(cto.id)
    if (free.length) preset.port = free[0]
  }
  openPanel('customer', null, preset)
  if (cto) showDropPreview(cto.id, lat, lng)
}
function placeCustomer(latlng, cto) {
  const lat = +latlng.lat.toFixed(7)
  const lng = +latlng.lng.toFixed(7)
  const parent = cto || dropCto.value
  dropCto.value = null
  paintDropCto()
  mode.value = 'select'
  if (map) map.getContainer().style.cursor = ''
  if (parent) openCustomerAt(lat, lng, parent)
  else ctoModal.value = { lat, lng }
}
function chooseCtoForCustomer(cto) {
  const pos = ctoModal.value
  if (!pos) return
  ctoModal.value = null
  openCustomerAt(pos.lat, pos.lng, cto)
}
function cancelAskCto() {
  ctoModal.value = null
}
async function createDropCable(customer, ctoId) {
  const cto = items.cto.find((x) => x.id === Number(ctoId))
  const cp = position('customer', customer)
  const tp = cto && position('cto', cto)
  if (!cp || !tp) return
  const path = [[+tp[0].toFixed(7), +tp[1].toFixed(7)], [+cp[0].toFixed(7), +cp[1].toFixed(7)]]
  const nodes = [{ type: 'cto', id: Number(ctoId), index: 0 }, { type: 'customer', id: customer.id, index: 1 }]
  try {
    const { data } = await api.post('/cables/', { name: `Drop ${customer.name}`, status: 'active', cable_type: 'drop', fiber_count: 1, color: '#000000', weight: 2, path, nodes })
    items.cable.push(data)
  } catch (e) { panelError.value = errText(e) }
}

async function loadAll() {
  await Promise.all(Object.keys(TYPES).map(async (t) => { items[t] = (await api.get(`/${TYPES[t].plural}/`)).data }))
  renderAll()
}

/* ---------- painel ---------- */
function openPanel(t, it, preset) {
  if (trecho.value && !(t === 'customer' && it && it.id === trecho.value.customerId)) exitTrecho()
  pendingAttach = null
  stopPathEdit()
  hideDropPreview()
  panelError.value = ''
  if (it) panel.value = { type: t, id: it.id, form: JSON.parse(JSON.stringify(it)) }
  else {
    const form = { name: '', status: 'active', observation: '', ...preset }
    TYPES[t].fields.forEach((f) => { if (!(f.k in form)) form[f.k] = f.t === 'number' ? (f.nullable ? '' : defaultNum(f.k)) : (f.k === 'cable_type' ? 'aerial' : f.k === 'splitter' ? '1:8' : f.t === 'ref' ? null : '') })
    if (t === 'cable') { form.color = form.color || DEFAULT_CABLE_COLOR; form.weight = form.weight || DEFAULT_CABLE_WEIGHT }
    if (t === 'tower') form.radios = form.radios || []
    panel.value = { type: t, id: null, form }
  }
}
function defaultNum(k) { return { capacity: 16, fiber_capacity: 24, fiber_count: 12 }[k] ?? '' }

function closePanel() {
  exitTrecho()
  pendingAttach = null
  const wasEditing = pathEdit.value
  stopPathEdit()
  panel.value = null
  pendingDrop.value = null
  dropCto.value = null
  hideDropPreview()
  paintDropCto()
  if (wasEditing) renderAll()
}

function cleanPayload(t, form) {
  const out = { ...form }
  for (const f of TYPES[t].fields) {
    if (f.t === 'number') {
      if (out[f.k] === '' || out[f.k] === null) { if (f.nullable) out[f.k] = null; else delete out[f.k] } else out[f.k] = Number(out[f.k])
    } else if (f.nullable && out[f.k] === '') out[f.k] = null
  }
  if (t === 'customer') for (const k of ['latitude', 'longitude']) if (out[k] === '' ) out[k] = null
  if (t === 'cable') out.weight = Number(out.weight) || DEFAULT_CABLE_WEIGHT
  if (t === 'tower') {
    out.radios = (out.radios || []).map((r) => ({
      ...r, ip: (r.ip || '').trim() || null, azimuth: r.azimuth === '' || r.azimuth == null ? null : Number(r.azimuth),
    }))
  }
  return out
}

function defaultName(t) {
  const label = TYPES[t].label
  const re = new RegExp('^' + label + ' (\\d+)$')
  let max = 0
  for (const x of items[t]) { const m = re.exec(x.name || ''); if (m) max = Math.max(max, Number(m[1])) }
  return `${label} ${Math.max(max, items[t].length) + 1}`
}
function quickSave() {
  const p = panel.value
  if (!p || p.id || saving.value || !canEdit.value) return
  if (!String(p.form.name || '').trim()) p.form.name = defaultName(p.type)
  save()
}

async function save() {
  const { type: t, id, form } = panel.value
  const wasNew = !id
  if (t === 'tower') {
    const okIp = (ip) => {
      const v = String(ip || '').trim()
      if (!v) return true
      if (v.includes(':')) return true // IPv6: deixa o servidor validar
      const p = v.split('.')
      return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255)
    }
    const bad = (form.radios || []).findIndex((r) => !okIp(r.ip))
    if (bad >= 0) { panelError.value = `Rádio ${bad + 1}: IP inválido. Use o formato 192.168.0.10.`; return }
  }
  saving.value = true; panelError.value = ''
  try {
    const body = cleanPayload(t, form)
    const dropParent = wasNew && t === 'customer' && pendingDrop.value && body.cto ? Number(body.cto) : null
    const { data } = id ? await api.put(`/${TYPES[t].plural}/${id}/`, body) : await api.post(`/${TYPES[t].plural}/`, body)
    const list = items[t]
    const i = list.findIndex((x) => x.id === data.id)
    if (i >= 0) list[i] = data; else list.push(data)
    if (t === 'cto') items.customer = (await api.get('/customers/')).data
    if (t === 'customer') items.cto = (await api.get('/ctos/')).data
    if (dropParent) await createDropCable(data, dropParent)
    if (wasNew && pendingAttach && BOX_TYPES.includes(t)) {
      const cable = items.cable.find((c) => c.id === pendingAttach)
      if (cable) await attachToCable(t, data.id, cable)
    }
    pendingAttach = null
    pendingDrop.value = null
    hideDropPreview()
    stopPathEdit(); renderAll()
    panel.value = { type: t, id: data.id, form: JSON.parse(JSON.stringify(data)) }
  } catch (e) { panelError.value = errText(e) } finally { saving.value = false }
}

async function deleteItem(t, id, label) {
  if (!confirm(`Excluir ${label || 'este item'}? Esta ação não pode ser desfeita.`)) return
  if (t === 'customer' && trecho.value && id === trecho.value.customerId) exitTrecho()
  try {
    await api.delete(`/${TYPES[t].plural}/${id}/`)
    items[t] = items[t].filter((x) => x.id !== id)
    if (t === 'customer') {
      items.cable = items.cable.filter((c) => !(c.cable_type === 'drop' && (c.nodes || []).some((n) => n.type === 'customer' && n.id === id)))
    }
    if (t === 'cto') await loadAll()
    if (t === 'customer') items.cto = (await api.get('/ctos/')).data
    if (panel.value && panel.value.id === id && panel.value.type === t) {
      panel.value = null; pendingDrop.value = null; hideDropPreview(); stopPathEdit()
    }
    renderAll()
  } catch (e) {
    if (panel.value && panel.value.id === id && panel.value.type === t) panelError.value = errText(e)
    else alert(errText(e))
  }
}

function remove() {
  const { type: t, id, form } = panel.value
  deleteItem(t, id, form.name)
}

/* ---------- modos / desenho ---------- */
function setMode(m) {
  cancelDraw(); stopPathEdit()
  dropCto.value = null; paintDropCto()
  mode.value = mode.value === m ? 'select' : m
  map.getContainer().style.cursor = mode.value === 'select' ? '' : 'crosshair'
  styleDrawLine()
}

function cancelMode() {
  cancelDraw(); mode.value = 'select'; map.getContainer().style.cursor = ''
  dropCto.value = null; paintDropCto()
}

function onMapClick(e) {
  if (trecho.value) { addTrechoPoint(e.latlng); return }
  const hit = cableHit; cableHit = null
  const { lat, lng } = e.latlng
  if (pathEdit.value && panel.value?.type === 'cable') {
    addEditPoint(e.latlng, null); return
  }
  if (mode.value.startsWith('add:')) {
    const t = mode.value.slice(4)
    if (t === 'customer') { placeCustomer(e.latlng, null); return }
    // clicou em cima de um cabo: o novo elemento fica sobre o cabo e será ligado a ele ao salvar
    let pos = e.latlng, attachTo = null
    if (hit && !isCustomerDrop(hit) && BOX_TYPES.includes(t)) { const sn = snapToPath(hit.path, e.latlng); if (sn) { pos = sn; attachTo = hit.id } }
    openPanel(t, null, { latitude: +pos.lat.toFixed(7), longitude: +pos.lng.toFixed(7) })
    pendingAttach = attachTo
    mode.value = 'select'; map.getContainer().style.cursor = ''
  } else if (mode.value === 'cable' || mode.value === 'measure') {
    addDrawPoint(e.latlng, null)
  }
}

function styleDrawLine() {
  if (!drawLine) return
  if (mode.value === 'cable') drawLine.setStyle({ color: drawColor.value, weight: drawWeight.value, dashArray: null })
  else drawLine.setStyle({ color: '#f59e0b', weight: 3, dashArray: '6 6' })
}
function redrawDraw() {
  drawLine.setLatLngs(drawPts.value)
  drawDots.forEach((d) => d.remove()); drawDots = drawPts.value.map((p) => L.circleMarker(p, { radius: 4, color: mode.value === 'cable' ? drawColor.value : '#f59e0b', fillOpacity: 1 }).addTo(map))
}
function undoDraw() {
  if (!drawPts.value.length) return
  redoStack.value.push({ pt: drawPts.value.pop(), node: drawNodes.value.pop() })
  redrawDraw()
}
function redoDraw() {
  const r = redoStack.value.pop()
  if (!r) return
  drawPts.value.push(r.pt); drawNodes.value.push(r.node)
  redrawDraw()
}
function cancelDraw() {
  redoStack.value = []
  drawPts.value = []; drawNodes.value = []; if (drawLine) redrawDraw()
}
function finishCable() {
  if (drawPts.value.length < 2) return
  const path = drawPts.value.map((p) => [+p[0].toFixed(7), +p[1].toFixed(7)])
  const nodes = drawNodes.value.map((n, index) => (n ? { ...n, index } : null)).filter(Boolean)
  cancelDraw(); mode.value = 'select'; map.getContainer().style.cursor = ''
  openPanel('cable', null, { path, nodes, cable_type: 'aerial', fiber_count: 12, color: drawColor.value, weight: drawWeight.value })
}

/* ---------- ver trecho (rota manual do drop) ---------- */
function trechoEnds() {
  const t = trecho.value
  if (!t) return null
  const cto = items.cto.find((x) => x.id === t.ctoId)
  const cust = items.customer.find((x) => x.id === t.customerId)
  if (!cto || !cust) return null
  const posCto = position('cto', cto)
  const posCust = position('customer', cust)
  if (!posCto || !posCust) return null
  return { cto, cust, posCto, posCust }
}
function trechoPath() {
  const e = trechoEnds()
  if (!e || !trecho.value) return []
  return [e.posCto, ...trecho.value.pts, e.posCust]
}
function drawTrecho() {
  if (!trechoLayer) return
  trechoLayer.clearLayers()
  trechoVertices = []
  const e = trechoEnds()
  if (!e || !trecho.value) return
  const saved = items.cable.find((c) => c.id === trecho.value.cableId)
  if (saved && saved.path?.length) {
    L.polyline(saved.path, { color: '#9ca3af', weight: 2, dashArray: '4 6', interactive: false }).addTo(trechoLayer)
  }
  const draft = L.polyline(trechoPath(), { color: '#000', weight: 3, interactive: false }).addTo(trechoLayer)
  L.marker(e.posCto, { icon: makeIcon('cto', e.cto), interactive: false }).addTo(trechoLayer)
  L.marker(e.posCust, { icon: makeIcon('customer', e.cust), interactive: false }).addTo(trechoLayer)
  trecho.value.pts.forEach((p, i) => {
    const m = L.marker(p, {
      icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div class="vx"></div>' }),
      draggable: true,
    })
    m.on('drag', () => {
      const ll = m.getLatLng()
      trecho.value.pts[i] = [ll.lat, ll.lng]
      draft.setLatLngs(trechoPath())
    })
    m.on('dragend', () => { trechoRedo.value = []; trecho.value.saved = false })
    m.on('contextmenu', (ev) => {
      L.DomEvent.stopPropagation(ev)
      trecho.value.pts.splice(i, 1)
      trechoRedo.value = []
      trecho.value.saved = false
      drawTrecho()
    })
    m.addTo(trechoLayer)
    trechoVertices.push(m)
  })
}
function enterTrecho() {
  const p = panel.value
  if (!p || p.type !== 'customer' || !p.id) return
  const cust = items.customer.find((x) => x.id === p.id)
  if (!cust) return
  const ctoId = p.form.cto
  if (!ctoId) { panelError.value = 'Este cliente não está ligado a uma CTO.'; return }
  const cto = items.cto.find((x) => x.id === Number(ctoId))
  const posCto = cto && position('cto', cto)
  const posCust = position('customer', cust)
  if (!posCto || !posCust) { panelError.value = 'Faltam coordenadas.'; return }
  const cable = items.cable.find((c) => c.cable_type === 'drop' && (c.nodes || []).some((n) => n.type === 'customer' && n.id === p.id))
  cancelMode(); stopPathEdit()
  visibleBackup = { ...visible }
  for (const k in visible) visible[k] = false
  const pts = cable && cable.path && cable.path.length > 2 ? cable.path.slice(1, -1).map((q) => [q[0], q[1]]) : []
  trecho.value = {
    customerId: p.id, ctoId: Number(ctoId), cableId: cable?.id ?? null, pts,
    straightDist: L.latLng(posCto).distanceTo(L.latLng(posCust)), saved: false, error: '',
  }
  trechoRedo.value = []
  panelError.value = ''
  map.getContainer().style.cursor = 'crosshair'
  drawTrecho()
  map.fitBounds(L.latLngBounds([posCto, posCust]), { padding: [90, 90], maxZoom: 19 })
}
function addTrechoPoint(latlng) {
  if (!trecho.value) return
  trecho.value.pts.push([+latlng.lat.toFixed(7), +latlng.lng.toFixed(7)])
  trechoRedo.value = []
  trecho.value.saved = false
  drawTrecho()
}
function undoTrecho() {
  if (!trecho.value || !trecho.value.pts.length) return
  trechoRedo.value.push(trecho.value.pts.pop())
  trecho.value.saved = false
  drawTrecho()
}
function redoTrecho() {
  if (!trecho.value || !trechoRedo.value.length) return
  trecho.value.pts.push(trechoRedo.value.pop())
  trecho.value.saved = false
  drawTrecho()
}
function clearTrecho() {
  if (!trecho.value) return
  trecho.value.pts = []
  trechoRedo.value = []
  trecho.value.saved = false
  drawTrecho()
}
async function saveTrecho() {
  if (!canEdit.value || !trecho.value) return
  const e = trechoEnds()
  if (!e) return
  const t = trecho.value
  const path = trechoPath().map((q) => [+q[0].toFixed(7), +q[1].toFixed(7)])
  const nodes = [{ type: 'cto', id: t.ctoId, index: 0 }, { type: 'customer', id: t.customerId, index: path.length - 1 }]
  try {
    if (t.cableId) {
      const { data } = await api.patch(`/cables/${t.cableId}/`, { path, nodes })
      const item = items.cable.find((c) => c.id === t.cableId)
      if (item) Object.assign(item, data)
    } else {
      const { data } = await api.post('/cables/', { name: `Drop ${e.cust.name}`, status: 'active', cable_type: 'drop', fiber_count: 1, color: '#000000', weight: 2, path, nodes })
      items.cable.push(data)
      t.cableId = data.id
    }
    t.saved = true
    t.error = ''
    drawTrecho()
  } catch (err) { t.error = errText(err) }
}
function exitTrecho() {
  if (!trecho.value) return
  if (trechoLayer) trechoLayer.clearLayers()
  trechoVertices = []
  if (visibleBackup) Object.assign(visible, visibleBackup)
  visibleBackup = null
  trecho.value = null
  trechoRedo.value = []
  if (map) map.getContainer().style.cursor = ''
  renderAll()
}

/* edição do traçado de um cabo existente */
function startPathEdit() { pathEdit.value = true; rebuildVertices(); map.getContainer().style.cursor = 'crosshair' }
function stopPathEdit() {
  pathEdit.value = false
  vertexMarkers.forEach((m) => m.remove()); vertexMarkers = []
  if (map) map.getContainer().style.cursor = mode.value === 'select' ? '' : 'crosshair'
}
function previewPath() { const l = objs['cable' + panel.value.id]; if (l) l.setLatLngs(panel.value.form.path) }
function rebuildVertices() {
  vertexMarkers.forEach((m) => m.remove()); vertexMarkers = []
  const path = panel.value.form.path
  const form = panel.value.form
  form.nodes = form.nodes || []
  path.forEach((p, i) => {
    const m = L.marker(p, { draggable: true, icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div class="vx"></div>' }) }).addTo(map)
    m.on('dragstart', () => { form.nodes = form.nodes.filter((n) => n.index !== i) })
    m.on('drag', () => { const { lat, lng } = m.getLatLng(); path[i] = [lat, lng]; previewPath() })
    m.on('contextmenu', () => {
      if (path.length > 2) {
        path.splice(i, 1)
        form.nodes = form.nodes.filter((n) => n.index !== i).map((n) => (n.index > i ? { ...n, index: n.index - 1 } : n))
        rebuildVertices(); previewPath()
      }
    })
    vertexMarkers.push(m)
  })
}

/* ---------- busca ---------- */
watch(q, (v) => {
  clearTimeout(searchTimer)
  if (v.trim().length < 2) { results.value = []; return }
  searchTimer = setTimeout(async () => {
    try { results.value = (await api.get('/search/', { params: { q: v.trim() } })).data; showResults.value = true } catch {}
  }, 250)
})
function pick(r) {
  showResults.value = false
  const it = items[r.type].find((x) => x.id === r.id)
  if (r.type === 'cable' && it) map.fitBounds(L.latLngBounds(it.path), { maxZoom: 19, padding: [60, 60] })
  else if (r.lat != null) map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 18))
  if (it) openPanel(r.type, it)
}

/* ---------- mapa ---------- */
function baseLayers() {
  const s = state.settings || {}
  baseOsm = L.tileLayer(s.custom_tile_url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 21, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap' })
  baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: SAT_MAX_ZOOM, attribution: 'Imagery &copy; Esri' })
  return { 'Ruas (OpenStreetMap)': baseOsm, 'Satélite': baseSat }
}

function showNotice(msg) {
  clearTimeout(noticeTimer)
  baseNotice.value = msg
  if (msg) noticeTimer = setTimeout(() => { baseNotice.value = '' }, 4500)
}
// Satélite sem imagem em zoom alto: troca para ruas sozinho e volta ao satélite quando o zoom diminuir.
function syncBase() {
  if (!map || !wantSat) return
  const z = map.getZoom()
  if (map.hasLayer(baseSat) && z > SAT_MAX_ZOOM) {
    map.removeLayer(baseSat); map.addLayer(baseOsm)
    showNotice('Satélite indisponível nesta aproximação — mostrando o mapa de ruas.')
  } else if (!map.hasLayer(baseSat) && z <= SAT_MAX_ZOOM) {
    map.removeLayer(baseOsm); map.addLayer(baseSat)
    showNotice('')
  }
}

onMounted(async () => {
  const s = state.settings || {}
  map = L.map(mapEl.value, { zoomControl: false, maxZoom: 21 }).setView([s.map_lat ?? -14.2, s.map_lng ?? -51.9], s.map_zoom ?? 5)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)
  const bases = baseLayers()
  baseOsm.addTo(map)
  L.control.layers(bases, null, { position: 'bottomright' }).addTo(map)
  map.on('baselayerchange', (e) => { wantSat = e.layer === baseSat; setTimeout(syncBase, 0) })
  map.on('zoomend', syncBase)
  for (const t in TYPES) groups[t] = L.layerGroup().addTo(map)
  drawLine = L.polyline([], { color: '#f59e0b', weight: 3, dashArray: '6 6' }).addTo(map)
  map.getContainer().classList.toggle('no-tips', !tipsOn.value)
  linkLayer = L.layerGroup().addTo(map)
  trechoLayer = L.layerGroup().addTo(map)
  map.on('click', onMapClick)
  window.addEventListener('keydown', onKeydown)
  try { await loadAll() } catch (e) { if (e.response?.status !== 401) alert(errText(e)) }
  const pts = [...items.cto, ...items.olt, ...items.ceo].map((x) => [x.latitude, x.longitude])
  if (pts.length) map.fitBounds(L.latLngBounds(pts), { maxZoom: 17, padding: [60, 60] })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  hideDropPreview()
  if (map) map.remove()
})

function onKeydown(e) {
  if (trecho.value) {
    if (e.key === 'Escape') { e.preventDefault(); exitTrecho(); return }
    const ttag = e.target?.tagName
    if (ttag === 'INPUT' || ttag === 'TEXTAREA' || ttag === 'SELECT') return
    const tmod = e.ctrlKey || e.metaKey
    const tkey = e.key.toLowerCase()
    if (tmod && tkey === 'z' && !e.shiftKey) { e.preventDefault(); undoTrecho(); return }
    if (tmod && tkey === 'z' && e.shiftKey) { e.preventDefault(); redoTrecho(); return }
    if (tmod && tkey === 'y') { e.preventDefault(); redoTrecho(); return }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) { e.preventDefault(); saveTrecho(); return }
    return
  }
  if (e.key === 'Escape') {
    if (ctoModal.value) { ctoModal.value = null; return }
    if (dropCto.value) { dropCto.value = null; paintDropCto() }
    return
  }
  const tag = e.target?.tagName
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if ((key === 'z' || key === 'y') && mod) {
    if (typing) return
    if (ctoModal.value) return
    if (mode.value !== 'cable' && mode.value !== 'measure') return
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoDraw(); return }
    if (key === 'z' && e.shiftKey) { e.preventDefault(); redoDraw(); return }
    if (key === 'y') { e.preventDefault(); redoDraw(); return }
    return
  }
  if (e.key === 'Enter') {
    if (ctoModal.value) return
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
    if (e.target?.closest?.('a')) return
    if (tag === 'INPUT' && !e.target?.closest?.('.panel')) return
    if (mode.value === 'cable' && drawPts.value.length >= 2) { e.preventDefault(); finishCable(); return }
    if (panel.value && !panel.value.id) { e.preventDefault(); quickSave() }
  }
}

watch(tipsOn, (v) => { if (map) map.getContainer().classList.toggle('no-tips', !v) })
watch([drawColor, drawWeight], () => { styleDrawLine(); if (mode.value === 'cable') redrawDraw() })
watch(() => (panel.value?.type === 'cable' ? `${panel.value.form.color}|${panel.value.form.weight}` : ''), () => highlight())
watch(visible, (v) => { for (const t in v) { if (v[t]) map.addLayer(groups[t]); else map.removeLayer(groups[t]) } }, { deep: true })
watch(() => (panel.value ? `${panel.value.type}:${panel.value.id}` : ''), () => highlight(), { flush: 'post' })
watch(() => (panel.value?.type === 'customer' ? panel.value.form.cto : null), (ctoId) => {
  const p = panel.value
  if (!p || p.type !== 'customer') return
  if (!p.id && pendingDrop.value) {
    const lat = p.form.latitude, lng = p.form.longitude
    if (ctoId && lat !== '' && lat != null && lng !== '' && lng != null) showDropPreview(ctoId, Number(lat), Number(lng))
    else hideDropPreview()
  }
  if (!ctoId) return
  if (p.form.port !== '' && p.form.port != null) return
  const info = ctoInfo.value
  if (info && info.freePorts.length) p.form.port = info.freePorts[0]
})

const ctoInfo = computed(() => {
  const p = panel.value
  if (!p) return null
  const ctoId = p.type === 'cto' ? p.id : p.type === 'customer' ? p.form.cto : null
  if (!ctoId) return null
  const cto = items.cto.find((x) => x.id === ctoId)
  if (!cto) return null
  const capacity = Number(cto.capacity) || 0
  const excludeId = p.type === 'customer' && p.id ? p.id : null
  const usedPorts = new Set()
  for (const c of items.customer) {
    if (c.cto !== ctoId) continue
    if (excludeId && c.id === excludeId) continue
    if (c.port != null && c.port !== '') usedPorts.add(Number(c.port))
  }
  const used = usedPorts.size
  const free = Math.max(0, capacity - used)
  const freePorts = []
  for (let i = 1; i <= capacity; i++) if (!usedPorts.has(i)) freePorts.push(i)
  return { cto, capacity, used, free, freePorts }
})
const cableNodesText = computed(() => {
  const p = panel.value
  if (!p || p.type !== 'cable') return ''
  const nodes = [...(p.form.nodes || [])].sort((a, b) => a.index - b.index)
  return nodes.map((n) => itemName(n.type, n.id)).join(' → ')
})
function addRadio() {
  panel.value.form.radios.push({ name: `Rádio ${panel.value.form.radios.length + 1}`, model: '', ip: '', frequency: '', azimuth: '', observation: '' })
}
function removeRadio(i) { panel.value.form.radios.splice(i, 1) }
const isBoxPanel = computed(() => !!panel.value && BOX_TYPES.includes(panel.value.type))
const boxCablesText = computed(() => {
  const p = panel.value
  if (!p || !p.id || !BOX_TYPES.includes(p.type)) return ''
  return connectedCables(p.type, p.id).map((c) => c.name).join(', ')
})
const refOptions = (k) => (k === 'olt' ? items.olt : items.cto)
const counts = computed(() => Object.fromEntries(Object.keys(TYPES).map((t) => [t, items[t].length])))
const totalCable = computed(() => items.cable.reduce((a, c) => a + c.length_m, 0))
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <img v-if="state.branding.logo_url" :src="state.branding.logo_url" alt="" />
        <strong>{{ state.branding.company_name }}</strong>
      </div>
      <div class="search">
        <input v-model="q" placeholder="Buscar CTO, cliente, cabo ou observação…" @focus="showResults = true" @keydown.esc="showResults = false" aria-label="Buscar" />
        <ul v-if="showResults && q.trim().length >= 2" class="results">
          <li v-if="!results.length" class="muted empty">Nada encontrado para “{{ q }}”.</li>
          <li v-for="r in results" :key="r.type + r.id" @click="pick(r)">
            <b>{{ r.name }}</b><small>{{ r.subtitle }}</small>
          </li>
        </ul>
      </div>
      <nav>
        <span class="muted who">{{ state.user?.username }}</span>
        <button class="btn ghost" @click="router.push('/settings')">Configurações</button>
        <button class="btn ghost" @click="logout()">Sair</button>
      </nav>
    </header>

    <div class="body" @click="showResults = false">
      <aside class="tools" :class="{ locked: !!trecho }">
        <template v-if="canEdit">
          <h2>Adicionar</h2>
          <button v-for="t in ADD_ORDER" :key="t" class="tool" :class="{ on: mode === 'add:' + t }" @click="setMode('add:' + t)">
            <span class="ti" :style="{ color: TYPES[t].color }" v-html="ICONS[t]"></span>{{ TYPES[t].label }}
          </button>
          <button class="tool" :class="{ on: mode === 'cable' }" @click="setMode('cable')">
            <span class="ti" :style="{ color: TYPES.cable.color }" v-html="ICONS.cable"></span>Cabo (traçar)
          </button>
          <button class="tool" :class="{ on: mode === 'add:customer' }" @click="setMode('add:customer')">
            <span class="ti" :style="{ color: TYPES.customer.color }" v-html="ICONS.customerAdd"></span>{{ TYPES.customer.label }}
          </button>
          <button class="tool" :class="{ on: mode === 'del:customer' }" @click="setMode('del:customer')">
            <span class="ti" style="color:#b91c1c" v-html="ICONS.customerDel"></span>Remover cliente
          </button>
        </template>
        <h2>Medir</h2>
        <button class="tool" :class="{ on: mode === 'measure' }" @click="setMode('measure')"><span class="ti" v-html="ICONS.ruler"></span>Régua</button>
        <h2>Camadas</h2>
        <label v-for="(T, t) in TYPES" :key="t" class="layer">
          <input type="checkbox" v-model="visible[t]" />
          <span class="ti" :style="{ color: T.color }" v-html="ICONS[t]"></span>{{ T.label }}
          <small>{{ counts[t] }}</small>
        </label>
        <p class="muted total">Rede de cabos: <b>{{ formatDist(totalCable) }}</b></p>
      </aside>

      <main class="mapwrap">
        <div ref="mapEl" class="map"></div>
        <div v-if="modeHint && !trecho" class="hint">{{ modeHint }}</div>
        <div v-if="baseNotice" class="notice">{{ baseNotice }}</div>
        <div v-if="trecho" class="trecho">
          <div class="trecho-head">
            <b>Trecho: {{ trechoInfo?.cto?.name }} → {{ trechoInfo?.cust?.name }}</b>
            <span>Em linha reta: <b>{{ formatDist(trecho.straightDist) }}</b> · Pelo traçado: <b>{{ formatDist(pathLength(trechoPath())) }}</b> · {{ trecho.pts.length }} ponto(s)</span>
            <span class="muted small">Clique no mapa para criar os pontos da rota, da CTO até o cliente. Arraste um ponto para ajustar; clique direito remove. Só grava ao salvar.</span>
            <span v-if="trecho.saved" class="ok">Rota salva no drop.</span>
            <span v-if="trecho.error" class="err">{{ trecho.error }}</span>
          </div>
          <div class="trecho-actions">
            <button class="btn" @click="undoTrecho" :disabled="!trecho.pts.length">Desfazer</button>
            <button class="btn" @click="redoTrecho" :disabled="!trechoRedo.length">Refazer</button>
            <button class="btn" @click="clearTrecho" :disabled="!trecho.pts.length">Limpar</button>
            <button v-if="canEdit" class="btn primary" @click="saveTrecho">Salvar rota</button>
            <button class="btn" @click="exitTrecho">Sair do trecho</button>
          </div>
        </div>
        <div v-if="(mode === 'cable' || mode === 'measure') && !trecho" class="drawbar">
          <CableStyle v-if="mode === 'cable'" v-model:color="drawColor" v-model:weight="drawWeight" compact class="drawstyle" />
          <span>Distância: <b>{{ formatDist(drawDist) }}</b> · {{ drawPts.length }} pontos</span>
          <button class="btn" @click="undoDraw" :disabled="!drawPts.length">Desfazer</button>
          <button class="btn" @click="redoDraw" :disabled="!redoStack.length">Refazer</button>
          <button v-if="mode === 'cable'" class="btn primary" @click="finishCable" :disabled="drawPts.length < 2">Concluir cabo</button>
          <button class="btn" @click="cancelMode">Cancelar</button>
        </div>
      </main>

      <aside v-if="panel" class="panel" @click.stop>
        <div class="phead">
          <h3>{{ panel.id ? 'Editar' : 'Novo' }} {{ TYPES[panel.type].label }}</h3>
          <button class="btn ghost" @click="closePanel" aria-label="Fechar">✕</button>
        </div>
        <fieldset :disabled="!canEdit" class="fs">
          <template v-for="f in TYPES[panel.type].fields" :key="f.k">
            <label :for="'f_' + f.k">{{ f.l }}</label>
            <select v-if="f.t === 'select'" :id="'f_' + f.k" v-model="panel.form[f.k]">
              <option v-for="o in f.opts" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
            </select>
            <select v-else-if="f.t === 'ref'" :id="'f_' + f.k" v-model="panel.form[f.k]">
              <option :value="null">— nenhuma —</option>
              <option v-for="o in refOptions(f.ref)" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
            <input v-else :id="'f_' + f.k" v-model="panel.form[f.k]" :type="f.t === 'number' ? 'number' : 'text'" step="any" />
          </template>
          <template v-if="panel.type !== 'olt'">
            <label for="f_status">Status</label>
            <select id="f_status" v-model="panel.form.status"><option v-for="s in STATUS" :key="s[0]" :value="s[0]">{{ s[1] }}</option></select>
          </template>

          <template v-if="TYPES[panel.type].geo">
            <div class="two">
              <div><label>Latitude</label><input v-model="panel.form.latitude" type="number" step="any" /></div>
              <div><label>Longitude</label><input v-model="panel.form.longitude" type="number" step="any" /></div>
            </div>
            <p v-if="panel.type === 'customer'" class="muted small">Cliente sem coordenadas aparece ao lado da CTO escolhida.</p>
          </template>
          <template v-if="panel.type === 'tower'">
            <div class="radios">
              <div class="rhead">
                <b>Rádios / antenas ({{ panel.form.radios.length }})</b>
                <button v-if="canEdit" type="button" class="btn" @click="addRadio">+ Adicionar rádio</button>
              </div>
              <p v-if="!panel.form.radios.length" class="muted small">Nenhum rádio cadastrado nesta torre.</p>
              <div v-for="(r, i) in panel.form.radios" :key="r.id || 'novo' + i" class="radio">
                <div class="rhead">
                  <b>Rádio {{ i + 1 }}</b>
                  <button v-if="canEdit" type="button" class="btn ghost" title="Remover rádio" @click="removeRadio(i)">✕</button>
                </div>
                <label>Nome</label><input v-model="r.name" />
                <div class="two">
                  <div><label>IP</label><input v-model="r.ip" placeholder="192.168.0.10" /></div>
                  <div><label>Azimute (°)</label><input v-model="r.azimuth" type="number" min="0" max="359" /></div>
                </div>
                <div class="two">
                  <div><label>Modelo</label><input v-model="r.model" /></div>
                  <div><label>Frequência</label><input v-model="r.frequency" placeholder="5.8 GHz" /></div>
                </div>
                <label>Observação</label><input v-model="r.observation" />
              </div>
            </div>
          </template>
          <template v-if="panel.type === 'cable'">
            <CableStyle v-model:color="panel.form.color" v-model:weight="panel.form.weight" />
            <p class="len">Comprimento: <b>{{ formatDist(panelCableLen) }}</b> <small class="muted">({{ panel.form.path.length }} pontos)</small></p>
            <p class="len">Passa por: <b v-if="cableNodesText">{{ cableNodesText }}</b><span v-else class="muted small">ao traçar, clique sobre uma CTO/CEO/OLT/poste para ligar o cabo a ela</span></p>
            <button v-if="panel.id && canEdit && !isCustomerDrop(panel.form)" class="btn" @click.prevent="pathEdit ? (stopPathEdit()) : startPathEdit()">
              {{ pathEdit ? 'Terminar edição do traçado' : 'Editar traçado' }}
            </button>
            <p v-if="pathEdit && !isCustomerDrop(panel.form)" class="muted small">Arraste os pontos. Ao soltar um ponto que estava de cima de uma caixa, a ligação é desfeita. Clique direito remove um ponto. Clique no mapa adiciona ao final.</p>
            <p v-if="isCustomerDrop(panel.form)" class="muted small">Este drop é mostrado em linha reta no mapa. Para ver ou editar a rota, selecione o cliente e use "Ver trecho".</p>
          </template>
          <p v-if="panel.type === 'cto' && ctoInfo" class="len">Portas: <b>{{ ctoInfo.free }}</b> livres · {{ ctoInfo.used }} em uso de {{ ctoInfo.capacity }}</p>
          <p v-if="panel.type === 'customer' && ctoInfo" class="len">
            {{ ctoInfo.cto.name }}: <b>{{ ctoInfo.free }}</b> portas livres
            <span v-if="ctoInfo.freePorts.length">(próxima: {{ ctoInfo.freePorts[0] }})</span><span v-else>(sem portas livres)</span>
          </p>
          <p v-if="panel.id && isBoxPanel" class="len">Cabos nesta caixa: <b>{{ boxCablesText || '—' }}</b></p>

          <label for="f_obs">Observação</label>
          <textarea id="f_obs" v-model="panel.form.observation" rows="4"></textarea>
        </fieldset>
        <button v-if="panel.type === 'customer' && panel.id && panel.form.cto" type="button" class="btn" @click="enterTrecho">Ver trecho</button>
        <p v-if="panelError" class="err" role="alert">{{ panelError }}</p>
        <div v-if="canEdit" class="actions">
          <button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Salvando…' : 'Salvar alterações' }}</button>
          <button v-if="panel.id" class="btn danger" @click="remove">Excluir</button>
        </div>
        <p v-if="panel.id === null && canEdit" class="muted small">Enter salva agora; se o nome estiver vazio, é criado um nome automático para você editar depois.</p>
      </aside>
    </div>

    <div v-if="ctoModal" class="modal-backdrop" @click.self="cancelAskCto">
      <div class="modal" @click.stop>
        <h3>De qual caixa o cliente pertence?</h3>
        <p class="muted small">Escolha a CTO para criar o cabo de drop até o cliente.</p>
        <div class="cto-list">
          <button v-for="c in items.cto" :key="c.id" class="btn" @click="chooseCtoForCustomer(c)">
            <span>{{ c.name }}</span><small>{{ ctoFree(c) }} livres</small>
          </button>
          <p v-if="!items.cto.length" class="muted small">Nenhuma CTO cadastrada.</p>
        </div>
        <div class="actions">
          <button class="btn" @click="chooseCtoForCustomer(null)">Sem caixa</button>
          <button class="btn ghost" @click="cancelAskCto">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.mk { position: relative; width: 100%; height: 100%; color: var(--c); display: grid; place-items: center;
  filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); }
.mk .ic { width: 100%; height: 100%; display: grid; place-items: center; }
.mk .ic svg { width: 100%; height: 100%; }
.mk .ic img { width: 100%; height: 100%; object-fit: contain; }
.mk .bd { position: absolute; top: -6px; right: -8px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 50%;
  background: var(--c); color: #fff; font-size: 10px; font-style: normal; font-weight: 700; line-height: 1; display: grid; place-items: center; }
.mk.dim { opacity: .5; } .mk.plan { opacity: .75; }
.mk.full { color: #b91c1c; } .mk.full .bd { background: #b91c1c; }
.mk.hl { filter: drop-shadow(0 0 3px #f59e0b) drop-shadow(0 0 3px #f59e0b) drop-shadow(0 0 1px #fff); }
.mk.pick { filter: drop-shadow(0 0 3px #16a34a) drop-shadow(0 0 3px #16a34a) drop-shadow(0 0 1px #fff); }
.no-tips .leaflet-tooltip { display: none !important; }
.vx { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 3px solid #f59e0b; }
</style>
<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.top { background: var(--ink); color: #fff; display: flex; align-items: center; gap: 16px; padding: 0 14px; height: 52px; flex: none; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 17px; min-width: 130px; }
.brand img { height: 28px; }
.search { position: relative; flex: 1; max-width: 560px; }
.search input { background: var(--ink-2); border-color: #2c4560; color: #fff; }
.search input::placeholder { color: #8ea1b6; }
.results { position: absolute; top: 40px; left: 0; right: 0; background: #fff; color: var(--ink); list-style: none; margin: 0; padding: 4px 0;
  border-radius: var(--radius); max-height: 60vh; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,.3); z-index: 2000; }
.results li { padding: 8px 12px; cursor: pointer; display: flex; flex-direction: column; }
.results li:hover { background: #eef3f6; }
.results small, .empty { color: var(--muted); } .empty { padding: 10px 12px; cursor: default; }
nav { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.who { color: #aab8c8; margin-right: 6px; }
.btn.ghost { background: transparent; border-color: transparent; color: inherit; }
.btn.ghost:hover { border-color: #3a5573; }
.body { flex: 1; display: flex; min-height: 0; }
.tools { width: 190px; flex: none; background: #fff; border-right: 1px solid var(--line); padding: 8px 12px; overflow: auto; }
.tools.locked { pointer-events: none; opacity: .5; }
.tools h2 { font-size: 12px; font-weight: 600; color: var(--muted); margin: 16px 0 6px; }
.tool { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; margin-bottom: 3px; background: none; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; text-align: left; }
.tool:hover { background: var(--paper); } .tool.on { background: color-mix(in srgb, var(--primary) 14%, white); border-color: var(--primary); }
.ti { width: 18px; height: 18px; display: inline-block; flex: none; }
.ti :deep(svg) { width: 100%; height: 100%; }
.ti :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.layer { display: flex; align-items: center; gap: 8px; margin: 0; padding: 4px 0; color: var(--ink); font-size: 13px; }
.layer input { width: auto; } .layer small { margin-left: auto; color: var(--muted); }
.total { margin-top: 18px; font-size: 12px; }
.mapwrap { flex: 1; position: relative; min-width: 0; }
.map { position: absolute; inset: 0; }
.hint { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1000; background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 20px; font-size: 13px; }
.trecho { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.25); border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; flex-wrap: wrap; max-width: 94%; }
.trecho-head { display: flex; flex-direction: column; gap: 2px; }
.trecho-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.trecho .ok { color: #15803d; font-size: 13px; }
.drawbar { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #fff; padding: 10px 14px; border-radius: 8px; display: flex; gap: 8px; align-items: center; box-shadow: 0 4px 16px rgba(0,0,0,.25); flex-wrap: wrap; }
.panel { width: 330px; flex: none; background: #fff; border-left: 1px solid var(--line); padding: 12px 16px 20px; overflow: auto; }
.phead { display: flex; align-items: center; justify-content: space-between; }
.phead h3 { margin: 0; font-size: 16px; }
.fs { border: 0; padding: 0; margin: 0; min-width: 0; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.len { margin: 14px 0 8px; } .small { font-size: 12px; }
.radios { margin-top: 14px; }
.rhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.radio { border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); padding: 6px 10px 10px; margin-top: 8px; }
.notice { position: absolute; top: 52px; left: 50%; transform: translateX(-50%); z-index: 1000; background: #1c2f44; color: #fff; padding: 7px 14px; border-radius: 20px; font-size: 13px; max-width: 90%; text-align: center; }
.drawstyle { width: 100%; justify-content: center; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
.actions .primary { flex: 1; }
.modal-backdrop { position: fixed; inset: 0; z-index: 3000; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.modal { background: #fff; color: var(--ink); width: min(380px, 92vw); max-height: 82vh; overflow: auto; border-radius: var(--radius); padding: 16px; box-shadow: 0 14px 44px rgba(0,0,0,.35); }
.modal h3 { margin: 0 0 4px; font-size: 16px; }
.cto-list { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
.cto-list .btn { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.cto-list small { color: var(--muted); }
@media (max-width: 800px) {
  .tools { width: 120px; padding: 6px; } .search { max-width: none; } .who { display: none; }
  .panel { position: absolute; right: 0; bottom: 0; top: 52px; width: min(330px, 92vw); z-index: 1500; }
}
</style>
