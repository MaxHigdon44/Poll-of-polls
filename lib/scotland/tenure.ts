export const SCOTLAND_TENURE_EFFECT_STRENGTH = 0.8

export type ScotlandTenureShare = {
  owned: number
  socialRented: number
  privateRented: number
}

export const SCOTLAND_TENURE_DELTAS: Record<string, ScotlandTenureShare> = {
  SNP: {
    owned: 0,
    socialRented: 3,
    privateRented: -6,
  },
  Conservative: {
    owned: 2,
    socialRented: -7,
    privateRented: -4,
  },
  Labour: {
    owned: 1,
    socialRented: -1,
    privateRented: -7,
  },
  'Liberal Democrat': {
    owned: 0,
    socialRented: -8,
    privateRented: 10,
  },
  Green: {
    owned: -2,
    socialRented: -6,
    privateRented: 21,
  },
  Reform: {
    owned: -1,
    socialRented: 16,
    privateRented: -12,
  },
}

export function getScottishTenureAdjustment(
  party: string,
  share: ScotlandTenureShare,
  baseline: ScotlandTenureShare
) {
  const deltas = SCOTLAND_TENURE_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.owned - baseline.owned) * deltas.owned +
    (share.socialRented - baseline.socialRented) * deltas.socialRented +
    (share.privateRented - baseline.privateRented) * deltas.privateRented
  )
}
