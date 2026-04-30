import { useEffect, useRef } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import type { Feature, FeatureCollection } from 'geojson'
import type { Layer } from 'leaflet'
import L from 'leaflet'
import { allocateProjectedSeats, getSeatAllocationLabel } from '@/lib/local2026/multiMember'

type GeoFeature = Feature
type GeoCollection = FeatureCollection

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  Reform: '#12B6CF',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  SNP: '#FDF38E',
  'Plaid Cymru': '#008672',
  Other: '#9a9a9a',
  Independent: '#9a9a9a',
}

function formatDisplayPartyLabel(party: string) {
  const trimmed = String(party || '').trim()
  if (!trimmed) return trimmed
  const knownLabels = new Set([
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
    'Other',
    'Independent',
  ])
  if (knownLabels.has(trimmed)) return trimmed

  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return trimmed.charAt(0) + trimmed.slice(1).toLowerCase()
  }
  return trimmed
}

type LocalMapProps = {
  baseGeo?: GeoCollection | null
  countriesGeo?: GeoCollection | null
  onSelectCountry?: (country: 'england' | 'scotland' | 'wales') => void
  ladGeo: GeoCollection
  displayMode?: 'projected' | 'incumbent'
  overlayAreas?: GeoCollection | null
  boundaryAreas?: GeoCollection | null
  overlayAreaCodes?: Set<string>
  hiddenLadCodes?: Set<string>
  wardFeatures: GeoFeature[]
  contestedWardCodes?: Set<string>
  contestedWardNameKeys?: Set<string>
  wardVacancies?: Map<string, number>
  wardVacanciesByName?: Map<string, number>
  wardMap: Map<
    string,
    {
      winner: string
      shares: Record<string, number>
      color: string
      prevWinner?: string | null
      seatAllocation?: Record<string, number>
    }
  >
  wardMapByName: Map<
    string,
    {
      winner: string
      shares: Record<string, number>
      color: string
      prevWinner?: string | null
      seatAllocation?: Record<string, number>
    }
  >
  wardMapByWardName?: Map<
    string,
    {
      winner: string
      shares: Record<string, number>
      color: string
      prevWinner?: string | null
      seatAllocation?: Record<string, number>
    }
  >
  fallbackProjection?: {
    winner: string
    shares: Record<string, number>
    color: string
    prevWinner?: string | null
    seatAllocation?: Record<string, number>
  } | null
  selectedLad: string | null
  selectedLadFeature: GeoFeature | null
  onSelectLad: (lad: string | null) => void
  focusedWardLadCode?: string | null
  focusedWardCode?: string | null
  focusedWardNameKey?: string | null
  eligibleLads: Set<string>
  ladCategoryByCode: Map<string, 'county' | 'district' | 'london' | 'metro' | 'unitary'>
  projectedControlByLad?: Map<string, string>
  projectedControlByName?: Map<string, string>
  nonContestedLabel?: string
  previousWinnerLabel?: string
}

function FitBounds({ feature }: { feature: GeoFeature | null }) {
  const map = useMap()
  useEffect(() => {
    if (!feature) return
    try {
      if (!map || !(map as any)._loaded) return
      const layer = L.geoJSON(feature as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], animate: false })
      }
    } catch {
      // ignore transient leaflet unmount errors
    }
  }, [feature, map])
  return null
}

