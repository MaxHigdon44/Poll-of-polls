import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import {
  AGE_EFFECT_STRENGTH,
} from '@/lib/local2026/age'
import {
  DEGREE_EFFECT_STRENGTH,
} from '@/lib/local2026/degree'
import {
  GE_WEIGHT_GREEN,
  GE_WEIGHT_MAJOR,
  GE_WEIGHT_REFORM,
} from '@/lib/local2026/ge'
import {
  LEAVE_EFFECT_STRENGTH,
} from '@/lib/local2026/leaveRemain'
import {
  NSSEC_EFFECT_STRENGTH,
} from '@/lib/local2026/nssec'
import {
  REGION_EFFECT_STRENGTH,
} from '@/lib/local2026/region'
import {
  RURAL_URBAN_EFFECT_STRENGTH,
} from '@/lib/local2026/ruralUrban'
import {
  TENURE_EFFECT_STRENGTH,
} from '@/lib/local2026/tenure'
import type { EnglandLocalProjectionSnapshot } from '@/lib/local2026/councilProjections'
import { scrapeScottishPolls, scrapeWelshPolls } from '@/lib/scrapePolls'
import { loadScottishConstituencyResults } from '@/pages/api/scottish-constituency-results'
import {
  computeConstituencyAggregate,
  computeRegionalAggregate,
  computeScottishCombinedSeatCounts,
  computeScottishProjectedResults,
} from '@/pages/scottish-parliament-projection'
import {
  computeWelshAggregate,
  computeWelshProjectedConstituencies,
  computeWelshSeatCounts,
} from '@/pages/senedd-projection'

type HomeSummary = {
  country: 'England' | 'Scotland' | 'Wales'
  view: 'england' | 'scotland' | 'wales'
  metric: string
  rows: Array<{ party: string; count: number; delta: number }>
}

