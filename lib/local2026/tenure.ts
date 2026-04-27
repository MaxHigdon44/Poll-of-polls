export const TENURE_EFFECT_STRENGTH = 0.8

export const TENURE_DELTAS: Record<
  string,
  {
    ownedOutright: number
    ownsWithMortgage: number
    socialRented: number
    privateRented: number
  }
> = {
  Conservative: {
    ownedOutright: 10,
    ownsWithMortgage: -1.5,
    socialRented: -9.5,
    privateRented: -8.5,
  },
  Labour: {
    ownedOutright: -7,
    ownsWithMortgage: 1.5,
    socialRented: 2,
    privateRented: 2.25,
  },
  'Liberal Democrat': {
    ownedOutright: -0.5,
    ownsWithMortgage: 2,
    socialRented: -3.5,
    privateRented: 0,
  },
  SNP: {
    ownedOutright: 0,
    ownsWithMortgage: 0,
    socialRented: 2,
    privateRented: -1,
  },
  Reform: {
    ownedOutright: 3,
    ownsWithMortgage: -2.5,
    socialRented: 8.5,
    privateRented: -5.5,
  },
  'Plaid Cymru': {
    ownedOutright: 0,
    ownsWithMortgage: 1,
    socialRented: 1,
    privateRented: 0.5,
  },
  Green: {
    ownedOutright: -5,
    ownsWithMortgage: 1,
    socialRented: -1,
    privateRented: 8.25,
  },
}

export type TenureShare = {
  ownedOutright: number
  ownsWithMortgage: number
  socialRented: number
  privateRented: number
}

export type TenureBaseline = TenureShare

export function getTenureAdjustment(
  party: string,
  share: TenureShare,
  baseline: TenureBaseline
) {
  const deltas = TENURE_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.ownedOutright - baseline.ownedOutright) * deltas.ownedOutright +
    (share.ownsWithMortgage - baseline.ownsWithMortgage) * deltas.ownsWithMortgage +
    (share.socialRented - baseline.socialRented) * deltas.socialRented +
    (share.privateRented - baseline.privateRented) * deltas.privateRented
  )
}
