// Dados de exemplo da rede FTTH (usados enquanto nao ha backend).
const EARTH_R = 6371000

export function distanceM(a, b) {
  const [lat1, lng1] = a
  const [lat2, lng2] = b
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.sqrt(s))
}

export function pathLengthM(path) {
  let total = 0
  for (let i = 1; i < path.length; i++) total += distanceM(path[i - 1], path[i])
  return total
}

const seed = {
  olt: [
    { id: 1, name: 'OLT Centro', status: 'active', latitude: -23.5505, longitude: -46.6333 },
    { id: 2, name: 'OLT Zona Sul', status: 'active', latitude: -23.582, longitude: -46.64 },
  ],
  cto: [
    { id: 1, name: 'CTO 1', capacity: 16, splitter: '1:8', olt: 1, pon_port: '1/1', address: 'Rua A, 100', status: 'active', latitude: -23.552, longitude: -46.635 },
    { id: 2, name: 'CTO 2', capacity: 8, splitter: '1:8', olt: 1, pon_port: '1/2', address: 'Rua B, 250', status: 'active', latitude: -23.548, longitude: -46.63 },
    { id: 3, name: 'CTO 3', capacity: 16, splitter: '1:16', olt: 2, pon_port: '2/1', address: 'Rua C, 50', status: 'planned', latitude: -23.581, longitude: -46.639 },
  ],
  ceo: [
    { id: 1, name: 'CEO 1', model: 'CEO 24F', fiber_capacity: 24, status: 'active', latitude: -23.5535, longitude: -46.6375 },
  ],
  pole: [
    { id: 1, name: 'Poste 1', code: 'P-001', material: 'Concreto', height_m: 9, status: 'active', latitude: -23.551, longitude: -46.634 },
    { id: 2, name: 'Poste 2', code: 'P-002', material: 'Madeira', height_m: 7, status: 'maintenance', latitude: -23.5525, longitude: -46.636 },
  ],
  tower: [
    {
      id: 1, name: 'Torre Central', address: 'Rua D, 10', height_m: 30, status: 'active',
      latitude: -23.546, longitude: -46.628,
      radios: [{ id: 1, name: 'Radio 1', model: 'Ubiquiti', ip: '192.168.0.10', frequency: '5.8 GHz', azimuth: 120, observation: '' }],
    },
  ],
  customer: [
    { id: 1, name: 'Cliente 1', document: '000.000.000-00', phone: '(11) 90000-0000', address: 'Rua A, 110', plan: '300 Mbps', cto: 1, port: 1, status: 'active', latitude: -23.5528, longitude: -46.6358 },
    { id: 2, name: 'Cliente 2', document: '', phone: '(11) 90000-0001', address: 'Rua A, 120', plan: '500 Mbps', cto: 1, port: 2, status: 'active', latitude: -23.5522, longitude: -46.6365 },
    { id: 3, name: 'Cliente 3', document: '', phone: '(11) 90000-0002', address: 'Rua B, 260', plan: '200 Mbps', cto: 2, port: 1, status: 'active', latitude: -23.5478, longitude: -46.6308 },
  ],
  cable: [
    { id: 1, name: 'Backbone OLT-CEO', status: 'active', cable_type: 'backbone', fiber_count: 12, color: '#dc2626', weight: 6, path: [[-23.5505, -46.6333], [-23.5535, -46.6375], [-23.552, -46.635]], nodes: [{ type: 'olt', id: 1, index: 0 }, { type: 'ceo', id: 1, index: 1 }, { type: 'cto', id: 1, index: 2 }] },
    { id: 2, name: 'Cabo CTO1-CTO2', status: 'active', cable_type: 'aerial', fiber_count: 6, color: '#2563eb', weight: 4, path: [[-23.552, -46.635], [-23.548, -46.63]], nodes: [{ type: 'cto', id: 1, index: 0 }, { type: 'cto', id: 2, index: 1 }] },
    { id: 3, name: 'Drop Cliente 1', status: 'active', cable_type: 'drop', fiber_count: 1, color: '#000000', weight: 2, path: [[-23.552, -46.635], [-23.5528, -46.6358]], nodes: [{ type: 'cto', id: 1, index: 0 }, { type: 'customer', id: 1, index: 1 }] },
    { id: 4, name: 'Drop Cliente 2', status: 'active', cable_type: 'drop', fiber_count: 1, color: '#000000', weight: 2, path: [[-23.552, -46.635], [-23.5522, -46.6365]], nodes: [{ type: 'cto', id: 1, index: 0 }, { type: 'customer', id: 2, index: 1 }] },
    { id: 5, name: 'Drop Cliente 3', status: 'active', cable_type: 'drop', fiber_count: 1, color: '#000000', weight: 2, path: [[-23.548, -46.63], [-23.5478, -46.6308]], nodes: [{ type: 'cto', id: 2, index: 0 }, { type: 'customer', id: 3, index: 1 }] },
  ],
}

seed.cable = seed.cable.map((c) => ({ ...c, length_m: Math.round(pathLengthM(c.path)) }))

export const seedData = seed
