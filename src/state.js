import { reactive } from 'vue'

export const state = reactive({
  branding: { company_name: 'Dukon', primary_color: '#0e7c86', logo_url: '' },
  settings: {
    map_lat: -23.55,
    map_lng: -46.63,
    map_zoom: 14,
    distance_unit: 'auto',
    custom_tile_url: '',
  },
  user: { username: 'Admin', role: 'admin' },
})

export function applyBranding(b) {
  Object.assign(state.branding, b)
  document.documentElement.style.setProperty('--primary', b.primary_color)
  document.title = `${b.company_name} - Mapeamento FTTH`
}

const UNITS = { m: ['m', 1], km: ['km', 0.001], ft: ['ft', 3.28084], mi: ['mi', 0.000621371] }

export function formatDist(meters, unit) {
  unit = unit || state.settings?.distance_unit || 'auto'
  const m = Number(meters) || 0
  if (unit === 'auto') return m < 1000 ? `${m.toFixed(1)} m` : `${(m / 1000).toFixed(3)} km`
  const [label, f] = UNITS[unit]
  return `${(m * f).toFixed(unit === 'km' || unit === 'mi' ? 3 : 1)} ${label}`
}
