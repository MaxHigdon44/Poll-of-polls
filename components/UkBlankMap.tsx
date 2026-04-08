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
    if (!countriesGeo) return
    const layer = L.geoJSON(countriesGeo as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, countriesGeo])

  return null
}

export default function UkBlankMap({ countriesGeo }: UkBlankMapProps) {
  return (
    <MapContainer center={[54.2, -2.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {countriesGeo && (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          style={() => ({
            color: '#394b63',
            weight: 1.2,
            fillColor: '#cfd6e6',
            fillOpacity: 0.6,
          })}
        />
      )}
      <FitToUK countriesGeo={countriesGeo} />
    </MapContainer>
  )
}
