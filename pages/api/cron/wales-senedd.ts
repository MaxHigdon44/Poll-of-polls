import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { computeWalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'
import { scrapeWelshPolls } from '@/lib/scrapePolls'
import { loadWalesProjectionInputs } from '@/lib/server/walesProjectionData'

type AggregateRunRow = {
  run_id: number
  aggregate_date: string
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
    const aggregateResult = await sql<AggregateRunRow>`
      SELECT run_id, aggregate_date
      FROM aggregate_runs
      ORDER BY aggregate_date DESC
      LIMIT 1
    `
    const aggregate = aggregateResult.rows[0]
    if (!aggregate) {
      return res.status(404).json({ error: 'Aggregate not found' })
    }

    const { polls } = await scrapeWelshPolls(90)
    const snapshot = computeWalesProjectionSnapshot({
      generatedAt: aggregate.aggregate_date,
      polls,
      ...loadWalesProjectionInputs(),
    })

    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${aggregate.run_id}, ${aggregate.aggregate_date}, ${'wales-senedd'}, ${JSON.stringify(snapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `

    return res.status(200).json({
      runId: aggregate.run_id,
      view: 'wales-senedd',
      generatedAt: aggregate.aggregate_date,
    })
  } catch (err) {
    console.error(err)
    const detail = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Failed to build Wales snapshot', detail })
  }
}
