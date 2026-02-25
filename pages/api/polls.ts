import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'

type PollRow = {
  poll_date: string
  pollster: string
  sample_size: number | null
  area: string | null
  labour: number | null
  conservative: number | null
  libdem: number | null
  green: number | null
  reform: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const runResult = await sql<{ id: number }>`
      SELECT id
      FROM poll_runs
      WHERE success = true
      ORDER BY run_date DESC
      LIMIT 1
    `

    if (runResult.rowCount === 0) {
      return res.status(200).json({ polls: [], runId: null })
    }

    const runId = runResult.rows[0].id
    const pollsResult = await sql<PollRow>`
      SELECT poll_date, pollster, sample_size, area,
        labour, conservative, libdem, green, reform, snp, pc, others
      FROM polls
      WHERE run_id = ${runId}
      ORDER BY poll_date DESC, pollster ASC
    `

    return res.status(200).json({ polls: pollsResult.rows, runId })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load polling data' })
  }
}
