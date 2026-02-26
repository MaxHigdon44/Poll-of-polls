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

const WARD_GEOJSON_URL = 'https://files.planning.data.gov.uk/dataset/ward.geojson'
const LAD_GEOJSON_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/3f29d2c4a5834360a540ff206718c4f2/geojson?layers=0'
const WARD_LAD_LOOKUP_URL =
  'https://opendata.arcgis.com/api/v3/datasets/ab1ae1a7600e483d82c8f76566cae805_0/downloads/data?format=csv&spatialRefId=4326'

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

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function downloadIfMissing(filePath, url) {
  if (fs.existsSync(filePath)) return
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  await fsp.writeFile(filePath, buffer)
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

  await downloadIfMissing(path.join(RAW_DIR, 'ward.geojson'), WARD_GEOJSON_URL)
  const ladPath = path.join(RAW_DIR, 'lad.geojson')
  if (fs.existsSync(ladPath)) {
    await fsp.unlink(ladPath)
  }
  await downloadIfMissing(ladPath, LAD_GEOJSON_URL)
  const wardData = new Map()

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
      const wardCode = row.wardCode
      const wardName = row.wardName
      const ladCode = row.ladCode
      const ladName = row.ladName
      if (!wardCode || !ladCode || !wardName || !ladName) return

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

  const wardGeo = JSON.parse(await fsp.readFile(path.join(RAW_DIR, 'ward.geojson'), 'utf8'))
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
  const wardGeoCodes = new Set(wardGeo.features.map(feature => feature.properties?.reference))
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
