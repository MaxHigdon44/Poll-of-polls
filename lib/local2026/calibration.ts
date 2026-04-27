export const NATIONAL_PARTIES = [
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
] as const

type AggregateRowLike = {
  labour?: number | null
  conservative?: number | null
  reform?: number | null
  libdem?: number | null
  green?: number | null
  snp?: number | null
  pc?: number | null
}

type ProjectionEntry = {
  shares: Record<string, number>
  weight: number
}

export function buildAggregateMap(aggregate: AggregateRowLike) {
  return {
    Labour: Number(aggregate.labour) || 0,
    Conservative: Number(aggregate.conservative) || 0,
    Reform: Number(aggregate.reform) || 0,
    'Liberal Democrat': Number(aggregate.libdem) || 0,
    Green: Number(aggregate.green) || 0,
    SNP: Number(aggregate.snp) || 0,
    'Plaid Cymru': Number(aggregate.pc) || 0,
  }
}

export function buildNationalCalibration(
  entries: ProjectionEntry[],
  aggregate: AggregateRowLike,
  maxDistance = 5
) {
  const aggregateMap = buildAggregateMap(aggregate)
  const totals: Record<string, number> = {}
  let totalWeight = 0

  entries.forEach(entry => {
    if (!entry.weight) return
    totalWeight += entry.weight
    NATIONAL_PARTIES.forEach(party => {
      totals[party] = (totals[party] || 0) + (Number(entry.shares[party]) || 0) * entry.weight
    })
  })

  const multipliers: Record<string, number> = {}
  NATIONAL_PARTIES.forEach(party => {
    const current = totalWeight ? (totals[party] || 0) / totalWeight : 0
    const target = Math.min(
      aggregateMap[party] + maxDistance,
      Math.max(aggregateMap[party] - maxDistance, current)
    )
    multipliers[party] = current > 0 ? target / current : 1
  })

  return multipliers
}

export function applyNationalCalibration(
  shares: Record<string, number>,
  multipliers: Record<string, number>
) {
  const localEntries = Object.entries(shares).filter(([party]) => !NATIONAL_PARTIES.includes(party as any))
  const localShares = Object.fromEntries(localEntries)
  const localSum = localEntries.reduce((acc, [, value]) => acc + (Number(value) || 0), 0)
  const remaining = Math.max(0, 100 - localSum)

  const adjustedNational: Record<string, number> = {}
  let adjustedNationalSum = 0
  NATIONAL_PARTIES.forEach(party => {
    const adjusted = Math.max(0, (Number(shares[party]) || 0) * (multipliers[party] || 1))
    adjustedNational[party] = adjusted
    adjustedNationalSum += adjusted
  })

  if (adjustedNationalSum > 0 && remaining >= 0) {
    const scale = remaining / adjustedNationalSum
    NATIONAL_PARTIES.forEach(party => {
      adjustedNational[party] = adjustedNational[party] * scale
    })
  }

  return {
    ...localShares,
    ...adjustedNational,
  }
}
