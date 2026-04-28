export const RURAL_URBAN_EFFECT_STRENGTH = 0.8

export const RURAL_URBAN_DELTAS: Record<
  string,
  {
    conurbation: number
    cityTown: number
    ruralTownFringe: number
    ruralVillageHamlet: number
  }
> = {
  Labour: {
    conurbation: 1,
    cityTown: -1,
    ruralTownFringe: -2,
    ruralVillageHamlet: -3,
  },
  Conservative: {
    conurbation: -1,
    cityTown: -0.5,
    ruralTownFringe: 2,
    ruralVillageHamlet: 3,
  },
  Reform: {
    conurbation: -1,
    cityTown: 0,
    ruralTownFringe: 2,
    ruralVillageHamlet: 2,
  },
  'Liberal Democrat': {
    conurbation: 0,
    cityTown: 2,
    ruralTownFringe: 3,
    ruralVillageHamlet: 0,
  },
  Green: {
    conurbation: 2.5,
    cityTown: 1,
    ruralTownFringe: 0,
    ruralVillageHamlet: -1.5,
  },
}

export type RuralUrbanShare = {
  conurbation: number
  cityTown: number
  ruralTownFringe: number
  ruralVillageHamlet: number
}

export type RuralUrbanBaseline = RuralUrbanShare

export function getRuralUrbanAdjustment(
  party: string,
  share: RuralUrbanShare,
  baseline: RuralUrbanBaseline
) {
  const deltas = RURAL_URBAN_DELTAS[party]
  if (!deltas) return 0
  return (
    (share.conurbation - baseline.conurbation) * deltas.conurbation +
    (share.cityTown - baseline.cityTown) * deltas.cityTown +
    (share.ruralTownFringe - baseline.ruralTownFringe) * deltas.ruralTownFringe +
    (share.ruralVillageHamlet - baseline.ruralVillageHamlet) * deltas.ruralVillageHamlet
  )
}
