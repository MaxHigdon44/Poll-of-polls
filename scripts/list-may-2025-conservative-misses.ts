import fs from 'fs'
import path from 'path'
import xlsx from 'xlsx'
import { AGE_BASELINE, AGE_EFFECT_STRENGTH, getAgeAdjustment } from '../lib/local2026/age'
import {
  DEGREE_EFFECT_STRENGTH,
  getDegreeAdjustment,
  type DegreeBaseline,
  type DegreeShare,
} from '../lib/local2026/degree'
import {
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
  getRelativeGeShare,
} from '../lib/local2026/ge'
import {
  LEAVE_EFFECT_STRENGTH,
  NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredPartyLeaveAdjustment,
} from '../lib/local2026/leaveRemain'
import { getConcentrationMultiplier } from '../lib/local2026/concentration'
import { allocateProjectedSeats } from '../lib/local2026/multiMember'
import {
  NSSEC_EFFECT_STRENGTH,
  getNssecAdjustment,
  type NssecBaseline,
  type NssecShare,
} from '../lib/local2026/nssec'
import { REGION_EFFECT_STRENGTH, getRegionAdjustment } from '../lib/local2026/region'
import {
  RURAL_URBAN_EFFECT_STRENGTH,
  getRuralUrbanAdjustment,
  type RuralUrbanBaseline,
  type RuralUrbanShare,
} from '../lib/local2026/ruralUrban'
import {
  TENURE_EFFECT_STRENGTH,
  getTenureAdjustment,
  type TenureBaseline,
  type TenureShare,
} from '../lib/local2026/tenure'
import { MAY_2025_AGGREGATE } from '../lib/local2025/simulation'

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
  baselineNational: Record<string, number>
  baselineNationalByYear?: Record<string, Record<string, number>>
  wards: WardBaseline[]
}

type LookupWithWardNames<T> = {
  wards?: Record<string, T>
  wardNames?: Record<string, T>
  wardNamesOnly?: Record<string, T>
  wardNamesAggressive?: Record<string, T>
  lads?: Record<string, T>
  meta?: Record<string, any>
}

type CouncilSeatRow = {
  council: string
  seatsUp: number
  totalSeats: number
}

type CouncilSeatData = {
  councils: CouncilSeatRow[]
}

type ActualWard = {
  council: string
  ward: string
  electedParties: Map<string, number>
}

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

const projectRoot = process.cwd()

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, 'public', 'data', filename), 'utf8')) as T
}

function normalizeName(value: string | undefined | null) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bcounty durham\b/g, 'durham')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\bed\b/g, '')
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

