import {
  SCOTLAND_AGE_EFFECT_STRENGTH,
} from '@/lib/scotland/age'
import {
  SCOTLAND_DEGREE_EFFECT_STRENGTH,
} from '@/lib/scotland/degree'
import {
  SCOTLAND_LEAVE_EFFECT_STRENGTH,
} from '@/lib/scotland/leaveRemain'
import {
  SCOTLAND_NSSEC_EFFECT_STRENGTH,
} from '@/lib/scotland/nssec'
import {
  SCOTLAND_TENURE_EFFECT_STRENGTH,
} from '@/lib/scotland/tenure'
import {
  computeConstituencyAggregate,
  computeRegionalAggregate,
  computeScottishCombinedSeatCounts,
  computeScottishProjectedResults,
} from '@/pages/scottish-parliament-projection'

type ScottishPoll = Parameters<typeof computeConstituencyAggregate>[0][number]

const DEFAULT_SCOTLAND_GE_BLEND_WEIGHT = 0.05
const DEFAULT_SCOTLAND_REGION_STRENGTH = 0.7

function normalizeScottishConstituencyName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bislands\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizePartyLabel(value: string | null) {
  if (!value) return null
  const allowed = new Set([
    'SNP',
    'Conservative',
    'Labour',
    'Liberal Democrat',
    'Green',
    'Reform',
    'Other',
    'Unknown',
  ])
  return allowed.has(value) ? value : null
}

function toPagePoll<T extends Record<string, unknown>>(poll: T): ScottishPoll {
  return {
    ...poll,
    poll_date: String(poll.poll_date ?? poll.pollDate ?? ''),
    pollster: String(poll.pollster ?? ''),
    sample_size:
      typeof poll.sample_size === 'number'
        ? poll.sample_size
        : typeof poll.sampleSize === 'number'
          ? poll.sampleSize
          : null,
    labour: typeof poll.labour === 'number' ? poll.labour : null,
    conservative: typeof poll.conservative === 'number' ? poll.conservative : null,
    reform: typeof poll.reform === 'number' ? poll.reform : null,
    libdem: typeof poll.libdem === 'number' ? poll.libdem : null,
    green: typeof poll.green === 'number' ? poll.green : null,
    snp: typeof poll.snp === 'number' ? poll.snp : null,
    others: typeof poll.others === 'number' ? poll.others : null,
  }
}

export type ScotlandProjectionSnapshot = {
  generatedAt: string
  constituencyRows: Array<{
    name: string
    region: string
    previousWinner2021: string | null
    projectedWinner: string
  }>
  regionalSeatsByRegion: Record<string, Record<string, number>>
  combinedSeatCounts: Record<string, number>
}

type ScottishConstituencyResultRow = {
  constituency: string
  region: string | null
  winner2021: string | null
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
}

