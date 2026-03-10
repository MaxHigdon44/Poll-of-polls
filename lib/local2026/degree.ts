export const DEGREE_EFFECT_STRENGTH = 0.8

export const DEGREE_DELTAS: Record<string, { degree: number; noDegree: number }> = {
  Conservative: { degree: 1.33, noDegree: -0.67 },
  Labour: { degree: 7, noDegree: -3.67 },
  'Liberal Democrat': { degree: 3.33, noDegree: -1.67 },
  SNP: { degree: 0.33, noDegree: 0.33 },
  Reform: { degree: -10.33, noDegree: 8.67 },
  'Plaid Cymru': { degree: -1, noDegree: 0.33 },
  Green: { degree: 1.33, noDegree: 0 },
  Other: { degree: 0, noDegree: 0.66 },
}

export type DegreeShare = {
  degree: number
  noDegree: number
}

export type DegreeBaseline = DegreeShare

export function getDegreeAdjustment(
  party: string,
  share: DegreeShare,
  baseline: DegreeBaseline
) {
  const deltas = DEGREE_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.degree - baseline.degree) * deltas.degree +
    (share.noDegree - baseline.noDegree) * deltas.noDegree
  )
}
