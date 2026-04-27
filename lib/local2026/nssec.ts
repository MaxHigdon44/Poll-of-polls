export const NSSEC_EFFECT_STRENGTH = 0.8

export const NSSEC_DELTAS: Record<string, { Higher: number; Intermediate: number; Lower: number }> =
  {
    Labour: { Higher: 3, Intermediate: -2.5, Lower: -5.5 },
    Conservative: { Higher: 0.66, Intermediate: 2.33, Lower: 0 },
    Reform: { Higher: -5, Intermediate: 3, Lower: 8 },
    'Liberal Democrat': { Higher: 2.33, Intermediate: 1.67, Lower: -2.33 },
    Green: { Higher: 0.67, Intermediate: -5.67, Lower: -1.67 },
    Other: { Higher: -1, Intermediate: -0.67, Lower: 1.33 },
    SNP: { Higher: 0, Intermediate: 0.33, Lower: -0.33 },
    'Plaid Cymru': { Higher: 1, Intermediate: 0.66, Lower: 0 },
  }

export type NssecShare = {
  higher: number
  intermediate: number
  lower: number
}

export type NssecBaseline = NssecShare

export function getNssecAdjustment(
  party: string,
  share: NssecShare,
  baseline: NssecBaseline
) {
  const deltas = NSSEC_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.higher - baseline.higher) * deltas.Higher +
    (share.intermediate - baseline.intermediate) * deltas.Intermediate +
    (share.lower - baseline.lower) * deltas.Lower
  )
}
