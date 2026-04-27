const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'data')
const TRAINING_JSON = path.join(OUT_DIR, 'ols-training.json')
const TRAINING_CSV = path.join(OUT_DIR, 'ols-training.csv')
const BASELINE_PATH = path.join(OUT_DIR, 'ward-baseline.json')
const FILE_2017 = '/Users/maxhigdon/Downloads/leap-2017-05-04.csv'
const FILE_2018 = '/Users/maxhigdon/Downloads/leap-2018-05-03.csv'
const FILE_2019 = '/Users/maxhigdon/Downloads/leap-2019-05-02.csv'
const FILE_2021 = path.join(ROOT, 'data', 'raw', 'LEH-2021.xlsx')
const FILE_2022 = path.join(ROOT, 'data', 'raw', 'local-elections-2022.xlsx')
const FILE_2024 = path.join(ROOT, 'data', 'raw', 'LEH-2024-results-HoC-version.xlsx')
const FILE_2025 = '/Users/maxhigdon/Downloads/LEH-2025-results-HoC.xlsx'

const NATIONAL_PARTIES = ['Labour', 'Conservative', 'Reform', 'Liberal Democrat', 'Green']
const ALL_PARTIES = [...NATIONAL_PARTIES, 'SNP', 'Plaid Cymru']
const YEAR_WEIGHTS = {
  2018: 0.35,
  2019: 0.45,
  2021: 0.55,
  2022: 0.7,
  2024: 0.85,
  2025: 1.0,
}
const DEFAULT_LEAVE_SHARE = 0.52
const COUNTY_REGION_LOOKUP = {
  E10000003: 'East of England',
  E10000007: 'East Midlands',
  E10000008: 'South West',
  E10000011: 'South East',
  E10000012: 'East of England',
  E10000013: 'South West',
  E10000014: 'South East',
  E10000015: 'East of England',
  E10000016: 'South East',
  E10000018: 'East Midlands',
  E10000019: 'East Midlands',
  E10000020: 'East of England',
  E10000024: 'East Midlands',
  E10000025: 'South East',
  E10000028: 'West Midlands',
  E10000029: 'East of England',
  E10000031: 'West Midlands',
  E10000032: 'South East',
  E10000034: 'West Midlands',
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, name), 'utf8'))
}

function normalizeName(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bcounty durham\b/g, 'durham')
    .replace(/\bkingston upon hull\b/g, 'hull')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSubAreaName(value) {
  return normalizeName(value).replace(/\bed\b/g, '').replace(/\s+/g, ' ').trim()
}

