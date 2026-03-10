const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data/raw')
const OUT_DIR = path.join(ROOT, 'public/data')

const DEGREE_WARD_FILE = 'degree_ward.csv'

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
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

async function buildDegreeShare(baseline) {
  const csvPath = path.join(RAW_DIR, DEGREE_WARD_FILE)
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
  const wardCodeIdx = normHeaders.findIndex(col =>
    col.includes('electoral wards and divisions code')
  )
  const wardNameIdx = normHeaders.findIndex(
    col => col.includes('electoral wards and divisions') && !col.includes('code')
  )
  const levelCodeIdx = normHeaders.findIndex(
    col => col.includes('highest level of qualification') && col.includes('code')
  )
  const obsIdx = normHeaders.findIndex(col => col.includes('observation'))
  if ([wardCodeIdx, wardNameIdx, levelCodeIdx, obsIdx].some(idx => idx === -1)) {
    throw new Error('Missing required degree columns')
  }

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()

  rows.forEach(row => {
    const wardCode = String(row[wardCodeIdx] || '').trim()
    if (!wardCode) return
    const wardNameRaw = String(row[wardNameIdx] || '').trim()
    const wardName = wardNameRaw.replace(/\s*\(([^)]+)\)\s*$/, '').trim()
    const wardLadMatch = wardNameRaw.match(/\(([^)]+)\)\s*$/)
    const wardLad = wardLadMatch ? wardLadMatch[1].trim() : null
    const levelCode = Number(row[levelCodeIdx])
    const obs = Number(row[obsIdx])
    if (!Number.isFinite(levelCode) || !Number.isFinite(obs)) return
    if (levelCode === -8 || levelCode === 6) return

    const entry = wardTotals.get(wardCode) || {
      wardName,
      total: 0,
      degree: 0,
      noDegree: 0,
    }
    if (levelCode === 5) {
      entry.degree += obs
    } else if (levelCode >= 0 && levelCode <= 4) {
      entry.noDegree += obs
    } else {
      return
    }
    entry.total += obs
    wardTotals.set(wardCode, entry)

    if (wardLad) {
      const key = `${normalize(wardLad)}|${normalize(wardName)}`
      wardNameMap.set(key, wardCode)
    }
    const nameKey = normalize(wardName)
    wardNameCounts.set(nameKey, (wardNameCounts.get(nameKey) || 0) + 1)
    if (!wardNameOnlyMap.has(nameKey)) wardNameOnlyMap.set(nameKey, wardCode)
    if (!wardNameAggressiveMap.has(nameKey)) wardNameAggressiveMap.set(nameKey, wardCode)
  })

  const wardEntries = {}
  wardTotals.forEach((value, code) => {
    if (!value.total) return
    wardEntries[code] = {
      wardCode: code,
      degree: value.degree / value.total,
      noDegree: value.noDegree / value.total,
      totalPop: value.total,
      wardName: value.wardName,
    }
  })

  const wardNameEntries = {}
  wardNameMap.forEach((code, key) => {
    const entry = wardEntries[code]
    if (entry) wardNameEntries[key] = entry
  })
  const wardNameOnlyEntries = {}
  wardNameOnlyMap.forEach((code, key) => {
    if (wardNameCounts.get(key) !== 1) return
    const entry = wardEntries[code]
    if (entry) wardNameOnlyEntries[key] = entry
  })
  const wardNameAggressiveEntries = {}
  wardNameAggressiveMap.forEach((code, key) => {
    const entry = wardEntries[code]
    if (entry) wardNameAggressiveEntries[key] = entry
  })

  const ladEntries = {}
  const ladTotals = new Map()
  baseline.forEach(ward => {
    const degree = wardEntries[ward.wardCode]
    if (!degree || !degree.totalPop) return
    const entry = ladTotals.get(ward.ladCode) || {
      total: 0,
      degree: 0,
      noDegree: 0,
    }
    entry.total += degree.totalPop
    entry.degree += degree.degree * degree.totalPop
    entry.noDegree += degree.noDegree * degree.totalPop
    ladTotals.set(ward.ladCode, entry)
  })
  ladTotals.forEach((value, code) => {
    if (!value.total) return
    ladEntries[code] = {
      degree: value.degree / value.total,
      noDegree: value.noDegree / value.total,
    }
  })

  let totalPop = 0
  let totalDegree = 0
  let totalNoDegree = 0
  Object.values(wardEntries).forEach(entry => {
    totalPop += entry.totalPop
    totalDegree += entry.degree * entry.totalPop
    totalNoDegree += entry.noDegree * entry.totalPop
  })
  const baselineShares = totalPop
    ? {
        degree: totalDegree / totalPop,
        noDegree: totalNoDegree / totalPop,
      }
    : { degree: 0.4, noDegree: 0.6 }

  const shareOutput = {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: { baseline: baselineShares },
  }

  const missingByLad = {}
  baseline.forEach(ward => {
    if (shareOutput.wards?.[ward.wardCode]) return
    const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
    if (shareOutput.wardNames?.[nameKey]) return
    const nameOnlyKey = normalize(ward.wardName)
    if (shareOutput.wardNamesOnly?.[nameOnlyKey]) return
    if (shareOutput.wardNamesAggressive?.[nameOnlyKey]) return
    const ladName = ward.ladName || 'Unknown'
    if (!missingByLad[ladName]) missingByLad[ladName] = []
    missingByLad[ladName].push({
      wardCode: ward.wardCode,
      wardName: ward.wardName,
      ladCode: ward.ladCode,
    })
  })
  const sortedMissing = Object.fromEntries(
    Object.entries(missingByLad)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ladName, wards]) => [
        ladName,
        wards.sort((a, b) => a.wardName.localeCompare(b.wardName)),
      ])
  )

  return { shareOutput, missing: sortedMissing }
}

async function run() {
  const baselinePath = path.join(OUT_DIR, 'ward-baseline.json')
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Missing file: ${baselinePath}`)
  }
  const baseline = JSON.parse(await fs.promises.readFile(baselinePath, 'utf8'))
  const { shareOutput, missing } = await buildDegreeShare(baseline.wards || [])
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'degree-share.json'),
    JSON.stringify(shareOutput)
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'degree-missing.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), missingByLad: missing })
  )
  console.log('Wrote degree-share.json and degree-missing.json')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
