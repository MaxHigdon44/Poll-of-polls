const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const ROOT = path.resolve(__dirname, '..')
const RAW_2021 = path.join(ROOT, 'data', 'raw', 'LEH-2021.xlsx')
const RAW_2025 = '/Users/maxhigdon/Downloads/LEH-2025-results-HoC.xlsx'

const OUT_SEATS = path.join(ROOT, 'public', 'data', 'may-2025-council-seats.json')
const OUT_PREVIOUS = path.join(ROOT, 'public', 'data', 'may-2025-council-previous.json')
const OUT_ACTUAL = path.join(ROOT, 'public', 'data', 'may-2025-actual-results.json')

const TARGET_COUNCILS = [
  'Cambridgeshire',
  'Derbyshire',
  'Devon',
  'Gloucestershire',
  'Hertfordshire',
  'Kent',
  'Leicestershire',
  'Lincolnshire',
  'Nottinghamshire',
  'Oxfordshire',
  'Staffordshire',
  'Warwickshire',
  'Worcestershire',
  'Doncaster',
  'Buckinghamshire',
  'Cornwall',
  'County Durham',
  'North Northamptonshire',
  'Northumberland',
  'Shropshire',
  'West Northamptonshire',
  'Wiltshire',
]

const KNOWN_PARTIES = new Set([
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
  'Independent',
])

function normalizeName(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\bcounty durham\b/g, 'durham')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapControlToParty(label) {
  if (!label) return null
  const normalized = normalizeName(label)
  if (normalized === 'lab' || normalized === 'labour' || normalized === 'labour and co operative party') return 'Labour'
  if (normalized === 'con' || normalized === 'conservative' || normalized.includes('conservative')) return 'Conservative'
  if (normalized === 'ld' || normalized === 'lib dem' || normalized === 'liberal democrats' || normalized.includes('liberal democrat')) {
    return 'Liberal Democrat'
  }
  if (normalized === 'ref' || normalized === 'reform uk' || normalized.includes('reform')) return 'Reform'
  if (normalized === 'green' || normalized === 'green party' || normalized.includes('green')) return 'Green'
  if (normalized === 'pc' || normalized.includes('plaid')) return 'Plaid Cymru'
  if (normalized === 'snp') return 'SNP'
  if (normalized.includes('no overall control')) return null
  if (
    normalized === 'ind' ||
    normalized === 'independent' ||
    normalized === 'independents' ||
    normalized.includes('independent')
  ) {
    return 'Independent'
  }
  if (normalized.includes('labour')) return 'Labour'
  if (normalized.includes('conservative')) return 'Conservative'
  if (normalized.includes('liberal democrat') || normalized === 'ld' || normalized.includes('lib dem')) {
    return 'Liberal Democrat'
  }
  if (normalized.includes('reform') || normalized === 'ref') return 'Reform'
  if (normalized.includes('green')) return 'Green'
  if (normalized.includes('snp')) return 'SNP'
  if (normalized.includes('plaid')) return 'Plaid Cymru'
  return null
}

function normalizeSeatsParty(label) {
  const mapped = mapControlToParty(label)
  if (mapped) return mapped
  return label || 'Other'
}

function controlFromSeats(seats) {
  const totalSeats = Object.values(seats).reduce((acc, value) => acc + (value || 0), 0)
  const winner = Object.entries(seats).find(([, value]) => value > totalSeats / 2)
  return winner ? winner[0] : null
}

function desiredCouncilName(name) {
  const normalized = normalizeName(name)
  for (const council of TARGET_COUNCILS) {
    if (normalizeName(council) === normalized) return council
  }
  if (normalized === 'durham') return 'County Durham'
  return name || ''
}

function getCouncilFor2021Row(row) {
  const countyName = row['County name']
  const localName = row['Local authority name']
  if (countyName && TARGET_COUNCILS.some(c => normalizeName(c) === normalizeName(countyName))) {
    return desiredCouncilName(countyName)
  }
  if (localName && TARGET_COUNCILS.some(c => normalizeName(c) === normalizeName(localName))) {
    return desiredCouncilName(localName)
  }
  return null
}

function getCouncilFor2025Row(row) {
  const upperName = row['Upper tier authority']
  const lowerName = row['Lower tier authority']
  if (upperName && TARGET_COUNCILS.some(c => normalizeName(c) === normalizeName(upperName))) {
    return desiredCouncilName(upperName)
  }
  if (lowerName && TARGET_COUNCILS.some(c => normalizeName(c) === normalizeName(lowerName))) {
    return desiredCouncilName(lowerName)
  }
  if (normalizeName(upperName) === 'durham') return 'County Durham'
  if (normalizeName(lowerName) === 'durham') return 'County Durham'
  return null
}