export function computeScottishProjectionSnapshot(args: {
  generatedAt: string
  constituencyPolls: Array<Record<string, unknown>>
  regionalPolls: Array<Record<string, unknown>>
  constituencyResultsRows: ScottishConstituencyResultRow[]
  constituencyGeo: any
  geLookup: any
  spcToWpcLookup: any
  wpcLeaveLookup: any
  tenureLookup: any
  ageLookup: any
  degreeLookup: any
  nssecLookup: any
}) {
  const constituencyList = args.constituencyResultsRows.map(row => ({
    name: row.constituency,
    region: row.region ?? '',
    previousWinner2021: sanitizePartyLabel(row.winner2021 ?? null),
  }))

  const constituencyResults = new Map<string, any>()
  args.constituencyResultsRows.forEach(row => {
    const value = {
      previousWinner2021: sanitizePartyLabel(row.winner2021 ?? null),
      region: row.region ?? '',
      msp2021: row.msp2021 ?? null,
      turnout: row.turnout ?? null,
      majority: row.majority ?? null,
      shares: row.shares ?? {},
    }
    constituencyResults.set(row.constituency, value)
    constituencyResults.set(normalizeScottishConstituencyName(row.constituency), value)
  })

  const spcCodeByName = new Map<string, string>()
  args.constituencyGeo?.features?.forEach((feature: any) => {
    const props = feature.properties || {}
    const name = props.SPC22NM || ''
    const code = props.SPC22CD || ''
    if (!name || !code) return
    spcCodeByName.set(normalizeScottishConstituencyName(name), code)
  })

  const spcToWpcByName = new Map<string, { code: string; name: string }>()
  ;(args.spcToWpcLookup?.results ?? []).forEach((row: any) => {
    if (!row?.primaryWpcCode) return
    spcToWpcByName.set(normalizeScottishConstituencyName(row.spcName), {
      code: row.primaryWpcCode,
      name: row.primaryWpcName || '',
    })
  })

  const projectedResults = computeScottishProjectedResults({
    constituencyAggregate: computeConstituencyAggregate(args.constituencyPolls.map(toPagePoll)),
    constituencyResults,
    geLookup: args.geLookup,
    spcToWpcByName,
    spcCodeByName,
    wpcLeaveLookup: args.wpcLeaveLookup,
    tenureLookup: args.tenureLookup,
    ageLookup: args.ageLookup,
    degreeLookup: args.degreeLookup,
    nssecLookup: args.nssecLookup,
    geBlendWeight: DEFAULT_SCOTLAND_GE_BLEND_WEIGHT,
    tenureStrength: SCOTLAND_TENURE_EFFECT_STRENGTH,
    ageStrength: SCOTLAND_AGE_EFFECT_STRENGTH,
    degreeStrength: SCOTLAND_DEGREE_EFFECT_STRENGTH,
    nssecStrength: SCOTLAND_NSSEC_EFFECT_STRENGTH,
    leaveStrength: SCOTLAND_LEAVE_EFFECT_STRENGTH,
    regionStrength: DEFAULT_SCOTLAND_REGION_STRENGTH,
  })

  const combinedSeatCounts = computeScottishCombinedSeatCounts({
    constituencyList,
    projectedResults,
    regionalAggregate: computeRegionalAggregate(args.regionalPolls.map(toPagePoll)),
  })

  const constituencyRows = constituencyList.map(entry => {
    const result =
      projectedResults.get(entry.name) ||
      projectedResults.get(normalizeScottishConstituencyName(entry.name))
    return {
      ...entry,
      projectedWinner: result?.projectedWinner || 'Unknown',
    }
  })

  const regionalSeatsByRegion: Record<string, Record<string, number>> = {}
  constituencyRows.forEach(entry => {
    const regionKey = String(entry.region || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^north east$/, 'north east scotland')
      .replace(/^highlands$/, 'highlands and islands')
      .replace(/^south$/, 'south scotland')
      .replace(/^west$/, 'west scotland')
      .replace(/^central scotland$/, 'central')
      .replace(/^lothian$/, 'lothians')
      .replace(/^mid and fife$/, 'mid scotland and fife')
      .replace(/^mid scotland & fife$/, 'mid scotland and fife')

    if (!regionalSeatsByRegion[regionKey]) regionalSeatsByRegion[regionKey] = {}
  })

  const regionalVotesByRegion = new Map<string, Record<string, number>>()
  const regionalAggregate = computeRegionalAggregate(args.regionalPolls.map(toPagePoll))
  if (regionalAggregate) {
    const regionAdjustments: Record<string, Record<string, number>> = {
      'north east scotland': { SNP: -0.47, Conservative: 5.53, Labour: -6.23, 'Liberal Democrat': -0.33, Green: -1.2, Reform: 3.27 },
      'highlands and islands': { SNP: 0.3, Conservative: -0.47, Labour: -7.87, 'Liberal Democrat': 10.97, Green: -3.8, Reform: 0.2 },
      'south scotland': { SNP: 0.93, Conservative: 3.67, Labour: -1.77, 'Liberal Democrat': -2.9, Green: -1.4, Reform: 3.3 },
      'west scotland': { SNP: -1.43, Conservative: -2.43, Labour: 6.67, 'Liberal Democrat': -0.1, Green: -1.5, Reform: -0.53 },
      central: { SNP: 5.6, Conservative: -3.13, Labour: 3.4, 'Liberal Democrat': -4.5, Green: -1.63, Reform: 0.93 },
      'mid scotland and fife': { SNP: -1.43, Conservative: 2.67, Labour: -0.73, 'Liberal Democrat': 0.9, Green: -3.1, Reform: 1.37 },
      lothians: { SNP: -1.7, Conservative: -3.4, Labour: 3.1, 'Liberal Democrat': 2.43, Green: 4.4, Reform: -3.17 },
      glasgow: { SNP: 3.7, Conservative: -6.17, Labour: 3.7, 'Liberal Democrat': -4.63, Green: 8.43, Reform: -0.07 },
    }
    Object.keys(regionAdjustments).forEach(key => {
      const adjustments = regionAdjustments[key] || {}
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

  const constituencySeatsByRegion: Record<string, Record<string, number>> = {}
  constituencyRows.forEach(entry => {
    const regionKey = String(entry.region || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^north east$/, 'north east scotland')
      .replace(/^highlands$/, 'highlands and islands')
      .replace(/^south$/, 'south scotland')
      .replace(/^west$/, 'west scotland')
      .replace(/^central scotland$/, 'central')
      .replace(/^lothian$/, 'lothians')
      .replace(/^mid and fife$/, 'mid scotland and fife')
      .replace(/^mid scotland & fife$/, 'mid scotland and fife')
    if (!constituencySeatsByRegion[regionKey]) constituencySeatsByRegion[regionKey] = {}
    const party = entry.projectedWinner || 'Unknown'
    constituencySeatsByRegion[regionKey][party] = (constituencySeatsByRegion[regionKey][party] || 0) + 1
  })

  for (const [regionKey, votes] of regionalVotesByRegion.entries()) {
    const seats = allocateRegionalSeats(votes, constituencySeatsByRegion[regionKey] || {})
    regionalSeatsByRegion[regionKey] = seats
  }

  return {
    generatedAt: args.generatedAt,
    constituencyRows,
    regionalSeatsByRegion,
    combinedSeatCounts,
  } satisfies ScotlandProjectionSnapshot
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
