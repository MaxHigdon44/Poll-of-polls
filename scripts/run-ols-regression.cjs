const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'data')
const TRAINING_PATH = path.join(OUT_DIR, 'ols-training.json')
const RESULTS_PATH = path.join(OUT_DIR, 'ols-results.json')

const PARTIES = ['Labour', 'Conservative', 'Reform', 'Liberal Democrat', 'Green']
const REGIONS = [
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
]
const FEATURE_NAMES = [
  'deltaLabour',
  'deltaConservative',
  'deltaReform',
  'deltaLiberalDemocrat',
  'deltaGreen',
  'leaveShare',
  'age18_35',
  'age35_55',
  'nssecHigher',
  'nssecIntermediate',
  'degree',
  'ownedOutright',
  'ownsWithMortgage',
  'socialRented',
  'ruralConurbation',
  'ruralCityTown',
  'ruralTownFringe',
  'geLabour',
  'geConservative',
  'geReform',
  'geLibDem',
  'geGreen',
  'gapYears',
  'isCountyDivision',
  ...REGIONS.map(region => `region_${region}`),
]
const RIDGE = 1e-4

function readTraining() {
  return JSON.parse(fs.readFileSync(TRAINING_PATH, 'utf8'))
}

function buildFeatureVector(row) {
  const features = {
    deltaLabour: row.nationalDelta.Labour ?? 0,
    deltaConservative: row.nationalDelta.Conservative ?? 0,
    deltaReform: row.nationalDelta.Reform ?? 0,
    deltaLiberalDemocrat: row.nationalDelta['Liberal Democrat'] ?? 0,
    deltaGreen: row.nationalDelta.Green ?? 0,
    leaveShare: row.features.leaveShare ?? 0,
    age18_35: row.features.age18_35 ?? 0,
    age35_55: row.features.age35_55 ?? 0,
    nssecHigher: row.features.nssecHigher ?? 0,
    nssecIntermediate: row.features.nssecIntermediate ?? 0,
    degree: row.features.degree ?? 0,
    ownedOutright: row.features.ownedOutright ?? 0,
    ownsWithMortgage: row.features.ownsWithMortgage ?? 0,
    socialRented: row.features.socialRented ?? 0,
    ruralConurbation: row.features.ruralConurbation ?? 0,
    ruralCityTown: row.features.ruralCityTown ?? 0,
    ruralTownFringe: row.features.ruralTownFringe ?? 0,
    geLabour: row.features.geLabour ?? 0,
    geConservative: row.features.geConservative ?? 0,
    geReform: row.features.geReform ?? 0,
    geLibDem: row.features.geLibDem ?? 0,
    geGreen: row.features.geGreen ?? 0,
    gapYears: Math.max(1, (row.electionYear || 0) - (row.previousYear || row.electionYear || 0)),
    isCountyDivision: row.subareaType === 'ced' ? 1 : 0,
  }
  REGIONS.forEach(region => {
    features[`region_${region}`] = row.features.regionName === region ? 1 : 0
  })
  return [1, ...FEATURE_NAMES.map(name => features[name] ?? 0)]
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    }
    if (Math.abs(a[pivot][col]) < 1e-12) continue
    if (pivot !== col) {
      const temp = a[col]
      a[col] = a[pivot]
      a[pivot] = temp
    }
    const divisor = a[col][col]
    for (let j = col; j <= n; j += 1) a[col][j] /= divisor
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = a[row][col]
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j]
    }
  }
  return a.map(row => row[n] || 0)
}

function fitWeightedOls(rows, party) {
  const cols = FEATURE_NAMES.length + 1
  const xtwx = Array.from({ length: cols }, () => Array(cols).fill(0))
  const xtwy = Array(cols).fill(0)

  rows.forEach(row => {
    const x = buildFeatureVector(row)
    const y = row.targetSwing[party] ?? 0
    const w = row.recencyWeight ?? 1
    for (let c1 = 0; c1 < cols; c1 += 1) {
      xtwy[c1] += w * x[c1] * y
      for (let c2 = 0; c2 < cols; c2 += 1) {
        xtwx[c1][c2] += w * x[c1] * x[c2]
      }
    }
  })

  for (let i = 0; i < cols; i += 1) xtwx[i][i] += RIDGE
  return solveLinearSystem(xtwx, xtwy)
}

function predictSwing(row, coefficients) {
  const x = buildFeatureVector(row)
  return x.reduce((sum, value, index) => sum + value * coefficients[index], 0)
}

function evaluate(rows, models) {
  const metrics = {}
  PARTIES.forEach(party => {
    let weightedAbsError = 0
    let weightedSqError = 0
    let weightTotal = 0
    rows.forEach(row => {
      const predictedSwing = predictSwing(row, models[party])
      const predictedShare = Math.max(0, Math.min(100, (row.baselineShares[party] ?? 0) + predictedSwing))
      const actualShare = row.actualShares[party] ?? 0
      const error = predictedShare - actualShare
      const weight = row.recencyWeight ?? 1
      weightedAbsError += Math.abs(error) * weight
      weightedSqError += error * error * weight
      weightTotal += weight
    })
    metrics[party] = {
      weightedMae: weightTotal ? weightedAbsError / weightTotal : null,
      weightedRmse: weightTotal ? Math.sqrt(weightedSqError / weightTotal) : null,
    }
  })
  return metrics
}

function serialiseCoefficients(coefficients) {
  const labels = ['intercept', ...FEATURE_NAMES]
  return Object.fromEntries(labels.map((label, index) => [label, coefficients[index]]))
}

function runScenario(rows, label, trainFilter, testFilter) {
  const trainRows = rows.filter(trainFilter)
  const testRows = rows.filter(testFilter)
  const models = {}
  PARTIES.forEach(party => {
    models[party] = fitWeightedOls(trainRows, party)
  })
  return {
    label,
    trainRowCount: trainRows.length,
    testRowCount: testRows.length,
    metrics: evaluate(testRows, models),
    coefficients: Object.fromEntries(PARTIES.map(party => [party, serialiseCoefficients(models[party])])),
  }
}

function main() {
  const training = readTraining()
  const rows = training.rows
  const output = {
    generatedAt: new Date().toISOString(),
    featureNames: ['intercept', ...FEATURE_NAMES],
    parties: PARTIES,
    yearBaselines: training.yearBaselines,
    scenarios: {
      inSampleAllYears: runScenario(rows, 'inSampleAllYears', () => true, () => true),
      holdout2025: runScenario(rows, 'holdout2025', row => row.electionYear !== 2025, row => row.electionYear === 2025),
    },
  }
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2))
  console.log(`Wrote OLS results to ${RESULTS_PATH}`)
  Object.entries(output.scenarios).forEach(([name, scenario]) => {
    console.log(`\n${name}: train=${scenario.trainRowCount} test=${scenario.testRowCount}`)
    PARTIES.forEach(party => {
      const m = scenario.metrics[party]
      console.log(`${party}: MAE=${m.weightedMae?.toFixed(2)} RMSE=${m.weightedRmse?.toFixed(2)}`)
    })
  })
}

main()
