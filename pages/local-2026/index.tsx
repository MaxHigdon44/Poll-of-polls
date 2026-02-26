import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
)
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false })
const useMap = dynamic(() => import('react-leaflet').then(mod => mod.useMap), { ssr: false })

type GeoFeature = {
  type: 'Feature'
  properties: Record<string, any>
  geometry: any
}

type GeoCollection = {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

type WardBaseline = {
  wardCode: string
  wardName: string
  ladCode: string
  ladName: string
  lastYear: number
  totalVotes: number
  nationalShares: Record<string, number>
  localShares: Record<string, number>
}

type BaselineData = {
  generatedAt: string
  baselineNational: Record<string, number>
  wards: WardBaseline[]
}

type AggregateRow = {
  aggregate_date: string
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
  lead_party: string | null
  lead_value: number | null
}

type AggregateResponse = {
  aggregates: AggregateRow[]
}

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  Reform: '#12B6CF',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  SNP: '#FDF38E',
  'Plaid Cymru': '#008672',
  Other: '#9a9a9a',
}

function normalize(value: string) {
  return value.toLowerCase()
}

function computeWardProjection(
  ward: WardBaseline,
  baselineNational: Record<string, number>,
  aggregate: AggregateRow
) {
  const nationalParties = [
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
  ]

  const aggregateMap: Record<string, number> = {
    Labour: aggregate.labour ?? 0,
    Conservative: aggregate.conservative ?? 0,
    Reform: aggregate.reform ?? 0,
    'Liberal Democrat': aggregate.libdem ?? 0,
    Green: aggregate.green ?? 0,
    SNP: aggregate.snp ?? 0,
    'Plaid Cymru': aggregate.pc ?? 0,
  }

  const adjustedNational: Record<string, number> = {}
  let sumNational = 0
  nationalParties.forEach(party => {
    const base = ward.nationalShares[party] ?? 0
    const delta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
    const value = Math.max(0, base + delta)
    adjustedNational[party] = value
    sumNational += value
  })

  const localSum = Object.values(ward.localShares).reduce((acc, value) => acc + value, 0)
  const remaining = 100 - sumNational

  let scaledLocal: Record<string, number> = {}
  if (remaining <= 0 || localSum === 0) {
    scaledLocal = Object.fromEntries(Object.keys(ward.localShares).map(key => [key, 0]))
    if (remaining < 0 && sumNational > 0) {
      const scale = 100 / sumNational
      nationalParties.forEach(party => {
        adjustedNational[party] = adjustedNational[party] * scale
      })
      sumNational = 100
    }
  } else {
    const scale = remaining / localSum
    scaledLocal = Object.fromEntries(
      Object.entries(ward.localShares).map(([key, value]) => [key, value * scale])
    )
  }

  const combined: Record<string, number> = {
    ...scaledLocal,
    ...adjustedNational,
  }

  let winner = 'Other'
  let top = -1
  Object.entries(combined).forEach(([party, value]) => {
    if (value > top) {
      top = value
      winner = party
    }
  })

  return { shares: combined, winner }
}

function FitBounds({ feature }: { feature: GeoFeature | null }) {
  // @ts-ignore
  const map = useMap()
  useEffect(() => {
    if (!feature) return
    let active = true
    ;(async () => {
      const leaflet = await import('leaflet')
      if (!active) return
      const layer = leaflet.geoJSON(feature as any)
      const bounds = layer.getBounds()
      if (bounds) {
        map.fitBounds(bounds, { padding: [20, 20] })
      }
    })()
    return () => {
      active = false
    }
  }, [feature, map])
  return null
}

