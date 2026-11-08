const POINT_TYPES = ['olt', 'cto', 'ceo', 'pole', 'tower', 'customer']

export function toGeoJSON(items) {
  const features = []

  for (const tipo of POINT_TYPES) {
    for (const it of items[tipo] || []) {
      if (it.latitude == null || it.longitude == null) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [it.longitude, it.latitude] },
        properties: { ...it, categoria: tipo },
      })
    }
  }

  for (const c of items.cable || []) {
    if (!c.path || c.path.length < 2) continue
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: c.path.map(([lat, lng]) => [lng, lat]),
      },
      properties: { ...c, categoria: 'cable' },
    })
  }

  return { type: 'FeatureCollection', features }
}
