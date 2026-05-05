import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { computeScottishProjectionSnapshot, type ScotlandProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'
import { scrapeScottishPolls } from '@/lib/scrapePolls'
import { loadScottishConstituencyResults } from '@/pages/api/scottish-constituency-results'
import { loadScotlandProjectionInputs } from '@/lib/server/projectionData'

type SnapshotRow = {
  run_id: number
  snapshot_date: string
  payload: ScotlandProjectionSnapshot
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

function almostEqual(a: number, b: number, epsilon = 1e-9) {
  return Math.abs(a - b) <= epsilon
}

function compareSnapshots(snapshot: ScotlandProjectionSnapshot, fresh: ScotlandProjectionSnapshot) {
  const constituencyDiffs: Array<Record<string, unknown>> = []
  const snapshotRows = new Map((snapshot.constituencyRows || []).map(row => [row.name, row]))
  const freshRows = new Map((fresh.constituencyRows || []).map(row => [row.name, row]))
  const allNames = new Set([...snapshotRows.keys(), ...freshRows.keys()])

  for (const name of allNames) {
    const left = snapshotRows.get(name)
    const right = freshRows.get(name)
    if (!left || !right) {
      constituencyDiffs.push({ name, issue: !left ? 'missing-in-snapshot' : 'missing-in-fresh' })
      continue
    }
    if (
      left.region !== right.region ||
      left.previousWinner2021 !== right.previousWinner2021 ||
      left.projectedWinner !== right.projectedWinner
    ) {
      constituencyDiffs.push({
        name,
        issue: 'winner-mismatch',
        snapshot: {
          region: left.region,
          previousWinner2021: left.previousWinner2021,
          projectedWinner: left.projectedWinner,
        },
        fresh: {
          region: right.region,
          previousWinner2021: right.previousWinner2021,
          projectedWinner: right.projectedWinner,
        },
      })
      continue
    }
    const partyKeys = new Set([
      ...Object.keys(left.projected || {}),
      ...Object.keys(right.projected || {}),
    ])
    for (const party of partyKeys) {
      const leftValue = Number(left.projected?.[party as keyof NonNullable<typeof left.projected>] ?? 0)
      const rightValue = Number(right.projected?.[party as keyof NonNullable<typeof right.projected>] ?? 0)
      if (!almostEqual(leftValue, rightValue)) {
        constituencyDiffs.push({
          name,
          issue: 'share-mismatch',
          party,
          snapshot: leftValue,
          fresh: rightValue,
        })
        break
      }
    }
  }

  const seatDiffs: Array<Record<string, unknown>> = []
  const seatParties = new Set([
    ...Object.keys(snapshot.combinedSeatCounts || {}),
    ...Object.keys(fresh.combinedSeatCounts || {}),
  ])
  for (const party of seatParties) {
    const left = snapshot.combinedSeatCounts?.[party] ?? 0
    const right = fresh.combinedSeatCounts?.[party] ?? 0
    if (left !== right) {
      seatDiffs.push({ party, issue: 'combined-seat-mismatch', snapshot: left, fresh: right })
    }
  }

  const regionDiffs: Array<Record<string, unknown>> = []
  const regions = new Set([
    ...Object.keys(snapshot.regionalSeatsByRegion || {}),
    ...Object.keys(fresh.regionalSeatsByRegion || {}),
  ])
  for (const region of regions) {
    const left = snapshot.regionalSeatsByRegion?.[region] || {}
    const right = fresh.regionalSeatsByRegion?.[region] || {}
    const parties = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const party of parties) {
      if ((left[party] ?? 0) !== (right[party] ?? 0)) {
        regionDiffs.push({
          region,
          party,
          issue: 'regional-seat-mismatch',
          snapshot: left[party] ?? 0,
          fresh: right[party] ?? 0,
        })
        break
      }
    }
  }

  return {
    matches: constituencyDiffs.length === 0 && seatDiffs.length === 0 && regionDiffs.length === 0,
    constituencyDiffCount: constituencyDiffs.length,
    seatDiffCount: seatDiffs.length,
    regionDiffCount: regionDiffs.length,
    constituencyDiffSamples: constituencyDiffs.slice(0, 10),
    seatDiffSamples: seatDiffs.slice(0, 10),
    regionDiffSamples: regionDiffs.slice(0, 10),
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const snapshotResult = await sql<SnapshotRow>`
      SELECT run_id, snapshot_date, payload
      FROM projection_snapshots
      WHERE view_key = ${'scotland-parliament'}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `
    const snapshot = snapshotResult.rows[0]
    if (!snapshot?.payload) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }

    const [{ constituencyPolls, regionalPolls }, { results }] = await Promise.all([
      scrapeScottishPolls(90),
      loadScottishConstituencyResults(),
    ])
    const inputs = loadScotlandProjectionInputs()

    const fresh = computeScottishProjectionSnapshot({
      generatedAt: snapshot.payload.generatedAt,
      constituencyPolls,
      regionalPolls,
      constituencyResultsRows: results,
      ...inputs,
    })

    return res.status(200).json({
      runId: snapshot.run_id,
      snapshotDate: snapshot.snapshot_date,
      cachedGeneratedAt: snapshot.payload.generatedAt,
      freshGeneratedAt: fresh.generatedAt,
      note: 'Scotland compare recomputes from current source data rather than stored historical polls.',
      ...compareSnapshots(snapshot.payload, fresh),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to compare snapshot' })
  }
}
