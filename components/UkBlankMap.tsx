import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type UkBlankMapProps = {
  countriesGeo: FeatureCollection | null
}

function FitToUK({ countriesGeo }: { countriesGeo: FeatureCollection | null }) {
  const map = useMap()

  useEffect(() => {
    try {
      if (!countriesGeo || !(map as any)._loaded) return
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

export default function UkBlankMap({ countriesGeo }: UkBlankMapProps) {
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
      {countriesGeo && (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          style={() => ({
            color: '#dbeafe',
            weight: 1.2,
            fillColor: '#1d2636',
            fillOpacity: 0.35,
          })}
        />
      )}
      <FitToUK countriesGeo={countriesGeo} />
    </MapContainer>
  )
}