function normalizeCouncilName(value) {
  return normalizeName(value)
    .replace(/[^\w\s]/g, '')
    .replace(/\bcouncil\b/g, '')
    .replace(/\bdistrict\b/g, '')
    .replace(/\bborough\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\bcity of\b/g, '')
    .replace(/\bborough of\b/g, '')
    .replace(/\bmetropolitan\b/g, '')
    .replace(/\bunitary\b/g, '')
    .replace(/\bof\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function typeFromCode(code) {
  const text = String(code || '')
  return text.startsWith('E58') || text.startsWith('W58') ? 'ced' : 'ward'
}

function partyFromToken(value) {
  const normalized = normalizeName(value)
  const upper = String(value || '').trim().toUpperCase()
  if (
    upper === 'LAB' ||
    upper === 'LABOUR' ||
    normalized === 'lab' ||
    normalized === 'labour' ||
    normalized.includes('labour')
  ) return 'Labour'
  if (
    upper === 'C' ||
    upper === 'CON' ||
    upper === 'CONSERVATIVE' ||
    normalized === 'c' ||
    normalized === 'con' ||
    normalized.includes('conservative')
  ) return 'Conservative'
  if (
    upper === 'LD' ||
    upper === 'LIB' ||
    upper === 'LIBDEM' ||
    normalized === 'ld' ||
    normalized === 'lib' ||
    normalized.includes('lib dem') ||
    normalized.includes('liberal democrat')
  ) return 'Liberal Democrat'
  if (
    upper === 'GRN' ||
    upper === 'GREEN' ||
    normalized === 'grn' ||
    normalized === 'green' ||
    normalized.includes('green')
  ) return 'Green'
  if (
    upper === 'REF' ||
    upper === 'BP' ||
    upper === 'BREXIT' ||
    upper === 'UKIP' ||
    normalized === 'ref' ||
    normalized.includes('reform') ||
    normalized.includes('brexit') ||
    normalized === 'ukip'
  ) return 'Reform'
  if (upper === 'SNP' || normalized === 'snp') return 'SNP'
  if (upper === 'PC' || normalized.includes('plaid')) return 'Plaid Cymru'
  return null
}

function emptyNationalShares() {
  return Object.fromEntries(ALL_PARTIES.map(party => [party, 0]))
}

function buildLookupContext() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
  const leave = readJson('leave-share.json')
  const age = readJson('age-share.json')
  const nssec = readJson('nssec-share.json')
  const degree = readJson('degree-share.json')
  const tenure = readJson('tenure-share.json')
  const ruralUrban = readJson('rural-urban-share.json')
  const ladRegion = readJson('lad-region.json')
  const geByPcon = readJson('ge2024-pcon.json')
  const wardToPcon = readJson('ward-to-pcon.json')
  const cedToPcon = readJson('ced-to-pcon.json')
  const baselineByCode = new Map(baseline.wards.map(row => [row.wardCode, row]))
  return {
    baseline,
    leave,
    age,
    nssec,
    degree,
    tenure,
    ruralUrban,
    ladRegion,
    geByPcon,
    wardToPcon,
    cedToPcon,
    baselineByCode,
  }
}

function resolveGenericShare(dataset, row) {
  if (!dataset) return { share: null, source: 'missing' }
  if (row.wardCode && dataset.wards?.[row.wardCode]) {
    return { share: dataset.wards[row.wardCode], source: 'code' }
  }
  const fullKey = `${normalizeCouncilName(row.ladName)}|${normalizeName(row.wardName)}`
  if (dataset.wardNames?.[fullKey]) {
    return { share: dataset.wardNames[fullKey], source: 'name' }
  }
  const fullKeySub = `${normalizeCouncilName(row.ladName)}|${normalizeSubAreaName(row.wardName)}`
  if (dataset.wardNames?.[fullKeySub]) {
    return { share: dataset.wardNames[fullKeySub], source: 'name-subarea' }
  }
  const nameOnly = normalizeName(row.wardName)
  if (dataset.wardNamesOnly?.[nameOnly]) {
    return { share: dataset.wardNamesOnly[nameOnly], source: 'name-only' }
  }
  const aggressive = normalizeSubAreaName(row.wardName)
  if (dataset.wardNamesAggressive?.[aggressive]) {
    return { share: dataset.wardNamesAggressive[aggressive], source: 'aggressive' }
  }
  if (row.ladCode && dataset.lads?.[row.ladCode]) {
    return { share: dataset.lads[row.ladCode], source: 'lad' }
  }
  return { share: null, source: 'missing' }
}

function resolveLeaveShare(dataset, row) {
  if (row.wardCode && dataset.wards?.[row.wardCode]) {
    return { share: dataset.wards[row.wardCode], source: 'code' }
  }
  const nameOnly = normalizeName(row.wardName)
  if (dataset.wardNames?.[nameOnly]) {
    return { share: dataset.wardNames[nameOnly], source: 'name' }
  }
  const aggressive = normalizeSubAreaName(row.wardName)
  if (dataset.wardNames?.[aggressive]) {
    return { share: dataset.wardNames[aggressive], source: 'name-subarea' }
  }
  if (row.ladCode && dataset.lads?.[row.ladCode]) {
    return { share: dataset.lads[row.ladCode], source: 'lad' }
  }
  return { share: null, source: 'missing' }
}

function resolveRegionName(ladRegion, row) {
  if (row.ladCode && ladRegion.lads?.[row.ladCode]?.regionName) {
    return ladRegion.lads[row.ladCode].regionName
  }
  if (row.ladCode && COUNTY_REGION_LOOKUP[row.ladCode]) {
    return COUNTY_REGION_LOOKUP[row.ladCode]
  }
  return null
}

function resolvePconCode(context, row) {
  if (!row.wardCode) return null
  if (row.subareaType === 'ced') {
    return context.cedToPcon.ceds?.[row.wardCode] || null
  }
  return context.wardToPcon.wards?.[row.wardCode] || null
}

function buildFeatureBundle(context, row) {
  const leave = resolveLeaveShare(context.leave, row)
  const age = resolveGenericShare(context.age, row)
  const nssec = resolveGenericShare(context.nssec, row)
  const degree = resolveGenericShare(context.degree, row)
  const tenure = resolveGenericShare(context.tenure, row)
  const ruralUrban = resolveGenericShare(context.ruralUrban, row)
  const regionName = resolveRegionName(context.ladRegion, row)
  const pconCode = resolvePconCode(context, row)
  const ge = pconCode ? context.geByPcon.pcon?.[pconCode] || null : null
  const ageBaseline = context.age.meta?.baseline || { age18_35: 0.29, age35_55: 0.33, age55_plus: 0.38 }
  const nssecBaseline = context.nssec.meta?.baseline || { higher: 0.36, intermediate: 0.24, lower: 0.4 }
  const degreeBaseline = context.degree.meta?.baseline || { degree: 0.346, noDegree: 0.654 }
  const tenureBaseline = context.tenure.meta?.baseline || { ownedOutright: 0.328, ownsWithMortgage: 0.297, socialRented: 0.171, privateRented: 0.204 }
  const ruralUrbanBaseline = context.ruralUrban.meta?.baseline || { conurbation: 0.285, cityTown: 0.506, ruralTownFringe: 0.11, ruralVillageHamlet: 0.099 }

  return {
    leaveShare: leave.share?.leaveShare ?? DEFAULT_LEAVE_SHARE,
    age18_35: age.share?.age18_35 ?? ageBaseline.age18_35,
    age35_55: age.share?.age35_55 ?? ageBaseline.age35_55,
    age55_plus: age.share?.age55_plus ?? ageBaseline.age55_plus,
    nssecHigher: nssec.share?.higher ?? nssecBaseline.higher,
    nssecIntermediate: nssec.share?.intermediate ?? nssecBaseline.intermediate,
    nssecLower: nssec.share?.lower ?? nssecBaseline.lower,
    degree: degree.share?.degree ?? degreeBaseline.degree,
    noDegree: degree.share?.noDegree ?? degreeBaseline.noDegree,
    ownedOutright: tenure.share?.ownedOutright ?? tenureBaseline.ownedOutright,
    ownsWithMortgage: tenure.share?.ownsWithMortgage ?? tenureBaseline.ownsWithMortgage,
    socialRented: tenure.share?.socialRented ?? tenureBaseline.socialRented,
    privateRented: tenure.share?.privateRented ?? tenureBaseline.privateRented,
    ruralConurbation: ruralUrban.share?.conurbation ?? ruralUrbanBaseline.conurbation,
    ruralCityTown: ruralUrban.share?.cityTown ?? ruralUrbanBaseline.cityTown,
    ruralTownFringe: ruralUrban.share?.ruralTownFringe ?? ruralUrbanBaseline.ruralTownFringe,
    ruralVillageHamlet: ruralUrban.share?.ruralVillageHamlet ?? ruralUrbanBaseline.ruralVillageHamlet,
    geLabour: ge?.Labour ?? 0,
    geConservative: ge?.Conservative ?? 0,
    geReform: ge?.Reform ?? 0,
    geLibDem: ge?.['Liberal Democrat'] ?? 0,
    geGreen: ge?.Green ?? 0,
    regionName,
    pconCode,
  }
}

function computeYearBaselines(rows) {
  const byYear = new Map()
  rows.forEach(row => {
    const weight = Math.max((row.totalVotes || 0) / Math.max(row.seats || 1, 1), 1)
    const entry = byYear.get(row.electionYear) || {
      weight: 0,
      totals: Object.fromEntries(NATIONAL_PARTIES.map(party => [party, 0])),
    }
    NATIONAL_PARTIES.forEach(party => {
      entry.totals[party] += (row.actualShares[party] || 0) * weight
    })
    entry.weight += weight
    byYear.set(row.electionYear, entry)
  })
  return Object.fromEntries(
    Array.from(byYear.entries()).map(([year, entry]) => [
      String(year),
      Object.fromEntries(
        NATIONAL_PARTIES.map(party => [party, entry.weight ? entry.totals[party] / entry.weight : 0])
      ),
    ])
  )
}

function makeObservedRow({ electionYear, ladName, ladCode, wardName, wardCode, seats, totalVotes, actualShares }) {
  return {
    electionYear,
    ladName,
    ladCode,
    wardName,
    wardCode,
    seats,
    totalVotes,
    actualShares: { ...emptyNationalShares(), ...actualShares },
    subareaType: typeFromCode(wardCode),
  }
}

function parseLeapCsv(filePath, electionYear) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  const grouped = new Map()
  lines.forEach(line => {
    const row = line
      .split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
      .map(cell => cell.replace(/^"|"$/g, ''))
    if (row.length < 8) return
    const [ladName, ladCode, wardName, wardCode, , partyRaw, votesRaw] = row
    if (!String(ladCode || '').startsWith('E') && !String(ladCode || '').startsWith('W')) return
    const key = `${ladCode}|${wardCode}`
    const entry = grouped.get(key) || {
      electionYear,
      ladName,
      ladCode,
      wardName,
      wardCode,
      seats: 1,
      totalVotes: 0,
      actualShares: emptyNationalShares(),
    }
    const votes = toNumber(votesRaw)
    entry.totalVotes += votes
    const party = partyFromToken(partyRaw)
    if (party) entry.actualShares[party] += votes
    grouped.set(key, entry)
  })

  return Array.from(grouped.values()).map(row => {
    const shares = emptyNationalShares()
    ALL_PARTIES.forEach(party => {
      shares[party] = row.totalVotes ? (row.actualShares[party] / row.totalVotes) * 100 : 0
    })
    return makeObservedRow({ ...row, actualShares: shares })
  })
}