function PatternDefs() {
  const map = useMap()

  useEffect(() => {
    const ensurePattern = () => {
      const panes = map.getPanes?.()
      const overlayPane = panes?.overlayPane
      if (!overlayPane) return
      const svg = overlayPane.querySelector('svg')
      if (!svg) return
      let defs = svg.querySelector('defs')
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        svg.prepend(defs)
      }
      if (svg.querySelector('#non-contested-stripes')) return
      const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
      pattern.setAttribute('id', 'non-contested-stripes')
      pattern.setAttribute('patternUnits', 'userSpaceOnUse')
      pattern.setAttribute('width', '8')
      pattern.setAttribute('height', '8')
      pattern.setAttribute('patternTransform', 'rotate(45)')

      const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      background.setAttribute('width', '8')
      background.setAttribute('height', '8')
      background.setAttribute('fill', '#d9d9d9')
      pattern.appendChild(background)

      const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      stripe.setAttribute('width', '4')
      stripe.setAttribute('height', '8')
      stripe.setAttribute('fill', '#b3b3b3')
      pattern.appendChild(stripe)

      defs.appendChild(pattern)
    }

    try {
      ensurePattern()
      const observer = new MutationObserver(() => {
        try {
          ensurePattern()
        } catch {
          // ignore transient leaflet unmount errors
        }
      })
      const overlayPane = map.getPanes?.().overlayPane
      if (overlayPane) {
        observer.observe(overlayPane, { childList: true, subtree: true })
      }
      return () => observer.disconnect()
    } catch {
      return undefined
    }
  }, [map])

  return null
}

function BasePanes() {
  const map = useMap()

  useEffect(() => {
    const basePane = map.getPane('basePane') || map.createPane('basePane')
    const outlinePane = map.getPane('outlinePane') || map.createPane('outlinePane')
    basePane.style.zIndex = '200'
    outlinePane.style.zIndex = '210'
  }, [map])

  return null
}

function InvalidateSize({ deps }: { deps: Array<unknown> }) {
  const map = useMap()
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (!map || !(map as any)._loaded) return
        const container = map.getContainer?.()
        if (!container) return
        map.invalidateSize()
      } catch {
        // ignore transient leaflet unmount errors
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [map, ...deps])
  return null
}

function FocusWardPopup({
  selectedLad,
  targetLadCode,
  wardCode,
  wardNameKey,
  layerVersion,
}: {
  selectedLad: string | null
  targetLadCode?: string | null
  wardCode?: string | null
  wardNameKey?: string | null
  layerVersion: number
}) {
  const map = useMap()
  useEffect(() => {
    if (!wardCode && !wardNameKey) return
    if (targetLadCode && selectedLad !== targetLadCode) return
    const id = window.setTimeout(() => {
      try {
        if (!map || !(map as any)._loaded) return
        let targetLayer: any = null
        map.eachLayer((layer: any) => {
          const feature = layer?.feature as GeoFeature | undefined
          if (!feature) return
          const code = getWardCode(feature)
          const nameKey = getWardNameKey(feature)
          if ((wardCode && code === wardCode) || (wardNameKey && nameKey === wardNameKey)) {
            targetLayer = layer
          }
        })
        if (!targetLayer) return
        const bounds = targetLayer.getBounds?.()
        if (bounds?.isValid?.()) {
          map.fitBounds(bounds, { padding: [36, 36], animate: false })
        }
        targetLayer.openPopup?.()
      } catch {
        // ignore transient leaflet layer swap errors
      }
    }, 320)
    return () => window.clearTimeout(id)
  }, [map, selectedLad, targetLadCode, wardCode, wardNameKey, layerVersion])
  return null
}

function getWardCode(feature: GeoFeature) {
  const props: any = feature.properties || {}
  return (
    props.reference ||
    props.CED25CD ||
    props.CED24CD ||
    props.WD25CD ||
    props.WD23CD ||
    props.WD22CD ||
    null
  )
}

function getWardNameKey(feature: GeoFeature) {
  const props: any = feature.properties || {}
  const wardName = String(
    props.CED25NM || props.CED24NM || props.WD25NM || props.WD23NM || props.WD22NM || props.name || ''
  )
    .replace(/\s+ed$/i, '')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
  const ladName = String(
    props.CTY25NM ||
      props.CTY24NM ||
      props.LAD25NM ||
      props.LAD23NM ||
      props.LAD22NM ||
      props.ladName ||
      ''
  )
    .replace(/\bcounty\b/gi, ' ')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!wardName || !ladName) return null
  return `${ladName}|${wardName}`
}

