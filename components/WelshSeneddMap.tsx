import { useEffect, useMemo, useRef } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type WelshSeneddMapProps = {
  constituencyGeo: FeatureCollection
  projectedResults: Map<
    string,
    {
      baseline: Record<string, number>
      projected: Record<string, number>
      projectedWinner: string | null
      seats: Record<string, number>
    }
  >
  onSelectConstituency?: (payload: {
    name: string
    result: {
      baseline: Record<string, number>
      projected: Record<string, number>
      projectedWinner: string | null
      seats: Record<string, number>
    } | null
  }) => void
  selectedName?: string | null
}

function FitToWales({ constituencyGeo }: { constituencyGeo: FeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    const layer = L.geoJSON(constituencyGeo as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
      map.setMaxBounds(bounds.pad(0.1))
    }
  }, [map, constituencyGeo])

  return null
}

function FocusSelectedConstituency({
  constituencyGeo,
  selectedName,
}: {
  constituencyGeo: FeatureCollection
  selectedName?: string | null
}) {
  const map = useMap()

  const selectedFeature = useMemo(() => {
    if (!selectedName) return null
    const normalizedTarget = normalizeWelshName(selectedName)
    return (
      constituencyGeo.features.find(feature => {
        const props: any = feature.properties || {}
        const rawName = props.english_na || props.enw_cymrae || ''
        const displayName = rawName
        const normalizedRaw = normalizeWelshName(rawName)
        const normalizedDisplay = normalizeWelshName(displayName)
        return normalizedTarget === normalizedRaw || normalizedTarget === normalizedDisplay
      }) || null
    )
  }, [constituencyGeo.features, selectedName])

  useEffect(() => {
    if (!selectedFeature) return
    const layer = L.geoJSON(selectedFeature as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, selectedFeature])

  return null
}

function normalizeWelshName(name: string) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getWinnerColor(winner: string | null) {
  if (winner === 'Labour') return '#E4003B'
  if (winner === 'Conservative') return '#0087DC'
  if (winner === 'Plaid Cymru') return '#008672'
  if (winner === 'Liberal Democrat') return '#FAA61A'
  if (winner === 'Reform') return '#12B6CF'
  if (winner === 'Green') return '#02A95B'
  return '#9a9a9a'
}

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  'Plaid Cymru': '#008672',
  'Liberal Democrat': '#FAA61A',
  Reform: '#12B6CF',
  Green: '#02A95B',
  Other: '#9a9a9a',
}

function getSeatOffsets(count: number) {
  if (count <= 1) return [[0, 0]]
  const radius = 18
  const offsets: number[][] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2
    offsets.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
  }
  return offsets
}
const SEAT_RING_RADIUS = 16
const SEAT_RING_STROKE = '#1f2a44'

function ringContainsPoint(ring: number[][], point: [number, number]) {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function polygonContainsPoint(polygonCoords: number[][][], point: [number, number]) {
  if (!polygonCoords.length) return false
  const outer = polygonCoords[0]
  if (!ringContainsPoint(outer, point)) return false
  for (let i = 1; i < polygonCoords.length; i++) {
    if (ringContainsPoint(polygonCoords[i], point)) return false
  }
  return true
}

function featureContainsPoint(feature: any, point: [number, number]) {
  const geom = feature?.geometry
  if (!geom) return false
  if (geom.type === 'Polygon') {
    return polygonContainsPoint(geom.coordinates, point)
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some((coords: number[][][]) => polygonContainsPoint(coords, point))
  }
  return false
}

function randomPointInBBox(bbox: [number, number, number, number]) {
  const [minX, minY, maxX, maxY] = bbox
  return [minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY)] as [
    number,
    number,
  ]
}

function bboxForCoords(coords: number[][][], bbox: [number, number, number, number]) {
  for (const ring of coords) {
    for (const [x, y] of ring) {
      if (x < bbox[0]) bbox[0] = x
      if (y < bbox[1]) bbox[1] = y
      if (x > bbox[2]) bbox[2] = x
      if (y > bbox[3]) bbox[3] = y
    }
  }
}

function featureBBox(feature: any): [number, number, number, number] {
  const geom = feature?.geometry
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
  if (!geom) return bbox
  if (geom.type === 'Polygon') {
    bboxForCoords(geom.coordinates, bbox)
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      bboxForCoords(poly, bbox)
    }
  }
  return bbox
}

