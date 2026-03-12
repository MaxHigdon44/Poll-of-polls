import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import type { Feature, FeatureCollection } from 'geojson'
import type { Layer } from 'leaflet'
import L from 'leaflet'

type GeoFeature = Feature
type GeoCollection = FeatureCollection

type LocalMapProps = {
  ladGeo: GeoCollection
  overlayAreas?: GeoCollection | null
  overlayAreaCodes?: Set<string>
  hiddenLadCodes?: Set<string>
  wardFeatures: GeoFeature[]
  contestedWardCodes?: Set<string>
  contestedWardNameKeys?: Set<string>
  wardVacancies?: Map<string, number>
  wardVacanciesByName?: Map<string, number>
  wardMap: Map<
    string,
    { winner: string; shares: Record<string, number>; color: string; prevWinner?: string | null }
  >
  wardMapByName: Map<
    string,
    { winner: string; shares: Record<string, number>; color: string; prevWinner?: string | null }
  >
  wardMapByWardName?: Map<
    string,
    { winner: string; shares: Record<string, number>; color: string; prevWinner?: string | null }
  >
  fallbackProjection?: {
    winner: string
    shares: Record<string, number>
    color: string
    prevWinner?: string | null
  } | null
  selectedLad: string | null
  selectedLadFeature: GeoFeature | null
  onSelectLad: (lad: string | null) => void
  eligibleLads: Set<string>
  ladCategoryByCode: Map<string, 'district' | 'london' | 'metro' | 'unitary'>
}

function FitBounds({ feature }: { feature: GeoFeature | null }) {
  const map = useMap()
  useEffect(() => {
    if (!feature) return
    const layer = L.geoJSON(feature as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [feature, map])
  return null
}

function PatternDefs() {
  const map = useMap()

  useEffect(() => {
    const svg = map.getPanes().overlayPane.querySelector('svg')
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
  }, [map])

  return null
}

function getWardCode(feature: GeoFeature) {
  const props: any = feature.properties || {}
  return props.reference || props.WD25CD || props.WD23CD || props.WD22CD || null
}

function getWardNameKey(feature: GeoFeature) {
  const props: any = feature.properties || {}
  const wardName = String(props.WD25NM || props.WD23NM || props.WD22NM || props.name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
  const ladName = String(props.LAD25NM || props.LAD23NM || props.LAD22NM || '')
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
  return props.WD25NM || props.WD23NM || props.WD22NM || props.name || 'Ward'
}

export default function LocalMap({
  ladGeo,
  overlayAreas,
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
  eligibleLads,
  ladCategoryByCode,
}: LocalMapProps) {
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
    const fillColor =
      category === 'london'
        ? '#6A1B9A'
        : category === 'metro'
          ? '#FB8C00'
          : category === 'unitary'
            ? '#1E88E5'
            : category === 'district'
              ? '#2E8B57'
              : '#f5f5f5'
    const strokeColor =
      category === 'london'
        ? '#4A148C'
        : category === 'metro'
          ? '#EF6C00'
          : category === 'unitary'
            ? '#1565C0'
            : category === 'district'
              ? '#1B5E20'
              : '#bbb'
    return {
      color: isEligible ? strokeColor : '#bbb',
      weight: isEligible ? 2 : 1,
      fillColor: isEligible ? fillColor : '#f5f5f5',
      fillOpacity: isEligible ? 0.35 : 0.1,
    }
  }

  const overlayStyle = () => ({
    color: '#1565C0',
    weight: 2,
    fillColor: '#1E88E5',
    fillOpacity: 0.35,
  })

  const wardStyle = (feature?: GeoFeature) => {
    if (!feature) {
      return {
        color: '#333',
        weight: 0.5,
        fillColor: '#ccc',
        fillOpacity: 0.7,
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
        fillColor: 'url(#non-contested-stripes)',
        fillOpacity: 1,
      }
    }
    const projection =
      wardMap.get(wardCode) ||
      wardMapByName.get(getWardNameKey(feature) || '') ||
      wardMapByWardName?.get(String(getWardDisplayName(feature)).toLowerCase()) ||
      fallbackProjection
    const color = projection ? projection.color || '#ccc' : '#ccc'
    return {
      color: '#333',
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
      layer.bindPopup(`<strong>${wardName}</strong><br/>Not contested in 2026`)
      return
    }
    const projection =
      wardMap.get(wardCode) ||
      wardMapByName.get(getWardNameKey(feature) || '') ||
      wardMapByWardName?.get(String(getWardDisplayName(feature)).toLowerCase()) ||
      fallbackProjection
    if (!projection) return

    let topParty = projection.winner
    let topValue = -1
    Object.entries(projection.shares).forEach(([party, value]) => {
      const numericValue = Number(value)
      if (Number.isNaN(numericValue)) return
      if (numericValue > topValue) {
        topValue = numericValue
        topParty = party
      }
    })

    const sorted = Object.entries(projection.shares)
      .map(([party, value]) => ({ party, value: Number(value) }))
      .filter(entry => Number.isFinite(entry.value))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
    const vacancies =
      (wardCode ? wardVacancies?.get(wardCode) : 0) ||
      (wardNameKey ? wardVacanciesByName?.get(wardNameKey) : 0) ||
      1
    const popupLines = sorted
      .map(entry => `${entry.party}: ${entry.value.toFixed(1)}%`)
      .join('<br/>')
    const prev = projection.prevWinner ? `Previous winner: ${projection.prevWinner}` : null
    layer.bindPopup(
      `<strong>${wardName}</strong><br/>${popupLines}<br/>Seats up: ${vacancies}${
        prev ? `<br/>${prev}` : ''
      }`
    )
  }

  return (
    <MapContainer center={[53.7, -1.4]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <PatternDefs />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {!selectedLad && (
        <GeoJSON
          data={ladGeo as GeoJsonObject}
          style={ladStyle}
          eventHandlers={{
            click: event => {
              const feature = (event as any)?.sourceTarget?.feature
              const ladCode = feature?.properties?.reference
              if (
                ladCode &&
                (eligibleLads.has(ladCode) || (overlayAreaCodes && overlayAreaCodes.has(ladCode)))
              ) {
                onSelectLad(ladCode)
              }
            },
          }}
        />
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
                onSelectLad(areaCode)
              }
            },
          }}
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
          <FitBounds feature={selectedLadFeature} />
        </>
      )}
    </MapContainer>
  )
}
