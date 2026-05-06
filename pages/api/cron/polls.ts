import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { scrapePolls } from '../../../lib/scrapePolls'
import { computeAggregate } from '../../../lib/aggregate'

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

function getBaseUrl(req: NextApiRequest) {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '')
  const proto = protoHeader.split(',')[0]?.trim() || 'https'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]?.trim()
  if (!host) {
    throw new Error('Missing host header')
  }
  return `${proto}://${host}`
}

async function triggerProjection(baseUrl: string, path: string, secret: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  })

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    throw new Error(`Projection refresh failed for ${path}: ${response.status} ${JSON.stringify(body)}`)
  }

  return body
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const runDate = new Date()
  runDate.setUTCHours(0, 0, 0, 0)

  let runId: number | null = null

  try {
    const { sourceUrl, polls } = await scrapePolls(2)

    const runResult = await sql<{ id: number }>`
      INSERT INTO poll_runs (run_date, source_url, success)
      VALUES (${runDate.toISOString()}, ${sourceUrl}, true)
      ON CONFLICT (run_date)
      DO UPDATE SET source_url = EXCLUDED.source_url, success = EXCLUDED.success
      RETURNING id
    `
    runId = runResult.rows[0].id

    await sql`DELETE FROM polls WHERE run_id = ${runId}`
    await sql`DELETE FROM aggregate_runs WHERE run_id = ${runId}`

    for (const poll of polls) {
      await sql`
        INSERT INTO polls (
          run_id, poll_date, poll_date_label, pollster, sample_size, area,
          labour, conservative, libdem, green, reform, snp, pc, others
        )
        VALUES (
          ${runId}, ${poll.pollDate}, ${poll.pollDateLabel}, ${poll.pollster}, ${poll.sampleSize}, ${poll.area},
          ${poll.labour}, ${poll.conservative}, ${poll.libdem}, ${poll.green},
          ${poll.reform}, ${poll.snp}, ${poll.pc}, ${poll.others}
        )
      `
    }

    const aggregate = computeAggregate(
      polls.map(poll => ({
        pollDate: poll.pollDate,
        pollster: poll.pollster,
        sampleSize: poll.sampleSize,
        labour: poll.labour,
        conservative: poll.conservative,
        reform: poll.reform,
        libdem: poll.libdem,
        green: poll.green,
        snp: poll.snp,
        pc: poll.pc,
        others: poll.others,
      })),
      runDate
    )

    await sql`
      INSERT INTO aggregate_runs (
        run_id, aggregate_date, labour, conservative, reform, libdem, green, snp, pc, others, lead_party, lead_value
      )
      VALUES (
        ${runId}, ${runDate.toISOString()}, ${aggregate.labour}, ${aggregate.conservative},
        ${aggregate.reform}, ${aggregate.libdem}, ${aggregate.green}, ${aggregate.snp},
        ${aggregate.pc}, ${aggregate.others}, ${aggregate.leadParty}, ${aggregate.leadValue}
      )
    `

    const secret = process.env.CRON_SECRET
    if (!secret) {
      throw new Error('Missing CRON_SECRET')
    }

    const baseUrl = getBaseUrl(req)
    const [england, scotland, wales] = await Promise.all([
      triggerProjection(baseUrl, '/api/cron/england-local-2026', secret),
      triggerProjection(baseUrl, '/api/cron/scotland-parliament', secret),
      triggerProjection(baseUrl, '/api/cron/wales-senedd', secret),
    ])

    return res.status(200).json({
      runId,
      count: polls.length,
      projections: { england, scotland, wales },
    })
  } catch (err) {
    console.error(err)
    const detail = err instanceof Error ? err.message : String(err)
    if (runId) {
      await sql`
        UPDATE poll_runs
        SET success = false
        WHERE id = ${runId}
      `
    } else {
      await sql`
        INSERT INTO poll_runs (run_date, source_url, success)
        VALUES (${runDate.toISOString()}, ${'unknown'}, false)
        ON CONFLICT (run_date)
        DO UPDATE SET success = false
      `
    }
    return res.status(500).json({ error: 'Failed to scrape polling data', detail })
  }
}
