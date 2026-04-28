import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { computeWalesProjectionSnapshot, type WalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'
import { scrapeWelshPolls } from '@/lib/scrapePolls'

type SnapshotRow = {
  run_id: number
  snapshot_date: string
  payload: WalesProjectionSnapshot
}

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

function readDataFile<T>(filename: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function compareSnapshots(snapshot: WalesProjectionSnapshot, fresh: WalesProjectionSnapshot) {
  const constituencyDiffs: Array<Record<string, unknown>> = []
  const snapshotRows = new Map((snapshot.projectedConstituencies || []).map(row => [row.name, row]))
  const freshRows = new Map((fresh.projectedConstituencies || []).map(row => [row.name, row]))
  const allNames = new Set([...snapshotRows.keys(), ...freshRows.keys()])

  for (const name of allNames) {
    const left = snapshotRows.get(name)
    const right = freshRows.get(name)
    if (!left || !right) {
      constituencyDiffs.push({ name, issue: !left ? 'missing-in-snapshot' : 'missing-in-fresh' })
      continue
    }
    const parties = new Set([...Object.keys(left.seats || {}), ...Object.keys(right.seats || {})])
    for (const party of parties) {
      if ((left.seats?.[party] ?? 0) !== (right.seats?.[party] ?? 0)) {
        constituencyDiffs.push({
          name,
          party,
          issue: 'seat-mismatch',
          snapshot: left.seats?.[party] ?? 0,
          fresh: right.seats?.[party] ?? 0,
        })
        break
      }
    }
  }

  const seatDiffs: Array<Record<string, unknown>> = []
  const seatParties = new Set([
    ...Object.keys(snapshot.seatCounts || {}),
    ...Object.keys(fresh.seatCounts || {}),
  ])
  for (const party of seatParties) {
    const left = snapshot.seatCounts?.[party] ?? 0
    const right = fresh.seatCounts?.[party] ?? 0
    if (left !== right) {
      seatDiffs.push({ party, issue: 'total-seat-mismatch', snapshot: left, fresh: right })
    }
  }

  return {
    matches: constituencyDiffs.length === 0 && seatDiffs.length === 0,
    constituencyDiffCount: constituencyDiffs.length,
    seatDiffCount: seatDiffs.length,
    constituencyDiffSamples: constituencyDiffs.slice(0, 10),
    seatDiffSamples: seatDiffs.slice(0, 10),
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
      WHERE view_key = ${'wales-senedd'}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `
    const snapshot = snapshotResult.rows[0]
    if (!snapshot?.payload) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }

    const { polls } = await scrapeWelshPolls(90)
    const fresh = computeWalesProjectionSnapshot({
      generatedAt: snapshot.payload.generatedAt,
      polls,
      lookup: readDataFile('senedd-to-wpc-lookup.json'),
      gePcon: readDataFile('ge2024-pcon.json'),
      leaveLookup: readDataFile('leave-share.json'),
      ageLookup: readDataFile('age-share.json'),
      tenureLookup: readDataFile('tenure-share.json'),
      nssecLookup: readDataFile('nssec-share.json'),
      degreeLookup: readDataFile('degree-share.json'),
      ruralLookup: readDataFile('rural-urban-share.json'),
      wardToSenedd: readDataFile('ward-to-senedd.json'),
    })

    return res.status(200).json({
      runId: snapshot.run_id,
      snapshotDate: snapshot.snapshot_date,
      cachedGeneratedAt: snapshot.payload.generatedAt,
      freshGeneratedAt: fresh.generatedAt,
      note: 'Wales compare recomputes from current source data rather than stored historical polls.',
      ...compareSnapshots(snapshot.payload, fresh),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to compare snapshot' })
  }
}