function toObjects(workbook, sheetName) {
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

function addSeat(target, party) {
  target[party] = (target[party] || 0) + 1
}

function build2021Data() {
  const workbook = xlsx.readFile(RAW_2021, { cellDates: false })
  const rows = toObjects(workbook, 'Candidates-results')
  const grouped = new Map()

  rows.forEach(row => {
    const council = getCouncilFor2021Row(row)
    if (!council) return
    if (!row.Elected) return
    const current = grouped.get(council) || {
      council,
      seatsBefore: {},
      wardIncumbents: {},
      totalSeats: 0,
    }
    const party = normalizeSeatsParty(row['Party name'] || row['Party group'])
    addSeat(current.seatsBefore, party)
    current.totalSeats += 1
    const wardName = row['Ward/ED name']
    if (wardName) {
      current.wardIncumbents[wardName] = party
      current.wardIncumbents[normalizeName(wardName)] = party
    }
    grouped.set(council, current)
  })

  const councils = TARGET_COUNCILS.map(council => {
    const entry = grouped.get(council) || {
      council,
      seatsBefore: {},
      wardIncumbents: {},
      totalSeats: 0,
    }
    return {
      council,
      seatsUp: entry.totalSeats,
      totalSeats: entry.totalSeats,
      control: controlFromSeats(entry.seatsBefore),
      url: '',
      lastElection: { ...entry.seatsBefore },
      seatsBefore: { ...entry.seatsBefore },
      wardIncumbents: entry.wardIncumbents,
    }
  })

  return councils
}

function build2025ActualData(previousByCouncil) {
  const workbook = xlsx.readFile(RAW_2025, { cellDates: false })
  const rows = toObjects(workbook, 'Candidates result')
  const grouped = new Map()

  rows.forEach(row => {
    const council = getCouncilFor2025Row(row)
    if (!council) return
    if (!row.Elected) return
    const current = grouped.get(council) || {
      council,
      actualSeats: {},
      totalSeats: 0,
    }
    const party = normalizeSeatsParty(row['Party name'])
    addSeat(current.actualSeats, party)
    current.totalSeats += 1
    grouped.set(council, current)
  })

  return TARGET_COUNCILS.map(council => {
    const previous = previousByCouncil.get(council)
    const actual = grouped.get(council) || {
      council,
      actualSeats: {},
      totalSeats: previous?.totalSeats || 0,
    }
    return {
      council,
      seatsUp: actual.totalSeats,
      totalSeats: actual.totalSeats,
      actualControl: controlFromSeats(actual.actualSeats),
      actualSeats: actual.actualSeats,
      previousControl: previous?.control || null,
    }
  })
}

function main() {
  const previousCouncils = build2021Data()
  const previousByCouncil = new Map(previousCouncils.map(row => [row.council, row]))
  const actualCouncils = build2025ActualData(previousByCouncil)
  const seatsData = {
    generatedAt: new Date().toISOString(),
    councils: TARGET_COUNCILS.map(council => {
      const previous = previousByCouncil.get(council)
      const actual = actualCouncils.find(row => row.council === council)
      return {
        council,
        seatsUp: actual?.seatsUp || previous?.totalSeats || 0,
        totalSeats: actual?.totalSeats || previous?.totalSeats || 0,
        control: previous?.control || null,
      }
    }),
  }
  const previousData = {
    generatedAt: new Date().toISOString(),
    councils: previousCouncils.map(row => ({
      council: row.council,
      url: row.url,
      lastElection: row.lastElection,
      seatsBefore: row.seatsBefore,
      wardIncumbents: row.wardIncumbents,
    })),
  }
  const actualData = {
    generatedAt: new Date().toISOString(),
    councils: actualCouncils,
  }

  fs.writeFileSync(OUT_SEATS, JSON.stringify(seatsData, null, 2) + '\n')
  fs.writeFileSync(OUT_PREVIOUS, JSON.stringify(previousData, null, 2) + '\n')
  fs.writeFileSync(OUT_ACTUAL, JSON.stringify(actualData, null, 2) + '\n')

  console.log(`Wrote ${OUT_SEATS}`)
  console.log(`Wrote ${OUT_PREVIOUS}`)
  console.log(`Wrote ${OUT_ACTUAL}`)
}

main()
