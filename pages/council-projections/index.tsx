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
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
} from '@/lib/local2026/ge'

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
}

type CouncilPreviousData = {
  generatedAt: string
  councils: CouncilPreviousRow[]
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
  previousControl: string | null
  projectedControl: string
  projectedSeatsUp: Record<string, number>
  previousSeatsUp: Record<string, number>
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
    .toLowerCase()
    .replace(/&/g, 'and')
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

export default function CouncilProjectionsPage() {
  const router = useRouter()
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
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [leaveStrength, setLeaveStrength] = useState(LEAVE_EFFECT_STRENGTH)
  const [ageStrength, setAgeStrength] = useState(AGE_EFFECT_STRENGTH)
  const [regionStrength, setRegionStrength] = useState(REGION_EFFECT_STRENGTH)
  const [nssecStrength, setNssecStrength] = useState(NSSEC_EFFECT_STRENGTH)
  const [degreeStrength, setDegreeStrength] = useState(DEGREE_EFFECT_STRENGTH)
  const [geReformWeight, setGeReformWeight] = useState(GE_WEIGHT_REFORM)
  const [geGreenWeight, setGeGreenWeight] = useState(GE_WEIGHT_GREEN)
  const [geMajorWeight, setGeMajorWeight] = useState(GE_WEIGHT_MAJOR)

  useEffect(() => {
    router.prefetch('/local-2026')
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
    fetch('/data/lads.geojson')
      .then(res => res.json())
      .then(setLadGeo)
      .catch(() => setLadGeo(null))
    fetch('/api/aggregate')
      .then(res => res.json())
      .then((data: AggregateResponse) => setAggregate(data.aggregates?.[0] ?? null))
      .catch(() => setAggregate(null))
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
    return null
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
    if (!baseline || !aggregate || !councilSeats || !ladGeo) return []
    const byLad = new Map<string, WardBaseline[]>()
    baseline.wards.forEach(ward => {
      const list = byLad.get(ward.ladCode) || []
      list.push(ward)
      byLad.set(ward.ladCode, list)
    })

    const projections: CouncilProjectionRow[] = []
    ladGeo.features.forEach(feature => {
      const ladCode = feature.properties?.reference
      const ladName = feature.properties?.name
      if (!ladCode || !ladName) return
      const normalized = normalizeCouncilName(ladName)
      const seatRow = councilSeats.councils.find(
        row => normalizeCouncilName(row.council) === normalized
      )
      if (!seatRow) return
      const wards = byLad.get(ladCode) || []
      if (!wards.length) return

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

      let useLastYear = cycle !== 'all_out'
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

      const contestedTotals: Record<string, number> = {}
      const contestedPreviousTotals: Record<string, number> = {}

      wards.forEach(ward => {
        const seatsUpCount = Math.max(ward.vacancies || 0, 1)
        let adjustedWard = ward
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
          ...ward.nationalShares,
          ...ward.localShares,
        }
        let prevWinner: string | null = null
        let prevTop = -1
        Object.entries(previousShares).forEach(([party, value]) => {
          const numericValue = Number(value)
          if (!Number.isFinite(numericValue)) return
          if (numericValue > prevTop) {
            prevTop = numericValue
            prevWinner = party
          }
        })
        const lastYear = ward.lastYear || 2026
        let contested = true
        if (useLastYear) {
          if (cycle === 'thirds') {
            contested = (2026 - lastYear) % 3 === 0
          } else if (cycle === 'halves') {
            contested = (2026 - lastYear) % 2 === 0
          }
        }
        if (contested) {
          const projectedKey = canonicalizePartyLabel(projection.winner)
          contestedTotals[projectedKey] = (contestedTotals[projectedKey] || 0) + seatsUpCount
          const contestedPrev = canonicalizePartyLabel(prevWinner || projection.winner)
          contestedPreviousTotals[contestedPrev] =
            (contestedPreviousTotals[contestedPrev] || 0) + seatsUpCount
        }
      })

      const normalizeContested = !useLastYear
      const adjustedContestedTotals = normalizeContested
        ? normalizeTotalsToTotal(seatsUp, contestedTotals)
        : { ...contestedTotals }
      const adjustedContestedPreviousTotals = normalizeContested
        ? normalizeTotalsToTotal(seatsUp, contestedPreviousTotals)
        : { ...contestedPreviousTotals }

      const previousRow = councilPrevious?.councils?.find(
        row => normalizeCouncilName(row.council) === normalized
      )

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

      projections.push({
        council: seatRow.council,
        ladCode,
        previousControl: seatRow.control,
        projectedControl: controlLabel,
        projectedSeatsUp: adjustedContestedTotals,
        previousSeatsUp: adjustedContestedPreviousTotals,
      })
    })

    return projections.sort((a, b) => a.council.localeCompare(b.council))
  }, [
    baseline,
    aggregate,
    councilSeats,
    councilPrevious,
    ladGeo,
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
  ])

  const summary = useMemo(() => {
    const previousTotals: Record<string, number> = {}
    const projectedTotals: Record<string, number> = {}
    rows.forEach(row => {
      const prevKey = mapControlToParty(row.previousControl || 'No overall control') || 'No overall control'
      const projKey = mapControlToParty(row.projectedControl) || 'No overall control'
      previousTotals[prevKey] = (previousTotals[prevKey] || 0) + 1
      projectedTotals[projKey] = (projectedTotals[projKey] || 0) + 1
    })
    const parties = new Set<string>([
      ...Object.keys(previousTotals),
      ...Object.keys(projectedTotals),
    ])
    return Array.from(parties)
      .map(party => {
        const projected = projectedTotals[party] || 0
        const previous = previousTotals[party] || 0
        return { party, projected, delta: projected - previous }
      })
      .sort((a, b) => b.projected - a.projected)
  }, [rows])

  const seatsUpSummary = useMemo(() => {
    const totals: Record<string, number> = {}
    const previousTotals: Record<string, number> = {}
    rows.forEach(row => {
      Object.entries(row.projectedSeatsUp || {}).forEach(([party, seats]) => {
        const key = normalizeSeatsParty(party)
        totals[key] = (totals[key] || 0) + (seats || 0)
      })
      Object.entries(row.previousSeatsUp || {}).forEach(([party, seats]) => {
        const key = normalizeSeatsParty(party)
        previousTotals[key] = (previousTotals[key] || 0) + (seats || 0)
      })
    })
    return Object.entries(totals)
      .map(([party, seats]) => ({
        party,
        seats,
        delta: seats - (previousTotals[party] || 0),
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
          <h1 style={{ margin: 0 }}>Council Projections</h1>
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
        <p style={{ margin: '0.35rem 0 0', color: '#555' }}>
          Councils up for election in 2026 with previous and projected control.
        </p>
      </header>

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

      {summary.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Council Projections</div>
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
            Seat Change from the previous election wards were contested
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
            <span>Previous Control</span>
            <span>Projected Control</span>
          </div>
          {rows.map(row => {
                const projectedLabel = row.projectedControl.replace(' majority', '')
                const projectedParty = mapControlToParty(projectedLabel)
                const previousLabel = row.previousControl || 'Unknown'
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
              href={`/local-2026?council=${encodeURIComponent(row.ladCode)}`}
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
                  {row.previousControl || 'Unknown'}
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
