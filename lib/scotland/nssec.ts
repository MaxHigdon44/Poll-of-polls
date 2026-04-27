export const SCOTLAND_NSSEC_EFFECT_STRENGTH = 0.8

export type ScotlandNssecShare = {
  higher: number
  intermediate: number
  lower: number
}

export const SCOTLAND_NSSEC_DELTAS: Record<string, ScotlandNssecShare> = {
  SNP: { higher: 2.0, intermediate: -2.0, lower: -0.5 },
  Conservative: { higher: 1.0, intermediate: 0.0, lower: 0.5 },
  Labour: { higher: 2.5, intermediate: 1.0, lower: -3.0 },
  'Liberal Democrat': { higher: 2.0, intermediate: 1.5, lower: -3.5 },
  Green: { higher: -2.5, intermediate: -1.5, lower: 0.0 },
  Reform: { higher: -3.0, intermediate: 1.0, lower: 5.0 },
}

export function getScottishNssecAdjustment(
  party: string,
  share: ScotlandNssecShare,
  baseline: ScotlandNssecShare
) {
  const deltas = SCOTLAND_NSSEC_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.higher - baseline.higher) * deltas.higher +
    (share.intermediate - baseline.intermediate) * deltas.intermediate +
    (share.lower - baseline.lower) * deltas.lower
  )
}
