import { useEffect, useMemo, useRef, useState } from 'react'
import { GeoJSON, MapContainer, Pane, TileLayer, useMap } from 'react-leaflet'
import type { FeatureCollection, GeoJsonObject } from 'geojson'
import L from 'leaflet'
import {
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
  getRelativeGeShare,
} from '@/lib/local2026/ge'
import { computePollsterWeight, computeSampleWeight } from '@/lib/weights'
import { computeAggregate } from '@/lib/aggregate'
import {
  NATIONAL_LEAVE_SHARE,
  clampLeaveShare as clampEnglishLeaveShare,
  getCenteredPartyLeaveAdjustment,
} from '@/lib/local2026/leaveRemain'
import { AGE_BASELINE, AGE_EFFECT_STRENGTH, getAgeAdjustment } from '@/lib/local2026/age'
import { REGION_EFFECT_STRENGTH, getRegionAdjustment } from '@/lib/local2026/region'
import { getConcentrationMultiplier } from '@/lib/local2026/concentration'
import { allocateProjectedSeats, getSeatAllocationLabel } from '@/lib/local2026/multiMember'
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
  SCOTLAND_AGE_EFFECT_STRENGTH,
  getScottishAgeAdjustment,
  type ScotlandAgeShare,
} from '@/lib/scotland/age'
import {
  SCOTLAND_DEGREE_EFFECT_STRENGTH,
  getScottishDegreeAdjustment,
  type ScotlandDegreeShare,
} from '@/lib/scotland/degree'
import {
  SCOTLAND_NSSEC_EFFECT_STRENGTH,
  getScottishNssecAdjustment,
  type ScotlandNssecShare,
} from '@/lib/scotland/nssec'
import {
  SCOTLAND_LEAVE_EFFECT_STRENGTH,
  SCOTLAND_NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredScottishPartyLeaveAdjustment,
} from '@/lib/scotland/leaveRemain'
import {
  SCOTLAND_TENURE_EFFECT_STRENGTH,
  getScottishTenureAdjustment,
  type ScotlandTenureShare,
} from '@/lib/scotland/tenure'
import { getPartyLeaveAdjustment, LEAVE_EFFECT_STRENGTH } from '@/lib/local2026/leaveRemain'

export type UnifiedLayerKey =
  | 'english-local'
  | 'scottish-parliament'
  | 'welsh-senedd'
  | 'renewables-sentiment'

type ViewMode = 'uk' | 'england' | 'scotland' | 'wales'

type ScottishPoll = {
  poll_date: string
  pollDate?: string
  pollster: string
  sample_size: number | null
  sampleSize?: number | null
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  others: number | null
}

type ScottishResult = {
  previousWinner2021: string | null
  region: string
  baselineSource?: 'api' | 'fallback-2021'
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
  projectedWinner?: string | null
}

const SCOTTISH_CONSTITUENCY_BASELINE_FALLBACKS: Record<string, ScottishResult> = {
  'Orkney Islands': {
    previousWinner2021: 'Liberal Democrat',
    region: 'Highlands and Islands',
    baselineSource: 'fallback-2021',
    shares: {
      snp: 29.05,
      conservative: 6.03,
      labour: 2.5,
      libdem: 62.42,
      green: null,
      other: null,
    },
  },
  'Shetland Islands': {
    previousWinner2021: 'Liberal Democrat',
    region: 'Highlands and Islands',
    baselineSource: 'fallback-2021',
    shares: {
      snp: 41.875471,
      conservative: 4.215202,
      labour: 3.553172,
      libdem: 48.62985,
      green: null,
      other: 1.726305,
    },
  },
}

type WelshProjection = {
  baseline: Record<string, number>
  projected: Record<string, number>
  projectedWinner: string | null
  seats: Record<string, number>
}

export type UnifiedFocusRegion = 'all' | 'english' | 'scotland' | 'wales'