type AggregateRow = {
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

function readDataFile<T>(filename: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function normalizeName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeControlLabel(label: string | null) {
  if (!label) return 'No overall control'
  const normalized = normalizeName(label)
  if (normalized.includes('no overall control')) return 'No overall control'
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

function normalizeScottishConstituencyName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bislands\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function orderRows(
  counts: Record<string, number>,
  deltas: Record<string, number>,
  order: string[]
) {
  const orderMap = new Map(order.map((party, index) => [party, index]))
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return (orderMap.get(a[0]) ?? 999) - (orderMap.get(b[0]) ?? 999)
    })
    .map(([party, count]) => ({
      party,
      count,
      delta: deltas[party] || 0,
    }))
}

function toPagePoll(poll: any) {
  return {
    ...poll,
    poll_date: poll.poll_date ?? poll.pollDate ?? '',
    sample_size: poll.sample_size ?? poll.sampleSize ?? null,
  }
}

async function loadLatestWestminsterAggregate() {
  const results = await sql<AggregateRow>`
    SELECT labour, conservative, reform, libdem, green, snp, pc, others
    FROM aggregate_runs
    ORDER BY aggregate_date DESC
    LIMIT 1
  `
  return results.rows[0] || null
}

type SnapshotPayloadRow = {
  payload: EnglandLocalProjectionSnapshot
}

async function loadLatestEnglandSnapshot() {
  const results = await sql<SnapshotPayloadRow>`
    SELECT payload
    FROM projection_snapshots
    WHERE view_key = ${'england-local-2026'}
    ORDER BY snapshot_date DESC
    LIMIT 1
  `
  return results.rows[0]?.payload || null
}

function buildEnglandSummary(snapshot: EnglandLocalProjectionSnapshot | null): HomeSummary {
  const rows = snapshot?.councilRows || []

  const counts: Record<string, number> = {}
  const previousCounts: Record<string, number> = {}
  rows.forEach(row => {
    const key = normalizeControlLabel(row.projectedControl)
    counts[key] = (counts[key] || 0) + 1
    const previousKey = normalizeControlLabel(row.previousControl)
    previousCounts[previousKey] = (previousCounts[previousKey] || 0) + 1
  })
  const deltas: Record<string, number> = {}
  const parties = new Set([...Object.keys(counts), ...Object.keys(previousCounts)])
  parties.forEach(party => {
    deltas[party] = (counts[party] || 0) - (previousCounts[party] || 0)
  })

  return {
    country: 'England',
    view: 'england',
    metric: 'Projected council control',
    rows: orderRows(counts, deltas, [
      'Reform',
      'Liberal Democrat',
      'Conservative',
      'Labour',
      'Green',
      'Independent',
      'No overall control',
    ]),
  }
}

async function buildScotlandSummary(): Promise<HomeSummary> {
  const baseline: Record<string, number> = {
    SNP: 64,
    Conservative: 31,
    Labour: 22,
    'Liberal Democrat': 4,
    Green: 8,
    Reform: 0,
    Other: 0,
  }
  const [{ constituencyPolls, regionalPolls }, { results }] = await Promise.all([
    scrapeScottishPolls(90),
    loadScottishConstituencyResults(),
  ])
  const constituencyGeo = readDataFile<any>('scotland-constituencies.geojson')
  const geLookup = readDataFile<any>('ge2024-pcon.json')
  const spcToWpcLookup = readDataFile<any>('spc-to-wpc-lookup.json')
  const wpcLeaveLookup = readDataFile<any>('scotland-wpc-leave-share.json')
  const tenureLookup = readDataFile<any>('scotland-tenure-share.json')
  const ageLookup = readDataFile<any>('scotland-age-share.json')
  const degreeLookup = readDataFile<any>('scotland-degree-share.json')
  const nssecLookup = readDataFile<any>('scotland-nssec-share.json')

  const constituencyList = results.map(row => ({
    name: row.constituency,
    region: row.region ?? '',
    previousWinner2021: row.winner2021 ?? null,
  }))
  const constituencyResults = new Map<string, any>()
  results.forEach(row => {
    const value = {
      previousWinner2021: row.winner2021 ?? null,
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
  constituencyGeo?.features?.forEach((feature: any) => {
    const props = feature.properties || {}
    const name = props.SPC22NM || ''
    const code = props.SPC22CD || ''
    if (!name || !code) return
    spcCodeByName.set(normalizeScottishConstituencyName(name), code)
  })

  const spcToWpcByName = new Map<string, { code: string; name: string }>()
  ;(spcToWpcLookup?.results ?? []).forEach((row: any) => {
    if (!row?.primaryWpcCode) return
    spcToWpcByName.set(normalizeScottishConstituencyName(row.spcName), {
      code: row.primaryWpcCode,
      name: row.primaryWpcName || '',
    })
  })

  const projectedResults = computeScottishProjectedResults({
    constituencyAggregate: computeConstituencyAggregate(constituencyPolls.map(toPagePoll)),
    constituencyResults,
    geLookup,
    spcToWpcByName,
    spcCodeByName,
    wpcLeaveLookup,
    tenureLookup,
    ageLookup,
    degreeLookup,
    nssecLookup,
    geBlendWeight: 0.05,
    tenureStrength: 0.7,
    ageStrength: 0.6,
    degreeStrength: 3,
    nssecStrength: 4,
    leaveStrength: 0.5,
    regionStrength: 0.7,
  })

  const counts = computeScottishCombinedSeatCounts({
    constituencyList,
    projectedResults,
    regionalAggregate: computeRegionalAggregate(regionalPolls.map(toPagePoll)),
  })
  const deltas: Record<string, number> = {}
  const parties = new Set([...Object.keys(counts), ...Object.keys(baseline)])
  parties.forEach(party => {
    deltas[party] = (counts[party] || 0) - (baseline[party] || 0)
  })

  return {
    country: 'Scotland',
    view: 'scotland',
    metric: 'Projected MSPs',
    rows: orderRows(counts, deltas, [
      'SNP',
      'Labour',
      'Conservative',
      'Liberal Democrat',
      'Green',
      'Reform',
      'Other',
      'Unknown',
    ]),
  }
}

async function buildWalesSummary(): Promise<HomeSummary> {
  const baseline: Record<string, number> = {
    Labour: 30,
    Conservative: 16,
    'Plaid Cymru': 13,
    'Liberal Democrat': 1,
    Reform: 0,
    Green: 0,
    Other: 0,
  }
  const { polls } = await scrapeWelshPolls(90)
  const lookup = readDataFile<any>('senedd-to-wpc-lookup.json')
  const gePcon = readDataFile<any>('ge2024-pcon.json')
  const leaveLookup = readDataFile<any>('leave-share.json')
  const ageLookup = readDataFile<any>('age-share.json')
  const tenureLookup = readDataFile<any>('tenure-share.json')
  const nssecLookup = readDataFile<any>('nssec-share.json')
  const degreeLookup = readDataFile<any>('degree-share.json')
  const ruralLookup = readDataFile<any>('rural-urban-share.json')
  const wardToSenedd = readDataFile<any>('ward-to-senedd.json')

  const projectedConstituencies = computeWelshProjectedConstituencies({
    lookup,
    gePcon,
    aggregate: computeWelshAggregate(polls.map(toPagePoll)),
    leaveLookup,
    ageLookup,
    tenureLookup,
    nssecLookup,
    degreeLookup,
    ruralLookup,
    wardToSenedd,
  })
  const counts = computeWelshSeatCounts(projectedConstituencies)
  const deltas: Record<string, number> = {}
  const parties = new Set([...Object.keys(counts), ...Object.keys(baseline)])
  parties.forEach(party => {
    deltas[party] = (counts[party] || 0) - (baseline[party] || 0)
  })

  return {
    country: 'Wales',
    view: 'wales',
    metric: 'Projected MSs',
    rows: orderRows(counts, deltas, [
      'Plaid Cymru',
      'Labour',
      'Reform',
      'Conservative',
      'Liberal Democrat',
      'Green',
      'Other',
    ]),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const [englandSnapshot, scotland, wales] = await Promise.all([
      loadLatestEnglandSnapshot(),
      buildScotlandSummary(),
      buildWalesSummary(),
    ])
    const england = buildEnglandSummary(englandSnapshot)
    const summaries = [england, scotland, wales]
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ summaries })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to build home summaries' })
  }
}
