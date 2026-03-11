export const GE_WEIGHT_REFORM = 0.35
export const GE_WEIGHT_GREEN = 0.05
export const GE_WEIGHT_MAJOR = 0.05

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
  if (!Number.isFinite(geShare)) return wardShare
  const w = Math.max(0, Math.min(1, weight))
  return wardShare * (1 - w) + (geShare as number) * w
}