export type UnifiedSidebarData = {
  selectedEnglishCouncilName: string | null
  selectedScottishConstituency: {
    name: string
    projectedWinner: string | null
    projected: Record<string, number> | null
  } | null
  scottishSeatSummary: Array<{ party: string; seats: number; delta: number }>
  selectedWelshConstituency: {
    name: string
    result: WelshProjection | null
  } | null
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

type PollApiRow = {
  poll_date: string
  pollster: string
  sample_size: number | null
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
  area?: string | null
}

type CouncilSeatData = {
  councils: Array<{ council: string; seatsUp: number; totalSeats: number; control: string | null }>
}

type CouncilSeatRow = CouncilSeatData['councils'][number]

type CouncilPreviousData = {
  councils: Array<{
    council: string
    url: string
    lastElection: Record<string, number>
    seatsBefore: Record<string, number>
    wardIncumbents?: Record<string, string>
  }>
}

type WardVacancyLookup = {
  wards?: Record<string, number>
  wardNames?: Record<string, number>
}

type LeaveShareLookup = {
  wards?: Record<string, { leaveShare: number }>
  wardNames?: Record<string, { leaveShare: number }>
  lads?: Record<string, { leaveShare: number }>
}

type AgeShareLookup = {
  wards?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNames?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNamesOnly?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  wardNamesAggressive?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
  lads?: Record<string, { age18_35: number; age35_55: number; age55_plus: number }>
}

type RegionLookup = {
  lads?: Record<string, { regionName: string }>
}

type LookupWithWardNames<T> = {
  wards?: Record<string, T & { totalPop?: number; wardName?: string }>
  wardNames?: Record<string, T & { totalPop?: number; wardName?: string }>
  wardNamesOnly?: Record<string, T & { totalPop?: number; wardName?: string }>
  wardNamesAggressive?: Record<string, T & { totalPop?: number; wardName?: string }>
  lads?: Record<string, T>
  meta?: { baseline?: any }
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

const COUNCIL_TYPE_OPTIONS = [
  { key: 'district', label: 'District Councils', color: '#2E8B57' },
  { key: 'county', label: 'County Councils', color: '#E75480' },
  { key: 'london', label: 'London Boroughs', color: '#6A1B9A' },
  { key: 'metro', label: 'Metropolitan Boroughs', color: '#FB8C00' },
  { key: 'unitary', label: 'Unitary Authorities', color: '#1E88E5' },
] as const
type CouncilCategory = (typeof COUNCIL_TYPE_OPTIONS)[number]['key']

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  Reform: '#12B6CF',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  SNP: '#FDF38E',
  'Plaid Cymru': '#008672',
  Other: '#9a9a9a',
  Independent: '#9a9a9a',
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

const WELSH_NAME_OVERRIDES: Record<string, string> = {
  'Bangor Conwy Môn': 'Bangor Conwy Môn',
  Clwyd: 'Clwyd',
  'Fflint Wrecsam': 'Fflint Wrecsam',
  'Gwynedd Maldwyn': 'Gwynedd Maldwynn',
  'Ceredigion Penfro': 'Ceredigion Penifro',
  'Sir Gaerfyrddin': 'Sir Gaerfyrddin',
}

const ELECTION_LADS_2026 = new Set(
  [
    'Adur', 'Arun', 'Basildon', 'Brentwood', 'Broxbourne', 'Burnley', 'Cambridge',
    'Cannock Chase', 'Castle Point', 'Chelmsford', 'Cherwell', 'Colchester',
    'Crawley', 'Dacorum', 'Dartford', 'Eastbourne', 'Eastleigh', 'Elmbridge',
    'Epping Forest', 'Epsom and Ewell', 'Exeter', 'Fareham', 'Gravesham', 'Harlow',
    'Hastings', 'Ipswich', 'Lancaster', 'Maidstone', 'Mole Valley', 'North Hertfordshire',
    'Oxford', 'Preston', 'Reigate and Banstead', 'Rochford', 'Runnymede', 'Spelthorne',
    'Stevenage', 'Swale', 'Tamworth', 'Tandridge', 'Three Rivers', 'Tunbridge Wells',
    'Watford', 'Welwyn Hatfield', 'Worthing', 'Wyre Forest',
  ].map(normalizeName)
)

const OFFICIAL_NAMES: Record<string, string> = {
  basildon: 'Basildon Council',
  cambridge: 'Cambridge City Council',
  colchester: 'Colchester City Council',
  exeter: 'Exeter City Council',
  ipswich: 'Ipswich Borough Council',
  lancaster: 'Lancaster City Council',
  oxford: 'Oxford City Council',
  preston: 'Preston City Council',
  watford: 'Watford Borough Council',
  worthing: 'Worthing Borough Council',
}

const SURREY_EAST = new Set(
  ['Elmbridge', 'Epsom and Ewell', 'Mole Valley', 'Reigate and Banstead', 'Tandridge'].map(normalizeName)
)
const SURREY_WEST = new Set(
  ['Guildford', 'Runnymede', 'Spelthorne', 'Surrey Heath', 'Waverley', 'Woking'].map(normalizeName)
)
const SURREY_EAST_DIVISIONS = new Set(['E58001463','E58001465','E58001466','E58001472','E58001474','E58001475','E58001476','E58001477','E58001478','E58001481','E58001482','E58001483','E58001484','E58001501','E58001502','E58001503','E58001504','E58001508','E58001510','E58001513','E58001514','E58001516','E58001517','E58001518','E58001525','E58001469','E58001470','E58001492','E58001511','E58001515','E58001530'])
const SURREY_WEST_DIVISIONS = new Set(['E58001461','E58001494','E58001495','E58001496','E58001497','E58001498','E58001505','E58001519','E58001520','E58001541','E58001460','E58001471','E58001479','E58001480','E58001488','E58001540','E58001462','E58001507','E58001512','E58001521','E58001522','E58001523','E58001524','E58001464','E58001467','E58001468','E58001489','E58001500','E58001509','E58001473','E58001485','E58001486','E58001487','E58001490','E58001491','E58001499','E58001531','E58001532','E58001493','E58001506','E58001526','E58001536','E58001538','E58001537','E58001539'])
const COUNTY_REGION_LOOKUP: Record<string, string> = {
  E10000011: 'South East',
  E10000012: 'East of England',
  E10000014: 'South East',
  E10000020: 'East of England',
  E10000030: 'South East',
  E10000029: 'East of England',
  E10000032: 'South East',
}

const COUNTY_ELECTIONS_2026 = new Set(['East Sussex', 'Essex', 'Hampshire', 'Norfolk', 'Suffolk'].map(normalizeName))
const LONDON_BOROUGHS = new Set(
  [
    'Barking and Dagenham', 'Barnet', 'Bexley', 'Brent', 'Bromley', 'Camden', 'City of London',
    'Croydon', 'Ealing', 'Enfield', 'Greenwich', 'Hackney', 'Hammersmith and Fulham', 'Haringey',
    'Harrow', 'Havering', 'Hillingdon', 'Hounslow', 'Islington', 'Kensington and Chelsea',
    'Kingston upon Thames', 'Lambeth', 'Lewisham', 'Merton', 'Newham', 'Redbridge',
    'Richmond upon Thames', 'Southwark', 'Sutton', 'Tower Hamlets', 'Waltham Forest',
    'Wandsworth', 'Westminster',
  ].map(normalizeName)
)
const METRO_BOROUGHS = new Set(
  [
    'Barnsley', 'Birmingham', 'Bolton', 'Bradford', 'Bury', 'Calderdale', 'Coventry', 'Dudley',
    'Gateshead', 'Kirklees', 'Knowsley', 'Leeds', 'Manchester', 'Newcastle upon Tyne',
    'North Tyneside', 'Oldham', 'Rochdale', 'Salford', 'Sandwell', 'Sefton', 'Sheffield',
    'Solihull', 'South Tyneside', 'St Helens', 'Stockport', 'Sunderland', 'Tameside', 'Trafford',
    'Wakefield', 'Walsall', 'Wigan', 'Wolverhampton',
  ].map(normalizeName)
)
const UNITARY_AUTHORITIES = new Set(
  [
    'Blackburn with Darwen', 'Halton', 'Hartlepool', 'Kingston upon Hull, City of', 'Isle of Wight',
    'Milton Keynes', 'North East Lincolnshire', 'Peterborough', 'Plymouth', 'Portsmouth',
    'Reading', 'Southampton', 'Southend-on-Sea', 'Swindon', 'Thurrock', 'Wokingham',
    'Elmbridge', 'Epsom and Ewell', 'Mole Valley', 'Reigate and Banstead', 'Tandridge',
    'Guildford', 'Runnymede', 'Spelthorne', 'Surrey Heath', 'Waverley', 'Woking',
  ].map(normalizeName)
)

const BASELINE_2021_CONSTITUENCY = {
  snp: 47.7,
  conservative: 21.9,
  labour: 21.6,
  green: 1.3,
  libdem: 6.9,
  other: 0.6,
}
const SCOTLAND_GE2024_REFORM_BASELINE = 7
const GE_BLEND_OTHER = 0.05
const SCOTLAND_REGION_EFFECT_STRENGTH = 0.7
const SCOTLAND_REGION_DELTAS: Record<string, Record<string, number>> = {
  'north east scotland': { SNP: -0.5, Conservative: 3.5, Labour: -9.5, 'Liberal Democrat': -0.5, Green: -1.5, Reform: 6 },
  'highlands and islands': { SNP: -2, Conservative: 0.5, Labour: -4, 'Liberal Democrat': 9, Green: -3, Reform: -1.5 },
  'south scotland': { SNP: -2, Conservative: 4, Labour: -3.5, 'Liberal Democrat': -5, Green: -2, Reform: 4 },
  'west scotland': { SNP: -1, Conservative: -2, Labour: 7.5, 'Liberal Democrat': 2, Green: -3, Reform: -2.5 },
  central: { SNP: 7.5, Conservative: -0.5, Labour: -1.5, 'Liberal Democrat': -4.5, Green: -2, Reform: 2.5 },
  'mid scotland and fife': { SNP: -2, Conservative: 3, Labour: 3.5, 'Liberal Democrat': 2, Green: -2.5, Reform: -1 },
  lothians: { SNP: -1, Conservative: -1.5, Labour: 2.5, 'Liberal Democrat': 4, Green: 5, Reform: -5 },
  glasgow: { SNP: 2.5, Conservative: -4.5, Labour: 3.5, 'Liberal Democrat': -5, Green: 8, Reform: -4.5 },
}

function normalizeName(name: string | null | undefined) {
  return String(name || '')
    .toLowerCase()
    .replace(/'s\b/gi, 's')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWelshName(name: string) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeScottishConstituencyName(name: string) {
  return normalizeName(String(name || '').replace(/\bislands\b/g, ''))
}

function normalizeWestminsterName(name: string) {
  return normalizeName(name)
}

function normalizeScotlandRegion(region: string | null | undefined) {
  const normalized = normalizeName(region || '')
  if (normalized === 'north east') return 'north east scotland'
  if (normalized === 'highlands') return 'highlands and islands'
  if (normalized === 'south') return 'south scotland'
  if (normalized === 'west') return 'west scotland'
  if (normalized === 'central scotland') return 'central'
  if (normalized === 'lothian') return 'lothians'
  if (normalized === 'mid and fife') return 'mid scotland and fife'
  if (normalized === 'mid scotland and fife') return 'mid scotland and fife'
  return normalized
}

function buildPopupShareLines(entries: Array<[string, number | null | undefined]>) {
  return entries
    .filter(([, value]) => value != null)
    .map(([party, value]) => [party, Number(value)] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
    .join('<br/>')
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

function canonicalizePartyLabel(party: string | null | undefined) {
  const normalized = normalizeName(party)
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  return party || 'Other'
}

function getGeoWardCode(feature: any) {
  const props = feature?.properties || {}
  return props.reference || props.CED25CD || props.CED24CD || props.WD25CD || props.WD23CD || props.WD22CD || null
}

function getGeoWardName(feature: any) {
  const props = feature?.properties || {}
  return String(props.CED25NM || props.CED24NM || props.WD25NM || props.WD23NM || props.WD22NM || props.name || '')
}

function getGeoWardNameKey(feature: any) {
  const props = feature?.properties || {}
  const wardName = getGeoWardName(feature).replace(/\s+ed$/i, '')
  const ladName = String(props.CTY25NM || props.CTY24NM || props.LAD25NM || props.LAD23NM || props.LAD22NM || props.ladName || '')
  if (!wardName || !ladName) return null
  return `${normalizeName(ladName)}|${normalizeName(wardName)}`
}

function getBaselineNationalForYear(baseline: BaselineData, year: number | null | undefined): Record<string, number> {
  const key = year ? String(year) : ''
  const byYear = key ? baseline.baselineNationalByYear?.[key] : null
  if (!byYear) return baseline.baselineNational
  return {
    Labour: byYear.Labour ?? baseline.baselineNational.Labour ?? 0,
    Conservative: byYear.Conservative ?? baseline.baselineNational.Conservative ?? 0,
    Reform: byYear.Reform ?? baseline.baselineNational.Reform ?? 0,
    'Liberal Democrat': byYear['Liberal Democrat'] ?? baseline.baselineNational['Liberal Democrat'] ?? 0,
    Green: byYear.Green ?? baseline.baselineNational.Green ?? 0,
    SNP: byYear.SNP ?? baseline.baselineNational.SNP ?? 0,
    'Plaid Cymru': byYear['Plaid Cymru'] ?? baseline.baselineNational['Plaid Cymru'] ?? 0,
  }
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
  const labourStronghold = (ward.nationalShares['Labour'] ?? 0) > 70
  const labourDeltaMultiplier = labourStronghold ? 1 : ward.lastYear === 2021 ? 1.4 : ward.lastYear === 2022 ? 1.3 : ward.lastYear === 2024 ? 1.15 : 1
  const labourBaselineCarry = labourStronghold ? 1 : ward.lastYear === 2021 || ward.lastYear === 2022 || ward.lastYear === 2024 ? 0.93 : 1
  const nationalParties = ['Labour', 'Conservative', 'Reform', 'Liberal Democrat', 'Green', 'SNP', 'Plaid Cymru']
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
  const adjustedLeaveShare = clampEnglishLeaveShare(leaveShare)
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
    const rawDelta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
    let delta = party === 'Labour' && rawDelta < 0 ? rawDelta * labourDeltaMultiplier : rawDelta
    if (party === 'Conservative' && ward.lastYear === 2021 && delta < 0) delta *= 0.9
    if (party === 'Reform' && delta > 0 && ward.lastYear === 2021 && canonicalizePartyLabel(baselineWinner) === 'Conservative') delta *= 0.95
    let regionAdj = getRegionAdjustment(party, regionName)
    if (
      party === 'Reform' &&
      regionName === 'London' &&
      adjustedLeaveShare > 0.5 &&
      regionAdj < 0
    ) {
      regionAdj = 0
    }
    const value = Math.max(
      0,
      base +
        delta +
        leaveStrength * getCenteredPartyLeaveAdjustment(party, adjustedLeaveShare) +
        ageStrength * getAgeAdjustment(party, ageShare) +
        regionStrength * regionAdj +
        nssecStrength * getNssecAdjustment(party, nssecShare, nssecBaseline) +
        degreeStrength * getDegreeAdjustment(party, degreeShare, degreeBaseline) +
        tenureStrength * getTenureAdjustment(party, tenureShare, tenureBaseline) +
        ruralUrbanStrength * getRuralUrbanAdjustment(party, ruralUrbanShare, ruralUrbanBaseline)
    ) * getConcentrationMultiplier(party, ward.nationalShares[party] ?? 0)
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
    nationalParties.forEach(party => { adjustedNational[party] = 0 })
  } else {
    scaledLocal = localBaseline
    if (sumNational > 0) {
      const scale = remaining / sumNational
      nationalParties.forEach(party => { adjustedNational[party] = adjustedNational[party] * scale })
    }
  }

  const combined: Record<string, number> = { ...scaledLocal, ...adjustedNational }
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

function getSeatsPerWardForPopup(
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
        wardVacancyLookup?.wardNames?.[`${normalizeName(entry.ladName)}|${entryWardKey}`] ||
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
  const entries = Object.entries(totals).map(([party, seats]) => ({ party, seats }))
  const sum = entries.reduce((acc, entry) => acc + entry.seats, 0)
  if (!sum || sum === targetTotal) {
    return Object.fromEntries(entries.map(entry => [entry.party, Math.round(entry.seats)]))
  }
  const scale = targetTotal / sum
  const scaled = entries.map(entry => ({ party: entry.party, scaled: entry.seats * scale }))
  const floored = scaled.map(entry => ({
    party: entry.party,
    seats: Math.floor(entry.scaled),
    frac: entry.scaled - Math.floor(entry.scaled),
  }))
  let remaining = targetTotal - floored.reduce((acc, entry) => acc + entry.seats, 0)
  floored
    .sort((a, b) => b.frac - a.frac)
    .forEach(entry => {
      if (remaining <= 0) return
      entry.seats += 1
      remaining -= 1
    })
  return Object.fromEntries(floored.map(entry => [entry.party, entry.seats]))
}

function classifyCouncil(name: string): CouncilCategory {
  const normalized = normalizeName(name)
  if (COUNTY_ELECTIONS_2026.has(normalized)) return 'county'
  if (LONDON_BOROUGHS.has(normalized)) return 'london'
  if (METRO_BOROUGHS.has(normalized)) return 'metro'
  if (UNITARY_AUTHORITIES.has(normalized)) return 'unitary'
  return 'district'
}

function supportToColor(value: number, min: number, max: number) {
  const clamped = Math.max(min, Math.min(max, value))
  const t = (clamped - min) / (max - min || 1)
  const lightness = 96 - t * 80
  return `hsl(128, 70%, ${lightness}%)`
}

function computeScottishRecencyWeight(ageDays: number) {
  if (ageDays < 10) return 1
  if (ageDays < 20) return 0.75
  if (ageDays < 40) return 0.5
  if (ageDays < 60) return 0.25
  return 0.1
}

function computeScottishPollWeight(poll: ScottishPoll) {
  const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
  const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
  return (
    computeScottishRecencyWeight(ageDays) *
    computePollsterWeight(poll.pollster) *
    computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
  )
}

function FitOverview({ view }: { view: ViewMode }) {
  const map = useMap()
  useEffect(() => {
    const bounds =
      view === 'england'
        ? L.latLngBounds([49.8, -6.6], [56.2, 2.3])
        : view === 'scotland'
          ? L.latLngBounds([54.5, -8.0], [60.95, -0.5])
          : view === 'wales'
            ? L.latLngBounds([51.3, -5.8], [53.7, -2.4])
            : L.latLngBounds([49.8, -8.7], [60.95, 2.5])
    map.fitBounds(bounds, { padding: [20, 20] })
  }, [map, view])
  return null
}

function FitFeature({ feature }: { feature: any }) {
  const map = useMap()
  const lastFeatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (!feature) return
    const featureKey = JSON.stringify(feature?.properties || {})
    if (lastFeatureRef.current === featureKey) return
    const layer = L.geoJSON(feature as GeoJsonObject)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
      lastFeatureRef.current = featureKey
    }
  }, [map, feature])
  return null
}

function getWelshFeatureName(props: any) {
  return props.SEN26NM || props.SEN26NMC || props.english_na || props.enw_cymrae || ''
}

function getWelshDisplayName(rawName: string) {
  return WELSH_NAME_OVERRIDES[rawName] || rawName
}

function allocateDhondt(shares: Record<string, number>, seats: number) {
  const parties = Object.keys(shares)
  const allocated: Record<string, number> = {}
  parties.forEach(party => {
    allocated[party] = 0
  })
  for (let i = 0; i < seats; i += 1) {
    let bestParty = parties[0]
    let bestScore = -Infinity
    parties.forEach(party => {
      const score = (shares[party] ?? 0) / (allocated[party] + 1)
      if (score > bestScore) {
        bestScore = score
        bestParty = party
      }
    })
    allocated[bestParty] += 1
  }
  return allocated
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}`)
  return res.json()
}

export default function CombinedOverviewMap({
  selectedLayers,
  visibleCouncilTypes,
  focusRegion,
  focusResetToken,
  onSidebarDataChange,
  onRequestFocusRegion,
}: {
  selectedLayers: Set<UnifiedLayerKey>
  visibleCouncilTypes: Set<CouncilCategory>
  focusRegion: UnifiedFocusRegion
  focusResetToken: number
  onSidebarDataChange?: (data: UnifiedSidebarData) => void
  onRequestFocusRegion?: (
    region: UnifiedFocusRegion,
    options?: { resetSelections?: boolean }
  ) => void
}) {
  const [countriesGeo, setCountriesGeo] = useState<FeatureCollection | null>(null)
  const [ladsGeo, setLadsGeo] = useState<FeatureCollection | null>(null)
  const [countiesGeo, setCountiesGeo] = useState<FeatureCollection | null>(null)
  const [cedGeo, setCedGeo] = useState<FeatureCollection | null>(null)
  const [wardGeo, setWardGeo] = useState<FeatureCollection | null>(null)
  const [surreyOverlay, setSurreyOverlay] = useState<FeatureCollection | null>(null)
  const [surreyBoundary, setSurreyBoundary] = useState<FeatureCollection | null>(null)
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [englishAggregate, setEnglishAggregate] = useState<AggregateRow | null>(null)
  const [leaveLookup, setLeaveLookup] = useState<LeaveShareLookup | null>(null)
  const [ageLookupEnglish, setAgeLookupEnglish] = useState<AgeShareLookup | null>(null)
  const [regionLookup, setRegionLookup] = useState<RegionLookup | null>(null)
  const [nssecLookupEnglish, setNssecLookupEnglish] = useState<LookupWithWardNames<NssecShare> | null>(null)
  const [degreeLookupEnglish, setDegreeLookupEnglish] = useState<LookupWithWardNames<DegreeShare> | null>(null)
  const [tenureLookupEnglish, setTenureLookupEnglish] = useState<LookupWithWardNames<TenureShare> | null>(null)
  const [ruralLookupEnglish, setRuralLookupEnglish] = useState<LookupWithWardNames<RuralUrbanShare> | null>(null)
  const [wardVacancyLookup, setWardVacancyLookup] = useState<WardVacancyLookup | null>(null)
  const [wardToPcon, setWardToPcon] = useState<WardToPconLookup | null>(null)
  const [cedToPcon, setCedToPcon] = useState<CedToPconLookup | null>(null)
  const [englishGeLookup, setEnglishGeLookup] = useState<GePconLookup | null>(null)
  const [councilSeats, setCouncilSeats] = useState<CouncilSeatData | null>(null)
  const [councilPrevious, setCouncilPrevious] = useState<CouncilPreviousData | null>(null)
  const [selectedEnglishCouncil, setSelectedEnglishCouncil] = useState<string | null>(null)
  const [englandRegionsGeo, setEnglandRegionsGeo] = useState<FeatureCollection | null>(null)
  const [walesGeo, setWalesGeo] = useState<FeatureCollection | null>(null)
  const [scotlandConstituencies, setScotlandConstituencies] = useState<FeatureCollection | null>(null)
  const [scotlandRegions, setScotlandRegions] = useState<FeatureCollection | null>(null)
  const [scottishResults, setScottishResults] = useState<Map<string, ScottishResult>>(new Map())
  const [scottishPolls, setScottishPolls] = useState<ScottishPoll[]>([])
  const [scottishGeLookup, setScottishGeLookup] = useState<any>(null)
  const [spcToWpcLookup, setSpcToWpcLookup] = useState<any>(null)
  const [wpcLeaveLookup, setWpcLeaveLookup] = useState<any>(null)
  const [tenureLookup, setTenureLookup] = useState<any>(null)
  const [ageLookup, setAgeLookup] = useState<any>(null)
  const [degreeLookup, setDegreeLookup] = useState<any>(null)
  const [nssecLookup, setNssecLookup] = useState<any>(null)
  const [welshLookup, setWelshLookup] = useState<any>(null)
  const [welshGePcon, setWelshGePcon] = useState<any>(null)
  const [welshPolls, setWelshPolls] = useState<any[]>([])
  const [welshLeaveLookup, setWelshLeaveLookup] = useState<any>(null)
  const [welshAgeLookup, setWelshAgeLookup] = useState<any>(null)
  const [welshTenureLookup, setWelshTenureLookup] = useState<any>(null)
  const [welshNssecLookup, setWelshNssecLookup] = useState<any>(null)
  const [welshDegreeLookup, setWelshDegreeLookup] = useState<any>(null)
  const [welshRuralLookup, setWelshRuralLookup] = useState<any>(null)
  const [wardToSenedd, setWardToSenedd] = useState<any>(null)
  const [selectedScottishConstituency, setSelectedScottishConstituency] = useState<string | null>(null)
  const [selectedWelshConstituency, setSelectedWelshConstituency] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const assign =
      <T,>(setter: (value: T) => void, fallback?: T) =>
      (value: T) => {
        if (!cancelled) setter(value)
      }
    const assignError = <T,>(setter: (value: T) => void, fallback: T) => () => {
      if (!cancelled) setter(fallback)
    }

    const fetchEnglishAggregate = async (): Promise<AggregateRow | null> => {
      try {
        const data = await fetchJson<{ aggregates?: AggregateRow[] }>('/api/aggregate')
        if (data.aggregates?.[0]) {
          return data.aggregates[0]
        }
      } catch {}
      try {
        const data = await fetchJson<{ polls?: PollApiRow[] }>('/api/polls')
        const nationalPolls = (data.polls || []).filter(
          poll =>
            !poll.area ||
            String(poll.area).toLowerCase() === 'gb' ||
            String(poll.area).toLowerCase() === 'uk'
        )
        const computed = computeAggregate(
          nationalPolls.map(poll => ({
            pollDate: poll.poll_date,
            pollster: poll.pollster,
            sampleSize: poll.sample_size,
            labour: poll.labour,
            conservative: poll.conservative,
            reform: poll.reform,
            libdem: poll.libdem,
            green: poll.green,
            snp: poll.snp,
            pc: poll.pc,
            others: poll.others,
          })),
          new Date()
        )
        return {
          aggregate_date: new Date().toISOString(),
          labour: computed.labour,
          conservative: computed.conservative,
          reform: computed.reform,
          libdem: computed.libdem,
          green: computed.green,
          snp: computed.snp,
          pc: computed.pc,
          others: computed.others,
          lead_party: computed.leadParty,
          lead_value: computed.leadValue,
        }
      } catch {}
      try {
        const data = await fetchJson<{ baselineNational?: Record<string, number> }>('/data/baseline-national.json')
        const national = data?.baselineNational || {}
        return {
          aggregate_date: new Date().toISOString(),
          labour: Number(national.Labour || 0),
          conservative: Number(national.Conservative || 0),
          reform: Number(national.Reform || 0),
          libdem: Number(national['Liberal Democrat'] || 0),
          green: Number(national.Green || 0),
          snp: Number(national.SNP || 0),
          pc: Number(national['Plaid Cymru'] || 0),
          others: Number(national.Other || 0),
          lead_party: null,
          lead_value: null,
        }
      } catch {
        return null
      }
    }

    const fetchWalesGeo = async () => {
      try {
        const remote = await fetch(
          'https://datamap.gov.wales/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typename=geonode:senedd_final_2026&outputFormat=application/json&srsName=EPSG:4326'
        )
        if (!remote.ok) throw new Error('remote wales geo failed')
        const data = await remote.json()
        if (!cancelled) setWalesGeo(data)
        return
      } catch {}
      try {
        const local = await fetchJson<FeatureCollection>('/data/wales-constituencies-2026.geojson')
        if (!cancelled) setWalesGeo(local)
      } catch {
        if (!cancelled) setWalesGeo(null)
      }
    }

    fetchJson<FeatureCollection>('/data/uk-countries-2022.geojson').then(assign(setCountriesGeo))
    fetchJson<FeatureCollection>('/data/lads.geojson').then(assign(setLadsGeo))
    fetchJson<FeatureCollection>('/data/counties.geojson').then(assign(setCountiesGeo))
    fetchJson<FeatureCollection>('/data/ced.geojson').then(assign(setCedGeo))
    fetchJson<FeatureCollection>('/data/wards.geojson').then(assign(setWardGeo)).catch(assignError(setWardGeo, null))
    fetchJson<FeatureCollection>('/data/surrey-unitaries-overlay.geojson').then(assign(setSurreyOverlay)).catch(assignError(setSurreyOverlay, null))
    fetchJson<FeatureCollection>('/data/surrey-unitaries-boundary.geojson').then(assign(setSurreyBoundary)).catch(assignError(setSurreyBoundary, null))
    fetchJson<BaselineData>('/data/ward-baseline.json').then(assign(setBaseline))
    fetchJson<RegionLookup>('/data/lad-region.json').then(assign(setRegionLookup))
    fetchJson<WardVacancyLookup>('/data/ward-vacancies.json').then(assign(setWardVacancyLookup)).catch(assignError(setWardVacancyLookup, null))
    fetchJson<WardToPconLookup>('/data/ward-to-pcon.json').then(assign(setWardToPcon)).catch(assignError(setWardToPcon, null))
    fetchJson<CedToPconLookup>('/data/ced-to-pcon.json').then(assign(setCedToPcon)).catch(assignError(setCedToPcon, null))
    fetchJson<CouncilSeatData>('/data/council-seats.json').then(assign(setCouncilSeats)).catch(assignError(setCouncilSeats, null))
    fetchJson<CouncilPreviousData>('/data/council-previous.json').then(assign(setCouncilPrevious)).catch(assignError(setCouncilPrevious, null))
    fetchEnglishAggregate().then(value => {
      if (!cancelled) setEnglishAggregate(value)
    })
    fetchJson<FeatureCollection>('/data/england-regions.geojson').then(assign(setEnglandRegionsGeo))
    void fetchWalesGeo()
    fetchJson<FeatureCollection>('/data/scotland-constituencies.geojson').then(assign(setScotlandConstituencies))
    fetchJson<FeatureCollection>('/data/scotland-regions.geojson').then(assign(setScotlandRegions))
    fetchJson<any>('/api/scottish-constituency-results')
      .then(data => {
        if (cancelled) return
        const map = new Map<string, ScottishResult>()
        ;(data.results ?? []).forEach((row: any) => {
          const value = {
            previousWinner2021: row.winner2021 ?? null,
            region: row.region ?? '',
            baselineSource: 'api' as const,
            shares: row.shares ?? {},
          }
          map.set(row.constituency, value)
          map.set(normalizeScottishConstituencyName(row.constituency), value)
        })
        Object.entries(SCOTTISH_CONSTITUENCY_BASELINE_FALLBACKS).forEach(([fallbackName, fallbackResult]) => {
          const normalizedName = normalizeScottishConstituencyName(fallbackName)
          if (!map.has(fallbackName)) map.set(fallbackName, fallbackResult)
          if (!map.has(normalizedName)) map.set(normalizedName, fallbackResult)
        })
        setScottishResults(map)
      })
      .catch(assignError(setScottishResults, new Map()))
    fetchJson<{ constituencyPolls?: any[] }>('/api/scottish-polls')
      .then(data => { if (!cancelled) setScottishPolls(data.constituencyPolls ?? []) })
      .catch(assignError(setScottishPolls, []))
    fetchJson<any>('/data/spc-to-wpc-lookup.json').then(assign(setSpcToWpcLookup))
    fetchJson<any>('/data/scotland-wpc-leave-share.json').then(assign(setWpcLeaveLookup))
    fetchJson<any>('/data/scotland-tenure-share.json').then(assign(setTenureLookup))
    fetchJson<any>('/data/scotland-age-share.json').then(assign(setAgeLookup))
    fetchJson<any>('/data/scotland-degree-share.json').then(assign(setDegreeLookup))
    fetchJson<any>('/data/scotland-nssec-share.json').then(assign(setNssecLookup))

    fetchJson<any>('/data/senedd-to-wpc-lookup.json').then(assign(setWelshLookup))
    fetchJson<{ polls?: any[] }>('/api/welsh-polls')
      .then(data => { if (!cancelled) setWelshPolls(data.polls ?? []) })
      .catch(assignError(setWelshPolls, []))
    fetchJson<any>('/data/ward-to-senedd.json').then(assign(setWardToSenedd))
    fetchJson<any>('/data/ge2024-pcon.json')
      .then(data => {
        if (cancelled) return
        setEnglishGeLookup(data)
        setScottishGeLookup(data)
        setWelshGePcon(data)
      })
      .catch(() => {
        if (cancelled) return
        setEnglishGeLookup(null)
        setScottishGeLookup(null)
        setWelshGePcon(null)
      })
    fetchJson<LeaveShareLookup>('/data/leave-share.json')
      .then(data => {
        if (cancelled) return
        setLeaveLookup(data)
        setWelshLeaveLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setLeaveLookup(null)
        setWelshLeaveLookup(null)
      })
    fetchJson<AgeShareLookup>('/data/age-share.json')
      .then(data => {
        if (cancelled) return
        setAgeLookupEnglish(data)
        setWelshAgeLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setAgeLookupEnglish(null)
        setWelshAgeLookup(null)
      })
    fetchJson<LookupWithWardNames<NssecShare>>('/data/nssec-share.json')
      .then(data => {
        if (cancelled) return
        setNssecLookupEnglish(data)
        setWelshNssecLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setNssecLookupEnglish(null)
        setWelshNssecLookup(null)
      })
    fetchJson<LookupWithWardNames<DegreeShare>>('/data/degree-share.json')
      .then(data => {
        if (cancelled) return
        setDegreeLookupEnglish(data)
        setWelshDegreeLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setDegreeLookupEnglish(null)
        setWelshDegreeLookup(null)
      })
    fetchJson<LookupWithWardNames<TenureShare>>('/data/tenure-share.json')
      .then(data => {
        if (cancelled) return
        setTenureLookupEnglish(data)
        setWelshTenureLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setTenureLookupEnglish(null)
        setWelshTenureLookup(null)
      })
    fetchJson<LookupWithWardNames<RuralUrbanShare>>('/data/rural-urban-share.json')
      .then(data => {
        if (cancelled) return
        setRuralLookupEnglish(data)
        setWelshRuralLookup(data)
      })
      .catch(() => {
        if (cancelled) return
        setRuralLookupEnglish(null)
        setWelshRuralLookup(null)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedLayers.has('english-local') && selectedEnglishCouncil) {
      setSelectedEnglishCouncil(null)
    }
  }, [selectedLayers, selectedEnglishCouncil])

  useEffect(() => {
    setSelectedEnglishCouncil(null)
    setSelectedScottishConstituency(null)
    setSelectedWelshConstituency(null)
  }, [focusResetToken])

  const englishGeo = useMemo(() => {
    const features = [...(countiesGeo?.features || []), ...(ladsGeo?.features || [])]
    if (!features.length) return null
    return {
      type: 'FeatureCollection',
      features: features.filter(feature => {
        const props: any = feature.properties || {}
        const code = props.reference || props.LAD25CD || props.LAD23CD
        const name = props.name || props.LAD25NM || props.LAD23NM || ''
        if (!String(code || '').startsWith('E')) return false
        const normalized = normalizeName(name)
        const isEligible =
          COUNTY_ELECTIONS_2026.has(normalized) ||
          ELECTION_LADS_2026.has(normalized) ||
          LONDON_BOROUGHS.has(normalized) ||
          METRO_BOROUGHS.has(normalized) ||
          UNITARY_AUTHORITIES.has(normalized)
        if (!isEligible) return false
        return visibleCouncilTypes.has(classifyCouncil(name))
      }),
    } as FeatureCollection
  }, [countiesGeo, ladsGeo, visibleCouncilTypes])

  const syntheticCouncilOverlay = useMemo(() => {
    const features = [...(surreyOverlay?.features || [])]
    return features.length ? ({ type: 'FeatureCollection', features } as FeatureCollection) : null
  }, [surreyOverlay])

  const eligibleLads = useMemo(() => {
    const eligible = new Set<string>()
    ;(englishGeo?.features || []).forEach(feature => {
      const code: any = feature.properties?.reference
      if (code) eligible.add(String(code))
    })
    eligible.add('surrey-east')
    eligible.add('surrey-west')
    eligible.add('E07000245')
    return eligible
  }, [englishGeo])

  const ladCategoryByCode = useMemo(() => {
    const mapping = new Map<string, CouncilCategory>()
    ;(englishGeo?.features || []).forEach(feature => {
      const code = feature.properties?.reference
      const name = feature.properties?.name
      if (!code) return
      mapping.set(String(code), classifyCouncil(String(name || '')))
    })
    return mapping
  }, [englishGeo])

  const selectedEnglishFeature = useMemo(() => {
    if (!selectedEnglishCouncil) return null
    if (selectedEnglishCouncil === 'surrey-east' || selectedEnglishCouncil === 'surrey-west' || selectedEnglishCouncil === 'E07000245') {
      return syntheticCouncilOverlay?.features.find(feature => feature.properties?.reference === selectedEnglishCouncil) || null
    }
    return englishGeo?.features.find(feature => feature.properties?.reference === selectedEnglishCouncil) || null
  }, [selectedEnglishCouncil, syntheticCouncilOverlay, englishGeo])

  const isCountySelection = useMemo(() => {
    if (!selectedEnglishCouncil || !selectedEnglishFeature) return false
    if (selectedEnglishCouncil === 'surrey-east' || selectedEnglishCouncil === 'surrey-west') return true
    return COUNTY_ELECTIONS_2026.has(normalizeName(selectedEnglishFeature.properties?.name))
  }, [selectedEnglishCouncil, selectedEnglishFeature])

  const getNssecBaseline = () =>
    (nssecLookupEnglish?.meta?.baseline || { higher: 0.33, intermediate: 0.33, lower: 0.34 }) as NssecBaseline
  const getDegreeBaseline = () =>
    (degreeLookupEnglish?.meta?.baseline || { degree: 0.4, noDegree: 0.6 }) as DegreeBaseline
  const getTenureBaseline = () =>
    (tenureLookupEnglish?.meta?.baseline || {
      ownedOutright: 0.32831847091249194,
      ownsWithMortgage: 0.297073553740984,
      socialRented: 0.1705895998333387,
      privateRented: 0.20401837551318536,
    }) as TenureBaseline
  const getRuralUrbanBaseline = () =>
    (ruralLookupEnglish?.meta?.baseline || {
      conurbation: 0.3663336976668199,
      cityTown: 0.45521235562383135,
      ruralTownFringe: 0.09743014933962564,
      ruralVillageHamlet: 0.08102379736972319,
    }) as RuralUrbanBaseline
  const leaveStrength = LEAVE_EFFECT_STRENGTH
  const ageStrength = AGE_EFFECT_STRENGTH
  const regionStrength = REGION_EFFECT_STRENGTH
  const nssecStrength = NSSEC_EFFECT_STRENGTH
  const degreeStrength = DEGREE_EFFECT_STRENGTH
  const tenureStrength = TENURE_EFFECT_STRENGTH
  const ruralUrbanStrength = RURAL_URBAN_EFFECT_STRENGTH
  const geReformWeight = GE_WEIGHT_REFORM
  const geGreenWeight = GE_WEIGHT_GREEN
  const geMajorWeight = GE_WEIGHT_MAJOR

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
  ): {
    share: { age18_35: number; age35_55: number; age55_plus: number }
    source: 'ward' | 'ward-name' | 'lad' | 'national'
  } => {
    const wardShare = ageLookupEnglish?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = ageLookupEnglish?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = ageLookupEnglish?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = ageLookupEnglish?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = ageLookupEnglish?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: AGE_BASELINE, source: 'national' }
  }

  const getRegionForWard = (ladCode: string) => {
    const entry = regionLookup?.lads?.[ladCode]
    if (entry?.regionName) return entry.regionName
    if (COUNTY_REGION_LOOKUP[ladCode]) return COUNTY_REGION_LOOKUP[ladCode]
    return null
  }

  const getNssecShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: NssecShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = nssecLookupEnglish?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = nssecLookupEnglish?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = nssecLookupEnglish?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = nssecLookupEnglish?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = nssecLookupEnglish?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getNssecBaseline(), source: 'national' }
  }

  const getDegreeShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: DegreeShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = degreeLookupEnglish?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = degreeLookupEnglish?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = degreeLookupEnglish?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = degreeLookupEnglish?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = degreeLookupEnglish?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getDegreeBaseline(), source: 'national' }
  }

  const getTenureShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: TenureShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = tenureLookupEnglish?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = tenureLookupEnglish?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = tenureLookupEnglish?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = tenureLookupEnglish?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = tenureLookupEnglish?.lads?.[ladCode]
    if (ladShare) return { share: ladShare, source: 'lad' }
    return { share: getTenureBaseline(), source: 'national' }
  }

  const getRuralUrbanShareForWard = (
    wardCode: string,
    ladCode: string,
    wardName?: string,
    ladName?: string
  ): { share: RuralUrbanShare; source: 'ward' | 'ward-name' | 'lad' | 'national' } => {
    const wardShare = ruralLookupEnglish?.wards?.[wardCode]
    if (wardShare) return { share: wardShare, source: 'ward' }
    if (wardName && ladName) {
      const key = `${normalizeName(ladName)}|${normalizeName(wardName)}`
      const nameShare = ruralLookupEnglish?.wardNames?.[key]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
    }
    if (wardName) {
      const nameKey = normalizeName(wardName)
      const nameShare = ruralLookupEnglish?.wardNamesOnly?.[nameKey]
      if (nameShare) return { share: nameShare, source: 'ward-name' }
      const aggressiveShare = ruralLookupEnglish?.wardNamesAggressive?.[nameKey]
      if (aggressiveShare) return { share: aggressiveShare, source: 'ward-name' }
    }
    const ladShare = ruralLookupEnglish?.lads?.[ladCode]
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

  const selectedBaselineWards = useMemo(() => {
    if (!selectedEnglishCouncil || !baseline) return []
    if (selectedEnglishCouncil === 'surrey-east') {
      return baseline.wards.filter(ward => ward.ladCode === 'E10000030' && SURREY_EAST_DIVISIONS.has(ward.wardCode))
    }
    if (selectedEnglishCouncil === 'surrey-west') {
      return baseline.wards.filter(ward => ward.ladCode === 'E10000030' && SURREY_WEST_DIVISIONS.has(ward.wardCode))
    }
    return baseline.wards.filter(ward => ward.ladCode === selectedEnglishCouncil)
  }, [selectedEnglishCouncil, baseline])

  const wardMap = useMemo(() => {
    if (!baseline || !englishAggregate) return new Map<string, any>()
    const ladBaselineMap = new Map<
      string,
      { totalVotes: number; national: Record<string, number>; local: Record<string, number> }
    >()
    baseline.wards.forEach(ward => {
      const entry = ladBaselineMap.get(ward.ladCode) || { totalVotes: 0, national: {}, local: {} }
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
            Object.entries(ladBaseline.national).map(([party, value]) => [party, value / ladBaseline.totalVotes])
          )
          const local = Object.fromEntries(
            Object.entries(ladBaseline.local).map(([party, value]) => [party, value / ladBaseline.totalVotes])
          )
          adjustedWard = { ...ward, nationalShares: national, localShares: local }
        }
      }
      const geWeights = { reform: geReformWeight, green: geGreenWeight, major: geMajorWeight }
      const wardNameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      const pconCode =
        wardToPcon?.wards?.[ward.wardCode] ||
        wardToPcon?.wardNames?.[wardNameKey] ||
        cedToPcon?.ceds?.[ward.wardCode] ||
        cedToPcon?.cedNames?.[wardNameKey]
      const geShares = pconCode ? englishGeLookup?.pcon?.[pconCode] : null
      if (geShares) {
        const blendedNational = { ...adjustedWard.nationalShares }
        ;['Labour', 'Conservative', 'Reform', 'Liberal Democrat', 'Green', 'SNP', 'Plaid Cymru'].forEach(party => {
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
      const ageShare = getAgeShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
      const regionName = getRegionForWard(ward.ladCode)
      const nssecShare = getNssecShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
      const degreeShare = getDegreeShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
      const tenureShare = getTenureShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
      const ruralUrbanShare = getRuralUrbanShareForWard(ward.wardCode, ward.ladCode, ward.wardName, ward.ladName)
      const ageStrengthEffective = ageShare.source === 'lad' ? Math.min(ageStrength, 0.6) : ageStrength
      const nssecStrengthEffective = nssecShare.source === 'lad' ? Math.min(nssecStrength, 0.6) : nssecStrength
      const degreeStrengthEffective = degreeShare.source === 'lad' ? Math.min(degreeStrength, 0.6) : degreeStrength
      const tenureStrengthEffective = tenureShare.source === 'lad' ? Math.min(tenureStrength, 0.6) : tenureStrength
      const ruralUrbanStrengthEffective =
        ruralUrbanShare.source === 'lad' ? Math.min(ruralUrbanStrength, 0.6) : ruralUrbanStrength
      const projection = computeWardProjection(
        adjustedWard,
        getBaselineNationalForYear(baseline, adjustedWard.lastYear),
        englishAggregate,
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
        leaveStrength,
        ageStrengthEffective,
        regionStrength,
        nssecStrengthEffective,
        degreeStrengthEffective,
        tenureStrengthEffective,
        ruralUrbanStrengthEffective
      )
      const previousShares: Record<string, number> = {
        ...adjustedWard.nationalShares,
        ...adjustedWard.localShares,
      }
      const incumbentKey = `${normalizeCouncilName(ward.ladName)}|${normalizeName(ward.wardName)}`
      let prevWinner: string | null = null
      prevWinner = wardIncumbentLookup.get(incumbentKey) || null
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
    englishAggregate,
    leaveLookup,
    ageLookupEnglish,
    regionLookup,
    nssecLookupEnglish,
    degreeLookupEnglish,
    tenureLookupEnglish,
    ruralLookupEnglish,
    wardToPcon,
    cedToPcon,
    englishGeLookup,
    geReformWeight,
    geGreenWeight,
    geMajorWeight,
    leaveStrength,
    ageStrength,
    regionStrength,
    nssecStrength,
    degreeStrength,
    tenureStrength,
    ruralUrbanStrength,
    wardIncumbentLookup,
  ])

  const wardMapByName = useMemo(() => {
    const map = new Map<string, any>()
    if (!baseline) return map
    baseline.wards.forEach(ward => {
      const key = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      const projection = wardMap.get(ward.wardCode)
      if (projection && !map.has(key)) map.set(key, projection)
    })
    return map
  }, [baseline, wardMap])

  const wardMapByWardName = useMemo(() => {
    if (!baseline || !englishAggregate || !selectedEnglishCouncil) return new Map<string, any>()
    const map = new Map<string, any>()
    selectedBaselineWards.forEach(ward => {
      const key = normalizeName(ward.wardName)
      if (map.has(key)) return
      const projection = wardMap.get(ward.wardCode)
      if (!projection) return
      map.set(key, projection)
    })
    return map
  }, [baseline, englishAggregate, selectedEnglishCouncil, wardMap, selectedBaselineWards])

  const ladFallbackProjection = useMemo(() => {
    if (!baseline || !englishAggregate || !selectedEnglishCouncil) return null
    const wards = selectedBaselineWards
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
  }, [baseline, englishAggregate, selectedEnglishCouncil, wardMap, wardMapByWardName, selectedBaselineWards])

  const wardVacancies = useMemo(() => {
    if (!baseline || !selectedEnglishCouncil) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = selectedBaselineWards
    const councilName =
      selectedEnglishCouncil === 'surrey-east'
        ? 'East Surrey'
        : selectedEnglishCouncil === 'surrey-west'
          ? 'West Surrey'
          : wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    wards.forEach(ward => {
      const seatsThisCycle = getSeatsPerWardForPopup(wards, seatRow, ward, wardVacancyLookup)
      map.set(ward.wardCode, seatsThisCycle)
    })
    return map
  }, [baseline, selectedEnglishCouncil, councilSeats, selectedBaselineWards, wardVacancyLookup])

  const wardVacanciesByName = useMemo(() => {
    if (!baseline || !selectedEnglishCouncil) return new Map<string, number>()
    const map = new Map<string, number>()
    const wards = selectedBaselineWards
    const councilName =
      selectedEnglishCouncil === 'surrey-east'
        ? 'East Surrey'
        : selectedEnglishCouncil === 'surrey-west'
          ? 'West Surrey'
          : wards[0]?.ladName || null
    const seatRow = councilName
      ? councilSeats?.councils?.find(
          row => normalizeCouncilName(row.council) === normalizeCouncilName(councilName)
        )
      : null
    wards.forEach(ward => {
      const seatsThisCycle = getSeatsPerWardForPopup(wards, seatRow, ward, wardVacancyLookup)
      map.set(`${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`, seatsThisCycle)
    })
    return map
  }, [baseline, selectedEnglishCouncil, councilSeats, selectedBaselineWards, wardVacancyLookup])

  const contestedWardKeys = useMemo(() => {
    const empty = { codes: new Set<string>(), names: new Set<string>() }
    if (!baseline || !selectedEnglishCouncil || !councilSeats?.councils?.length) return empty
    const allWards = selectedBaselineWards
    if (!allWards.length) return empty
    const councilName =
      selectedEnglishCouncil === 'surrey-east'
        ? 'East Surrey'
        : selectedEnglishCouncil === 'surrey-west'
          ? 'West Surrey'
          : allWards[0]?.ladName || ''
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
      Math.abs(incumbentMatchedWards.length - seatsUp) <=
        Math.abs(inferredContestedSeats - seatsUp)

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
  }, [baseline, selectedEnglishCouncil, councilSeats, councilPrevious, selectedBaselineWards])

  const selectedBaselineWardByCode = useMemo(() => {
    const map = new Map<string, WardBaseline>()
    selectedBaselineWards.forEach(ward => {
      if (ward.wardCode && !map.has(ward.wardCode)) map.set(ward.wardCode, ward)
    })
    return map
  }, [selectedBaselineWards])

  const selectedBaselineWardByNameKey = useMemo(() => {
    const map = new Map<string, WardBaseline>()
    selectedBaselineWards.forEach(ward => {
      const key = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
      if (key && !map.has(key)) map.set(key, ward)
    })
    return map
  }, [selectedBaselineWards])

  const selectedBaselineWardByName = useMemo(() => {
    const map = new Map<string, WardBaseline>()
    selectedBaselineWards.forEach(ward => {
      const key = normalizeName(ward.wardName).replace(/\s+ed$/i, '')
      if (key && !map.has(key)) map.set(key, ward)
    })
    return map
  }, [selectedBaselineWards])

  const wardFeatures = useMemo(() => {
    if (!selectedEnglishCouncil || !baseline) return []
    const activeGeo = isCountySelection ? cedGeo : wardGeo
    if (!activeGeo) return []
    const wardCodes = new Set(selectedBaselineWards.map(ward => ward.wardCode))
    const wardNameKeys = new Set(
      selectedBaselineWards.map(ward => `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`)
    )
    const wardNames = new Set(selectedBaselineWards.map(ward => normalizeName(ward.wardName)))
    return activeGeo.features.filter(feature => {
      const code = getGeoWardCode(feature)
      if (code && wardCodes.has(code)) return true
      const nameKey = getGeoWardNameKey(feature)
      if (nameKey && wardNameKeys.has(nameKey)) return true
      return wardNames.has(normalizeName(getGeoWardName(feature).replace(/\s+ed$/i, '')))
    })
  }, [selectedEnglishCouncil, baseline, isCountySelection, cedGeo, wardGeo, selectedBaselineWards])

  const spcCodeByName = useMemo(() => {
    const map = new Map<string, string>()
    ;(scotlandConstituencies?.features || []).forEach(feature => {
      const props: any = feature.properties || {}
      if (props.SPC22NM && props.SPC22CD) map.set(normalizeScottishConstituencyName(props.SPC22NM), props.SPC22CD)
    })
    return map
  }, [scotlandConstituencies])

  const spcToWpcByName = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    ;(spcToWpcLookup?.results ?? []).forEach((row: any) => {
      if (!row?.primaryWpcCode) return
      map.set(normalizeScottishConstituencyName(row.spcName), {
        code: row.primaryWpcCode,
        name: row.primaryWpcName || '',
      })
    })
    return map
  }, [spcToWpcLookup])

  const scottishAggregate = useMemo(() => {
    if (!scottishPolls.length) return null
    const totals = { snp: 0, conservative: 0, labour: 0, libdem: 0, green: 0, reform: 0, other: 0 }
    const weights = { ...totals }
    const add = (key: keyof typeof totals, value: number | null, weight: number) => {
      if (value == null) return
      totals[key] += value * weight
      weights[key] += weight
    }
    scottishPolls.forEach(poll => {
      const weight = computeScottishPollWeight(poll)
      add('snp', poll.snp, weight)
      add('conservative', poll.conservative, weight)
      add('labour', poll.labour, weight)
      add('libdem', poll.libdem, weight)
      add('green', poll.green, weight)
      add('reform', poll.reform, weight)
      add('other', poll.others, weight)
    })
    return {
      snp: weights.snp ? totals.snp / weights.snp : BASELINE_2021_CONSTITUENCY.snp,
      conservative: weights.conservative ? totals.conservative / weights.conservative : BASELINE_2021_CONSTITUENCY.conservative,
      labour: weights.labour ? totals.labour / weights.labour : BASELINE_2021_CONSTITUENCY.labour,
      libdem: weights.libdem ? totals.libdem / weights.libdem : BASELINE_2021_CONSTITUENCY.libdem,
      green: weights.green ? totals.green / weights.green : BASELINE_2021_CONSTITUENCY.green,
      reform: weights.reform ? totals.reform / weights.reform : SCOTLAND_GE2024_REFORM_BASELINE,
      other: weights.other ? totals.other / weights.other : BASELINE_2021_CONSTITUENCY.other,
    }
  }, [scottishPolls])

  const scottishProjected = useMemo(() => {
    if (!scottishAggregate) return scottishResults
    const tenureBaseline: ScotlandTenureShare = tenureLookup?.meta?.baseline || { owned: 0, socialRented: 0, privateRented: 0 }
    const ageBaseline: ScotlandAgeShare = ageLookup?.meta?.baseline || { age16_34: 0, age35_54: 0, age55_plus: 0 }
    const degreeBaseline: ScotlandDegreeShare = degreeLookup?.meta?.baseline || { degree: 0, noDegree: 0 }
    const nssecBaseline: ScotlandNssecShare = nssecLookup?.meta?.baseline || { higher: 0, intermediate: 0, lower: 0 }
    const deltas = {
      snp: scottishAggregate.snp - BASELINE_2021_CONSTITUENCY.snp,
      conservative: scottishAggregate.conservative - BASELINE_2021_CONSTITUENCY.conservative,
      labour: scottishAggregate.labour - BASELINE_2021_CONSTITUENCY.labour,
      libdem: scottishAggregate.libdem - BASELINE_2021_CONSTITUENCY.libdem,
      green: scottishAggregate.green - BASELINE_2021_CONSTITUENCY.green,
      reform: scottishAggregate.reform - SCOTLAND_GE2024_REFORM_BASELINE,
      other: scottishAggregate.other - BASELINE_2021_CONSTITUENCY.other,
    }
    const map = new Map(scottishResults)
    for (const [name, result] of map.entries()) {
      const normalizedName = normalizeScottishConstituencyName(name)
      const wpcInfo = spcToWpcByName.get(normalizedName)
      const wpcCode = wpcInfo?.code
      const wpcName = wpcInfo?.name
      const geShares = wpcCode ? scottishGeLookup?.pcon?.[wpcCode] : null
      const wpcLeaveByCode = wpcCode ? wpcLeaveLookup?.byCode?.[wpcCode] : null
      const wpcLeaveByName = wpcName ? wpcLeaveLookup?.byName?.[normalizeWestminsterName(wpcName)] : null
      const leaveShare = wpcLeaveByCode?.leaveShare ?? wpcLeaveByName?.leaveShare ?? null
      const spcCode = spcCodeByName.get(normalizedName)
      const tenureShare = (spcCode && tenureLookup?.constituencies?.[spcCode]) || tenureBaseline
      const ageShare = (spcCode && ageLookup?.constituencies?.[spcCode]) || ageBaseline
      const degreeShare = (spcCode && degreeLookup?.constituencies?.[spcCode]) || degreeBaseline
      const nssecShare = (spcCode && nssecLookup?.constituencies?.[spcCode]) || nssecBaseline
      const regionAdjustments = SCOTLAND_REGION_DELTAS[normalizeScotlandRegion(result.region)] || {}
      const adjustedLeaveShare = clampLeaveShare(typeof leaveShare === 'number' ? leaveShare : SCOTLAND_NATIONAL_LEAVE_SHARE)
      const baseShares = {
        snp: result.shares.snp ?? 0,
        conservative: result.shares.conservative ?? 0,
        labour: result.shares.labour ?? 0,
        libdem: result.shares.libdem ?? 0,
        green: result.shares.green ?? 0,
        reform: result.shares.reform ?? 0,
        other: result.shares.other ?? 0,
      }
      const blendedBase = {
        snp: geShares?.SNP != null ? blendShare(baseShares.snp, geShares.SNP, GE_BLEND_OTHER) : baseShares.snp,
        conservative: geShares?.Conservative != null ? blendShare(baseShares.conservative, geShares.Conservative, GE_BLEND_OTHER) : baseShares.conservative,
        labour: geShares?.Labour != null ? blendShare(baseShares.labour, geShares.Labour, GE_BLEND_OTHER) : baseShares.labour,
        libdem: geShares?.['Liberal Democrat'] != null ? blendShare(baseShares.libdem, geShares['Liberal Democrat'], GE_BLEND_OTHER) : baseShares.libdem,
        green: geShares?.Green != null ? blendShare(baseShares.green, geShares.Green, GE_BLEND_OTHER) : baseShares.green,
        reform: baseShares.reform === 0
          ? (() => {
              const numeric = Number(geShares?.Reform)
              return Number.isFinite(numeric) && numeric !== 0 ? numeric - SCOTLAND_GE2024_REFORM_BASELINE : 0
            })()
          : geShares?.Reform != null
            ? blendShare(baseShares.reform, geShares.Reform, GE_BLEND_OTHER)
            : baseShares.reform,
        other: baseShares.other,
      }
      const swingApplied = {
        snp: blendedBase.snp + deltas.snp,
        conservative: blendedBase.conservative + deltas.conservative,
        labour: blendedBase.labour + deltas.labour,
        libdem: blendedBase.libdem + deltas.libdem,
        green: blendedBase.green + deltas.green,
        reform: blendedBase.reform + deltas.reform,
        other: blendedBase.other + deltas.other,
      }
      const projectedRaw = {
        snp: Math.max(0, swingApplied.snp + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('SNP', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('SNP', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('SNP', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('SNP', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('SNP', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments.SNP ?? 0)),
        conservative: Math.max(0, swingApplied.conservative + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('Conservative', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('Conservative', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('Conservative', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('Conservative', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('Conservative', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments.Conservative ?? 0)),
        labour: Math.max(0, swingApplied.labour + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('Labour', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('Labour', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('Labour', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('Labour', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('Labour', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments.Labour ?? 0)),
        libdem: Math.max(0, swingApplied.libdem + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('Liberal Democrat', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('Liberal Democrat', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('Liberal Democrat', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('Liberal Democrat', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('Liberal Democrat', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments['Liberal Democrat'] ?? 0)),
        green: Math.max(0, swingApplied.green + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('Green', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('Green', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('Green', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('Green', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('Green', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments.Green ?? 0)),
        reform: Math.max(0, swingApplied.reform + SCOTLAND_TENURE_EFFECT_STRENGTH * getScottishTenureAdjustment('Reform', tenureShare, tenureBaseline) + SCOTLAND_AGE_EFFECT_STRENGTH * getScottishAgeAdjustment('Reform', ageShare, ageBaseline) + SCOTLAND_DEGREE_EFFECT_STRENGTH * getScottishDegreeAdjustment('Reform', degreeShare, degreeBaseline) + SCOTLAND_NSSEC_EFFECT_STRENGTH * getScottishNssecAdjustment('Reform', nssecShare, nssecBaseline) + SCOTLAND_LEAVE_EFFECT_STRENGTH * getCenteredScottishPartyLeaveAdjustment('Reform', adjustedLeaveShare) + SCOTLAND_REGION_EFFECT_STRENGTH * (regionAdjustments.Reform ?? 0)),
        other: Math.max(0, swingApplied.other),
      }
      const total = Object.values(projectedRaw).reduce((sum, value) => sum + value, 0) || 1
      const projected = {
        snp: (projectedRaw.snp / total) * 100,
        conservative: (projectedRaw.conservative / total) * 100,
        labour: (projectedRaw.labour / total) * 100,
        libdem: (projectedRaw.libdem / total) * 100,
        green: (projectedRaw.green / total) * 100,
        reform: (projectedRaw.reform / total) * 100,
        other: (projectedRaw.other / total) * 100,
      }
      const projectedWinnerKey = Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      const projectedWinner =
        projectedWinnerKey === 'snp' ? 'SNP' :
        projectedWinnerKey === 'conservative' ? 'Conservative' :
        projectedWinnerKey === 'labour' ? 'Labour' :
        projectedWinnerKey === 'libdem' ? 'Liberal Democrat' :
        projectedWinnerKey === 'green' ? 'Green' :
        projectedWinnerKey === 'reform' ? 'Reform' :
        'Other'
      map.set(name, { ...result, projected, projectedWinner })
    }
    return map
  }, [scottishAggregate, scottishResults, spcToWpcByName, scottishGeLookup, wpcLeaveLookup, spcCodeByName, tenureLookup, ageLookup, degreeLookup, nssecLookup])

  const scottishPreviousSeatCounts = useMemo(() => {
    const counts: Record<string, number> = {
      SNP: 0,
      Conservative: 0,
      Labour: 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
      Other: 0,
      Unknown: 0,
    }
    if (!scotlandConstituencies) return counts
    scotlandConstituencies.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const result =
        scottishProjected.get(name) ||
        scottishProjected.get(normalizeScottishConstituencyName(name))
      const prevWinner = result?.previousWinner2021 || 'Unknown'
      counts[prevWinner] = (counts[prevWinner] || 0) + 1
    })
    return counts
  }, [scotlandConstituencies, scottishProjected])

  const scottishProjectedSeatCounts = useMemo(() => {
    const counts: Record<string, number> = {
      SNP: 0,
      Conservative: 0,
      Labour: 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
      Other: 0,
      Unknown: 0,
    }
    if (!scotlandConstituencies) return counts
    scotlandConstituencies.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const result =
        scottishProjected.get(name) ||
        scottishProjected.get(normalizeScottishConstituencyName(name))
      const winner = result?.projectedWinner || 'Unknown'
      counts[winner] = (counts[winner] || 0) + 1
    })
    return counts
  }, [scotlandConstituencies, scottishProjected])

  const scottishSeatSummary = useMemo(() => {
    return Object.keys(scottishProjectedSeatCounts)
      .map(party => ({
        party,
        seats: scottishProjectedSeatCounts[party] || 0,
        delta: (scottishProjectedSeatCounts[party] || 0) - (scottishPreviousSeatCounts[party] || 0),
      }))
      .filter(item => item.seats > 0 || item.delta !== 0)
      .sort((a, b) => b.seats - a.seats)
  }, [scottishProjectedSeatCounts, scottishPreviousSeatCounts])

  const welshProjected = useMemo(() => {
    if (!welshLookup?.results || !welshGePcon?.pcon) return new Map<string, WelshProjection>()
    const totals: Record<string, number> = { Labour: 0, Conservative: 0, 'Plaid Cymru': 0, 'Liberal Democrat': 0, Green: 0, Reform: 0, Other: 0 }
    const weights = { ...totals }
    const add = (key: keyof typeof totals, value: number | null, weight: number) => {
      if (value == null) return
      totals[key] += value * weight
      weights[key] += weight
    }
    welshPolls.forEach(poll => {
      const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
      const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
      const recency = ageDays < 10 ? 1 : ageDays < 20 ? 0.75 : ageDays < 40 ? 0.5 : ageDays < 60 ? 0.25 : 0.1
      const weight = recency * computePollsterWeight(poll.pollster) * computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
      add('Labour', poll.labour, weight)
      add('Conservative', poll.conservative, weight)
      add('Plaid Cymru', poll.pc, weight)
      add('Liberal Democrat', poll.libdem, weight)
      add('Green', poll.green, weight)
      add('Reform', poll.reform, weight)
      add('Other', poll.others, weight)
    })
    const baselineNational = { Labour: 37, 'Plaid Cymru': 14.8, 'Liberal Democrat': 6.5, Conservative: 18.2, Reform: 16.9, Green: 4.7, Other: 1.9 }
    const aggregate = {
      Labour: weights.Labour ? totals.Labour / weights.Labour : baselineNational.Labour,
      Conservative: weights.Conservative ? totals.Conservative / weights.Conservative : baselineNational.Conservative,
      'Plaid Cymru': weights['Plaid Cymru'] ? totals['Plaid Cymru'] / weights['Plaid Cymru'] : baselineNational['Plaid Cymru'],
      'Liberal Democrat': weights['Liberal Democrat'] ? totals['Liberal Democrat'] / weights['Liberal Democrat'] : baselineNational['Liberal Democrat'],
      Green: weights.Green ? totals.Green / weights.Green : baselineNational.Green,
      Reform: weights.Reform ? totals.Reform / weights.Reform : baselineNational.Reform,
      Other: weights.Other ? totals.Other / weights.Other : baselineNational.Other,
    }
    const deltas = {
      Labour: aggregate.Labour - baselineNational.Labour,
      Conservative: aggregate.Conservative - baselineNational.Conservative,
      'Plaid Cymru': aggregate['Plaid Cymru'] - baselineNational['Plaid Cymru'],
      'Liberal Democrat': aggregate['Liberal Democrat'] - baselineNational['Liberal Democrat'],
      Reform: aggregate.Reform - baselineNational.Reform,
      Green: aggregate.Green - baselineNational.Green,
      Other: aggregate.Other - baselineNational.Other,
    }
    const hasAdjustors =
      wardToSenedd?.wards && welshAgeLookup?.wards && welshTenureLookup?.wards && welshNssecLookup?.wards && welshDegreeLookup?.wards && welshRuralLookup?.wards && welshLeaveLookup?.wards
    const wardToSeneddMap: Record<string, { senedd: string }> = wardToSenedd?.wards || {}
    const computeBaseline = (wardData: Record<string, any>, fields: string[], fallbackWeightMap?: Record<string, number>) => {
      const totalsByField: Record<string, number> = {}
      fields.forEach(field => { totalsByField[field] = 0 })
      let totalWeight = 0
      Object.keys(wardToSeneddMap).forEach(wardCode => {
        const entry = wardData[wardCode]
        if (!entry) return
        const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
        fields.forEach(field => { totalsByField[field] += (entry[field] ?? 0) * weight })
        totalWeight += weight
      })
      const baseline: Record<string, number> = {}
      fields.forEach(field => { baseline[field] = totalWeight ? totalsByField[field] / totalWeight : 0 })
      return baseline
    }
    const aggregateBySenedd = (wardData: Record<string, any>, fields: string[], fallbackWeightMap?: Record<string, number>) => {
      const totalsBySenedd: Record<string, Record<string, number>> = {}
      const weightsBySenedd: Record<string, number> = {}
      Object.entries(wardToSeneddMap).forEach(([wardCode, meta]) => {
        const entry = wardData[wardCode]
        if (!entry || !meta?.senedd) return
        if (!totalsBySenedd[meta.senedd]) {
          totalsBySenedd[meta.senedd] = {}
          fields.forEach(field => { totalsBySenedd[meta.senedd][field] = 0 })
          weightsBySenedd[meta.senedd] = 0
        }
        const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
        fields.forEach(field => { totalsBySenedd[meta.senedd][field] += (entry[field] ?? 0) * weight })
        weightsBySenedd[meta.senedd] += weight
      })
      const result: Record<string, Record<string, number>> = {}
      Object.entries(totalsBySenedd).forEach(([seneddName, fieldTotals]) => {
        const weight = weightsBySenedd[seneddName] || 1
        result[seneddName] = {}
        fields.forEach(field => { result[seneddName][field] = fieldTotals[field] / weight })
      })
      return result
    }
    const ageWeightMap: Record<string, number> = {}
    const ageBaseline = hasAdjustors ? (() => {
      Object.entries(welshAgeLookup.wards).forEach(([code, entry]: any) => { ageWeightMap[code] = entry.totalPop ?? 1 })
      return computeBaseline(welshAgeLookup.wards, ['age18_35', 'age35_55', 'age55_plus'])
    })() : null
    const tenureBaseline = hasAdjustors ? computeBaseline(welshTenureLookup.wards, ['ownedOutright', 'ownsWithMortgage', 'socialRented', 'privateRented']) : null
    const nssecBaseline = hasAdjustors ? computeBaseline(welshNssecLookup.wards, ['higher', 'intermediate', 'lower']) : null
    const degreeBaseline = hasAdjustors ? computeBaseline(welshDegreeLookup.wards, ['degree', 'noDegree']) : null
    const ruralBaseline = hasAdjustors ? computeBaseline(welshRuralLookup.wards, ['conurbation', 'cityTown', 'ruralTownFringe', 'ruralVillageHamlet']) : null
    const leaveBaseline = hasAdjustors
      ? computeBaseline(Object.fromEntries(Object.entries(welshLeaveLookup.wards).map(([code, entry]: any) => [code, { leaveShare: entry.leaveShare }])), ['leaveShare'], ageWeightMap).leaveShare
      : null
    const ageBySenedd = hasAdjustors ? aggregateBySenedd(welshAgeLookup.wards, ['age18_35', 'age35_55', 'age55_plus']) : {}
    const tenureBySenedd = hasAdjustors ? aggregateBySenedd(welshTenureLookup.wards, ['ownedOutright', 'ownsWithMortgage', 'socialRented', 'privateRented']) : {}
    const nssecBySenedd = hasAdjustors ? aggregateBySenedd(welshNssecLookup.wards, ['higher', 'intermediate', 'lower']) : {}
    const degreeBySenedd = hasAdjustors ? aggregateBySenedd(welshDegreeLookup.wards, ['degree', 'noDegree']) : {}
    const ruralBySenedd = hasAdjustors ? aggregateBySenedd(welshRuralLookup.wards, ['conurbation', 'cityTown', 'ruralTownFringe', 'ruralVillageHamlet']) : {}
    const leaveBySenedd = hasAdjustors
      ? aggregateBySenedd(Object.fromEntries(Object.entries(welshLeaveLookup.wards).map(([code, entry]: any) => [code, { leaveShare: entry.leaveShare }])), ['leaveShare'], ageWeightMap)
      : {}
    const getLeaveAdjustment = (party: string, leaveShare: number) => {
      if (!hasAdjustors || leaveBaseline == null) return 0
      return getPartyLeaveAdjustment(party, leaveShare) - getPartyLeaveAdjustment(party, leaveBaseline)
    }
    const map = new Map<string, WelshProjection>()
    welshLookup.results.forEach((row: any) => {
      const overlaps = (row.overlaps || []).slice(0, 2)
      if (!overlaps.length) return
      const weightsLocal = overlaps.map(() => 1 / overlaps.length)
      const parties = ['Labour', 'Conservative', 'Plaid Cymru', 'Liberal Democrat', 'Reform', 'Green']
      const baseline: Record<string, number> = {}
      parties.forEach(party => {
        baseline[party] = overlaps.reduce((sum: number, item: any, idx: number) => {
          const pcon = welshGePcon.pcon?.[item.code]
          if (!pcon) return sum
          return sum + (pcon[party] ?? 0) * weightsLocal[idx]
        }, 0)
      })
      const seneddName = row.seneddName
      const ageShare = ageBySenedd[seneddName]
      const tenureShare = tenureBySenedd[seneddName]
      const nssecShare = nssecBySenedd[seneddName]
      const degreeShare = degreeBySenedd[seneddName]
      const ruralShare = ruralBySenedd[seneddName]
      const leaveShare = leaveBySenedd[seneddName]?.leaveShare
      const projectedRaw: Record<string, number> = {}
      parties.forEach(party => {
        let adj = 0
        if (party !== 'Plaid Cymru') {
          if (typeof leaveShare === 'number') adj += getLeaveAdjustment(party, leaveShare) * LEAVE_EFFECT_STRENGTH
          if (ageShare && ageBaseline) adj += getAgeAdjustment(party, ageShare as any, ageBaseline as any) * AGE_EFFECT_STRENGTH
          if (tenureShare && tenureBaseline) adj += getTenureAdjustment(party, tenureShare as any, tenureBaseline as any) * TENURE_EFFECT_STRENGTH
          if (nssecShare && nssecBaseline) adj += getNssecAdjustment(party, nssecShare as any, nssecBaseline as any) * NSSEC_EFFECT_STRENGTH
          if (degreeShare && degreeBaseline) adj += getDegreeAdjustment(party, degreeShare as any, degreeBaseline as any) * DEGREE_EFFECT_STRENGTH
          if (ruralShare && ruralBaseline) adj += getRuralUrbanAdjustment(party, ruralShare as any, ruralBaseline as any) * RURAL_URBAN_EFFECT_STRENGTH
        }
        projectedRaw[party] = Math.max(0, baseline[party] + (deltas as any)[party] + adj)
      })
      const total = parties.reduce((sum, party) => sum + projectedRaw[party], 0) || 1
      const projected: Record<string, number> = {}
      parties.forEach(party => { projected[party] = (projectedRaw[party] / total) * 100 })
      const projectedWinner = Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      const seats = allocateDhondt(projected, 6)
      const rawName = row.seneddName || row.seneddCode || ''
      const displayName = getWelshDisplayName(rawName)
      const payload = { baseline, projected, projectedWinner, seats }
      map.set(normalizeWelshName(rawName), payload)
      map.set(normalizeWelshName(displayName), payload)
    })
    return map
  }, [welshLookup, welshGePcon, welshPolls, wardToSenedd, welshAgeLookup, welshTenureLookup, welshNssecLookup, welshDegreeLookup, welshRuralLookup, welshLeaveLookup])
  const view: ViewMode =
    focusRegion === 'english'
      ? 'england'
      : focusRegion === 'scotland'
        ? 'scotland'
        : focusRegion === 'wales'
          ? 'wales'
          : 'uk'

  const selectedEnglishCouncilName = selectedEnglishFeature?.properties?.name || null

  const selectedScottishConstituencyData = useMemo(() => {
    if (!selectedScottishConstituency) return null
    const result =
      scottishProjected.get(selectedScottishConstituency) ||
      scottishProjected.get(normalizeScottishConstituencyName(selectedScottishConstituency))
    return {
      name: selectedScottishConstituency,
      projectedWinner: result?.projectedWinner || null,
      projected: result?.projected
        ? {
            SNP: result.projected.snp,
            Conservative: result.projected.conservative,
            Labour: result.projected.labour,
            'Liberal Democrat': result.projected.libdem,
            Green: result.projected.green,
            Reform: result.projected.reform,
            Other: result.projected.other,
          }
        : null,
    }
  }, [selectedScottishConstituency, scottishProjected])

  const selectedWelshConstituencyData = useMemo(() => {
    if (!selectedWelshConstituency) return null
    const result = welshProjected.get(normalizeWelshName(selectedWelshConstituency)) || null
    return {
      name: selectedWelshConstituency,
      result,
    }
  }, [selectedWelshConstituency, welshProjected])

  useEffect(() => {
    onSidebarDataChange?.({
      selectedEnglishCouncilName,
      selectedScottishConstituency: selectedScottishConstituencyData,
      scottishSeatSummary,
      selectedWelshConstituency: selectedWelshConstituencyData,
    })
  }, [
    onSidebarDataChange,
    selectedEnglishCouncilName,
    selectedScottishConstituencyData,
    scottishSeatSummary,
    selectedWelshConstituencyData,
  ])

  const sentimentActive = selectedLayers.has('renewables-sentiment')
  const englishReady =
    Boolean(countriesGeo) &&
    Boolean(ladsGeo) &&
    Boolean(countiesGeo) &&
    Boolean(baseline) &&
    Boolean(englishAggregate)
  const scotlandReady =
    Boolean(scotlandConstituencies) &&
    Boolean(scotlandRegions) &&
    Boolean(scottishResults.size) &&
    Boolean(scottishPolls.length)
  const walesReady =
    Boolean(walesGeo) &&
    Boolean(welshLookup?.results?.length) &&
    Boolean(welshGePcon?.pcon) &&
    Boolean(welshPolls.length)
  const sentimentReady =
    !selectedLayers.has('renewables-sentiment') || (Boolean(countriesGeo) && Boolean(englandRegionsGeo))
  const mapReady = englishReady && scotlandReady && walesReady && sentimentReady

  if (!mapReady) {
    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(180deg, #f7f9fc 0%, #eef3f8 100%)',
          color: '#334155',
          fontWeight: 600,
        }}
      >
        Loading elections map...
      </div>
    )
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
    <MapContainer
      center={[54.2, -2.5]}
      zoom={5}
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <Pane name="sentiment-pane" style={{ zIndex: 380 }} />
      <Pane name="english-pane" style={{ zIndex: 410 }} />
      <Pane name="scotland-pane" style={{ zIndex: 420 }} />
      <Pane name="wales-pane" style={{ zIndex: 430 }} />

      {countriesGeo && (
        <GeoJSON
          data={countriesGeo as GeoJsonObject}
          interactive={false}
          style={() => ({
            color: '#1f2a44',
            weight: 1.4,
            fillColor: 'transparent',
            fillOpacity: 0,
          })}
        />
      )}

      {selectedLayers.has('renewables-sentiment') && countriesGeo && (
        <GeoJSON
          pane="sentiment-pane"
          data={countriesGeo as GeoJsonObject}
          style={feature => {
            const rawName = String(feature?.properties?.CTRY22NM || '')
            if (rawName === 'England') return { color: 'transparent', weight: 0, fillOpacity: 0 }
            const values: Record<string, number> = { Wales: 82, Scotland: 76, 'Northern Ireland': 79 }
            const value = values[rawName]
            return {
              color: '#1f2a3a',
              weight: 1.1,
              fillColor: value != null ? supportToColor(value, 67, 84) : '#d5dbe6',
              fillOpacity: 0.55,
            }
          }}
          onEachFeature={(feature, layer) => {
            const name = String(feature?.properties?.CTRY22NM || 'Area')
            const values: Record<string, number> = { Wales: 82, Scotland: 76, 'Northern Ireland': 79 }
            if (name !== 'England' && values[name] != null) {
              layer.bindPopup(`<strong>${name}</strong><br/>Support: ${values[name].toFixed(1)}%`)
            }
          }}
        />
      )}

      {selectedLayers.has('renewables-sentiment') && englandRegionsGeo && (
        <GeoJSON
          pane="sentiment-pane"
          data={englandRegionsGeo as GeoJsonObject}
          style={feature => {
            const regionName = String(feature?.properties?.EER13NM || '')
            const values: Record<string, number> = {
              'North East': 74, 'North West': 81, 'Yorkshire and The Humber': 75, 'East Midlands': 75,
              'West Midlands': 67, 'East of England': 73, London: 84, 'South East': 80, 'South West': 83,
            }
            const value = values[regionName]
            return {
              color: '#ffffff',
              weight: 1,
              fillColor: value != null ? supportToColor(value, 67, 84) : '#d5dbe6',
              fillOpacity: 0.55,
            }
          }}
          onEachFeature={(feature, layer) => {
            const regionName = String(feature?.properties?.EER13NM || 'Region')
            const values: Record<string, number> = {
              'North East': 74, 'North West': 81, 'Yorkshire and The Humber': 75, 'East Midlands': 75,
              'West Midlands': 67, 'East of England': 73, London: 84, 'South East': 80, 'South West': 83,
            }
            if (values[regionName] != null) {
              layer.bindPopup(`<strong>${regionName}</strong><br/>Support: ${values[regionName].toFixed(1)}%`)
            }
          }}
        />
      )}

      {selectedLayers.has('english-local') && englishGeo && (
        <GeoJSON
          key={`english-${englishGeo.features.length}`}
          pane="english-pane"
          data={englishGeo as GeoJsonObject}
          style={feature => {
            const props: any = feature?.properties || {}
            const code = String(props.reference || props.LAD25CD || props.LAD23CD || '')
            const category = classifyCouncil(props.name || props.LAD25NM || props.LAD23NM || '')
            const isSelected = selectedEnglishCouncil ? code === selectedEnglishCouncil : false
            return {
              color: category === 'county' ? '#B03060' : category === 'london' ? '#4A148C' : category === 'metro' ? '#EF6C00' : category === 'unitary' ? '#1565C0' : '#1B5E20',
              weight: isSelected ? 3 : 1.6,
              fillColor: category === 'county' ? '#E75480' : category === 'london' ? '#6A1B9A' : category === 'metro' ? '#FB8C00' : category === 'unitary' ? '#1E88E5' : '#2E8B57',
              fillOpacity: sentimentActive ? (isSelected ? 0.1 : 0.16) : isSelected ? 0.18 : 0.52,
            }
          }}
          onEachFeature={(feature, layer) => {
            const props: any = feature.properties || {}
            const code = props.reference || ''
            if (eligibleLads.has(String(code))) {
              layer.on('click', () => {
                onRequestFocusRegion?.('english', { resetSelections: false })
                setSelectedEnglishCouncil(String(code))
              })
            }
          }}
        />
      )}

      {selectedLayers.has('english-local') && selectedEnglishCouncil && selectedEnglishFeature && (
        <>
          {wardFeatures.length > 0 && (
            <GeoJSON
              key={`english-wards-${selectedEnglishCouncil}-${wardFeatures.length}-${wardMap.size}`}
              pane="english-pane"
              data={{ type: 'FeatureCollection', features: wardFeatures } as GeoJsonObject}
              style={feature => {
                const code = getGeoWardCode(feature)
                const nameKey = getGeoWardNameKey(feature) || ''
                const wardName = normalizeName(getGeoWardName(feature)).replace(/\s+ed$/i, '')
                const isContested =
                  ((!contestedWardKeys.codes.size && !contestedWardKeys.names.size) ||
                    (code ? contestedWardKeys.codes.has(code) : false) ||
                    (nameKey ? contestedWardKeys.names.has(nameKey) : false))
                const baselineWard =
                  selectedBaselineWardByCode.get(code) ||
                  selectedBaselineWardByNameKey.get(nameKey) ||
                  selectedBaselineWardByName.get(wardName)
                const projection =
                  wardMap.get(code) ||
                  wardMapByName.get(nameKey) ||
                  wardMapByWardName.get(wardName) ||
                  (baselineWard ? wardMap.get(baselineWard.wardCode) : null) ||
                  ladFallbackProjection
                if (!isContested) {
                  return {
                    color: '#777',
                    weight: 1,
                    dashArray: '4 4',
                    fillColor: '#d9d9d9',
                    fillOpacity: 0.65,
                  }
                }
                return {
                  color: '#333',
                  weight: 0.5,
                  fillColor: projection?.color || '#ccc',
                  fillOpacity: 0.7,
                }
              }}
              onEachFeature={(feature, layer) => {
                const code = getGeoWardCode(feature)
                const nameKey = getGeoWardNameKey(feature) || ''
                const wardName = getGeoWardName(feature)
                const normalizedWardName = normalizeName(wardName).replace(/\s+ed$/i, '')
                const isContested =
                  ((!contestedWardKeys.codes.size && !contestedWardKeys.names.size) ||
                    (code ? contestedWardKeys.codes.has(code) : false) ||
                    (nameKey ? contestedWardKeys.names.has(nameKey) : false))
                if (!isContested) {
                  layer.bindPopup(`<strong>${wardName}</strong><br/>Not contested`)
                  return
                }
                const baselineWard =
                  selectedBaselineWardByCode.get(code) ||
                  selectedBaselineWardByNameKey.get(nameKey) ||
                  selectedBaselineWardByName.get(normalizedWardName)
                const projection =
                  wardMap.get(code) ||
                  wardMapByName.get(nameKey) ||
                  wardMapByWardName.get(normalizedWardName) ||
                  (baselineWard ? wardMap.get(baselineWard.wardCode) : null) ||
                  ladFallbackProjection
                if (!projection) return
                const seatRow = councilSeats?.councils?.find(row => normalizeCouncilName(row.council) === normalizeCouncilName(baselineWard?.ladName || selectedEnglishFeature.properties?.name || ''))
                const vacancies =
                  (code ? wardVacancies.get(code) : 0) ||
                  (nameKey ? wardVacanciesByName.get(nameKey) : 0) ||
                  (baselineWard ? getSeatsPerWardForPopup(selectedBaselineWards, seatRow, baselineWard, wardVacancyLookup) : 1)
                const seatAllocation = allocateProjectedSeats(projection.shares || {}, vacancies)
                const sorted = Object.entries(projection.shares)
                  .map(([party, value]) => ({ party, value: Number(value) }))
                  .filter(entry => Number.isFinite(entry.value))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 3)
                const popupLines = sorted
                  .map(entry => {
                    const seats = seatAllocation[entry.party] || 0
                    const suffix = seats > 0 && vacancies > 1 ? ` (${getSeatAllocationLabel(seats)})` : ''
                    return `${entry.party}: ${entry.value.toFixed(1)}%${suffix}`
                  })
                  .join('<br/>')
                layer.bindPopup(`<strong>${wardName}</strong><br/>${popupLines}<br/>Seats up: ${vacancies}${projection.prevWinner ? `<br/>Previous winner: ${projection.prevWinner}` : ''}`)
              }}
            />
          )}
        </>
      )}

      {selectedLayers.has('scottish-parliament') && scotlandRegions && (
        <GeoJSON
          key={`scotland-regions-${scotlandRegions.features.length}`}
          pane="scotland-pane"
          data={scotlandRegions as GeoJsonObject}
          interactive={false}
          style={() => ({
            color: '#4A6FA5',
            weight: 2.2,
            fillColor: '#9FB7D9',
            fillOpacity: 0.08,
          })}
        />
      )}

      {selectedLayers.has('scottish-parliament') && scotlandConstituencies && (
        <GeoJSON
          key={`scotland-constituencies-${scotlandConstituencies.features.length}`}
          pane="scotland-pane"
          data={scotlandConstituencies as GeoJsonObject}
          style={feature => {
            const props: any = feature?.properties || {}
            const constituencyName = props.SPC22NM || ''
            const result =
              scottishProjected.get(constituencyName) ||
              scottishProjected.get(normalizeScottishConstituencyName(constituencyName))
            const fill =
              (result?.projectedWinner || result?.previousWinner2021) === 'SNP' ? '#FDF38E' :
              (result?.projectedWinner || result?.previousWinner2021) === 'Conservative' ? '#0087DC' :
              (result?.projectedWinner || result?.previousWinner2021) === 'Labour' ? '#E4003B' :
              (result?.projectedWinner || result?.previousWinner2021) === 'Liberal Democrat' ? '#FAA61A' :
              (result?.projectedWinner || result?.previousWinner2021) === 'Green' ? '#02A95B' :
              (result?.projectedWinner || result?.previousWinner2021) === 'Reform' ? '#12B6CF' : '#9a9a9a'
            return { color: '#1F2A44', weight: 1, fillColor: fill, fillOpacity: sentimentActive ? 0.16 : 0.45 }
          }}
          onEachFeature={(feature, layer) => {
            const props: any = feature.properties || {}
            const constituencyName = props.SPC22NM || ''
            const result =
              scottishProjected.get(constituencyName) ||
              scottishProjected.get(normalizeScottishConstituencyName(constituencyName))
            const shareLines2021 = result
              ? buildPopupShareLines([
                  ['SNP', result.shares.snp],
                  ['Conservative', result.shares.conservative],
                  ['Labour', result.shares.labour],
                  ['Liberal Democrat', result.shares.libdem],
                  ['Green', result.shares.green],
                  ['Other', result.shares.other],
                ])
              : 'No baseline loaded'
            const projectedLines = result?.projected
              ? buildPopupShareLines([
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
              result?.baselineSource === 'fallback-2021'
                ? ''
                : result?.projectedWinner && result?.previousWinner2021
                ? result.projectedWinner === result.previousWinner2021
                  ? `${result.projectedWinner} hold`
                  : `${result.projectedWinner} gain from ${result.previousWinner2021}`
                : result?.projectedWinner
                  ? `${result.projectedWinner} projected`
                  : ''
            const baselineHeading =
              result?.baselineSource === 'fallback-2021'
                ? '2021 constituency vote share (fallback)'
                : '2021 constituency vote share'
            const projectedHeading =
              result?.baselineSource === 'fallback-2021'
                ? ''
                : 'Projected constituency vote share'
            layer.bindPopup(
              `<strong>${constituencyName}</strong>${
                result?.region ? `<br/>Region: ${result.region}` : ''
              }${
                result?.baselineSource === 'fallback-2021' && result?.previousWinner2021
                  ? `<br/>2021 winner: ${result.previousWinner2021}`
                  : ''
              }${
                projectedOutcome ? `<br/>Projected result: ${projectedOutcome}` : ''
              }${shareLines2021 ? `<br/><br/>${baselineHeading}<br/>${shareLines2021}` : ''}${
                projectedLines && projectedHeading ? `<br/><br/>${projectedHeading}<br/>${projectedLines}` : ''
              }`
            )
            layer.on('click', () => {
              onRequestFocusRegion?.('scotland', { resetSelections: false })
              setSelectedScottishConstituency(constituencyName)
            })
          }}
        />
      )}

      {selectedLayers.has('welsh-senedd') && walesGeo && (
        <GeoJSON
          key={`wales-${walesGeo.features.length}`}
          pane="wales-pane"
          data={walesGeo as GeoJsonObject}
          style={feature => {
            const props: any = feature?.properties || {}
            const rawName = getWelshFeatureName(props)
            const displayName = getWelshDisplayName(rawName)
            const result =
              welshProjected.get(normalizeWelshName(displayName)) ||
              welshProjected.get(normalizeWelshName(rawName))
            const fill =
              result?.projectedWinner === 'Labour' ? '#E4003B' :
              result?.projectedWinner === 'Conservative' ? '#0087DC' :
              result?.projectedWinner === 'Plaid Cymru' ? '#008672' :
              result?.projectedWinner === 'Liberal Democrat' ? '#FAA61A' :
              result?.projectedWinner === 'Reform' ? '#12B6CF' :
              result?.projectedWinner === 'Green' ? '#02A95B' : '#9a9a9a'
            return { color: '#132238', weight: 1.8, fillColor: fill, fillOpacity: sentimentActive ? 0.18 : 0.7 }
          }}
          onEachFeature={(feature, layer) => {
            const props: any = feature.properties || {}
            const rawName = getWelshFeatureName(props) || 'Constituency'
            const displayName = getWelshDisplayName(rawName)
            const result =
              welshProjected.get(normalizeWelshName(displayName)) ||
              welshProjected.get(normalizeWelshName(rawName))
            const baselineLines = result
              ? Object.entries(result.baseline)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
                  .join('<br/>')
              : ''
            const projectedLines = result
              ? Object.entries(result.projected)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, value]) => `${party}: ${value.toFixed(1)}%`)
                  .join('<br/>')
              : ''
            const seatLines = result?.seats
              ? Object.entries(result.seats)
                  .filter(([, seats]) => seats > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([party, seats]) => `${party}: ${seats}`)
                  .join('<br/>')
              : ''
            layer.bindPopup(
              `<strong>${displayName}</strong>${
                baselineLines ? `<br/><br/>Baseline vote share<br/>${baselineLines}` : ''
              }${
                projectedLines ? `<br/><br/>Projected vote share<br/>${projectedLines}` : ''
              }${
                seatLines ? `<br/><br/>Projected constituency MSs<br/>${seatLines}` : ''
              }`
            )
            layer.on('click', () => {
              onRequestFocusRegion?.('wales', { resetSelections: false })
              setSelectedWelshConstituency(displayName)
            })
          }}
        />
      )}

      {selectedEnglishCouncil && selectedEnglishFeature ? <FitFeature feature={selectedEnglishFeature} /> : <FitOverview view={view} />}
    </MapContainer>
    {selectedEnglishCouncil && (
      <button
        type="button"
        onClick={() => setSelectedEnglishCouncil(null)}
        style={{
          position: 'absolute',
          top: '0.9rem',
          right: '0.9rem',
          zIndex: 1000,
          padding: '0.55rem 0.85rem',
          borderRadius: '10px',
          border: '1px solid rgba(15, 23, 42, 0.16)',
          background: 'rgba(255,255,255,0.96)',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Back to councils
      </button>
    )}
    </div>
  )
}
