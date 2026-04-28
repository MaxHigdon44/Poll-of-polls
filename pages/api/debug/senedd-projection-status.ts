import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import type { WalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await sql<SnapshotRow>`
      SELECT run_id, snapshot_date, payload
      FROM projection_snapshots
      WHERE view_key = ${'wales-senedd'}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `
    const row = result.rows[0]
    if (!row) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }

    return res.status(200).json({
      runId: row.run_id,
      snapshotDate: row.snapshot_date,
      generatedAt: row.payload.generatedAt,
      constituencyCount: row.payload.projectedConstituencies?.length || 0,
      seatPartyCount: Object.keys(row.payload.seatCounts || {}).length,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load snapshot status' })
  }
}
