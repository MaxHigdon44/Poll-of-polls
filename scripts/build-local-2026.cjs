const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const xlsx = require('xlsx')

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw')
const OUT_DIR = path.join(__dirname, '..', 'public', 'data')

const HOC_SOURCES = [
  {
    year: 2024,
    filename: 'LEH-2024-results-HoC-version.xlsx',
    url: 'https://commonslibrary.parliament.uk/content/uploads/2025/03/LEH-2024-results-HoC-version.xlsx',
  },
  {
    year: 2023,
    filename: 'LEH-Candidates-2023.xlsx',
    url: 'https://commonslibrary.parliament.uk/content/uploads/2024/01/LEH-Candidates-2023.xlsx',
  },
  {
    year: 2022,
    filename: 'local-elections-2022.xlsx',
    url: 'https://commonslibrary.parliament.uk/content/uploads/2023/02/local-elections-2022.xlsx',
  },
  {
    year: 2021,
    filename: 'LEH-2021.xlsx',
    url: 'https://commonslibrary.parliament.uk/content/uploads/2022/01/local-elections-handbook-2021.xlsx',
  },
]

const WARD_GEOJSON_URL =
  'https://opendata.arcgis.com/api/v3/datasets/1ff1b4c40cf344e7afc05d6d09f16315_0/downloads/data?format=geojson&spatialRefId=4326'
const LAD_GEOJSON_URL =
  'https://opendata.arcgis.com/api/v3/datasets/2e9f5c259fec4e1c9951ecb974253c66_0/downloads/data?format=geojson&spatialRefId=4326'
const MSOA_WD22_LAD22_LOOKUP_URL =
  'https://opendata.arcgis.com/api/v3/datasets/fc3bf6fe8ea949869af0a018205ac952_0/downloads/data?format=csv&spatialRefId=4326'
const MSOA_WD23_LAD23_LOOKUP_URL =
  'https://opendata.arcgis.com/api/v3/datasets/f9fa90df09024becb455ab3f7f7b4a15_0/downloads/data?format=csv&spatialRefId=4326'