function getWardDisplayName(feature: GeoFeature) {
  const props: any = feature.properties || {}
  return (
    props.CED25NM ||
    props.CED24NM ||
    props.WD25NM ||
    props.WD23NM ||
    props.WD22NM ||
    props.name ||
    'Ward'
  )
}

function normalizeMapName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/\bcounty council\b/g, ' ')
    .replace(/\bcouncil\b/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getPartyStripePatternId(primary: string, secondary: string) {
  const a = primary.replace('#', '')
  const b = secondary.replace('#', '')
  return `party-stripes-${a}-${b}`
}

function ensurePartyStripePattern(primary: string, secondary: string) {
  if (typeof document === 'undefined') return null
  const svg = document.querySelector('.leaflet-overlay-pane svg')
  if (!svg) return null
  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.prepend(defs)
  }
  const id = getPartyStripePatternId(primary, secondary)
  if (svg.querySelector(`#${id}`)) return id

  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
  pattern.setAttribute('id', id)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', '8')
  pattern.setAttribute('height', '8')
  pattern.setAttribute('patternTransform', 'rotate(45)')

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  background.setAttribute('width', '8')
  background.setAttribute('height', '8')
  background.setAttribute('fill', primary)
  pattern.appendChild(background)

  const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  stripe.setAttribute('width', '4')
  stripe.setAttribute('height', '8')
  stripe.setAttribute('fill', secondary)
  pattern.appendChild(stripe)

  defs.appendChild(pattern)
  return id
}

