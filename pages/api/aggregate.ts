import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'

type AggregateRow = {
  aggregate_date: string
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
  lead_party: string | null
  lead_value: number | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const results = await sql<AggregateRow>`
      SELECT aggregate_date, labour, conservative, reform, libdem, green, snp, pc, others, lead_party, lead_value
      FROM aggregate_runs
      ORDER BY aggregate_date DESC
      LIMIT 365
    `
    return res.status(200).json({ aggregates: results.rows })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load aggregate series' })
  }
}
