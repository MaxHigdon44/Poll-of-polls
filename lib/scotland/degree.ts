export const SCOTLAND_DEGREE_EFFECT_STRENGTH = 0.8

export type ScotlandDegreeShare = {
  degree: number
  noDegree: number
}

export const SCOTLAND_DEGREE_DELTAS: Record<string, ScotlandDegreeShare> = {
  SNP: { degree: 2, noDegree: -1 },
  Conservative: { degree: -2, noDegree: 0 },
  Labour: { degree: 3, noDegree: -1 },
  'Liberal Democrat': { degree: 4, noDegree: -2 },
  Green: { degree: 4, noDegree: -2 },
  Reform: { degree: -10, noDegree: 5 },
}

export function getScottishDegreeAdjustment(
  party: string,
  share: ScotlandDegreeShare,
  baseline: ScotlandDegreeShare
) {
  const deltas = SCOTLAND_DEGREE_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.degree - baseline.degree) * deltas.degree +
    (share.noDegree - baseline.noDegree) * deltas.noDegree
  )
}
