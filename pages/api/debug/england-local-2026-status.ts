import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import type { EnglandLocalProjectionSnapshot } from '@/lib/local2026/councilProjections'

type SnapshotRow = {
  run_id: number
  snapshot_date: string
  payload: EnglandLocalProjectionSnapshot
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
      WHERE view_key = ${'england-local-2026'}
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
      wardCount: Object.keys(row.payload.wardsByCode || {}).length,
      councilRowCount: row.payload.councilRows?.length || 0,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load snapshot status' })
  }
}
