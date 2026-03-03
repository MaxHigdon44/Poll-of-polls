import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LEAVE_EFFECT_STRENGTH,
  NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredPartyLeaveAdjustment,
} from '@/lib/local2026/leaveRemain'

const LocalMap = dynamic(() => import('../../components/LocalMap'), { ssr: false })

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

type LeaveShareLookup = {
  wards?: Record<string, { leaveShare: number }>
  lads?: Record<string, { leaveShare: number }>
  meta?: Record<string, any>
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

const ELECTION_LADS_2026 = new Set(
  [
    'Adur',
    'Basildon',
    'Basingstoke and Deane',
    'Brentwood',
    'Broxbourne',
    'Burnley',
    'Cambridge',
    'Cannock Chase',
    'Cheltenham',
    'Cherwell',
    'Chorley',
    'Colchester',
    'Crawley',
    'Eastleigh',
    'Epping Forest',
    'Exeter',
    'Fareham',
    'Gosport',
    'Harlow',
    'Hart',
    'Hastings',
    'Havant',
    'Huntingdonshire',
    'Hyndburn',
    'Ipswich',
    'Lincoln',
    'Newcastle-under-Lyme',
    'Norwich',
    'Nuneaton and Bedworth',
    'Oxford',
    'Pendle',
    'Preston',
    'Redditch',
    'Rochford',
    'Rugby',
    'Rushmoor',
    'South Cambridgeshire',
    'St Albans',
    'Stevenage',
    'Tamworth',
    'Three Rivers',
    'Tunbridge Wells',
    'Watford',
    'Welwyn Hatfield',
    'West Lancashire',
    'West Oxfordshire',
    'Winchester',
    'Worthing',
  ].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

const LONDON_BOROUGHS = new Set(
  [
    'Barking and Dagenham',
    'Barnet',
    'Bexley',
    'Brent',
    'Bromley',
    'Camden',
    'City of London',
    'Croydon',
    'Ealing',
    'Enfield',
    'Greenwich',
    'Hackney',
    'Hammersmith and Fulham',
    'Haringey',
    'Harrow',
    'Havering',
    'Hillingdon',
    'Hounslow',
    'Islington',
    'Kensington and Chelsea',
    'Kingston upon Thames',
    'Lambeth',
    'Lewisham',
    'Merton',
    'Newham',
    'Redbridge',
    'Richmond upon Thames',
    'Southwark',
    'Sutton',
    'Tower Hamlets',
    'Waltham Forest',
    'Wandsworth',
    'Westminster',
  ].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

const METRO_BOROUGHS = new Set(
  [
    'Barnsley',
    'Birmingham',
    'Bolton',
    'Bradford',
    'Bury',
    'Calderdale',
    'Coventry',
    'Dudley',
    'Gateshead',
    'Kirklees',
    'Knowsley',
    'Leeds',
    'Manchester',
    'Newcastle upon Tyne',
    'North Tyneside',
    'Oldham',
    'Rochdale',
    'Salford',
    'Sandwell',
    'Sefton',
    'Sheffield',
    'Solihull',
    'South Tyneside',
    'St Helens',
    'Stockport',
    'Sunderland',
    'Tameside',
    'Trafford',
    'Wakefield',
    'Walsall',
    'Wigan',
    'Wolverhampton',
  ].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

const UNITARY_AUTHORITIES = new Set(
  [
    'Blackburn with Darwen',
    'Halton',
    'Hartlepool',
    'Kingston upon Hull, City of',
    'Isle of Wight',
    'Milton Keynes',
    'North East Lincolnshire',
    'Peterborough',
    'Plymouth',
    'Portsmouth',
    'Reading',
    'Southampton',
    'Southend-on-Sea',
    'Swindon',
    'Thurrock',
    'Wokingham',
    'Elmbridge',
    'Epsom and Ewell',
    'Mole Valley',
    'Reigate and Banstead',
    'Tandridge',
    'Guildford',
    'Runnymede',
    'Spelthorne',
    'Surrey Heath',
    'Waverley',
    'Woking',
  ].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

const OFFICIAL_NAMES: Record<string, string> = {
  // Metropolitan boroughs (official names)
  'barnsley': 'Barnsley Borough Council',
  'birmingham': 'Birmingham City Council',
  'bolton': 'Bolton Borough Council',
  'bradford': 'Bradford City Council',
  'bury': 'Bury Borough Council',
  'calderdale': 'Calderdale Borough Council',
  'coventry': 'Coventry City Council',
  'dudley': 'Dudley Borough Council',
  'gateshead': 'Gateshead Borough Council',
  'kirklees': 'Kirklees Borough Council',
  'knowsley': 'Knowsley Borough Council',
  'leeds': 'Leeds City Council',
  'manchester': 'Manchester City Council',
  'newcastle upon tyne': 'Newcastle Upon Tyne City Council',
  'north tyneside': 'North Tyneside Borough Council',
  'oldham': 'Oldham Borough Council',
  'rochdale': 'Rochdale Borough Council',
  'salford': 'Salford City Council',
  'sandwell': 'Sandwell Borough Council',
  'sefton': 'Sefton Borough Council',
  'sheffield': 'Sheffield City Council',
  'solihull': 'Solihull Borough Council',
  'south tyneside': 'South Tyneside Borough Council',
  'st helens': 'St Helens Borough Council',
  'stockport': 'Stockport Borough Council',
  'sunderland': 'Sunderland City Council',
  'tameside': 'Tameside Borough Council',
  'trafford': 'Trafford Borough Council',
  'wakefield': 'Wakefield City Council',
  'walsall': 'Walsall Borough Council',
  'wigan': 'Wigan Borough Council',
  'wolverhampton': 'Wolverhampton City Council',

  // Unitary authorities (official names)
  'blackburn with darwen': 'Blackburn with Darwen Borough Council',
  'halton': 'Halton Borough Council',
  'hartlepool': 'Hartlepool Borough Council',
  'kingston upon hull, city of': 'Hull City Council',
  'isle of wight': 'Isle of Wight Council',
  'milton keynes': 'Milton Keynes Council',
  'north east lincolnshire': 'North East Lincolnshire Council',
  'peterborough': 'Peterborough City Council',
  'plymouth': 'Plymouth City Council',
  'portsmouth': 'Portsmouth City Council',
  'reading': 'Reading Borough Council',
  'southampton': 'Southampton City Council',
  'southend-on-sea': 'Southend-on-Sea Borough Council',
  'swindon': 'Swindon Borough Council',
  'thurrock': 'Thurrock Council',
  'wokingham': 'Wokingham Borough Council',

  // District councils (official names)
  'adur': 'Adur District Council',
  'basildon': 'Basildon Borough Council',
  'basingstoke and deane': 'Basingstoke & Deane Borough Council',
  'brentwood': 'Brentwood Borough Council',
  'broxbourne': 'Broxbourne Borough Council',
  'burnley': 'Burnley Borough Council',
  'cambridge': 'Cambridge City Council',
  'cannock chase': 'Cannock Chase District Council',
  'cheltenham': 'Cheltenham Borough Council',
  'cherwell': 'Cherwell District Council',
  'chorley': 'Chorley Borough Council',
  'colchester': 'Colchester City Council',
  'crawley': 'Crawley Borough Council',
  'eastleigh': 'Eastleigh Borough Council',
  'epping forest': 'Epping Forest District Council',
  'exeter': 'Exeter City Council',
  'fareham': 'Fareham Borough Council',
  'gosport': 'Gosport Borough Council',
  'harlow': 'Harlow District Council',
  'hart': 'Hart District Council',
  'hastings': 'Hastings Borough Council',
  'havant': 'Havant Borough Council',
  'huntingdonshire': 'Huntingdonshire District Council',
  'hyndburn': 'Hyndburn Borough Council',
  'ipswich': 'Ipswich Borough Council',
  'lincoln': 'Lincoln City Council',
  'newcastle-under-lyme': 'Newcastle-Under-Lyme Borough Council',
  'norwich': 'Norwich City Council',
  'nuneaton and bedworth': 'Nuneaton & Bedworth Borough Council',
  'oxford': 'Oxford City Council',
  'pendle': 'Pendle Borough Council',
  'preston': 'Preston City Council',
  'redditch': 'Redditch Borough Council',
  'rochford': 'Rochford District Council',
  'rugby': 'Rugby Borough Council',
  'rushmoor': 'Rushmoor Borough Council',
  'south cambridgeshire': 'South Cambridgeshire District Council',
  'st albans': 'St Albans City Council',
  'stevenage': 'Stevenage Borough Council',
  'tamworth': 'Tamworth Borough Council',
  'three rivers': 'Three Rivers District Council',
  'tunbridge wells': 'Tunbridge Wells Borough Council',
  'watford': 'Watford Borough Council',
  'welwyn hatfield': 'Welwyn Hatfield Borough Council',
  'west lancashire': 'West Lancashire District Council',
  'west oxfordshire': 'West Oxfordshire District Council',
  'winchester': 'Winchester City Council',
  'worthing': 'Worthing Borough Council',
}

const SURREY_EAST = new Set(
  ['Elmbridge', 'Epsom and Ewell', 'Mole Valley', 'Reigate and Banstead', 'Tandridge'].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

const SURREY_WEST = new Set(
  ['Guildford', 'Runnymede', 'Spelthorne', 'Surrey Heath', 'Waverley', 'Woking'].map(name =>
    name
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
  )
)

function normalizeName(value: string | undefined | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeWardProjection(
  ward: WardBaseline,
  baselineNational: Record<string, number>,
  aggregate: AggregateRow,
  leaveShare: number
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
  const adjustedLeaveShare = clampLeaveShare(leaveShare)
  nationalParties.forEach(party => {
    const base = ward.nationalShares[party] ?? 0
    const delta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
    const leaveAdj = getCenteredPartyLeaveAdjustment(party, adjustedLeaveShare)
    const value = Math.max(0, base + delta + LEAVE_EFFECT_STRENGTH * leaveAdj)
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

function sumShares(shares: Record<string, number>) {
  return Object.values(shares).reduce((acc, value) => acc + (value || 0), 0)
}

export default function Local2026Page() {
  const [wardGeo, setWardGeo] = useState<GeoCollection | null>(null)
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [aggregate, setAggregate] = useState<AggregateRow | null>(null)
  const [leaveLookup, setLeaveLookup] = useState<LeaveShareLookup | null>(null)
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

    fetch('/data/leave-share.json')
      .then(res => res.json())
      .then(setLeaveLookup)
      .catch(() => setLeaveLookup(null))

    fetch('/api/aggregate')
      .then(res => res.json())
      .then((data: AggregateResponse) => {
        setAggregate(data.aggregates?.[0] ?? null)
      })
      .catch(() => setAggregate(null))
  }, [])

  const getLeaveShareForWard = (
    wardCode: string,
    ladCode: string
  ): { leaveShare: number; source: 'ward' | 'lad' | 'national' } => {
    const wardShare = leaveLookup?.wards?.[wardCode]?.leaveShare
    if (typeof wardShare === 'number') {
      return { leaveShare: wardShare, source: 'ward' }
    }
    const ladShare = leaveLookup?.lads?.[ladCode]?.leaveShare
    if (typeof ladShare === 'number') {
      return { leaveShare: ladShare, source: 'lad' }
    }
    return { leaveShare: NATIONAL_LEAVE_SHARE, source: 'national' }
  }

  const wardMap = useMemo(() => {
    if (!baseline || !aggregate) return new Map<string, any>()
    const ladBaselineMap = new Map<
      string,
      { totalVotes: number; national: Record<string, number>; local: Record<string, number> }
    >()
    baseline.wards.forEach(ward => {
      const entry = ladBaselineMap.get(ward.ladCode) || {
        totalVotes: 0,
        national: {},
        local: {},
      }
      const weight = ward.totalVotes || 0
      if (weight > 0) {
        Object.entries(ward.nationalShares || {}).forEach(([party, share]) => {
          entry.national[party] = (entry.national[party] || 0) + share * weight
        })
        Object.entries(ward.localShares || {}).forEach(([party, share]) => {
          entry.local[party] = (entry.local[party] || 0) + share * weight
        })
        entry.totalVotes += weight
      }
      ladBaselineMap.set(ward.ladCode, entry)
    })

    const map = new Map<string, any>()
    baseline.wards.forEach(ward => {
      const nationalSum = sumShares(ward.nationalShares || {})
      const localSum = sumShares(ward.localShares || {})
      let adjustedWard = ward
      if (nationalSum + localSum === 0) {
        const ladBaseline = ladBaselineMap.get(ward.ladCode)
        if (ladBaseline && ladBaseline.totalVotes > 0) {
          const national = Object.fromEntries(
            Object.entries(ladBaseline.national).map(([party, value]) => [
              party,
              value / ladBaseline.totalVotes,
            ])
          )
          const local = Object.fromEntries(
            Object.entries(ladBaseline.local).map(([party, value]) => [
              party,
              value / ladBaseline.totalVotes,
            ])
          )
          adjustedWard = {
            ...ward,
            nationalShares: national,
            localShares: local,
          }
        }
      }
      const { leaveShare } = getLeaveShareForWard(ward.wardCode, ward.ladCode)
      const projection = computeWardProjection(
        adjustedWard,
        baseline.baselineNational,
        aggregate,
        leaveShare
      )
      map.set(ward.wardCode, {
        ...projection,
        color: PARTY_COLORS[projection.winner] || '#ccc',
      })
    })
    return map
  }, [baseline, aggregate])

  const eligibleLads = useMemo(() => {
    if (!ladGeo) return new Set<string>()
    const eligible = new Set<string>()
    ladGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const normalized = normalizeName(name)
      if (
        ELECTION_LADS_2026.has(normalized) ||
        LONDON_BOROUGHS.has(normalized) ||
        METRO_BOROUGHS.has(normalized) ||
        UNITARY_AUTHORITIES.has(normalized)
      ) {
        eligible.add(feature.properties?.reference)
      }
    })
    eligible.add('surrey-east')
    eligible.add('surrey-west')
    return eligible
  }, [ladGeo])

  const ladCategoryByCode = useMemo(() => {
    const mapping = new Map<string, 'district' | 'london' | 'metro' | 'unitary'>()
    if (!ladGeo) return mapping
    ladGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const code = feature.properties?.reference
      if (!code) return
      const normalized = normalizeName(name)
      if (LONDON_BOROUGHS.has(normalized)) {
        mapping.set(code, 'london')
      } else if (METRO_BOROUGHS.has(normalized)) {
        mapping.set(code, 'metro')
      } else if (UNITARY_AUTHORITIES.has(normalized)) {
        mapping.set(code, 'unitary')
      } else if (ELECTION_LADS_2026.has(normalized)) {
        mapping.set(code, 'district')
      }
    })
    return mapping
  }, [ladGeo])

  const surreyLadCodes = useMemo(() => {
    const codes = new Set<string>()
    if (!ladGeo) return codes
    ladGeo.features.forEach(feature => {
      const code = feature.properties?.reference
      const name = feature.properties?.name
      if (!code) return
      const normalized = normalizeName(name)
      if (SURREY_EAST.has(normalized) || SURREY_WEST.has(normalized)) {
        codes.add(code)
      }
    })
    return codes
  }, [ladGeo])

  const surreyEastCodes = useMemo(() => {
    const codes = new Set<string>()
    if (!ladGeo) return codes
    ladGeo.features.forEach(feature => {
      const code = feature.properties?.reference
      const name = feature.properties?.name
      if (!code) return
      if (SURREY_EAST.has(normalizeName(name))) {
        codes.add(code)
      }
    })
    return codes
  }, [ladGeo])

  const surreyWestCodes = useMemo(() => {
    const codes = new Set<string>()
    if (!ladGeo) return codes
    ladGeo.features.forEach(feature => {
      const code = feature.properties?.reference
      const name = feature.properties?.name
      if (!code) return
      if (SURREY_WEST.has(normalizeName(name))) {
        codes.add(code)
      }
    })
    return codes
  }, [ladGeo])

  const surreyOverlay = useMemo(() => {
    if (!ladGeo) return null
    const eastPolys: any[] = []
    const westPolys: any[] = []
    ladGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const normalized = normalizeName(name)
      const geom = feature.geometry
      if (!geom) return
      const target =
        SURREY_EAST.has(normalized) ? eastPolys : SURREY_WEST.has(normalized) ? westPolys : null
      if (!target) return
      if (geom.type === 'Polygon') {
        target.push(geom.coordinates)
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((coords: any) => target.push(coords))
      }
    })
    const features: GeoFeature[] = []
    if (eastPolys.length) {
      features.push({
        type: 'Feature',
        properties: { reference: 'surrey-east', name: 'East Surrey' },
        geometry: { type: 'MultiPolygon', coordinates: eastPolys },
      })
    }
    if (westPolys.length) {
      features.push({
        type: 'Feature',
        properties: { reference: 'surrey-west', name: 'West Surrey' },
        geometry: { type: 'MultiPolygon', coordinates: westPolys },
      })
    }
    return { type: 'FeatureCollection' as const, features }
  }, [ladGeo])

  const selectedLadFeature = useMemo(() => {
    if (!selectedLad || !ladGeo) return null
    if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
      return (
        surreyOverlay?.features.find(feature => feature.properties?.reference === selectedLad) ??
        null
      )
    }
    return ladGeo.features.find(feature => feature.properties?.reference === selectedLad) ?? null
  }, [selectedLad, ladGeo, surreyOverlay])

  const selectedCouncilName = useMemo(() => {
    if (!selectedLadFeature) return null
    const rawName = selectedLadFeature.properties?.name
    if (!rawName) return null
    const name = String(rawName)
    if (selectedLad === 'surrey-east') return 'East Surrey Council'
    if (selectedLad === 'surrey-west') return 'West Surrey Council'
    const normalized = normalizeName(name)
    if (LONDON_BOROUGHS.has(normalized)) {
      return `${name} Council`
    }
    if (OFFICIAL_NAMES[normalized]) return OFFICIAL_NAMES[normalized]
    if (/council$/i.test(name)) return name
    return `${name} Council`
  }, [selectedLadFeature])

  const wardFeatures = useMemo(() => {
    if (!wardGeo) return []
    if (!selectedLad || !baseline) return []
    let wardCodes: Set<string>
    if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
      const allowedCodes = selectedLad === 'surrey-east' ? surreyEastCodes : surreyWestCodes
      wardCodes = new Set(
        baseline.wards.filter(ward => allowedCodes.has(ward.ladCode)).map(ward => ward.wardCode)
      )
    } else {
      wardCodes = new Set(
        baseline.wards.filter(ward => ward.ladCode === selectedLad).map(ward => ward.wardCode)
      )
    }
    return wardGeo.features.filter(feature => wardCodes.has(feature.properties?.reference))
  }, [wardGeo, selectedLad, baseline])

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
        <a href="/local-2026">May 2026 Local Elections Projections</a>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem', color: '#555' }}>
        {selectedCouncilName ? (
          <span style={{ fontSize: '1.1rem', color: '#333' }}>{selectedCouncilName}</span>
        ) : (
          'Click a council area to zoom into ward-level projections.'
        )}
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
          <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Parties</div>
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
        <div>
          <div style={{ height: '70vh', border: '1px solid #eee' }}>
            {ladGeo ? (
              <LocalMap
                ladGeo={ladGeo}
                overlayAreas={surreyOverlay}
                overlayAreaCodes={new Set(['surrey-east', 'surrey-west'])}
                hiddenLadCodes={surreyLadCodes}
                wardFeatures={wardFeatures}
                wardMap={wardMap}
                selectedLad={selectedLad}
                selectedLadFeature={selectedLadFeature}
                onSelectLad={setSelectedLad}
                eligibleLads={eligibleLads}
                ladCategoryByCode={ladCategoryByCode}
              />
            ) : (
              <div style={{ padding: '1rem' }}>Loading map data...</div>
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              marginTop: '0.75rem',
              fontSize: '0.9rem',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '14px', height: '14px', background: '#2E8B57' }} />
              <span>District Councils</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '14px', height: '14px', background: '#6A1B9A' }} />
              <span>London Boroughs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '14px', height: '14px', background: '#FB8C00' }} />
              <span>Metropolitan Boroughs</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '14px', height: '14px', background: '#1E88E5' }} />
              <span>Unitary Authorities</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
