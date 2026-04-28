export const SCOTLAND_AGE_EFFECT_STRENGTH = 0.8

export type ScotlandAgeShare = {
  age16_34: number
  age35_54: number
  age55_plus: number
}

export const SCOTLAND_AGE_DELTAS: Record<string, ScotlandAgeShare> = {
  SNP: {
    age16_34: 0.849524434,
    age35_54: 1.981171057,
    age55_plus: -3.34,
  },
  Conservative: {
    age16_34: -2.220410838,
    age35_54: -2.813642303,
    age55_plus: 5.41,
  },
  Labour: {
    age16_34: 1.664964655,
    age35_54: -1.507398603,
    age55_plus: -0.23,
  },
  'Liberal Democrat': {
    age16_34: -0.571328878,
    age35_54: -1.700120347,
    age55_plus: 2.94,
  },
  Green: {
    age16_34: 4.967343826,
    age35_54: 0.171580943,
    age55_plus: -4.89,
  },
  Reform: {
    age16_34: -3.057376519,
    age35_54: -0.434842111,
    age55_plus: 2.86,
  },
}

export function getScottishAgeAdjustment(
  party: string,
  share: ScotlandAgeShare,
  baseline: ScotlandAgeShare
) {
  const deltas = SCOTLAND_AGE_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.age16_34 - baseline.age16_34) * deltas.age16_34 +
    (share.age35_54 - baseline.age35_54) * deltas.age35_54 +
    (share.age55_plus - baseline.age55_plus) * deltas.age55_plus
  )
}
