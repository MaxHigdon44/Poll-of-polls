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
  wardFeatures: GeoFeature[]
  wardMap: Map<string, { winner: string; shares: Record<string, number>; color: string }>
  selectedLad: string | null
  selectedLadFeature: GeoFeature | null
  onSelectLad: (lad: string | null) => void
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
  wardFeatures,
  wardMap,
  selectedLad,
  selectedLadFeature,
  onSelectLad,
}: LocalMapProps) {
  const ladStyle = {
    color: '#444',
    weight: 1,
    fillColor: '#f2f2f2',
    fillOpacity: 0.3,
  }

  const wardStyle = (feature: GeoFeature) => {
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
              if (ladCode) onSelectLad(ladCode)
            },
          }}
        />
      )}
      {selectedLad && wardFeatures.length > 0 && (
        <>
          <GeoJSON
            data={wardFeatures as GeoJsonObject}
            style={wardStyle}
            onEachFeature={wardOnEachFeature}
          />
          <FitBounds feature={selectedLadFeature} />
        </>
      )}
    </MapContainer>
  )
}