const NATIONAL_PARTIES = [
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
]

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[’']/g, '')
    .replace(/[\u2013\u2014-]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\bward\b/g, '')
    .replace(/\bdivision\b/g, '')
    .replace(/\bcity of\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapParty(name) {
  const raw = String(name || '').trim()
  const lowered = raw.toLowerCase()
  if (!raw) return { bucket: 'local', name: 'Other' }

  if (['lab', 'labour'].includes(lowered)) return { bucket: 'national', name: 'Labour' }
  if (['con', 'conservative'].includes(lowered)) return { bucket: 'national', name: 'Conservative' }
  if (['ref', 'reform'].includes(lowered)) return { bucket: 'national', name: 'Reform' }
  if (['ld', 'lib dem', 'liberal democrat'].includes(lowered))
    return { bucket: 'national', name: 'Liberal Democrat' }
  if (['green'].includes(lowered)) return { bucket: 'national', name: 'Green' }
  if (['snp'].includes(lowered)) return { bucket: 'national', name: 'SNP' }
  if (['pc', 'plaid cymru'].includes(lowered)) return { bucket: 'national', name: 'Plaid Cymru' }
  if (['other', 'others'].includes(lowered)) return { bucket: 'local', name: 'Other' }

  if (lowered.includes('labour')) return { bucket: 'national', name: 'Labour' }
  if (lowered.includes('conservative')) return { bucket: 'national', name: 'Conservative' }
  if (lowered.includes('reform')) return { bucket: 'national', name: 'Reform' }
  if (lowered.includes('lib dem') || lowered.includes('liberal democrat'))
    return { bucket: 'national', name: 'Liberal Democrat' }
  if (lowered.includes('green')) return { bucket: 'national', name: 'Green' }
  if (lowered.includes('snp')) return { bucket: 'national', name: 'SNP' }
  if (lowered.includes('plaid')) return { bucket: 'national', name: 'Plaid Cymru' }

  return { bucket: 'local', name: raw }
}

function sumObject(obj) {
  return Object.values(obj).reduce((acc, value) => acc + (value || 0), 0)
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
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
  const content = await fsp.readFile(filePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    if (cols.length < headers.length) continue
    const row = {}
    headers.forEach((header, index) => {
      row[header] = cols[index]
    })
    rows.push(row)
  }
  return { headers, rows }
}

async function buildWardCodeCrosswalk() {
  const wd22Path = path.join(RAW_DIR, 'msoa_wd22_lad22.csv')
  const wd23Path = path.join(RAW_DIR, 'msoa_wd23_lad23.csv')
  await downloadIfMissing(wd22Path, MSOA_WD22_LAD22_LOOKUP_URL)
  await downloadIfMissing(wd23Path, MSOA_WD23_LAD23_LOOKUP_URL)

  const wd22 = await loadCsv(wd22Path)
  const wd23 = await loadCsv(wd23Path)

  const wd22ByMsoa = new Map()
  wd22.rows.forEach(row => {
    const msoa = row.MSOA21CD || row['MSOA21CD']
    const wd = row.WD22CD || row['WD22CD']
    if (msoa && wd) wd22ByMsoa.set(msoa, wd)
  })

  const counts = new Map()
  wd23.rows.forEach(row => {
    const msoa = row.MSOA21CD || row['MSOA21CD']
    const wd23Code = row.WD23CD || row['WD23CD'] || row.WD23D
    if (!msoa || !wd23Code) return
    const wd22Code = wd22ByMsoa.get(msoa)
    if (!wd22Code) return
    const key = `${wd22Code}|${wd23Code}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  const mapping = new Map()
  counts.forEach((count, key) => {
    const [wd22Code, wd23Code] = key.split('|')
    const existing = mapping.get(wd22Code)
    if (!existing || count > existing.count) {
      mapping.set(wd22Code, { wd23Code, count })
    }
  })

  const result = new Map()
  mapping.forEach((value, wd22Code) => {
    result.set(wd22Code, value.wd23Code)
  })

  return result
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function downloadIfMissing(filePath, url) {
  if (fs.existsSync(filePath)) return
  await downloadWithRetry(filePath, url)
}

async function downloadWithRetry(filePath, url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url)
    if (!res.ok) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      continue
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const text = buffer.toString('utf8')
    if (text.includes('"status":"ExportingData"') || text.includes('"status":"InProgress"')) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      continue
    }
    await fsp.writeFile(filePath, buffer)
    return
  }
  throw new Error(`Failed to download after retries: ${url}`)
}

function parseWardResults(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const wardSheetName =
    workbook.SheetNames.find(name => normalize(name).includes('ward')) ||
    workbook.SheetNames.find(name => normalize(name).includes('results')) ||
    workbook.SheetNames[0]
  const sheet = workbook.Sheets[wardSheetName]
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null, header: 1 })
  const headerNormalize = value =>
    String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()

  let headerRowIndex = -1
  let headerRow = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const joined = row.map(cell => headerNormalize(cell)).join(' ')
    if (joined.includes('local authority name') && joined.includes('ward name')) {
      headerRowIndex = i
      headerRow = row
      break
    }
  }
  if (headerRowIndex === -1) return []

  const indices = {
    ladName: headerRow.findIndex(cell => headerNormalize(cell).includes('local authority name')),
    ladCode: headerRow.findIndex(cell => headerNormalize(cell).includes('local authority code')),
    wardCode: headerRow.findIndex(cell => headerNormalize(cell).includes('ward code')),
    wardName: headerRow.findIndex(cell => headerNormalize(cell).includes('ward name')),
    totalVotes: headerRow.findIndex(cell => headerNormalize(cell).includes('total votes')),
  }

  const partyStartIndex = Math.max(indices.totalVotes + 1, 0)
  const skipHeaders = ['turnout', 'electorate', 'vacancies', 'local authority type', 'election type']
  const partyColumns = headerRow
    .map((cell, index) => ({ index, name: String(cell || '').trim() }))
    .filter(entry => entry.index >= partyStartIndex && entry.name)
    .filter(entry => {
      const header = headerNormalize(entry.name)
      return !skipHeaders.some(skip => header.includes(skip))
    })

  const dataRows = []
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const ladName = row[indices.ladName]
    const wardName = row[indices.wardName]
    if (!ladName || !wardName) continue
    dataRows.push({
      ladName,
      ladCode: row[indices.ladCode],
      wardName,
      wardCode: row[indices.wardCode],
      totalVotes: row[indices.totalVotes],
      partyVotes: partyColumns.reduce((acc, col) => {
        acc[col.name] = row[col.index]
        return acc
      }, {}),
    })
  }

  return dataRows
}

async function buildBaseline() {
  await ensureDir(RAW_DIR)
  await ensureDir(OUT_DIR)

  const wardPath = path.join(RAW_DIR, 'ward.geojson')
  if (fs.existsSync(wardPath)) {
    await fsp.unlink(wardPath)
  }
  await downloadIfMissing(wardPath, WARD_GEOJSON_URL)
  const ladPath = path.join(RAW_DIR, 'lad.geojson')
  if (fs.existsSync(ladPath)) {
    await fsp.unlink(ladPath)
  }
  await downloadIfMissing(ladPath, LAD_GEOJSON_URL)
  const wardData = new Map()
  const wardGeo = JSON.parse(await fsp.readFile(wardPath, 'utf8'))
  wardGeo.features = wardGeo.features.map(feature => {
    const props = feature.properties || {}
    if (!props.reference && props.WD23CD) {
      props.reference = props.WD23CD
    }
    if (!props.name && props.WD23NM) {
      props.name = props.WD23NM
    }
    feature.properties = props
    return feature
  })
  const wardGeoCodes = new Set(wardGeo.features.map(feature => feature.properties?.reference))
  const wardCodeCrosswalk = await buildWardCodeCrosswalk()

  const sortedSources = [...HOC_SOURCES].sort((a, b) => b.year - a.year)
  const missingFiles = []
  sortedSources.forEach(source => {
    const filePath = path.join(RAW_DIR, source.filename)
    if (!fs.existsSync(filePath)) missingFiles.push(source)
  })
  if (missingFiles.length) {
    const missingNames = missingFiles.map(source => `- ${source.filename} (${source.url})`).join('\n')
    throw new Error(
      `Missing HoC datasets. Download these files and place them in data/raw before rerunning:\n${missingNames}`
    )
  }

  for (const source of sortedSources) {
    const filePath = path.join(RAW_DIR, source.filename)
    const rows = parseWardResults(filePath)
    rows.forEach(row => {
      let wardCode = row.wardCode
      const wardName = row.wardName
      const ladCode = row.ladCode
      const ladName = row.ladName
      if (!wardCode || !ladCode || !wardName || !ladName) return

      if (!wardGeoCodes.has(wardCode)) {
        const mapped = wardCodeCrosswalk.get(wardCode)
        if (mapped) wardCode = mapped
      }

      const key = wardCode
      if (!wardData.has(key)) {
        wardData.set(key, {
          wardCode,
          wardName,
          ladCode,
          ladName,
          lastYear: source.year,
          totalVotes: 0,
          nationalVotes: {},
          localVotes: {},
        })
      }

      const record = wardData.get(key)
      if (record.lastYear !== source.year) return

      const totalVotes = Number(String(row.totalVotes || '').replace(/[^0-9]/g, '')) || 0
      record.totalVotes += totalVotes

      Object.entries(row.partyVotes || {}).forEach(([partyName, voteValue]) => {
        const votes = Number(String(voteValue || '').replace(/[^0-9]/g, ''))
        if (!votes) return
        const mapped = mapParty(partyName)
        if (mapped.bucket === 'national') {
          record.nationalVotes[mapped.name] = (record.nationalVotes[mapped.name] || 0) + votes
        } else {
          record.localVotes[mapped.name] = (record.localVotes[mapped.name] || 0) + votes
        }
      })
    })
  }

  const baseline = []
  const baselineTotals = {}
  const baselineLocalTotals = {}

  wardData.forEach(record => {
    const totalVotes = record.totalVotes || 0
    if (!totalVotes) return

    const nationalShares = {}
    NATIONAL_PARTIES.forEach(party => {
      const votes = record.nationalVotes[party] || 0
      nationalShares[party] = (votes / totalVotes) * 100
      baselineTotals[party] = (baselineTotals[party] || 0) + votes
    })

    const localShares = {}
    Object.entries(record.localVotes).forEach(([party, votes]) => {
      localShares[party] = (votes / totalVotes) * 100
      baselineLocalTotals[party] = (baselineLocalTotals[party] || 0) + votes
    })

    baseline.push({
      wardCode: record.wardCode,
      wardName: record.wardName,
      ladCode: record.ladCode,
      ladName: record.ladName,
      lastYear: record.lastYear,
      totalVotes,
      nationalShares,
      localShares,
    })
  })

  const baselineNational = {}
  const totalBaselineVotes =
    sumObject(baselineTotals) + sumObject(baselineLocalTotals)
  NATIONAL_PARTIES.forEach(party => {
    baselineNational[party] = totalBaselineVotes
      ? ((baselineTotals[party] || 0) / totalBaselineVotes) * 100
      : 0
  })

  const output = {
    generatedAt: new Date().toISOString(),
    baselineNational,
    wards: baseline,
  }

  await fsp.writeFile(
    path.join(OUT_DIR, 'ward-baseline.json'),
    JSON.stringify(output)
  )

  const ladGeo = JSON.parse(await fsp.readFile(path.join(RAW_DIR, 'lad.geojson'), 'utf8'))

  ladGeo.features = ladGeo.features.map(feature => {
    const props = feature.properties || {}
    if (!props.reference && props.LAD23CD) {
      props.reference = props.LAD23CD
    }
    if (!props.name && props.LAD23NM) {
      props.name = props.LAD23NM
    }
    feature.properties = props
    return feature
  })

  const wardCodes = new Set(baseline.map(entry => entry.wardCode))
  wardGeo.features = wardGeo.features.filter(feature =>
    wardCodes.has(feature.properties?.reference)
  )

  const ladCodes = new Set(baseline.map(entry => entry.ladCode))
  const ladGeoCodes = new Set(ladGeo.features.map(feature => feature.properties?.reference))
  ladGeo.features = ladGeo.features.filter(feature =>
    ladCodes.has(feature.properties?.reference)
  )

  await fsp.writeFile(path.join(OUT_DIR, 'wards.geojson'), JSON.stringify(wardGeo))
  await fsp.writeFile(path.join(OUT_DIR, 'lads.geojson'), JSON.stringify(ladGeo))

  await fsp.writeFile(
    path.join(OUT_DIR, 'baseline-national.json'),
    JSON.stringify({ baselineNational, totalBaselineVotes })
  )

  const audit = {
    generatedAt: new Date().toISOString(),
    wardsInBaseline: baseline.length,
    wardsInGeo: wardGeoCodes.size,
    wardsMatched: wardGeo.features.length,
    ladsInBaseline: ladCodes.size,
    ladsInGeo: ladGeoCodes.size,
    ladsMatched: ladGeo.features.length,
  }

  await fsp.writeFile(path.join(OUT_DIR, 'audit.json'), JSON.stringify(audit))
}

buildBaseline()
  .then(() => {
    console.log('Baseline data generated in public/data.')
  })
  .catch(err => {
    console.error(err.message)
    process.exit(1)
  })
