import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import { scrapePolls } from '../../../lib/scrapePolls'
import { computeAggregate } from '../../../lib/aggregate'
import {
  computeEnglandWardProjectionSnapshot,
  type EnglandLocalProjectionSnapshot,
} from '../../../lib/local2026/councilProjections'
import { computeScottishProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'
import { computeWalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'
import { AGE_EFFECT_STRENGTH } from '@/lib/local2026/age'
import { DEGREE_EFFECT_STRENGTH } from '@/lib/local2026/degree'
import { GE_WEIGHT_GREEN, GE_WEIGHT_MAJOR, GE_WEIGHT_REFORM } from '@/lib/local2026/ge'
import { LEAVE_EFFECT_STRENGTH } from '@/lib/local2026/leaveRemain'
import { NSSEC_EFFECT_STRENGTH } from '@/lib/local2026/nssec'
import { REGION_EFFECT_STRENGTH } from '@/lib/local2026/region'
import { RURAL_URBAN_EFFECT_STRENGTH } from '@/lib/local2026/ruralUrban'
import { TENURE_EFFECT_STRENGTH } from '@/lib/local2026/tenure'
import { scrapeScottishPolls, scrapeWelshPolls } from '@/lib/scrapePolls'
import { loadScottishConstituencyResults } from '@/pages/api/scottish-constituency-results'
import {
  loadEnglandProjectionInputs,
  loadScotlandProjectionInputs,
  loadWalesProjectionInputs,
} from '@/lib/server/projectionData'

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`;
}

function buildEnglandSnapshot(
  aggregate: ReturnType<typeof computeAggregate>,
  generatedAt: string
): EnglandLocalProjectionSnapshot {
  const inputs = loadEnglandProjectionInputs()

  return computeEnglandWardProjectionSnapshot({
    generatedAt,
    aggregate: {
      pollCount: 0,
      labour: aggregate.labour,
      conservative: aggregate.conservative,
      reform: aggregate.reform,
      libdem: aggregate.libdem,
      green: aggregate.green,
      snp: aggregate.snp,
      pc: aggregate.pc,
      others: aggregate.others,
      lead: aggregate.leadParty,
    },
    ...inputs,
    weights: {
      leaveStrength: LEAVE_EFFECT_STRENGTH,
      ageStrength: AGE_EFFECT_STRENGTH,
      regionStrength: REGION_EFFECT_STRENGTH,
      nssecStrength: NSSEC_EFFECT_STRENGTH,
      degreeStrength: DEGREE_EFFECT_STRENGTH,
      tenureStrength: TENURE_EFFECT_STRENGTH,
      ruralUrbanStrength: RURAL_URBAN_EFFECT_STRENGTH,
      geReformWeight: GE_WEIGHT_REFORM,
      geGreenWeight: GE_WEIGHT_GREEN,
      geMajorWeight: GE_WEIGHT_MAJOR,
    },
  })
}

async function buildScotlandSnapshot(generatedAt: string) {
  const [{ constituencyPolls, regionalPolls }, { results }] = await Promise.all([
    scrapeScottishPolls(90),
    loadScottishConstituencyResults(),
  ])
  const inputs = loadScotlandProjectionInputs()

  return computeScottishProjectionSnapshot({
    generatedAt,
    constituencyPolls,
    regionalPolls,
    constituencyResultsRows: results,
    ...inputs,
  })
}

async function buildWalesSnapshot(generatedAt: string) {
  const { polls } = await scrapeWelshPolls(90)
  const inputs = loadWalesProjectionInputs()

  return computeWalesProjectionSnapshot({
    generatedAt,
    polls,
    ...inputs,
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET"){
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

    const [englandSnapshot, scotlandSnapshot, walesSnapshot] = await Promise.all([
      Promise.resolve(buildEnglandSnapshot(aggregate, runDate.toISOString())),
      buildScotlandSnapshot(runDate.toISOString()),
      buildWalesSnapshot(runDate.toISOString()),
    ])
    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${runId}, ${runDate.toISOString()}, ${'england-local-2026'}, ${JSON.stringify(englandSnapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `
    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${runId}, ${runDate.toISOString()}, ${'scotland-parliament'}, ${JSON.stringify(scotlandSnapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `
    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${runId}, ${runDate.toISOString()}, ${'wales-senedd'}, ${JSON.stringify(walesSnapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `

    return res.status(200).json({ runId, count: polls.length })
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
