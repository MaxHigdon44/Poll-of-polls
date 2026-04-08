import { useEffect } from 'react'
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

type LocalMapProps = {
  baseGeo?: GeoCollection | null
  countriesGeo?: GeoCollection | null
  ladGeo: GeoCollection
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
  eligibleLads: Set<string>
  ladCategoryByCode: Map<string, 'county' | 'district' | 'london' | 'metro' | 'unitary'>
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
        map.fitBounds(bounds, { padding: [20, 20] })
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

export default function LocalMap({
  ladGeo,
  baseGeo,
  countriesGeo,
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
  eligibleLads,
  ladCategoryByCode,
  nonContestedLabel = 'Not contested',
  previousWinnerLabel = 'Previous winner',
}: LocalMapProps) {
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
    const fillColor =
      category === 'county'
        ? '#E75480'
        : category === 'london'
        ? '#6A1B9A'
        : category === 'metro'
          ? '#FB8C00'
          : category === 'unitary'
            ? '#1E88E5'
            : category === 'district'
              ? '#2E8B57'
              : '#f5f5f5'
    const strokeColor =
      category === 'county'
        ? '#B03060'
        : category === 'london'
        ? '#4A148C'
        : category === 'metro'
          ? '#EF6C00'
          : category === 'unitary'
            ? '#1565C0'
            : category === 'district'
              ? '#1B5E20'
              : '#bbb'
    return {
      color: strokeColor,
      weight: 2,
      fillColor,
      fillOpacity: category === 'county' ? 0.28 : 0.35,
    }
  }

  const countyOutlineStyle = () => ({
    color: '#B03060',
    weight: 3,
    fillColor: 'transparent',
    fillOpacity: 0,
  })

  const countyFillStyle = () => ({
    color: 'transparent',
    weight: 0,
    fillColor: '#E75480',
    fillOpacity: 0.28,
  })

  const baseStyle = () => ({
    color: '#1f2a44',
    weight: 1.5,
    fillColor: '#c4c4c4',
    fillOpacity: 0.7,
    opacity: 0.98,
  })

  const overlayStyleForCountries = (feature?: GeoFeature) => {
    const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
    const isNi = name === 'northern ireland'
    return {
      color: isNi ? 'transparent' : '#1f2a44',
      weight: isNi ? 0 : 2,
      fillColor: 'transparent',
      fillOpacity: 0,
      opacity: isNi ? 0 : 0.98,
    }
  }

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
    const color = projection ? projection.color || '#ccc' : '#ccc'
    const { electedParties } = getElectedParties(projection, vacancies)
    if (electedParties.length >= 2) {
      const primaryColor = PARTY_COLORS[electedParties[0][0]] || color
      const secondaryColor = PARTY_COLORS[electedParties[1][0]] || '#9a9a9a'
      const id = ensurePartyStripePattern(primaryColor, secondaryColor)
      if (id) {
        return {
          color: '#333',
          weight: 0.5,
          fillColor: `url(#${id})`,
          fillOpacity: 0.7,
        }
      }
    }
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
    if (electedParties.length >= 2 && 'setStyle' in layer) {
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
        return `${entry.party}: ${entry.value.toFixed(1)}%${suffix}`
      })
      .join('<br/>')
    const prev = projection.prevWinner ? `${previousWinnerLabel}: ${projection.prevWinner}` : null
    layer.bindPopup(
      `<strong>${wardName}</strong><br/>${popupLines}<br/>Seats up: ${vacancies}${
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
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      inertia={false}
    >
      <InvalidateSize deps={[selectedLad, wardFeatures?.length || 0, ladGeo?.features?.length || 0]} />
      <BasePanes />
      <PatternDefs />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {baseGeo?.features?.length ? (
        <GeoJSON data={baseGeo as GeoJsonObject} style={baseStyle} interactive={false} pane="basePane" />
      ) : null}
      {countriesGeo?.features?.length ? (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          style={overlayStyleForCountries}
          interactive={false}
          pane="outlinePane"
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
                      onSelectLad(ladCode)
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
                    onSelectLad(ladCode)
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
                onSelectLad(areaCode)
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
          <FitBounds feature={selectedLadFeature} />
        </>
      )}
    </MapContainer>
  )
}
