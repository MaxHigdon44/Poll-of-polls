const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data/raw')
const OUT_DIR = path.join(ROOT, 'public/data')

const GE_CSV_FILE = 'HoC-GE2024-results-by-constituency.csv'
const WARD_PCON_FILE = 'ward_to_pcon_2024.csv'

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\u2019']/g, '')
    .replace(/\s+and\s+/g, ' and ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }
    current += char
  }
  result.push(current)
  return result
}

async function loadCsv(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i += 1) {
    rows.push(parseCsvLine(lines[i]))
  }
  return { headers, rows }
}

function parseNumber(value) {
  const num = Number(String(value || '').replace(/[^0-9]/g, ''))
  return Number.isFinite(num) ? num : 0
}

async function buildWardToPcon() {
  const csvPath = path.join(RAW_DIR, WARD_PCON_FILE)
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing file: ${csvPath}`)
  }
  const { headers, rows } = await loadCsv(csvPath)
  const normHeaders = headers.map(value =>
    String(value || '')
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .trim()
  )
  const wardIdx = normHeaders.findIndex(col => col.includes('wd24cd'))
  const wardNameIdx = normHeaders.findIndex(col => col.includes('wd24nm'))
  const ladNameIdx = normHeaders.findIndex(col => col.includes('lad24nm'))
  const pconIdx = normHeaders.findIndex(col => col.includes('pcon24cd'))
  const pconNameIdx = normHeaders.findIndex(col => col.includes('pcon24nm'))
  if ([wardIdx, wardNameIdx, ladNameIdx, pconIdx, pconNameIdx].some(idx => idx === -1)) {
    throw new Error('Missing ward/pcon columns in ward_to_pcon_2024.csv')
  }

  const wardToPcon = {}
  const wardNames = {}
  rows.forEach(row => {
    const wardCode = String(row[wardIdx] || '').trim()
    const wardName = String(row[wardNameIdx] || '').trim()
    const ladName = String(row[ladNameIdx] || '').trim()
    const pconCode = String(row[pconIdx] || '').trim()
    if (!wardCode || !pconCode) return
    wardToPcon[wardCode] = pconCode
    if (wardName && ladName) {
      const key = normalize(`${ladName}|${wardName}`)
      if (!wardNames[key]) wardNames[key] = pconCode
    }
  })

  return { wardToPcon, wardNames }
}

async function buildGe2024ByPcon() {
  const csvPath = path.join(RAW_DIR, GE_CSV_FILE)
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing file: ${csvPath}`)
  }
  const { headers, rows } = await loadCsv(csvPath)
  const normHeaders = headers.map(value =>
    String(value || '')
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .trim()
  )
  const getIdx = label => normHeaders.findIndex(col => col === label)
  const pconIdx = getIdx('ons id')
  const countryIdx = getIdx('country name')
  const validVotesIdx = getIdx('valid votes')
  const conIdx = getIdx('con')
  const labIdx = getIdx('lab')
  const ldIdx = getIdx('ld')
  const rukIdx = getIdx('ruk')
  const greenIdx = getIdx('green')
  const snpIdx = getIdx('snp')
  const pcIdx = getIdx('pc')
  const otherIdx = getIdx('all other candidates')

  if (
    [pconIdx, countryIdx, validVotesIdx, conIdx, labIdx, ldIdx, rukIdx, greenIdx, snpIdx, pcIdx, otherIdx].some(
      idx => idx === -1
    )
  ) {
    throw new Error('Missing required columns in HoC-GE2024-results-by-constituency.csv')
  }

  const results = {}
  rows.forEach(row => {
    const pconCode = String(row[pconIdx] || '').trim()
    const country = String(row[countryIdx] || '').trim()
    if (!pconCode) return
    if (country.toLowerCase() === 'northern ireland') return
    const validVotes = parseNumber(row[validVotesIdx])
    if (!validVotes) return
    const shares = {
      Conservative: (parseNumber(row[conIdx]) / validVotes) * 100,
      Labour: (parseNumber(row[labIdx]) / validVotes) * 100,
      'Liberal Democrat': (parseNumber(row[ldIdx]) / validVotes) * 100,
      Reform: (parseNumber(row[rukIdx]) / validVotes) * 100,
      Green: (parseNumber(row[greenIdx]) / validVotes) * 100,
      SNP: (parseNumber(row[snpIdx]) / validVotes) * 100,
      'Plaid Cymru': (parseNumber(row[pcIdx]) / validVotes) * 100,
      Other: (parseNumber(row[otherIdx]) / validVotes) * 100,
    }
    results[pconCode] = shares
  })

  return results
}

async function run() {
  const { wardToPcon, wardNames } = await buildWardToPcon()
  const results = await buildGe2024ByPcon()
  const missing = Array.from(new Set(Object.values(wardToPcon).filter(code => !results[code])))
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'ward-to-pcon.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), wards: wardToPcon, wardNames })
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'ge2024-pcon.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), pcon: results })
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'ge2024-missing.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), missing })
  )
  console.log(
    `Wrote ward-to-pcon.json (${Object.keys(wardToPcon).length}) and ge2024-pcon.json (${Object.keys(results).length})`
  )
  console.log(`Missing constituency matches: ${missing.length}`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
