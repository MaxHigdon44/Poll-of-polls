import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { sql } from '@vercel/postgres'
import {
  clampLeaveShare,
  getCenteredPartyLeaveAdjustment,
  LEAVE_EFFECT_STRENGTH,
  NATIONAL_LEAVE_SHARE,
} from '@/lib/local2026/leaveRemain'
import { AGE_EFFECT_STRENGTH, getAgeAdjustment } from '@/lib/local2026/age'
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
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
  blendShare,
  getGeWeightForParty,
  getRelativeGeShare,
} from '@/lib/local2026/ge'
import { getConcentrationMultiplier } from '@/lib/local2026/concentration'

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

type LookupWithWardNames<T> = {
  wards?: Record<string, T>
  wardNames?: Record<string, T>
  wardNamesOnly?: Record<string, T>
  wardNamesAggressive?: Record<string, T>
  lads?: Record<string, T>
  meta?: Record<string, any>
}

const COUNTY_REGION_LOOKUP: Record<string, string> = {
  E10000011: 'South East',
  E10000012: 'East of England',
  E10000014: 'South East',
  E10000020: 'East of England',
  E10000029: 'East of England',
  E10000032: 'South East',
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

function canonicalizePartyLabel(party: string | null | undefined) {
  const normalized = normalizeName(party)
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  return party || 'Other'
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

function readJson<T>(filename: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const code = String(req.query.code || '').trim()
  const name = String(req.query.name || '').trim()
  if (!code && !name) {
    return res.status(400).json({ error: 'Provide code or name' })
  }

  try {
    const baseline = readJson<BaselineData>('ward-baseline.json')
    const leaveLookup = readJson<LookupWithWardNames<{ leaveShare: number }>>('leave-share.json')
    const ageLookup = readJson<
      LookupWithWardNames<{ age18_35: number; age35_55: number; age55_plus: number }>
    >('age-share.json')
    const regionLookup = readJson<{
      lads?: Record<string, { regionName: string }>
    }>('lad-region.json')
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

    const results = await sql<AggregateRow>`
      SELECT aggregate_date, labour, conservative, reform, libdem, green, snp, pc
      FROM aggregate_runs
      ORDER BY aggregate_date DESC
      LIMIT 1
    `
    const aggregate = results.rows[0]
    if (!aggregate) return res.status(500).json({ error: 'No aggregate available' })

    const ward =
      baseline.wards.find(row => row.wardCode === code) ||
      baseline.wards.find(row => normalizeName(row.wardName) === normalizeName(name))
    if (!ward) return res.status(404).json({ error: 'Ward not found' })

    const wardNameKey = `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`
    const pconCode =
      wardToPcon?.wards?.[ward.wardCode] ||
      wardToPcon?.wardNames?.[wardNameKey] ||
      cedToPcon?.ceds?.[ward.wardCode] ||
      cedToPcon?.cedNames?.[wardNameKey]
    const geShares = pconCode ? geLookup?.pcon?.[pconCode] : null

    let adjustedWard = { ...ward, nationalShares: { ...ward.nationalShares } }
    const geEffect: Record<string, number> = {}
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
        const nextShare =
          baseShare === 0 && (party === 'Reform' || party === 'Green')
            ? getRelativeGeShare(party, geShare)
            : blendShare(baseShare, geShare, weight)
        geEffect[party] = nextShare - baseShare
        adjustedWard.nationalShares[party] = nextShare
      })
    }

    const leave = getLookupShare(leaveLookup, ward, { leaveShare: NATIONAL_LEAVE_SHARE })
    const age = getLookupShare(ageLookup, ward, {
      age18_35: 0.22,
      age35_55: 0.26,
      age55_plus: 0.3185,
    })
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
    const regionName =
      regionLookup?.lads?.[ward.ladCode]?.regionName || COUNTY_REGION_LOOKUP[ward.ladCode] || null
    const baselineNational = getBaselineNationalForYear(baseline, adjustedWard.lastYear)
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

    const labourDeltaMultiplier =
      adjustedWard.lastYear === 2021
        ? 1.4
        : adjustedWard.lastYear === 2022
          ? 1.3
          : adjustedWard.lastYear === 2024
            ? 1.15
            : 1
    const labourBaselineCarry =
      adjustedWard.lastYear === 2021 ||
      adjustedWard.lastYear === 2022 ||
      adjustedWard.lastYear === 2024
        ? 0.93
        : 1

    let baselineWinner: string | null = null
    let baselineTop = -1
    Object.entries({ ...ward.nationalShares, ...ward.localShares }).forEach(([party, value]) => {
      if ((value ?? 0) > baselineTop) {
        baselineTop = value ?? 0
        baselineWinner = party
      }
    })

    const aggregateMap: Record<string, number> = {
      Labour: Number(aggregate.labour) || 0,
      Conservative: Number(aggregate.conservative) || 0,
      Reform: Number(aggregate.reform) || 0,
      'Liberal Democrat': Number(aggregate.libdem) || 0,
      Green: Number(aggregate.green) || 0,
      SNP: Number(aggregate.snp) || 0,
      'Plaid Cymru': Number(aggregate.pc) || 0,
    }

    const detail: Record<string, Record<string, number>> = {}
    let sumPreScale = 0
    ;[
      'Labour',
      'Conservative',
      'Reform',
      'Liberal Democrat',
      'Green',
      'SNP',
      'Plaid Cymru',
    ].forEach(party => {
      const rawDelta = (aggregateMap[party] ?? 0) - (baselineNational[party] ?? 0)
      let pollDelta = party === 'Labour' && rawDelta < 0 ? rawDelta * labourDeltaMultiplier : rawDelta
      if (party === 'Conservative' && adjustedWard.lastYear === 2021 && pollDelta < 0) {
        pollDelta *= 0.9
      }
      if (
        party === 'Reform' &&
        pollDelta > 0 &&
        adjustedWard.lastYear === 2021 &&
        canonicalizePartyLabel(baselineWinner) === 'Conservative'
      ) {
        pollDelta *= 0.95
      }
      const row = {
        base: (adjustedWard.nationalShares[party] ?? 0) * (party === 'Labour' ? labourBaselineCarry : 1),
        geEffect: geEffect[party] ?? 0,
        pollDelta,
        leaveAdj:
          LEAVE_EFFECT_STRENGTH *
          getCenteredPartyLeaveAdjustment(party, clampLeaveShare(leave.share.leaveShare)),
        ageAdj:
          (age.source === 'lad' ? Math.min(AGE_EFFECT_STRENGTH, 0.6) : AGE_EFFECT_STRENGTH) *
          getAgeAdjustment(party, age.share),
        regionAdj: REGION_EFFECT_STRENGTH * getRegionAdjustment(party, regionName),
        nssecAdj:
          (nssec.source === 'lad' ? Math.min(NSSEC_EFFECT_STRENGTH, 0.6) : NSSEC_EFFECT_STRENGTH) *
          getNssecAdjustment(
            party,
            nssec.share,
            (nssecLookup.meta?.baseline as NssecBaseline) || { higher: 0.33, intermediate: 0.33, lower: 0.34 }
          ),
        degreeAdj:
          (degree.source === 'lad' ? Math.min(DEGREE_EFFECT_STRENGTH, 0.6) : DEGREE_EFFECT_STRENGTH) *
          getDegreeAdjustment(
            party,
            degree.share,
            (degreeLookup.meta?.baseline as DegreeBaseline) || { degree: 0.4, noDegree: 0.6 }
          ),
        tenureAdj:
          (tenure.source === 'lad' ? Math.min(TENURE_EFFECT_STRENGTH, 0.6) : TENURE_EFFECT_STRENGTH) *
          getTenureAdjustment(
            party,
            tenure.share,
            (tenureLookup.meta?.baseline as TenureBaseline) || {
              ownedOutright: 0.32831847091249194,
              ownsWithMortgage: 0.297073553740984,
              socialRented: 0.1705895998333387,
              privateRented: 0.20401837551318536,
            }
          ),
        ruralAdj:
          (rural.source === 'lad' ? Math.min(RURAL_URBAN_EFFECT_STRENGTH, 0.6) : RURAL_URBAN_EFFECT_STRENGTH) *
          getRuralUrbanAdjustment(
            party,
            rural.share,
            (ruralLookup.meta?.baseline as RuralUrbanBaseline) || {
              conurbation: 0.2847,
              cityTown: 0.5064,
              ruralTownFringe: 0.1097,
              ruralVillageHamlet: 0.0992,
            }
          ),
        concentrationMultiplier: getConcentrationMultiplier(party, ward.nationalShares[party] ?? 0),
      }
      const preMultiplier = Math.max(
        0,
        row.base +
          row.pollDelta +
          row.leaveAdj +
          row.ageAdj +
          row.regionAdj +
          row.nssecAdj +
          row.degreeAdj +
          row.tenureAdj +
          row.ruralAdj
      )
      const preScale = preMultiplier * row.concentrationMultiplier
      detail[party] = { ...row, preMultiplier, preScale }
      sumPreScale += preScale
    })

    const localBaseline = Object.fromEntries(
      Object.entries(adjustedWard.localShares || {}).map(([party, share]) => [party, share * 0.9])
    )
    const localSum = Object.values(localBaseline).reduce((acc, value) => acc + (value || 0), 0)
    const remaining = 100 - localSum
    const finalShares: Record<string, number> = { ...localBaseline }
    Object.entries(detail).forEach(([party, row]) => {
      finalShares[party] =
        sumPreScale > 0 && remaining > 0 ? (row.preScale * remaining) / sumPreScale : 0
    })

    const winner = Object.entries(finalShares).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other'

    return res.status(200).json({
      aggregate,
      ward,
      pconCode,
      geShares,
      leave,
      age,
      regionName,
      nssec,
      degree,
      tenure,
      rural,
      baselineNational,
      detail,
      localBaseline,
      finalShares: Object.fromEntries(
        Object.entries(finalShares).sort((a, b) => b[1] - a[1])
      ),
      winner,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to debug ward calculation' })
  }
}
