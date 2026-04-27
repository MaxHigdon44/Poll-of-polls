import { useEffect, useRef } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import L from 'leaflet'

type ScottishParliamentMapProps = {
  constituencyGeo: FeatureCollection
  regionGeo: FeatureCollection
  countriesGeo?: FeatureCollection | null
  onSelectCountry?: (country: 'england' | 'scotland' | 'wales') => void
  focusFeature?: Feature<Geometry, any> | null
  constituencyResults: Map<
    string,
    {
      previousWinner2021: string | null
      region: string
      msp2021: string | null
      turnout: number | null
      majority: number | null
      shares: {
        snp: number | null
        conservative: number | null
        labour: number | null
        libdem: number | null
        green: number | null
        reform?: number | null
        other: number | null
      }
      projected?: {
        snp: number
        conservative: number
        labour: number
        libdem: number
        green: number
        reform: number
        other: number
      }
      leaveShare?: number | null
      degreeShare?: {
        degree: number
        noDegree: number
      }
      projectedWinner?: string | null
    }
  >
}

function normalizeScottishConstituencyName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bislands\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getBoundsKey(bounds: L.LatLngBounds) {
  const southWest = bounds.getSouthWest()
  const northEast = bounds.getNorthEast()
  return [southWest.lat, southWest.lng, northEast.lat, northEast.lng]
    .map(value => value.toFixed(4))
    .join('|')
}

