export type OlsScenarioCoefficients = Record<string, Record<string, number>>

export type OlsResults = {
  generatedAt: string
  yearBaselines?: Record<string, Record<string, number>>
  scenarios?: {
    inSampleAllYears?: {
      coefficients?: OlsScenarioCoefficients
    }
  }
}

export type OlsFeatureInput = {
  leaveShare: number
  age18_35: number
  age35_55: number
  nssecHigher: number
  nssecIntermediate: number
  degree: number
  ownedOutright: number
  ownsWithMortgage: number
  socialRented: number
  ruralConurbation: number
  ruralCityTown: number
  ruralTownFringe: number
  geLabour: number
  geConservative: number
  geReform: number
  geLibDem: number
  geGreen: number
  regionName: string | null
  isCountyDivision: boolean
  gapYears: number
}

const NATIONAL_PARTIES = [
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
] as const

const REGION_FEATURES = [
  'East Midlands',
  'East of England',
  'London',
  'North East',
  'North West',
  'Scotland',
  'South West',
  'Wales',
  'West Midlands',
  'Yorkshire and the Humber',
] as const

function normalizeRegion(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.toLowerCase() === 'yorkshire') return 'Yorkshire and the Humber'
  return raw
}

function partyAllowedInRegion(party: string, regionName: string | null) {
  if (party === 'SNP') return regionName === 'Scotland'
  if (party === 'Plaid Cymru') return regionName === 'Wales'
  return true
}

function buildFeatureValues(
  baselineNational: Record<string, number>,
  aggregateMap: Record<string, number>,
  features: OlsFeatureInput
) {
  const regionName = normalizeRegion(features.regionName)
  const values: Record<string, number> = {
    intercept: 1,
    deltaLabour: (aggregateMap.Labour ?? 0) - (baselineNational.Labour ?? 0),
    deltaConservative: (aggregateMap.Conservative ?? 0) - (baselineNational.Conservative ?? 0),
    deltaReform: (aggregateMap.Reform ?? 0) - (baselineNational.Reform ?? 0),
    deltaLiberalDemocrat:
      (aggregateMap['Liberal Democrat'] ?? 0) - (baselineNational['Liberal Democrat'] ?? 0),
    deltaGreen: (aggregateMap.Green ?? 0) - (baselineNational.Green ?? 0),
    leaveShare: features.leaveShare,
    age18_35: features.age18_35,
    age35_55: features.age35_55,
    nssecHigher: features.nssecHigher,
    nssecIntermediate: features.nssecIntermediate,
    degree: features.degree,
    ownedOutright: features.ownedOutright,
    ownsWithMortgage: features.ownsWithMortgage,
    socialRented: features.socialRented,
    ruralConurbation: features.ruralConurbation,
    ruralCityTown: features.ruralCityTown,
    ruralTownFringe: features.ruralTownFringe,
    geLabour: features.geLabour,
    geConservative: features.geConservative,
    geReform: features.geReform,
    geLibDem: features.geLibDem,
    geGreen: features.geGreen,
    gapYears: Math.max(1, features.gapYears || 1),
    isCountyDivision: features.isCountyDivision ? 1 : 0,
  }
  REGION_FEATURES.forEach(region => {
    values[`region_${region}`] = regionName === region ? 1 : 0
  })
  return values
}

function computePredictedSwing(
  party: string,
  coefficients: OlsScenarioCoefficients | null,
  baselineNational: Record<string, number>,
  aggregateMap: Record<string, number>,
  features: OlsFeatureInput
) {
  const partyCoefficients = coefficients?.[party]
  if (!partyCoefficients) return 0
  const values = buildFeatureValues(baselineNational, aggregateMap, features)
  return Object.entries(partyCoefficients).reduce(
    (sum, [key, coefficient]) => sum + (values[key] ?? 0) * coefficient,
    0
  )
}

export function computeOlsWardProjection(
  ward: {
    nationalShares: Record<string, number>
    localShares: Record<string, number>
  },
  baselineNational: Record<string, number>,
  aggregateMap: Record<string, number>,
  features: OlsFeatureInput,
  coefficients: OlsScenarioCoefficients | null
) {
  const adjustedNational: Record<string, number> = {}
  let sumNational = 0
  const regionName = normalizeRegion(features.regionName)

  NATIONAL_PARTIES.forEach(party => {
    if (!partyAllowedInRegion(party, regionName || null)) {
      adjustedNational[party] = 0
      return
    }
    const baselineShare = ward.nationalShares?.[party] ?? 0
    const predictedSwing = computePredictedSwing(
      party,
      coefficients,
      baselineNational,
      aggregateMap,
      features
    )
    const value = Math.max(0, baselineShare + predictedSwing)
    adjustedNational[party] = value
    sumNational += value
  })

  const mergedLocalShares: Record<string, number> = { ...ward.localShares }
  if (typeof mergedLocalShares['Other'] === 'number') {
    const otherValue = mergedLocalShares['Other']
    const hasDuplicate = Object.entries(mergedLocalShares).some(([key, value]) => {
      if (key === 'Other') return false
      return Math.abs((value ?? 0) - otherValue) <= 3
    })
    const namedEntries = Object.entries(mergedLocalShares).filter(([key]) => key !== 'Other')
    const hasNamed = namedEntries.length > 0
    const namedMax = namedEntries.reduce((max, [, value]) => Math.max(max, value ?? 0), 0)
    const otherIsTop = otherValue >= namedMax
    if (hasDuplicate || (hasNamed && otherIsTop)) delete mergedLocalShares['Other']
  }

  const localBaseline = Object.fromEntries(
    Object.entries(mergedLocalShares).map(([key, value]) => [key, value * 0.9])
  )
  const localSum = Object.values(localBaseline).reduce((acc, value) => acc + value, 0)
  const remaining = 100 - localSum

  let scaledLocal: Record<string, number> = {}
  if (remaining <= 0) {
    const scaleLocal = localSum > 0 ? 100 / localSum : 0
    scaledLocal = Object.fromEntries(
      Object.entries(localBaseline).map(([key, value]) => [key, value * scaleLocal])
    )
    NATIONAL_PARTIES.forEach(party => {
      adjustedNational[party] = 0
    })
    sumNational = 0
  } else {
    scaledLocal = localBaseline
    if (sumNational > 0) {
      const scale = remaining / sumNational
      NATIONAL_PARTIES.forEach(party => {
        adjustedNational[party] = adjustedNational[party] * scale
      })
    }
  }

  const combined: Record<string, number> = {
    ...scaledLocal,
    ...adjustedNational,
  }

  let winner = 'Other'
  let top = -1
  Object.entries(combined).forEach(([party, value]) => {
    if (value > top) {
      top = value
      winner = party
    }
  })

  return { shares: combined, winner }
}