function toObjectsFromSecondRow(workbook, sheetName) {
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null })
  const header = rows[1]
  return rows.slice(2).map(row => {
    const obj = {}
    header.forEach((key, index) => {
      obj[key] = row[index]
    })
    return obj
  })
}

function parseHocWardWorkbook(filePath, electionYear, wardSheetName) {
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const rows = toObjectsFromSecondRow(workbook, wardSheetName)
  const output = []
  rows.forEach(row => {
    const ladName = row['Local authority name'] || row['Upper tier authority'] || row['Lower tier authority']
    const ladCode = row['Local authority code'] || null
    const wardName = row['Ward name'] || row['Ward/ County Electoral District name']
    const wardCode = row['Ward code'] || row['Ward/ED code'] || row['ONS ward code '] || row['ONS ward code']
    if (!ladName || !wardName || !wardCode) return
    if (!String(wardCode).startsWith('E') && !String(wardCode).startsWith('W')) return
    const totalVotes = toNumber(row['Total votes']) || [
      'LAB','CON','LD','GREEN','REF','IND','Other parties / candidates'
    ].reduce((acc, key) => acc + toNumber(row[key]), 0)
    const seats = toNumber(row.Vacancies || row.Seats) || 1
    const shares = emptyNationalShares()
    const rawVotes = {
      Labour: toNumber(row.LAB),
      Conservative: toNumber(row.CON),
      'Liberal Democrat': toNumber(row.LD) + toNumber(row.LIB) + toNumber(row.LIBER),
      Green: toNumber(row.GREEN),
      Reform: toNumber(row.REF) + toNumber(row.UKIP) + toNumber(row.BP),
      SNP: toNumber(row.SNP),
      'Plaid Cymru': toNumber(row.PC),
    }
    ALL_PARTIES.forEach(party => {
      shares[party] = totalVotes ? (rawVotes[party] / totalVotes) * 100 : 0
    })
    output.push(makeObservedRow({
      electionYear,
      ladName,
      ladCode,
      wardName,
      wardCode,
      seats,
      totalVotes,
      actualShares: shares,
    }))
  })
  return output
}

