import { useEffect, useMemo } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'

type ViewMode = 'overview' | 'england' | 'wales' | 'scotland'

type UkElectoralMapProps = {
  view: ViewMode
  countriesGeo: FeatureCollection | null
  englandGeo: FeatureCollection | null
  walesGeo: FeatureCollection | null
  scotlandConstituencies: FeatureCollection | null
  scotlandRegions: FeatureCollection | null
  onSelectView: (view: ViewMode) => void
}

function FitToView({
  view,
  countriesGeo,
  englandGeo,
  walesGeo,
  scotlandConstituencies,
  scotlandRegions,
}: {
  view: ViewMode
  countriesGeo: FeatureCollection | null
  englandGeo: FeatureCollection | null
  walesGeo: FeatureCollection | null
  scotlandConstituencies: FeatureCollection | null
  scotlandRegions: FeatureCollection | null
}) {
  const map = useMap()

  useEffect(() => {
    let target: FeatureCollection | null = null
    if (view === 'england') target = englandGeo
    if (view === 'wales') target = walesGeo
    if (view === 'scotland') target = scotlandConstituencies
    if (view === 'overview') target = countriesGeo
    if (!target) return
    const layer = L.geoJSON(target as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, view, englandGeo, walesGeo, scotlandConstituencies])

  return null
}

export default function UkElectoralMap({
  view,
  countriesGeo,
  englandGeo,
  walesGeo,
  scotlandConstituencies,
  scotlandRegions,
  onSelectView,
}: UkElectoralMapProps) {
  const englandLayer = useMemo(() => {
    if (!englandGeo) return null
    return {
      type: 'FeatureCollection',
      features: englandGeo.features.filter(feature =>
        String(feature.properties?.LAD25CD || feature.properties?.LAD23CD || '').startsWith('E')
      ),
    } as FeatureCollection
  }, [englandGeo])

  return (
    <MapContainer center={[54.2, -2.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {view === 'overview' && countriesGeo && (
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
              layer.on('click', () => onSelectView(name as ViewMode))
            }
          }}
        />
      )}

      {view === 'england' && englandLayer && (
        <GeoJSON
          data={englandLayer as GeoJsonObject}
          style={() => ({
            color: '#1f2a44',
            weight: 1,
            fillColor: '#c9d7ef',
            fillOpacity: 0.5,
          })}
        />
      )}

      {view === 'wales' && walesGeo && (
        <GeoJSON
          data={walesGeo as GeoJsonObject}
          style={() => ({
            color: '#1f2a44',
            weight: 1,
            fillColor: '#d9d6f0',
            fillOpacity: 0.5,
          })}
        />
      )}

      {view === 'scotland' && scotlandRegions && (
        <GeoJSON
          data={scotlandRegions as GeoJsonObject}
          style={() => ({
            color: '#4A6FA5',
            weight: 2.5,
            fillColor: '#9FB7D9',
            fillOpacity: 0.2,
          })}
        />
      )}
      {view === 'scotland' && scotlandConstituencies && (
        <GeoJSON
          data={scotlandConstituencies as GeoJsonObject}
          style={() => ({
            color: '#1f2a44',
            weight: 1,
            fillColor: '#d7ead8',
            fillOpacity: 0.35,
          })}
        />
      )}

      <FitToView
        view={view}
        countriesGeo={countriesGeo}
        englandGeo={englandLayer}
        walesGeo={walesGeo}
        scotlandConstituencies={scotlandConstituencies}
        scotlandRegions={scotlandRegions}
      />
    </MapContainer>
  )
}
