// API mock: guarda os dados no localStorage para o mapa funcionar sem backend.
import { seedData, pathLengthM } from './data'

const KEY = 'dukon_mock_db_v1'
const PLURAL_TO_KEY = { olts: 'olt', ctos: 'cto', ceos: 'ceo', poles: 'pole', towers: 'tower', customers: 'customer', cables: 'cable' }
const LABELS = { olt: 'OLT', cto: 'CTO', ceo: 'CEO', pole: 'Poste', tower: 'Torre', customer: 'Cliente', cable: 'Cabo' }

const clone = (x) => JSON.parse(JSON.stringify(x))

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const db = clone(seedData)
  save(db)
  return db
}
function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {}
}

let db = load()

function nextId(list) {
  return list.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1
}
function normCable(c) {
  return { ...c, length_m: Math.round(pathLengthM(c.path || [])) }
}
function search(text) {
  const s = String(text || '').trim().toLowerCase()
  if (!s) return []
  const out = []
  for (const key of Object.keys(LABELS)) {
    for (const it of db[key] || []) {
      const hay = [it.name, it.address, it.observation, it.code, it.plan, it.model, it.document]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(s)) continue
      out.push({ type: key, id: it.id, name: it.name, subtitle: LABELS[key], lat: it.latitude, lng: it.longitude })
    }
  }
  return out.slice(0, 30)
}

const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 80))

/* ---------- backup: exportar / importar JSON ---------- */
export function exportData() {
  return clone(db)
}

export function importData(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Arquivo inválido: esperado um objeto JSON com os dados da rede.')
  }
  const clean = {}
  for (const key of Object.keys(LABELS)) {
    const list = obj[key]
    if (list == null) { clean[key] = []; continue }
    if (!Array.isArray(list)) throw new Error(`Campo "${key}" deve ser uma lista.`)
    clean[key] = clone(list)
  }
  db = clean
  save(db)
  return clone(db)
}

const api = {
  async get(url, cfg) {
    const u = String(url).replace(/^\/+|\/+$/g, '')
    if (u === 'search') return { data: await delay(search(cfg?.params?.q)) }
    if (u === 'settings') return { data: { map_lat: -23.55, map_lng: -46.63, map_zoom: 14, distance_unit: 'auto' } }
    if (u === 'auth/me') return { data: { username: 'Admin', role: 'admin' } }
    const key = PLURAL_TO_KEY[u.split('/')[0]]
    if (!key) throw new Error('Rota nao encontrada: ' + url)
    return { data: await delay(clone(db[key] || [])) }
  },
  async post(url, body) {
    const key = PLURAL_TO_KEY[String(url).replace(/^\/+|\/+$/g, '').split('/')[0]]
    let item = { ...clone(body), id: nextId(db[key] || []) }
    if (key === 'cable') item = normCable(item)
    db[key].push(item)
    save(db)
    return { data: clone(item) }
  },
  async put(url, body) {
    const parts = String(url).replace(/^\/+|\/+$/g, '').split('/')
    const key = PLURAL_TO_KEY[parts[0]]
    const id = Number(parts[1])
    const list = db[key] || []
    const i = list.findIndex((x) => x.id === id)
    let item = { ...clone(body), id }
    if (key === 'cable') item = normCable(item)
    if (i >= 0) list[i] = item
    else list.push(item)
    save(db)
    return { data: clone(item) }
  },
  async patch(url, body) {
    const parts = String(url).replace(/^\/+|\/+$/g, '').split('/')
    const key = PLURAL_TO_KEY[parts[0]]
    const id = Number(parts[1])
    const list = db[key] || []
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) throw new Error('Item nao encontrado')
    let item = { ...list[i], ...clone(body) }
    if (key === 'cable') item = normCable(item)
    list[i] = item
    save(db)
    return { data: clone(item) }
  },
  async delete(url) {
    const parts = String(url).replace(/^\/+|\/+$/g, '').split('/')
    const key = PLURAL_TO_KEY[parts[0]]
    const id = Number(parts[1])
    db[key] = (db[key] || []).filter((x) => x.id !== id)
    save(db)
    return { data: {} }
  },
}

export const tokens = {
  get access() { return 'mock' },
  clear() {},
}

export function logout() {
  location.reload()
}

export function errText(e) {
  return e?.message || 'Falha ao comunicar com o servidor.'
}

export default api
