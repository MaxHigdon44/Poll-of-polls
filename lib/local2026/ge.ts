export const GE_WEIGHT_REFORM = 0.35
export const GE_WEIGHT_GREEN = 0.05
export const GE_WEIGHT_MAJOR = 0.05

export const GE2024_NATIONAL_SHARES: Record<string, number> = {
  Labour: 34.7,
  Conservative: 23.7,
  'Liberal Democrat': 12.2,
  Reform: 14.3,
  Green: 6.4,
  'Plaid Cymru': 0.7,
  SNP: 2.5,
}

export type GeWeights = {
  reform: number
  green: number
  major: number
}

export function getGeWeightForParty(party: string, weights: GeWeights) {
  if (party === 'Reform') return weights.reform
  if (party === 'Green') return weights.green
  if (
    party === 'Labour' ||
    party === 'Conservative' ||
    party === 'Liberal Democrat' ||
    party === 'SNP' ||
    party === 'Plaid Cymru'
  ) {
    return weights.major
  }
  return 0
}

export function blendShare(wardShare: number, geShare: number | undefined, weight: number) {
  const numeric = Number(geShare)
  if (!Number.isFinite(numeric)) return wardShare
  const w = Math.max(0, Math.min(1, weight))
  return wardShare * (1 - w) + numeric * w
}

export function getRelativeGeShare(party: string, geShare: number | undefined) {
  const numeric = Number(geShare)
  if (!Number.isFinite(numeric)) return 0
  if (party === 'Reform' && numeric === 0) return 0
  return numeric - (GE2024_NATIONAL_SHARES[party] ?? 0)
}
