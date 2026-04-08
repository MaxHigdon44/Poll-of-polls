import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import L from 'leaflet'

type ScottishParliamentMapProps = {
  constituencyGeo: FeatureCollection
  regionGeo: FeatureCollection
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

function FitToScotland({
  regionGeo,
  focusFeature,
}: {
  regionGeo: FeatureCollection
  focusFeature?: Feature<Geometry, any> | null
}) {
  const map = useMap()

  useEffect(() => {
    if (focusFeature) {
      const focusLayer = L.geoJSON(focusFeature as GeoJsonObject)
      const focusBounds = focusLayer.getBounds()
      if (focusBounds.isValid()) {
        map.fitBounds(focusBounds, { padding: [20, 20] })
        return
      }
    }
    const layer = L.geoJSON(regionGeo as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [map, regionGeo, focusFeature])

  return null
}

export default function ScottishParliamentMap({
  constituencyGeo,
  regionGeo,
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

  return (
    <MapContainer center={[56.5, -4]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        data={regionGeo as GeoJsonObject}
        style={() => ({
          color: '#4A6FA5',
          weight: 3,
          fillColor: '#9FB7D9',
          fillOpacity: 0.18,
        })}
        onEachFeature={(feature, layer) => {
          const props: any = feature.properties || {}
          layer.bindPopup(`<strong>${props.SPR22NM || 'Region'}</strong><br/>Code: ${props.SPR22CD || '—'}`)
        }}
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
            color: '#1F2A44',
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
      <FitToScotland regionGeo={regionGeo} focusFeature={focusFeature} />
    </MapContainer>
  )
}
