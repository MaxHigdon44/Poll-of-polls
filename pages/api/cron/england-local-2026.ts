import type { NextApiRequest, NextApiResponse } from 'next'
import { sql } from '@vercel/postgres'
import {
  computeEnglandWardProjectionSnapshot,
  type EnglandLocalProjectionSnapshot,
} from '@/lib/local2026/councilProjections'
import { AGE_EFFECT_STRENGTH } from '@/lib/local2026/age'
import { DEGREE_EFFECT_STRENGTH } from '@/lib/local2026/degree'
import { GE_WEIGHT_GREEN, GE_WEIGHT_MAJOR, GE_WEIGHT_REFORM } from '@/lib/local2026/ge'
import { LEAVE_EFFECT_STRENGTH } from '@/lib/local2026/leaveRemain'
import { NSSEC_EFFECT_STRENGTH } from '@/lib/local2026/nssec'
import { REGION_EFFECT_STRENGTH } from '@/lib/local2026/region'
import { RURAL_URBAN_EFFECT_STRENGTH } from '@/lib/local2026/ruralUrban'
import { TENURE_EFFECT_STRENGTH } from '@/lib/local2026/tenure'

type AggregateRunRow = {
  run_id: number
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
}

type EnglandSnapshotArgs = Parameters<typeof computeEnglandWardProjectionSnapshot>[0]

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
      SELECT run_id, aggregate_date, labour, conservative, reform, libdem, green, snp, pc, others, lead_party
      FROM aggregate_runs
      ORDER BY aggregate_date DESC
      LIMIT 1
    `
    const aggregate = aggregateResult.rows[0]
    if (!aggregate) {
      return res.status(404).json({ error: 'Aggregate not found' })
    }

    const [
      baseline,
      councilSeats,
      councilPrevious,
      leaveLookup,
      ageLookup,
      regionLookup,
      nssecLookup,
      degreeLookup,
      tenureLookup,
      ruralUrbanLookup,
      wardVacancyLookup,
      wardToPcon,
      cedToPcon,
      geLookup,
    ] = await Promise.all([
      fetchJson<EnglandSnapshotArgs['baseline']>(baseUrl, '/data/ward-baseline.json'),
      fetchJson<EnglandSnapshotArgs['councilSeats']>(baseUrl, '/data/council-seats.json'),
      fetchJson<EnglandSnapshotArgs['councilPrevious']>(baseUrl, '/data/council-previous.json'),
      fetchJson<EnglandSnapshotArgs['leaveLookup']>(baseUrl, '/data/leave-share.json'),
      fetchJson<EnglandSnapshotArgs['ageLookup']>(baseUrl, '/data/age-share.json'),
      fetchJson<EnglandSnapshotArgs['regionLookup']>(baseUrl, '/data/lad-region.json'),
      fetchJson<EnglandSnapshotArgs['nssecLookup']>(baseUrl, '/data/nssec-share.json'),
      fetchJson<EnglandSnapshotArgs['degreeLookup']>(baseUrl, '/data/degree-share.json'),
      fetchJson<EnglandSnapshotArgs['tenureLookup']>(baseUrl, '/data/tenure-share.json'),
      fetchJson<EnglandSnapshotArgs['ruralUrbanLookup']>(baseUrl, '/data/rural-urban-share.json'),
      fetchJson<EnglandSnapshotArgs['wardVacancyLookup']>(baseUrl, '/data/ward-vacancies.json'),
      fetchJson<EnglandSnapshotArgs['wardToPcon']>(baseUrl, '/data/ward-to-pcon.json'),
      fetchJson<EnglandSnapshotArgs['cedToPcon']>(baseUrl, '/data/ced-to-pcon.json'),
      fetchJson<EnglandSnapshotArgs['geLookup']>(baseUrl, '/data/ge2024-pcon.json'),
    ])

    const snapshot = computeEnglandWardProjectionSnapshot({
      generatedAt: aggregate.aggregate_date,
      baseline,
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
        lead: aggregate.lead_party,
      },
      councilSeats,
      councilPrevious,
      leaveLookup,
      ageLookup,
      regionLookup,
      nssecLookup,
      degreeLookup,
      tenureLookup,
      ruralUrbanLookup,
      wardVacancyLookup,
      wardToPcon,
      cedToPcon,
      geLookup,
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

    await sql`
      INSERT INTO projection_snapshots (run_id, snapshot_date, view_key, payload)
      VALUES (${aggregate.run_id}, ${aggregate.aggregate_date}, ${'england-local-2026'}, ${JSON.stringify(snapshot)})
      ON CONFLICT (view_key, snapshot_date)
      DO UPDATE SET run_id = EXCLUDED.run_id, payload = EXCLUDED.payload
    `

    return res.status(200).json({
      runId: aggregate.run_id,
      view: 'england-local-2026',
      generatedAt: aggregate.aggregate_date,
      wardCount: Object.keys((snapshot as EnglandLocalProjectionSnapshot).wardsByCode || {}).length,
    })
  } catch (err) {
    console.error(err)
    const detail = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Failed to build England snapshot', detail })
  }
}
