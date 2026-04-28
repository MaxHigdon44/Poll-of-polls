import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import type { WalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'

type SnapshotRow = {
  payload: WalesProjectionSnapshot
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const result = await sql<SnapshotRow>`
      SELECT payload
      FROM projection_snapshots
      WHERE view_key = ${'wales-senedd'}
      ORDER BY snapshot_date DESC
      LIMIT 1
    `
    const snapshot = result.rows[0]?.payload || null
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }
    return res.status(200).json(snapshot)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load snapshot' })
  }
}
