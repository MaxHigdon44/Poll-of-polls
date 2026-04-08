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
import {
  MAY_2025_AGGREGATE,
  MAY_2025_COUNCIL_SET,
} from '@/lib/local2025/simulation'
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

const LocalMap = dynamic(() => import('../../components/LocalMap'), { ssr: false })
const WARDS_GEO_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/627ae9540e3a4e199f4594a727b35724/geojson?layers=0'
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

const ELECTION_LADS_2025 = new Set(
  [
    'Doncaster',
    'Buckinghamshire',
    'Cornwall',
    'County Durham',
    'North Northamptonshire',
    'Northumberland',
    'Shropshire',
    'West Northamptonshire',
    'Wiltshire',
  ].map(normalizeName)
)

const COUNTY_ELECTIONS_2025 = new Set(
  [
    'Cambridgeshire',
    'Derbyshire',
    'Devon',
    'Gloucestershire',
    'Hertfordshire',
    'Kent',
    'Leicestershire',
    'Lincolnshire',
    'Nottinghamshire',
    'Oxfordshire',
    'Staffordshire',
    'Warwickshire',
    'Worcestershire',
  ].map(normalizeName)
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
    .replace(/\bcounty durham\b/g, 'durham')
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

function normalizeSubAreaName(value: string | undefined | null) {
  return normalizeName(value).replace(/\bed\b/g, '').replace(/\s+/g, ' ').trim()
}

function getGeoWardNameKey(feature: GeoFeature) {
  const props = feature.properties || {}
  const wardName = normalizeSubAreaName(getGeoWardName(feature))
  const ladName = String(props.LAD25NM || props.LAD23NM || props.LAD22NM || props.ladName || '')
  if (!wardName || !ladName) return null
  return `${normalizeName(ladName)}|${wardName}`
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

function getSeatsPerWardForPopup(
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
  if (cycle !== 'all_out') return 1

  const vacancySum = wards.reduce((acc, entry) => acc + Math.max(entry.vacancies || 0, 1), 0)
  if (vacancySum === totalSeats) {
    return Math.max(ward.vacancies || 0, 1)
  }

  if (wards.length && totalSeats % wards.length === 0) {
    return Math.max(1, Math.round(totalSeats / wards.length))
  }

  return Math.max(ward.vacancies || 0, 1)
}

export default function Local2026Page() {
  const router = useRouter()
  const [wardGeo, setWardGeo] = useState<GeoCollection | null>(null)
  const [ladGeo, setLadGeo] = useState<GeoCollection | null>(null)
  const [cedGeo, setCedGeo] = useState<GeoCollection | null>(null)
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
  const [olsResults, setOlsResults] = useState<OlsResults | null>(null)
  const [selectedLad, setSelectedLad] = useState<string | null>(null)
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
    fetch('/data/may-2025-councils.geojson')
      .then(res => res.json())
      .then(setLadGeo)
      .catch(() => setLadGeo(null))

    fetch('/data/ced-all.geojson')
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

    fetch('/data/ols-results.json')
      .then(res => res.json())
      .then(setOlsResults)
      .catch(() => setOlsResults(null))

    setAggregate(MAY_2025_AGGREGATE as AggregateRow)
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
    router.prefetch('/may-2025-council-projections-v2')
  }, [router])

  useEffect(() => {
    const handleRouteStart = (url: string) => {
      if (!url.startsWith('/may-2025-simulation')) {
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
    return ladGeo
  }, [ladGeo])

  useEffect(() => {
    if (!router.isReady) return
    if (selectedLad) {
      void router.replace(
        { pathname: '/may-2025-simulation', query: { council: selectedLad } },
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
    if (COUNTY_REGION_LOOKUP[ladCode]) return COUNTY_REGION_LOOKUP[ladCode]
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
    if (!baseline || !aggregate || !olsResults) return new Map<string, any>()
    const olsCoefficients = olsResults.scenarios?.inSampleAllYears?.coefficients || null
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

    const rawEntries: Array<{
      wardCode: string
      projection: any
      leaveSource: string
      prevWinner: string | null
    }> = []
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
        wardToPcon?.wards?.[ward.wardCode] ||
        wardToPcon?.wardNames?.[wardNameKey] ||
        cedToPcon?.ceds?.[ward.wardCode] ||
        cedToPcon?.cedNames?.[wardNameKey]
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
            blendedNational[party] = getRelativeGeShare(party, geShare)
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
      const normalizedCouncil = normalizeCouncilName(ward.ladName)
      const seatRow = councilSeats?.councils?.find(
        row => normalizeCouncilName(row.council) === normalizedCouncil
      )
      if (seatRow) {
        const seatsUp = seatRow.seatsUp
        const totalSeats = seatRow.totalSeats
        let cycle: 'all_out' | 'thirds' | 'halves' | 'unknown' = 'unknown'
        if (seatsUp === totalSeats) cycle = 'all_out'
        else if (totalSeats % 3 === 0 && seatsUp === Math.round(totalSeats / 3)) cycle = 'thirds'
        else if (totalSeats % 2 === 0 && seatsUp === Math.round(totalSeats / 2)) cycle = 'halves'
      }
      rawEntries.push({
        wardCode: ward.wardCode,
        projection,
        leaveSource: source,
        prevWinner,
      })
    })
    const map = new Map<string, any>()
    rawEntries.forEach(entry => {
      let winner = 'Other'
      let top = -1
      Object.entries(entry.projection.shares).forEach(([party, value]) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return
        if (numericValue > top) {
          top = numericValue
          winner = party
        }
      })
      map.set(entry.wardCode, {
        ...entry.projection,
        winner,
        color: PARTY_COLORS[winner] || '#ccc',
        leaveSource: entry.leaveSource,
        prevWinner: entry.prevWinner,
      })
    })
    return map
  }, [
    baseline,
    aggregate,
    olsResults,
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

  const selectedBaselineWards = useMemo(() => {
    if (!selectedLad || !baseline) return []
    const selectedFeature =
      councilGeo?.features.find(feature => feature.properties?.reference === selectedLad) || null
    const selectedName = String(selectedFeature?.properties?.name || '')
    const normalizedSelectedCouncil = normalizeCouncilName(selectedName)
    return baseline.wards.filter(ward => {
      if (ward.ladCode === selectedLad) return true
      if (!normalizedSelectedCouncil) return false
      return normalizeCouncilName(ward.ladName) === normalizedSelectedCouncil
    })
  }, [baseline, selectedLad, councilGeo])

  const wardMapByWardName = useMemo(() => {
    if (!baseline || !aggregate || !selectedLad) return new Map<string, any>()
    const map = new Map<string, any>()
    selectedBaselineWards.forEach(ward => {
        const key = normalizeSubAreaName(ward.wardName)
        if (map.has(key)) return
        const projection = wardMap.get(ward.wardCode)
        if (!projection) return
        map.set(key, projection)
      })
    return map
  }, [baseline, aggregate, selectedLad, wardMap, selectedBaselineWards])

  const ladFallbackProjection = useMemo(() => {
    if (!baseline || !aggregate || !selectedLad) return null
    const wards = selectedBaselineWards
    if (!wards.length) return null
    const totals: Record<string, number> = {}
    let weightSum = 0
    wards.forEach(ward => {
      const projection =
        wardMap.get(ward.wardCode) || wardMapByWardName.get(normalizeSubAreaName(ward.wardName))
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
  }, [baseline, aggregate, selectedLad, wardMap, wardMapByWardName, selectedBaselineWards])

  const wardVacancies = useMemo(() => {
    if (!baseline || !selectedLad) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = selectedBaselineWards
    const councilName = wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    wards.forEach(ward => {
      const seatsThisCycle = getSeatsPerWardForPopup(wards, seatRow, ward)
      map.set(ward.wardCode, seatsThisCycle)
    })
    return map
  }, [baseline, selectedLad, councilSeats, selectedBaselineWards])

  const wardVacanciesByName = useMemo(() => {
    if (!baseline || !selectedLad) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = selectedBaselineWards
    const councilName = wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    wards.forEach(ward => {
      const seatsThisCycle = getSeatsPerWardForPopup(wards, seatRow, ward)
      map.set(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`, seatsThisCycle)
      map.set(`${normalizeName(ward.ladName)}|${normalizeSubAreaName(ward.wardName)}`, seatsThisCycle)
    })
    return map
  }, [baseline, selectedLad, councilSeats, selectedBaselineWards])

  const contestedWardKeys = useMemo(() => {
    const empty = { codes: new Set<string>(), names: new Set<string>() }
    if (!baseline || !selectedLad || !councilSeats?.councils?.length) return empty
    const allWards = selectedBaselineWards
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
      const lastYear = ward.lastYear || ELECTION_YEAR
      const contested =
        cycle === 'thirds'
          ? (ELECTION_YEAR - lastYear) % 3 === 0
          : cycle === 'halves'
            ? (ELECTION_YEAR - lastYear) % 2 === 0
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
          ? (ELECTION_YEAR - (ward.lastYear || ELECTION_YEAR)) % 3 === 0
          : cycle === 'halves'
            ? (ELECTION_YEAR - (ward.lastYear || ELECTION_YEAR)) % 2 === 0
            : true
      if (!contested) return
      empty.codes.add(ward.wardCode)
      empty.names.add(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`)
    })
    return empty
  }, [baseline, selectedLad, councilSeats, councilPrevious, selectedBaselineWards])

  const eligibleLads = useMemo(() => {
    if (!councilGeo) return new Set<string>()
    const eligible = new Set<string>()
    councilGeo.features.forEach(feature => {
      const name = feature.properties?.name
      const normalized = normalizeName(name)
      if (COUNTY_ELECTIONS_2025.has(normalized) || ELECTION_LADS_2025.has(normalized)) {
        eligible.add(feature.properties?.reference)
      }
    })
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
      if (COUNTY_ELECTIONS_2025.has(normalized)) {
        mapping.set(code, 'county')
      } else if (ELECTION_LADS_2025.has(normalized)) {
        mapping.set(
          code,
          normalized === 'doncaster'
            ? 'metro'
            : new Set([
                'buckinghamshire',
                'cornwall',
                'county durham',
                'north northamptonshire',
                'northumberland',
                'shropshire',
                'west northamptonshire',
                'wiltshire',
              ]).has(normalized)
              ? 'unitary'
              : 'district'
        )
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
    const isCounty = COUNTY_ELECTIONS_2025.has(normalizeName(councilName))
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

    const allWards = selectedBaselineWards
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
      const lastYear = baselineWard.lastYear || ELECTION_YEAR
      if (cycle === 'thirds') {
        return (ELECTION_YEAR - lastYear) % 3 === 0
      }
      if (cycle === 'halves') {
        return (ELECTION_YEAR - lastYear) % 2 === 0
      }
      return true
    })
    const useFeatureContested = contestedWardFeatures.length > 0
    wards.forEach(ward => {
      if (useFeatureContested) {
        return
      }
      const seatsUpCount = shouldUseWardIncumbents
        ? 1
        : getSeatsPerWardForPopup(wards, seatRow, ward)
      const seats = seatsUpCount * seatMultiplier
      const projection =
        wardMap.get(ward.wardCode) || wardMapByWardName.get(normalizeName(ward.wardName))
      const projectedSeatAllocation = allocateProjectedSeats(
        projection?.shares || ladFallbackProjection?.shares || {},
        seatsUpCount
      )
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
      const lastYear = ward.lastYear || ELECTION_YEAR
      let contested = shouldUseWardIncumbents ? Boolean(incumbentWinner) : true
      if (useLastYear) {
        if (cycle === 'thirds') {
          contested = (ELECTION_YEAR - lastYear) % 3 === 0
        } else if (cycle === 'halves') {
          contested = (ELECTION_YEAR - lastYear) % 2 === 0
        }
      }
      const fallbackProjectedWinner = canonicalizePartyLabel(
        projection?.winner || ladFallbackProjection?.winner || 'Other'
      )
      const prev = canonicalizePartyLabel(prevWinner || fallbackProjectedWinner)
      previousTotals[prev] = (previousTotals[prev] || 0) + seats
      if (contested) {
        Object.entries(projectedSeatAllocation).forEach(([party, allocatedSeats]) => {
          const contestedProjected = canonicalizePartyLabel(party)
          contestedTotals[contestedProjected] =
            (contestedTotals[contestedProjected] || 0) + allocatedSeats
          totals[contestedProjected] =
            (totals[contestedProjected] || 0) + allocatedSeats * seatMultiplier
          seatChangeEvents.push({
            prevWinner: prev,
            projectedWinner: contestedProjected,
            seats: allocatedSeats,
          })
        })
        contestedPreviousTotals[prev] = (contestedPreviousTotals[prev] || 0) + seatsUpCount
      } else {
        totals[prev] = (totals[prev] || 0) + seats
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
        const seatsUpCount = shouldUseWardIncumbents
          ? 1
          : baselineWard
            ? getSeatsPerWardForPopup(wards, seatRow, baselineWard)
            : 1
        const seats = seatsUpCount * seatMultiplier
        const wardName = normalizeName(getGeoWardName(feature))
        const prevWinner =
          (shouldUseWardIncumbents ? normalizedWardIncumbents.get(wardName) : null) ||
          canonicalizePartyLabel(projection.prevWinner || '')
        if (!prevWinner) return
        const projectedSeatAllocation = allocateProjectedSeats(projection.shares || {}, seatsUpCount)
        Object.entries(projectedSeatAllocation).forEach(([party, allocatedSeats]) => {
          const projectedWinner = canonicalizePartyLabel(party)
          contestedTotals[projectedWinner] = (contestedTotals[projectedWinner] || 0) + allocatedSeats
          totals[projectedWinner] = (totals[projectedWinner] || 0) + allocatedSeats * seatMultiplier
          seatChangeEvents.push({
            prevWinner,
            projectedWinner,
            seats: allocatedSeats,
          })
        })
        contestedPreviousTotals[prevWinner] =
          (contestedPreviousTotals[prevWinner] || 0) + seatsUpCount
        previousTotals[prevWinner] = (previousTotals[prevWinner] || 0) + seats
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
    selectedBaselineWards,
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
    if (COUNTY_ELECTIONS_2025.has(normalized)) {
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
    return COUNTY_ELECTIONS_2025.has(normalizeName(name))
  }, [selectedLadFeature])

  const wardFeatures = useMemo(() => {
    if (!selectedLad || !baseline) return []
    const activeGeo = isCountySelection ? cedGeo : wardGeo
    if (!activeGeo || !Array.isArray(activeGeo.features)) return []
    const selectedName = selectedLadFeature?.properties?.name
    let wardCodes: Set<string>
    if (isCountySelection) {
      const selectedCountyCode = selectedLad
      const selectedCountyName = normalizeName(selectedName || selectedLadFeature?.properties?.name)
      wardCodes = new Set(selectedBaselineWards.map(ward => ward.wardCode))
      const wardNames = new Set(selectedBaselineWards.map(ward => normalizeSubAreaName(ward.wardName)))
      return activeGeo.features.filter(feature => {
        const props: any = feature.properties || {}
        if (
          (props.countyCode && props.countyCode === selectedCountyCode) ||
          (props.countyName && normalizeName(props.countyName) === selectedCountyName)
        ) {
          return true
        }
        const code = getGeoWardCode(feature)
        if (code && wardCodes.has(code)) return true
        return wardNames.has(normalizeSubAreaName(getGeoWardName(feature)))
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
      wardCodes = new Set(selectedBaselineWards.map(ward => ward.wardCode))
    }
    const wardNameSet = new Set(selectedBaselineWards.map(ward => normalizeSubAreaName(ward.wardName)))
    return activeGeo.features.filter(feature => {
      const props: any = feature.properties || {}
      const code = props.reference || props.WD25CD || props.WD23CD || props.WD22CD
      if (wardCodes.has(code)) return true
      const name = normalizeSubAreaName(props.WD25NM || props.WD23NM || props.WD22NM || props.name)
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
    selectedBaselineWards,
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
        <h1 style={{ margin: 0 }}>May 2025 Simulation V2</h1>
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
      <div style={{ marginTop: '0.75rem', marginBottom: '1.25rem', color: '#555' }}>
        {selectedCouncilName ? (
          <span style={{ fontSize: '1.1rem', color: '#333' }}>{selectedCouncilName}</span>
        ) : (
          'Click a council area to zoom into ward-level projections.'
        )}
      </div>
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
              wardFeatures={wardFeatures}
              contestedWardCodes={isCountySelection ? undefined : contestedWardKeys.codes}
              contestedWardNameKeys={isCountySelection ? undefined : contestedWardKeys.names}
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
