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

const LONDON_WARD_SOURCE = {
  year: 2022,
  filename: 'london-2022-wards.xlsx',
  url: 'https://data.london.gov.uk/download/e16o8/26588a60-df3c-47cd-84e6-bd94f7a7d0c4/London%202022%20Wards.xlsx',
}

const WARD_GEOJSON_URL =
  'https://opendata.arcgis.com/api/v3/datasets/1ff1b4c40cf344e7afc05d6d09f16315_0/downloads/data?format=geojson&spatialRefId=4326'
const LAD_GEOJSON_URL =
  'https://opendata.arcgis.com/api/v3/datasets/2e9f5c259fec4e1c9951ecb974253c66_0/downloads/data?format=geojson&spatialRefId=4326'
const COUNTY_GEOJSON_URL =
  'https://opendata.arcgis.com/api/v3/datasets/445118cc2e3b495aa81afa3925bfb0d9_0/downloads/data?format=geojson&spatialRefId=4326'
const CED_GEOJSON_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/fbed6f3bb9ae4cab9f74b3cb331d39ed/geojson?layers=0'
const MSOA_WD22_LAD22_LOOKUP_URL =
  'https://opendata.arcgis.com/api/v3/datasets/fc3bf6fe8ea949869af0a018205ac952_0/downloads/data?format=csv&spatialRefId=4326'
const MSOA_WD23_LAD23_LOOKUP_URL =
  'https://opendata.arcgis.com/api/v3/datasets/f9fa90df09024becb455ab3f7f7b4a15_0/downloads/data?format=csv&spatialRefId=4326'
const LAD_TO_COUNTY_LOOKUP_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/7b21cc353fe940e9b0e05442830939ab/csv?layers=0'

const NATIONAL_PARTIES = [
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
]

const LONDON_BOROUGHS = new Set(
  [
    'Barking and Dagenham',
    'Barnet',
    'Bexley',
    'Brent',
    'Bromley',
    'Camden',
    'City of London',
    'Croydon',
    'Ealing',
    'Enfield',
    'Greenwich',
    'Hackney',
    'Hammersmith and Fulham',
    'Haringey',
    'Harrow',
    'Havering',
    'Hillingdon',
    'Hounslow',
    'Islington',
    'Kensington and Chelsea',
    'Kingston upon Thames',
    'Lambeth',
    'Lewisham',
    'Merton',
    'Newham',
    'Redbridge',
    'Richmond upon Thames',
    'Southwark',
    'Sutton',
    'Tower Hamlets',
    'Waltham Forest',
    'Wandsworth',
    'Westminster',
  ].map(name => normalize(name))
)

const COUNTY_ELECTIONS_2026 = new Set(
  ['East Sussex', 'Essex', 'Hampshire', 'Norfolk', 'Suffolk', 'West Sussex'].map(name =>
    name.toLowerCase()
  )
)

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

async function buildLadToCountyLookup() {
  const lookupPath = path.join(RAW_DIR, 'lad_to_county.csv')
  await downloadIfMissing(lookupPath, LAD_TO_COUNTY_LOOKUP_URL)

  const { rows } = await loadCsv(lookupPath)
  const mapping = new Map()
  rows.forEach(row => {
    const lad = row.LAD24CD || row['LAD24CD']
    const county = row.CTY24CD || row['CTY24CD']
    if (!lad || !county) return
    mapping.set(lad, county)
  })
  return mapping
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
}

async function downloadIfMissing(filePath, url) {
  if (fs.existsSync(filePath)) return
  await downloadWithRetry(filePath, url)
}

async function ensureGeojson(filePath, url, fallbackPath) {
  if (fs.existsSync(filePath)) {
    const existing = await fsp.readFile(filePath, 'utf8')
    if (existing.includes('"type":"FeatureCollection"')) {
      return
    }
    await fsp.unlink(filePath)
  }
  try {
    await downloadWithRetry(filePath, url)
  } catch (err) {
    if (fallbackPath && fs.existsSync(fallbackPath)) {
      const fallback = await fsp.readFile(fallbackPath, 'utf8')
      if (fallback.includes('"type":"FeatureCollection"')) {
        await fsp.writeFile(filePath, fallback)
        return
      }
    }
    throw err
  }
}

