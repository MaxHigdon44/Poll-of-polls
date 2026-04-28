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
  countryWinnerColors?: Partial<Record<'england' | 'scotland' | 'wales', string>>
  onSelectView: (view: ViewMode) => void
}

const DEFAULT_COUNTRY_WINNER_COLORS: Record<string, string> = {
  england: '#12B6CF',
  scotland: '#FDF38E',
  wales: '#008672',
}

const COUNTRY_LABEL_OFFSETS: Record<string, { x: number; y: number }> = {
  england: { x: -16, y: 18 },
  scotland: { x: -10, y: -34 },
  wales: { x: -10, y: 0 },
}

const COUNTRY_LABEL_COORDS: Record<string, [number, number]> = {
  england: [52.85, -1.85],
  scotland: [56.65, -4.35],
}

function CountryNameLabels({
  visible,
  countriesGeo,
}: {
  visible: boolean
  countriesGeo: FeatureCollection | null
}) {
  const map = useMap()

  useEffect(() => {
    if (!visible || !countriesGeo || !(map as any)._loaded) return
    const markers: L.Marker[] = []
    const render = () => {
      while (markers.length) markers.pop()?.remove()
      countriesGeo.features.forEach(feature => {
        const name = String(feature.properties?.CTRY22NM || '').toLowerCase()
        if (name !== 'england' && name !== 'scotland' && name !== 'wales') return
        const bounds = L.geoJSON(feature as GeoJsonObject).getBounds()
        if (!bounds.isValid()) return
        const manualCoords = COUNTRY_LABEL_COORDS[name]
        if (manualCoords) {
          markers.push(
            L.marker(manualCoords, {
              interactive: false,
              icon: L.divIcon({
                className: 'poll-map-div-label poll-map-div-label--country',
                html: name.charAt(0).toUpperCase() + name.slice(1),
                iconAnchor: [0, 0],
                iconSize: [0, 0],
              }),
            }).addTo(map)
          )
          return
        }
        const northWest = map.latLngToLayerPoint(bounds.getNorthWest())
        const southEast = map.latLngToLayerPoint(bounds.getSouthEast())
        const offset = COUNTRY_LABEL_OFFSETS[name] || { x: 0, y: 0 }
        const point = L.point(
          (northWest.x + southEast.x) / 2 + offset.x,
          (northWest.y + southEast.y) / 2 + offset.y
        )
        markers.push(
          L.marker(map.layerPointToLatLng(point), {
            interactive: false,
            icon: L.divIcon({
              className: 'poll-map-div-label poll-map-div-label--country',
              html: name.charAt(0).toUpperCase() + name.slice(1),
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
      markers.forEach(marker => marker.remove())
    }
  }, [map, visible, countriesGeo])

  return null
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
    try {
      let target: FeatureCollection | null = null
      if (view === 'england') target = englandGeo
      if (view === 'wales') target = walesGeo
      if (view === 'scotland') target = scotlandConstituencies
      if (view === 'overview') target = countriesGeo
      if (!target || !(map as any)._loaded) return
      const layer = L.geoJSON(target as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.flyToBounds(bounds, {
          padding: [28, 28],
          animate: true,
          duration: 0.48,
          easeLinearity: 0.18,
        })
      }
    } catch {
      // Ignore transient Leaflet DOM-state issues during route and layer swaps.
    }
  }, [map, view, countriesGeo, englandGeo, walesGeo, scotlandConstituencies, scotlandRegions])

  return null
}

export default function UkElectoralMap({
  view,
  countriesGeo,
  englandGeo,
  walesGeo,
  scotlandConstituencies,
  scotlandRegions,
  countryWinnerColors,
  onSelectView,
}: UkElectoralMapProps) {
  const overviewColors = {
    ...DEFAULT_COUNTRY_WINNER_COLORS,
    ...(countryWinnerColors || {}),
  }

  const getOverviewStyle = (name: string) => {
    const isNi = name === 'northern ireland'
    return {
      color: isNi ? 'transparent' : '#dbeafe',
      weight: isNi ? 0 : 2.2,
      fillColor: isNi ? 'transparent' : overviewColors[name as keyof typeof overviewColors] || '#64748b',
      fillOpacity: isNi ? 0 : 0.72,
      opacity: isNi ? 0 : 0.98,
    }
  }

  const getOverviewHoverStyle = (name: string) => {
    const isNi = name === 'northern ireland'
    return {
      color: isNi ? 'transparent' : '#f8fafc',
      weight: isNi ? 0 : 3.4,
      fillColor: isNi ? 'transparent' : '#e2e8f0',
      fillOpacity: isNi ? 0 : 0.88,
      opacity: isNi ? 0 : 1,
    }
  }

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
    <MapContainer
      center={[54.2, -2.5]}
      zoom={5}
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {view === 'overview' && countriesGeo && (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          style={feature => {
            const name = String(feature?.properties?.CTRY22NM || '').toLowerCase()
            return getOverviewStyle(name)
          }}
          onEachFeature={(feature, layer) => {
            const name = String(feature.properties?.CTRY22NM || '').toLowerCase()
            if (name === 'england' || name === 'scotland' || name === 'wales') {
              const pathLayer = layer as L.Path
              layer.on('mouseover', () => {
                pathLayer.setStyle(getOverviewHoverStyle(name))
                pathLayer.bringToFront()
              })
              layer.on('mouseout', () => {
                pathLayer.setStyle(getOverviewStyle(name))
              })
              layer.on('click', () => onSelectView(name as ViewMode))
            }
          }}
        />
      )}
      <CountryNameLabels visible={view === 'overview'} countriesGeo={countriesGeo} />

      {view === 'england' && englandLayer && (
        <GeoJSON
          data={englandLayer as GeoJsonObject}
          style={() => ({
            color: '#dbeafe',
            weight: 1,
            fillColor: '#1d2636',
            fillOpacity: 0.38,
          })}
        />
      )}

      {view === 'wales' && walesGeo && (
        <GeoJSON
          data={walesGeo as GeoJsonObject}
          style={() => ({
            color: '#dbeafe',
            weight: 1,
            fillColor: '#1d2636',
            fillOpacity: 0.38,
          })}
        />
      )}

      {view === 'scotland' && scotlandRegions && (
        <GeoJSON
          data={scotlandRegions as GeoJsonObject}
          style={() => ({
            color: '#7dd3fc',
            weight: 2.5,
            fillColor: '#0f172a',
            fillOpacity: 0.12,
          })}
        />
      )}
      {view === 'scotland' && scotlandConstituencies && (
        <GeoJSON
          data={scotlandConstituencies as GeoJsonObject}
          style={() => ({
            color: '#dbeafe',
            weight: 1,
            fillColor: '#10271c',
            fillOpacity: 0.42,
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