function getElectedParties(
  projection: { shares: Record<string, number>; seatAllocation?: Record<string, number> } | null | undefined,
  vacancies: number
) {
  const seatAllocation = projection?.seatAllocation || allocateProjectedSeats(projection?.shares || {}, vacancies)
  const electedParties = Object.entries(seatAllocation)
    .filter(([, seats]) => seats > 0)
    .sort((a, b) => b[1] - a[1])
  return { seatAllocation, electedParties }
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
  features: GeoFeature[]
  getLabel: (feature: GeoFeature) => string
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
    const getRingCentroid = (ring: number[][]) => {
      let area = 0
      let cx = 0
      let cy = 0
      for (let index = 0; index < ring.length - 1; index += 1) {
        const [x1, y1] = ring[index]
        const [x2, y2] = ring[index + 1]
        const cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
      }
      area *= 0.5
      if (Math.abs(area) < 1e-12) {
        return {
          lat: ring[0]?.[1] ?? 0,
          lng: ring[0]?.[0] ?? 0,
          area: 0,
        }
      }
      return {
        lat: cy / (6 * area),
        lng: cx / (6 * area),
        area: Math.abs(area),
      }
    }
    const isPointInRing = (point: L.Point, ring: L.Point[]) => {
      let inside = false
      for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
        const xi = ring[index].x
        const yi = ring[index].y
        const xj = ring[previous].x
        const yj = ring[previous].y
        const intersects =
          yi > point.y !== yj > point.y &&
          point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi
        if (intersects) inside = !inside
      }
      return inside
    }
    const getLayerRings = (feature: GeoFeature) => {
      const geometry = feature.geometry as any
      const coordinates = geometry?.coordinates
      if (!geometry?.type || !coordinates) return [] as L.Point[][]
      const polygonRings: number[][][] =
        geometry.type === 'Polygon'
          ? [coordinates[0]]
          : geometry.type === 'MultiPolygon'
            ? coordinates.map((polygon: number[][][]) => polygon[0]).filter(Boolean)
            : []
      return polygonRings.map(ring =>
        ring.map(vertex => {
          const [lng, lat] = vertex as [number, number]
          return map.latLngToLayerPoint(L.latLng(lat, lng))
        })
      )
    }
    const featureContainsLayerPoint = (feature: GeoFeature, point: L.Point) => {
      const rings = getLayerRings(feature)
      return rings.some(ring => ring.length >= 3 && isPointInRing(point, ring))
    }
    const getCandidateFeaturePoints = (feature: GeoFeature, bounds: L.LatLngBounds) => {
      const geometry = feature.geometry as any
      const coordinates = geometry?.coordinates
      if (!geometry?.type || !coordinates) {
        return [map.latLngToLayerPoint(bounds.getCenter())]
      }

      const candidates: L.Point[] = []
      const props = (feature.properties || {}) as Record<string, unknown>
      const labelLat = Number(props.labelLat)
      const labelLng = Number(props.labelLng)
      if (Number.isFinite(labelLat) && Number.isFinite(labelLng)) {
        const anchored = map.latLngToLayerPoint(L.latLng(labelLat, labelLng))
        if (featureContainsLayerPoint(feature, anchored)) {
          candidates.push(anchored)
        }
      }

      const polygonRings: number[][][] =
        geometry.type === 'Polygon'
          ? [coordinates[0]]
          : geometry.type === 'MultiPolygon'
            ? coordinates.map((polygon: number[][][]) => polygon[0]).filter(Boolean)
            : []

      let totalArea = 0
      let weightedLat = 0
      let weightedLng = 0
      polygonRings.forEach(ring => {
        const centroid = getRingCentroid(ring)
        if (!Number.isFinite(centroid.lat) || !Number.isFinite(centroid.lng)) return
        if (centroid.area <= 0) return
        totalArea += centroid.area
        weightedLat += centroid.lat * centroid.area
        weightedLng += centroid.lng * centroid.area
      })

      if (totalArea > 0) {
        const centroidPoint = map.latLngToLayerPoint(
          L.latLng(weightedLat / totalArea, weightedLng / totalArea)
        )
        if (featureContainsLayerPoint(feature, centroidPoint)) {
          candidates.push(centroidPoint)
        }
      }

      const boundsCenter = map.latLngToLayerPoint(bounds.getCenter())
      if (featureContainsLayerPoint(feature, boundsCenter)) {
        candidates.push(boundsCenter)
      }

      const northWest = map.latLngToLayerPoint(bounds.getNorthWest())
      const southEast = map.latLngToLayerPoint(bounds.getSouthEast())
      for (let row = 1; row <= 10; row += 1) {
        for (let column = 1; column <= 10; column += 1) {
          const candidate = L.point(
            northWest.x + ((southEast.x - northWest.x) * column) / 11,
            northWest.y + ((southEast.y - northWest.y) * row) / 11
          )
          if (featureContainsLayerPoint(feature, candidate)) {
            candidates.push(candidate)
          }
        }
      }

      const deduped: L.Point[] = []
      candidates.forEach(candidate => {
        const exists = deduped.some(
          point => Math.abs(point.x - candidate.x) < 1 && Math.abs(point.y - candidate.y) < 1
        )
        if (!exists) deduped.push(candidate)
      })

      return deduped.sort((a, b) => a.distanceTo(boundsCenter) - b.distanceTo(boundsCenter))
    }
    const estimateBox = (label: string, point: L.Point) => {
      const width = Math.min(78, Math.max(28, label.length * 4.4 + 8))
      const lines = Math.max(1, Math.ceil((label.length * 4.4) / width))
      const height = Math.min(36, lines * 7 + 7)
      return {
        left: point.x - width / 2,
        right: point.x + width / 2,
        top: point.y - height / 2,
        bottom: point.y + height / 2,
      }
    }
    const boxFitsInsideFeature = (
      feature: GeoFeature,
      box: { left: number; right: number; top: number; bottom: number }
    ) => {
      const samplePoints = [
        L.point(box.left, box.top),
        L.point(box.right, box.top),
        L.point(box.left, box.bottom),
        L.point(box.right, box.bottom),
        L.point((box.left + box.right) / 2, box.top),
        L.point((box.left + box.right) / 2, box.bottom),
        L.point(box.left, (box.top + box.bottom) / 2),
        L.point(box.right, (box.top + box.bottom) / 2),
        L.point((box.left + box.right) / 2, (box.top + box.bottom) / 2),
      ]
      return samplePoints.every(point => featureContainsLayerPoint(feature, point))
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
        const candidatePoints = getCandidateFeaturePoints(feature, bounds)
        const point = candidatePoints.find(candidate => {
          const box = estimateBox(label, candidate)
          return boxFitsInsideFeature(feature, box)
        })
        if (!point) return
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

export default function LocalMap({
  ladGeo,
  baseGeo,
  countriesGeo,
  onSelectCountry,
  displayMode = 'projected',
  overlayAreas,
  boundaryAreas,
  overlayAreaCodes,
  hiddenLadCodes,
  wardFeatures,
  contestedWardCodes,
  contestedWardNameKeys,
  wardVacancies,
  wardVacanciesByName,
  wardMap,
  wardMapByName,
  wardMapByWardName,
  fallbackProjection,
  selectedLad,
  selectedLadFeature,
  onSelectLad,
  focusedWardLadCode,
  focusedWardCode,
  focusedWardNameKey,
  eligibleLads,
  ladCategoryByCode,
  projectedControlByLad,
  projectedControlByName,
  nonContestedLabel = 'Not contested',
  previousWinnerLabel = 'Incumbent',
}: LocalMapProps) {
  const pendingSelectionRef = useRef<number | null>(null)

  useEffect(() => {
    const prevAutoPan = L.Popup.prototype.options.autoPan
    const prevKeepInView = (L.Popup.prototype.options as any).keepInView
    L.Popup.prototype.options.autoPan = false
    ;(L.Popup.prototype.options as any).keepInView = false
    return () => {
      L.Popup.prototype.options.autoPan = prevAutoPan
      ;(L.Popup.prototype.options as any).keepInView = prevKeepInView
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pendingSelectionRef.current != null) {
        window.clearTimeout(pendingSelectionRef.current)
      }
    }
  }, [])

  const selectLadWithCamera = (ladCode: string, event: any) => {
    if (pendingSelectionRef.current != null) {
      window.clearTimeout(pendingSelectionRef.current)
    }
    const layer = event?.sourceTarget || event?.target
    const map = layer?._map
    const bounds = layer?.getBounds?.()
    if (map && bounds?.isValid?.()) {
      try {
        map.stop?.()
        map.closePopup?.()
        map.flyToBounds(bounds, {
          padding: [34, 34],
          animate: true,
          duration: 0.36,
          easeLinearity: 0.18,
        })
        pendingSelectionRef.current = window.setTimeout(() => {
          pendingSelectionRef.current = null
          onSelectLad(ladCode)
        }, 260)
        return
      } catch {
        // Fall back to immediate selection if the map is between layer states.
      }
    }
    onSelectLad(ladCode)
  }
  const countyFeatures = ladGeo.features.filter(feature => {
    const code = feature.properties?.reference
    return code && ladCategoryByCode.get(code) === 'county'
  })

  const nonCountyFeatures = ladGeo.features.filter(feature => {
    const code = feature.properties?.reference
    return !code || ladCategoryByCode.get(code) !== 'county'
  })

  const eligibleCountyFeatures = countyFeatures.filter(feature => {
    const code = feature.properties?.reference
    return Boolean(code && eligibleLads.has(code))
  })

  const nonEligibleCountyFeatures = countyFeatures.filter(feature => {
    const code = feature.properties?.reference
    return Boolean(code && !eligibleLads.has(code))
  })

  const eligibleNonCountyFeatures = nonCountyFeatures.filter(feature => {
    const code = feature.properties?.reference
    return Boolean(code && eligibleLads.has(code))
  })

  const nonEligibleNonCountyFeatures = nonCountyFeatures.filter(feature => {
    const code = feature.properties?.reference
    return Boolean(code && !eligibleLads.has(code))
  })

  const ladStyle = (feature?: GeoFeature) => {
    if (!feature) {
      return {
        color: '#bbb',
        weight: 1,
        fillColor: '#f5f5f5',
        fillOpacity: 0.1,
      }
    }
    const ladCode = feature.properties?.reference
    if (ladCode && hiddenLadCodes?.has(ladCode)) {
      return {
        color: 'transparent',
        weight: 0,
        fillColor: 'transparent',
        fillOpacity: 0,
      }
    }
    const isEligible = ladCode && eligibleLads.has(ladCode)
    const category = ladCode ? ladCategoryByCode.get(ladCode) : null
    if (!isEligible) {
      return {
        color: 'transparent',
        weight: 0,
        fillColor: 'transparent',
        fillOpacity: 0,
      }
    }
    const projectedControl =
      (ladCode ? projectedControlByLad?.get(ladCode) : null) ||
      projectedControlByName?.get(normalizeMapName(feature.properties?.name))
    const projectedParty =
      projectedControl && projectedControl !== 'No overall control'
        ? formatDisplayPartyLabel(projectedControl.replace(/\s+majority$/i, ''))
        : null
    const fillColor = projectedParty
      ? PARTY_COLORS[projectedParty] || '#9a9a9a'
      : '#9ca3af'
    const strokeColor = projectedParty
      ? PARTY_COLORS[projectedParty] || '#7f7f7f'
      : '#6b7280'
    return {
      color: strokeColor,
      weight: 2,
      fillColor,
      fillOpacity: category === 'county' ? 0.32 : 0.38,
    }
  }

  const countyOutlineStyle = (feature?: GeoFeature) => ({
    color: feature ? ladStyle(feature).color : '#f8fafc',
    weight: 2.4,
    fillColor: 'transparent',
    fillOpacity: 0,
    opacity: 0.95,
  })

  const countyFillStyle = (feature?: GeoFeature) => {
    const style = ladStyle(feature)
    return {
      color: 'transparent',
      weight: 0,
      fillColor: style.fillColor,
      fillOpacity: style.fillOpacity,
    }
  }

  const baseStyle = () => ({
    color: 'transparent',
    weight: 0,
    fillColor: 'transparent',
    fillOpacity: 0,
    opacity: 0,
  })

  const countryBoundaryStyle = (feature?: GeoFeature) => {
    const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
    const isUkCountry = name === 'england' || name === 'scotland' || name === 'wales'
    return {
      color: isUkCountry ? '#f8fafc' : 'transparent',
      weight: isUkCountry ? 1.6 : 0,
      fillColor: 'transparent',
      fillOpacity: 0,
      opacity: isUkCountry ? 0.9 : 0,
    }
  }

  const countryClickFeatures =
    countriesGeo?.features.filter(feature => {
      const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
      return name === 'scotland' || name === 'wales'
    }) || []

  const overlayStyle = () => ({
    color: 'transparent',
    weight: 0,
    fillColor: '#1E88E5',
    fillOpacity: 0.35,
  })

  const boundaryStyle = () => ({
    color: '#1565C0',
    weight: 2,
    fillColor: 'transparent',
    fillOpacity: 0,
    opacity: 0.9,
  })

  const wardStyle = (feature?: GeoFeature) => {
    if (!feature) {
      return {
        color: '#f8fafc',
        weight: 0.5,
        fillColor: '#1d2636',
        fillOpacity: 0.45,
      }
    }
    const wardCode = getWardCode(feature)
    const wardNameKey = getWardNameKey(feature)
    const isContested =
      !selectedLad ||
      ((!contestedWardCodes || contestedWardCodes.size === 0) &&
        (!contestedWardNameKeys || contestedWardNameKeys.size === 0)) ||
      (wardCode ? contestedWardCodes?.has(wardCode) : false) ||
      (wardNameKey ? contestedWardNameKeys?.has(wardNameKey) : false)
    if (!isContested) {
      return {
        color: '#777',
        weight: 1,
        dashArray: '4 4',
        className: 'non-contested-ward',
        fillColor: 'url(#non-contested-stripes)',
        fillOpacity: 1,
      }
    }
    const projection =
      wardMap.get(wardCode) ||
      wardMapByName.get(getWardNameKey(feature) || '') ||
      wardMapByWardName?.get(String(getWardDisplayName(feature)).toLowerCase()) ||
      fallbackProjection
    const vacancies =
      (wardCode ? wardVacancies?.get(wardCode) : 0) ||
      (wardNameKey ? wardVacanciesByName?.get(wardNameKey) : 0) ||
      1
    const projectedColor = projection ? projection.color || '#ccc' : '#ccc'
    const incumbentColor =
      projection?.prevWinner ? PARTY_COLORS[formatDisplayPartyLabel(projection.prevWinner)] || '#9a9a9a' : '#9a9a9a'
    const color = displayMode === 'incumbent' ? incumbentColor : projectedColor
    const { electedParties } = getElectedParties(projection, vacancies)
    if (displayMode !== 'incumbent' && electedParties.length >= 2) {
      const primaryColor = PARTY_COLORS[electedParties[0][0]] || color
      const secondaryColor = PARTY_COLORS[electedParties[1][0]] || '#9a9a9a'
      const id = ensurePartyStripePattern(primaryColor, secondaryColor)
      if (id) {
        return {
          color: '#f8fafc',
          weight: 0.5,
          fillColor: `url(#${id})`,
          fillOpacity: 0.7,
        }
      }
    }
    return {
      color: '#f8fafc',
      weight: 0.5,
      fillColor: color,
      fillOpacity: 0.7,
    }
  }

  const wardOnEachFeature = (feature: GeoFeature, layer: Layer) => {
    const wardCode = getWardCode(feature)
    const wardName = getWardDisplayName(feature)
    const wardNameKey = getWardNameKey(feature)
    const isContested =
      !selectedLad ||
      ((!contestedWardCodes || contestedWardCodes.size === 0) &&
        (!contestedWardNameKeys || contestedWardNameKeys.size === 0)) ||
      (wardCode ? contestedWardCodes?.has(wardCode) : false) ||
      (wardNameKey ? contestedWardNameKeys?.has(wardNameKey) : false)
    if (!isContested) {
      layer.bindPopup(`<strong>${wardName}</strong><br/>${nonContestedLabel}`, {
        autoPan: false,
      })
      return
    }
    const projection =
      wardMap.get(wardCode) ||
      wardMapByName.get(getWardNameKey(feature) || '') ||
      wardMapByWardName?.get(String(getWardDisplayName(feature)).toLowerCase()) ||
      fallbackProjection
    if (!projection) return

    const sorted = Object.entries(projection.shares)
      .map(([party, value]) => ({ party, value: Number(value) }))
      .filter(entry => Number.isFinite(entry.value))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
    const vacancies =
      (wardCode ? wardVacancies?.get(wardCode) : 0) ||
      (wardNameKey ? wardVacanciesByName?.get(wardNameKey) : 0) ||
      1
    const { seatAllocation, electedParties } = getElectedParties(projection, vacancies)
    if (displayMode !== 'incumbent' && electedParties.length >= 2 && 'setStyle' in layer) {
      const primaryColor = PARTY_COLORS[electedParties[0][0]] || projection.color || '#ccc'
      const secondaryColor = PARTY_COLORS[electedParties[1][0]] || '#9a9a9a'
      const id = ensurePartyStripePattern(primaryColor, secondaryColor)
      if (id) {
        ;(layer as any).setStyle({ fillColor: `url(#${id})` })
      }
    }
    const popupLines = sorted
      .map(entry => {
        const seats = seatAllocation[entry.party] || 0
        const suffix =
          electedParties.length >= 2 && seats > 0 ? ` (${getSeatAllocationLabel(seats)})` : ''
        return `${formatDisplayPartyLabel(entry.party)}: ${Math.round(entry.value)}%${suffix}`
      })
      .join('<br/>')
    const prev = projection.prevWinner
      ? `${previousWinnerLabel}: ${formatDisplayPartyLabel(projection.prevWinner)}`
      : null
    layer.bindPopup(
      `<strong>${wardName}</strong><br/><br/>Projected Vote Share:<br/>${popupLines}<br/><br/>Seats up: ${vacancies}${
        prev ? `<br/>${prev}` : ''
      }`,
      { autoPan: false }
    )
  }

  return (
    <MapContainer
      center={[53.7, -1.4]}
      zoom={6}
      style={{ height: '100%', width: '100%' }}
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      inertia
    >
      <InvalidateSize deps={[selectedLad, wardFeatures?.length || 0, ladGeo?.features?.length || 0]} />
      <FocusWardPopup
        selectedLad={selectedLad}
        targetLadCode={focusedWardLadCode}
        wardCode={focusedWardCode}
        wardNameKey={focusedWardNameKey}
        layerVersion={wardFeatures.length}
      />
      <BasePanes />
      <PatternDefs />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {baseGeo?.features?.length ? (
        <GeoJSON data={baseGeo as GeoJsonObject} style={baseStyle} interactive={false} pane="basePane" />
      ) : null}
      {countriesGeo?.features?.length ? (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          style={countryBoundaryStyle}
          interactive={false}
          pane="outlinePane"
        />
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
          pane="outlinePane"
          onEachFeature={(feature, layer) => {
            const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
            if (name === 'scotland' || name === 'wales') {
              layer.on('click', () => onSelectCountry(name))
            }
          }}
        />
      ) : null}
      {!selectedLad && (
        <>
          {eligibleCountyFeatures.length > 0 && (
            <>
              <GeoJSON
                data={{ type: 'FeatureCollection', features: eligibleCountyFeatures } as GeoJsonObject}
                style={countyFillStyle}
              />
              <GeoJSON
                data={{ type: 'FeatureCollection', features: eligibleCountyFeatures } as GeoJsonObject}
                style={countyOutlineStyle}
                eventHandlers={{
                  click: event => {
                    const feature = (event as any)?.sourceTarget?.feature
                    const ladCode = feature?.properties?.reference
                    if (
                      ladCode &&
                      (eligibleLads.has(ladCode) || (overlayAreaCodes && overlayAreaCodes.has(ladCode)))
                    ) {
                      selectLadWithCamera(ladCode, event)
                    }
                  },
                }}
              />
            </>
          )}
          {eligibleNonCountyFeatures.length > 0 && (
            <GeoJSON
              data={{ type: 'FeatureCollection', features: eligibleNonCountyFeatures } as GeoJsonObject}
              style={ladStyle}
              eventHandlers={{
                click: event => {
                  const feature = (event as any)?.sourceTarget?.feature
                  const ladCode = feature?.properties?.reference
                  if (
                    ladCode &&
                    (eligibleLads.has(ladCode) || (overlayAreaCodes && overlayAreaCodes.has(ladCode)))
                  ) {
                    selectLadWithCamera(ladCode, event)
                  }
                },
              }}
            />
          )}
        </>
      )}
      {!selectedLad && overlayAreas && (
        <GeoJSON
          data={overlayAreas as GeoJsonObject}
          style={overlayStyle}
          eventHandlers={{
            click: event => {
              const feature = (event as any)?.sourceTarget?.feature
              const areaCode = feature?.properties?.reference
              if (areaCode) {
                selectLadWithCamera(areaCode, event)
              }
            },
          }}
        />
      )}
      {!selectedLad && boundaryAreas && (
        <GeoJSON
          data={boundaryAreas as GeoJsonObject}
          style={boundaryStyle}
          interactive={false}
        />
      )}
      {selectedLad && (
        <>
          {wardFeatures.length > 0 && (
            <GeoJSON
              data={{ type: 'FeatureCollection', features: wardFeatures } as GeoJsonObject}
              style={wardStyle}
              onEachFeature={wardOnEachFeature}
            />
          )}
          <FeatureNameLabels
            features={wardFeatures}
            minZoom={10}
            className="poll-map-div-label--ward"
            getLabel={getWardDisplayName}
          />
          <FitBounds feature={selectedLadFeature} />
        </>
      )}
    </MapContainer>
  )
}