function parse2025WardWorkbook(filePath, electionYear) {
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const rows = toObjectsFromSecondRow(workbook, 'Ward results')
  return rows
    .map(row => {
      const wardName = row['Ward/ County Electoral District name']
      const wardCode = row['ONS ward code '] || row['ONS ward code']
      const ladName = row['Lower tier authority'] || row['Upper tier authority']
      if (!wardName || !wardCode || !ladName) return null
      if (!String(wardCode).startsWith('E') && !String(wardCode).startsWith('W')) return null
      const totalVotes = ['LAB','CON','LD','GREEN','REF','IND','Other parties / candidates']
        .reduce((acc, key) => acc + toNumber(row[key]), 0)
      const shares = emptyNationalShares()
      const rawVotes = {
        Labour: toNumber(row.LAB),
        Conservative: toNumber(row.CON),
        'Liberal Democrat': toNumber(row.LD),
        Green: toNumber(row.GREEN),
        Reform: toNumber(row.REF),
        SNP: 0,
        'Plaid Cymru': 0,
      }
      ALL_PARTIES.forEach(party => {
        shares[party] = totalVotes ? (rawVotes[party] / totalVotes) * 100 : 0
      })
      return makeObservedRow({
        electionYear,
        ladName,
        ladCode: null,
        wardName,
        wardCode,
        seats: toNumber(row.Seats) || 1,
        totalVotes,
        actualShares: shares,
      })
    })
    .filter(Boolean)
}

