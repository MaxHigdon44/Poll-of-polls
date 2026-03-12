import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  LEAVE_EFFECT_STRENGTH,
  NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredPartyLeaveAdjustment,
} from '@/lib/local2026/leaveRemain'
import { AGE_BASELINE, AGE_EFFECT_STRENGTH, getAgeAdjustment } from '@/lib/local2026/age'
import { REGION_EFFECT_STRENGTH, getRegionAdjustment } from '@/lib/local2026/region'
import {
  NSSEC_EFFECT_STRENGTH,
  getNssecAdjustment,
  type NssecBaseline,
  type NssecShare,
} from '@/lib/local2026/nssec'
import {
  DEGREE_EFFECT_STRENGTH,
  getDegreeAdjustment,
  type DegreeBaseline,
  type DegreeShare,
} from '@/lib/local2026/degree'
import {
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
} from '@/lib/local2026/ge'

const LocalMap = dynamic(() => import('../../components/LocalMap'), { ssr: false })
const WARDS_GEO_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/627ae9540e3a4e199f4594a727b35724/geojson?layers=0'

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
  vacancies?: number
  totalVotes: number
  nationalShares: Record<string, number>
  localShares: Record<string, number>
}

type BaselineData = {
  generatedAt: string
  baselineNational: Record<string, number>
  wards: WardBaseline[]
}

type CouncilSeatRow = {
  council: string
  seatsUp: number
  totalSeats: number
  control: string | null
}

type CouncilSeatData = {
  generatedAt: string
  councils: CouncilSeatRow[]
}

type CouncilPreviousRow = {
  council: string
  url: string
  lastElection: Record<string, number>
  seatsBefore: Record<string, number>
  wardIncumbents?: Record<string, string>
}

type CouncilPreviousData = {
  generatedAt: string
  councils: CouncilPreviousRow[]
}

type CouncilComposition = {
  control: string | null
  seatsUp: number
  totalSeats: number
  cycle: string
  projectedControl: string
  totals: Record<string, number>
  previousTotals: Record<string, number>
  contestedTotals: Record<string, number>
  contestedPreviousTotals: Record<string, number>
  previousSource: string | null
}

type LeaveShareLookup = {
  wards?: Record<string, { leaveShare: number }>
  wardNames?: Record<string, { leaveShare: number }>
  lads?: Record<string, { leaveShare: number }>
  meta?: Record<string, any>
}

type AgeShareLookup = {
  wards?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNames?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNamesOnly?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNamesAggressive?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  lads?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
}

type RegionLookup = {
  lads?: Record<
    string,
    { ladCode: string; ladName: string; regionCode: string; regionName: string }
  >
}

type NssecLookup = {
  wards?: Record<string, NssecShare & { totalPop?: number; wardName?: string }>
  wardNames?: Record<string, NssecShare & { totalPop?: number; wardName?: string }>
  wardNamesOnly?: Record<string, NssecShare & { totalPop?: number; wardName?: string }>
  wardNamesAggressive?: Record<string, NssecShare & { totalPop?: number; wardName?: string }>
  lads?: Record<string, NssecShare>
  meta?: { baseline?: NssecBaseline }
}

type DegreeLookup = {
  wards?: Record<string, DegreeShare & { totalPop?: number; wardName?: string }>
  wardNames?: Record<string, DegreeShare & { totalPop?: number; wardName?: string }>
  wardNamesOnly?: Record<string, DegreeShare & { totalPop?: number; wardName?: string }>
  wardNamesAggressive?: Record<string, DegreeShare & { totalPop?: number; wardName?: string }>
  lads?: Record<string, DegreeShare>
  meta?: { baseline?: DegreeBaseline }
}

type WardToPconLookup = {
  wards?: Record<string, string>
  wardNames?: Record<string, string>
}

type GePconLookup = {
  pcon?: Record<string, Record<string, number>>
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
  ].map(normalizeName)
)

const COUNTY_ELECTIONS_2026 = new Set(
  ['East Sussex', 'Essex', 'Hampshire', 'Norfolk', 'Suffolk', 'West Sussex'].map(normalizeName)
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
  ].map(normalizeName)
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
  ].map(normalizeName)
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
  ].map(normalizeName)
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
  'kingston upon hull city of': 'Hull City Council',
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
  ['Elmbridge', 'Epsom and Ewell', 'Mole Valley', 'Reigate and Banstead', 'Tandridge'].map(
    normalizeName
  )
)

const SURREY_WEST = new Set(
  ['Guildford', 'Runnymede', 'Spelthorne', 'Surrey Heath', 'Waverley', 'Woking'].map(
    normalizeName
  )
)

