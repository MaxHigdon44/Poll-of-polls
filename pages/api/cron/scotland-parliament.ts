import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { computeScottishProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'
import { scrapeScottishPolls } from '@/lib/scrapePolls'

type AggregateRunRow = {
  run_id: number
  aggregate_date: string
}

type ScotlandSnapshotArgs = Parameters<typeof computeScottishProjectionSnapshot>[0]

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

function getBaseUrl(req: NextApiRequest) {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '')
  const proto = protoHeader.split(',')[0]?.trim() || 'https'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    ?.trim()
  if (!host) {
    throw new Error('Missing host header')
  }
  return `${proto}://${host}`
}

async function fetchJson<T>(baseUrl: string, relativePath: string): Promise<T> {
  const response = await fetch(`${baseUrl}${relativePath}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${relativePath}: ${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
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
    const baseUrl = getBaseUrl(req)
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

    const [
      { constituencyPolls, regionalPolls },
      { results },
      constituencyGeo,
      geLookup,
      spcToWpcLookup,
      wpcLeaveLookup,
      tenureLookup,
      ageLookup,
      degreeLookup,
      nssecLookup,
    ] = await Promise.all([
      scrapeScottishPolls(90),
      fetchJson<{ results: ScotlandSnapshotArgs['constituencyResultsRows'] }>(
        baseUrl,
        '/api/scottish-constituency-results'
      ),
      fetchJson<ScotlandSnapshotArgs['constituencyGeo']>(baseUrl, '/data/scotland-constituencies.geojson'),
      fetchJson<ScotlandSnapshotArgs['geLookup']>(baseUrl, '/data/ge2024-pcon.json'),
      fetchJson<ScotlandSnapshotArgs['spcToWpcLookup']>(baseUrl, '/data/spc-to-wpc-lookup.json'),
      fetchJson<ScotlandSnapshotArgs['wpcLeaveLookup']>(baseUrl, '/data/scotland-wpc-leave-share.json'),
      fetchJson<ScotlandSnapshotArgs['tenureLookup']>(baseUrl, '/data/scotland-tenure-share.json'),
      fetchJson<ScotlandSnapshotArgs['ageLookup']>(baseUrl, '/data/scotland-age-share.json'),
      fetchJson<ScotlandSnapshotArgs['degreeLookup']>(baseUrl, '/data/scotland-degree-share.json'),
      fetchJson<ScotlandSnapshotArgs['nssecLookup']>(baseUrl, '/data/scotland-nssec-share.json'),
    ])
    const snapshot = computeScottishProjectionSnapshot({
      generatedAt: aggregate.aggregate_date,
      constituencyPolls,
      regionalPolls,
      constituencyResultsRows: results,
      constituencyGeo,
      geLookup,
      spcToWpcLookup,
      wpcLeaveLookup,
      tenureLookup,
      ageLookup,
      degreeLookup,
      nssecLookup,
    })

    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${aggregate.run_id}, ${aggregate.aggregate_date}, ${'scotland-parliament'}, ${JSON.stringify(snapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `

    return res.status(200).json({
      runId: aggregate.run_id,
      view: 'scotland-parliament',
      generatedAt: aggregate.aggregate_date,
    })
  } catch (err) {
    console.error(err)
    const detail = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Failed to build Scotland snapshot', detail })
  }
}
