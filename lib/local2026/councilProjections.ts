import {
  clampLeaveShare,
  getCenteredPartyLeaveAdjustment,
  NATIONAL_LEAVE_SHARE,
} from '@/lib/local2026/leaveRemain'
import { AGE_BASELINE, getAgeAdjustment } from '@/lib/local2026/age'
import { getRegionAdjustment } from '@/lib/local2026/region'
import { getNssecAdjustment, type NssecBaseline, type NssecShare } from '@/lib/local2026/nssec'
import { getDegreeAdjustment, type DegreeBaseline, type DegreeShare } from '@/lib/local2026/degree'
import { getTenureAdjustment, type TenureBaseline, type TenureShare } from '@/lib/local2026/tenure'
import {
  getRuralUrbanAdjustment,
  type RuralUrbanBaseline,
  type RuralUrbanShare,
} from '@/lib/local2026/ruralUrban'
import {
  blendShare,
  getGeWeightForParty,
  getRelativeGeShare,
  getRelativeGeSwingMultiplier,
} from '@/lib/local2026/ge'
import { getConcentrationMultiplier } from '@/lib/local2026/concentration'
import { allocateProjectedSeats } from '@/lib/local2026/multiMember'

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
  geSwingMultipliers?: Record<string, number>
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

type LeaveShareLookup = {
  wards?: Record<string, { leaveShare: number }>
  wardNames?: Record<string, { leaveShare: number }>
  lads?: Record<string, { leaveShare: number }>
  meta?: Record<string, unknown>
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

type WardVacancyLookup = {
  wards?: Record<string, number>
  wardNames?: Record<string, number>
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

type GeoFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: unknown
}

type GeoCollection = {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

type AggregateRow = {
  pollCount: number
  snp: number | null
  conservative: number | null
  labour: number | null
  libdem: number | null
  green: number | null
  reform: number | null
  pc: number | null
  others: number | null
  lead: string | null
}

type CouncilProjectionRow = {
  council: string
  ladCode: string
  previousControl: string | null
  projectedControl: string
  projectedSeatsUp: Record<string, number>
  previousSeatsUp: Record<string, number>
}

export type EnglandWardProjectionEntry = {
  wardCode: string
  winner: string
  shares: Record<string, number>
  leaveSource: 'ward' | 'ward-name' | 'lad' | 'national'
  prevWinner: string | null
}

export type EnglandLocalProjectionSnapshot = {
  generatedAt: string
  wardsByCode: Record<string, EnglandWardProjectionEntry>
  councilRows: CouncilProjectionRow[]
}

type Weights = {
  leaveStrength: number
  ageStrength: number
  regionStrength: number
  nssecStrength: number
  degreeStrength: number
  tenureStrength: number
  ruralUrbanStrength: number
  geReformWeight: number
  geGreenWeight: number
  geMajorWeight: number
}

const COUNTY_REGION_LOOKUP: Record<string, string> = {
  E10000011: 'South East',
  E10000012: 'East of England',
  E10000014: 'South East',
  E10000020: 'East of England',
  E10000030: 'South East',
  E10000029: 'East of England',
  E10000032: 'South East',
}

const SURREY_EAST_DIVISIONS = new Set(
  [
    'E58001472',
    'E58001478',
    'E58001501',
    'E58001502',
    'E58001527',
    'E58001528',
    'E58001529',
    'E58001534',
    'E58001535',
    'E58001481',
    'E58001482',
    'E58001484',
    'E58001483',
    'E58001533',
    'E58001463',
    'E58001466',
    'E58001474',
    'E58001475',
    'E58001476',
    'E58001508',
    'E58001465',
    'E58001477',
    'E58001503',
    'E58001504',
    'E58001513',
    'E58001514',
    'E58001516',
    'E58001517',
    'E58001518',
    'E58001525',
    'E58001469',
    'E58001470',
    'E58001492',
    'E58001511',
    'E58001515',
    'E58001530',
  ]
)

const SURREY_WEST_DIVISIONS = new Set(
  [
    'E58001461',
    'E58001494',
    'E58001495',
    'E58001496',
    'E58001497',
    'E58001498',
    'E58001505',
    'E58001519',
    'E58001520',
    'E58001541',
    'E58001460',
    'E58001471',
    'E58001479',
    'E58001480',
    'E58001488',
    'E58001540',
    'E58001462',
    'E58001507',
    'E58001512',
    'E58001521',
    'E58001522',
    'E58001523',
    'E58001524',
    'E58001464',
    'E58001467',
    'E58001468',
    'E58001489',
    'E58001500',
    'E58001509',
    'E58001473',
    'E58001485',
    'E58001486',
    'E58001487',
    'E58001490',
    'E58001491',
    'E58001499',
    'E58001531',
    'E58001532',
    'E58001493',
    'E58001506',
    'E58001526',
    'E58001536',
    'E58001538',
    'E58001537',
    'E58001539',
  ]
)

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
  thurrock: {
    'aveley and uplands': 3,
    belhus: 3,
    'chadwell saint mary': 3,
    'grays riverside': 3,
    'grays thurrock': 3,
    ockendon: 3,
    'stanford east and corringham town': 3,
    'the homesteads': 3,
    'west thurrock and south stifford': 3,
    'chafford and north stifford': 2,
    'corringham and fobbing': 2,
    'east tilbury': 2,
    'little thurrock blackshots': 2,
    'little thurrock rectory': 2,
    orsett: 2,
    'south chafford': 2,
    'stanford le hope west': 2,
    'stifford clays': 2,
    'tilbury riverside and thurrock park': 2,
    'tilbury saint chads': 2,
  },
}

function normalizeName(name: string) {
  return String(name || '')
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

function canonicalizePartyLabel(party: string | null | undefined) {
  const mapped = mapControlToParty(party || null)
  if (mapped) return mapped
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
  const assigned = floored.reduce((acc, entry) => acc + entry.seats, 0)
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

function sumShares(shares: Record<string, number>) {
  return Object.values(shares).reduce((acc, value) => acc + (value || 0), 0)
}

function getSeatsPerWard(
  wards: WardBaseline[],
  seatRow: CouncilSeatRow | null | undefined,
  ward: WardBaseline,
  wardVacancyLookup?: WardVacancyLookup | null
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
  if (cycle !== 'all_out') return 1

  const explicitVacancy =
    wardVacancyLookup?.wards?.[ward.wardCode] ||
    wardVacancyLookup?.wardNames?.[`${normalizeName(ward.ladName)}|${wardKey}`]

  const vacancySum = wards.reduce((acc, entry) => acc + Math.max(entry.vacancies || 0, 1), 0)
  if (vacancySum === totalSeats) {
    return Math.max(ward.vacancies || 0, 1)
  }

  if (explicitVacancy) {
    const explicitSum = wards.reduce((acc, entry) => {
      const entryWardKey = normalizeName(entry.wardName)
      const value =
        wardVacancyLookup?.wards?.[entry.wardCode] ||
        wardVacancyLookup?.wardNames?.[
          `${normalizeName(entry.ladName)}|${entryWardKey}`
        ] ||
        0
      return acc + value
    }, 0)
    if (explicitSum === totalSeats) {
      return explicitVacancy
    }
  }

  if (wards.length && totalSeats % wards.length === 0) {
    return Math.max(1, Math.round(totalSeats / wards.length))
  }

  if (explicitVacancy) return explicitVacancy

  return Math.max(ward.vacancies || 0, 1)
}

function getBaselineNationalForYear(
  baseline: BaselineData,
  year: number | null | undefined
) {
  const byYear = baseline.baselineNationalByYear?.[String(year)]
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
  const labourStronghold = (ward.nationalShares['Labour'] ?? 0) > 70
  const labourDeltaMultiplier = labourStronghold
    ? 1
    : ward.lastYear === 2021
      ? 1.4
      : ward.lastYear === 2022
        ? 1.3
        : ward.lastYear === 2024
          ? 1.15
          : 1
  const labourBaselineCarry = labourStronghold
    ? 1
    : ward.lastYear === 2021 || ward.lastYear === 2022 || ward.lastYear === 2024
      ? 0.93
      : 1
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

  const partyAllowedInRegion = (party: string, currentRegionName: string | null) => {
    if (party === 'SNP') return currentRegionName === 'Scotland'
    if (party === 'Plaid Cymru') return currentRegionName === 'Wales'
    return true
  }

  const adjustedNational: Record<string, number> = {}
  let sumNational = 0
  const adjustedLeaveShare = clampLeaveShare(leaveShare)
  let baselineWinner: string | null = null
  let baselineTop = -1
  Object.entries({ ...ward.nationalShares, ...ward.localShares }).forEach(([party, value]) => {
    if ((value ?? 0) > baselineTop) {
      baselineTop = value ?? 0
      baselineWinner = party
    }
  })
  nationalParties.forEach(party => {
    if (!partyAllowedInRegion(party, regionName)) {
      adjustedNational[party] = 0
      return
    }
    const base = (ward.nationalShares[party] ?? 0) * (party === 'Labour' ? labourBaselineCarry : 1)
    const swingMultiplier = ward.geSwingMultipliers?.[party] ?? 1
    const rawDelta = ((aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)) * swingMultiplier
    let delta = party === 'Labour' && rawDelta < 0 ? rawDelta * labourDeltaMultiplier : rawDelta
    if (party === 'Conservative' && ward.lastYear === 2021 && delta < 0) {
      delta *= 0.9
    }
    if (
      party === 'Reform' &&
      delta > 0 &&
      ward.lastYear === 2021 &&
      canonicalizePartyLabel(baselineWinner) === 'Conservative'
    ) {
      delta *= 0.95
    }
    const leaveAdj = getCenteredPartyLeaveAdjustment(party, adjustedLeaveShare)
    const ageAdj = getAgeAdjustment(party, ageShare)
    let regionAdj = getRegionAdjustment(party, regionName, ward.ladCode)
    if (
      party === 'Reform' &&
      regionName === 'London' &&
      adjustedLeaveShare > 0.5 &&
      regionAdj < 0
    ) {
      regionAdj = 0
    }
    const nssecAdj = getNssecAdjustment(party, nssecShare, nssecBaseline)
    const degreeAdj = getDegreeAdjustment(party, degreeShare, degreeBaseline)
    const tenureAdj = getTenureAdjustment(party, tenureShare, tenureBaseline)
    const ruralUrbanAdj = getRuralUrbanAdjustment(party, ruralUrbanShare, ruralUrbanBaseline)
    const concentrationMultiplier = getConcentrationMultiplier(
      party,
      ward.nationalShares[party] ?? 0
    )
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
    ) * concentrationMultiplier
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
    const namedMax = namedEntries.reduce((max, [, value]) => Math.max(max, value ?? 0), 0)
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

export function computeCouncilProjectionRows(args: {
  baseline: BaselineData
  aggregate: AggregateRow
  councilSeats: CouncilSeatData
  councilPrevious: CouncilPreviousData | null
  ladGeo?: GeoCollection | null
  countyGeo?: GeoCollection | null
  leaveLookup: LeaveShareLookup | null
  ageLookup: AgeShareLookup | null
  regionLookup: RegionLookup | null
  nssecLookup: NssecLookup | null
  degreeLookup: DegreeLookup | null
  tenureLookup: TenureLookup | null
  ruralUrbanLookup: RuralUrbanLookup | null
  wardVacancyLookup: WardVacancyLookup | null
  wardToPcon: WardToPconLookup | null
  cedToPcon: CedToPconLookup | null
  geLookup: GePconLookup | null
  weights: Weights
}): CouncilProjectionRow[] {
  const {
    baseline,
    aggregate,
    councilSeats,
    councilPrevious,
    ladGeo,
    countyGeo,
    leaveLookup,
    ageLookup,
    regionLookup,
    nssecLookup,
    degreeLookup,
    tenureLookup,
    ruralUrbanLookup,
    wardVacancyLookup,
    wardToPcon,
    cedToPcon,
    geLookup,
    weights,
  } = args

  type CouncilDescriptor = {
    ladCode: string
    ladName: string
  }

  const byLad = new Map<string, WardBaseline[]>()
  baseline.wards.forEach(ward => {
    const list = byLad.get(ward.ladCode) || []
    list.push(ward)
    byLad.set(ward.ladCode, list)
  })

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

  const rawProjectionByCode = new Map<string, { winner: string; shares: Record<string, number> }>()
  const rawProjectionByName = new Map<string, { winner: string; shares: Record<string, number> }>()

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
    const baselineMeta = degreeLookup?.meta?.baseline
    if (baselineMeta) return baselineMeta
    return { degree: 0.4, noDegree: 0.6 }
  }

  const getTenureBaseline = () => {
    const baselineMeta = tenureLookup?.meta?.baseline
    if (baselineMeta) return baselineMeta
    return {
      ownedOutright: 0.32831847091249194,
      ownsWithMortgage: 0.297073553740984,
      socialRented: 0.1705895998333387,
      privateRented: 0.20401837551318536,
    }
  }

  const getRuralUrbanBaseline = () => {
    const baselineMeta = ruralUrbanLookup?.meta?.baseline
    if (baselineMeta) return baselineMeta
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
    const baselineMeta = nssecLookup?.meta?.baseline
    if (baselineMeta) return baselineMeta
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

  baseline.wards.forEach(ward => {
    let adjustedWard = ward
    const nationalSum = sumShares(ward.nationalShares || {})
    const localSum = sumShares(ward.localShares || {})
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
      reform: weights.geReformWeight,
      green: weights.geGreenWeight,
      major: weights.geMajorWeight,
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
      const blendedSwingMultipliers = { ...(adjustedWard.geSwingMultipliers || {}) }
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
        if (baseShare === 0 && party === 'Reform') {
          blendedNational[party] = 0
          blendedSwingMultipliers[party] = getRelativeGeSwingMultiplier(party, geShare)
          return
        }
        if (baseShare === 0 && party === 'Green') {
          blendedNational[party] = 0
          blendedSwingMultipliers[party] = getRelativeGeSwingMultiplier(party, geShare)
          return
        }
        blendedNational[party] = blendShare(baseShare, geShare, weight)
      })
      adjustedWard = {
        ...adjustedWard,
        nationalShares: blendedNational,
        geSwingMultipliers: blendedSwingMultipliers,
      }
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
    const ageStrengthEffective =
      ageShare.source === 'lad' ? Math.min(weights.ageStrength, 0.6) : weights.ageStrength
    const nssecStrengthEffective =
      nssecShare.source === 'lad' ? Math.min(weights.nssecStrength, 0.6) : weights.nssecStrength
    const degreeStrengthEffective =
      degreeShare.source === 'lad' ? Math.min(weights.degreeStrength, 0.6) : weights.degreeStrength
    const tenureStrengthEffective =
      tenureShare.source === 'lad' ? Math.min(weights.tenureStrength, 0.6) : weights.tenureStrength
    const ruralUrbanStrengthEffective =
      ruralUrbanShare.source === 'lad'
        ? Math.min(weights.ruralUrbanStrength, 0.6)
        : weights.ruralUrbanStrength
    const projection = computeWardProjection(
      adjustedWard,
      getBaselineNationalForYear(baseline, adjustedWard.lastYear),
      aggregate,
      leaveShare,
      ageShare.share,
      regionName,
      nssecShare.share,
      getNssecBaseline(),
      degreeShare.share,
      getDegreeBaseline(),
      tenureShare.share,
      getTenureBaseline(),
      ruralUrbanShare.share,
      getRuralUrbanBaseline(),
      weights.leaveStrength,
      ageStrengthEffective,
      weights.regionStrength,
      nssecStrengthEffective,
      degreeStrengthEffective,
      tenureStrengthEffective,
      ruralUrbanStrengthEffective
    )
    rawProjectionByCode.set(ward.wardCode, projection)
    const nameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
    if (!rawProjectionByName.has(nameKey)) {
      rawProjectionByName.set(nameKey, projection)
    }
  })

  const projections: CouncilProjectionRow[] = []
  const councilDescriptors = (() => {
    if (ladGeo?.features?.length) {
      return [
        ...(countyGeo?.features || []),
        ...ladGeo.features,
        { properties: { reference: 'surrey-east', name: 'East Surrey' } },
        { properties: { reference: 'surrey-west', name: 'West Surrey' } },
      ]
        .map(feature => {
          const ladCode =
            typeof feature.properties?.reference === 'string' ? feature.properties.reference : null
          const ladName = typeof feature.properties?.name === 'string' ? feature.properties.name : null
          if (!ladCode || !ladName) return null
          return { ladCode, ladName }
        })
        .filter((value): value is CouncilDescriptor => Boolean(value))
    }

    const byName = new Map<string, CouncilDescriptor>()
    baseline.wards.forEach(ward => {
      const normalized = normalizeCouncilName(ward.ladName)
      if (!normalized || byName.has(normalized)) return
      byName.set(normalized, { ladCode: ward.ladCode, ladName: ward.ladName })
    })
    councilSeats.councils.forEach(row => {
      const normalized = normalizeCouncilName(row.council)
      if (normalized === 'east surrey') {
        byName.set(normalized, { ladCode: 'surrey-east', ladName: 'East Surrey' })
      } else if (normalized === 'west surrey') {
        byName.set(normalized, { ladCode: 'surrey-west', ladName: 'West Surrey' })
      }
    })
    return Array.from(byName.values())
  })()

  councilDescriptors.forEach(({ ladCode, ladName }) => {
    const normalized = normalizeCouncilName(ladName)
    const seatRow = councilSeats.councils.find(
      row => normalizeCouncilName(row.council) === normalized
    )
    if (!seatRow) return
    const previousRow = councilPrevious?.councils?.find(
      row => normalizeCouncilName(row.council) === normalized
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

    const allWards =
      ladCode === 'surrey-east'
        ? baseline.wards.filter(
            ward => ward.ladCode === 'E10000030' && SURREY_EAST_DIVISIONS.has(ward.wardCode)
          )
        : ladCode === 'surrey-west'
          ? baseline.wards.filter(
              ward => ward.ladCode === 'E10000030' && SURREY_WEST_DIVISIONS.has(ward.wardCode)
            )
          : byLad.get(ladCode) || []
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
    if (!wards.length) return

    const ladFallbackProjection = (() => {
      let weightSum = 0
      const totals: Record<string, number> = {}
      wards.forEach(ward => {
        const nameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
        const projection =
          rawProjectionByCode.get(ward.wardCode) || rawProjectionByName.get(nameKey)
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
        prevWinner: null,
      }
    })()

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

    const contestedTotals: Record<string, number> = {}
    const contestedPreviousTotals: Record<string, number> = {}
    const seatChangeEvents: Array<{ prevWinner: string; projectedWinner: string; seats: number }> = []

    wards.forEach(ward => {
      const seatsUpCount = shouldUseWardIncumbents
        ? 1
        : getSeatsPerWard(wards, seatRow, ward, wardVacancyLookup)
      const nameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      const projection =
        rawProjectionByCode.get(ward.wardCode) ||
        rawProjectionByName.get(nameKey) ||
        ladFallbackProjection
      if (!projection) return
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
      if (contested) {
        const projectedSeatAllocation = allocateProjectedSeats(
          projection.shares || ladFallbackProjection?.shares || {},
          seatsUpCount
        )
        Object.entries(projectedSeatAllocation).forEach(([party, allocatedSeats]) => {
          const projectedKey = canonicalizePartyLabel(party)
          contestedTotals[projectedKey] = (contestedTotals[projectedKey] || 0) + allocatedSeats
          seatChangeEvents.push({
            prevWinner: canonicalizePartyLabel(
              prevWinner || projection.winner || ladFallbackProjection?.winner || 'Other'
            ),
            projectedWinner: projectedKey,
            seats: allocatedSeats,
          })
        })
        const contestedPrev = canonicalizePartyLabel(
          prevWinner || projection.winner || ladFallbackProjection?.winner || 'Other'
        )
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
    if (cycle === 'all_out') {
      projectedTotals = normalizeTotalsToTotal(totalSeats, adjustedContestedTotals)
    } else if (previousRow?.seatsBefore && Object.keys(previousRow.seatsBefore).length) {
      const currentTotals = { ...previousRow.seatsBefore }
      const currentSum = Object.values(currentTotals).reduce(
        (acc, value) => acc + (value || 0),
        0
      )
      if (currentSum && currentSum < totalSeats) {
        currentTotals.Other = (currentTotals.Other || 0) + (totalSeats - currentSum)
      }
      if (seatChangeEvents.length) {
        const projected: Record<string, number> = { ...currentTotals }
        seatChangeEvents.forEach(({ prevWinner, projectedWinner, seats }) => {
          const prevBucket = resolvePreviousSeatBucket(prevWinner, projected)
          projected[prevBucket] = Math.max(0, (projected[prevBucket] || 0) - seats)
          projected[projectedWinner] = (projected[projectedWinner] || 0) + seats
        })
        projectedTotals = normalizeTotalsToTotal(totalSeats, projected)
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
}

export function computeEnglandWardProjectionSnapshot(args: {
  generatedAt: string
  baseline: BaselineData
  aggregate: AggregateRow
  councilSeats: CouncilSeatData
  councilPrevious: CouncilPreviousData | null
  ladGeo?: GeoCollection | null
  countyGeo?: GeoCollection | null
  leaveLookup: LeaveShareLookup | null
  ageLookup: AgeShareLookup | null
  regionLookup: RegionLookup | null
  nssecLookup: NssecLookup | null
  degreeLookup: DegreeLookup | null
  tenureLookup: TenureLookup | null
  ruralUrbanLookup: RuralUrbanLookup | null
  wardVacancyLookup: WardVacancyLookup | null
  wardToPcon: WardToPconLookup | null
  cedToPcon: CedToPconLookup | null
  geLookup: GePconLookup | null
  weights: Weights
}): EnglandLocalProjectionSnapshot {
  const {
    generatedAt,
    baseline,
    aggregate,
    councilSeats,
    councilPrevious,
    ladGeo,
    countyGeo,
    leaveLookup,
    ageLookup,
    regionLookup,
    nssecLookup,
    degreeLookup,
    tenureLookup,
    ruralUrbanLookup,
    wardVacancyLookup,
    wardToPcon,
    cedToPcon,
    geLookup,
    weights,
  } = args

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

  const wardIncumbentLookup = new Map<string, string>()
  councilPrevious?.councils?.forEach(row => {
    const councilKey = normalizeCouncilName(row.council)
    Object.entries(row.wardIncumbents || {}).forEach(([wardName, party]) => {
      wardIncumbentLookup.set(`${councilKey}|${normalizeName(wardName)}`, canonicalizePartyLabel(party))
    })
  })

  const getLeaveShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { leaveShare: number; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = leaveLookup?.wards?.[wardCode]?.leaveShare
    if (typeof wardShare === 'number') return { leaveShare: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = leaveLookup?.wardNames?.[key]?.leaveShare
      if (typeof nameShare === 'number') return { leaveShare: nameShare, source: 'ward-name' }
    }
    const ladShare = leaveLookup?.lads?.[ladCode]?.leaveShare
    if (typeof ladShare === 'number') return { leaveShare: ladShare, source: 'lad' }
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
    if (COUNTY_REGION_LOOKUP[ladCode]) return COUNTY_REGION_LOOKUP[ladCode]
    return null
  }

  const getNssecBaseline = () => nssecLookup?.meta?.baseline || { higher: 0.33, intermediate: 0.33, lower: 0.34 }
  const getDegreeBaseline = () => degreeLookup?.meta?.baseline || { degree: 0.4, noDegree: 0.6 }
  const getTenureBaseline = () =>
    tenureLookup?.meta?.baseline || {
      ownedOutright: 0.32831847091249194,
      ownsWithMortgage: 0.297073553740984,
      socialRented: 0.1705895998333387,
      privateRented: 0.20401837551318536,
    }
  const getRuralUrbanBaseline = () =>
    ruralUrbanLookup?.meta?.baseline || {
      conurbation: 0.3663336976668199,
      cityTown: 0.45521235562383135,
      ruralTownFringe: 0.09743014933962564,
      ruralVillageHamlet: 0.08102379736972319,
    }

  const getWardLookupShare = <T extends Record<string, unknown>>(
    lookup:
      | {
          wards?: Record<string, T>
          wardNames?: Record<string, T>
          wardNamesOnly?: Record<string, T>
          wardNamesAggressive?: Record<string, T>
          lads?: Record<string, T>
        }
      | null,
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: T | null; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = lookup?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = lookup?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = lookup?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = lookup?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = lookup?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: null, source: 'national' }
  }

  const wardsByCode: Record<string, EnglandWardProjectionEntry> = {}

  baseline.wards.forEach(ward => {
    const nationalSum = sumShares(ward.nationalShares || {})
    const localSum = sumShares(ward.localShares || {})
    let adjustedWard = ward
    if (nationalSum + localSum === 0) {
      const ladBaseline = ladBaselineMap.get(ward.ladCode)
      if (ladBaseline && ladBaseline.totalVotes > 0) {
        adjustedWard = {
          ...ward,
          nationalShares: Object.fromEntries(
            Object.entries(ladBaseline.national).map(([party, value]) => [party, value / ladBaseline.totalVotes])
          ),
          localShares: Object.fromEntries(
            Object.entries(ladBaseline.local).map(([party, value]) => [party, value / ladBaseline.totalVotes])
          ),
        }
      }
    }

    const geWeights = {
      reform: weights.geReformWeight,
      green: weights.geGreenWeight,
      major: weights.geMajorWeight,
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
      const blendedSwingMultipliers = { ...(adjustedWard.geSwingMultipliers || {}) }
      ;['Labour', 'Conservative', 'Reform', 'Liberal Democrat', 'Green', 'SNP', 'Plaid Cymru'].forEach(party => {
        const weight = getGeWeightForParty(party, geWeights)
        if (!weight) return
        const baseShare = adjustedWard.nationalShares?.[party] ?? 0
        const geShare = geShares?.[party]
        if (baseShare === 0 && party === 'Reform') {
          blendedNational[party] = 0
          blendedSwingMultipliers[party] = getRelativeGeSwingMultiplier(party, geShare)
          return
        }
        if (baseShare === 0 && party === 'Green') {
          blendedNational[party] = 0
          blendedSwingMultipliers[party] = getRelativeGeSwingMultiplier(party, geShare)
          return
        }
        blendedNational[party] = blendShare(baseShare, geShare, weight)
      })
      adjustedWard = {
        ...adjustedWard,
        nationalShares: blendedNational,
        geSwingMultipliers: blendedSwingMultipliers,
      }
    }

    const leave = getLeaveShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
    const age = getAgeShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
    const nssec = getWardLookupShare<NssecShare>(nssecLookup, ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
    const degree = getWardLookupShare<DegreeShare>(degreeLookup, ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
    const tenure = getWardLookupShare<TenureShare>(tenureLookup, ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
    const ruralUrban = getWardLookupShare<RuralUrbanShare>(
      ruralUrbanLookup,
      ward.wardCode,
      ward.ladCode,
      ward.wardName,
      ward.ladName
    )

    const projection = computeWardProjection(
      adjustedWard,
      getBaselineNationalForYear(baseline, adjustedWard.lastYear),
      aggregate,
      leave.leaveShare,
      age.share,
      getRegionForWard(ward.ladCode),
      nssec.share || getNssecBaseline(),
      getNssecBaseline(),
      degree.share || getDegreeBaseline(),
      getDegreeBaseline(),
      tenure.share || getTenureBaseline(),
      getTenureBaseline(),
      ruralUrban.share || getRuralUrbanBaseline(),
      getRuralUrbanBaseline(),
      weights.leaveStrength,
      age.source === 'lad' ? Math.min(weights.ageStrength, 0.6) : weights.ageStrength,
      weights.regionStrength,
      nssec.source === 'lad' ? Math.min(weights.nssecStrength, 0.6) : weights.nssecStrength,
      degree.source === 'lad' ? Math.min(weights.degreeStrength, 0.6) : weights.degreeStrength,
      tenure.source === 'lad' ? Math.min(weights.tenureStrength, 0.6) : weights.tenureStrength,
      ruralUrban.source === 'lad'
        ? Math.min(weights.ruralUrbanStrength, 0.6)
        : weights.ruralUrbanStrength
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

    wardsByCode[ward.wardCode] = {
      wardCode: ward.wardCode,
      winner: projection.winner,
      shares: projection.shares,
      leaveSource: leave.source,
      prevWinner,
    }
  })

  return {
    generatedAt,
    wardsByCode,
    councilRows: computeCouncilProjectionRows({
      baseline,
      aggregate,
      councilSeats,
      councilPrevious,
      ladGeo,
      countyGeo,
      leaveLookup,
      ageLookup,
      regionLookup,
      nssecLookup,
      degreeLookup,
      tenureLookup,
      ruralUrbanLookup,
      wardVacancyLookup,
      wardToPcon,
      cedToPcon,
      geLookup,
      weights,
    }),
  }
}
