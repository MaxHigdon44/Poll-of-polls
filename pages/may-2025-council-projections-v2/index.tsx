import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
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
  TENURE_EFFECT_STRENGTH,
  getTenureAdjustment,
  type TenureBaseline,
  type TenureShare,
} from '@/lib/local2026/tenure'
import {
  RURAL_URBAN_EFFECT_STRENGTH,
  getRuralUrbanAdjustment,
  type RuralUrbanBaseline,
  type RuralUrbanShare,
} from '@/lib/local2026/ruralUrban'
import { MAY_2025_AGGREGATE, MAY_2025_COUNCIL_SET } from '@/lib/local2025/simulation'
import {
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
  getRelativeGeShare,
} from '@/lib/local2026/ge'
import { allocateProjectedSeats } from '@/lib/local2026/multiMember'
import { computeOlsWardProjection, type OlsResults } from '@/lib/local2026/ols'

const ELECTION_YEAR = 2025

const COUNTY_REGION_LOOKUP: Record<string, string> = {
  E10000003: 'East of England',
  E10000007: 'East Midlands',
  E10000008: 'South West',
  E10000011: 'South East',
  E10000012: 'East of England',
  E10000013: 'South West',
  E10000014: 'South East',
  E10000015: 'East of England',
  E10000016: 'South East',
  E10000018: 'East Midlands',
  E10000019: 'East Midlands',
  E10000020: 'East of England',
  E10000024: 'East Midlands',
  E10000025: 'South East',
  E10000028: 'West Midlands',
  E10000029: 'East of England',
  E10000031: 'West Midlands',
  E10000032: 'South East',
  E10000034: 'West Midlands',
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
  baselineNationalByYear?: Record<string, Record<string, number>>
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

type CouncilActualRow = {
  council: string
  seatsUp: number
  totalSeats: number
  actualControl: string | null
  actualSeats: Record<string, number>
  previousControl?: string | null
}

type CouncilActualData = {
  generatedAt: string
  councils: CouncilActualRow[]
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

type TenureLookup = {
  wards?: Record<string, TenureShare & { totalPop?: number; wardName?: string }>
  wardNames?: Record<string, TenureShare & { totalPop?: number; wardName?: string }>
  wardNamesOnly?: Record<string, TenureShare & { totalPop?: number; wardName?: string }>
  wardNamesAggressive?: Record<string, TenureShare & { totalPop?: number; wardName?: string }>
  lads?: Record<string, TenureShare>
  meta?: { baseline?: TenureBaseline }
}

type RuralUrbanLookup = {
  wards?: Record<string, RuralUrbanShare & { totalPop?: number; wardName?: string }>
  wardNames?: Record<string, RuralUrbanShare & { totalPop?: number; wardName?: string }>
  wardNamesOnly?: Record<string, RuralUrbanShare & { totalPop?: number; wardName?: string }>
  wardNamesAggressive?: Record<string, RuralUrbanShare & { totalPop?: number; wardName?: string }>
  lads?: Record<string, RuralUrbanShare>
  meta?: { baseline?: RuralUrbanBaseline }
}

type WardToPconLookup = {
  wards?: Record<string, string>
  wardNames?: Record<string, string>
}

type CedToPconLookup = {
  ceds?: Record<string, string>
  cedNames?: Record<string, string>
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
}

type AggregateResponse = {
  aggregates: AggregateRow[]
}

type GeoFeature = {
  type: 'Feature'
  properties: Record<string, any>
  geometry: any
}

type GeoCollection = {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

type CouncilProjectionRow = {
  council: string
  ladCode: string
  actualControl: string | null
  projectedControl: string
  projectedSeatsUp: Record<string, number>
  actualSeatsUp: Record<string, number>
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

function mapControlToParty(label: string | null) {
  if (!label) return null
  const normalized = normalizeName(label)
  if (normalized.includes('no overall control')) return null
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  if (normalized.includes('labour')) return 'Labour'
  if (normalized.includes('conservative')) return 'Conservative'
  if (normalized.includes('liberal democrat') || normalized.includes('lib dem')) {
    return 'Liberal Democrat'
  }
  if (normalized.includes('reform')) return 'Reform'
  if (normalized.includes('green')) return 'Green'
  if (normalized.includes('snp')) return 'SNP'
  if (normalized.includes('plaid')) return 'Plaid Cymru'
  return label
}

function normalizeSeatsParty(party: string) {
  const mapped = mapControlToParty(party)
  if (!mapped) return 'No overall control'
  const known = new Set([
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
    'Independent',
  ])
  return known.has(mapped) ? mapped : 'Other'
}

function canonicalizePartyLabel(party: string | null | undefined) {
  const mapped = mapControlToParty(party || null)
  if (mapped) return mapped
  return party || 'Other'
}

function sumShares(shares: Record<string, number>) {
  return Object.values(shares).reduce((acc, value) => acc + (value || 0), 0)
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
  tenureShare: TenureShare,
  tenureBaseline: TenureBaseline,
  ruralUrbanShare: RuralUrbanShare,
  ruralUrbanBaseline: RuralUrbanBaseline,
  leaveStrength: number,
  ageStrength: number,
  regionStrength: number,
  nssecStrength: number,
  degreeStrength: number,
  tenureStrength: number,
  ruralUrbanStrength: number
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
    Labour: (aggregate.labour ?? 0) - 2,
    Conservative: aggregate.conservative ?? 0,
    Reform: aggregate.reform ?? 0,
    'Liberal Democrat': aggregate.libdem ?? 0,
    Green: aggregate.green ?? 0,
    SNP: aggregate.snp ?? 0,
    'Plaid Cymru': aggregate.pc ?? 0,
  }

  const partyAllowedInRegion = (party: string, currentRegionName: string | null) => {
    if (party === 'SNP') return currentRegionName === 'Scotland'
    if (party === 'Plaid Cymru') return currentRegionName === 'Wales'
    return true
  }

  const adjustedNational: Record<string, number> = {}
  let sumNational = 0
  const adjustedLeaveShare = clampLeaveShare(leaveShare)
  nationalParties.forEach(party => {
    if (!partyAllowedInRegion(party, regionName)) {
      adjustedNational[party] = 0
      return
    }
    const base = ward.nationalShares[party] ?? 0
    const delta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
    const leaveAdj = getCenteredPartyLeaveAdjustment(party, adjustedLeaveShare)
    const ageAdj = getAgeAdjustment(party, ageShare)
    const regionAdj = getRegionAdjustment(party, regionName)
    const nssecAdj = getNssecAdjustment(party, nssecShare, nssecBaseline)
    const degreeAdj = getDegreeAdjustment(party, degreeShare, degreeBaseline)
    const tenureAdj = getTenureAdjustment(party, tenureShare, tenureBaseline)
    const ruralUrbanAdj = getRuralUrbanAdjustment(party, ruralUrbanShare, ruralUrbanBaseline)
    const value = Math.max(
      0,
      base +
        delta +
        leaveStrength * leaveAdj +
        ageStrength * ageAdj +
        regionStrength * regionAdj +
        nssecStrength * nssecAdj +
        degreeStrength * degreeAdj +
        tenureStrength * tenureAdj +
        ruralUrbanStrength * ruralUrbanAdj
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

function getBaselineNationalForYear(
  baseline: BaselineData,
  year: number | null | undefined
): Record<string, number> {
  const key = year ? String(year) : ''
  const byYear = key ? baseline.baselineNationalByYear?.[key] : null
  if (!byYear) return baseline.baselineNational
  return {
    Labour: byYear.Labour ?? baseline.baselineNational.Labour ?? 0,
    Conservative: byYear.Conservative ?? baseline.baselineNational.Conservative ?? 0,
    Reform: byYear.Reform ?? baseline.baselineNational.Reform ?? 0,
    'Liberal Democrat':
      byYear['Liberal Democrat'] ?? baseline.baselineNational['Liberal Democrat'] ?? 0,
    Green: byYear.Green ?? baseline.baselineNational.Green ?? 0,
    SNP: byYear.SNP ?? baseline.baselineNational.SNP ?? 0,
    'Plaid Cymru': byYear['Plaid Cymru'] ?? baseline.baselineNational['Plaid Cymru'] ?? 0,
  }
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
    seats: Math.floor(entry.seats * scale),
  }))
  let assigned = scaled.reduce((acc, entry) => acc + entry.seats, 0)
  scaled.sort((a, b) => b.scaled - b.seats - (a.scaled - a.seats))
  for (const entry of scaled) {
    if (assigned >= targetTotal) break
    entry.seats += 1
    assigned += 1
  }
  return Object.fromEntries(scaled.map(entry => [entry.party, entry.seats]))
}

const MIXED_ALL_OUT_SEAT_OVERRIDES: Record<string, Record<string, number>> = {
  birmingham: {
    'acocks green': 2,
    'alum rock': 2,
    aston: 2,
    'bartley green': 2,
    billesley: 2,
    'bournbrook and selly park': 2,
    'bournville and cotteridge': 2,
    'brandwood and kings heath': 2,
    'bromford and hodge hill': 2,
    edgbaston: 2,
    erdington: 2,
    'glebe farm and tile cross': 2,
    'hall green north': 2,
    'handsworth wood': 2,
    harborne: 2,
    kingstanding: 2,
    ladywood: 2,
    'longbridge and west heath': 2,
    moseley: 2,
    'north edgbaston': 2,
    oscott: 2,
    'perry barr': 2,
    quinton: 2,
    sheldon: 2,
    'small heath': 2,
    'soho and jewellery quarter': 2,
    'sparkbrook and balsall heath east': 2,
    sparkhill: 2,
    'stockland green': 2,
    'sutton vesey': 2,
    'sutton walmley and minworth': 2,
    'weoley and selly oak': 2,
  },
}

function getSeatsPerWard(
  wards: WardBaseline[],
  seatRow: CouncilSeatRow | null | undefined,
  ward: WardBaseline
) {
  const councilKey = normalizeCouncilName(ward.ladName)
  const wardKey = normalizeName(ward.wardName)
  const override = MIXED_ALL_OUT_SEAT_OVERRIDES[councilKey]?.[wardKey]
  if (override) return override

  const seatsUp = seatRow?.seatsUp || 0
  const totalSeats = seatRow?.totalSeats || 0
  let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
  if (seatsUp && totalSeats) {
    if (seatsUp === totalSeats) cycle = 'all_out'
    else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) cycle = 'thirds'
    else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) cycle = 'halves'
  }
  if (cycle !== 'all_out') return Math.max(ward.vacancies || 0, 1)

  const vacancySum = wards.reduce((acc, entry) => acc + Math.max(entry.vacancies || 0, 1), 0)
  if (vacancySum === totalSeats) {
    return Math.max(ward.vacancies || 0, 1)
  }

  if (wards.length && totalSeats % wards.length === 0) {
    return Math.max(1, Math.round(totalSeats / wards.length))
  }

  return Math.max(ward.vacancies || 0, 1)
}

export default function CouncilProjectionsPage() {
  const router = useRouter()
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [aggregate, setAggregate] = useState<AggregateRow | null>(null)
  const [leaveLookup, setLeaveLookup] = useState<LeaveShareLookup | null>(null)
  const [ageLookup, setAgeLookup] = useState<AgeShareLookup | null>(null)
  const [regionLookup, setRegionLookup] = useState<RegionLookup | null>(null)
  const [nssecLookup, setNssecLookup] = useState<NssecLookup | null>(null)
  const [degreeLookup, setDegreeLookup] = useState<DegreeLookup | null>(null)
  const [tenureLookup, setTenureLookup] = useState<TenureLookup | null>(null)
  const [ruralUrbanLookup, setRuralUrbanLookup] = useState<RuralUrbanLookup | null>(null)
  const [wardToPcon, setWardToPcon] = useState<WardToPconLookup | null>(null)
  const [cedToPcon, setCedToPcon] = useState<CedToPconLookup | null>(null)
  const [geLookup, setGeLookup] = useState<GePconLookup | null>(null)
  const [councilSeats, setCouncilSeats] = useState<CouncilSeatData | null>(null)
  const [councilPrevious, setCouncilPrevious] = useState<CouncilPreviousData | null>(null)
  const [actualResults, setActualResults] = useState<CouncilActualData | null>(null)
  const [olsResults, setOlsResults] = useState<OlsResults | null>(null)
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [hasMounted, setHasMounted] = useState(false)
  const [leaveStrength, setLeaveStrength] = useState(LEAVE_EFFECT_STRENGTH)
  const [ageStrength, setAgeStrength] = useState(AGE_EFFECT_STRENGTH)
  const [regionStrength, setRegionStrength] = useState(REGION_EFFECT_STRENGTH)
  const [nssecStrength, setNssecStrength] = useState(NSSEC_EFFECT_STRENGTH)
  const [degreeStrength, setDegreeStrength] = useState(DEGREE_EFFECT_STRENGTH)
  const [tenureStrength, setTenureStrength] = useState(TENURE_EFFECT_STRENGTH)
  const [ruralUrbanStrength, setRuralUrbanStrength] = useState(RURAL_URBAN_EFFECT_STRENGTH)
  const [geReformWeight, setGeReformWeight] = useState(GE_WEIGHT_REFORM)
  const [geGreenWeight, setGeGreenWeight] = useState(GE_WEIGHT_GREEN)
  const [geMajorWeight, setGeMajorWeight] = useState(GE_WEIGHT_MAJOR)
  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    router.prefetch('/may-2025-simulation-v2')
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
    fetch('/data/tenure-share.json')
      .then(res => res.json())
      .then(setTenureLookup)
      .catch(() => setTenureLookup(null))
    fetch('/data/rural-urban-share.json')
      .then(res => res.json())
      .then(setRuralUrbanLookup)
      .catch(() => setRuralUrbanLookup(null))
    fetch('/data/ward-to-pcon.json')
      .then(res => res.json())
      .then(setWardToPcon)
      .catch(() => setWardToPcon(null))

    fetch('/data/ced-to-pcon.json')
      .then(res => res.json())
      .then(setCedToPcon)
      .catch(() => setCedToPcon(null))
    fetch('/data/ge2024-pcon.json')
      .then(res => res.json())
      .then(setGeLookup)
      .catch(() => setGeLookup(null))
    fetch('/data/may-2025-council-seats.json')
      .then(res => res.json())
      .then(setCouncilSeats)
      .catch(() => setCouncilSeats(null))
    fetch('/data/may-2025-council-previous.json')
      .then(res => res.json())
      .then(setCouncilPrevious)
      .catch(() => setCouncilPrevious(null))
    fetch('/data/may-2025-actual-results.json')
      .then(res => res.json())
      .then(setActualResults)
      .catch(() => setActualResults(null))
    fetch('/data/ols-results.json')
      .then(res => res.json())
      .then(setOlsResults)
      .catch(() => setOlsResults(null))
    setAggregate(MAY_2025_AGGREGATE as AggregateRow)
    fetch('/data/may-2025-councils.geojson')
      .then(res => res.json())
      .then(setLadGeo)
      .catch(() => setLadGeo(null))
  }, [])

  const getLeaveShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ) => {
    const wardShare = leaveLookup?.wards?.[wardCode]?.leaveShare
    if (typeof wardShare === 'number') return wardShare
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = leaveLookup?.wardNames?.[key]?.leaveShare
      if (typeof nameShare === 'number') return nameShare
    }
    const ladShare = leaveLookup?.lads?.[ladCode]?.leaveShare
    if (typeof ladShare === 'number') return ladShare
    return NATIONAL_LEAVE_SHARE
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
    if (COUNTY_REGION_LOOKUP[ladCode]) return COUNTY_REGION_LOOKUP[ladCode]
    return null
  }

  const getDegreeBaseline = () => {
    const baseline = degreeLookup?.meta?.baseline
    if (baseline) return baseline
    return { degree: 0.4, noDegree: 0.6 }
  }

  const getTenureBaseline = () => {
    const baseline = tenureLookup?.meta?.baseline
    if (baseline) return baseline
    return {
      ownedOutright: 0.32831847091249194,
      ownsWithMortgage: 0.297073553740984,
      socialRented: 0.1705895998333387,
      privateRented: 0.20401837551318536,
    }
  }

  const getRuralUrbanBaseline = () => {
    const baseline = ruralUrbanLookup?.meta?.baseline
    if (baseline) return baseline
    return {
      conurbation: 0.3663336976668199,
      cityTown: 0.45521235562383135,
      ruralTownFringe: 0.09743014933962564,
      ruralVillageHamlet: 0.08102379736972319,
    }
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

  const getTenureShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: TenureShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = tenureLookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = tenureLookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = tenureLookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = tenureLookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = tenureLookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getTenureBaseline(), source: 'national' }
  }

  const getRuralUrbanShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: RuralUrbanShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = ruralUrbanLookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = ruralUrbanLookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = ruralUrbanLookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = ruralUrbanLookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = ruralUrbanLookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getRuralUrbanBaseline(), source: 'national' }
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

  const rows = useMemo<CouncilProjectionRow[]>(() => {
    if (!baseline || !aggregate || !councilSeats || !ladGeo || !olsResults) return []
    const olsCoefficients = olsResults.scenarios?.inSampleAllYears?.coefficients || null
    const byLad = new Map<string, WardBaseline[]>()
    baseline.wards.forEach(ward => {
      const list = byLad.get(ward.ladCode) || []
      list.push(ward)
      byLad.set(ward.ladCode, list)
    })

    const rawProjectionByCode = new Map<string, { winner: string; shares: Record<string, number> }>()
    baseline.wards.forEach(ward => {
      let adjustedWard = ward
      const geWeights = {
        reform: geReformWeight,
        green: geGreenWeight,
        major: geMajorWeight,
      }
      const wardNameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      const pconCode =
        wardToPcon?.wards?.[ward.wardCode] ||
        wardToPcon?.wardNames?.[wardNameKey] ||
        cedToPcon?.ceds?.[ward.wardCode] ||
        cedToPcon?.cedNames?.[wardNameKey]
      const geShares = pconCode ? geLookup?.pcon?.[pconCode] : null
      if (geShares) {
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
            blendedNational[party] = getRelativeGeShare(party, geShare)
            return
          }
          blendedNational[party] = blendShare(baseShare, geShare, weight)
        })
        adjustedWard = { ...adjustedWard, nationalShares: blendedNational }
      }
      const leaveShare = getLeaveShareForWard(
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
      const degreeShare = getDegreeShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const tenureShare = getTenureShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const ruralUrbanShare = getRuralUrbanShareForWard(
        ward.wardCode,
        ward.ladCode,
        ward.wardName,
        ward.ladName
      )
      const projection = computeOlsWardProjection(
        adjustedWard,
        getBaselineNationalForYear(baseline, adjustedWard.lastYear),
        {
          Labour: aggregate.labour ?? 0,
          Conservative: aggregate.conservative ?? 0,
          Reform: aggregate.reform ?? 0,
          'Liberal Democrat': aggregate.libdem ?? 0,
          Green: aggregate.green ?? 0,
          SNP: aggregate.snp ?? 0,
          'Plaid Cymru': aggregate.pc ?? 0,
        },
        {
          leaveShare,
          age18_35: ageShare.share.age18_35,
          age35_55: ageShare.share.age35_55,
          nssecHigher: nssecShare.share.higher,
          nssecIntermediate: nssecShare.share.intermediate,
          degree: degreeShare.share.degree,
          ownedOutright: tenureShare.share.ownedOutright,
          ownsWithMortgage: tenureShare.share.ownsWithMortgage,
          socialRented: tenureShare.share.socialRented,
          ruralConurbation: ruralUrbanShare.share.conurbation,
          ruralCityTown: ruralUrbanShare.share.cityTown,
          ruralTownFringe: ruralUrbanShare.share.ruralTownFringe,
          geLabour: geShares?.Labour ?? 0,
          geConservative: geShares?.Conservative ?? 0,
          geReform: geShares?.Reform ?? 0,
          geLibDem: geShares?.['Liberal Democrat'] ?? 0,
          geGreen: geShares?.Green ?? 0,
          regionName,
          isCountyDivision: ward.wardCode.startsWith('E58') || ward.wardCode.startsWith('W58'),
          gapYears: Math.max(1, 2025 - (adjustedWard.lastYear || 2024)),
        },
        olsCoefficients
      )
      rawProjectionByCode.set(ward.wardCode, projection)
    })

    const projections: CouncilProjectionRow[] = []
    const councilFeatures = ladGeo.features
    councilFeatures.forEach(feature => {
      const ladCode = feature.properties?.reference
      const ladName = feature.properties?.name
      if (!ladCode || !ladName) return
      const normalized = normalizeCouncilName(ladName)
      const seatRow = councilSeats.councils.find(
        row => normalizeCouncilName(row.council) === normalized
      )
      if (!seatRow) return
      const previousRow = councilPrevious?.councils?.find(
        row => normalizeCouncilName(row.council) === normalized
      )
      const wardIncumbents = previousRow?.wardIncumbents || null

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

      const allWards = byLad.get(ladCode) || []
      const inferredContestedSeats = allWards.reduce((acc, ward) => {
        const lastYear = ward.lastYear || ELECTION_YEAR
        let contested = true
        if (cycle === 'thirds') {
          contested = (ELECTION_YEAR - lastYear) % 3 === 0
        } else if (cycle === 'halves') {
          contested = (ELECTION_YEAR - lastYear) % 2 === 0
        }
        if (!contested) return acc
        return acc + Math.max(ward.vacancies || 0, 1)
      }, 0)
      const incumbentMatchedWards = wardIncumbents
        ? allWards.filter(ward => wardIncumbents[normalizeName(ward.wardName)])
        : []
      const incumbentMatchedSeats = incumbentMatchedWards.length
      const shouldUseWardIncumbents =
        incumbentMatchedWards.length > 0 &&
        Math.abs(incumbentMatchedSeats - seatsUp) < Math.abs(inferredContestedSeats - seatsUp)
      const wards = shouldUseWardIncumbents ? incumbentMatchedWards : allWards
      if (!wards.length) return

      let useLastYear = !shouldUseWardIncumbents && cycle !== 'all_out'
      if (useLastYear) {
        const contestedSeats = wards.reduce((acc, ward) => {
          const lastYear = ward.lastYear || ELECTION_YEAR
          let contested = true
          if (cycle === 'thirds') {
            contested = (ELECTION_YEAR - lastYear) % 3 === 0
          } else if (cycle === 'halves') {
            contested = (ELECTION_YEAR - lastYear) % 2 === 0
          }
          if (!contested) return acc
          return acc + Math.max(ward.vacancies || 0, 1)
        }, 0)
        if (contestedSeats < seatsUp * 0.5) {
          useLastYear = false
        }
      }

      const contestedTotals: Record<string, number> = {}
      const contestedPreviousTotals: Record<string, number> = {}

      wards.forEach(ward => {
        const seatsUpCount = shouldUseWardIncumbents ? 1 : getSeatsPerWard(wards, seatRow, ward)
        const projection = rawProjectionByCode.get(ward.wardCode)
        if (!projection) return
        const previousShares: Record<string, number> = {
          ...ward.nationalShares,
          ...ward.localShares,
        }
        let prevWinner: string | null = null
        const incumbentWinner = shouldUseWardIncumbents
          ? wardIncumbents?.[normalizeName(ward.wardName)]
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
        const lastYear = ward.lastYear || ELECTION_YEAR
        let contested = shouldUseWardIncumbents ? Boolean(incumbentWinner) : true
        if (useLastYear) {
          if (cycle === 'thirds') {
            contested = (ELECTION_YEAR - lastYear) % 3 === 0
          } else if (cycle === 'halves') {
            contested = (ELECTION_YEAR - lastYear) % 2 === 0
          }
        }
        if (contested) {
          const projectedSeatAllocation = allocateProjectedSeats(projection.shares || {}, seatsUpCount)
          Object.entries(projectedSeatAllocation).forEach(([party, allocatedSeats]) => {
            const projectedKey = canonicalizePartyLabel(party)
            contestedTotals[projectedKey] = (contestedTotals[projectedKey] || 0) + allocatedSeats
          })
          const contestedPrev = canonicalizePartyLabel(prevWinner || projection.winner)
          contestedPreviousTotals[contestedPrev] =
            (contestedPreviousTotals[contestedPrev] || 0) + seatsUpCount
        }
      })

      const normalizeContested = !useLastYear && !shouldUseWardIncumbents
      const adjustedContestedTotals = normalizeContested
        ? normalizeTotalsToTotal(seatsUp, contestedTotals)
        : { ...contestedTotals }
      const adjustedContestedPreviousTotals = normalizeContested
        ? normalizeTotalsToTotal(seatsUp, contestedPreviousTotals)
        : { ...contestedPreviousTotals }

      let projectedTotals: Record<string, number> = {}
      if (previousRow?.seatsBefore && Object.keys(previousRow.seatsBefore).length) {
        const currentTotals = { ...previousRow.seatsBefore }
        const currentSum = Object.values(currentTotals).reduce(
          (acc, value) => acc + (value || 0),
          0
        )
        if (currentSum && currentSum < totalSeats) {
          currentTotals.Other = (currentTotals.Other || 0) + (totalSeats - currentSum)
        }
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
      } else {
        projectedTotals = normalizeTotalsToTotal(totalSeats, adjustedContestedTotals)
      }

      let projectedControl: string | null = null
      Object.entries(projectedTotals).forEach(([party, seats]) => {
        if (seats > totalSeats / 2) projectedControl = party
      })
      const controlLabel = projectedControl ? projectedControl : 'No overall control'
      const actualRow = actualResults?.councils?.find(
        row => normalizeCouncilName(row.council) === normalized
      )

      projections.push({
        council: seatRow.council,
        ladCode,
        actualControl: actualRow?.actualControl || 'No overall control',
        projectedControl: controlLabel,
        projectedSeatsUp: adjustedContestedTotals,
        actualSeatsUp: actualRow?.actualSeats || {},
      })
    })

    return projections.sort((a, b) => a.council.localeCompare(b.council))
  }, [
    baseline,
    aggregate,
    olsResults,
    councilSeats,
    councilPrevious,
    ladGeo,
    leaveLookup,
    ageLookup,
    regionLookup,
    nssecLookup,
    degreeLookup,
    tenureLookup,
    wardToPcon,
    cedToPcon,
    geLookup,
    leaveStrength,
    ageStrength,
    regionStrength,
    nssecStrength,
    degreeStrength,
    tenureStrength,
    ruralUrbanStrength,
    geReformWeight,
    geGreenWeight,
    geMajorWeight,
    actualResults,
  ])

  const summary = useMemo(() => {
    const actualTotals: Record<string, number> = {}
    const projectedTotals: Record<string, number> = {}
    rows.forEach(row => {
      const prevKey = mapControlToParty(row.actualControl || 'No overall control') || 'No overall control'
      const projKey = mapControlToParty(row.projectedControl) || 'No overall control'
      actualTotals[prevKey] = (actualTotals[prevKey] || 0) + 1
      projectedTotals[projKey] = (projectedTotals[projKey] || 0) + 1
    })
    const parties = new Set<string>([
      ...Object.keys(actualTotals),
      ...Object.keys(projectedTotals),
    ])
    return Array.from(parties)
      .map(party => {
        const projected = projectedTotals[party] || 0
        const previous = actualTotals[party] || 0
        return { party, projected, delta: projected - previous }
      })
      .sort((a, b) => b.projected - a.projected)
  }, [rows])

  const seatsUpSummary = useMemo(() => {
    const totals: Record<string, number> = {}
    const actualTotals: Record<string, number> = {}
    rows.forEach(row => {
      Object.entries(row.projectedSeatsUp || {}).forEach(([party, seats]) => {
        const key = normalizeSeatsParty(party)
        totals[key] = (totals[key] || 0) + (seats || 0)
      })
      Object.entries(row.actualSeatsUp || {}).forEach(([party, seats]) => {
        const key = normalizeSeatsParty(party)
        actualTotals[key] = (actualTotals[key] || 0) + (seats || 0)
      })
    })
    return Object.entries(totals)
      .map(([party, seats]) => ({
        party,
        seats,
        delta: seats - (actualTotals[party] || 0),
      }))
      .sort((a, b) => b.seats - a.seats)
  }, [rows])

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '1rem',
            marginBottom: '0.25rem',
          }}
        >
          <h1 style={{ margin: 0 }}>May 2025 Council Projections V2</h1>
          <Link href="/aggregate" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            National Polling Average
          </Link>
          <Link href="/polls" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            Recent UK Polls
          </Link>
          <Link href="/may-2025-simulation-v2" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            May 2025 Simulation V2
          </Link>
          <Link href="/may-2025-council-projections-v2" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            May 2025 Council Projections V2
          </Link>
          <Link href="/local-2026-v2" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            May 2026 Local Elections Projections V2
          </Link>
          <Link href="/council-projections-v2" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
            Council Projections V2
          </Link>
        </div>
        <p style={{ margin: '0.35rem 0 0', color: '#555' }}>
          Councils up for election in May 2025 with V2 model projected control and actual result.
        </p>
      </header>

      {hasMounted && process.env.NODE_ENV !== 'production' && (
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
            Tenure Strength: {tenureStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={tenureStrength}
              onChange={event => setTenureStrength(Number(event.target.value))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Rural/Urban Strength: {ruralUrbanStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={ruralUrbanStrength}
              onChange={event => setRuralUrbanStrength(Number(event.target.value))}
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

      {summary.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>May 2025 Council Projections V2</div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            {summary.map(item => {
              const isNoc = item.party === 'No overall control'
              const color = isNoc ? '#111' : PARTY_COLORS[item.party] || '#333'
              const deltaLabel =
                item.delta === 0
                  ? '-'
                  : item.delta > 0
                    ? `↑ ${item.delta}`
                    : `↓ ${Math.abs(item.delta)}`
              const deltaColor = item.delta > 0 ? '#1B8A3A' : item.delta < 0 ? '#B02A37' : '#666'
              return (
                <div
                  key={item.party}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 999,
                    padding: '0.4rem 0.75rem',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    background: '#fafafa',
                  }}
                >
                  <span style={{ fontWeight: 600, color }}>{item.party}</span>
                  <span style={{ color }}>{item.projected}</span>
                  <span style={{ color: deltaColor }}>({deltaLabel})</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {seatsUpSummary.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
            Model projected seats compared with the actual May 2025 result
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}
          >
            {seatsUpSummary.map(item => {
              const isNoc = item.party === 'No overall control'
              const color = isNoc ? '#111' : PARTY_COLORS[item.party] || '#333'
              const deltaLabel =
                item.delta === 0
                  ? '-'
                  : item.delta > 0
                    ? `↑ ${item.delta}`
                    : `↓ ${Math.abs(item.delta)}`
              const deltaColor = item.delta > 0 ? '#1B8A3A' : item.delta < 0 ? '#B02A37' : '#666'
              return (
                <div
                  key={`seats-up-${item.party}`}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 999,
                    padding: '0.4rem 0.75rem',
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    background: '#fafafa',
                  }}
                >
                  <span style={{ fontWeight: 600, color }}>{item.party}</span>
                  <span style={{ color }}>{item.seats}</span>
                  <span style={{ color: deltaColor }}>({deltaLabel})</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!rows.length ? (
        <div style={{ color: '#777' }}>Loading council projections…</div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              background: '#f7f7f7',
              padding: '0.75rem 1rem',
              fontWeight: 600,
            }}
          >
            <span>Council</span>
            <span>Actual Result</span>
            <span>Model Projected Control</span>
          </div>
          {rows.map(row => {
                const projectedLabel = row.projectedControl.replace(' majority', '')
                const projectedParty = mapControlToParty(projectedLabel)
                const previousLabel = row.actualControl || 'No overall control'
                const previousParty = mapControlToParty(previousLabel)
                const projectedColor =
                  projectedLabel === 'No overall control'
                    ? '#111'
                    : PARTY_COLORS[projectedParty || 'Other'] || '#333'
                const previousIsNoc = normalizeName(previousLabel).includes('no overall control')
                const previousColor =
                  previousIsNoc ? '#111' : PARTY_COLORS[previousParty || 'Other'] || '#333'
                return (
            <a
              key={row.ladCode}
              href={`/may-2025-simulation-v2?council=${encodeURIComponent(row.ladCode)}`}
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  padding: '0.75rem 1rem',
                  borderTop: '1px solid #eee',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 500 }}>{row.council}</span>
                <span style={{ color: previousColor }}>
                  {row.actualControl || 'No overall control'}
                </span>
                <span
                  style={{
                    color: projectedColor,
                    fontWeight: 500,
                  }}
                >
                  {projectedLabel}
                </span>
              </div>
            </a>
          )})}
        </div>
      )}
    </div>
  )
}
