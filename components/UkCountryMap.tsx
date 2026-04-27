import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type UkCountryMapProps = {
  countriesGeo: FeatureCollection
  onSelectCountry: (country: 'england' | 'scotland' | 'wales') => void
}

function FitToUk({ countriesGeo }: { countriesGeo: FeatureCollection }) {
  const map = useMap()

  useEffect(() => {
    try {
      if (!(map as any)._loaded) return
      const layer = L.geoJSON(countriesGeo as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20], animate: false })
      }
    } catch {
      // Ignore transient Leaflet DOM positioning errors during unmounts.
    }
  }, [map, countriesGeo])

  return null
}

export default function UkCountryMap({ countriesGeo, onSelectCountry }: UkCountryMapProps) {
  return (
    <MapContainer
      center={[54.2, -2.5]}
      zoom={5}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <GeoJSON
        data={countriesGeo as GeoJsonObject}
        style={feature => {
          const name = String(feature?.properties?.CTRY22NM || '').toLowerCase()
          const isNi = name === 'northern ireland'
          return {
            color: isNi ? 'transparent' : '#1f2a44',
            weight: isNi ? 0 : 2.2,
            fillColor: isNi ? 'transparent' : '#c4c4c4',
            fillOpacity: isNi ? 0 : 0.7,
            opacity: isNi ? 0 : 0.98,
          }
        }}
        onEachFeature={(feature, layer) => {
          const name = String(feature.properties?.CTRY22NM || '').toLowerCase()
          if (name === 'england' || name === 'scotland' || name === 'wales') {
            layer.on('click', () => onSelectCountry(name as 'england' | 'scotland' | 'wales'))
          }
        }}
      />
      <FitToUk countriesGeo={countriesGeo} />
    </MapContainer>
  )
}