async function downloadWithRetry(filePath, url) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await fetch(url)
    if (!res.ok) {
      await new Promise(resolve => setTimeout(resolve, 5000))
      continue
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const text = buffer.toString('utf8')
    if (
      text.includes('"status":"ExportingData"') ||
      text.includes('"status":"InProgress"') ||
      text.includes('"status":"Pending"') ||
      text.includes('download file is being generated') ||
      !text.includes('"type":"FeatureCollection"')
    ) {
      await new Promise(resolve => setTimeout(resolve, 5000))
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

function parseLondonWardResults(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const sheet =
    workbook.Sheets['Ward votes summary'] || workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null, header: 1 })
  if (!rows.length) return []

  const header = rows[0].map(cell => String(cell || '').trim())
  const indexOf = name =>
    header.findIndex(cell => cell.toLowerCase() === name.toLowerCase())

  const indices = {
    wardCode: indexOf('WD22CD'),
    wardName: indexOf('Ward name'),
    ladCode: indexOf('LAD11CD'),
    ladName: indexOf('Borough'),
  }

  const partyColumns = header
    .map((cell, index) => ({ index, name: cell }))
    .filter(entry => entry.index > indices.ladName && entry.name)

  const dataRows = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const wardCode = row[indices.wardCode]
    const wardName = row[indices.wardName]
    const ladCode = row[indices.ladCode]
    const ladName = row[indices.ladName]
    if (!wardCode || !wardName || !ladCode || !ladName) continue
    if (!LONDON_BOROUGHS.has(normalize(ladName))) continue

    const partyVotes = partyColumns.reduce((acc, col) => {
      acc[col.name] = row[col.index]
      return acc
    }, {})
    const totalVotes = Object.values(partyVotes).reduce((acc, value) => {
      const votes = Number(String(value || '').replace(/[^0-9]/g, ''))
      return acc + (votes || 0)
    }, 0)

    dataRows.push({
      ladName,
      ladCode,
      wardName,
      wardCode,
      totalVotes,
      partyVotes,
    })
  }

  return dataRows
}

