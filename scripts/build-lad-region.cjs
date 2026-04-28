const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data/raw')
const OUT_DIR = path.join(ROOT, 'public/data')

const LAD_REGION_FILE = 'lad_region_2023.csv'

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

async function buildLadRegion() {
  const csvPath = path.join(RAW_DIR, LAD_REGION_FILE)
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing file: ${csvPath}`)
  }
  const baselinePath = path.join(OUT_DIR, 'ward-baseline.json')
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Missing file: ${baselinePath}`)
  }
  const baseline = JSON.parse(await fs.promises.readFile(baselinePath, 'utf8'))
  const { headers, rows } = await loadCsv(csvPath)
  const normHeaders = headers.map(value =>
    String(value || '')
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .trim()
  )
  const ladCodeIdx = normHeaders.findIndex(col => col.includes('lad23cd'))
  const ladNameIdx = normHeaders.findIndex(col => col.includes('lad23nm'))
  const regionCodeIdx = normHeaders.findIndex(col => col.includes('rgn23cd'))
  const regionNameIdx = normHeaders.findIndex(col => col.includes('rgn23nm'))
  if ([ladCodeIdx, ladNameIdx, regionCodeIdx, regionNameIdx].some(idx => idx === -1)) {
    throw new Error('Missing required columns in LAD region CSV')
  }

  const ladMap = {}
  const regionMap = {}
  rows.forEach(row => {
    const ladCode = String(row[ladCodeIdx] || '').trim()
    if (!ladCode) return
    const ladName = String(row[ladNameIdx] || '').trim()
    const regionCode = String(row[regionCodeIdx] || '').trim()
    const regionName = String(row[regionNameIdx] || '').trim()
    ladMap[ladCode] = { ladCode, ladName, regionCode, regionName }
    if (regionName) {
      if (!regionMap[regionName]) regionMap[regionName] = []
      regionMap[regionName].push(ladCode)
    }
  })
  const walesName = 'Wales'
  const walesCode = 'WLS'
  const baselineWales = new Set()
  ;(baseline.wards || []).forEach(ward => {
    if (String(ward.ladCode || '').startsWith('W06')) {
      baselineWales.add(ward.ladCode)
    }
  })
  baselineWales.forEach(ladCode => {
    if (!ladMap[ladCode]) {
      ladMap[ladCode] = {
        ladCode,
        ladName: '',
        regionCode: walesCode,
        regionName: walesName,
      }
    }
    if (!regionMap[walesName]) regionMap[walesName] = []
    if (!regionMap[walesName].includes(ladCode)) {
      regionMap[walesName].push(ladCode)
    }
  })
  Object.keys(regionMap).forEach(region => {
    regionMap[region] = regionMap[region].sort()
  })

  const missing = []
  const ladCodes = new Set((baseline.wards || []).map(ward => ward.ladCode))
  ladCodes.forEach(ladCode => {
    if (!ladMap[ladCode]) missing.push(ladCode)
  })

  await fs.promises.writeFile(
    path.join(OUT_DIR, 'lad-region.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      lads: ladMap,
      regions: regionMap,
    })
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'lad-region-missing.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), missing })
  )

  console.log(`Wrote lad-region.json with ${Object.keys(ladMap).length} LADs`)
  console.log(`Missing LADs: ${missing.length}`)
}

buildLadRegion().catch(err => {
  console.error(err)
  process.exit(1)
})
