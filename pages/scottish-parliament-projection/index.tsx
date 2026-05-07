import { useEffect, useMemo, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import PageShell from '../../components/PageShell'
import ElectionFreezeNotice from '../../components/ElectionFreezeNotice'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { blendShare } from '../../lib/local2026/ge'
import {
  SCOTLAND_AGE_EFFECT_STRENGTH,
  getScottishAgeAdjustment,
  type ScotlandAgeShare,
} from '../../lib/scotland/age'
import {
  SCOTLAND_DEGREE_EFFECT_STRENGTH,
  getScottishDegreeAdjustment,
  type ScotlandDegreeShare,
} from '../../lib/scotland/degree'
import {
  SCOTLAND_NSSEC_EFFECT_STRENGTH,
  getScottishNssecAdjustment,
  type ScotlandNssecShare,
} from '../../lib/scotland/nssec'
import {
  SCOTLAND_LEAVE_EFFECT_STRENGTH,
  SCOTLAND_NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredScottishPartyLeaveAdjustment,
} from '../../lib/scotland/leaveRemain'
import {
  SCOTLAND_TENURE_EFFECT_STRENGTH,
  getScottishTenureAdjustment,
  type ScotlandTenureShare,
} from '../../lib/scotland/tenure'
import { computePollsterWeight, computeSampleWeight } from '../../lib/weights'
import type { ScotlandProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'

type Poll = {
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

type GePconLookup = {
  pcon?: Record<string, Record<string, number>>
}

type SpcToWpcLookup = {
  results?: Array<{
    spcCode: string
    spcName: string
    primaryWpcCode: string | null
    primaryWpcName: string | null
    overlapShare: number
  }>
}

type ScotlandWpcLeaveLookup = {
  byCode?: Record<string, { code: string; name: string; leaveShare: number | null }>
  byName?: Record<string, { code: string; name: string; leaveShare: number | null }>
}

type ScotlandTenureLookup = {
  constituencies?: Record<string, ScotlandTenureShare & { totalHouseholds?: number }>
  meta?: { baseline?: ScotlandTenureShare }
}

type ScotlandAgeLookup = {
  constituencies?: Record<string, ScotlandAgeShare>
  meta?: { baseline?: ScotlandAgeShare }
}

type ScotlandDegreeLookup = {
  constituencies?: Record<string, ScotlandDegreeShare & { totalPop?: number }>
  meta?: { baseline?: ScotlandDegreeShare }
}

type ScotlandNssecLookup = {
  constituencies?: Record<string, ScotlandNssecShare & { totalPop?: number; excluded?: number }>
  meta?: { baseline?: ScotlandNssecShare; excluded?: number }
}

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
  'north east scotland': {
    SNP: -0.5,
    Conservative: 3.5,
    Labour: -9.5,
    'Liberal Democrat': -0.5,
    Green: -1.5,
    Reform: 6,
  },
  'highlands and islands': {
    SNP: -2,
    Conservative: 0.5,
    Labour: -4,
    'Liberal Democrat': 9,
    Green: -3,
    Reform: -1.5,
  },
  'south scotland': {
    SNP: -2,
    Conservative: 4,
    Labour: -3.5,
    'Liberal Democrat': -5,
    Green: -2,
    Reform: 4,
  },
  'west scotland': {
    SNP: -1,
    Conservative: -2,
    Labour: 7.5,
    'Liberal Democrat': 2,
    Green: -3,
    Reform: -2.5,
  },
  central: {
    SNP: 7.5,
    Conservative: -0.5,
    Labour: -1.5,
    'Liberal Democrat': -4.5,
    Green: -2,
    Reform: 2.5,
  },
  'mid scotland and fife': {
    SNP: -2,
    Conservative: 3,
    Labour: 3.5,
    'Liberal Democrat': 2,
    Green: -2.5,
    Reform: -1,
  },
  lothians: {
    SNP: -1,
    Conservative: -1.5,
    Labour: 2.5,
    'Liberal Democrat': 4,
    Green: 5,
    Reform: -5,
  },
  glasgow: {
    SNP: 2.5,
    Conservative: -4.5,
    Labour: 3.5,
    'Liberal Democrat': -5,
    Green: 8,
    Reform: -4.5,
  },
}

const SCOTLAND_REGIONAL_LIST_DELTAS: Record<string, Record<string, number>> = {
  'north east scotland': {
    SNP: -0.47,
    Conservative: 5.53,
    Labour: -6.23,
    'Liberal Democrat': -0.33,
    Green: -1.2,
    Reform: 3.27,
  },
  'highlands and islands': {
    SNP: 0.3,
    Conservative: -0.47,
    Labour: -7.87,
    'Liberal Democrat': 10.97,
    Green: -3.8,
    Reform: 0.2,
  },
  'south scotland': {
    SNP: 0.93,
    Conservative: 3.67,
    Labour: -1.77,
    'Liberal Democrat': -2.9,
    Green: -1.4,
    Reform: 3.3,
  },
  'west scotland': {
    SNP: -1.43,
    Conservative: -2.43,
    Labour: 6.67,
    'Liberal Democrat': -0.1,
    Green: -1.5,
    Reform: -0.53,
  },
  central: {
    SNP: 5.6,
    Conservative: -3.13,
    Labour: 3.4,
    'Liberal Democrat': -4.5,
    Green: -1.63,
    Reform: 0.93,
  },
  'mid scotland and fife': {
    SNP: -1.43,
    Conservative: 2.67,
    Labour: -0.73,
    'Liberal Democrat': 0.9,
    Green: -3.1,
    Reform: 1.37,
  },
  lothians: {
    SNP: -1.7,
    Conservative: -3.4,
    Labour: 3.1,
    'Liberal Democrat': 2.43,
    Green: 4.4,
    Reform: -3.17,
  },
  glasgow: {
    SNP: 3.7,
    Conservative: -6.17,
    Labour: 3.7,
    'Liberal Democrat': -4.63,
    Green: 8.43,
    Reform: -0.07,
  },
}

const SCOTTISH_PARTY_COLORS: Record<string, string> = {
  SNP: '#FDF38E',
  Conservative: '#0087DC',
  Labour: '#E4003B',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  Reform: '#12B6CF',
  Other: '#888',
  Unknown: '#666',
  'Regional TBD': '#d3d3d3',
}

const SCOTLAND_2021_SEAT_BASELINE: Record<string, number> = {
  SNP: 64,
  Conservative: 31,
  Labour: 22,
  'Liberal Democrat': 4,
  Green: 8,
  Reform: 0,
  Other: 0,
}

const ALLOWED_PARTIES = new Set([
  'SNP',
  'Conservative',
  'Labour',
  'Liberal Democrat',
  'Green',
  'Reform',
  'Other',
  'Unknown',
])

const SEAT_ROWS = [33, 30, 27, 23, 16]
const TOTAL_SEATS = 129
const HEMICYCLE_WIDTH = 840
const HEMICYCLE_HEIGHT = 380
const HEMICYCLE_MARGIN = 36
const HEMICYCLE_TOP_PADDING = 12
const HEMICYCLE_START_ANGLE = Math.PI
const HEMICYCLE_END_ANGLE = 0

const REGION_LABELS = [
  { key: 'north east scotland', label: 'North East Scotland' },
  { key: 'highlands and islands', label: 'Highlands and Islands' },
  { key: 'south scotland', label: 'South Scotland' },
  { key: 'west scotland', label: 'West Scotland' },
  { key: 'central', label: 'Central' },
  { key: 'mid scotland and fife', label: 'Mid-Scotland and Fife' },
  { key: 'lothians', label: 'Lothians' },
  { key: 'glasgow', label: 'Glasgow' },
]

function normalizeScottishConstituencyName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bislands\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWestminsterName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRegionName(region: string | null | undefined) {
  const normalized = String(region || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized === 'north east') return 'north east scotland'
  if (normalized === 'highlands') return 'highlands and islands'
  if (normalized === 'south') return 'south scotland'
  if (normalized === 'west') return 'west scotland'
  if (normalized === 'central scotland') return 'central'
  if (normalized === 'lothian') return 'lothians'
  if (normalized === 'mid and fife') return 'mid scotland and fife'
  if (normalized === 'mid scotland & fife') return 'mid scotland and fife'
  return normalized
}

function sanitizePartyLabel(value: string | null) {
  if (!value) return null
  return ALLOWED_PARTIES.has(value) ? value : null
}

function computeScottishRecencyWeight(ageDays: number) {
  if (ageDays < 10) return 1
  if (ageDays < 20) return 0.75
  if (ageDays < 40) return 0.5
  if (ageDays < 60) return 0.25
  return 0.1
}

function computeScottishPollWeight(poll: Poll) {
  const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
  const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
  return (
    computeScottishRecencyWeight(ageDays) *
    computePollsterWeight(poll.pollster) *
    computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
  )
}

export function computeConstituencyAggregate(polls: Poll[]) {
  if (polls.length === 0) return null
  const totals = {
    snp: 0,
    conservative: 0,
    labour: 0,
    libdem: 0,
    green: 0,
    reform: 0,
    other: 0,
  }
  const weights = { ...totals }
  const add = (key: keyof typeof totals, value: number | null, weight: number) => {
    if (value == null) return
    totals[key] += value * weight
    weights[key] += weight
  }
  polls.forEach(poll => {
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
    conservative: weights.conservative
      ? totals.conservative / weights.conservative
      : BASELINE_2021_CONSTITUENCY.conservative,
    labour: weights.labour ? totals.labour / weights.labour : BASELINE_2021_CONSTITUENCY.labour,
    libdem: weights.libdem ? totals.libdem / weights.libdem : BASELINE_2021_CONSTITUENCY.libdem,
    green: weights.green ? totals.green / weights.green : BASELINE_2021_CONSTITUENCY.green,
    reform: weights.reform ? totals.reform / weights.reform : SCOTLAND_GE2024_REFORM_BASELINE,
    other: weights.other ? totals.other / weights.other : BASELINE_2021_CONSTITUENCY.other,
  }
}

export function computeRegionalAggregate(polls: Poll[]) {
  if (polls.length === 0) return null
  const totals = {
    snp: 0,
    conservative: 0,
    labour: 0,
    libdem: 0,
    green: 0,
    reform: 0,
    other: 0,
  }
  const weights = { ...totals }
  const add = (key: keyof typeof totals, value: number | null, weight: number) => {
    if (value == null) return
    totals[key] += value * weight
    weights[key] += weight
  }
  polls.forEach(poll => {
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
    conservative: weights.conservative
      ? totals.conservative / weights.conservative
      : BASELINE_2021_CONSTITUENCY.conservative,
    labour: weights.labour ? totals.labour / weights.labour : BASELINE_2021_CONSTITUENCY.labour,
    libdem: weights.libdem ? totals.libdem / weights.libdem : BASELINE_2021_CONSTITUENCY.libdem,
    green: weights.green ? totals.green / weights.green : BASELINE_2021_CONSTITUENCY.green,
    reform: weights.reform ? totals.reform / weights.reform : SCOTLAND_GE2024_REFORM_BASELINE,
    other: weights.other ? totals.other / weights.other : BASELINE_2021_CONSTITUENCY.other,
  }
}

function allocateRegionalSeats(
  votes: Record<string, number>,
  constituencySeats: Record<string, number>,
  seatsToAllocate = 7
) {
  const parties = [
    'SNP',
    'Conservative',
    'Labour',
    'Liberal Democrat',
    'Green',
    'Reform',
    'Other',
  ]
  const regionalSeats: Record<string, number> = {}
  parties.forEach(party => {
    regionalSeats[party] = 0
  })
  for (let round = 0; round < seatsToAllocate; round += 1) {
    let bestParty = parties[0]
    let bestQuotient = -Infinity
    parties.forEach(party => {
      const divisor = (constituencySeats[party] || 0) + (regionalSeats[party] || 0) + 1
      const quotient = (votes[party] || 0) / divisor
      if (quotient > bestQuotient) {
        bestQuotient = quotient
        bestParty = party
      }
    })
    regionalSeats[bestParty] = (regionalSeats[bestParty] || 0) + 1
  }
  return regionalSeats
}

export function computeScottishProjectedResults(args: {
  constituencyAggregate: ReturnType<typeof computeConstituencyAggregate> | null
  constituencyResults: Map<string, any>
  geLookup: GePconLookup | null
  spcToWpcByName: Map<string, { code: string; name: string }>
  spcCodeByName: Map<string, string>
  wpcLeaveLookup: ScotlandWpcLeaveLookup | null
  tenureLookup: ScotlandTenureLookup | null
  ageLookup: ScotlandAgeLookup | null
  degreeLookup: ScotlandDegreeLookup | null
  nssecLookup: ScotlandNssecLookup | null
  geBlendWeight: number
  tenureStrength: number
  ageStrength: number
  degreeStrength: number
  nssecStrength: number
  leaveStrength: number
  regionStrength: number
}) {
  const {
    constituencyAggregate,
    constituencyResults,
    geLookup,
    spcToWpcByName,
    spcCodeByName,
    wpcLeaveLookup,
    tenureLookup,
    ageLookup,
    degreeLookup,
    nssecLookup,
    geBlendWeight,
    tenureStrength,
    ageStrength,
    degreeStrength,
    nssecStrength,
    leaveStrength,
    regionStrength,
  } = args
  if (!constituencyAggregate) return constituencyResults
  const tenureBaseline: ScotlandTenureShare = tenureLookup?.meta?.baseline || {
    owned: 0,
    socialRented: 0,
    privateRented: 0,
  }
  const ageBaseline: ScotlandAgeShare = ageLookup?.meta?.baseline || {
    age16_34: 0,
    age35_54: 0,
    age55_plus: 0,
  }
  const degreeBaseline: ScotlandDegreeShare = degreeLookup?.meta?.baseline || {
    degree: 0,
    noDegree: 0,
  }
  const nssecBaseline: ScotlandNssecShare = nssecLookup?.meta?.baseline || {
    higher: 0,
    intermediate: 0,
    lower: 0,
  }
  const deltas = {
    snp: constituencyAggregate.snp - BASELINE_2021_CONSTITUENCY.snp,
    conservative: constituencyAggregate.conservative - BASELINE_2021_CONSTITUENCY.conservative,
    labour: constituencyAggregate.labour - BASELINE_2021_CONSTITUENCY.labour,
    libdem: constituencyAggregate.libdem - BASELINE_2021_CONSTITUENCY.libdem,
    green: constituencyAggregate.green - BASELINE_2021_CONSTITUENCY.green,
    reform: constituencyAggregate.reform - SCOTLAND_GE2024_REFORM_BASELINE,
    other: constituencyAggregate.other - BASELINE_2021_CONSTITUENCY.other,
  }
  const map = new Map(constituencyResults)
  for (const [name, result] of map.entries()) {
    const normalizedName = normalizeScottishConstituencyName(name)
    const wpcInfo = spcToWpcByName.get(normalizedName)
    const wpcCode = wpcInfo?.code
    const wpcName = wpcInfo?.name
    const geShares = wpcCode ? geLookup?.pcon?.[wpcCode] : null
    const wpcLeaveByCode = wpcCode ? wpcLeaveLookup?.byCode?.[wpcCode] : null
    const wpcLeaveByName = wpcName ? wpcLeaveLookup?.byName?.[normalizeWestminsterName(wpcName)] : null
    const leaveShare = wpcLeaveByCode?.leaveShare ?? wpcLeaveByName?.leaveShare ?? null
    const spcCode = spcCodeByName.get(normalizedName)
    const tenureShare = (spcCode && tenureLookup?.constituencies?.[spcCode]) || tenureBaseline
    const ageShare = (spcCode && ageLookup?.constituencies?.[spcCode]) || ageBaseline
    const degreeShare = (spcCode && degreeLookup?.constituencies?.[spcCode]) || degreeBaseline
    const nssecShare = (spcCode && nssecLookup?.constituencies?.[spcCode]) || nssecBaseline
    const regionKey = normalizeRegionName(result.region)
    const regionAdjustments = SCOTLAND_REGION_DELTAS[regionKey] || {}
    const adjustedLeaveShare = clampLeaveShare(
      typeof leaveShare === 'number' ? leaveShare : SCOTLAND_NATIONAL_LEAVE_SHARE
    )
    const tenureAdjustments = {
      snp: getScottishTenureAdjustment('SNP', tenureShare, tenureBaseline),
      conservative: getScottishTenureAdjustment('Conservative', tenureShare, tenureBaseline),
      labour: getScottishTenureAdjustment('Labour', tenureShare, tenureBaseline),
      libdem: getScottishTenureAdjustment('Liberal Democrat', tenureShare, tenureBaseline),
      green: getScottishTenureAdjustment('Green', tenureShare, tenureBaseline),
      reform: getScottishTenureAdjustment('Reform', tenureShare, tenureBaseline),
    }
    const ageAdjustments = {
      snp: getScottishAgeAdjustment('SNP', ageShare, ageBaseline),
      conservative: getScottishAgeAdjustment('Conservative', ageShare, ageBaseline),
      labour: getScottishAgeAdjustment('Labour', ageShare, ageBaseline),
      libdem: getScottishAgeAdjustment('Liberal Democrat', ageShare, ageBaseline),
      green: getScottishAgeAdjustment('Green', ageShare, ageBaseline),
      reform: getScottishAgeAdjustment('Reform', ageShare, ageBaseline),
    }
    const degreeAdjustments = {
      snp: getScottishDegreeAdjustment('SNP', degreeShare, degreeBaseline),
      conservative: getScottishDegreeAdjustment('Conservative', degreeShare, degreeBaseline),
      labour: getScottishDegreeAdjustment('Labour', degreeShare, degreeBaseline),
      libdem: getScottishDegreeAdjustment('Liberal Democrat', degreeShare, degreeBaseline),
      green: getScottishDegreeAdjustment('Green', degreeShare, degreeBaseline),
      reform: getScottishDegreeAdjustment('Reform', degreeShare, degreeBaseline),
    }
    const nssecAdjustments = {
      snp: getScottishNssecAdjustment('SNP', nssecShare, nssecBaseline),
      conservative: getScottishNssecAdjustment('Conservative', nssecShare, nssecBaseline),
      labour: getScottishNssecAdjustment('Labour', nssecShare, nssecBaseline),
      libdem: getScottishNssecAdjustment('Liberal Democrat', nssecShare, nssecBaseline),
      green: getScottishNssecAdjustment('Green', nssecShare, nssecBaseline),
      reform: getScottishNssecAdjustment('Reform', nssecShare, nssecBaseline),
    }
    const leaveAdjustments = {
      snp: getCenteredScottishPartyLeaveAdjustment('SNP', adjustedLeaveShare),
      conservative: getCenteredScottishPartyLeaveAdjustment('Conservative', adjustedLeaveShare),
      labour: getCenteredScottishPartyLeaveAdjustment('Labour', adjustedLeaveShare),
      libdem: getCenteredScottishPartyLeaveAdjustment('Liberal Democrat', adjustedLeaveShare),
      green: getCenteredScottishPartyLeaveAdjustment('Green', adjustedLeaveShare),
      reform: getCenteredScottishPartyLeaveAdjustment('Reform', adjustedLeaveShare),
    }
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
      snp: geShares?.SNP != null ? blendShare(baseShares.snp, geShares.SNP, geBlendWeight) : baseShares.snp,
      conservative:
        geShares?.Conservative != null
          ? blendShare(baseShares.conservative, geShares.Conservative, geBlendWeight)
          : baseShares.conservative,
      labour:
        geShares?.Labour != null ? blendShare(baseShares.labour, geShares.Labour, geBlendWeight) : baseShares.labour,
      libdem:
        geShares?.['Liberal Democrat'] != null
          ? blendShare(baseShares.libdem, geShares['Liberal Democrat'], geBlendWeight)
          : baseShares.libdem,
      green: geShares?.Green != null ? blendShare(baseShares.green, geShares.Green, geBlendWeight) : baseShares.green,
      reform:
        baseShares.reform === 0
          ? getRelativeScottishReformShare(geShares?.Reform)
          : geShares?.Reform != null
            ? blendShare(baseShares.reform, geShares.Reform, geBlendWeight)
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
      snp: Math.max(
        0,
        swingApplied.snp +
          tenureStrength * tenureAdjustments.snp +
          ageStrength * ageAdjustments.snp +
          degreeStrength * degreeAdjustments.snp +
          nssecStrength * nssecAdjustments.snp +
          leaveStrength * leaveAdjustments.snp +
          regionStrength * (regionAdjustments.SNP ?? 0)
      ),
      conservative: Math.max(
        0,
        swingApplied.conservative +
          tenureStrength * tenureAdjustments.conservative +
          ageStrength * ageAdjustments.conservative +
          degreeStrength * degreeAdjustments.conservative +
          nssecStrength * nssecAdjustments.conservative +
          leaveStrength * leaveAdjustments.conservative +
          regionStrength * (regionAdjustments.Conservative ?? 0)
      ),
      labour: Math.max(
        0,
        swingApplied.labour +
          tenureStrength * tenureAdjustments.labour +
          ageStrength * ageAdjustments.labour +
          degreeStrength * degreeAdjustments.labour +
          nssecStrength * nssecAdjustments.labour +
          leaveStrength * leaveAdjustments.labour +
          regionStrength * (regionAdjustments.Labour ?? 0)
      ),
      libdem: Math.max(
        0,
        swingApplied.libdem +
          tenureStrength * tenureAdjustments.libdem +
          ageStrength * ageAdjustments.libdem +
          degreeStrength * degreeAdjustments.libdem +
          nssecStrength * nssecAdjustments.libdem +
          leaveStrength * leaveAdjustments.libdem +
          regionStrength * (regionAdjustments['Liberal Democrat'] ?? 0)
      ),
      green: Math.max(
        0,
        swingApplied.green +
          tenureStrength * tenureAdjustments.green +
          ageStrength * ageAdjustments.green +
          degreeStrength * degreeAdjustments.green +
          nssecStrength * nssecAdjustments.green +
          leaveStrength * leaveAdjustments.green +
          regionStrength * (regionAdjustments.Green ?? 0)
      ),
      reform: Math.max(
        0,
        swingApplied.reform +
          tenureStrength * tenureAdjustments.reform +
          ageStrength * ageAdjustments.reform +
          degreeStrength * degreeAdjustments.reform +
          nssecStrength * nssecAdjustments.reform +
          leaveStrength * leaveAdjustments.reform +
          regionStrength * (regionAdjustments.Reform ?? 0)
      ),
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
    const projectedWinner = Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const projectedWinnerLabel =
      projectedWinner === 'snp'
        ? 'SNP'
        : projectedWinner === 'conservative'
          ? 'Conservative'
          : projectedWinner === 'labour'
            ? 'Labour'
            : projectedWinner === 'libdem'
              ? 'Liberal Democrat'
              : projectedWinner === 'green'
                ? 'Green'
                : projectedWinner === 'reform'
                  ? 'Reform'
                  : projectedWinner === 'other'
                    ? 'Other'
                    : null
    map.set(name, { ...result, projected, projectedWinner: projectedWinnerLabel })
  }
  return map
}

export function computeScottishCombinedSeatCounts(args: {
  constituencyList: Array<{ name: string; region: string; previousWinner2021: string | null }>
  projectedResults: Map<string, any>
  regionalAggregate: ReturnType<typeof computeRegionalAggregate> | null
}) {
  const { constituencyList, projectedResults, regionalAggregate } = args
  const constituencyWinners = constituencyList.map(entry => {
    const result =
      projectedResults.get(entry.name) ||
      projectedResults.get(normalizeScottishConstituencyName(entry.name))
    return { ...entry, projectedWinner: result?.projectedWinner || 'Unknown' }
  })
  const constituencySeatsByRegion = new Map<string, Record<string, number>>()
  constituencyWinners.forEach(entry => {
    const regionKey = normalizeRegionName(entry.region || 'Unknown')
    if (!constituencySeatsByRegion.has(regionKey)) constituencySeatsByRegion.set(regionKey, {})
    const bucket = constituencySeatsByRegion.get(regionKey) as Record<string, number>
    const party = entry.projectedWinner || 'Unknown'
    bucket[party] = (bucket[party] || 0) + 1
  })
  const regionalVotesByRegion = new Map<string, Record<string, number>>()
  if (regionalAggregate) {
    REGION_LABELS.forEach(({ key }) => {
      const adjustments = SCOTLAND_REGIONAL_LIST_DELTAS[key] || {}
      const raw = {
        SNP: Math.max(0, regionalAggregate.snp + (adjustments.SNP ?? 0)),
        Conservative: Math.max(0, regionalAggregate.conservative + (adjustments.Conservative ?? 0)),
        Labour: Math.max(0, regionalAggregate.labour + (adjustments.Labour ?? 0)),
        'Liberal Democrat': Math.max(0, regionalAggregate.libdem + (adjustments['Liberal Democrat'] ?? 0)),
        Green: Math.max(0, regionalAggregate.green + (adjustments.Green ?? 0)),
        Reform: Math.max(0, regionalAggregate.reform + (adjustments.Reform ?? 0)),
        Other: Math.max(0, regionalAggregate.other),
      }
      const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1
      regionalVotesByRegion.set(key, {
        SNP: (raw.SNP / total) * 100,
        Conservative: (raw.Conservative / total) * 100,
        Labour: (raw.Labour / total) * 100,
        'Liberal Democrat': (raw['Liberal Democrat'] / total) * 100,
        Green: (raw.Green / total) * 100,
        Reform: (raw.Reform / total) * 100,
        Other: (raw.Other / total) * 100,
      })
    })
  }
  const constituencySeatCounts: Record<string, number> = {}
  constituencyWinners.forEach(entry => {
    const winner = entry.projectedWinner || 'Unknown'
    constituencySeatCounts[winner] = (constituencySeatCounts[winner] || 0) + 1
  })
  const regionalSeatCounts: Record<string, number> = {}
  REGION_LABELS.forEach(({ key }) => {
    const votes = regionalVotesByRegion.get(key)
    if (!votes) return
    const constituencySeats = constituencySeatsByRegion.get(key) || {}
    const seats = allocateRegionalSeats(votes, constituencySeats)
    Object.entries(seats).forEach(([party, count]) => {
      regionalSeatCounts[party] = (regionalSeatCounts[party] || 0) + count
    })
  })
  const combinedSeatCounts: Record<string, number> = { ...constituencySeatCounts }
  Object.entries(regionalSeatCounts).forEach(([party, count]) => {
    combinedSeatCounts[party] = (combinedSeatCounts[party] || 0) + count
  })
  return combinedSeatCounts
}

function getRelativeScottishReformShare(geShare: number | undefined) {
  const numeric = Number(geShare)
  if (!Number.isFinite(numeric)) return 0
  if (numeric === 0) return 0
  return numeric - SCOTLAND_GE2024_REFORM_BASELINE
}

function buildHemicyclePositions(rows: number[]) {
  const maxRadius = Math.min(
    HEMICYCLE_WIDTH / 2 - HEMICYCLE_MARGIN,
    HEMICYCLE_HEIGHT - HEMICYCLE_MARGIN - HEMICYCLE_TOP_PADDING
  )
  const ringGap = (maxRadius / (rows.length + 3)) * 0.8
  const centerX = HEMICYCLE_WIDTH / 2
  const centerY = HEMICYCLE_HEIGHT - HEMICYCLE_MARGIN
  const dots: Array<{ x: number; y: number; angle: number; radius: number }> = []
  rows.forEach((count, index) => {
    const radius = maxRadius - index * ringGap
    if (!count) return
    const step = (HEMICYCLE_START_ANGLE - HEMICYCLE_END_ANGLE) / (count - 1 || 1)
    for (let seatIndex = 0; seatIndex < count; seatIndex += 1) {
      const angle = HEMICYCLE_START_ANGLE - step * seatIndex
      const x = centerX + Math.cos(angle) * radius
      const y = centerY - Math.sin(angle) * radius
      dots.push({ x, y, angle, radius })
    }
  })
  return { dots, centerX, centerY, maxRadius }
}

export default function ScottishParliamentProjectionPage() {
  const settingsKey = 'scotlandModelSettings'
  const [constituencyGeo, setConstituencyGeo] = useState<FeatureCollection | null>(null)
  const [constituencyList, setConstituencyList] = useState<
    Array<{ name: string; region: string; previousWinner2021: string | null }>
  >([])
  const [constituencyResults, setConstituencyResults] = useState<
    Map<
      string,
      {
        previousWinner2021: string | null
        region: string
        msp2021: string | null
        turnout: number | null
        majority: number | null
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
    >
  >(new Map())
  const [constituencyPolls, setConstituencyPolls] = useState<Poll[]>([])
  const [regionalPolls, setRegionalPolls] = useState<Poll[]>([])
  const [geLookup, setGeLookup] = useState<GePconLookup | null>(null)
  const [spcToWpcLookup, setSpcToWpcLookup] = useState<SpcToWpcLookup | null>(null)
  const [wpcLeaveLookup, setWpcLeaveLookup] = useState<ScotlandWpcLeaveLookup | null>(null)
  const [tenureLookup, setTenureLookup] = useState<ScotlandTenureLookup | null>(null)
  const [ageLookup, setAgeLookup] = useState<ScotlandAgeLookup | null>(null)
  const [degreeLookup, setDegreeLookup] = useState<ScotlandDegreeLookup | null>(null)
  const [nssecLookup, setNssecLookup] = useState<ScotlandNssecLookup | null>(null)
  const [geBlendWeight, setGeBlendWeight] = useState(GE_BLEND_OTHER)
  const [tenureStrength, setTenureStrength] = useState(SCOTLAND_TENURE_EFFECT_STRENGTH)
  const [ageStrength, setAgeStrength] = useState(SCOTLAND_AGE_EFFECT_STRENGTH)
  const [degreeStrength, setDegreeStrength] = useState(SCOTLAND_DEGREE_EFFECT_STRENGTH)
  const [nssecStrength, setNssecStrength] = useState(SCOTLAND_NSSEC_EFFECT_STRENGTH)
  const [leaveStrength, setLeaveStrength] = useState(SCOTLAND_LEAVE_EFFECT_STRENGTH)
  const [regionStrength, setRegionStrength] = useState(SCOTLAND_REGION_EFFECT_STRENGTH)
  const [projectionSnapshot, setProjectionSnapshot] = useState<ScotlandProjectionSnapshot | null>(null)
  const [projectionSnapshotStatus, setProjectionSnapshotStatus] = useState<
    'loading' | 'ready' | 'missing'
  >('loading')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(settingsKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed.geBlendWeight === 'number') setGeBlendWeight(parsed.geBlendWeight)
          if (typeof parsed.tenureStrength === 'number') setTenureStrength(parsed.tenureStrength)
          if (typeof parsed.ageStrength === 'number') setAgeStrength(parsed.ageStrength)
          if (typeof parsed.degreeStrength === 'number') setDegreeStrength(parsed.degreeStrength)
          if (typeof parsed.nssecStrength === 'number') setNssecStrength(parsed.nssecStrength)
          if (typeof parsed.leaveStrength === 'number') setLeaveStrength(parsed.leaveStrength)
          if (typeof parsed.regionStrength === 'number') setRegionStrength(parsed.regionStrength)
        }
      } catch {
        // ignore malformed local storage
      }
    }
    fetch('/api/scottish-parliament-projection')
      .then(async res => {
        if (!res.ok) throw new Error('snapshot unavailable')
        return (await res.json()) as ScotlandProjectionSnapshot
      })
      .then(data => {
        if (!data?.constituencyRows || !data?.combinedSeatCounts) {
          throw new Error('invalid snapshot')
        }
        setProjectionSnapshot(data)
        setProjectionSnapshotStatus('ready')
      })
      .catch(() => {
        setProjectionSnapshot(null)
        setProjectionSnapshotStatus('missing')
      })
  }, [])

  useEffect(() => {
    if (projectionSnapshotStatus !== 'missing') return

    fetch('/data/scotland-constituencies.geojson')
      .then(res => res.json())
      .then(data => setConstituencyGeo(data))
    fetch('/api/scottish-constituency-results')
      .then(res => res.json())
      .then(data => {
        const map = new Map()
        const list: Array<{ name: string; region: string; previousWinner2021: string | null }> = []
        ;(data.results ?? []).forEach((row: any) => {
          const value = {
            previousWinner2021: sanitizePartyLabel(row.winner2021 ?? null),
            region: row.region ?? '',
            msp2021: row.msp2021 ?? null,
            turnout: row.turnout ?? null,
            majority: row.majority ?? null,
            shares: row.shares ?? {},
          }
          map.set(row.constituency, value)
          map.set(normalizeScottishConstituencyName(row.constituency), value)
          list.push({
            name: row.constituency,
            region: row.region ?? '',
            previousWinner2021: sanitizePartyLabel(row.winner2021 ?? null),
          })
        })
        setConstituencyResults(map)
        setConstituencyList(list)
      })
    fetch('/api/scottish-polls')
      .then(res => res.json())
      .then(data => {
        setConstituencyPolls(data.constituencyPolls ?? [])
        setRegionalPolls(data.regionalPolls ?? [])
      })
    fetch('/data/ge2024-pcon.json')
      .then(res => res.json())
      .then(data => setGeLookup(data))
      .catch(() => setGeLookup(null))
    fetch('/data/spc-to-wpc-lookup.json')
      .then(res => res.json())
      .then(data => setSpcToWpcLookup(data))
      .catch(() => setSpcToWpcLookup(null))
    fetch('/data/scotland-wpc-leave-share.json')
      .then(res => res.json())
      .then(data => setWpcLeaveLookup(data))
      .catch(() => setWpcLeaveLookup(null))
    fetch('/data/scotland-tenure-share.json')
      .then(res => res.json())
      .then(data => setTenureLookup(data))
      .catch(() => setTenureLookup(null))
    fetch('/data/scotland-age-share.json')
      .then(res => res.json())
      .then(data => setAgeLookup(data))
      .catch(() => setAgeLookup(null))
    fetch('/data/scotland-degree-share.json')
      .then(res => res.json())
      .then(data => setDegreeLookup(data))
      .catch(() => setDegreeLookup(null))
    fetch('/data/scotland-nssec-share.json')
      .then(res => res.json())
      .then(data => setNssecLookup(data))
      .catch(() => setNssecLookup(null))
  }, [projectionSnapshotStatus])

  const spcCodeByName = useMemo(() => {
    const map = new Map<string, string>()
    if (!constituencyGeo) return map
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const code = props.SPC22CD || ''
      if (!name || !code) return
      map.set(normalizeScottishConstituencyName(name), code)
    })
    return map
  }, [constituencyGeo])

  const spcToWpcByName = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    ;(spcToWpcLookup?.results ?? []).forEach(row => {
      if (!row?.primaryWpcCode) return
      map.set(normalizeScottishConstituencyName(row.spcName), {
        code: row.primaryWpcCode,
        name: row.primaryWpcName || '',
      })
    })
    return map
  }, [spcToWpcLookup])

  const constituencyAggregate = useMemo(
    () => computeConstituencyAggregate(constituencyPolls),
    [constituencyPolls]
  )
  const regionalAggregate = useMemo(
    () => computeRegionalAggregate(regionalPolls),
    [regionalPolls]
  )

  const projectedResults = useMemo(() => {
    if (!constituencyAggregate) return constituencyResults
    const tenureBaseline: ScotlandTenureShare = tenureLookup?.meta?.baseline || {
      owned: 0,
      socialRented: 0,
      privateRented: 0,
    }
    const ageBaseline: ScotlandAgeShare = ageLookup?.meta?.baseline || {
      age16_34: 0,
      age35_54: 0,
      age55_plus: 0,
    }
    const degreeBaseline: ScotlandDegreeShare = degreeLookup?.meta?.baseline || {
      degree: 0,
      noDegree: 0,
    }
    const nssecBaseline: ScotlandNssecShare = nssecLookup?.meta?.baseline || {
      higher: 0,
      intermediate: 0,
      lower: 0,
    }
    const deltas = {
      snp: constituencyAggregate.snp - BASELINE_2021_CONSTITUENCY.snp,
      conservative: constituencyAggregate.conservative - BASELINE_2021_CONSTITUENCY.conservative,
      labour: constituencyAggregate.labour - BASELINE_2021_CONSTITUENCY.labour,
      libdem: constituencyAggregate.libdem - BASELINE_2021_CONSTITUENCY.libdem,
      green: constituencyAggregate.green - BASELINE_2021_CONSTITUENCY.green,
      reform: constituencyAggregate.reform - SCOTLAND_GE2024_REFORM_BASELINE,
      other: constituencyAggregate.other - BASELINE_2021_CONSTITUENCY.other,
    }
    const map = new Map(constituencyResults)
    for (const [name, result] of map.entries()) {
      const normalizedName = normalizeScottishConstituencyName(name)
      const wpcInfo = spcToWpcByName.get(normalizedName)
      const wpcCode = wpcInfo?.code
      const wpcName = wpcInfo?.name
      const geShares = wpcCode ? geLookup?.pcon?.[wpcCode] : null
      const wpcLeaveByCode = wpcCode ? wpcLeaveLookup?.byCode?.[wpcCode] : null
      const wpcLeaveByName = wpcName
        ? wpcLeaveLookup?.byName?.[normalizeWestminsterName(wpcName)]
        : null
      const leaveShare = wpcLeaveByCode?.leaveShare ?? wpcLeaveByName?.leaveShare ?? null
      const spcCode = spcCodeByName.get(normalizedName)
      const tenureShare =
        (spcCode && tenureLookup?.constituencies?.[spcCode]) || tenureBaseline
      const ageShare = (spcCode && ageLookup?.constituencies?.[spcCode]) || ageBaseline
      const degreeShare =
        (spcCode && degreeLookup?.constituencies?.[spcCode]) || degreeBaseline
      const nssecShare =
        (spcCode && nssecLookup?.constituencies?.[spcCode]) || nssecBaseline
      const regionKey = normalizeRegionName(result.region)
      const regionAdjustments = SCOTLAND_REGION_DELTAS[regionKey] || {}
      const adjustedLeaveShare = clampLeaveShare(
        typeof leaveShare === 'number' ? leaveShare : SCOTLAND_NATIONAL_LEAVE_SHARE
      )
      const tenureAdjustments = {
        snp: getScottishTenureAdjustment('SNP', tenureShare, tenureBaseline),
        conservative: getScottishTenureAdjustment('Conservative', tenureShare, tenureBaseline),
        labour: getScottishTenureAdjustment('Labour', tenureShare, tenureBaseline),
        libdem: getScottishTenureAdjustment('Liberal Democrat', tenureShare, tenureBaseline),
        green: getScottishTenureAdjustment('Green', tenureShare, tenureBaseline),
        reform: getScottishTenureAdjustment('Reform', tenureShare, tenureBaseline),
      }
      const ageAdjustments = {
        snp: getScottishAgeAdjustment('SNP', ageShare, ageBaseline),
        conservative: getScottishAgeAdjustment('Conservative', ageShare, ageBaseline),
        labour: getScottishAgeAdjustment('Labour', ageShare, ageBaseline),
        libdem: getScottishAgeAdjustment('Liberal Democrat', ageShare, ageBaseline),
        green: getScottishAgeAdjustment('Green', ageShare, ageBaseline),
        reform: getScottishAgeAdjustment('Reform', ageShare, ageBaseline),
      }
      const degreeAdjustments = {
        snp: getScottishDegreeAdjustment('SNP', degreeShare, degreeBaseline),
        conservative: getScottishDegreeAdjustment('Conservative', degreeShare, degreeBaseline),
        labour: getScottishDegreeAdjustment('Labour', degreeShare, degreeBaseline),
        libdem: getScottishDegreeAdjustment('Liberal Democrat', degreeShare, degreeBaseline),
        green: getScottishDegreeAdjustment('Green', degreeShare, degreeBaseline),
        reform: getScottishDegreeAdjustment('Reform', degreeShare, degreeBaseline),
      }
      const nssecAdjustments = {
        snp: getScottishNssecAdjustment('SNP', nssecShare, nssecBaseline),
        conservative: getScottishNssecAdjustment('Conservative', nssecShare, nssecBaseline),
        labour: getScottishNssecAdjustment('Labour', nssecShare, nssecBaseline),
        libdem: getScottishNssecAdjustment('Liberal Democrat', nssecShare, nssecBaseline),
        green: getScottishNssecAdjustment('Green', nssecShare, nssecBaseline),
        reform: getScottishNssecAdjustment('Reform', nssecShare, nssecBaseline),
      }
      const leaveAdjustments = {
        snp: getCenteredScottishPartyLeaveAdjustment('SNP', adjustedLeaveShare),
        conservative: getCenteredScottishPartyLeaveAdjustment('Conservative', adjustedLeaveShare),
        labour: getCenteredScottishPartyLeaveAdjustment('Labour', adjustedLeaveShare),
        libdem: getCenteredScottishPartyLeaveAdjustment('Liberal Democrat', adjustedLeaveShare),
        green: getCenteredScottishPartyLeaveAdjustment('Green', adjustedLeaveShare),
        reform: getCenteredScottishPartyLeaveAdjustment('Reform', adjustedLeaveShare),
      }
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
        snp:
          geShares?.SNP != null ? blendShare(baseShares.snp, geShares.SNP, geBlendWeight) : baseShares.snp,
        conservative:
          geShares?.Conservative != null
            ? blendShare(baseShares.conservative, geShares.Conservative, geBlendWeight)
            : baseShares.conservative,
        labour:
          geShares?.Labour != null
            ? blendShare(baseShares.labour, geShares.Labour, geBlendWeight)
            : baseShares.labour,
        libdem:
          geShares?.['Liberal Democrat'] != null
            ? blendShare(baseShares.libdem, geShares['Liberal Democrat'], geBlendWeight)
            : baseShares.libdem,
        green:
          geShares?.Green != null ? blendShare(baseShares.green, geShares.Green, geBlendWeight) : baseShares.green,
        reform:
          baseShares.reform === 0
            ? getRelativeScottishReformShare(geShares?.Reform)
            : geShares?.Reform != null
              ? blendShare(baseShares.reform, geShares.Reform, geBlendWeight)
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
        snp: Math.max(
          0,
          swingApplied.snp +
            tenureStrength * tenureAdjustments.snp +
            ageStrength * ageAdjustments.snp +
            degreeStrength * degreeAdjustments.snp +
            nssecStrength * nssecAdjustments.snp +
            leaveStrength * leaveAdjustments.snp +
            regionStrength * (regionAdjustments.SNP ?? 0)
        ),
        conservative: Math.max(
          0,
          swingApplied.conservative +
            tenureStrength * tenureAdjustments.conservative +
            ageStrength * ageAdjustments.conservative +
            degreeStrength * degreeAdjustments.conservative +
            nssecStrength * nssecAdjustments.conservative +
            leaveStrength * leaveAdjustments.conservative +
            regionStrength * (regionAdjustments.Conservative ?? 0)
        ),
        labour: Math.max(
          0,
          swingApplied.labour +
            tenureStrength * tenureAdjustments.labour +
            ageStrength * ageAdjustments.labour +
            degreeStrength * degreeAdjustments.labour +
            nssecStrength * nssecAdjustments.labour +
            leaveStrength * leaveAdjustments.labour +
            regionStrength * (regionAdjustments.Labour ?? 0)
        ),
        libdem: Math.max(
          0,
          swingApplied.libdem +
            tenureStrength * tenureAdjustments.libdem +
            ageStrength * ageAdjustments.libdem +
            degreeStrength * degreeAdjustments.libdem +
            nssecStrength * nssecAdjustments.libdem +
            leaveStrength * leaveAdjustments.libdem +
            regionStrength * (regionAdjustments['Liberal Democrat'] ?? 0)
        ),
        green: Math.max(
          0,
          swingApplied.green +
            tenureStrength * tenureAdjustments.green +
            ageStrength * ageAdjustments.green +
            degreeStrength * degreeAdjustments.green +
            nssecStrength * nssecAdjustments.green +
            leaveStrength * leaveAdjustments.green +
            regionStrength * (regionAdjustments.Green ?? 0)
        ),
        reform: Math.max(
          0,
          swingApplied.reform +
            tenureStrength * tenureAdjustments.reform +
            ageStrength * ageAdjustments.reform +
            degreeStrength * degreeAdjustments.reform +
            nssecStrength * nssecAdjustments.reform +
            leaveStrength * leaveAdjustments.reform +
            regionStrength * (regionAdjustments.Reform ?? 0)
        ),
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
      const projectedWinner = (
        Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      )
      const projectedWinnerLabel =
        projectedWinner === 'snp'
          ? 'SNP'
          : projectedWinner === 'conservative'
            ? 'Conservative'
            : projectedWinner === 'labour'
              ? 'Labour'
              : projectedWinner === 'libdem'
                ? 'Liberal Democrat'
                : projectedWinner === 'green'
                  ? 'Green'
                  : projectedWinner === 'reform'
                    ? 'Reform'
                    : projectedWinner === 'other'
                      ? 'Other'
                      : null
      map.set(name, { ...result, projected, projectedWinner: projectedWinnerLabel })
    }
    return map
  }, [
    constituencyAggregate,
    constituencyResults,
    geLookup,
    spcToWpcByName,
    spcCodeByName,
    wpcLeaveLookup,
    tenureLookup,
    ageLookup,
    degreeLookup,
    nssecLookup,
    geBlendWeight,
    tenureStrength,
    ageStrength,
    degreeStrength,
    nssecStrength,
    leaveStrength,
    regionStrength,
  ])

  const constituencyWinners = useMemo(() => {
    if (projectionSnapshot) return projectionSnapshot.constituencyRows
    return constituencyList.map(entry => {
      const result =
        projectedResults.get(entry.name) ||
        projectedResults.get(normalizeScottishConstituencyName(entry.name))
      return {
        ...entry,
        projectedWinner: result?.projectedWinner || 'Unknown',
      }
    })
  }, [projectionSnapshot, constituencyList, projectedResults])

  const constituencySeatsByRegion = useMemo(() => {
    if (projectionSnapshot) {
      const map = new Map<string, Record<string, number>>()
      projectionSnapshot.constituencyRows.forEach(entry => {
        const regionKey = normalizeRegionName(entry.region || 'Unknown')
        if (!map.has(regionKey)) map.set(regionKey, {})
        const bucket = map.get(regionKey) as Record<string, number>
        const party = entry.projectedWinner || 'Unknown'
        bucket[party] = (bucket[party] || 0) + 1
      })
      return map
    }
    const map = new Map<string, Record<string, number>>()
    constituencyWinners.forEach(entry => {
      const regionKey = normalizeRegionName(entry.region || 'Unknown')
      if (!map.has(regionKey)) map.set(regionKey, {})
      const bucket = map.get(regionKey) as Record<string, number>
      const party = entry.projectedWinner || 'Unknown'
      bucket[party] = (bucket[party] || 0) + 1
    })
    return map
  }, [projectionSnapshot, constituencyWinners])

  const regionalVotesByRegion = useMemo(() => {
    if (projectionSnapshot) return new Map<string, Record<string, number>>()
    if (!regionalAggregate) return new Map<string, Record<string, number>>()
    const map = new Map<string, Record<string, number>>()
    REGION_LABELS.forEach(({ key }) => {
      const adjustments = SCOTLAND_REGIONAL_LIST_DELTAS[key] || {}
      const raw = {
        SNP: Math.max(0, regionalAggregate.snp + (adjustments.SNP ?? 0)),
        Conservative: Math.max(
          0,
          regionalAggregate.conservative + (adjustments.Conservative ?? 0)
        ),
        Labour: Math.max(0, regionalAggregate.labour + (adjustments.Labour ?? 0)),
        'Liberal Democrat': Math.max(
          0,
          regionalAggregate.libdem + (adjustments['Liberal Democrat'] ?? 0)
        ),
        Green: Math.max(0, regionalAggregate.green + (adjustments.Green ?? 0)),
        Reform: Math.max(0, regionalAggregate.reform + (adjustments.Reform ?? 0)),
        Other: Math.max(0, regionalAggregate.other),
      }
      const total = Object.values(raw).reduce((sum, value) => sum + value, 0) || 1
      map.set(key, {
        SNP: (raw.SNP / total) * 100,
        Conservative: (raw.Conservative / total) * 100,
        Labour: (raw.Labour / total) * 100,
        'Liberal Democrat': (raw['Liberal Democrat'] / total) * 100,
        Green: (raw.Green / total) * 100,
        Reform: (raw.Reform / total) * 100,
        Other: (raw.Other / total) * 100,
      })
    })
    return map
  }, [projectionSnapshot, regionalAggregate])


  const regionalSeatsByRegion = useMemo(() => {
    if (projectionSnapshot) {
      return new Map(
        Object.entries(projectionSnapshot.regionalSeatsByRegion || {}).map(([region, seats]) => [
          region,
          seats,
        ])
      )
    }
    const map = new Map<string, Record<string, number>>()
    REGION_LABELS.forEach(({ key }) => {
      const votes = regionalVotesByRegion.get(key)
      if (!votes) return
      const constituencySeats = constituencySeatsByRegion.get(key) || {}
      const seats = allocateRegionalSeats(votes, constituencySeats)
      map.set(key, seats)
    })
    return map
  }, [projectionSnapshot, regionalVotesByRegion, constituencySeatsByRegion])

  const constituencySeatCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    constituencyWinners.forEach(entry => {
      const winner = entry.projectedWinner || 'Unknown'
      counts[winner] = (counts[winner] || 0) + 1
    })
    return counts
  }, [constituencyWinners])

  const regionalSeatCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const seats of regionalSeatsByRegion.values()) {
      Object.entries(seats).forEach(([party, count]) => {
        counts[party] = (counts[party] || 0) + count
      })
    }
    return counts
  }, [regionalSeatsByRegion])

  const combinedSeatCounts = useMemo(() => {
    if (projectionSnapshot) return projectionSnapshot.combinedSeatCounts || {}
    const counts: Record<string, number> = { ...constituencySeatCounts }
    Object.entries(regionalSeatCounts).forEach(([party, count]) => {
      counts[party] = (counts[party] || 0) + count
    })
    return counts
  }, [projectionSnapshot, constituencySeatCounts, regionalSeatCounts])

  const seatOrder = useMemo(() => {
    const entries = Object.entries(combinedSeatCounts)
    entries.sort((a, b) => b[1] - a[1])
    return entries.map(([party]) => party)
  }, [combinedSeatCounts])

  const seatAssignments = useMemo(() => {
    const seats: string[] = []
    seatOrder.forEach(party => {
      const count = combinedSeatCounts[party] || 0
      for (let i = 0; i < count; i += 1) {
        seats.push(party)
      }
    })
    return seats.slice(0, TOTAL_SEATS)
  }, [seatOrder, combinedSeatCounts])

  const hemicycle = useMemo(() => buildHemicyclePositions(SEAT_ROWS), [])

  const hemicycleDots = useMemo(() => {
    const ordered = [...hemicycle.dots].sort((a, b) => {
      if (a.angle !== b.angle) return b.angle - a.angle
      return b.radius - a.radius
    })
    return ordered.map((dot, index) => ({
      ...dot,
      party: seatAssignments[index] || 'Regional TBD',
    }))
  }, [hemicycle.dots, seatAssignments])

  const regionGroups = useMemo(() => {
    const groups = new Map<string, typeof constituencyWinners>()
    constituencyWinners.forEach(entry => {
      const regionKey = normalizeRegionName(entry.region || 'Unknown')
      if (!groups.has(regionKey)) groups.set(regionKey, [])
      groups.get(regionKey)?.push(entry)
    })
    const order = REGION_LABELS.map(item => item.key)
    const sorted = Array.from(groups.entries()).sort((a, b) => {
      const aIndex = order.indexOf(a[0])
      const bIndex = order.indexOf(b[0])
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
      }
      return a[0].localeCompare(b[0])
    })
    sorted.forEach(([, entries]) => entries.sort((a, b) => a.name.localeCompare(b.name)))
    return sorted
  }, [constituencyWinners])

  const seatSummary = useMemo(() => {
    return Object.entries(combinedSeatCounts)
      .map(([party, count]) => ({
        party,
        count,
        delta: count - (SCOTLAND_2021_SEAT_BASELINE[party] ?? 0),
      }))
      .sort((a, b) => b.count - a.count)
  }, [combinedSeatCounts])

  return (
    <PageShell>
      <ElectionFreezeNotice />
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Projected Scottish Parliament"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card poll-stack">
        <div className="poll-muted">
          Regional list seats are allocated using the d’Hondt method.
        </div>
      </div>
      <div className="poll-card poll-stack">
        <div className="poll-section-title">Projected Parliament (129 seats)</div>
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <svg
            viewBox={`0 0 ${HEMICYCLE_WIDTH} ${HEMICYCLE_HEIGHT}`}
            width="100%"
            height="380"
            role="img"
            aria-label="Projected Scottish Parliament hemicycle"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            {hemicycleDots.map((dot, index) => (
              <circle
                key={`${dot.party}-${index}`}
                className="poll-hemicycle-seat"
                cx={dot.x}
                cy={dot.y}
                r={5.5}
                fill={SCOTTISH_PARTY_COLORS[dot.party] || '#ccc'}
                stroke="rgba(0,0,0,0.08)"
                strokeWidth="1"
                style={{ animationDelay: `${index * 14}ms` }}
              >
                <title>{dot.party}</title>
              </circle>
            ))}
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem' }}>
            {seatSummary.map(item => {
              const deltaLabel =
                item.delta === 0
                  ? '-'
                  : item.delta > 0
                    ? `↑ ${item.delta}`
                    : `↓ ${Math.abs(item.delta)}`
              const deltaColor = item.delta > 0 ? '#1B8A3A' : item.delta < 0 ? '#B02A37' : '#666'
              return (
                <div key={item.party} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: SCOTTISH_PARTY_COLORS[item.party] || '#ccc',
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{item.party}</span>
                  <span style={{ color: 'var(--poll-nav-muted)' }}>{item.count}</span>
                  <span style={{ color: deltaColor }}>({deltaLabel})</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="poll-card poll-stack poll-projection-card">
        <div className="poll-section-title">Projected Constituencies by Region</div>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {regionGroups.map(([region, entries]) => (
            <div key={region} style={{ display: 'grid', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 160px 160px',
                  gap: '0.75rem',
                  alignItems: 'center',
                  padding: '0.45rem 0.6rem',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {REGION_LABELS.find(item => item.key === region)?.label || region}
                </div>
                <div style={{ fontWeight: 700, color: '#f8fafc', textAlign: 'left' }}>Incumbent</div>
                <div style={{ fontWeight: 700, color: '#f8fafc', textAlign: 'left' }}>Projected</div>
              </div>
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {entries.map(entry => (
                  <div
                    className="poll-projection-row"
                    key={entry.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 160px 160px',
                      gap: '0.75rem',
                      alignItems: 'center',
                      padding: '0.45rem 0.6rem',
                      borderBottom: '1px solid rgba(248, 250, 252, 0.1)',
                    }}
                  >
                    <a
                      href={`/scottish-map?constituency=${encodeURIComponent(entry.name)}`}
                      style={{ color: '#172033', textDecoration: 'none' }}
                    >
                      {entry.name}
                    </a>
                    <div style={{ color: SCOTTISH_PARTY_COLORS[entry.previousWinner2021 || 'Unknown'] }}>
                      {entry.previousWinner2021 || 'Unknown'}
                    </div>
                    <div style={{ color: SCOTTISH_PARTY_COLORS[entry.projectedWinner || 'Unknown'] }}>
                      {entry.projectedWinner || 'Unknown'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.6rem' }}>
                <div style={{ fontWeight: 600, color: '#f8fafc' }}>Regional list seats (7)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
                  {Object.entries(regionalSeatsByRegion.get(region) || {})
                    .filter(([, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([party, count]) => (
                      <div key={`${region}-${party}`} style={{ display: 'flex', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, color: SCOTTISH_PARTY_COLORS[party] || '#333' }}>
                          {party}
                        </span>
                        <span style={{ color: 'var(--poll-nav-muted)' }}>{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="poll-note">
        For more information on how the Scottish Parliament electoral system works, please click{' '}
        <a
          href="https://www.parliament.scot/-/media/files/spice/factsheets/parliamentary-business/scottish-parliament-electoral-system-12-may-2021.pdf"
          target="_blank"
          rel="noreferrer"
        >
          here
        </a>
        .
      </div>
    </PageShell>
  )
}