export default function Local2026Page() {
  const [wardGeo, setWardGeo] = useState<GeoCollection | null>(null)
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [aggregate, setAggregate] = useState<AggregateRow | null>(null)
  const [selectedLad, setSelectedLad] = useState<string | null>(null)

  useEffect(() => {
    fetch('/data/wards.geojson')
      .then(res => res.json())
      .then(setWardGeo)
      .catch(() => setWardGeo(null))

    fetch('/data/lads.geojson')
      .then(res => res.json())
      .then(setLadGeo)
      .catch(() => setLadGeo(null))

    fetch('/data/ward-baseline.json')
      .then(res => res.json())
      .then(setBaseline)
      .catch(() => setBaseline(null))

    fetch('/api/aggregate')
      .then(res => res.json())
      .then((data: AggregateResponse) => {
        setAggregate(data.aggregates?.[0] ?? null)
      })
      .catch(() => setAggregate(null))
  }, [])

  const wardMap = useMemo(() => {
    if (!baseline || !aggregate) return new Map<string, any>()
    const map = new Map<string, any>()
    baseline.wards.forEach(ward => {
      map.set(
        ward.wardCode,
        computeWardProjection(ward, baseline.baselineNational, aggregate)
      )
    })
    return map
  }, [baseline, aggregate])

  const selectedLadFeature = useMemo(() => {
    if (!selectedLad || !ladGeo) return null
    return ladGeo.features.find(feature => feature.properties?.reference === selectedLad) ?? null
  }, [selectedLad, ladGeo])

  const wardFeatures = useMemo(() => {
    if (!wardGeo) return []
    if (!selectedLad || !baseline) return []
    const wardCodes = new Set(
      baseline.wards.filter(ward => ward.ladCode === selectedLad).map(ward => ward.wardCode)
    )
    return wardGeo.features.filter(feature => wardCodes.has(feature.properties?.reference))
  }, [wardGeo, selectedLad, baseline])

  const ladStyle = {
    color: '#444',
    weight: 1,
    fillColor: '#f2f2f2',
    fillOpacity: 0.3,
  }

  const wardStyle = (feature: GeoFeature) => {
    const wardCode = feature.properties?.reference
    const projection = wardMap.get(wardCode)
    const color = projection ? PARTY_COLORS[projection.winner] || '#ccc' : '#ccc'
    return {
      color: '#333',
      weight: 0.5,
      fillColor: color,
      fillOpacity: 0.7,
    }
  }

  const wardOnEachFeature = (feature: GeoFeature, layer: any) => {
    // @ts-ignore
    const wardCode = feature.properties?.reference
    const wardName = feature.properties?.name
    const projection = wardMap.get(wardCode)
    if (!projection) return

    let topParty = projection.winner
    let topValue = -1
    Object.entries(projection.shares).forEach(([party, value]) => {
      if (value > topValue) {
        topValue = value
        topParty = party
      }
    })

    // @ts-ignore
    layer.bindTooltip(
      `<strong>${wardName}</strong><br/>${topParty}: ${topValue.toFixed(1)}%`,
      { sticky: true }
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: '1rem',
          marginBottom: '0.25rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Local Elections 2026</h1>
        <a href="/aggregate">National Polling Average</a>
        <a href="/polls">Recent UK Polls</a>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem', color: '#555' }}>
        Click a council area to zoom into ward-level projections.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        <div style={{ fontSize: '0.9rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Legend</div>
          {Object.entries(PARTY_COLORS).map(([party, color]) => (
            <div
              key={party}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}
            >
              <span style={{ width: '12px', height: '12px', background: color }} />
              <span>{party}</span>
            </div>
          ))}
          {selectedLad && (
            <button
              style={{ marginTop: '1rem' }}
              onClick={() => setSelectedLad(null)}
            >
              Back to councils
            </button>
          )}
        </div>
        <div style={{ height: '70vh', border: '1px solid #eee' }}>
          {ladGeo ? (
            <MapContainer
              center={[53.7, -1.4]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {!selectedLad && (
                <GeoJSON
                  data={ladGeo as any}
                  style={ladStyle}
                  eventHandlers={{
                    click: event => {
                      const feature = event?.sourceTarget?.feature
                      const ladCode = feature?.properties?.reference
                      if (ladCode) setSelectedLad(ladCode)
                    },
                  }}
                />
              )}
              {selectedLad && wardFeatures.length > 0 && (
                <>
                  <GeoJSON data={wardFeatures as any} style={wardStyle} onEachFeature={wardOnEachFeature} />
                  <FitBounds feature={selectedLadFeature} />
                </>
              )}
            </MapContainer>
          ) : (
            <div style={{ padding: '1rem' }}>Loading map data...</div>
          )}
        </div>
      </div>
    </div>
  )
}
