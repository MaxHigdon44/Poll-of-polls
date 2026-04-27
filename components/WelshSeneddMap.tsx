import { useEffect, useMemo, useRef } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type WelshSeneddMapProps = {
  constituencyGeo: FeatureCollection
  countriesGeo?: FeatureCollection | null
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
  onSelectCountry?: (country: 'england' | 'scotland' | 'wales') => void
}

function FitToWales({ constituencyGeo }: { constituencyGeo: FeatureCollection }) {
  const map = useMap()
  const lastBoundsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      if (!(map as any)._loaded) return
      const layer = L.geoJSON(constituencyGeo as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        const southWest = bounds.getSouthWest()
        const northEast = bounds.getNorthEast()
        const nextKey = [southWest.lat, southWest.lng, northEast.lat, northEast.lng]
          .map(value => value.toFixed(4))
          .join('|')
        if (lastBoundsKeyRef.current === nextKey) return
        lastBoundsKeyRef.current = nextKey
        map.flyToBounds(bounds, {
          padding: [20, 20],
          animate: true,
          duration: 0.35,
          easeLinearity: 0.2,
        })
        map.setMaxBounds(bounds.pad(0.1))
      }
    } catch {
      // Ignore transient Leaflet DOM positioning errors during unmounts.
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
  const lastBoundsKeyRef = useRef<string | null>(null)

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
    try {
      if (!selectedFeature || !(map as any)._loaded) return
      const layer = L.geoJSON(selectedFeature as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        const southWest = bounds.getSouthWest()
        const northEast = bounds.getNorthEast()
        const nextKey = [southWest.lat, southWest.lng, northEast.lat, northEast.lng]
          .map(value => value.toFixed(4))
          .join('|')
        if (lastBoundsKeyRef.current === nextKey) return
        lastBoundsKeyRef.current = nextKey
        map.flyToBounds(bounds, {
          padding: [20, 20],
          animate: true,
          duration: 0.35,
          easeLinearity: 0.2,
        })
      }
    } catch {
      // Ignore transient Leaflet DOM positioning errors during unmounts.
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

function escapeLabel(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function FeatureNameLabels({
  features,
  getLabel,
  minZoom,
  className,
}: {
  features: any[]
  getLabel: (feature: any) => string
  minZoom: number
  className: string
}) {
  const map = useMap()

  useEffect(() => {
    const markers: L.Marker[] = []
    const collides = (
      box: { left: number; right: number; top: number; bottom: number },
      boxes: Array<{ left: number; right: number; top: number; bottom: number }>
    ) =>
      boxes.some(
        other =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top
      )
    const getLayerCenter = (bounds: L.LatLngBounds) => {
      const northWest = map.latLngToLayerPoint(bounds.getNorthWest())
      const southEast = map.latLngToLayerPoint(bounds.getSouthEast())
      return L.point((northWest.x + southEast.x) / 2, (northWest.y + southEast.y) / 2)
    }
    const estimateBox = (label: string, point: L.Point) => {
      const width = Math.min(94, Math.max(34, label.length * 4.8 + 10))
      const lines = Math.max(1, Math.ceil((label.length * 4.8) / width))
      const height = Math.min(42, lines * 8 + 8)
      return {
        left: point.x - width / 2,
        right: point.x + width / 2,
        top: point.y - height / 2,
        bottom: point.y + height / 2,
      }
    }
    const clear = () => {
      while (markers.length) markers.pop()?.remove()
    }
    const render = () => {
      clear()
      if (!(map as any)._loaded || map.getZoom() < minZoom) return
      const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = []
      features.forEach(feature => {
        const label = getLabel(feature)
        if (!label) return
        const bounds = L.geoJSON(feature as GeoJsonObject).getBounds()
        if (!bounds.isValid()) return
        const point = getLayerCenter(bounds)
        const box = estimateBox(label, point)
        if (collides(box, occupied)) return
        occupied.push(box)
        markers.push(
          L.marker(map.layerPointToLatLng(point), {
            interactive: false,
            icon: L.divIcon({
              className: `poll-map-div-label ${className}`,
              html: escapeLabel(label),
              iconAnchor: [0, 0],
              iconSize: [0, 0],
            }),
          }).addTo(map)
        )
      })
    }
    render()
    map.on('zoomend', render)
    map.on('moveend', render)
    return () => {
      map.off('zoomend', render)
      map.off('moveend', render)
      clear()
    }
  }, [map, features, getLabel, minZoom, className])

  return null
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
  countriesGeo,
  projectedResults,
  onSelectConstituency,
  selectedName,
  onSelectCountry,
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
  const countryClickFeatures =
    countriesGeo?.features.filter(feature => {
      const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
      return name === 'england' || name === 'scotland'
    }) || []
  const countryBoundaryStyle = (feature?: any) => {
    const name = String(feature?.properties?.CTRY22NM || '').toLowerCase()
    const isUkCountry = name === 'england' || name === 'scotland' || name === 'wales'
    return {
      color: isUkCountry ? '#f8fafc' : 'transparent',
      weight: isUkCountry ? 1.6 : 0,
      fillColor: 'transparent',
      fillOpacity: 0,
      opacity: isUkCountry ? 0.9 : 0,
    }
  }

  return (
    <MapContainer
      center={[52.2, -3.7]}
      zoom={7}
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      preferCanvas
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {countriesGeo?.features?.length ? (
        <GeoJSON data={countriesGeo as GeoJsonObject} style={countryBoundaryStyle} interactive={false} />
      ) : null}
      {onSelectCountry && countryClickFeatures.length ? (
        <GeoJSON
          data={{ type: 'FeatureCollection', features: countryClickFeatures } as GeoJsonObject}
          style={() => ({
            color: 'transparent',
            weight: 0,
            fillColor: '#ffffff',
            fillOpacity: 0.01,
          })}
          onEachFeature={(feature, layer) => {
            const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
            if (name === 'england' || name === 'scotland') {
              layer.on('click', () => onSelectCountry(name))
            }
          }}
        />
      ) : null}
      <GeoJSON
        key={geoKey}
        data={constituencyGeo as GeoJsonObject}
        style={feature => {
          if (!feature) {
            return {
              color: '#dbeafe',
              weight: 1.2,
              fillColor: '#1d2636',
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
            color: isSelected ? '#ffffff' : '#f8fafc',
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
                .map(([party, value]) => `${party}: ${Math.round(value)}%`)
                .join('<br/>')
            : ''
          const projectedLines = result
            ? Object.entries(result.projected)
                .sort((a, b) => b[1] - a[1])
                .map(([party, value]) => `${party}: ${Math.round(value)}%`)
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
      <FeatureNameLabels
        features={constituencyGeo.features}
        minZoom={6}
        className="poll-map-div-label--seat"
        getLabel={feature => {
          const props: any = feature.properties || {}
          const rawName = props.english_na || props.enw_cymrae || ''
          return nameOverrides[rawName] || rawName
        }}
      />
      <FitToWales constituencyGeo={constituencyGeo} />
      <FocusSelectedConstituency constituencyGeo={constituencyGeo} selectedName={selectedName} />
    </MapContainer>
  )
}
