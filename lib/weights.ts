export type PollsterWeightKey =
  | 'survation'
  | 'ipsos mori'
  | 'yougov'
  | 'more in common'
  | 'opinium'
  | 'verian'
  | 'norstat'
  | 'jl partners'
  | 'bmg research'
  | 'deltapoll'
  | 'savanta comres'
  | 'focaldata'
  | 'find out now'

const pollsterWeights: Record<PollsterWeightKey, number> = {
  survation: 1.1,
  'ipsos mori': 1.1,
  yougov: 1.1,
  'more in common': 1.1,
  opinium: 1.0,
  verian: 1.0,
  norstat: 1.0,
  'jl partners': 1.0,
  'bmg research': 1.0,
  deltapoll: 1.0,
  'savanta comres': 1.0,
  focaldata: 1.0,
  'find out now': 0.9,
}

function normalizePollster(value: string) {
  return value.trim().toLowerCase()
}

export function computeRecencyWeight(ageDays: number) {
  if (ageDays < 7) return 1.0
  if (ageDays < 14) return 0.75
  if (ageDays < 28) return 0.5
  if (ageDays < 42) return 0.25
  return 0.1
}

export function computePollsterWeight(pollster: string) {
  const key = normalizePollster(pollster) as PollsterWeightKey
  return pollsterWeights[key] ?? 0.9
}

export function computeSampleWeight(sampleSize: number | null, defaultSampleSize = 1000) {
  const effectiveN = Math.min(sampleSize ?? defaultSampleSize, 3000)
  return Math.sqrt(effectiveN)
}

export function computePollWeight(params: {
  ageDays: number
  pollster: string
  sampleSize: number | null
}) {
  const recencyWeight = computeRecencyWeight(params.ageDays)
  const pollsterWeight = computePollsterWeight(params.pollster)
  const sampleWeight = computeSampleWeight(params.sampleSize)
  return recencyWeight * pollsterWeight * sampleWeight
}

function runSanityChecks() {
  const recency = computeRecencyWeight(3)
  if (recency !== 1.0) throw new Error('Recency weight sanity check failed')

  const pollster = computePollsterWeight('YouGov')
  if (pollster !== 1.1) throw new Error('Pollster weight sanity check failed')

  const sample = computeSampleWeight(3600)
  if (Math.abs(sample - Math.sqrt(3000)) > 0.0001) {
    throw new Error('Sample weight sanity check failed')
  }
}

if (process.env.NODE_ENV !== 'production') {
  runSanityChecks()
}
