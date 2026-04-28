import fs from 'fs'
import path from 'path'
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

type SnapshotRow = {
  run_id: number
  snapshot_date: string
  payload: EnglandLocalProjectionSnapshot
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

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

function readDataFile<T>(filename: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', filename)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function almostEqual(a: number, b: number, epsilon = 1e-9) {
  return Math.abs(a - b) <= epsilon
}

function compareSnapshots(snapshot: EnglandLocalProjectionSnapshot, fresh: EnglandLocalProjectionSnapshot) {
  const wardDiffs: Array<Record<string, unknown>> = []
  const snapshotWardCodes = new Set(Object.keys(snapshot.wardsByCode || {}))
  const freshWardCodes = new Set(Object.keys(fresh.wardsByCode || {}))
  const allWardCodes = new Set([...snapshotWardCodes, ...freshWardCodes])

  allWardCodes.forEach(wardCode => {
    const left = snapshot.wardsByCode?.[wardCode]
    const right = fresh.wardsByCode?.[wardCode]
    if (!left || !right) {
      wardDiffs.push({ wardCode, issue: !left ? 'missing-in-snapshot' : 'missing-in-fresh' })
      return
    }
    if (left.winner !== right.winner || left.prevWinner !== right.prevWinner || left.leaveSource !== right.leaveSource) {
      wardDiffs.push({
        wardCode,
        issue: 'meta-mismatch',
        snapshot: { winner: left.winner, prevWinner: left.prevWinner, leaveSource: left.leaveSource },
        fresh: { winner: right.winner, prevWinner: right.prevWinner, leaveSource: right.leaveSource },
      })
      return
    }
    const partyKeys = new Set([...Object.keys(left.shares || {}), ...Object.keys(right.shares || {})])
    for (const party of partyKeys) {
      const leftValue = Number(left.shares?.[party] ?? 0)
      const rightValue = Number(right.shares?.[party] ?? 0)
      if (!almostEqual(leftValue, rightValue)) {
        wardDiffs.push({
          wardCode,
          issue: 'share-mismatch',
          party,
          snapshot: leftValue,
          fresh: rightValue,
        })
        return
      }
    }
  })

  const councilDiffs: Array<Record<string, unknown>> = []
  const snapshotCouncils = new Map((snapshot.councilRows || []).map(row => [row.ladCode, row]))
  const freshCouncils = new Map((fresh.councilRows || []).map(row => [row.ladCode, row]))
  const allCouncilCodes = new Set([...snapshotCouncils.keys(), ...freshCouncils.keys()])

  allCouncilCodes.forEach(ladCode => {
    const left = snapshotCouncils.get(ladCode)
    const right = freshCouncils.get(ladCode)
    if (!left || !right) {
      councilDiffs.push({ ladCode, issue: !left ? 'missing-in-snapshot' : 'missing-in-fresh' })
      return
    }
    if (
      left.council !== right.council ||
      left.previousControl !== right.previousControl ||
      left.projectedControl !== right.projectedControl
    ) {
      councilDiffs.push({
        ladCode,
        issue: 'control-mismatch',
        snapshot: {
          council: left.council,
          previousControl: left.previousControl,
          projectedControl: left.projectedControl,
        },
        fresh: {
          council: right.council,
          previousControl: right.previousControl,
          projectedControl: right.projectedControl,
        },
      })
      return
    }
    const bucketKeys = new Set([
      ...Object.keys(left.projectedSeatsUp || {}),
      ...Object.keys(right.projectedSeatsUp || {}),
      ...Object.keys(left.previousSeatsUp || {}),
      ...Object.keys(right.previousSeatsUp || {}),
    ])
    for (const party of bucketKeys) {
      if ((left.projectedSeatsUp?.[party] ?? 0) !== (right.projectedSeatsUp?.[party] ?? 0)) {
        councilDiffs.push({
          ladCode,
          issue: 'projected-seats-mismatch',
          party,
          snapshot: left.projectedSeatsUp?.[party] ?? 0,
          fresh: right.projectedSeatsUp?.[party] ?? 0,
        })
        return
      }
      if ((left.previousSeatsUp?.[party] ?? 0) !== (right.previousSeatsUp?.[party] ?? 0)) {
        councilDiffs.push({
          ladCode,
          issue: 'previous-seats-mismatch',
          party,
          snapshot: left.previousSeatsUp?.[party] ?? 0,
          fresh: right.previousSeatsUp?.[party] ?? 0,
        })
        return
      }
    }
  })

  return {
    matches: wardDiffs.length === 0 && councilDiffs.length === 0,
    wardDiffCount: wardDiffs.length,
    councilDiffCount: councilDiffs.length,
    wardDiffSamples: wardDiffs.slice(0, 10),
    councilDiffSamples: councilDiffs.slice(0, 10),
  }
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
    const snapshotResult = await sql<SnapshotRow>`
      SELECT
        projection_snapshots.run_id,
        projection_snapshots.snapshot_date,
        projection_snapshots.payload,
        aggregate_runs.labour,
        aggregate_runs.conservative,
        aggregate_runs.reform,
        aggregate_runs.libdem,
        aggregate_runs.green,
        aggregate_runs.snp,
        aggregate_runs.pc,
        aggregate_runs.others,
        aggregate_runs.lead_party
      FROM projection_snapshots
      JOIN aggregate_runs ON aggregate_runs.run_id = projection_snapshots.run_id
      WHERE view_key = ${'england-local-2026'}
      ORDER BY projection_snapshots.snapshot_date DESC
      LIMIT 1
    `
    const snapshot = snapshotResult.rows[0]
    if (!snapshot?.payload) {
      return res.status(404).json({ error: 'Snapshot not found' })
    }

    type SnapshotArgs = Parameters<typeof computeEnglandWardProjectionSnapshot>[0]
    const fresh = computeEnglandWardProjectionSnapshot({
      generatedAt: snapshot.payload.generatedAt,
      baseline: readDataFile<SnapshotArgs['baseline']>('ward-baseline.json'),
      aggregate: {
        pollCount: 0,
        labour: snapshot.labour,
        conservative: snapshot.conservative,
        reform: snapshot.reform,
        libdem: snapshot.libdem,
        green: snapshot.green,
        snp: snapshot.snp,
        pc: snapshot.pc,
        others: snapshot.others,
        lead: snapshot.lead_party,
      },
      councilSeats: readDataFile<SnapshotArgs['councilSeats']>('council-seats.json'),
      councilPrevious: readDataFile<SnapshotArgs['councilPrevious']>('council-previous.json'),
      ladGeo: readDataFile<SnapshotArgs['ladGeo']>('lads.geojson'),
      countyGeo: readDataFile<SnapshotArgs['countyGeo']>('counties.geojson'),
      leaveLookup: readDataFile<SnapshotArgs['leaveLookup']>('leave-share.json'),
      ageLookup: readDataFile<SnapshotArgs['ageLookup']>('age-share.json'),
      regionLookup: readDataFile<SnapshotArgs['regionLookup']>('lad-region.json'),
      nssecLookup: readDataFile<SnapshotArgs['nssecLookup']>('nssec-share.json'),
      degreeLookup: readDataFile<SnapshotArgs['degreeLookup']>('degree-share.json'),
      tenureLookup: readDataFile<SnapshotArgs['tenureLookup']>('tenure-share.json'),
      ruralUrbanLookup: readDataFile<SnapshotArgs['ruralUrbanLookup']>('rural-urban-share.json'),
      wardVacancyLookup: readDataFile<SnapshotArgs['wardVacancyLookup']>('ward-vacancies.json'),
      wardToPcon: readDataFile<SnapshotArgs['wardToPcon']>('ward-to-pcon.json'),
      cedToPcon: readDataFile<SnapshotArgs['cedToPcon']>('ced-to-pcon.json'),
      geLookup: readDataFile<SnapshotArgs['geLookup']>('ge2024-pcon.json'),
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

    return res.status(200).json({
      runId: snapshot.run_id,
      snapshotDate: snapshot.snapshot_date,
      cachedGeneratedAt: snapshot.payload.generatedAt,
      freshGeneratedAt: fresh.generatedAt,
      ...compareSnapshots(snapshot.payload, fresh),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to compare snapshot' })
  }
}
