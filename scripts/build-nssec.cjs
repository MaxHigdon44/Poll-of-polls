const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data/raw')
const OUT_DIR = path.join(ROOT, 'public/data')

const NSSEC_WARD_FILE = 'nssec_ward.csv'

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

async function buildNssecShare(baseline) {
  const csvPath = path.join(RAW_DIR, NSSEC_WARD_FILE)
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
  const nssecCodeIdx = normHeaders.findIndex(col => col.includes('ns-sec') && col.includes('code'))
  const obsIdx = normHeaders.findIndex(col => col.includes('observation'))
  if ([wardCodeIdx, wardNameIdx, nssecCodeIdx, obsIdx].some(idx => idx === -1)) {
    throw new Error('Missing required NS-SEC columns')
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
    const nssecCode = Number(row[nssecCodeIdx])
    const obs = Number(row[obsIdx])
    if (!Number.isFinite(nssecCode) || !Number.isFinite(obs)) return
    if (nssecCode === -8 || nssecCode === 9) return

    const entry = wardTotals.get(wardCode) || {
      wardName,
      total: 0,
      higher: 0,
      intermediate: 0,
      lower: 0,
    }
    if (nssecCode === 1 || nssecCode === 2) {
      entry.higher += obs
    } else if (nssecCode === 3 || nssecCode === 4) {
      entry.intermediate += obs
    } else if ([5, 6, 7, 8].includes(nssecCode)) {
      entry.lower += obs
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
      higher: value.higher / value.total,
      intermediate: value.intermediate / value.total,
      lower: value.lower / value.total,
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
    const nssec = wardEntries[ward.wardCode]
    if (!nssec || !nssec.totalPop) return
    const entry = ladTotals.get(ward.ladCode) || {
      total: 0,
      higher: 0,
      intermediate: 0,
      lower: 0,
    }
    entry.total += nssec.totalPop
    entry.higher += nssec.higher * nssec.totalPop
    entry.intermediate += nssec.intermediate * nssec.totalPop
    entry.lower += nssec.lower * nssec.totalPop
    ladTotals.set(ward.ladCode, entry)
  })
  ladTotals.forEach((value, code) => {
    if (!value.total) return
    ladEntries[code] = {
      higher: value.higher / value.total,
      intermediate: value.intermediate / value.total,
      lower: value.lower / value.total,
    }
  })

  let totalPop = 0
  let totalHigher = 0
  let totalIntermediate = 0
  let totalLower = 0
  Object.values(wardEntries).forEach(entry => {
    totalPop += entry.totalPop
    totalHigher += entry.higher * entry.totalPop
    totalIntermediate += entry.intermediate * entry.totalPop
    totalLower += entry.lower * entry.totalPop
  })
  const baselineShares = totalPop
    ? {
        higher: totalHigher / totalPop,
        intermediate: totalIntermediate / totalPop,
        lower: totalLower / totalPop,
      }
    : { higher: 0.33, intermediate: 0.33, lower: 0.34 }

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
  const { shareOutput, missing } = await buildNssecShare(baseline.wards || [])
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'nssec-share.json'),
    JSON.stringify(shareOutput)
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'nssec-missing.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), missingByLad: missing })
  )
  console.log('Wrote nssec-share.json and nssec-missing.json')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
