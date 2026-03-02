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
  wardMap: Map<string, { winner: string; shares: Record<string, number>; color: string }>
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

export default function LocalMap({
  ladGeo,
  overlayAreas,
  overlayAreaCodes,
  hiddenLadCodes,
  wardFeatures,
  wardMap,
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
    const wardCode = feature.properties?.reference
    const projection = wardMap.get(wardCode)
    const color = projection ? projection.color || '#ccc' : '#ccc'
    return {
      color: '#333',
      weight: 0.5,
      fillColor: color,
      fillOpacity: 0.7,
    }
  }

  const wardOnEachFeature = (feature: GeoFeature, layer: Layer) => {
    const wardCode = feature.properties?.reference
    const wardName = feature.properties?.name
    const projection = wardMap.get(wardCode)
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

    layer.bindTooltip(
      `<strong>${wardName}</strong><br/>${topParty}: ${topValue.toFixed(1)}%`,
      { sticky: true }
    )
  }

  return (
    <MapContainer center={[53.7, -1.4]} zoom={6} style={{ height: '100%', width: '100%' }}>
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
      {selectedLad && wardFeatures.length > 0 && (
        <>
          <GeoJSON
            data={{ type: 'FeatureCollection', features: wardFeatures } as GeoJsonObject}
            style={wardStyle}
            onEachFeature={wardOnEachFeature}
          />
          <FitBounds feature={selectedLadFeature} />
        </>
      )}
    </MapContainer>
  )
}