function findInteriorPoint(feature: any) {
  const bbox = featureBBox(feature)
  if (!Number.isFinite(bbox[0])) return null
  const center: [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  if (featureContainsPoint(feature, center)) return center
  for (let i = 0; i < 200; i += 1) {
    const point = randomPointInBBox(bbox)
    if (featureContainsPoint(feature, point)) return point
  }
  return center
}

export default function WelshSeneddMap({
  constituencyGeo,
  projectedResults,
  onSelectConstituency,
  selectedName,
}: WelshSeneddMapProps) {
  const geoKey = `senedd-${constituencyGeo.features.length}-${projectedResults.size}`
  const selectedRef = useRef<L.Path | null>(null)
  const nameOverrides: Record<string, string> = {
    'Bangor Conwy Môn': 'Bangor Conwy Môn',
    Clwyd: 'Clwyd',
    'Fflint Wrecsam': 'Fflint Wrecsam',
    'Gwynedd Maldwyn': 'Gwynedd Maldwynn',
    'Ceredigion Penfro': 'Ceredigion Penifro',
    'Sir Gaerfyrddin': 'Sir Gaerfyrddin',
  }

  return (
    <MapContainer
      center={[52.2, -3.7]}
      zoom={7}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        key={geoKey}
        data={constituencyGeo as GeoJsonObject}
        style={feature => {
          if (!feature) {
            return {
              color: '#2D3A52',
              weight: 1.2,
              fillColor: '#e2e2e2',
              fillOpacity: 0.35,
            }
          }
          const props: any = feature.properties || {}
          const rawName = props.english_na || props.enw_cymrae || ''
          const displayName = nameOverrides[rawName] || rawName
          const normalizedRaw = normalizeWelshName(rawName)
          const normalizedDisplay = normalizeWelshName(displayName)
          const result = projectedResults.get(normalizedRaw)
          const isSelected = selectedName
            ? normalizeWelshName(selectedName) === normalizedDisplay
            : false
          return {
            color: isSelected ? '#111' : '#2D3A52',
            weight: isSelected ? 4.5 : 1.2,
            fillColor: getWinnerColor(result?.projectedWinner || null),
            fillOpacity: isSelected ? 0.6 : 0.45,
          }
        }}
        onEachFeature={(feature, layer) => {
          const props: any = feature.properties || {}
          const rawName = props.english_na || props.enw_cymrae || 'Constituency'
          const displayName = nameOverrides[rawName] || rawName
          const normalizedRaw = normalizeWelshName(rawName)
          const result = projectedResults.get(normalizedRaw)
          const baselineLines = result
            ? Object.entries(result.baseline)
                .sort((a, b) => b[1] - a[1])
                .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
                .join('<br/>')
            : ''
          const projectedLines = result
            ? Object.entries(result.projected)
                .sort((a, b) => b[1] - a[1])
                .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
                .join('<br/>')
            : ''
          const seatLines = result?.seats
            ? Object.entries(result.seats)
                .filter(([, seats]) => seats > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([party, seats]) => `${party}: ${seats}`)
                .join('<br/>')
            : ''
          layer.on('click', () => {
            onSelectConstituency?.({
              name: displayName,
              result: result || null,
            })
          })

          if (result?.seats) {
            const map = (layer as any)._map
            if (map) {
              const existing = (layer as any)._seatBorder
              if (existing) existing.remove()
              const borderWeight = 4
              const parties = Object.entries(result.seats)
                .filter(([, seats]) => seats > 0)
                .sort((a, b) => b[1] - a[1])
              if (parties.length) {
                const total = parties.reduce((sum, [, seats]) => sum + seats, 0) || 1
                const segmentLayers: any[] = []
                let offset = 0
                parties.forEach(([party, seats]) => {
                  const length = Math.max(1, Math.round((seats / total) * 12))
                  const dashArray = `${length} ${Math.max(2, 12 - length)}`
                  const dashOffset = `-${offset}`
                  offset += length
                  const segment = L.geoJSON(feature as any, {
                    style: () => ({
                      color: PARTY_COLORS[party] || '#9a9a9a',
                      weight: borderWeight,
                      opacity: 0.95,
                      fillOpacity: 0,
                      dashArray,
                      dashOffset,
                    }),
                  })
                  segment.addTo(map)
                  segmentLayers.push(segment)
                })
                ;(layer as any)._seatBorder = {
                  remove: () => segmentLayers.forEach(segment => segment.remove()),
                }
                layer.on('remove', () => {
                  segmentLayers.forEach(segment => segment.remove())
                })
              }
            }
          }

        }}
      />
      <FitToWales constituencyGeo={constituencyGeo} />
      <FocusSelectedConstituency constituencyGeo={constituencyGeo} selectedName={selectedName} />
    </MapContainer>
  )
}