async function buildBaseline() {
  await ensureDir(RAW_DIR)
  await ensureDir(OUT_DIR)

  await downloadIfMissing(path.join(RAW_DIR, LONDON_WARD_SOURCE.filename), LONDON_WARD_SOURCE.url)

  const skipGeo = process.env.SKIP_GEO === '1'
  const wardPath = skipGeo
    ? path.join(OUT_DIR, 'wards.geojson')
    : path.join(RAW_DIR, 'ward.geojson')
  if (!skipGeo) {
    await ensureGeojson(wardPath, WARD_GEOJSON_URL, path.join(OUT_DIR, 'wards.geojson'))
  }
  const ladPath = path.join(RAW_DIR, 'lad.geojson')
  const countyPath = path.join(RAW_DIR, 'county.geojson')
  const cedPath = path.join(RAW_DIR, 'ced.geojson')
  if (!skipGeo) {
    await ensureGeojson(ladPath, LAD_GEOJSON_URL)
    await ensureGeojson(countyPath, COUNTY_GEOJSON_URL)
    await ensureGeojson(cedPath, CED_GEOJSON_URL)
  }
  const wardData = new Map()
  const wardGeo = JSON.parse(await fsp.readFile(wardPath, 'utf8'))
  const countyGeo = skipGeo ? null : JSON.parse(await fsp.readFile(countyPath, 'utf8'))
  const cedGeo = skipGeo ? null : JSON.parse(await fsp.readFile(cedPath, 'utf8'))
  const ladToCounty = await buildLadToCountyLookup()
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

  if (!skipGeo && countyGeo && cedGeo) {
    countyGeo.features = countyGeo.features.map(feature => {
      const props = feature.properties || {}
      if (!props.reference && (props.CTYUA23CD || props.CTYUA24CD)) {
        props.reference = props.CTYUA23CD || props.CTYUA24CD
      }
      if (!props.name && (props.CTYUA23NM || props.CTYUA24NM)) {
        props.name = props.CTYUA23NM || props.CTYUA24NM
      }
      feature.properties = props
      return feature
    })

    cedGeo.features = cedGeo.features.map(feature => {
      const props = feature.properties || {}
      if (!props.reference && (props.CED23CD || props.CED24CD)) {
        props.reference = props.CED23CD || props.CED24CD
      }
      if (!props.name && (props.CED23NM || props.CED24NM)) {
        props.name = props.CED23NM || props.CED24NM
      }
      if (!props.county && (props.CTYUA23CD || props.CTYUA24CD)) {
        props.county = props.CTYUA23CD || props.CTYUA24CD
      }
      if (!props.county && props.LAD24CD) {
        props.county = ladToCounty.get(props.LAD24CD) || null
      }
      feature.properties = props
      return feature
    })
  }
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

  const londonRows = parseLondonWardResults(path.join(RAW_DIR, LONDON_WARD_SOURCE.filename))

  function upsertWardRow(row, year, allowOverwrite = false) {
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
    const existing = wardData.get(key)
    if (existing && existing.lastYear > year) return
    if (existing && !allowOverwrite && existing.totalVotes > 0) return

    if (!existing || existing.lastYear !== year || allowOverwrite) {
      wardData.set(key, {
        wardCode,
        wardName,
        ladCode,
        ladName,
        lastYear: year,
        totalVotes: 0,
        nationalVotes: {},
        localVotes: {},
      })
    }

    const record = wardData.get(key)
    if (!record || record.lastYear !== year) return

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
  }

  for (const source of sortedSources) {
    const filePath = path.join(RAW_DIR, source.filename)
    const rows = parseWardResults(filePath)
    rows.forEach(row => {
      upsertWardRow(row, source.year, false)
    })
  }

  // Fill missing/zero London wards from London 2022 dataset
  let londonFilled = 0
  londonRows.forEach(row => {
    const existing = wardData.get(row.wardCode)
    const hadData = existing && (existing.totalVotes || 0) > 0
    upsertWardRow(row, LONDON_WARD_SOURCE.year, true)
    if (!hadData) londonFilled += 1
  })
  console.log(`London wards filled from GLA 2022 dataset: ${londonFilled}`)

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

  const ladGeo = skipGeo
    ? JSON.parse(await fsp.readFile(path.join(OUT_DIR, 'lads.geojson'), 'utf8'))
    : JSON.parse(await fsp.readFile(path.join(RAW_DIR, 'lad.geojson'), 'utf8'))

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

  if (!skipGeo && countyGeo && cedGeo) {
    const countyGeoCodes = new Set(countyGeo.features.map(feature => feature.properties?.reference))
    countyGeo.features = countyGeo.features.filter(feature => {
      const name = String(feature.properties?.name || '').toLowerCase()
      return countyGeoCodes.has(feature.properties?.reference) && COUNTY_ELECTIONS_2026.has(name)
    })

    const countyCodes = new Set(countyGeo.features.map(feature => feature.properties?.reference))
    cedGeo.features = cedGeo.features.filter(feature =>
      countyCodes.has(feature.properties?.county)
    )
  }

  const wardCodes = new Set(baseline.map(entry => entry.wardCode))
  wardGeo.features = wardGeo.features.filter(feature =>
    wardCodes.has(feature.properties?.reference)
  )

  const ladCodes = new Set(baseline.map(entry => entry.ladCode))
  const ladGeoCodes = new Set(ladGeo.features.map(feature => feature.properties?.reference))
  ladGeo.features = ladGeo.features.filter(feature =>
    ladCodes.has(feature.properties?.reference)
  )

  if (!skipGeo) {
    await fsp.writeFile(path.join(OUT_DIR, 'wards.geojson'), JSON.stringify(wardGeo))
    await fsp.writeFile(path.join(OUT_DIR, 'lads.geojson'), JSON.stringify(ladGeo))
    await fsp.writeFile(path.join(OUT_DIR, 'counties.geojson'), JSON.stringify(countyGeo))
    await fsp.writeFile(path.join(OUT_DIR, 'ced.geojson'), JSON.stringify(cedGeo))
  }

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
    countiesIncluded: countyGeo ? countyGeo.features.length : 0,
    cedIncluded: cedGeo ? cedGeo.features.length : 0,
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