function enrichObservedRows(context, rows) {
  return rows.map(row => {
    const baselineMatch = context.baselineByCode.get(row.wardCode)
    const enriched = {
      ...row,
      ladCode: row.ladCode || baselineMatch?.ladCode || null,
      ladName: row.ladName || baselineMatch?.ladName || '',
    }
    return {
      ...enriched,
      features: buildFeatureBundle(context, enriched),
    }
  })
}

function buildMatchedTrainingRows(context, observedRows) {
  const byKey = new Map()
  observedRows.forEach(row => {
    const key = `${normalizeCouncilName(row.ladName)}|${normalizeName(row.wardName)}`
    const list = byKey.get(key) || []
    list.push(row)
    byKey.set(key, list)
  })

  const yearBaselines = computeYearBaselines(observedRows)
  const trainingRows = []
  byKey.forEach(rows => {
    rows.sort((a, b) => a.electionYear - b.electionYear)
    for (let index = 1; index < rows.length; index += 1) {
      const current = rows[index]
      const previous = rows[index - 1]
      if (!current || !previous) continue
      if (normalizeName(current.wardName) !== normalizeName(previous.wardName)) continue
      const baselineNational = yearBaselines[String(previous.electionYear)] || {}
      const currentNational = yearBaselines[String(current.electionYear)] || {}
      const nationalDelta = Object.fromEntries(
        NATIONAL_PARTIES.map(party => [party, (currentNational[party] || 0) - (baselineNational[party] || 0)])
      )
      const targetSwing = Object.fromEntries(
        NATIONAL_PARTIES.map(party => [party, (current.actualShares[party] || 0) - (previous.actualShares[party] || 0)])
      )
      trainingRows.push({
        id: `${previous.electionYear}->${current.electionYear}:${current.wardCode || current.wardName}`,
        previousYear: previous.electionYear,
        electionYear: current.electionYear,
        source: `${previous.electionYear}->${current.electionYear}`,
        wardCode: current.wardCode,
        wardName: current.wardName,
        ladCode: current.ladCode || '',
        ladName: current.ladName,
        subareaType: current.subareaType,
        seats: current.seats,
        totalVotes: current.totalVotes,
        recencyWeight: YEAR_WEIGHTS[current.electionYear] || 1,
        baselineShares: Object.fromEntries(NATIONAL_PARTIES.map(party => [party, previous.actualShares[party] || 0])),
        actualShares: Object.fromEntries(NATIONAL_PARTIES.map(party => [party, current.actualShares[party] || 0])),
        baselineNational,
        currentNational,
        nationalDelta,
        targetSwing,
        features: current.features,
        match: {
          previousWardCode: previous.wardCode,
          previousWardName: previous.wardName,
        },
      })
    }
  })

  return { trainingRows, yearBaselines }
}