function canonicalParty(raw: string | undefined | null) {
  const normalized = normalizeName(raw)
  if (!normalized) return null
  if (normalized.includes('conservative')) return 'Conservative'
  if (normalized === 'labour' || normalized === 'labour party') return 'Labour'
  if (normalized.includes('reform')) return 'Reform'
  if (normalized.includes('liberal democrat') || normalized.includes('lib dem')) {
    return 'Liberal Democrat'
  }
  if (normalized === 'green' || normalized === 'green party') return 'Green'
  if (normalized.includes('scottish national')) return 'SNP'
  if (normalized.includes('plaid')) return 'Plaid Cymru'
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  return raw || 'Other'
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

function getLookupShare<T>(
  lookup: LookupWithWardNames<T> | null,
  ward: WardBaseline,
  fallback: T
): { share: T; source: 'ward' | 'ward-name' | 'lad' | 'national' } {
  const wardShare = lookup?.wards?.[ward.wardCode]
  if (wardShare) return { share: wardShare, source: 'ward' }
  const key = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
  const namedShare = lookup?.wardNames?.[key]
  if (namedShare) return { share: namedShare, source: 'ward-name' }
  const nameKey = normalizeName(ward.wardName)
  const nameOnly = lookup?.wardNamesOnly?.[nameKey]
  if (nameOnly) return { share: nameOnly, source: 'ward-name' }
  const aggressive = lookup?.wardNamesAggressive?.[nameKey]
  if (aggressive) return { share: aggressive, source: 'ward-name' }
  const ladShare = lookup?.lads?.[ward.ladCode]
  if (ladShare) return { share: ladShare, source: 'lad' }
  return { share: fallback, source: 'national' }
}

function getSeatsPerWardForPopup(
  wards: WardBaseline[],
  seatRow: CouncilSeatRow | null | undefined,
  ward: WardBaseline
) {
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
  if (vacancySum === totalSeats) return Math.max(ward.vacancies || 0, 1)
  if (wards.length && totalSeats % wards.length === 0) {
    return Math.max(1, Math.round(totalSeats / wards.length))
  }
  return Math.max(ward.vacancies || 0, 1)
}

function buildActualByKey() {
  const workbook = xlsx.readFile('/Users/maxhigdon/Downloads/LEH-2025-results-HoC.xlsx')
  const raw = xlsx.utils.sheet_to_json(workbook.Sheets['Candidates result'], {
    header: 1,
    defval: '',
  }) as any[][]
  const header = raw[0] as string[]
  const rows = raw.slice(1).map(row =>
    Object.fromEntries(header.map((label, index) => [label || `col_${index}`, row[index]]))
  )

  const actualByKey = new Map<string, ActualWard>()
  for (const row of rows) {
    if (row['Elected'] !== true) continue
    const ward = String(row['Ward/ County Electoral District name'] || '')
    const isCounty = String(row['Local authority type'] || '').trim() === 'CC'
    const council = String(
      isCounty ? row['Upper tier authority'] || '' : row['Lower tier authority'] || row['Upper tier authority'] || ''
    )
    const key = `${normalizeCouncilName(council)}|${normalizeName(ward)}`
    const existing =
      actualByKey.get(key) ||
      {
        council,
        ward,
        electedParties: new Map<string, number>(),
      }
    const party = canonicalParty(row['Party name'])
    if (party) {
      existing.electedParties.set(party, (existing.electedParties.get(party) || 0) + 1)
    }
    actualByKey.set(key, existing)
  }
  return actualByKey
}

function projectWard(
  ward: WardBaseline,
  baseline: BaselineData,
  councilSeats: CouncilSeatData,
  leaveLookup: LookupWithWardNames<{ leaveShare: number }>,
  ageLookup: LookupWithWardNames<{ age18_35: number; age35_55: number; age55_plus: number }>,
  regionLookup: { lads?: Record<string, { regionName: string }> },
  nssecLookup: LookupWithWardNames<NssecShare>,
  degreeLookup: LookupWithWardNames<DegreeShare>,
  tenureLookup: LookupWithWardNames<TenureShare>,
  ruralLookup: LookupWithWardNames<RuralUrbanShare>,
  wardToPcon: { wards?: Record<string, string>; wardNames?: Record<string, string> },
  cedToPcon: { ceds?: Record<string, string>; cedNames?: Record<string, string> },
  geLookup: { pcon?: Record<string, Record<string, number>> }
) {
  const wardNameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
  const pconCode =
    wardToPcon?.wards?.[ward.wardCode] ||
    wardToPcon?.wardNames?.[wardNameKey] ||
    cedToPcon?.ceds?.[ward.wardCode] ||
    cedToPcon?.cedNames?.[wardNameKey]
  const geShares = pconCode ? geLookup?.pcon?.[pconCode] : null

  let adjustedWard = { ...ward, nationalShares: { ...ward.nationalShares } }
  if (geShares) {
    ;[
      'Labour',
      'Conservative',
      'Reform',
      'Liberal Democrat',
      'Green',
      'SNP',
      'Plaid Cymru',
    ].forEach(party => {
      const weight = getGeWeightForParty(party, {
        reform: GE_WEIGHT_REFORM,
        green: GE_WEIGHT_GREEN,
        major: GE_WEIGHT_MAJOR,
      })
      if (!weight) return
      const baseShare = adjustedWard.nationalShares[party] ?? 0
      const geShare = geShares?.[party]
      adjustedWard.nationalShares[party] =
        baseShare === 0 && (party === 'Reform' || party === 'Green')
          ? getRelativeGeShare(party, geShare)
          : blendShare(baseShare, geShare, weight)
    })
  }

  const leave = getLookupShare(leaveLookup, ward, { leaveShare: NATIONAL_LEAVE_SHARE })
  const age = getLookupShare(ageLookup, ward, AGE_BASELINE)
  const nssec = getLookupShare(
    nssecLookup,
    ward,
    (nssecLookup.meta?.baseline as NssecBaseline) || { higher: 0.33, intermediate: 0.33, lower: 0.34 }
  )
  const degree = getLookupShare(
    degreeLookup,
    ward,
    (degreeLookup.meta?.baseline as DegreeBaseline) || { degree: 0.4, noDegree: 0.6 }
  )
  const tenure = getLookupShare(
    tenureLookup,
    ward,
    (tenureLookup.meta?.baseline as TenureBaseline) || {
      ownedOutright: 0.32831847091249194,
      ownsWithMortgage: 0.297073553740984,
      socialRented: 0.1705895998333387,
      privateRented: 0.20401837551318536,
    }
  )
  const rural = getLookupShare(
    ruralLookup,
    ward,
    (ruralLookup.meta?.baseline as RuralUrbanBaseline) || {
      conurbation: 0.2847,
      cityTown: 0.5064,
      ruralTownFringe: 0.1097,
      ruralVillageHamlet: 0.0992,
    }
  )
  const regionName =
    regionLookup?.lads?.[ward.ladCode]?.regionName || COUNTY_REGION_LOOKUP[ward.ladCode] || null
  const baselineNational = getBaselineNationalForYear(baseline, adjustedWard.lastYear)

  const labourDeltaMultiplier =
    ward.lastYear === 2021 ? 1.4 : ward.lastYear === 2022 ? 1.3 : ward.lastYear === 2024 ? 1.15 : 1
  const labourBaselineCarry =
    ward.lastYear === 2021 || ward.lastYear === 2022 || ward.lastYear === 2024 ? 0.93 : 1

  const aggregateMap: Record<string, number> = {
    Labour: (MAY_2025_AGGREGATE.labour ?? 0) - 2,
    Conservative: MAY_2025_AGGREGATE.conservative ?? 0,
    Reform: MAY_2025_AGGREGATE.reform ?? 0,
    'Liberal Democrat': MAY_2025_AGGREGATE.libdem ?? 0,
    Green: MAY_2025_AGGREGATE.green ?? 0,
    SNP: MAY_2025_AGGREGATE.snp ?? 0,
    'Plaid Cymru': MAY_2025_AGGREGATE.pc ?? 0,
  }

  const detail: Record<string, number> = {}
  let sumPreScale = 0
  const nationalParties = [
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
  ] as const
  for (const party of nationalParties) {
    const base = (adjustedWard.nationalShares[party] ?? 0) * (party === 'Labour' ? labourBaselineCarry : 1)
    const rawDelta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
    const pollDelta = party === 'Labour' && rawDelta < 0 ? rawDelta * labourDeltaMultiplier : rawDelta
    const value =
      Math.max(
        0,
        base +
          pollDelta +
          LEAVE_EFFECT_STRENGTH *
            getCenteredPartyLeaveAdjustment(party, clampLeaveShare(leave.share.leaveShare)) +
          (age.source === 'lad' ? Math.min(AGE_EFFECT_STRENGTH, 0.6) : AGE_EFFECT_STRENGTH) *
            getAgeAdjustment(party, age.share) +
          REGION_EFFECT_STRENGTH * getRegionAdjustment(party, regionName) +
          (nssec.source === 'lad'
            ? Math.min(NSSEC_EFFECT_STRENGTH, 0.6)
            : NSSEC_EFFECT_STRENGTH) *
            getNssecAdjustment(
              party,
              nssec.share,
              (nssecLookup.meta?.baseline as NssecBaseline) || {
                higher: 0.33,
                intermediate: 0.33,
                lower: 0.34,
              }
            ) +
          (degree.source === 'lad'
            ? Math.min(DEGREE_EFFECT_STRENGTH, 0.6)
            : DEGREE_EFFECT_STRENGTH) *
            getDegreeAdjustment(
              party,
              degree.share,
              (degreeLookup.meta?.baseline as DegreeBaseline) || { degree: 0.4, noDegree: 0.6 }
            ) +
          (tenure.source === 'lad'
            ? Math.min(TENURE_EFFECT_STRENGTH, 0.6)
            : TENURE_EFFECT_STRENGTH) *
            getTenureAdjustment(
              party,
              tenure.share,
              (tenureLookup.meta?.baseline as TenureBaseline) || {
                ownedOutright: 0.32831847091249194,
                ownsWithMortgage: 0.297073553740984,
                socialRented: 0.1705895998333387,
                privateRented: 0.20401837551318536,
              }
            ) +
          (rural.source === 'lad'
            ? Math.min(RURAL_URBAN_EFFECT_STRENGTH, 0.6)
            : RURAL_URBAN_EFFECT_STRENGTH) *
            getRuralUrbanAdjustment(
              party,
              rural.share,
              (ruralLookup.meta?.baseline as RuralUrbanBaseline) || {
                conurbation: 0.2847,
                cityTown: 0.5064,
                ruralTownFringe: 0.1097,
                ruralVillageHamlet: 0.0992,
              }
            )
      ) * getConcentrationMultiplier(party, ward.nationalShares[party] ?? 0)
    detail[party] = value
    sumPreScale += value
  }

  const mergedLocalShares: Record<string, number> = { ...(adjustedWard.localShares || {}) }
  if (typeof mergedLocalShares.Other === 'number') {
    const otherValue = mergedLocalShares.Other
    const hasDuplicate = Object.entries(mergedLocalShares).some(([key, value]) => {
      if (key === 'Other') return false
      return Math.abs((value ?? 0) - otherValue) <= 3
    })
    const namedEntries = Object.entries(mergedLocalShares).filter(([key]) => key !== 'Other')
    const hasNamed = namedEntries.length > 0
    const namedMax = namedEntries.reduce((max, [, value]) => Math.max(max, value ?? 0), 0)
    if (hasDuplicate || (hasNamed && otherValue >= namedMax)) delete mergedLocalShares.Other
  }

  const localBaseline = Object.fromEntries(
    Object.entries(mergedLocalShares).map(([key, value]) => [key, value * 0.9])
  )
  const localSum = Object.values(localBaseline).reduce((acc, value) => acc + value, 0)
  const remaining = 100 - localSum
  const finalShares: Record<string, number> = { ...localBaseline }
  for (const party of nationalParties) {
    finalShares[party] = sumPreScale > 0 && remaining > 0 ? (detail[party] * remaining) / sumPreScale : 0
  }

  const councilWards = baseline.wards.filter(
    row => normalizeCouncilName(row.ladName) === normalizeCouncilName(ward.ladName)
  )
  const seatRow =
    councilSeats.councils.find(
      row => normalizeCouncilName(row.council) === normalizeCouncilName(ward.ladName)
    ) || null
  const seatsUp = getSeatsPerWardForPopup(councilWards, seatRow, ward)
  const seatAllocation = allocateProjectedSeats(finalShares, seatsUp)
  const winner = Object.entries(finalShares).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'
  return { finalShares, seatAllocation, winner }
}

function main() {
  const baseline = readJson<BaselineData>('ward-baseline.json')
  const councilSeats = readJson<CouncilSeatData>('may-2025-council-seats.json')
  const leaveLookup = readJson<LookupWithWardNames<{ leaveShare: number }>>('leave-share.json')
  const ageLookup = readJson<
    LookupWithWardNames<{ age18_35: number; age35_55: number; age55_plus: number }>
  >('age-share.json')
  const regionLookup = readJson<{ lads?: Record<string, { regionName: string }> }>('lad-region.json')
  const nssecLookup = readJson<LookupWithWardNames<NssecShare>>('nssec-share.json')
  const degreeLookup = readJson<LookupWithWardNames<DegreeShare>>('degree-share.json')
  const tenureLookup = readJson<LookupWithWardNames<TenureShare>>('tenure-share.json')
  const ruralLookup = readJson<LookupWithWardNames<RuralUrbanShare>>('rural-urban-share.json')
  const wardToPcon = readJson<{ wards?: Record<string, string>; wardNames?: Record<string, string> }>(
    'ward-to-pcon.json'
  )
  const cedToPcon = readJson<{ ceds?: Record<string, string>; cedNames?: Record<string, string> }>(
    'ced-to-pcon.json'
  )
  const geLookup = readJson<{ pcon?: Record<string, Record<string, number>> }>('ge2024-pcon.json')
  const actualByKey = buildActualByKey()

  const misses: Array<Record<string, string | number>> = []
  for (const ward of baseline.wards) {
    const key = `${normalizeCouncilName(ward.ladName)}|${normalizeName(ward.wardName)}`
    const actual = actualByKey.get(key)
    if (!actual || !(actual.electedParties.get('Conservative') || 0)) continue
    const projection = projectWard(
      ward,
      baseline,
      councilSeats,
      leaveLookup,
      ageLookup,
      regionLookup,
      nssecLookup,
      degreeLookup,
      tenureLookup,
      ruralLookup,
      wardToPcon,
      cedToPcon,
      geLookup
    )
    if ((projection.seatAllocation.Conservative || 0) > 0) continue
    const predictedSeats = Object.entries(projection.seatAllocation)
      .sort((a, b) => b[1] - a[1] || (projection.finalShares[b[0]] || 0) - (projection.finalShares[a[0]] || 0))
      .map(([party, seats]) => `${party} (${seats})`)
      .join('; ')
    misses.push({
      council: ward.ladName,
      ward_or_division: ward.wardName,
      code: ward.wardCode,
      actual_winners: [...actual.electedParties.entries()].map(([party, seats]) => `${party} (${seats})`).join('; '),
      model_predicted: predictedSeats || projection.winner,
      model_primary_party: projection.winner,
      conservative_share: Number((projection.finalShares.Conservative || 0).toFixed(2)),
      primary_party_share: Number((projection.finalShares[projection.winner] || 0).toFixed(2)),
    })
  }

  misses.sort((a, b) =>
    String(a.council).localeCompare(String(b.council)) ||
    String(a.ward_or_division).localeCompare(String(b.ward_or_division))
  )

  const csvLines = [
    'Council,Ward/Division,Code,Actual winners,Model predicted,Model primary party,Conservative share,Primary party share',
  ]
  for (const row of misses) {
    csvLines.push([
      JSON.stringify(row.council),
      JSON.stringify(row.ward_or_division),
      row.code,
      JSON.stringify(row.actual_winners),
      JSON.stringify(row.model_predicted),
      JSON.stringify(row.model_primary_party),
      row.conservative_share,
      row.primary_party_share,
    ].join(','))
  }

  const outCsv = path.join(projectRoot, 'tmp-may-2025-conservative-actual-not-model.csv')
  fs.writeFileSync(outCsv, csvLines.join('\n'))
  const byProjected = Object.fromEntries(
    misses.reduce((acc, row) => {
      const key = String(row.model_primary_party)
      acc.set(key, (acc.get(key) || 0) + 1)
      return acc
    }, new Map<string, number>())
  )
  console.log(JSON.stringify({ count: misses.length, outCsv, byProjected, first25: misses.slice(0, 25) }, null, 2))
}

main()
