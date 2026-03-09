export const AGE_BASELINE = {
  age18_35: 0.22,
  age35_55: 0.26,
  age55_plus: 0.3185,
}

export const AGE_DELTAS: Record<
  string,
  { age18_35: number; age35_55: number; age55_plus: number }
> = {
  Labour: { age18_35: 5.66, age35_55: 2.67, age55_plus: -4.22 },
  Conservative: { age18_35: -7.15, age35_55: -2.13, age55_plus: 5.54 },
  'Liberal Democrat': { age18_35: -2.4, age35_55: -1.08, age55_plus: 1.82 },
  SNP: { age18_35: 0.6, age35_55: 0.17, age55_plus: -0.03 },
  Reform: { age18_35: -8.45, age35_55: 0.17, age55_plus: 4.21 },
  'Plaid Cymru': { age18_35: 0.57, age35_55: -0.13, age55_plus: -0.06 },
  Green: { age18_35: 12.35, age35_55: -0.12, age55_plus: -6.31 },
  Other: { age18_35: 0.83, age35_55: 0.16, age55_plus: -0.32 },
}

export const AGE_EFFECT_STRENGTH = 0.6

export function getAgeAdjustment(
  party: string,
  ageShare?: { age18_35: number; age35_55: number; age55_plus: number },
  baseline = AGE_BASELINE
) {
  const deltas = AGE_DELTAS[party]
  if (!deltas) return 0
  const share = ageShare || baseline
  return (
    (share.age18_35 - baseline.age18_35) * deltas.age18_35 +
    (share.age35_55 - baseline.age35_55) * deltas.age35_55 +
    (share.age55_plus - baseline.age55_plus) * deltas.age55_plus
  )
}
