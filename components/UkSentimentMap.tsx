import { useEffect, useMemo } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type UkSentimentMapProps = {
  countriesGeo: FeatureCollection | null
  englandRegionsGeo: FeatureCollection | null
  supportByRegion: Record<string, number>
  legendTitle?: string
  legendMinLabel?: string
  legendMaxLabel?: string
  colorMode?: 'green' | 'purple' | 'yellow' | 'pink'
  regionDisplayMap?: Record<string, { label: string; value: number }>
  rangeMin?: number
  rangeMax?: number
  valueLabel?: string
}

function supportToColor(
  value: number,
  mode: 'green' | 'purple' | 'yellow' | 'pink',
  min: number,
  max: number
) {
  const clamped = Math.max(min, Math.min(max, value))
  const t = (clamped - min) / (max - min || 1)
  const lightness = 96 - t * 80
  if (mode === 'purple') {
    return `hsl(270, 70%, ${lightness}%)`
  }
  if (mode === 'yellow') {
    return `hsl(48, 85%, ${lightness}%)`
  }
  if (mode === 'pink') {
    const pinkLightness = 98 - t * 100
    return `hsl(330, 85%, ${pinkLightness}%)`
  }
  return `hsl(128, 70%, ${lightness}%)`
}

function normalizeRegionName(name: string) {
  if (name === 'Eastern') return 'East of England'
  return name
}

function FitToUK({ countriesGeo }: { countriesGeo: FeatureCollection | null }) {
  const map = useMap()

  useEffect(() => {
    if (!countriesGeo) return
    const layer = L.geoJSON(countriesGeo as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, countriesGeo])

  return null
}

export default function UkSentimentMap({
  countriesGeo,
  englandRegionsGeo,
  supportByRegion,
  legendTitle,
  legendMinLabel,
  legendMaxLabel,
  colorMode = 'green',
  regionDisplayMap,
  rangeMin,
  rangeMax,
  valueLabel = 'Support',
}: UkSentimentMapProps) {
  const min = rangeMin ?? 0
  const max = rangeMax ?? 100
  const getRegionValue = (regionName: string) =>
    regionDisplayMap?.[regionName]?.value ?? supportByRegion[regionName]
  const getRegionLabel = (regionName: string) =>
    regionDisplayMap?.[regionName]?.label ?? regionName
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <MapContainer center={[54.2, -2.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {countriesGeo && (
          <GeoJSON
            data={countriesGeo as GeoJsonObject}
            style={feature => {
              const rawName = feature?.properties?.CTRY22NM || ''
              const name = normalizeRegionName(rawName)
              if (name === 'England') {
                return { color: 'transparent', weight: 0, fillOpacity: 0 }
              }
              const support = getRegionValue(name)
              return {
                color: '#1f2a3a',
                weight: 1.4,
                fillColor: support != null ? supportToColor(support, colorMode, min, max) : '#d5dbe6',
                fillOpacity: 0.9,
              }
            }}
            onEachFeature={(feature, layer) => {
              const rawName = feature?.properties?.CTRY22NM || 'Region'
              const name = normalizeRegionName(rawName)
              const support = getRegionValue(name)
              const label = getRegionLabel(name)
              if (support != null) {
                layer.bindPopup(
                  `<strong>${label}</strong><br/>${valueLabel}: ${support.toFixed(1)}%`
                )
              } else {
                layer.bindPopup(`<strong>${label}</strong>`)
              }
            }}
          />
        )}
        {englandRegionsGeo && (
          <GeoJSON
            data={englandRegionsGeo as GeoJsonObject}
            style={feature => {
              const regionName = normalizeRegionName(feature?.properties?.EER13NM || '')
              const support = getRegionValue(regionName)
              return {
                color: '#ffffff',
                weight: 1.1,
                fillColor: support != null ? supportToColor(support, colorMode, min, max) : '#d5dbe6',
                fillOpacity: 0.9,
              }
            }}
            onEachFeature={(feature, layer) => {
              const regionName = normalizeRegionName(feature?.properties?.EER13NM || 'Region')
              const support = getRegionValue(regionName)
              const label = getRegionLabel(regionName)
              if (support != null) {
                layer.bindPopup(
                  `<strong>${label}</strong><br/>${valueLabel}: ${support.toFixed(1)}%`
                )
              } else {
                layer.bindPopup(`<strong>${label}</strong>`)
              }
            }}
          />
        )}
        <FitToUK countriesGeo={countriesGeo} />
      </MapContainer>
      <div
        style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          zIndex: 1000,
          background: '#ffffff',
          border: '1px solid rgba(15, 23, 42, 0.12)',
          borderRadius: '12px',
          padding: '10px 12px',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
          fontSize: '0.85rem',
          color: '#172033',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.4rem', whiteSpace: 'pre-line' }}>
          {legendTitle || 'Support for renewables'}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '2px',
            width: '170px',
            marginBottom: '0.4rem',
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map(step => {
            const value = min + (max - min) * step
            return (
              <span
                key={step}
                style={{
                  height: '10px',
                  borderRadius: step === 0 ? '999px 0 0 999px' : step === 1 ? '0 999px 999px 0' : '0',
                  background: supportToColor(value, colorMode, min, max),
                  display: 'block',
                }}
              />
            )
          })}
        </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
          <span>{legendMinLabel || '65%'}</span>
          <span>{legendMaxLabel || '85%'}</span>
      </div>
      </div>
    </div>
  )
}