function escapeLabel(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function FeatureNameLabels({
  features,
  getLabel,
  minZoom,
  className,
}: {
  features: any[]
  getLabel: (feature: any) => string
  minZoom: number
  className: string
}) {
  const map = useMap()

  useEffect(() => {
    const markers: L.Marker[] = []
    const collides = (
      box: { left: number; right: number; top: number; bottom: number },
      boxes: Array<{ left: number; right: number; top: number; bottom: number }>
    ) =>
      boxes.some(
        other =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top
      )
    const getLayerCenter = (bounds: L.LatLngBounds) => {
      const northWest = map.latLngToLayerPoint(bounds.getNorthWest())
      const southEast = map.latLngToLayerPoint(bounds.getSouthEast())
      return L.point((northWest.x + southEast.x) / 2, (northWest.y + southEast.y) / 2)
    }
    const estimateBox = (label: string, point: L.Point) => {
      const width = Math.min(96, Math.max(34, label.length * 4.8 + 10))
      const lines = Math.max(1, Math.ceil((label.length * 4.8) / width))
      const height = Math.min(42, lines * 8 + 8)
      return {
        left: point.x - width / 2,
        right: point.x + width / 2,
        top: point.y - height / 2,
        bottom: point.y + height / 2,
      }
    }
    const clear = () => {
      while (markers.length) markers.pop()?.remove()
    }
    const render = () => {
      clear()
      if (!(map as any)._loaded || map.getZoom() < minZoom) return
      const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = []
      features.forEach(feature => {
        const label = getLabel(feature)
        if (!label) return
        const bounds = L.geoJSON(feature as GeoJsonObject).getBounds()
        if (!bounds.isValid()) return
        const point = getLayerCenter(bounds)
        const box = estimateBox(label, point)
        if (collides(box, occupied)) return
        occupied.push(box)
        markers.push(
          L.marker(map.layerPointToLatLng(point), {
            interactive: false,
            icon: L.divIcon({
              className: `poll-map-div-label ${className}`,
              html: escapeLabel(label),
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
      clear()
    }
  }, [map, features, getLabel, minZoom, className])

  return null
}

function FitToScotland({
  regionGeo,
  focusFeature,
}: {
  regionGeo: FeatureCollection
  focusFeature?: Feature<Geometry, any> | null
}) {
  const map = useMap()
  const lastBoundsKeyRef = useRef<string | null>(null)

  useEffect(() => {
    try {
      if (!(map as any)._loaded) return
      if (focusFeature) {
        const focusLayer = L.geoJSON(focusFeature as GeoJsonObject)
        const focusBounds = focusLayer.getBounds()
        if (focusBounds.isValid()) {
          const nextKey = `focus:${getBoundsKey(focusBounds)}`
          if (lastBoundsKeyRef.current === nextKey) return
          lastBoundsKeyRef.current = nextKey
          map.flyToBounds(focusBounds, {
            padding: [20, 20],
            animate: true,
            duration: 0.35,
            easeLinearity: 0.2,
          })
          return
        }
      }
      const layer = L.geoJSON(regionGeo as GeoJsonObject)
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        const nextKey = `regions:${getBoundsKey(bounds)}`
        if (lastBoundsKeyRef.current === nextKey) return
        lastBoundsKeyRef.current = nextKey
        map.flyToBounds(bounds, {
          padding: [20, 20],
          animate: true,
          duration: 0.35,
          easeLinearity: 0.2,
        })
      }
    } catch {
      // Ignore transient Leaflet DOM positioning errors during unmounts.
    }
  }, [map, regionGeo, focusFeature])

  return null
}

export default function ScottishParliamentMap({
  constituencyGeo,
  regionGeo,
  countriesGeo,
  onSelectCountry,
  focusFeature,
  constituencyResults,
}: ScottishParliamentMapProps) {
  const buildShareLines = (entries: Array<[string, number | null | undefined]>) => {
    return entries
      .filter(([, value]) => value != null)
      .map(([party, value]) => [party, Number(value)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
      .join('<br/>')
  }

  const getWinnerColor = (winner: string | null) => {
    if (winner === 'SNP') return '#FDF38E'
    if (winner === 'Conservative') return '#0087DC'
    if (winner === 'Labour') return '#E4003B'
    if (winner === 'Liberal Democrat') return '#FAA61A'
    if (winner === 'Green') return '#02A95B'
    if (winner === 'Reform') return '#12B6CF'
    return '#9a9a9a'
  }
  const countryClickFeatures =
    countriesGeo?.features.filter(feature => {
      const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
      return name === 'england' || name === 'wales'
    }) || []
  const countryBoundaryStyle = (feature?: any) => {
    const name = String(feature?.properties?.CTRY22NM || '').toLowerCase()
    const isUkCountry = name === 'england' || name === 'scotland' || name === 'wales'
    return {
      color: isUkCountry ? '#f8fafc' : 'transparent',
      weight: isUkCountry ? 1.6 : 0,
      fillColor: 'transparent',
      fillOpacity: 0,
      opacity: isUkCountry ? 0.9 : 0,
    }
  }

  return (
    <MapContainer
      center={[56.5, -4]}
      zoom={6}
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      preferCanvas
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {countriesGeo?.features?.length ? (
        <GeoJSON data={countriesGeo as GeoJsonObject} style={countryBoundaryStyle} interactive={false} />
      ) : null}
      {onSelectCountry && countryClickFeatures.length ? (
        <GeoJSON
          data={{ type: 'FeatureCollection', features: countryClickFeatures } as GeoJsonObject}
          style={() => ({
            color: 'transparent',
            weight: 0,
            fillColor: '#ffffff',
            fillOpacity: 0.01,
          })}
          onEachFeature={(feature, layer) => {
            const name = String((feature as any)?.properties?.CTRY22NM || '').toLowerCase()
            if (name === 'england' || name === 'wales') {
              layer.on('click', () => onSelectCountry(name))
            }
          }}
        />
      ) : null}
      <GeoJSON
        data={regionGeo as GeoJsonObject}
        style={() => ({
          color: '#dbeafe',
          weight: 0.8,
          fillColor: '#1d2636',
          fillOpacity: 0.06,
          opacity: 0.45,
        })}
        interactive={false}
      />
      <GeoJSON
        data={constituencyGeo as GeoJsonObject}
        style={feature => {
          const props: any = feature?.properties || {}
          const constituencyName = props.SPC22NM || ''
          const result =
            constituencyResults.get(constituencyName) ||
            constituencyResults.get(normalizeScottishConstituencyName(constituencyName))
          return {
            color: '#f8fafc',
            weight: 1,
            fillColor: getWinnerColor(result?.projectedWinner || result?.previousWinner2021 || null),
            fillOpacity: 0.45,
          }
        }}
        onEachFeature={(feature, layer) => {
          const props: any = feature.properties || {}
          const constituencyName = props.SPC22NM || ''
          const result =
            constituencyResults.get(constituencyName) ||
            constituencyResults.get(normalizeScottishConstituencyName(constituencyName))
          const shareLines2021 = result
            ? buildShareLines([
                ['SNP', result.shares.snp],
                ['Conservative', result.shares.conservative],
                ['Labour', result.shares.labour],
                ['Liberal Democrat', result.shares.libdem],
                ['Green', result.shares.green],
                ['Other', result.shares.other],
              ])
            : 'No baseline loaded'
          const projectedLines = result?.projected
            ? buildShareLines([
                ['SNP', result.projected.snp],
                ['Conservative', result.projected.conservative],
                ['Labour', result.projected.labour],
                ['Liberal Democrat', result.projected.libdem],
                ['Green', result.projected.green],
                ['Reform', result.projected.reform],
                ['Other', result.projected.other],
              ])
            : ''
          const projectedOutcome =
            result?.projectedWinner && result?.previousWinner2021
              ? result.projectedWinner === result.previousWinner2021
                ? `${result.projectedWinner} hold`
                : `${result.projectedWinner} gain from ${result.previousWinner2021}`
              : result?.projectedWinner
                ? `${result.projectedWinner} projected`
                : ''
          layer.bindPopup(
            `<strong>${props.SPC22NM || 'Constituency'}</strong>${
              result?.region ? `<br/>Region: ${result.region}` : ''
            }${
              projectedOutcome ? `<br/>Projected result: ${projectedOutcome}` : ''
            }${shareLines2021 ? `<br/><br/>2021 constituency vote share<br/>${shareLines2021}` : ''}${
              projectedLines ? `<br/><br/>Projected constituency vote share<br/>${projectedLines}` : ''
            }`
          )
        }}
      />
      <FeatureNameLabels
        features={constituencyGeo.features}
        minZoom={6}
        className="poll-map-div-label--seat"
        getLabel={feature => String(feature?.properties?.SPC22NM || '')}
      />
      <FitToScotland regionGeo={regionGeo} focusFeature={focusFeature} />
    </MapContainer>
  )
}