function normalizeName(value: string | undefined | null) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeWardProjection(
  ward: WardBaseline,
  baselineNational: Record<string, number>,
  aggregate: AggregateRow,
  leaveShare: number,
  ageShare: { age18_35: number; age35_55: number; age55_plus: number },
  regionName: string | null,
  nssecShare: NssecShare,
  nssecBaseline: NssecBaseline,
  degreeShare: DegreeShare,
  degreeBaseline: DegreeBaseline,
  leaveStrength: number,
  ageStrength: number,
  regionStrength: number,
  nssecStrength: number,
  degreeStrength: number
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
    const ageAdj = getAgeAdjustment(party, ageShare)
    const regionAdj = getRegionAdjustment(party, regionName)
    const nssecAdj = getNssecAdjustment(party, nssecShare, nssecBaseline)
    const degreeAdj = getDegreeAdjustment(party, degreeShare, degreeBaseline)
    const value = Math.max(
      0,
      base +
        delta +
        leaveStrength * leaveAdj +
        ageStrength * ageAdj +
        regionStrength * regionAdj +
        nssecStrength * nssecAdj +
        degreeStrength * degreeAdj
    )
    adjustedNational[party] = value
    sumNational += value
  })

  const mergedLocalShares: Record<string, number> = { ...ward.localShares }
  if (typeof mergedLocalShares['Other'] === 'number') {
    const otherValue = mergedLocalShares['Other']
    const hasDuplicate = Object.entries(mergedLocalShares).some(([key, value]) => {
      if (key === 'Other') return false
      return Math.abs((value ?? 0) - otherValue) <= 3
    })
    const namedEntries = Object.entries(mergedLocalShares).filter(([key]) => key !== 'Other')
    const hasNamed = namedEntries.length > 0
    const namedMax = namedEntries.reduce(
      (max, [, value]) => Math.max(max, value ?? 0),
      0
    )
    const otherIsTop = otherValue >= namedMax
    if (hasDuplicate || (hasNamed && otherIsTop)) {
      delete mergedLocalShares['Other']
    }
  }
  const localBaseline = Object.fromEntries(
    Object.entries(mergedLocalShares).map(([key, value]) => [key, value * 0.9])
  )
  const localSum = Object.values(localBaseline).reduce((acc, value) => acc + value, 0)
  const remaining = 100 - localSum

  let scaledLocal: Record<string, number> = {}
  if (remaining <= 0) {
    const scaleLocal = localSum > 0 ? 100 / localSum : 0
    scaledLocal = Object.fromEntries(
      Object.entries(localBaseline).map(([key, value]) => [key, value * scaleLocal])
    )
    nationalParties.forEach(party => {
      adjustedNational[party] = 0
    })
    sumNational = 0
  } else {
    scaledLocal = localBaseline
    if (sumNational > 0) {
      const scale = remaining / sumNational
      nationalParties.forEach(party => {
        adjustedNational[party] = adjustedNational[party] * scale
      })
      sumNational = remaining
    }
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

function normalizeCouncilName(name: string) {
  return normalizeName(name)
    .replace(/[^\w\s]/g, '')
    .replace(/\bcouncil\b/g, '')
    .replace(/\bdistrict\b/g, '')
    .replace(/\bborough\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\bcity of\b/g, '')
    .replace(/\bborough of\b/g, '')
    .replace(/\bmetropolitan\b/g, '')
    .replace(/\bunitary\b/g, '')
    .replace(/\bkingston upon hull\b/g, 'hull')
    .replace(/\bof\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getGeoWardCode(feature: GeoFeature) {
  const props = feature.properties || {}
  return props.reference || props.WD25CD || props.WD23CD || props.WD22CD || null
}

function getGeoWardName(feature: GeoFeature) {
  const props = feature.properties || {}
  return String(props.WD25NM || props.WD23NM || props.WD22NM || props.name || '')
}

function getGeoWardNameKey(feature: GeoFeature) {
  const props = feature.properties || {}
  const wardName = getGeoWardName(feature)
  const ladName = String(props.LAD25NM || props.LAD23NM || props.LAD22NM || props.ladName || '')
  if (!wardName || !ladName) return null
  return `${normalizeName(ladName)}|${normalizeName(wardName)}`
}

function canonicalizePartyLabel(party: string | null | undefined) {
  const normalized = normalizeName(party)
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  return party || 'Other'
}

function isNationalOrStandardParty(party: string) {
  return new Set([
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
    'Independent',
    'Other',
  ]).has(party)
}

function resolvePreviousSeatBucket(party: string, currentTotals: Record<string, number>) {
  if (party in currentTotals) return party
  if (!isNationalOrStandardParty(party) && 'Independent' in currentTotals) {
    return 'Independent'
  }
  return party
}

function normalizeTotalsToTotal(targetTotal: number, totals: Record<string, number>) {
  const entries = Object.entries(totals).map(([party, seats]) => ({
    party,
    seats,
  }))
  const sum = entries.reduce((acc, entry) => acc + entry.seats, 0)
  if (!sum || sum === targetTotal) {
    return Object.fromEntries(entries.map(entry => [entry.party, Math.round(entry.seats)]))
  }
  const scale = targetTotal / sum
  const scaled = entries.map(entry => ({
    party: entry.party,
    scaled: entry.seats * scale,
  }))
  const floored = scaled.map(entry => ({
    party: entry.party,
    seats: Math.floor(entry.scaled),
    frac: entry.scaled - Math.floor(entry.scaled),
  }))
  let assigned = floored.reduce((acc, entry) => acc + entry.seats, 0)
  let remaining = targetTotal - assigned
  floored
    .sort((a, b) => b.frac - a.frac)
    .forEach(entry => {
      if (remaining <= 0) return
      entry.seats += 1
      remaining -= 1
    })
  return Object.fromEntries(floored.map(entry => [entry.party, entry.seats]))
}

export default function Local2026Page() {
  const router = useRouter()
  const [wardGeo, setWardGeo] = useState<GeoCollection | null>(null)
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [countyGeo, setCountyGeo] = useState<GeoCollection | null>(null)
  const [cedGeo, setCedGeo] = useState<GeoCollection | null>(null)
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [aggregate, setAggregate] = useState<AggregateRow | null>(null)
  const [leaveLookup, setLeaveLookup] = useState<LeaveShareLookup | null>(null)
  const [ageLookup, setAgeLookup] = useState<AgeShareLookup | null>(null)
  const [regionLookup, setRegionLookup] = useState<RegionLookup | null>(null)
  const [nssecLookup, setNssecLookup] = useState<NssecLookup | null>(null)
  const [degreeLookup, setDegreeLookup] = useState<DegreeLookup | null>(null)
  const [wardToPcon, setWardToPcon] = useState<WardToPconLookup | null>(null)
  const [geLookup, setGeLookup] = useState<GePconLookup | null>(null)
  const [councilSeats, setCouncilSeats] = useState<CouncilSeatData | null>(null)
  const [councilPrevious, setCouncilPrevious] = useState<CouncilPreviousData | null>(null)
  const [selectedLad, setSelectedLad] = useState<string | null>(null)
  const [leaveStrength, setLeaveStrength] = useState(LEAVE_EFFECT_STRENGTH)
  const [ageStrength, setAgeStrength] = useState(AGE_EFFECT_STRENGTH)
  const [regionStrength, setRegionStrength] = useState(REGION_EFFECT_STRENGTH)
  const [nssecStrength, setNssecStrength] = useState(NSSEC_EFFECT_STRENGTH)
  const [degreeStrength, setDegreeStrength] = useState(DEGREE_EFFECT_STRENGTH)
  const [geReformWeight, setGeReformWeight] = useState(GE_WEIGHT_REFORM)
  const [geGreenWeight, setGeGreenWeight] = useState(GE_WEIGHT_GREEN)
  const [geMajorWeight, setGeMajorWeight] = useState(GE_WEIGHT_MAJOR)

  useEffect(() => {
    fetch('/data/lads.geojson')
      .then(res => res.json())
      .then(setLadGeo)
      .catch(() => setLadGeo(null))

    fetch('/data/counties.geojson')
      .then(res => res.json())
      .then(setCountyGeo)
      .catch(() => setCountyGeo(null))

    fetch('/data/ced.geojson')
      .then(res => res.json())
      .then(setCedGeo)
      .catch(() => setCedGeo(null))

    fetch('/data/ward-baseline.json')
      .then(res => res.json())
      .then(setBaseline)
      .catch(() => setBaseline(null))

    fetch('/data/leave-share.json')
      .then(res => res.json())
      .then(setLeaveLookup)
      .catch(() => setLeaveLookup(null))

    fetch('/data/age-share.json')
      .then(res => res.json())
      .then(setAgeLookup)
      .catch(() => setAgeLookup(null))

    fetch('/data/lad-region.json')
      .then(res => res.json())
      .then(setRegionLookup)
      .catch(() => setRegionLookup(null))

    fetch('/data/nssec-share.json')
      .then(res => res.json())
      .then(setNssecLookup)
      .catch(() => setNssecLookup(null))

    fetch('/data/degree-share.json')
      .then(res => res.json())
      .then(setDegreeLookup)
      .catch(() => setDegreeLookup(null))

    fetch('/data/ward-to-pcon.json')
      .then(res => res.json())
      .then(setWardToPcon)
      .catch(() => setWardToPcon(null))

    fetch('/data/ge2024-pcon.json')
      .then(res => res.json())
      .then(setGeLookup)
      .catch(() => setGeLookup(null))

    fetch('/data/council-seats.json')
      .then(res => res.json())
      .then(setCouncilSeats)
      .catch(() => setCouncilSeats(null))

    fetch('/data/council-previous.json')
      .then(res => res.json())
      .then(setCouncilPrevious)
      .catch(() => setCouncilPrevious(null))

    fetch('/api/aggregate')
      .then(res => res.json())
      .then((data: AggregateResponse) => {
        setAggregate(data.aggregates?.[0] ?? null)
      })
      .catch(() => setAggregate(null))
  }, [])

  useEffect(() => {
    if (!selectedLad) return
    if (wardGeo) return
    let cancelled = false
    const fetchGeo = async () => {
      try {
        const res = await fetch('/data/wards.geojson')
        if (!res.ok) throw new Error('local not found')
        const data = await res.json()
        if (!cancelled) setWardGeo(data)
      } catch {
        try {
          const res = await fetch(WARDS_GEO_URL)
          if (!res.ok) throw new Error('remote not found')
          const data = await res.json()
          if (!cancelled) setWardGeo(data)
        } catch {
          if (!cancelled) setWardGeo(null)
        }
      }
    }
    void fetchGeo()
    return () => {
      cancelled = true
    }
  }, [selectedLad, wardGeo])

  useEffect(() => {
    if (!router.isReady) return
    const council = router.query.council
    if (typeof council === 'string' && council) {
      setSelectedLad(council)
    }
  }, [router.isReady, router.query.council])

  useEffect(() => {
    router.prefetch('/council-projections')
  }, [router])

  useEffect(() => {
    const handleRouteStart = (url: string) => {
      if (!url.startsWith('/local-2026')) {
        setSelectedLad(null)
        setWardGeo(null)
      }
    }
    router.events.on('routeChangeStart', handleRouteStart)
    return () => {
      router.events.off('routeChangeStart', handleRouteStart)
    }
  }, [router.events])

  const councilGeo = useMemo<GeoCollection | null>(() => {
    if (!ladGeo) return null
    const countyFeatures = countyGeo?.features || []
    const ladFeatures = ladGeo.features || []
    return {
      type: 'FeatureCollection',
      features: [...countyFeatures, ...ladFeatures],
    }
  }, [ladGeo, countyGeo])

  useEffect(() => {
    if (!router.isReady) return
    if (selectedLad) {
      void router.replace(
        { pathname: '/local-2026', query: { council: selectedLad } },
        undefined,
        { shallow: true }
      )
    }
  }, [selectedLad, router])

  const getLeaveShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { leaveShare: number; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = leaveLookup?.wards?.[wardCode]?.leaveShare
    if (typeof wardShare === 'number') {
      return { leaveShare: wardShare, source: 'ward' }
    }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = leaveLookup?.wardNames?.[key]?.leaveShare
      if (typeof nameShare === 'number') {
        return { leaveShare: nameShare, source: 'ward-name' }
      }
    }
    const ladShare = leaveLookup?.lads?.[ladCode]?.leaveShare
    if (typeof ladShare === 'number') {
      return { leaveShare: ladShare, source: 'lad' }
    }
    return { leaveShare: NATIONAL_LEAVE_SHARE, source: 'national' }
  }

  const getAgeShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: { age18_35: number; age35_55: number; age55_plus: number }; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = ageLookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = ageLookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = ageLookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = ageLookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = ageLookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: AGE_BASELINE, source: 'national' }
  }

  const getRegionForWard = (ladCode: string) => {
    const entry = regionLookup?.lads?.[ladCode]
    if (entry?.regionName) return entry.regionName
    return null
  }

  const getNssecBaseline = () => {
    const baseline = nssecLookup?.meta?.baseline
    if (baseline) return baseline
    return { higher: 0.33, intermediate: 0.33, lower: 0.34 }
  }

  const getNssecShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: NssecShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = nssecLookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = nssecLookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = nssecLookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = nssecLookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = nssecLookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getNssecBaseline(), source: 'national' }
  }

  const getDegreeBaseline = () => {
    const baseline = degreeLookup?.meta?.baseline
    if (baseline) return baseline
    return { degree: 0.4, noDegree: 0.6 }
  }

  const getDegreeShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: DegreeShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = degreeLookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = degreeLookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = degreeLookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = degreeLookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = degreeLookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getDegreeBaseline(), source: 'national' }
  }

  const wardIncumbentLookup = useMemo(() => {
    const map = new Map<string, string>()
    councilPrevious?.councils?.forEach(row => {
      const councilKey = normalizeCouncilName(row.council)
      Object.entries(row.wardIncumbents || {}).forEach(([wardName, party]) => {
        map.set(`${councilKey}|${normalizeName(wardName)}`, canonicalizePartyLabel(party))
      })
    })
    return map
  }, [councilPrevious])

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
      const geWeights = {
        reform: geReformWeight,
        green: geGreenWeight,
        major: geMajorWeight,
      }
      const wardNameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      const pconCode =
        wardToPcon?.wards?.[ward.wardCode] || wardToPcon?.wardNames?.[wardNameKey]
      const geShares = pconCode ? geLookup?.pcon?.[pconCode] : null
      if (geShares) {
        const beforeBlend = { ...adjustedWard.nationalShares }
        const blendedNational = { ...adjustedWard.nationalShares }
        ;[
          'Labour',
          'Conservative',
          'Reform',
          'Liberal Democrat',
          'Green',
          'SNP',
          'Plaid Cymru',
        ].forEach(party => {
          const weight = getGeWeightForParty(party, geWeights)
          if (!weight) return
          const baseShare = adjustedWard.nationalShares?.[party] ?? 0
          const geShare = geShares?.[party]
          if (baseShare === 0 && (party === 'Reform' || party === 'Green')) {
            blendedNational[party] = blendShare(baseShare, geShare, 1)
            return
          }
          blendedNational[party] = blendShare(baseShare, geShare, weight)
        })
        adjustedWard = { ...adjustedWard, nationalShares: blendedNational }
      }

      const { leaveShare, source } = getLeaveShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const ageShare = getAgeShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const regionName = getRegionForWard(ward.ladCode)
      const nssecShare = getNssecShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const nssecBaseline = getNssecBaseline()
      const degreeShare = getDegreeShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const degreeBaseline = getDegreeBaseline()
      const ageStrengthEffective =
        ageShare.source === 'lad' ? Math.min(ageStrength, 0.6) : ageStrength
      const nssecStrengthEffective =
        nssecShare.source === 'lad' ? Math.min(nssecStrength, 0.6) : nssecStrength
      const degreeStrengthEffective =
        degreeShare.source === 'lad' ? Math.min(degreeStrength, 0.6) : degreeStrength
      const projection = computeWardProjection(
        adjustedWard,
        baseline.baselineNational,
        aggregate,
        leaveShare,
        ageShare.share,
        regionName,
        nssecShare.share,
        nssecBaseline,
        degreeShare.share,
        degreeBaseline,
        leaveStrength,
        ageStrengthEffective,
        regionStrength,
        nssecStrengthEffective,
        degreeStrengthEffective
      )
      const previousShares: Record<string, number> = {
        ...adjustedWard.nationalShares,
        ...adjustedWard.localShares,
      }
      const incumbentKey = `${normalizeCouncilName(ward.ladName)}|${normalizeName(ward.wardName)}`
      let prevWinner: string | null = wardIncumbentLookup.get(incumbentKey) || null
      let prevTop = -1
      if (!prevWinner) {
        Object.entries(previousShares).forEach(([party, value]) => {
          const numericValue = Number(value)
          if (!Number.isFinite(numericValue)) return
          if (numericValue > prevTop) {
            prevTop = numericValue
            prevWinner = party
          }
        })
      }
      map.set(ward.wardCode, {
        ...projection,
        color: PARTY_COLORS[projection.winner] || '#ccc',
        leaveSource: source,
        prevWinner,
      })
    })
    return map
  }, [
    baseline,
    aggregate,
    leaveLookup,
    ageLookup,
    regionLookup,
    nssecLookup,
    degreeLookup,
    wardToPcon,
    geLookup,
    leaveStrength,
    ageStrength,
    regionStrength,
    nssecStrength,
    degreeStrength,
    geReformWeight,
    geGreenWeight,
    geMajorWeight,
    wardIncumbentLookup,
  ])

  const wardMapByName = useMemo(() => {
    if (!baseline || !aggregate) return new Map<string, any>()
    const map = new Map<string, any>()
    baseline.wards.forEach(ward => {
      const key = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      if (map.has(key)) return
      const projection = wardMap.get(ward.wardCode)
      if (!projection) return
      map.set(key, projection)
    })
    return map
  }, [baseline, aggregate, wardMap])

  const wardMapByWardName = useMemo(() => {
    if (!baseline || !aggregate || !selectedLad) return new Map<string, any>()
    const map = new Map<string, any>()
    baseline.wards
      .filter(ward => ward.ladCode === selectedLad)
      .forEach(ward => {
        const key = normalizeName(ward.wardName)
        if (map.has(key)) return
        const projection = wardMap.get(ward.wardCode)
        if (!projection) return
        map.set(key, projection)
      })
    return map
  }, [baseline, aggregate, selectedLad, wardMap])

  const ladFallbackProjection = useMemo(() => {
    if (!baseline || !aggregate || !selectedLad) return null
    const wards = baseline.wards.filter(ward => ward.ladCode === selectedLad)
    if (!wards.length) return null
    const totals: Record<string, number> = {}
    let weightSum = 0
    wards.forEach(ward => {
      const projection =
        wardMap.get(ward.wardCode) || wardMapByWardName.get(normalizeName(ward.wardName))
      if (!projection) return
      const weight = ward.totalVotes || 0
      if (!weight) return
      weightSum += weight
      Object.entries(projection.shares).forEach(([party, value]) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return
        totals[party] = (totals[party] || 0) + numericValue * weight
      })
    })
    if (!weightSum) return null
    const shares: Record<string, number> = {}
    Object.entries(totals).forEach(([party, value]) => {
      shares[party] = value / weightSum
    })
    let winner = 'Other'
    let topValue = -1
    Object.entries(shares).forEach(([party, value]) => {
      if (value > topValue) {
        topValue = value
        winner = party
      }
    })
    return {
      winner,
      shares,
      color: PARTY_COLORS[winner] || '#ccc',
      prevWinner: null,
    }
  }, [baseline, aggregate, selectedLad, wardMap, wardMapByWardName])

  const wardVacancies = useMemo(() => {
    if (!baseline || !selectedLad) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = baseline.wards.filter(ward => ward.ladCode === selectedLad)
    const councilName = wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    const seatsUp = seatRow?.seatsUp || 0
    const totalSeats = seatRow?.totalSeats || 0
    let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
    if (seatsUp && totalSeats) {
      if (seatsUp === totalSeats) cycle = 'all_out'
      else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) cycle = 'thirds'
      else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) cycle = 'halves'
    }
    wards.forEach(ward => {
      const seatsThisCycle = cycle === 'all_out' ? Math.max(ward.vacancies || 0, 1) : 1
      map.set(ward.wardCode, seatsThisCycle)
    })
    return map
  }, [baseline, selectedLad, councilSeats])

  const wardVacanciesByName = useMemo(() => {
    if (!baseline || !selectedLad) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = baseline.wards.filter(ward => ward.ladCode === selectedLad)
    const councilName = wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    const seatsUp = seatRow?.seatsUp || 0
    const totalSeats = seatRow?.totalSeats || 0
    let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
    if (seatsUp && totalSeats) {
      if (seatsUp === totalSeats) cycle = 'all_out'
      else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) cycle = 'thirds'
      else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) cycle = 'halves'
    }
    wards.forEach(ward => {
      const seatsThisCycle = cycle === 'all_out' ? Math.max(ward.vacancies || 0, 1) : 1
      map.set(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`, seatsThisCycle)
    })
    return map
  }, [baseline, selectedLad, councilSeats])

  const contestedWardKeys = useMemo(() => {
    const empty = { codes: new Set<string>(), names: new Set<string>() }
    if (!baseline || !selectedLad || !councilSeats?.councils?.length) return empty
    const allWards = baseline.wards.filter(ward => ward.ladCode === selectedLad)
    if (!allWards.length) return empty
    const councilName = allWards[0]?.ladName || ''
    const seatRow = councilSeats.councils.find(
      row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
    )
    if (!seatRow) return empty
    const previousRow = councilPrevious?.councils?.find(
      row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
    )
    const seatsUp = seatRow.seatsUp
    const totalSeats = seatRow.totalSeats
    let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
    if (seatsUp === totalSeats) {
      cycle = 'all_out'
    } else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) {
      cycle = 'thirds'
    } else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) {
      cycle = 'halves'
    } else {
      const ratio = totalSeats ? seatsUp / totalSeats : 1
      if (ratio >= 0.28 && ratio <= 0.38) cycle = 'thirds'
      else if (ratio >= 0.45 && ratio <= 0.55) cycle = 'halves'
      else cycle = 'all_out'
    }
    if (cycle === 'all_out') {
      allWards.forEach(ward => {
        empty.codes.add(ward.wardCode)
        empty.names.add(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`)
      })
      return empty
    }
    const wardIncumbents = previousRow?.wardIncumbents || null
    const normalizedWardIncumbents = new Set(
      Object.keys(wardIncumbents || {}).map(wardName => normalizeName(wardName))
    )
    const inferredContestedSeats = allWards.reduce((acc, ward) => {
      const lastYear = ward.lastYear || 2026
      const contested =
        cycle === 'thirds'
          ? (2026 - lastYear) % 3 === 0
          : cycle === 'halves'
            ? (2026 - lastYear) % 2 === 0
            : true
      return acc + (contested ? Math.max(ward.vacancies || 0, 1) : 0)
    }, 0)
    const incumbentMatchedWards = allWards.filter(ward =>
      normalizedWardIncumbents.has(normalizeName(ward.wardName))
    )
    const shouldUseWardIncumbents =
      incumbentMatchedWards.length > 0 &&
      Math.abs(incumbentMatchedWards.length - seatsUp) <= Math.abs(inferredContestedSeats - seatsUp)

    allWards.forEach(ward => {
      const contested = shouldUseWardIncumbents
        ? normalizedWardIncumbents.has(normalizeName(ward.wardName))
        : cycle === 'thirds'
          ? (2026 - (ward.lastYear || 2026)) % 3 === 0
          : cycle === 'halves'
            ? (2026 - (ward.lastYear || 2026)) % 2 === 0
            : true
      if (!contested) return
      empty.codes.add(ward.wardCode)
      empty.names.add(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`)
    })
    return empty
  }, [baseline, selectedLad, councilSeats, councilPrevious])

  const eligibleLads = useMemo(() => {
    if (!councilGeo) return new Set<string>()
    const eligible = new Set<string>()
    councilGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const normalized = normalizeName(name)
      if (
        COUNTY_ELECTIONS_2026.has(normalized) ||
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
  }, [councilGeo])

  const ladCategoryByCode = useMemo(() => {
    const mapping = new Map<string, 'county' | 'district' | 'london' | 'metro' | 'unitary'>()
    if (!councilGeo) return mapping
    councilGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const code = feature.properties?.reference
      if (!code) return
      const normalized = normalizeName(name)
      if (COUNTY_ELECTIONS_2026.has(normalized)) {
        mapping.set(code, 'county')
      } else if (LONDON_BOROUGHS.has(normalized)) {
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
  }, [councilGeo])

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

  const councilComposition = useMemo<CouncilComposition | null>(() => {
    if (!baseline || !selectedLad || !councilSeats?.councils?.length || !councilGeo) return null
    const selectedFeature = (() => {
      if (!selectedLad) return null
      if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
        return surreyOverlay?.features.find(
          feature => feature.properties?.reference === selectedLad
        )
      }
      return councilGeo.features.find(feature => feature.properties?.reference === selectedLad) ?? null
    })()
    if (!selectedFeature) return null
    const councilName = String(selectedFeature.properties?.name || '')
    if (!councilName) return null
    const isCounty = COUNTY_ELECTIONS_2026.has(normalizeName(councilName))
    const normalizedTarget = normalizeCouncilName(councilName)
    const seatRow = councilSeats.councils.find(
      row => normalizeCouncilName(row.council) === normalizedTarget
    )
    if (!seatRow) return null
    const previousRow = councilPrevious?.councils?.find(
      row => normalizeCouncilName(row.council) === normalizedTarget
    )
    const wardIncumbents = previousRow?.wardIncumbents || null
    const normalizedWardIncumbents = new Map<string, string>(
      Object.entries(wardIncumbents || {}).map(([wardName, party]) => [
        normalizeName(wardName),
        canonicalizePartyLabel(party),
      ])
    )

    const seatsUp = seatRow.seatsUp
    const totalSeats = seatRow.totalSeats
    let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
    if (seatsUp === totalSeats) {
      cycle = 'all_out'
    } else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) {
      cycle = 'thirds'
    } else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) {
      cycle = 'halves'
    } else {
      const ratio = totalSeats ? seatsUp / totalSeats : 1
      if (ratio >= 0.28 && ratio <= 0.38) cycle = 'thirds'
      else if (ratio >= 0.45 && ratio <= 0.55) cycle = 'halves'
      else cycle = 'all_out'
    }

    const allWards = baseline.wards.filter(ward => ward.ladCode === selectedLad)
    const inferredContestedSeats = allWards.reduce((acc, ward) => {
      const lastYear = ward.lastYear || 2026
      let contested = true
      if (cycle === 'thirds') {
        contested = (2026 - lastYear) % 3 === 0
      } else if (cycle === 'halves') {
        contested = (2026 - lastYear) % 2 === 0
      }
      if (!contested) return acc
      return acc + Math.max(ward.vacancies || 0, 1)
    }, 0)
    const incumbentMatchedWards = wardIncumbents
      ? allWards.filter(ward => normalizedWardIncumbents.has(normalizeName(ward.wardName)))
      : []
    const incumbentMatchedSeats = incumbentMatchedWards.length
    const shouldUseWardIncumbents =
      incumbentMatchedWards.length > 0 &&
      Math.abs(incumbentMatchedSeats - seatsUp) <= Math.abs(inferredContestedSeats - seatsUp)
    const wards = shouldUseWardIncumbents ? incumbentMatchedWards : allWards
    const totals: Record<string, number> = {}
    const previousTotals: Record<string, number> = {}
    const contestedTotals: Record<string, number> = {}
    const contestedPreviousTotals: Record<string, number> = {}
    const seatChangeEvents: Array<{ prevWinner: string; projectedWinner: string; seats: number }> = []
    const seatMultiplier = cycle === 'thirds' ? 3 : cycle === 'halves' ? 2 : 1
    let useLastYear = !shouldUseWardIncumbents && cycle !== 'all_out'
    if (useLastYear) {
      const contestedSeats = wards.reduce((acc, ward) => {
        const lastYear = ward.lastYear || 2026
        let contested = true
        if (cycle === 'thirds') {
          contested = (2026 - lastYear) % 3 === 0
        } else if (cycle === 'halves') {
          contested = (2026 - lastYear) % 2 === 0
        }
        if (!contested) return acc
        return acc + Math.max(ward.vacancies || 0, 1)
      }, 0)
      if (contestedSeats < seatsUp * 0.5) {
        useLastYear = false
      }
    }
    const activeSubAreaGeo = isCounty ? cedGeo : wardGeo
    const visibleWardFeatures =
      activeSubAreaGeo && Array.isArray(activeSubAreaGeo.features)
        ? activeSubAreaGeo.features.filter(feature => {
            if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
              const allowedCodes = selectedLad === 'surrey-east' ? surreyEastCodes : surreyWestCodes
              const code = getGeoWardCode(feature)
              const baselineWard = allWards.find(ward => ward.wardCode === code)
              return Boolean(baselineWard && allowedCodes.has(baselineWard.ladCode))
            }
            if (isCounty) {
              const code = getGeoWardCode(feature)
              return Boolean(code && allWards.some(ward => ward.wardCode === code))
            }
            const selectedName = selectedFeature.properties?.name
            if (selectedName) {
              const props = feature.properties || {}
              const ladName = props.LAD25NM || props.LAD23NM || props.LAD22NM || props.ladName
              return normalizeName(ladName) === normalizeName(selectedName)
            }
            return false
          })
        : []
    const baselineByCode = new Map(allWards.map(ward => [ward.wardCode, ward]))
    const baselineByName = new Map(
      allWards.map(ward => [`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`, ward])
    )
    const contestedWardFeatures = visibleWardFeatures.filter(feature => {
      const wardName = normalizeName(getGeoWardName(feature))
      if (shouldUseWardIncumbents) {
        return normalizedWardIncumbents.has(wardName)
      }
      const code = getGeoWardCode(feature)
      const nameKey = getGeoWardNameKey(feature) || ''
      const baselineWard = (code ? baselineByCode.get(code) : null) || baselineByName.get(nameKey)
      if (!baselineWard) return cycle === 'all_out'
      if (cycle === 'all_out') return true
      const lastYear = baselineWard.lastYear || 2026
      if (cycle === 'thirds') {
        return (2026 - lastYear) % 3 === 0
      }
      if (cycle === 'halves') {
        return (2026 - lastYear) % 2 === 0
      }
      return true
    })
    const useFeatureContested = contestedWardFeatures.length > 0
    wards.forEach(ward => {
      if (useFeatureContested) {
        return
      }
      const seatsUpCount = shouldUseWardIncumbents ? 1 : Math.max(ward.vacancies || 0, 1)
      const seats = seatsUpCount * seatMultiplier
      const projection =
        wardMap.get(ward.wardCode) || wardMapByWardName.get(normalizeName(ward.wardName))
      const projectedWinner = projection?.winner || ladFallbackProjection?.winner || 'Other'
      const previousShares: Record<string, number> = {
        ...ward.nationalShares,
        ...ward.localShares,
      }
      let prevWinner: string | null = null
      const incumbentWinner = shouldUseWardIncumbents
        ? normalizedWardIncumbents.get(normalizeName(ward.wardName))
        : null
      if (incumbentWinner) {
        prevWinner = canonicalizePartyLabel(incumbentWinner)
      }
      let prevTop = -1
      if (!prevWinner) {
        Object.entries(previousShares).forEach(([party, value]) => {
          const numericValue = Number(value)
          if (!Number.isFinite(numericValue)) return
          if (numericValue > prevTop) {
            prevTop = numericValue
            prevWinner = party
          }
        })
      }
      const lastYear = ward.lastYear || 2026
      let contested = shouldUseWardIncumbents ? Boolean(incumbentWinner) : true
      if (useLastYear) {
        if (cycle === 'thirds') {
          contested = (2026 - lastYear) % 3 === 0
        } else if (cycle === 'halves') {
          contested = (2026 - lastYear) % 2 === 0
        }
      }
      const winner = canonicalizePartyLabel(
        contested ? projectedWinner : prevWinner || projectedWinner
      )
      totals[winner] = (totals[winner] || 0) + seats
      const prev = canonicalizePartyLabel(prevWinner || projectedWinner)
      previousTotals[prev] = (previousTotals[prev] || 0) + seats
      if (contested) {
        const contestedProjected = canonicalizePartyLabel(projectedWinner)
        contestedTotals[contestedProjected] =
          (contestedTotals[contestedProjected] || 0) + seatsUpCount
        const contestedPrev = canonicalizePartyLabel(prevWinner || projectedWinner)
        contestedPreviousTotals[contestedPrev] =
          (contestedPreviousTotals[contestedPrev] || 0) + seatsUpCount
        seatChangeEvents.push({
          prevWinner: contestedPrev,
          projectedWinner: contestedProjected,
          seats: seatsUpCount,
        })
      }
    })
    if (useFeatureContested) {
      contestedWardFeatures.forEach(feature => {
        const projection =
          wardMap.get(getGeoWardCode(feature) || '') ||
          wardMapByName.get(getGeoWardNameKey(feature) || '') ||
          wardMapByWardName.get(normalizeName(getGeoWardName(feature))) ||
          ladFallbackProjection
        if (!projection) return
        const code = getGeoWardCode(feature)
        const nameKey = getGeoWardNameKey(feature) || ''
        const baselineWard = (code ? baselineByCode.get(code) : null) || baselineByName.get(nameKey)
        const seatsUpCount = shouldUseWardIncumbents ? 1 : Math.max(baselineWard?.vacancies || 0, 1)
        const seats = seatsUpCount * seatMultiplier
        const wardName = normalizeName(getGeoWardName(feature))
        const prevWinner =
          (shouldUseWardIncumbents ? normalizedWardIncumbents.get(wardName) : null) ||
          canonicalizePartyLabel(projection.prevWinner || '')
        if (!prevWinner) return
        const projectedWinner = canonicalizePartyLabel(projection.winner)
        contestedTotals[projectedWinner] = (contestedTotals[projectedWinner] || 0) + seatsUpCount
        contestedPreviousTotals[prevWinner] =
          (contestedPreviousTotals[prevWinner] || 0) + seatsUpCount
        totals[projectedWinner] = (totals[projectedWinner] || 0) + seats
        previousTotals[prevWinner] = (previousTotals[prevWinner] || 0) + seats
        seatChangeEvents.push({
          prevWinner,
          projectedWinner,
          seats: seatsUpCount,
        })
      })
    }

    let adjustedTotals = totals
    let adjustedPreviousTotals = previousTotals
    if (seatMultiplier === 1) {
      adjustedTotals = normalizeTotalsToTotal(totalSeats, totals)
      adjustedPreviousTotals = normalizeTotalsToTotal(totalSeats, previousTotals)
    }
    if (
      !shouldUseWardIncumbents &&
      previousRow?.lastElection &&
      Object.keys(previousRow.lastElection).length
    ) {
      adjustedPreviousTotals = normalizeTotalsToTotal(totalSeats, previousRow.lastElection)
    }
    const normalizeContested = !useFeatureContested && !useLastYear && !shouldUseWardIncumbents
    const adjustedContestedTotals = normalizeContested
      ? normalizeTotalsToTotal(seatsUp, contestedTotals)
      : { ...contestedTotals }
    const adjustedContestedPreviousTotals = normalizeContested
      ? normalizeTotalsToTotal(seatsUp, contestedPreviousTotals)
      : { ...contestedPreviousTotals }
    // Use raw counts when we know the contested wards; otherwise normalize to seatsUp

    let projectedTotals = adjustedTotals
    let projectedPreviousTotals = adjustedPreviousTotals
    if (cycle === 'all_out') {
      projectedTotals = normalizeTotalsToTotal(totalSeats, adjustedContestedTotals)
      if (Object.keys(adjustedContestedPreviousTotals).length) {
        projectedPreviousTotals = normalizeTotalsToTotal(
          totalSeats,
          adjustedContestedPreviousTotals
        )
      }
    } else if (previousRow?.seatsBefore && Object.keys(previousRow.seatsBefore).length) {
      const currentTotals = { ...previousRow.seatsBefore }
      const currentSum = Object.values(currentTotals).reduce((acc, value) => acc + (value || 0), 0)
      if (currentSum && currentSum < totalSeats) {
        currentTotals.Other = (currentTotals.Other || 0) + (totalSeats - currentSum)
      }
      projectedPreviousTotals = currentTotals
      if (seatChangeEvents.length) {
        const projected: Record<string, number> = { ...currentTotals }
        seatChangeEvents.forEach(({ prevWinner, projectedWinner, seats }) => {
          const prevBucket = resolvePreviousSeatBucket(prevWinner, projected)
          projected[prevBucket] = Math.max(0, (projected[prevBucket] || 0) - seats)
          projected[projectedWinner] = (projected[projectedWinner] || 0) + seats
        })
        projectedTotals = projected
      } else {
        const projected: Record<string, number> = { ...currentTotals }
        const parties = new Set<string>([
          ...Object.keys(adjustedContestedTotals),
          ...Object.keys(currentTotals),
        ])
        parties.forEach(party => {
          const currentSeats = currentTotals[party] || 0
          const lastSeats = adjustedContestedPreviousTotals[party] || 0
          const projectedSeats = adjustedContestedTotals[party] || 0
          const next = currentSeats + (projectedSeats - lastSeats)
          projected[party] = Math.max(0, Math.round(next))
        })
        projectedTotals = normalizeTotalsToTotal(totalSeats, projected)
      }
    }

    let projectedControl: string | null = null
    Object.entries(projectedTotals).forEach(([party, seats]) => {
      if (seats > totalSeats / 2) projectedControl = party
    })
    const controlLabel = projectedControl ? `${projectedControl} majority` : 'No overall control'

    return {
      council: seatRow.council,
      control: seatRow.control,
      seatsUp,
      totalSeats,
      cycle,
      totals: projectedTotals,
      previousTotals: projectedPreviousTotals,
      contestedTotals: adjustedContestedTotals,
      contestedPreviousTotals: adjustedContestedPreviousTotals,
    projectedControl: controlLabel,
      previousSource: previousRow?.url || null,
    }
  }, [
    baseline,
    selectedLad,
    councilSeats,
    wardMap,
    wardMapByWardName,
    ladFallbackProjection,
    councilGeo,
    wardGeo,
    cedGeo,
    surreyOverlay,
    surreyEastCodes,
    surreyWestCodes,
  ])

  const showNoComposition =
    Boolean(selectedLad) && (!councilComposition || !Object.keys(councilComposition.totals).length)

  const selectedLadFeature = useMemo(() => {
    if (!selectedLad || !councilGeo) return null
    if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
      return (
        surreyOverlay?.features.find(feature => feature.properties?.reference === selectedLad) ??
        null
      )
    }
    return councilGeo.features.find(feature => feature.properties?.reference === selectedLad) ?? null
  }, [selectedLad, councilGeo, surreyOverlay])

  const selectedCouncilName = useMemo(() => {
    if (!selectedLadFeature) return null
    const rawName = selectedLadFeature.properties?.name
    if (!rawName) return null
    const name = String(rawName)
    if (selectedLad === 'surrey-east') return 'East Surrey Council'
    if (selectedLad === 'surrey-west') return 'West Surrey Council'
    const normalized = normalizeName(name)
    if (COUNTY_ELECTIONS_2026.has(normalized)) {
      return `${name} County Council`
    }
    if (LONDON_BOROUGHS.has(normalized)) {
      return `${name} Council`
    }
    if (OFFICIAL_NAMES[normalized]) return OFFICIAL_NAMES[normalized]
    if (/council$/i.test(name)) return name
    return `${name} Council`
  }, [selectedLadFeature])

  const isCountySelection = useMemo(() => {
    const name = selectedLadFeature?.properties?.name
    return COUNTY_ELECTIONS_2026.has(normalizeName(name))
  }, [selectedLadFeature])

  const wardFeatures = useMemo(() => {
    if (!selectedLad || !baseline) return []
    const activeGeo = isCountySelection ? cedGeo : wardGeo
    if (!activeGeo || !Array.isArray(activeGeo.features)) return []
    let wardCodes: Set<string>
    if (isCountySelection) {
      wardCodes = new Set(
        baseline.wards.filter(ward => ward.ladCode === selectedLad).map(ward => ward.wardCode)
      )
      return activeGeo.features.filter(feature => {
        const code = getGeoWardCode(feature)
        return Boolean(code && wardCodes.has(code))
      })
    }
    if (selectedLad === 'surrey-east' || selectedLad === 'surrey-west') {
      const allowedCodes = selectedLad === 'surrey-east' ? surreyEastCodes : surreyWestCodes
      wardCodes = new Set(
        baseline.wards.filter(ward => allowedCodes.has(ward.ladCode)).map(ward => ward.wardCode)
      )
      return activeGeo.features.filter(feature => {
        const props: any = feature.properties || {}
        const code = props.reference || props.WD25CD || props.WD23CD || props.WD22CD
        return wardCodes.has(code)
      })
    }

    const selectedName = selectedLadFeature?.properties?.name
    if (selectedName) {
      const normalized = normalizeName(selectedName)
      const nameMatches = activeGeo.features.filter(feature => {
        const props: any = feature.properties || {}
        return normalizeName(props.LAD25NM || props.LAD23NM || props.LAD22NM) === normalized
      })
      if (nameMatches.length) {
        return nameMatches
      }
    }

    {
      wardCodes = new Set(
        baseline.wards.filter(ward => ward.ladCode === selectedLad).map(ward => ward.wardCode)
      )
    }
    const wardNameSet = new Set(
      baseline.wards
        .filter(ward => ward.ladCode === selectedLad)
        .map(ward => normalizeName(ward.wardName))
    )
    return activeGeo.features.filter(feature => {
      const props: any = feature.properties || {}
      const code = props.reference || props.WD25CD || props.WD23CD || props.WD22CD
      if (wardCodes.has(code)) return true
      const name = normalizeName(props.WD25NM || props.WD23NM || props.WD22NM || props.name)
      return wardNameSet.has(name)
    })
  }, [
    wardGeo,
    cedGeo,
    selectedLad,
    baseline,
    selectedLadFeature,
    surreyEastCodes,
    surreyWestCodes,
    isCountySelection,
  ])

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
        <Link href="/aggregate" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          National Polling Average
        </Link>
        <Link href="/polls" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          Recent UK Polls
        </Link>
        <Link href="/local-2026" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          May 2026 Local Elections Projections
        </Link>
        <Link href="/council-projections" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          Council Projections
        </Link>
      </div>
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem', color: '#555' }}>
        {selectedCouncilName ? (
          <span style={{ fontSize: '1.1rem', color: '#333' }}>{selectedCouncilName}</span>
        ) : (
          'Click a council area to zoom into ward-level projections.'
        )}
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            border: '1px solid #eee',
            borderRadius: 8,
            background: '#fafafa',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Leave/Remain Strength: {leaveStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={leaveStrength}
              onChange={event => setLeaveStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Age Strength: {ageStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ageStrength}
              onChange={event => setAgeStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Region Strength: {regionStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={regionStrength}
              onChange={event => setRegionStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            NS-SEC Strength: {nssecStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={nssecStrength}
              onChange={event => setNssecStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Degree Strength: {degreeStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={degreeStrength}
              onChange={event => setDegreeStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            GE Weight (Reform): {geReformWeight.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={geReformWeight}
              onChange={event => setGeReformWeight(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            GE Weight (Green): {geGreenWeight.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={geGreenWeight}
              onChange={event => setGeGreenWeight(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            GE Weight (Other Major): {geMajorWeight.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={geMajorWeight}
              onChange={event => setGeMajorWeight(Number(event.target.value))}
            />
          </label>
        </div>
      )}
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
            {councilGeo ? (
            <LocalMap
              ladGeo={councilGeo}
              overlayAreas={surreyOverlay}
              overlayAreaCodes={new Set(['surrey-east', 'surrey-west'])}
              hiddenLadCodes={surreyLadCodes}
              wardFeatures={wardFeatures}
              contestedWardCodes={contestedWardKeys.codes}
              contestedWardNameKeys={contestedWardKeys.names}
              wardVacancies={wardVacancies}
              wardVacanciesByName={wardVacanciesByName}
              wardMap={wardMap}
              wardMapByName={wardMapByName}
              wardMapByWardName={wardMapByWardName}
              fallbackProjection={ladFallbackProjection}
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
              <span style={{ width: '14px', height: '14px', background: '#E75480' }} />
              <span>County Councils</span>
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
          {councilComposition && (
            <div style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>
                Council Composition
              </div>
              <div style={{ color: '#555', marginBottom: '0.5rem' }}>
                Previous control: {councilComposition.control || 'Unknown'}
                <br />
                Seats up: {councilComposition.seatsUp} of {councilComposition.totalSeats} (
                {councilComposition.cycle})
              </div>
              <div style={{ color: '#555', marginBottom: '0.5rem' }}>
                Projected control: {councilComposition.projectedControl}
                {councilComposition.previousSource ? (
                  <>
                    <br />
                    Previous seats from Wikipedia.
                  </>
                ) : null}
              </div>
              {Object.entries(councilComposition.totals)
                .sort((a, b) => b[1] - a[1])
                .map(([party, seats]) => {
                  const contestedPrev = councilComposition.contestedPreviousTotals[party] || 0
                  const contestedProjected = councilComposition.contestedTotals[party] || 0
                  const delta = contestedProjected - contestedPrev
                  const deltaLabel =
                    delta === 0
                      ? '-'
                      : delta > 0
                        ? `↑ ${delta}`
                        : `↓ ${Math.abs(delta)}`
                  const deltaColor = delta > 0 ? '#1B8A3A' : delta < 0 ? '#B02A37' : '#666'
                  return (
                  <div key={party} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{party}</span>
                    <span>
                      {seats}{' '}
                      <span style={{ color: deltaColor, marginLeft: '0.35rem' }}>
                        ({deltaLabel})
                      </span>
                    </span>
                  </div>
                  )
                })}
            </div>
          )}
          {showNoComposition && (
            <div style={{ marginTop: '1rem', color: '#777', fontSize: '0.9rem' }}>
              No composition data available for this council.
            </div>
          )}
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#666' }}>
            Ward results include Wikipedia data (CC BY-SA 4.0).
          </div>
        </div>
      </div>
    </div>
  )
}