function flattenTrainingRow(row) {
  const flat = {
    id: row.id,
    previousYear: row.previousYear,
    electionYear: row.electionYear,
    source: row.source,
    wardCode: row.wardCode || '',
    wardName: row.wardName,
    ladCode: row.ladCode || '',
    ladName: row.ladName,
    subareaType: row.subareaType,
    seats: row.seats,
    totalVotes: row.totalVotes,
    recencyWeight: row.recencyWeight,
    regionName: row.features.regionName || '',
    pconCode: row.features.pconCode || '',
  }

  NATIONAL_PARTIES.forEach(party => {
    const key = party.replace(/\s+/g, '')
    flat[`baselineShare_${key}`] = row.baselineShares[party] ?? 0
    flat[`actualShare_${key}`] = row.actualShares[party] ?? 0
    flat[`nationalDelta_${key}`] = row.nationalDelta[party] ?? 0
    flat[`targetSwing_${key}`] = row.targetSwing[party] ?? 0
  })

  Object.entries(row.features).forEach(([key, value]) => {
    if (key === 'regionName' || key === 'pconCode') return
    flat[key] = value == null ? '' : value
  })

  return flat
}

function toCsv(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = value => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [headers.join(','), ...rows.map(row => headers.map(key => escape(row[key])).join(','))].join('\n')
}

function main() {
  const context = buildLookupContext()
  const observedRows = [
    ...parseLeapCsv(FILE_2017, 2017),
    ...parseLeapCsv(FILE_2018, 2018),
    ...parseLeapCsv(FILE_2019, 2019),
    ...parseHocWardWorkbook(FILE_2021, 2021, 'Wards-results'),
    ...parseHocWardWorkbook(FILE_2022, 2022, 'Wards-results'),
    ...parseHocWardWorkbook(FILE_2024, 2024, 'Wards results'),
    ...parse2025WardWorkbook(FILE_2025, 2025),
  ]
  const enrichedObservedRows = enrichObservedRows(context, observedRows)
  const { trainingRows, yearBaselines } = buildMatchedTrainingRows(context, enrichedObservedRows)
  const output = {
    generatedAt: new Date().toISOString(),
    parties: NATIONAL_PARTIES,
    yearWeights: YEAR_WEIGHTS,
    yearBaselines,
    observedRowCount: enrichedObservedRows.length,
    rowCount: trainingRows.length,
    rows: trainingRows,
  }
  fs.writeFileSync(TRAINING_JSON, JSON.stringify(output, null, 2))
  fs.writeFileSync(TRAINING_CSV, toCsv(trainingRows.map(flattenTrainingRow)))

  const byYear = trainingRows.reduce((acc, row) => {
    acc[row.electionYear] = (acc[row.electionYear] || 0) + 1
    return acc
  }, {})
  console.log(`Wrote ${trainingRows.length} matched swing rows`)
  console.log('Rows by election year:', byYear)
  console.log(`JSON: ${TRAINING_JSON}`)
  console.log(`CSV:  ${TRAINING_CSV}`)
}

main()
