import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import type { EnglandLocalProjectionSnapshot } from '@/lib/local2026/councilProjections'
import type { ScotlandProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'
import type { WalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'

type HomeSummary = {
  country: 'England' | 'Scotland' | 'Wales'
  view: 'england' | 'scotland' | 'wales'
  metric: string
  rows: Array<{ party: string; count: number; delta: number }>
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

async function loadLatestSnapshot<T>(viewKey: string) {
  const results = await sql<{ payload: T }>`
    SELECT payload
    FROM projection_snapshots
    WHERE view_key = ${viewKey}
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

function buildScotlandSummary(snapshot: ScotlandProjectionSnapshot | null): HomeSummary {
  const baseline: Record<string, number> = {
    SNP: 64,
    Conservative: 31,
    Labour: 22,
    'Liberal Democrat': 4,
    Green: 8,
    Reform: 0,
    Other: 0,
  }
  const counts = snapshot?.combinedSeatCounts || {}
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

function buildWalesSummary(snapshot: WalesProjectionSnapshot | null): HomeSummary {
  const baseline: Record<string, number> = {
    Labour: 30,
    Conservative: 16,
    'Plaid Cymru': 13,
    'Liberal Democrat': 1,
    Reform: 0,
    Green: 0,
    Other: 0,
  }
  const counts = snapshot?.seatCounts || {}
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
    const [englandSnapshot, scotlandSnapshot, walesSnapshot] = await Promise.all([
      loadLatestSnapshot<EnglandLocalProjectionSnapshot>('england-local-2026'),
      loadLatestSnapshot<ScotlandProjectionSnapshot>('scotland-parliament'),
      loadLatestSnapshot<WalesProjectionSnapshot>('wales-senedd'),
    ])
    const scotland = buildScotlandSummary(scotlandSnapshot)
    const wales = buildWalesSummary(walesSnapshot)
    const england = buildEnglandSummary(englandSnapshot)
    const summaries = [england, scotland, wales]
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ summaries })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to build home summaries' })
  }
}
