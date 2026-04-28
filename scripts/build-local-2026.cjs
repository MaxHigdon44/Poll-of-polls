const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const xlsx = require('xlsx')
const cheerio = require('cheerio')

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

const WIKIPEDIA_WARD_PAGES = [
  {
    ladName: 'Basildon',
    urls: ['https://en.wikipedia.org/wiki/2023_Basildon_Borough_Council_election'],
  },
  {
    ladName: 'Brentwood',
    urls: [
      'https://en.wikipedia.org/wiki/2024_Brentwood_Borough_Council_election',
      'https://en.wikipedia.org/wiki/2023_Brentwood_Borough_Council_election',
    ],
  },
  {
    ladName: 'Cannock Chase',
    urls: ['https://en.wikipedia.org/wiki/2023_Cannock_Chase_District_Council_election'],
  },
  {
    ladName: 'Epping Forest',
    urls: ['https://en.wikipedia.org/wiki/2023_Epping_Forest_District_Council_election'],
  },
  {
    ladName: 'Epsom and Ewell',
    urls: ['https://en.wikipedia.org/wiki/2023_Epsom_and_Ewell_Borough_Council_election'],
  },
  {
    ladName: 'Guildford',
    urls: ['https://en.wikipedia.org/wiki/2023_Guildford_Borough_Council_election'],
  },
  {
    ladName: 'Huntingdonshire',
    urls: ['https://en.wikipedia.org/wiki/2022_Huntingdonshire_District_Council_election'],
  },
  {
    ladName: 'Isle of Wight',
    urls: ['https://en.wikipedia.org/wiki/2021_Isle_of_Wight_Council_election'],
  },
  {
    ladName: 'Newcastle-under-Lyme',
    urls: ['https://en.wikipedia.org/wiki/2022_Newcastle-under-Lyme_Borough_Council_election'],
  },
  {
    ladName: 'Redditch',
    urls: [
      'https://en.wikipedia.org/wiki/2024_Redditch_Borough_Council_election',
      'https://en.wikipedia.org/wiki/2023_Redditch_Borough_Council_election',
    ],
  },
  {
    ladName: 'Rugby',
    urls: [
      'https://en.wikipedia.org/wiki/2024_Rugby_Borough_Council_election',
      'https://en.wikipedia.org/wiki/2023_Rugby_Borough_Council_election',
    ],
  },
  {
    ladName: 'South Cambridgeshire',
    urls: ['https://en.wikipedia.org/wiki/2022_South_Cambridgeshire_District_Council_election'],
  },
  {
    ladName: 'Spelthorne',
    urls: ['https://en.wikipedia.org/wiki/2023_Spelthorne_Borough_Council_election'],
  },
  {
    ladName: 'Surrey Heath',
    urls: ['https://en.wikipedia.org/wiki/2023_Surrey_Heath_Borough_Council_election'],
  },
  {
    ladName: 'Tandridge',
    urls: [
      'https://en.wikipedia.org/wiki/2024_Tandridge_District_Council_election',
      'https://en.wikipedia.org/wiki/2023_Tandridge_District_Council_election',
    ],
  },
  {
    ladName: 'Tunbridge Wells',
    urls: [
      'https://en.wikipedia.org/wiki/2024_Tunbridge_Wells_Borough_Council_election',
      'https://en.wikipedia.org/wiki/2023_Tunbridge_Wells_Borough_Council_election',
    ],
  },
  {
    ladName: 'Waverley',
    urls: ['https://en.wikipedia.org/wiki/2023_Waverley_Borough_Council_election'],
  },
  {
    ladName: 'West Oxfordshire',
    urls: [
      'https://en.wikipedia.org/wiki/2024_West_Oxfordshire_District_Council_election',
      'https://en.wikipedia.org/wiki/2023_West_Oxfordshire_District_Council_election',
    ],
  },
  {
    ladName: 'Wokingham',
    urls: ['https://en.wikipedia.org/wiki/2023_Wokingham_Borough_Council_election'],
  },
  {
    ladName: 'East Sussex',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_East_Sussex_County_Council_election'],
  },
  {
    ladName: 'Essex',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_Essex_County_Council_election'],
  },
  {
    ladName: 'Hampshire',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_Hampshire_County_Council_election'],
  },
  {
    ladName: 'Norfolk',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_Norfolk_County_Council_election'],
  },
  {
    ladName: 'Suffolk',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_Suffolk_County_Council_election'],
  },
  {
    ladName: 'West Sussex',
    year: 2021,
    urls: ['https://en.wikipedia.org/wiki/2021_West_Sussex_County_Council_election'],
  },
]

const LEAVE_WARD_FILE = 'leave_ward.csv'
const LEAVE_WARD_XLSX = 'leave_ward.xlsx'
const LEAVE_LAD_FILE = 'leave_lad.csv'
const AGE_WARD_FILE = 'age_ward.csv'
const NSSEC_WARD_FILE = 'nssec_ward.csv'
const DEGREE_WARD_FILE = 'degree_ward.csv'
const TENURE_LSOA_FILE = 'tenure_lsoa_grouped.csv'
const TENURE_BASELINE_FILE = 'tenure_england_wales.csv'
const RURAL_URBAN_LSOA_FILE = 'lsoa_rural_urban_2011.geojson'
const LSOA11_TO_LSOA21_LOOKUP_FILE = 'lsoa11_to_lsoa21.geojson'
const LSOA_TO_WARD_LOOKUP_FILE = 'lsoa_to_ward_2025.geojson'
const WARD_TO_CED_LOOKUP_FILE = 'ward_to_ced_2025.geojson'
const LAD_REGION_FILE = 'lad_region_2023.csv'
const SEATS_UP_FILE = '2026_seats_up.xlsx'
const WIKIPEDIA_API =
  'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch='

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
const WARD_LAD_2023_LOOKUP_URL =
  'https://open-geography-portalx-ons.hub.arcgis.com/api/download/v1/items/c333296ade704facb64fcb2f0e4f36f4/csv?layers=0'
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

const COUNTY_ELECTIONS_2025 = new Set(
  [
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
  ].map(name => name.toLowerCase())
)

const ALL_COUNTY_ELECTIONS = new Set([...COUNTY_ELECTIONS_2025, ...COUNTY_ELECTIONS_2026])

const AGE_BASELINE = {
  age18_35: 0.29,
  age35_55: 0.33,
  age55_plus: 0.38,
}

const BASELINE_NATIONAL_BY_YEAR = {
  2021: {
    Labour: 20.745136962554223,
    Conservative: 45.525552350984796,
    Reform: 0.232044049350195,
    'Liberal Democrat': 17.576813327460577,
    Green: 9.000883201010462,
    SNP: 0,
    'Plaid Cymru': 0,
  },
  2022: {
    Labour: 40.585880083116066,
    Conservative: 28.71578181747461,
    Reform: 0.18062657339491414,
    'Liberal Democrat': 15.473970342190924,
    Green: 8.424140522452163,
    SNP: 0,
    'Plaid Cymru': 0,
  },
  2023: {
    Labour: 35,
    Conservative: 26,
    Reform: 0,
    'Liberal Democrat': 20,
    Green: 12,
    SNP: 0,
    'Plaid Cymru': 0,
  },
  2024: {
    Labour: 34.908565317328225,
    Conservative: 23.0402287037395,
    Reform: 1.5316392318193588,
    'Liberal Democrat': 15.016967389228912,
    Green: 11.090023545986101,
    SNP: 0,
    'Plaid Cymru': 0,
  },
}

function normalize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
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

function normalizeCedName(value) {
  return normalize(value).replace(/\bed\b/g, '').replace(/\s+/g, ' ').trim()
}

function mapParty(name) {
  const raw = String(name || '').trim()
  const lowered = raw.toLowerCase()
  if (!raw) return { bucket: 'local', name: 'Other' }

  if (['lab', 'labour'].includes(lowered)) return { bucket: 'national', name: 'Labour' }
  if (['con', 'conservative'].includes(lowered)) return { bucket: 'national', name: 'Conservative' }
  if (['ref', 'reform'].includes(lowered)) return { bucket: 'national', name: 'Reform' }
  if (['ld', 'lib dem', 'liberal democrat', 'libdem'].includes(lowered))
    return { bucket: 'national', name: 'Liberal Democrat' }
  if (['green', 'grn'].includes(lowered)) return { bucket: 'national', name: 'Green' }
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

async function buildAgeShare(baseline) {
  const csvPath = path.join(RAW_DIR, AGE_WARD_FILE)
  if (!fs.existsSync(csvPath)) return null

  const workbook = xlsx.readFile(csvPath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 })
  if (!rows.length) return null
  const header = rows[0].map(value => String(value || '').toLowerCase())
  const wardCodeIdx = header.findIndex(col => col.includes('wards and divisions code'))
  const wardNameIdx = header.findIndex(
    col => col.includes('wards and divisions') && !col.includes('code')
  )
  const ageCodeIdx = header.findIndex(col => col.includes('age') && col.includes('code'))
  const obsIdx = header.findIndex(col => col.includes('observation'))
  if ([wardCodeIdx, wardNameIdx, ageCodeIdx, obsIdx].some(idx => idx === -1)) return null

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row || row.length === 0) continue
    const wardCode = String(row[wardCodeIdx] || '').trim()
    if (!wardCode) continue
    const wardNameRaw = String(row[wardNameIdx] || '').trim()
    const wardName = wardNameRaw.replace(/\s*\(([^)]+)\)\s*$/, '').trim()
    const wardLadMatch = wardNameRaw.match(/\(([^)]+)\)\s*$/)
    const wardLad = wardLadMatch ? wardLadMatch[1].trim() : null
    const ageCode = Number(row[ageCodeIdx])
    const obs = Number(row[obsIdx])
    if (!Number.isFinite(ageCode) || !Number.isFinite(obs)) continue

    const entry = wardTotals.get(wardCode) || {
      wardName,
      total: 0,
      age18_35: 0,
      age35_55: 0,
      age55_plus: 0,
    }
    entry.total += obs
    if (ageCode >= 18 && ageCode <= 34) {
      entry.age18_35 += obs
    } else if (ageCode >= 35 && ageCode <= 54) {
      entry.age35_55 += obs
    } else if (ageCode >= 56) {
      entry.age55_plus += obs
    }
    wardTotals.set(wardCode, entry)

    if (wardLad) {
      const key = `${normalize(wardLad)}|${normalize(wardName)}`
      wardNameMap.set(key, wardCode)
    }
    const nameKey = normalize(wardName)
    wardNameCounts.set(nameKey, (wardNameCounts.get(nameKey) || 0) + 1)
    if (!wardNameOnlyMap.has(nameKey)) {
      wardNameOnlyMap.set(nameKey, wardCode)
    }
    if (!wardNameAggressiveMap.has(nameKey)) {
      wardNameAggressiveMap.set(nameKey, wardCode)
    }
  }

  const wardEntries = {}
  wardTotals.forEach((value, code) => {
    if (!value.total) return
    wardEntries[code] = {
      wardCode: code,
      age18_35: value.age18_35 / value.total,
      age35_55: value.age35_55 / value.total,
      age55_plus: value.age55_plus / value.total,
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

  const wardToCedLookup = await buildWardToCedLookup()
  if (wardToCedLookup) {
    const cedEntries = buildCedEntriesFromLookup(wardToCedLookup.rows, {
      directEntries: wardEntries,
      keyField: 'WD25CD',
      nameField: 'WD25NM',
      ladNameField: 'LAD25NM',
      cedCodeField: 'CED25CD',
      cedNameField: 'CED25NM',
      valueKeys: ['age18_35', 'age35_55', 'age55_plus'],
      wardNames: wardNameEntries,
      wardNamesOnly: wardNameOnlyEntries,
      wardNamesAggressive: wardNameAggressiveEntries,
    })
    Object.assign(wardEntries, cedEntries)
    addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries)
  }

  const ladEntries = {}
  const ladTotals = new Map()
  baseline.forEach(ward => {
    const age = wardEntries[ward.wardCode]
    if (!age || !age.totalPop) return
    const entry = ladTotals.get(ward.ladCode) || {
      total: 0,
      age18_35: 0,
      age35_55: 0,
      age55_plus: 0,
    }
    entry.total += age.totalPop
    entry.age18_35 += age.age18_35 * age.totalPop
    entry.age35_55 += age.age35_55 * age.totalPop
    entry.age55_plus += age.age55_plus * age.totalPop
    ladTotals.set(ward.ladCode, entry)
  })
  ladTotals.forEach((value, code) => {
    if (!value.total) return
    ladEntries[code] = {
      age18_35: value.age18_35 / value.total,
      age35_55: value.age35_55 / value.total,
      age55_plus: value.age55_plus / value.total,
    }
  })

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: {
      baseline: {
        age18_35: AGE_BASELINE.age18_35,
        age35_55: AGE_BASELINE.age35_55,
        age55_plus: AGE_BASELINE.age55_plus,
      },
    },
  }
}

async function buildNssecShare(baseline) {
  const csvPath = path.join(RAW_DIR, NSSEC_WARD_FILE)
  if (!fs.existsSync(csvPath)) return null

  const { headers, rows } = await loadCsv(csvPath)
  if (!headers || !rows) return null
  const normHeaders = headers.map(value =>
    String(value || '')
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .trim()
  )
  const wardCodeIdx = normHeaders.findIndex(col => col.includes('electoral wards and divisions code'))
  const wardNameIdx = normHeaders.findIndex(
    col => col.includes('electoral wards and divisions') && !col.includes('code')
  )
  const nssecCodeIdx = normHeaders.findIndex(col => col.includes('ns-sec') && col.includes('code'))
  const obsIdx = normHeaders.findIndex(col => col.includes('observation'))
  if ([wardCodeIdx, wardNameIdx, nssecCodeIdx, obsIdx].some(idx => idx === -1)) {
    return null
  }
  const wardCodeField = headers[wardCodeIdx]
  const wardNameField = headers[wardNameIdx]
  const nssecCodeField = headers[nssecCodeIdx]
  const obsField = headers[obsIdx]

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()

  rows.forEach(row => {
    const wardCode = String(row[wardCodeField] || '').trim()
    if (!wardCode) return
    const wardNameRaw = String(row[wardNameField] || '').trim()
    const wardName = wardNameRaw.replace(/\s*\(([^)]+)\)\s*$/, '').trim()
    const wardLadMatch = wardNameRaw.match(/\(([^)]+)\)\s*$/)
    const wardLad = wardLadMatch ? wardLadMatch[1].trim() : null
    const nssecCode = Number(row[nssecCodeField])
    const obs = Number(row[obsField])
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
    if (!wardNameOnlyMap.has(nameKey)) {
      wardNameOnlyMap.set(nameKey, wardCode)
    }
    if (!wardNameAggressiveMap.has(nameKey)) {
      wardNameAggressiveMap.set(nameKey, wardCode)
    }
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

  const wardToCedLookup = await buildWardToCedLookup()
  if (wardToCedLookup) {
    const cedEntries = buildCedEntriesFromLookup(wardToCedLookup.rows, {
      directEntries: wardEntries,
      keyField: 'WD25CD',
      nameField: 'WD25NM',
      ladNameField: 'LAD25NM',
      cedCodeField: 'CED25CD',
      cedNameField: 'CED25NM',
      valueKeys: ['higher', 'intermediate', 'lower'],
      wardNames: wardNameEntries,
      wardNamesOnly: wardNameOnlyEntries,
      wardNamesAggressive: wardNameAggressiveEntries,
    })
    Object.assign(wardEntries, cedEntries)
    addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries)
  }

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

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: {
      baseline: baselineShares,
    },
  }
}

async function buildDegreeShare(baseline) {
  const csvPath = path.join(RAW_DIR, DEGREE_WARD_FILE)
  if (!fs.existsSync(csvPath)) return null

  const { headers, rows } = await loadCsv(csvPath)
  if (!headers || !rows) return null
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
    return null
  }
  const wardCodeField = headers[wardCodeIdx]
  const wardNameField = headers[wardNameIdx]
  const levelCodeField = headers[levelCodeIdx]
  const obsField = headers[obsIdx]

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()

  rows.forEach(row => {
    const wardCode = String(row[wardCodeField] || '').trim()
    if (!wardCode) return
    const wardNameRaw = String(row[wardNameField] || '').trim()
    const wardName = wardNameRaw.replace(/\s*\(([^)]+)\)\s*$/, '').trim()
    const wardLadMatch = wardNameRaw.match(/\(([^)]+)\)\s*$/)
    const wardLad = wardLadMatch ? wardLadMatch[1].trim() : null
    const levelCode = Number(row[levelCodeField])
    const obs = Number(row[obsField])
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

  const wardToCedLookup = await buildWardToCedLookup()
  if (wardToCedLookup) {
    const cedEntries = buildCedEntriesFromLookup(wardToCedLookup.rows, {
      directEntries: wardEntries,
      keyField: 'WD25CD',
      nameField: 'WD25NM',
      ladNameField: 'LAD25NM',
      cedCodeField: 'CED25CD',
      cedNameField: 'CED25NM',
      valueKeys: ['degree', 'noDegree'],
      wardNames: wardNameEntries,
      wardNamesOnly: wardNameOnlyEntries,
      wardNamesAggressive: wardNameAggressiveEntries,
    })
    Object.assign(wardEntries, cedEntries)
    addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries)
  }

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

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: { baseline: baselineShares },
  }
}

function getTenureBucket(category) {
  const normalized = String(category || '').trim()
  if (!normalized || normalized === 'Does not apply') return null
  if (normalized === 'Owned: Owns outright') return 'ownedOutright'
  if (
    normalized === 'Owned: Owns with a mortgage or loan' ||
    normalized === 'Shared ownership: Shared ownership'
  ) {
    return 'ownsWithMortgage'
  }
  if (
    normalized === 'Social rented: Rents from council or Local Authority' ||
    normalized === 'Social rented: Other social rented'
  ) {
    return 'socialRented'
  }
  if (
    normalized === 'Private rented: Private landlord or letting agency' ||
    normalized === 'Private rented: Other private rented' ||
    normalized === 'Lives rent free'
  ) {
    return 'privateRented'
  }
  return null
}

function getRuralUrbanBucket(category) {
  const normalized = String(category || '').trim()
  if (!normalized) return null
  if (normalized === 'A1' || normalized === 'B1') {
    return 'conurbation'
  }
  if (normalized === 'C1' || normalized === 'C2') {
    return 'cityTown'
  }
  if (normalized === 'D1' || normalized === 'D2') {
    return 'ruralTownFringe'
  }
  if (normalized === 'E1' || normalized === 'E2') {
    return 'ruralVillageHamlet'
  }
  if (
    normalized === 'Urban: Nearer to a major town or city' ||
    normalized === 'Urban: Further from a major town or city'
  ) {
    return 'cityTown'
  }
  if (
    normalized === 'Larger rural: Nearer to a major town or city' ||
    normalized === 'Smaller rural: Nearer to a major town or city'
  ) {
    return 'ruralTownFringe'
  }
  if (
    normalized === 'Larger rural: Further from a major town or city' ||
    normalized === 'Smaller rural: Further from a major town or city'
  ) {
    return 'ruralVillageHamlet'
  }
  return null
}

async function buildRuralUrbanShare(baseline) {
  const filePath = path.join(RAW_DIR, RURAL_URBAN_LSOA_FILE)
  if (!fs.existsSync(filePath)) return null

  const geo = JSON.parse(await fsp.readFile(filePath, 'utf8'))
  const features = Array.isArray(geo?.features) ? geo.features : null
  if (!features) return null

  const rawEntries = {}
  features.forEach(feature => {
    const props = feature.properties || {}
    const lsoaCode = String(props.LSOA11CD || props.LSOA21CD || '').trim()
    if (!lsoaCode) return
    const bucket = getRuralUrbanBucket(props.RUC11CD || props.RUC21NM)
    rawEntries[lsoaCode] = {
      lsoaCode,
      lsoaName: String(props.LSOA11NM || props.LSOA21NM || '').trim(),
      conurbation: bucket === 'conurbation' ? 1 : 0,
      cityTown: bucket === 'cityTown' ? 1 : 0,
      ruralTownFringe: bucket === 'ruralTownFringe' ? 1 : 0,
      ruralVillageHamlet: bucket === 'ruralVillageHamlet' ? 1 : 0,
      totalPop: 1,
    }
  })

  let lsoaEntries = rawEntries
  const uses2011Codes = features.some(feature => String(feature?.properties?.LSOA11CD || '').trim())
  if (uses2011Codes) {
    const lookupPath = path.join(RAW_DIR, LSOA11_TO_LSOA21_LOOKUP_FILE)
    if (!fs.existsSync(lookupPath)) return null
    const lookupGeo = JSON.parse(await fsp.readFile(lookupPath, 'utf8'))
    const lookupFeatures = Array.isArray(lookupGeo?.features) ? lookupGeo.features : null
    if (!lookupFeatures) return null
    const mappedEntries = {}
    lookupFeatures.forEach(feature => {
      const props = feature.properties || {}
      const lsoa11Code = String(props.LSOA11CD || '').trim()
      const lsoa21Code = String(props.LSOA21CD || '').trim()
      if (!lsoa11Code || !lsoa21Code) return
      const entry = rawEntries[lsoa11Code]
      if (!entry?.totalPop) return
      const mapped = mappedEntries[lsoa21Code] || {
        lsoaCode: lsoa21Code,
        lsoaName: String(props.LSOA21NM || '').trim(),
        conurbation: 0,
        cityTown: 0,
        ruralTownFringe: 0,
        ruralVillageHamlet: 0,
        totalPop: 0,
      }
      mapped.conurbation += entry.conurbation * entry.totalPop
      mapped.cityTown += entry.cityTown * entry.totalPop
      mapped.ruralTownFringe += entry.ruralTownFringe * entry.totalPop
      mapped.ruralVillageHamlet += entry.ruralVillageHamlet * entry.totalPop
      mapped.totalPop += entry.totalPop
      mappedEntries[lsoa21Code] = mapped
    })
    Object.values(mappedEntries).forEach(entry => {
      if (!entry.totalPop) return
      entry.conurbation /= entry.totalPop
      entry.cityTown /= entry.totalPop
      entry.ruralTownFringe /= entry.totalPop
      entry.ruralVillageHamlet /= entry.totalPop
    })
    lsoaEntries = mappedEntries
  }

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()
  const lsoaToWardLookup = await buildLsoaToWardLookup()
  if (!lsoaToWardLookup) return null
  ;(lsoaToWardLookup.rows || []).forEach(row => {
    const lsoaCode = String(row.LSOA21CD || '').trim()
    const wardCode = String(row.WD25CD || '').trim()
    const wardName = String(row.WD25NM || '').trim()
    const ladName = String(row.LAD25NM || '').trim()
    if (!lsoaCode || !wardCode || !wardName) return
    const entry = lsoaEntries[lsoaCode]
    if (!entry?.totalPop) return

    const totals = wardTotals.get(wardCode) || {
      wardName,
      totalPop: 0,
      conurbation: 0,
      cityTown: 0,
      ruralTownFringe: 0,
      ruralVillageHamlet: 0,
    }
    totals.totalPop += entry.totalPop
    totals.conurbation += entry.conurbation * entry.totalPop
    totals.cityTown += entry.cityTown * entry.totalPop
    totals.ruralTownFringe += entry.ruralTownFringe * entry.totalPop
    totals.ruralVillageHamlet += entry.ruralVillageHamlet * entry.totalPop
    wardTotals.set(wardCode, totals)

    if (ladName) {
      const key = `${normalize(ladName)}|${normalize(wardName)}`
      wardNameMap.set(key, wardCode)
    }
    const nameKey = normalize(wardName)
    wardNameCounts.set(nameKey, (wardNameCounts.get(nameKey) || 0) + 1)
    if (!wardNameOnlyMap.has(nameKey)) wardNameOnlyMap.set(nameKey, wardCode)
    if (!wardNameAggressiveMap.has(nameKey)) wardNameAggressiveMap.set(nameKey, wardCode)
  })

  const wardEntries = {}
  wardTotals.forEach((value, code) => {
    if (!value.totalPop) return
    wardEntries[code] = {
      wardCode: code,
      wardName: value.wardName,
      conurbation: value.conurbation / value.totalPop,
      cityTown: value.cityTown / value.totalPop,
      ruralTownFringe: value.ruralTownFringe / value.totalPop,
      ruralVillageHamlet: value.ruralVillageHamlet / value.totalPop,
      totalPop: value.totalPop,
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

  const wardToCedLookup = await buildWardToCedLookup()
  if (wardToCedLookup) {
    const cedEntries = buildCedEntriesFromLookup(wardToCedLookup.rows, {
      directEntries: wardEntries,
      keyField: 'WD25CD',
      nameField: 'WD25NM',
      ladNameField: 'LAD25NM',
      cedCodeField: 'CED25CD',
      cedNameField: 'CED25NM',
      valueKeys: ['conurbation', 'cityTown', 'ruralTownFringe', 'ruralVillageHamlet'],
      wardNames: wardNameEntries,
      wardNamesOnly: wardNameOnlyEntries,
      wardNamesAggressive: wardNameAggressiveEntries,
    })
    Object.assign(wardEntries, cedEntries)
    addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries)
  }

  const ladEntries = {}
  const ladTotals = new Map()
  baseline.forEach(ward => {
    const ru = wardEntries[ward.wardCode]
    if (!ru?.totalPop) return
    const entry = ladTotals.get(ward.ladCode) || {
      totalPop: 0,
      conurbation: 0,
      cityTown: 0,
      ruralTownFringe: 0,
      ruralVillageHamlet: 0,
    }
    entry.totalPop += ru.totalPop
    entry.conurbation += ru.conurbation * ru.totalPop
    entry.cityTown += ru.cityTown * ru.totalPop
    entry.ruralTownFringe += ru.ruralTownFringe * ru.totalPop
    entry.ruralVillageHamlet += ru.ruralVillageHamlet * ru.totalPop
    ladTotals.set(ward.ladCode, entry)
  })
  ladTotals.forEach((value, code) => {
    if (!value.totalPop) return
    ladEntries[code] = {
      conurbation: value.conurbation / value.totalPop,
      cityTown: value.cityTown / value.totalPop,
      ruralTownFringe: value.ruralTownFringe / value.totalPop,
      ruralVillageHamlet: value.ruralVillageHamlet / value.totalPop,
    }
  })

  let totalPop = 0
  let conurbation = 0
  let cityTown = 0
  let ruralTownFringe = 0
  let ruralVillageHamlet = 0
  Object.values(wardEntries).forEach(entry => {
    totalPop += entry.totalPop
    conurbation += entry.conurbation * entry.totalPop
    cityTown += entry.cityTown * entry.totalPop
    ruralTownFringe += entry.ruralTownFringe * entry.totalPop
    ruralVillageHamlet += entry.ruralVillageHamlet * entry.totalPop
  })
  const baselineShares = totalPop
    ? {
        conurbation: conurbation / totalPop,
        cityTown: cityTown / totalPop,
        ruralTownFringe: ruralTownFringe / totalPop,
        ruralVillageHamlet: ruralVillageHamlet / totalPop,
      }
    : {
        conurbation: 0,
        cityTown: 0.5,
        ruralTownFringe: 0.25,
        ruralVillageHamlet: 0.25,
      }

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: { baseline: baselineShares },
  }
}

async function buildTenureShare(baseline) {
  const csvPath = path.join(RAW_DIR, TENURE_LSOA_FILE)
  if (!fs.existsSync(csvPath)) return null

  const { headers, rows } = await loadCsv(csvPath)
  if (!headers || !rows) return null

  const lsoaCodeField =
    headers.find(header => String(header || '').trim() === 'LSOA21CD') || headers[0]
  const lsoaNameField =
    headers.find(header => String(header || '').trim() === 'LSOA21NM') || headers[1]
  const ownedOutrightField = headers.find(
    header => String(header || '').trim() === 'Owned outright'
  )
  const ownsWithMortgageField = headers.find(
    header => String(header || '').trim() === 'Owns with mortgage'
  )
  const socialRentedField = headers.find(
    header => String(header || '').trim() === 'Social rented'
  )
  const privateRentedField = headers.find(
    header => String(header || '').trim() === 'Private rented'
  )
  const totalField = headers.find(header => String(header || '').trim() === 'Total households')
  if (
    !ownedOutrightField ||
    !ownsWithMortgageField ||
    !socialRentedField ||
    !privateRentedField ||
    !totalField
  ) {
    return null
  }

  const lsoaEntries = {}
  rows.forEach(row => {
    const lsoaCode = String(row[lsoaCodeField] || '').trim()
    if (!lsoaCode) return
    const totalPop = Number(row[totalField])
    if (!Number.isFinite(totalPop) || totalPop <= 0) return
    lsoaEntries[lsoaCode] = {
      lsoaCode,
      lsoaName: String(row[lsoaNameField] || '').trim(),
      ownedOutright: Number(row[ownedOutrightField] || 0) / totalPop,
      ownsWithMortgage: Number(row[ownsWithMortgageField] || 0) / totalPop,
      socialRented: Number(row[socialRentedField] || 0) / totalPop,
      privateRented: Number(row[privateRentedField] || 0) / totalPop,
      totalPop,
    }
  })

  const lsoaToWardLookup = await buildLsoaToWardLookup()
  if (!lsoaToWardLookup) return null

  const wardTotals = new Map()
  const wardNameMap = new Map()
  const wardNameOnlyMap = new Map()
  const wardNameAggressiveMap = new Map()
  const wardNameCounts = new Map()
  ;(lsoaToWardLookup.rows || []).forEach(row => {
    const lsoaCode = String(row.LSOA21CD || '').trim()
    const wardCode = String(row.WD25CD || '').trim()
    const wardName = String(row.WD25NM || '').trim()
    const ladName = String(row.LAD25NM || '').trim()
    if (!lsoaCode || !wardCode || !wardName) return
    const entry = lsoaEntries[lsoaCode]
    if (!entry?.totalPop) return

    const totals = wardTotals.get(wardCode) || {
      wardName,
      totalPop: 0,
      ownedOutright: 0,
      ownsWithMortgage: 0,
      socialRented: 0,
      privateRented: 0,
    }
    totals.totalPop += entry.totalPop
    totals.ownedOutright += entry.ownedOutright * entry.totalPop
    totals.ownsWithMortgage += entry.ownsWithMortgage * entry.totalPop
    totals.socialRented += entry.socialRented * entry.totalPop
    totals.privateRented += entry.privateRented * entry.totalPop
    wardTotals.set(wardCode, totals)

    if (ladName) {
      const key = `${normalize(ladName)}|${normalize(wardName)}`
      wardNameMap.set(key, wardCode)
    }
    const nameKey = normalize(wardName)
    wardNameCounts.set(nameKey, (wardNameCounts.get(nameKey) || 0) + 1)
    if (!wardNameOnlyMap.has(nameKey)) wardNameOnlyMap.set(nameKey, wardCode)
    if (!wardNameAggressiveMap.has(nameKey)) wardNameAggressiveMap.set(nameKey, wardCode)
  })

  const wardEntries = {}
  wardTotals.forEach((value, code) => {
    if (!value.totalPop) return
    wardEntries[code] = {
      wardCode: code,
      wardName: value.wardName,
      ownedOutright: value.ownedOutright / value.totalPop,
      ownsWithMortgage: value.ownsWithMortgage / value.totalPop,
      socialRented: value.socialRented / value.totalPop,
      privateRented: value.privateRented / value.totalPop,
      totalPop: value.totalPop,
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

  const wardToCedLookup = await buildWardToCedLookup()
  if (wardToCedLookup) {
    const cedEntries = buildCedEntriesFromLookup(wardToCedLookup.rows, {
      directEntries: wardEntries,
      keyField: 'WD25CD',
      nameField: 'WD25NM',
      ladNameField: 'LAD25NM',
      cedCodeField: 'CED25CD',
      cedNameField: 'CED25NM',
      valueKeys: ['ownedOutright', 'ownsWithMortgage', 'socialRented', 'privateRented'],
      wardNames: wardNameEntries,
      wardNamesOnly: wardNameOnlyEntries,
      wardNamesAggressive: wardNameAggressiveEntries,
    })
    Object.assign(wardEntries, cedEntries)
    addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries)
  }

  const ladEntries = {}
  const ladTotals = new Map()
  baseline.forEach(ward => {
    const tenure = wardEntries[ward.wardCode]
    if (!tenure?.totalPop) return
    const entry = ladTotals.get(ward.ladCode) || {
      totalPop: 0,
      ownedOutright: 0,
      ownsWithMortgage: 0,
      socialRented: 0,
      privateRented: 0,
    }
    entry.totalPop += tenure.totalPop
    entry.ownedOutright += tenure.ownedOutright * tenure.totalPop
    entry.ownsWithMortgage += tenure.ownsWithMortgage * tenure.totalPop
    entry.socialRented += tenure.socialRented * tenure.totalPop
    entry.privateRented += tenure.privateRented * tenure.totalPop
    ladTotals.set(ward.ladCode, entry)
  })
  ladTotals.forEach((value, code) => {
    if (!value.totalPop) return
    ladEntries[code] = {
      ownedOutright: value.ownedOutright / value.totalPop,
      ownsWithMortgage: value.ownsWithMortgage / value.totalPop,
      socialRented: value.socialRented / value.totalPop,
      privateRented: value.privateRented / value.totalPop,
    }
  })

  let baselineShares = null
  const baselinePath = path.join(RAW_DIR, TENURE_BASELINE_FILE)
  if (fs.existsSync(baselinePath)) {
    const { headers: baselineHeaders, rows: baselineRows } = await loadCsv(baselinePath)
    const categoryField = baselineHeaders.find(
      header =>
        String(header || '').trim() === 'Tenure of household (9 categories)' ||
        String(header || '').trim() === 'Tenure of household (4 buckets)'
    )
    const observationField = baselineHeaders.find(
      header => String(header || '').trim() === 'Observation'
    )
    if (categoryField && observationField) {
      const totals = {
        ownedOutright: 0,
        ownsWithMortgage: 0,
        socialRented: 0,
        privateRented: 0,
      }
      baselineRows.forEach(row => {
        const bucket = getTenureBucket(row[categoryField])
        if (!bucket) return
        totals[bucket] += Number(row[observationField] || 0)
      })
      const totalPop = sumObject(totals)
      if (totalPop) {
        baselineShares = {
          ownedOutright: totals.ownedOutright / totalPop,
          ownsWithMortgage: totals.ownsWithMortgage / totalPop,
          socialRented: totals.socialRented / totalPop,
          privateRented: totals.privateRented / totalPop,
        }
      }
    }
  }

  if (!baselineShares) {
    let totalPop = 0
    let ownedOutright = 0
    let ownsWithMortgage = 0
    let socialRented = 0
    let privateRented = 0
    Object.values(wardEntries).forEach(entry => {
      totalPop += entry.totalPop
      ownedOutright += entry.ownedOutright * entry.totalPop
      ownsWithMortgage += entry.ownsWithMortgage * entry.totalPop
      socialRented += entry.socialRented * entry.totalPop
      privateRented += entry.privateRented * entry.totalPop
    })
    baselineShares = totalPop
      ? {
          ownedOutright: ownedOutright / totalPop,
          ownsWithMortgage: ownsWithMortgage / totalPop,
          socialRented: socialRented / totalPop,
          privateRented: privateRented / totalPop,
        }
      : {
          ownedOutright: 0.3,
          ownsWithMortgage: 0.3,
          socialRented: 0.2,
          privateRented: 0.2,
        }
  }

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    wardNamesOnly: wardNameOnlyEntries,
    wardNamesAggressive: wardNameAggressiveEntries,
    lads: ladEntries,
    meta: { baseline: baselineShares },
  }
}

async function buildLadRegionMap(baseline) {
  const csvPath = path.join(RAW_DIR, LAD_REGION_FILE)
  if (!fs.existsSync(csvPath)) return null

  const { headers, rows } = await loadCsv(csvPath)
  if (!headers || !rows) return null

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
    return null
  }

  const ladMap = {}
  const regionMap = {}
  const ladCodeHeader = headers[ladCodeIdx]
  const ladNameHeader = headers[ladNameIdx]
  const regionCodeHeader = headers[regionCodeIdx]
  const regionNameHeader = headers[regionNameIdx]
  rows.forEach(row => {
    const ladCode = String(row[ladCodeHeader] || '').trim()
    if (!ladCode) return
    const ladName = String(row[ladNameHeader] || '').trim()
    const regionCode = String(row[regionCodeHeader] || '').trim()
    const regionName = String(row[regionNameHeader] || '').trim()
    ladMap[ladCode] = { ladCode, ladName, regionCode, regionName }
    if (regionName) {
      if (!regionMap[regionName]) regionMap[regionName] = []
      regionMap[regionName].push(ladCode)
    }
  })

  const walesName = 'Wales'
  const walesCode = 'WLS'
  const baselineWales = new Set()
  baseline.forEach(ward => {
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
  const ladCodes = new Set(baseline.map(ward => ward.ladCode))
  ladCodes.forEach(ladCode => {
    if (!ladMap[ladCode]) missing.push(ladCode)
  })

  return { lads: ladMap, regions: regionMap, missing }
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

async function buildWardToLadLookup() {
  const lookupPath = path.join(RAW_DIR, 'ward_lad_2023_lookup.csv')
  await downloadIfMissing(lookupPath, WARD_LAD_2023_LOOKUP_URL)
  const { rows } = await loadCsv(lookupPath)
  const map = new Map()
  const byName = new Map()
  rows.forEach(row => {
    const ward =
      row.WD23CD || row['WD23CD'] || row['\uFEFFWD23CD']
    const lad =
      row.LAD23CD || row['LAD23CD'] || row['\uFEFFLAD23CD']
    const ladName =
      row.LAD23NM || row['LAD23NM'] || row['\uFEFFLAD23NM']
    const wardName =
      row.WD23NM || row['WD23NM'] || row['\uFEFFWD23NM']
    if (!ward || !lad) return
    map.set(ward, { lad, ladName })
    if (wardName && ladName) {
      const key = `${normalize(ladName)}|${normalize(wardName)}`
      byName.set(key, { ward, lad, ladName, wardName })
    }
  })
  map.byName = byName
  return map
}

async function buildLadToCountyLookup() {
  const lookupPath = path.join(RAW_DIR, 'lad_to_county.csv')
  await downloadIfMissing(lookupPath, LAD_TO_COUNTY_LOOKUP_URL)

  const { rows } = await loadCsv(lookupPath)
  const mapping = new Map()
  const countyNames = new Map()
  rows.forEach(row => {
    const lad = row.LAD24CD || row['LAD24CD']
    const county = row.CTY24CD || row['CTY24CD']
    const countyName = row.CTY24NM || row['CTY24NM']
    if (!lad || !county) return
    mapping.set(lad, county)
    if (county && countyName) countyNames.set(county, countyName)
  })
  mapping.names = countyNames
  return mapping
}

let wardToCedLookupPromise = null
let lsoaToWardLookupPromise = null

async function buildWardToCedLookup() {
  if (wardToCedLookupPromise) return wardToCedLookupPromise
  wardToCedLookupPromise = (async () => {
    const filePath = path.join(RAW_DIR, WARD_TO_CED_LOOKUP_FILE)
    if (!fs.existsSync(filePath)) return null
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'))
    const rows = (data.features || []).map(feature => feature.properties || {}).filter(Boolean)
    return { rows }
  })()
  return wardToCedLookupPromise
}

async function buildLsoaToWardLookup() {
  if (lsoaToWardLookupPromise) return lsoaToWardLookupPromise
  lsoaToWardLookupPromise = (async () => {
    const filePath = path.join(RAW_DIR, LSOA_TO_WARD_LOOKUP_FILE)
    if (!fs.existsSync(filePath)) return null
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'))
    const rows = (data.features || []).map(feature => feature.properties || {}).filter(Boolean)
    return { rows }
  })()
  return lsoaToWardLookupPromise
}

function buildCedEntriesFromLookup(
  rows,
  {
    directEntries,
    keyField,
    nameField,
    ladNameField,
    cedCodeField,
    cedNameField,
    valueKeys,
    wardNames,
    wardNamesOnly,
    wardNamesAggressive,
  }
) {
  const cedTotals = new Map()
  ;(rows || []).forEach(row => {
    const wardCode = String(row[keyField] || '').trim()
    const wardName = String(row[nameField] || '').trim()
    const ladName = String(row[ladNameField] || '').trim()
    const cedCode = String(row[cedCodeField] || '').trim()
    const cedName = String(row[cedNameField] || '').trim()
    if (!wardCode || !wardName || !cedCode || !cedName) return

    const nameOnlyKey = normalize(wardName)
    const nameKey = ladName ? `${normalize(ladName)}|${nameOnlyKey}` : null
    const entry =
      directEntries?.[wardCode] ||
      (nameKey ? wardNames?.[nameKey] : null) ||
      wardNamesOnly?.[nameOnlyKey] ||
      wardNamesAggressive?.[nameOnlyKey] ||
      null
    if (!entry?.totalPop) return

    const totals = cedTotals.get(cedCode) || { wardName: cedName, totalPop: 0 }
    totals.totalPop += entry.totalPop
    valueKeys.forEach(key => {
      totals[key] = (totals[key] || 0) + (entry[key] || 0) * entry.totalPop
    })
    cedTotals.set(cedCode, totals)
  })

  const cedEntries = {}
  cedTotals.forEach((entry, cedCode) => {
    if (!entry.totalPop) return
    const next = {
      wardCode: cedCode,
      wardName: entry.wardName,
      totalPop: entry.totalPop,
    }
    valueKeys.forEach(key => {
      next[key] = (entry[key] || 0) / entry.totalPop
    })
    cedEntries[cedCode] = next
  })

  return cedEntries
}

function addCountyCedAliases(baseline, cedEntries, wardEntries, wardNameEntries) {
  const cedByName = new Map()
  Object.entries(cedEntries || {}).forEach(([cedCode, entry]) => {
    const key = normalizeCedName(entry?.wardName)
    if (!key || cedByName.has(key)) return
    cedByName.set(key, { cedCode, entry })
  })

  ;(baseline || []).forEach(ward => {
    if (!ALL_COUNTY_ELECTIONS.has(normalize(ward.ladName))) return
    if (wardEntries[ward.wardCode]) return
    const match = cedByName.get(normalizeCedName(ward.wardName))
    if (!match?.entry) return
    wardEntries[ward.wardCode] = {
      ...match.entry,
      wardCode: ward.wardCode,
      wardName: ward.wardName,
    }
    wardNameEntries[`${normalize(ward.ladName)}|${normalize(ward.wardName)}`] = wardEntries[ward.wardCode]
  })
}

async function buildCouncilSeatsLookup() {
  const filePath = path.join(RAW_DIR, SEATS_UP_FILE)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing seats file: ${SEATS_UP_FILE} (place it in data/raw)`)
  }
  const workbook = xlsx.readFile(filePath)
  const rows = workbook.SheetNames.flatMap(sheetName =>
    xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
  )
  const entries = rows
    .map(row => ({
      council: String(row['Council name'] || '').trim(),
      seatsUp: Number(String(row['Seats up'] || '').replace(/[^0-9]/g, '')) || 0,
      totalSeats: Number(String(row['Total seats'] || '').replace(/[^0-9]/g, '')) || 0,
      control: String(row['Control'] || '').trim() || null,
    }))
    .filter(row => row.council && row.totalSeats)
  return entries
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
  const normalizePartyHeader = value => {
    const raw = String(value || '').trim()
    const upper = raw.toUpperCase()
    const map = {
      CON: 'Conservative',
      LAB: 'Labour',
      LD: 'Liberal Democrat',
      LIBDEM: 'Liberal Democrat',
      LIB: 'Liberal Democrat',
      GRN: 'Green',
      GREEN: 'Green',
      REF: 'Reform',
      REFORM: 'Reform',
      SNP: 'SNP',
      PC: 'Plaid Cymru',
    }
    if (map[upper]) return map[upper]
    return raw
  }

  let headerRowIndex = -1
  let headerRow = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const joined = row.map(cell => headerNormalize(cell)).join(' ')
    if (
      joined.includes('local authority name') &&
      (joined.includes('ward name') || joined.includes('ward/ed name'))
    ) {
      headerRowIndex = i
      headerRow = row
      break
    }
  }
  if (headerRowIndex === -1) return []

  const indices = {
    countyName: headerRow.findIndex(cell => headerNormalize(cell).includes('county name')),
    countyCode: headerRow.findIndex(cell => headerNormalize(cell).includes('county code')),
    ladName: headerRow.findIndex(cell => headerNormalize(cell).includes('local authority name')),
    ladCode: headerRow.findIndex(cell => headerNormalize(cell).includes('local authority code')),
    wardCode: headerRow.findIndex(cell => {
      const normalized = headerNormalize(cell)
      return normalized.includes('ward code') || normalized.includes('ward/ed code')
    }),
    wardName: headerRow.findIndex(cell => {
      const normalized = headerNormalize(cell)
      return normalized.includes('ward name') || normalized.includes('ward/ed name')
    }),
    totalVotes: headerRow.findIndex(cell => headerNormalize(cell).includes('total votes')),
    turnout: headerRow.findIndex(cell => headerNormalize(cell).includes('turnout')),
    vacancies: headerRow.findIndex(cell => headerNormalize(cell).includes('vacancies')),
  }

  let partyStartIndex = 0
  if (indices.turnout >= 0 && (indices.totalVotes === -1 || indices.turnout < indices.totalVotes)) {
    partyStartIndex = indices.turnout + 1
  } else if (indices.totalVotes >= 0) {
    partyStartIndex = indices.totalVotes + 1
  }
  const skipHeaders = [
    'turnout',
    'electorate',
    'total votes',
    'vacancies',
    'local authority type',
    'election type',
    'county name',
    'county code',
    'local authority name',
    'local authority code',
    'ward name',
    'ward code',
    'type',
  ]
  const partyColumns = headerRow
    .map((cell, index) => ({ index, name: normalizePartyHeader(cell) }))
    .filter(entry => entry.index >= partyStartIndex && entry.name)
    .filter(entry => {
      const header = headerNormalize(entry.name)
      return !skipHeaders.some(skip => header.includes(skip))
    })

  const dataRows = []
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row.length) continue
    const wardCode = row[indices.wardCode]
    const isCountyDivision = String(wardCode || '').startsWith('E58')
    const ladName = isCountyDivision && indices.countyName >= 0 ? row[indices.countyName] : row[indices.ladName]
    const ladCode = isCountyDivision && indices.countyCode >= 0 ? row[indices.countyCode] : row[indices.ladCode]
    const wardName = row[indices.wardName]
    if (!ladName || !wardName) continue
    const partyVotes = partyColumns.reduce((acc, col) => {
      const value = row[col.index]
      if (acc[col.name] == null) {
        acc[col.name] = value
        return acc
      }
      const current = Number(String(acc[col.name] || '').replace(/[^0-9]/g, '')) || 0
      const add = Number(String(value || '').replace(/[^0-9]/g, '')) || 0
      acc[col.name] = current + add
      return acc
    }, {})
    let totalVotes = row[indices.totalVotes]
    if (indices.totalVotes === -1) {
      totalVotes = Object.values(partyVotes).reduce((sum, value) => {
        const numeric = Number(String(value || '').replace(/[^0-9]/g, '')) || 0
        return sum + numeric
      }, 0)
    }
    dataRows.push({
      ladName,
      ladCode,
      wardName,
      wardCode,
      vacancies: indices.vacancies >= 0 ? row[indices.vacancies] : null,
      totalVotes,
      partyVotes,
    })
  }

  return dataRows
}

function parseLeaveShareCsv(rows, type, nameFieldCandidates = []) {
  if (!rows || !rows.length) return new Map()
  const header = Object.keys(rows[0] || {})
  const cleaned = header.map(name =>
    String(name || '')
      .replace(/^\uFEFF/, '')
      .trim()
  )
  const headerMap = new Map(cleaned.map((name, i) => [name, header[i]]))
  const pick = candidates => {
    const match = candidates.find(name => headerMap.has(name))
    return match ? headerMap.get(match) : null
  }

  const codeField =
    type === 'ward'
      ? pick(['WD25CD', 'WD23CD', 'WD22CD', 'WardCode', 'ward_code'])
      : pick([
          'LAD24CD',
          'LAD23CD',
          'LAD22CD',
          'LAD21CD',
          'lad_code',
          'LADCD',
          'Area_Code',
          'AREA_CODE',
        ])

  const leaveField =
    pick([
      'Pct_Leave',
      'Pct Leave',
      'Leave%',
      'LeaveShare',
      'leave_share',
      'LeaveSharePct',
      'Leave %',
      'LeavePct',
      'Leave',
      'leave',
    ]) || null
  const nameField =
    nameFieldCandidates.length > 0 ? pick(nameFieldCandidates) : null

  if (!codeField || !leaveField) return new Map()

  const map = new Map()
  const nameMap = new Map()
  rows.forEach(row => {
    const code = row[codeField]
    if (!code) return
    const raw = row[leaveField]
    const rawText = String(raw ?? '').trim()
    if (!rawText) return
    const value = Number(String(raw || '').replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(value)) return
    const share = value > 1 ? value / 100 : value
    if (share < 0 || share > 1) return
    map.set(String(code), share)
    if (nameField && row[nameField]) {
      const nameKey = String(row[nameField])
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/\s+/g, ' ')
        .trim()
      nameMap.set(nameKey, share)
    }
  })
  map.nameMap = nameMap
  return map
}

function getOuterRings(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates) ? [geometry.coordinates[0]] : []
  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.map(polygon => polygon[0]).filter(Boolean) : []
  }
  return []
}

function getBBox(geometry) {
  const outerRings = getOuterRings(geometry)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  outerRings.forEach(ring => {
    ring.forEach(([x, y]) => {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    })
  })
  return { minX, minY, maxX, maxY }
}

function bboxesOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

function pointInBBox(point, bbox) {
  return (
    point[0] >= bbox.minX &&
    point[0] <= bbox.maxX &&
    point[1] >= bbox.minY &&
    point[1] <= bbox.maxY
  )
}

function pointOnSegment(point, start, end) {
  const [px, py] = point
  const [x1, y1] = start
  const [x2, y2] = end
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1)
  if (Math.abs(cross) > 1e-12) return false
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2)
  return dot <= 1e-12
}

function pointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const current = ring[i]
    const previous = ring[j]
    if (pointOnSegment(point, previous, current)) return true
    const xi = current[0]
    const yi = current[1]
    const xj = previous[0]
    const yj = previous[1]
    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : []
  return polygons.some(polygon => {
    if (!Array.isArray(polygon) || !polygon.length || !pointInRing(point, polygon[0])) return false
    for (let i = 1; i < polygon.length; i += 1) {
      if (pointInRing(point, polygon[i])) return false
    }
    return true
  })
}

function ringArea(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return ring?.[0] || [0, 0]
  let cx = 0
  let cy = 0
  let areaFactor = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    const cross = x1 * y2 - x2 * y1
    areaFactor += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }
  if (Math.abs(areaFactor) < 1e-12) return ring[0] || [0, 0]
  return [cx / (3 * areaFactor), cy / (3 * areaFactor)]
}

function getRepresentativePoint(feature) {
  const outerRings = getOuterRings(feature.geometry)
  if (!outerRings.length) return null
  let largestRing = outerRings[0]
  let largestArea = Math.abs(ringArea(largestRing))
  for (let i = 1; i < outerRings.length; i += 1) {
    const area = Math.abs(ringArea(outerRings[i]))
    if (area > largestArea) {
      largestArea = area
      largestRing = outerRings[i]
    }
  }
  const centroid = ringCentroid(largestRing)
  if (pointInGeometry(centroid, feature.geometry)) return centroid
  const bbox = getBBox(feature.geometry)
  const bboxCenter = [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2]
  if (pointInGeometry(bboxCenter, feature.geometry)) return bboxCenter
  return largestRing[0] || null
}

function loadLeaveWardXlsx(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false })
  const sheet = workbook.Sheets['Data'] || workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null })
  return { rows }
}

async function buildLeaveShare(baseline, wardGeoCodes, wardGeo, cedGeo, ladGeo, ladToCounty) {
  const wardPath = path.join(RAW_DIR, LEAVE_WARD_FILE)
  const wardXlsxPath = path.join(RAW_DIR, LEAVE_WARD_XLSX)
  const ladPath = path.join(RAW_DIR, LEAVE_LAD_FILE)
  if ((!fs.existsSync(wardPath) && !fs.existsSync(wardXlsxPath)) || !fs.existsSync(ladPath)) {
    return null
  }

  const wardCsv = fs.existsSync(wardXlsxPath)
    ? loadLeaveWardXlsx(wardXlsxPath)
    : await loadCsv(wardPath)
  const ladCsv = await loadCsv(ladPath)
  const wardMap = parseLeaveShareCsv(wardCsv.rows, 'ward', ['WardName', 'ward_name'])
  const ladMap = parseLeaveShareCsv(ladCsv.rows, 'lad')
  const ladNameToCode = new Map()
  ;(ladCsv.rows || []).forEach(row => {
    const code = row.LAD24CD || row.LAD23CD || row.LAD22CD || row.LAD21CD || row.Area_Code || row.AREA_CODE
    const name = row.LAD24NM || row.LAD23NM || row.LAD22NM || row.LAD21NM || row.Area || row.AREA_NAME || row.Area_Name
    if (!code || !name) return
    ladNameToCode.set(normalize(name), String(code))
  })
  const wardNameToOldLadCode = new Map()
  ;(wardCsv.rows || []).forEach(row => {
    const wardName = row.WardName || row.ward_name
    const countingArea = row.CountingArea || row.counting_area
    if (!wardName || !countingArea) return
    const oldLadCode = ladNameToCode.get(normalize(countingArea))
    if (!oldLadCode) return
    const key = String(wardName)
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\s+/g, ' ')
      .trim()
    if (!wardNameToOldLadCode.has(key)) wardNameToOldLadCode.set(key, oldLadCode)
  })

  const wardEntries = {}
  wardMap.forEach((leaveShare, code) => {
    wardEntries[code] = { leaveShare }
  })
  const wardNameEntries = {}
  if (wardMap.nameMap) {
    wardMap.nameMap.forEach((leaveShare, key) => {
      wardNameEntries[key] = { leaveShare }
    })
  }

  const ladEntries = {}
  ladMap.forEach((leaveShare, code) => {
    ladEntries[code] = { leaveShare }
  })

  let cedDerived = 0
  let cedDistrictFallback = 0
  if (wardGeo?.features?.length && cedGeo?.features?.length && ladGeo?.features?.length) {
    const wardFeaturesByCounty = new Map()
    wardGeo.features.forEach(feature => {
      const props = feature.properties || {}
      const wardCode = props.reference || props.WD25CD || props.WD23CD
      const wardName = props.name || props.WD25NM || props.WD23NM
      const ladCode = props.ladCode || props.LAD23CD || props.LAD24CD
      const countyCode = ladToCounty?.get(ladCode)
      if (!wardCode || !wardName || !ladCode || !countyCode) return
      const share =
        wardMap.get(String(wardCode)) ??
        wardMap.nameMap?.get(
          String(wardName)
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/\s+/g, ' ')
            .trim()
        ) ??
        null
      const oldLadCode =
        wardNameToOldLadCode.get(
          String(wardName)
            .toLowerCase()
            .replace(/&/g, 'and')
            .replace(/\s+/g, ' ')
            .trim()
        ) || null
      const entry = {
        code: String(wardCode),
        ladCode: String(ladCode),
        districtCode: oldLadCode || String(ladCode),
        share,
        bbox: getBBox(feature.geometry),
        geometry: feature.geometry,
      }
      const list = wardFeaturesByCounty.get(countyCode) || []
      list.push(entry)
      wardFeaturesByCounty.set(countyCode, list)
    })

    const districtFeaturesByCounty = new Map()
    ladGeo.features.forEach(feature => {
      const props = feature.properties || {}
      const ladCode = props.reference || props.LAD23CD || props.LAD24CD
      const countyCode = ladToCounty?.get(ladCode)
      if (!ladCode || !countyCode) return
      const entry = {
        ladCode: String(ladCode),
        bbox: getBBox(feature.geometry),
        geometry: feature.geometry,
      }
      const list = districtFeaturesByCounty.get(countyCode) || []
      list.push(entry)
      districtFeaturesByCounty.set(countyCode, list)
    })

    cedGeo.features.forEach(feature => {
      const props = feature.properties || {}
      const cedCode = props.reference || props.CED25CD || props.CED24CD || props.CED23CD
      const cedName = props.name || props.CED25NM || props.CED24NM || props.CED23NM
      const countyCode =
        props.countyCode ||
        props.county ||
        props.CTY25CD ||
        props.CTY24CD ||
        (String(props.ladCode || '').startsWith('E100') ? String(props.ladCode) : ladToCounty?.get(props.ladCode))
      if (!cedCode || !cedName || !countyCode) return
      const cedBBox = getBBox(feature.geometry)
      const wardCandidates = (wardFeaturesByCounty.get(countyCode) || []).filter(candidate =>
        bboxesOverlap(cedBBox, candidate.bbox)
      )

      let weightedShare = 0
      let matchedSamples = 0
      let dominantDistrict = null
      let dominantDistrictCount = 0
      if (wardCandidates.length) {
        const gridSize = 18
        const districtCounts = new Map()
        for (let xi = 0; xi <= gridSize; xi += 1) {
          for (let yi = 0; yi <= gridSize; yi += 1) {
            const point = [
              cedBBox.minX + ((cedBBox.maxX - cedBBox.minX) * xi) / gridSize,
              cedBBox.minY + ((cedBBox.maxY - cedBBox.minY) * yi) / gridSize,
            ]
            if (!pointInGeometry(point, feature.geometry)) continue
            const ward = wardCandidates.find(
              candidate =>
                pointInBBox(point, candidate.bbox) && pointInGeometry(point, candidate.geometry)
            )
            if (!ward) continue
            districtCounts.set(ward.districtCode, (districtCounts.get(ward.districtCode) || 0) + 1)
            if (typeof ward.share === 'number') {
              matchedSamples += 1
              weightedShare += ward.share
            }
          }
        }
        districtCounts.forEach((count, ladCode) => {
          if (count > dominantDistrictCount) {
            dominantDistrict = ladCode
            dominantDistrictCount = count
          }
        })
        if (!dominantDistrict) {
          wardCandidates.forEach(candidate => {
            districtCounts.set(
              candidate.districtCode,
              (districtCounts.get(candidate.districtCode) || 0) + 1
            )
          })
          districtCounts.forEach((count, ladCode) => {
            if (count > dominantDistrictCount) {
              dominantDistrict = ladCode
              dominantDistrictCount = count
            }
          })
        }
      }

      if (matchedSamples > 0) {
        wardEntries[cedCode] = {
          wardCode: cedCode,
          wardName: cedName,
          totalPop: 1,
          leaveShare: weightedShare / matchedSamples,
        }
        wardNameEntries[cedName.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim()] = {
          leaveShare: weightedShare / matchedSamples,
        }
        cedDerived += 1
        return
      }

      const representativePoint = getRepresentativePoint(feature)
      if (!dominantDistrict && representativePoint) {
        const district = (districtFeaturesByCounty.get(countyCode) || []).find(
          candidate =>
            pointInBBox(representativePoint, candidate.bbox) &&
            pointInGeometry(representativePoint, candidate.geometry)
        )
        if (district) dominantDistrict = district.ladCode
      }

      const districtLeaveShare =
        (dominantDistrict && ladMap.get(String(dominantDistrict))) || null
      if (typeof districtLeaveShare === 'number') {
        wardEntries[cedCode] = {
          wardCode: cedCode,
          wardName: cedName,
          totalPop: 1,
          leaveShare: districtLeaveShare,
        }
        wardNameEntries[cedName.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim()] = {
          leaveShare: districtLeaveShare,
        }
        cedDistrictFallback += 1
      }
    })
  }
  const leaveCedEntries = Object.fromEntries(
    Object.entries(wardEntries).filter(([, entry]) => entry && entry.wardCode && String(entry.wardCode).startsWith('E58'))
  )
  addCountyCedAliases(baseline, leaveCedEntries, wardEntries, wardNameEntries)

  const coverage = wardGeoCodes && wardGeoCodes.size
    ? wardMap.size / wardGeoCodes.size
    : null

  return {
    wards: wardEntries,
    wardNames: wardNameEntries,
    lads: ladEntries,
    meta: {
      wardCoverage: coverage,
      wards: wardMap.size,
      lads: ladMap.size,
      cedsFromWards: cedDerived,
      cedsFromDistrictFallback: cedDistrictFallback,
    },
  }
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

async function fetchHtml(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Poll-of-Polls/1.0 (local build)',
      },
    })
    if (res.status === 429) {
      await sleep(1500 * (i + 1))
      continue
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`)
    }
    return await res.text()
  }
  throw new Error(`Failed to fetch ${url}: 429`)
}

async function fetchJson(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Poll-of-Polls/1.0 (local build)',
      },
    })
    if (res.status === 429) {
      await sleep(1500 * (i + 1))
      continue
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`)
    }
    return await res.json()
  }
  throw new Error(`Failed to fetch ${url}: 429`)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function extractResultsTable($) {
  const tables = $('table').toArray()
  for (const table of tables) {
    const headers = $(table)
      .find('tr')
      .first()
      .find('th')
      .toArray()
      .map(th => $(th).text().toLowerCase())
    const hasCandidate = headers.some(h => h.includes('candidate'))
    const hasParty = headers.some(h => h.includes('party'))
    const hasVotes = headers.some(h => h.includes('votes') || h.includes('results'))
    if (hasCandidate && hasParty && hasVotes) {
      return { table, headers }
    }
  }
  return null
}

function parseWardResultsTable(html) {
  const $ = cheerio.load(html)
  const tableInfo = extractResultsTable($)
  if (!tableInfo) return null
  const { table, headers } = tableInfo

  const partyIndex = headers.findIndex(h => h.includes('party'))
  const votesIndex = headers.findIndex(h => h.includes('votes') || h.includes('results'))
  if (partyIndex === -1 || votesIndex === -1) return null

  const rows = $(table).find('tr').slice(1).toArray()
  const partyVotes = {}
  let totalVotes = 0
  rows.forEach(row => {
    const cells = $(row).find('td').toArray().map(td => $(td).text().trim())
    if (cells.length <= Math.max(partyIndex, votesIndex)) return
    const party = cells[partyIndex]
    const votes = Number(String(cells[votesIndex] || '').replace(/[^0-9]/g, ''))
    if (!party || !votes) return
    if (party.toLowerCase().includes('rejected')) return
    partyVotes[party] = (partyVotes[party] || 0) + votes
    totalVotes += votes
  })
  return totalVotes ? { partyVotes, totalVotes } : null
}

function parseTealeWardTable(html) {
  const $ = cheerio.load(html)
  const tables = $('table').toArray()
  let target = null

  for (const table of tables) {
    const headers = $(table)
      .find('tr')
      .first()
      .find('th')
      .toArray()
      .map(th => $(th).text().trim())
    if (!headers.length) continue
    const hasWard = headers.some(h => /ward/i.test(h))
    const hasParty = headers.some(h =>
      /(lab|con|ld|lib|dem|green|grn|reform|snp|plaid|ind|ukip)/i.test(h)
    )
    if (hasWard && hasParty) {
      target = { table, headers }
      break
    }
  }

  if (!target) return []
  const { table, headers } = target
  const wardIndex = headers.findIndex(h => /ward/i.test(h))
  if (wardIndex === -1) return []

  const rows = []
  $(table)
    .find('tr')
    .slice(1)
    .each((_, row) => {
      const cells = $(row)
        .find('td')
        .toArray()
        .map(td => $(td).text().trim())
      if (!cells.length || cells.length <= wardIndex) return
      const wardName = cells[wardIndex]
      if (!wardName) return

      const partyVotes = {}
      let totalVotes = 0
      for (let i = 0; i < cells.length && i < headers.length; i++) {
        if (i === wardIndex) continue
        const header = headers[i]
        if (!header) continue
        if (/turnout|electorate|majority|%|percent/i.test(header)) continue
        const votes = Number(String(cells[i] || '').replace(/[^0-9]/g, ''))
        if (!votes) continue
        partyVotes[header] = (partyVotes[header] || 0) + votes
        totalVotes += votes
      }

      if (totalVotes > 0) {
        rows.push({ wardName, partyVotes, totalVotes })
      }
    })

  return rows
}

async function fetchTealeWardResults(councilId, ladName) {
  const url = `https://www.andrewteale.me.uk/leap/results/2022/${councilId}/`
  const cachePath = path.join(RAW_DIR, `teale_${councilId}.html`)
  const cacheMhtmlPath = path.join(RAW_DIR, `teale_${councilId}.mhtml`)
  let html
  if (fs.existsSync(cachePath)) {
    const content = await fsp.readFile(cachePath, 'utf8')
    if (content && content.length > 1000) {
      html = content
    }
  }
  if (!html && fs.existsSync(cacheMhtmlPath)) {
    const mhtml = await fsp.readFile(cacheMhtmlPath, 'utf8')
    html = extractHtmlFromMhtml(mhtml)
  }
  if (!html) {
    html = await fetchHtml(url)
    await fsp.writeFile(cachePath, html)
  }
  const rows = parseTealeWardTable(html)
  return rows.map(row => ({
    ladName,
    wardName: row.wardName,
    totalVotes: row.totalVotes,
    partyVotes: row.partyVotes,
  }))
}

function extractHtmlFromMhtml(mhtml) {
  const boundaryMatch = mhtml.match(/boundary=\"?([^\"\\r\\n;]+)\"?/i)
  if (!boundaryMatch) return mhtml
  const boundary = boundaryMatch[1]
  const parts = mhtml.split(`--${boundary}`)
  for (const part of parts) {
    if (/Content-Type:\s*text\/html/i.test(part)) {
      const split = part.split(/\r?\n\r?\n/)
      if (split.length > 1) {
        const body = split.slice(1).join('\n')
        return decodeQuotedPrintable(body)
      }
    }
  }
  return mhtml
}

function decodeQuotedPrintable(input) {
  if (!input) return input
  // Remove soft line breaks
  let text = input.replace(/=\r?\n/g, '')
  // Decode =XX hex codes
  text = text.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
  return text
}

async function fetchBirminghamWardResults() {
  const base = 'https://www.birmingham.gov.uk/directory/69/a_to_z'
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const wardUrls = new Set()

  for (const letter of letters) {
    const url = `${base}/${letter}`
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    $('a').each((_, el) => {
      const href = $(el).attr('href')
      if (!href) return
      if (href.includes('/directory_record/') && href.toLowerCase().includes('ward_results')) {
        const full = href.startsWith('http') ? href : `https://www.birmingham.gov.uk${href}`
        wardUrls.add(full)
      }
    })
  }

  const results = []
  for (const url of wardUrls) {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)
    const heading = $('h1').first().text().replace(/ward results/i, '').trim()
    const wardName = heading || $('h1').first().text().trim()
    const parsed = parseWardResultsTable(html)
    if (!parsed || !wardName) continue
    results.push({ wardName, ladName: 'Birmingham', ...parsed })
  }

  return results
}

async function fetchHuntingdonshireWardResults() {
  const base = 'https://www.huntingdonshire.gov.uk/election-2022/may-2022-election-results/'
  const html = await fetchHtml(base)
  const $ = cheerio.load(html)
  const wardUrls = new Set()
  $('a').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    if (href.includes('/election-2022/may-2022-election-results/') && href.includes('-ward')) {
      const full = href.startsWith('http') ? href : `https://www.huntingdonshire.gov.uk${href}`
      wardUrls.add(full)
    }
  })

  const results = []
  for (const url of wardUrls) {
    const page = await fetchHtml(url)
    const $page = cheerio.load(page)
    const heading = $page('h1').first().text().replace(/ward$/i, '').trim()
    const wardName = heading || $page('h1').first().text().trim()
    const parsed = parseWardResultsTable(page)
    if (!parsed || !wardName) continue
    results.push({ wardName, ladName: 'Huntingdonshire', ...parsed })
  }

  return results
}

async function fetchSouthCambridgeshireWardResults() {
  const base = 'https://www.scambs.gov.uk/our-district-election-results-2022/'
  let html
  try {
    html = await fetchHtml(base)
  } catch (err) {
    console.warn(`South Cambs results page unavailable: ${err.message}`)
    return []
  }
  const $ = cheerio.load(html)
  const wardUrls = new Set()
  $('a').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    if (href.includes('/our-district-election-results-2022/') && href.includes('-ward')) {
      const full = href.startsWith('http') ? href : `https://www.scambs.gov.uk${href}`
      wardUrls.add(full)
    }
  })

  const results = []
  for (const url of wardUrls) {
    const page = await fetchHtml(url)
    const $page = cheerio.load(page)
    const heading = $page('h1').first().text().replace(/ward$/i, '').trim()
    const wardName = heading || $page('h1').first().text().trim()
    const parsed = parseWardResultsTable(page)
    if (!parsed || !wardName) continue
    results.push({ wardName, ladName: 'South Cambridgeshire', ...parsed })
  }

  return results
}

function parseWikipediaWardTable($, $table) {
  const partyLabels = [
    'Liberal Democrats',
    'Liberal Democrat',
    'Lib Dem',
    'Conservative',
    'Labour',
    'Green',
    'Independent',
    'Reform UK',
    'Reform',
    'UKIP',
    'TUSC',
    'Trade Unionist and Socialist Coalition',
    'Workers Party of Britain',
    'Workers Party',
    'Plaid Cymru',
    'SNP',
  ]

  const partyVotes = {}
  let totalVotes = 0

  if (!$table || !$table.length) return null

  $table.find('tr').each((_, row) => {
    const cells = []
    const $cells = $(row).find('th, td')
    $cells.each((__, cell) => {
      const text = $(cell)
        .text()
        .replace(/\[[0-9]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      cells.push(text)
    })
    if (!cells.length) return
    const joined = cells.join(' ')
    if (/^(majority|turnout)\b/i.test(joined)) return
    if (/party\s+candidate\s+votes/i.test(joined)) return

    let partyCell = cells[0] || ''
    const votesCell =
      cells.find(cell => /^[0-9][0-9,]*$/.test(cell.replace(/,/g, ''))) || ''
    if (!votesCell) return

    if (!partyLabels.some(label => partyCell.toLowerCase().startsWith(label.toLowerCase()))) {
      // Some tables include party in second column (after candidate)
      const possibleParty = cells.find(cell =>
        partyLabels.some(label => cell.toLowerCase().startsWith(label.toLowerCase()))
      )
      if (possibleParty) partyCell = possibleParty
    }

    const partyLabel = partyLabels.find(label =>
      partyCell.toLowerCase().startsWith(label.toLowerCase())
    )
    if (!partyLabel) return

    const votes = Number(votesCell.replace(/,/g, ''))
    if (!votes) return
    partyVotes[partyLabel] = (partyVotes[partyLabel] || 0) + votes
    totalVotes += votes
  })

  return totalVotes ? { partyVotes, totalVotes } : null
}

function parseWikipediaWardText(text) {
  const partyLabels = [
    'Liberal Democrats',
    'Liberal Democrat',
    'Lib Dem',
    'Conservative',
    'Labour',
    'Green',
    'Independent',
    'Reform UK',
    'Reform',
    'UKIP',
    'TUSC',
    'Trade Unionist and Socialist Coalition',
    'Workers Party of Britain',
    'Workers Party',
    'Plaid Cymru',
    'SNP',
  ]

  const partyVotes = {}
  let totalVotes = 0

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length) {
    for (const line of lines) {
      if (/^(majority|turnout)\b/i.test(line)) continue
      if (/party\s+candidate\s+votes/i.test(line)) continue
      const matchLabel = partyLabels.find(label =>
        line.toLowerCase().startsWith(label.toLowerCase())
      )
      if (!matchLabel) continue
      const numberMatch = line.match(/([0-9][0-9,]*)/)
      if (!numberMatch) continue
      const votes = Number(numberMatch[1].replace(/,/g, ''))
      if (!votes) continue
      partyVotes[matchLabel] = (partyVotes[matchLabel] || 0) + votes
      totalVotes += votes
    }
  }

  if (!totalVotes) {
    const labels = partyLabels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(`(${labels.join('|')})[^0-9]*([0-9][0-9,]*)`, 'gi')
    let match
    while ((match = regex.exec(text))) {
      const label = match[1]
      const votes = Number(match[2].replace(/,/g, ''))
      if (!votes) continue
      partyVotes[label] = (partyVotes[label] || 0) + votes
      totalVotes += votes
    }
  }

  return totalVotes ? { partyVotes, totalVotes } : null
}

function normalizeCouncilNameLite(name) {
  return normalize(name)
    .replace(/\bcouncil\b/g, '')
    .replace(/\bdistrict\b/g, '')
    .replace(/\bborough\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\bmetropolitan\b/g, '')
    .replace(/\bunitary\b/g, '')
    .replace(/\blondon\b/g, '')
    .replace(/\bthe\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseWikipediaCouncilSeats(html) {
  const $ = cheerio.load(html)
  const infobox = $('table.infobox').first()
  if (!infobox.length) return null

  const normalizeCellText = text =>
    String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const parseSeatNumber = text => {
    const match = String(text || '').match(/(\d+)/)
    return match ? Number(match[1]) : 0
  }

  const lastElection = {}
  const seatsBefore = {}
  let parties = []
  infobox.find('tr').each((_, row) => {
    const headerText = normalizeCellText($(row).find('th').first().text()).toLowerCase()
    if (headerText === 'party') {
      parties = $(row)
        .find('td')
        .map((__, td) => normalizeCellText($(td).text()))
        .get()
        .filter(Boolean)
      return
    }
    if (!parties.length) return
    if (headerText.includes('last election')) {
      const cells = $(row)
        .find('td')
        .map((__, td) => normalizeCellText($(td).text()))
        .get()
      parties.forEach((partyName, index) => {
        const lastSeats = parseSeatNumber(cells[index])
        if (!lastSeats) return
        const mapped = mapParty(partyName)
        const label = mapped.bucket === 'national' ? mapped.name : partyName
        lastElection[label] = (lastElection[label] || 0) + lastSeats
      })
      return
    }
    if (headerText.includes('current seats') || headerText.includes('seats before')) {
      const cells = $(row)
        .find('td')
        .map((__, td) => normalizeCellText($(td).text()))
        .get()
      parties.forEach((partyName, index) => {
        const beforeSeats = parseSeatNumber(cells[index])
        if (!beforeSeats) return
        const mapped = mapParty(partyName)
        const label = mapped.bucket === 'national' ? mapped.name : partyName
        seatsBefore[label] = (seatsBefore[label] || 0) + beforeSeats
      })
    }
  })

  // Fallback / override: try the "Council composition" table (Before 2026 election)
  const compositionHeader = $('h2[id*="council_composition" i]').first()
  const compositionHeaderAlt = compositionHeader.length
    ? compositionHeader
    : $('h2').filter((_, el) => /council composition/i.test($(el).text())).first()
  if (compositionHeaderAlt.length) {
    const table = compositionHeaderAlt.parent().nextAll('table.wikitable').first()
    if (table.length) {
      const compositionSeatsBefore = {}
      const rows = table.find('tr')
      rows.each((_, row) => {
        const cells = $(row).find('td').toArray()
        if (cells.length < 6) return
        const beforeCells = cells.slice(-3)
        const partyCell = beforeCells[1]
        const seatCell = beforeCells[2]
          const partyName = normalizeCellText($(partyCell).text()).replace(/\[[0-9]+\]/g, '')
          const seatValue = parseSeatNumber($(seatCell).text())
          if (!partyName || !seatValue) return
          const mapped = mapParty(partyName)
          const label = mapped.bucket === 'national' ? mapped.name : partyName
          compositionSeatsBefore[label] = (compositionSeatsBefore[label] || 0) + seatValue
      })
      if (Object.keys(compositionSeatsBefore).length) {
        Object.keys(seatsBefore).forEach(key => delete seatsBefore[key])
        Object.entries(compositionSeatsBefore).forEach(([key, value]) => {
          seatsBefore[key] = value
        })
      }
    }
  }

  if (Object.keys(lastElection).length || Object.keys(seatsBefore).length) {
    return { lastElection, seatsBefore }
  }

  return null
}

function parseWikipediaWardIncumbents(html) {
  const $ = cheerio.load(html)
  const normalizeCellText = text =>
    String(text || '')
      .replace(/\[[0-9a-z]+\]/gi, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const incumbentsHeader = $('h2[id*="incumbents" i]').first()
  const incumbentsHeaderAlt = incumbentsHeader.length
    ? incumbentsHeader
    : $('h2').filter((_, el) => /incumbents/i.test($(el).text())).first()
  if (!incumbentsHeaderAlt.length) return {}

  const table = incumbentsHeaderAlt.parent().nextAll('table.wikitable').first()
  if (!table.length) return {}

  const wardIncumbents = {}
  table.find('tr').each((_, row) => {
    const cells = $(row).find('th, td').toArray()
    if (cells.length < 4) return
    const texts = cells.map(cell => normalizeCellText($(cell).text()))
    const wardName = texts[0]
    if (!wardName || /^ward$/i.test(wardName)) return
    const partyText = texts[3] || texts[2] || ''
    if (!partyText || /^party$/i.test(partyText)) return
    const mapped = mapParty(partyText)
    const label = mapped.bucket === 'national' ? mapped.name : partyText
    wardIncumbents[wardName] = label
  })

  return wardIncumbents
}

async function findWikipediaElectionPage(councilName) {
  const query = encodeURIComponent(`2026 ${councilName} council election`)
  const cachePath = path.join(RAW_DIR, `wiki_search_${normalize(councilName)}.json`)
  let data = null
  if (fs.existsSync(cachePath)) {
    data = JSON.parse(await fsp.readFile(cachePath, 'utf8'))
  } else {
    data = await fetchJson(`${WIKIPEDIA_API}${query}`)
    await fsp.writeFile(cachePath, JSON.stringify(data))
  }
  const results = data?.query?.search || []
  const normalizedTarget = normalizeCouncilNameLite(councilName)
  for (const result of results) {
    const title = result.title || ''
    if (!title.includes('2026')) continue
    const normalizedTitle = normalizeCouncilNameLite(title)
    if (!normalizedTitle.includes(normalizedTarget)) continue
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
    return { title, url }
  }
  return null
}

async function buildCouncilPreviousSeats(councilSeats) {
  const results = []
  for (const council of councilSeats) {
    if (normalizeCouncilNameLite(council.council) === 'city of london') continue
    try {
      const cachePath = path.join(RAW_DIR, `wiki_prev_${normalize(council.council)}.json`)
      const cached = fs.existsSync(cachePath)
        ? JSON.parse(await fsp.readFile(cachePath, 'utf8'))
        : null

      const match = await findWikipediaElectionPage(council.council)
      if (!match) {
        if (cached) results.push(cached)
        continue
      }
      await sleep(2000)
      const pageCachePath = path.join(RAW_DIR, `wiki_page_${normalize(match.title)}.html`)
      let html = null
      if (fs.existsSync(pageCachePath)) {
        html = await fsp.readFile(pageCachePath, 'utf8')
      } else {
        html = await fetchHtml(match.url)
        await fsp.writeFile(pageCachePath, html)
      }
      const parsed = parseWikipediaCouncilSeats(html)
      if (!parsed) {
        if (cached) results.push(cached)
        continue
      }
      const record = {
        council: council.council,
        url: match.url,
        lastElection: parsed.lastElection,
        seatsBefore: parsed.seatsBefore,
        wardIncumbents: parseWikipediaWardIncumbents(html),
      }
      await fsp.writeFile(cachePath, JSON.stringify(record, null, 2))
      results.push(record)
    } catch (err) {
      console.warn(`Failed to parse Wikipedia for ${council.council}: ${err.message}`)
    }
  }
  return results
}

async function fetchWikipediaWardResults(url, ladName) {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  const content = $('#mw-content-text')
  const rows = []

  const headings = content.find('h3, h4')
  headings.each((_, heading) => {
    const headline = $(heading).find('.mw-headline')
    const wardName = headline.text().replace(/\(.*\)/, '').trim()
    if (!wardName) return
    const section = $(heading).nextUntil('h3, h4, h2')
    let table = section.find('table.wikitable').first()
    if (!table.length) {
      table = section.find('table').first()
    }
    let parsed = parseWikipediaWardTable($, table)
    if (!parsed) {
      parsed = parseWikipediaWardText(section.text())
    }
    if (!parsed) return
    rows.push({ wardName, ladName, ...parsed })
  })

  if (rows.length) return rows

  const output = content.find('.mw-parser-output').first()
  const children = output.children().toArray()
  let currentWard = null
  let buffer = []
  const flush = () => {
    if (!currentWard || !buffer.length) return
    const sectionText = buffer.map(el => $(el).text()).join('\n')
    let table = null
    for (const el of buffer) {
      const found = $(el).find('table').first()
      if (found.length) {
        table = found
        break
      }
    }
    let parsed = table ? parseWikipediaWardTable($, table) : null
    if (!parsed) parsed = parseWikipediaWardText(sectionText)
    if (parsed) rows.push({ wardName: currentWard, ladName, ...parsed })
  }
  children.forEach(el => {
    const $el = $(el)
    const text = $el.text().trim()
    const bold = $el.find('b, strong').first()
    const boldText = bold.text().trim()
    const looksLikeWard =
      boldText &&
      text.length < 120 &&
      /\bseat\b|\bseats\b/i.test(text)
    if (looksLikeWard) {
      flush()
      currentWard = boldText.replace(/\(.*\)/, '').trim()
      buffer = []
    }
    if (currentWard) buffer.push(el)
  })
  flush()

  // Fallback: scan all ward tables by caption or nearby label
  content.find('table').each((_, tableEl) => {
    const table = $(tableEl)
    const parsed = parseWikipediaWardTable($, table)
    if (!parsed) return

    let wardName = table.find('caption').first().text().replace(/\(.*\)/, '').trim()
    if (!wardName) {
      // look at preceding siblings for a bold/strong label
      const prev = table.prevAll('p').first()
      const strong = prev.find('b, strong').first().text().replace(/\(.*\)/, '').trim()
      if (strong) wardName = strong
    }
    if (!wardName) {
      // look for nearest heading above
      const head = table.prevAll('h4, h3').first().find('.mw-headline')
      wardName = head.text().replace(/\(.*\)/, '').trim()
    }
    if (!wardName) return
    rows.push({ wardName, ladName, ...parsed })
  })

  return rows
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
    await ensureGeojson(cedPath, CED_GEOJSON_URL)
  }
  const wardData = new Map()
  let wardGeo = null
  const ladToCounty = await buildLadToCountyLookup()
  const countyNameLookup = ladToCounty.names || new Map()
  const wardToLad = await buildWardToLadLookup()
  const councilSeats = await buildCouncilSeatsLookup()
  const ladGeo = skipGeo ? null : JSON.parse(await fsp.readFile(ladPath, 'utf8'))
  let countyGeo = null
  if (!skipGeo && fs.existsSync(countyPath)) {
    try {
      countyGeo = JSON.parse(await fsp.readFile(countyPath, 'utf8'))
    } catch (error) {
      console.warn(`Ignoring invalid county GeoJSON at ${countyPath}: ${error.message}`)
    }
  } else if (!skipGeo && ladGeo?.features) {
    const grouped = new Map()
    ladGeo.features.forEach(feature => {
      const ladCode = feature.properties?.reference || feature.properties?.LAD23CD
      const countyCode = ladToCounty.get(ladCode)
      const countyName = countyNameLookup.get(countyCode)
      if (!countyCode || !countyName || !COUNTY_ELECTIONS_2026.has(normalize(countyName))) return
      const entry =
        grouped.get(countyCode) ||
        {
          type: 'Feature',
          properties: { reference: countyCode, name: countyName },
          geometry: { type: 'MultiPolygon', coordinates: [] },
        }
      if (feature.geometry?.type === 'Polygon') {
        entry.geometry.coordinates.push(feature.geometry.coordinates)
      } else if (feature.geometry?.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(coords => entry.geometry.coordinates.push(coords))
      }
      grouped.set(countyCode, entry)
    })
    countyGeo = {
      type: 'FeatureCollection',
      features: [...grouped.values()],
    }
  }
  if (!skipGeo && !countyGeo && ladGeo?.features) {
    const grouped = new Map()
    ladGeo.features.forEach(feature => {
      const ladCode = feature.properties?.reference || feature.properties?.LAD23CD
      const countyCode = ladToCounty.get(ladCode)
      const countyName = countyNameLookup.get(countyCode)
      if (!countyCode || !countyName || !COUNTY_ELECTIONS_2026.has(normalize(countyName))) return
      const entry =
        grouped.get(countyCode) ||
        {
          type: 'Feature',
          properties: { reference: countyCode, name: countyName },
          geometry: { type: 'MultiPolygon', coordinates: [] },
        }
      if (feature.geometry?.type === 'Polygon') {
        entry.geometry.coordinates.push(feature.geometry.coordinates)
      } else if (feature.geometry?.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(coords => entry.geometry.coordinates.push(coords))
      }
      grouped.set(countyCode, entry)
    })
    countyGeo = {
      type: 'FeatureCollection',
      features: [...grouped.values()],
    }
  }
  const cedGeo = skipGeo ? null : JSON.parse(await fsp.readFile(cedPath, 'utf8'))
  if (fs.existsSync(wardPath)) {
    wardGeo = JSON.parse(await fsp.readFile(wardPath, 'utf8'))
    if (!wardGeo || wardGeo.type !== 'FeatureCollection' || !Array.isArray(wardGeo.features)) {
      throw new Error(
        `Ward GeoJSON is invalid. Please re-download wards.geojson (current file: ${wardPath}).`
      )
    }
  }
  if (wardGeo) {
    wardGeo.features = wardGeo.features.map(feature => {
      const props = feature.properties || {}
      if (!props.reference && (props.WD25CD || props.WD23CD)) {
        props.reference = props.WD25CD || props.WD23CD
      }
      if (!props.name && (props.WD25NM || props.WD23NM)) {
        props.name = props.WD25NM || props.WD23NM
      }
      if (!props.LAD23CD && props.WD23CD && wardToLad?.has(props.WD23CD)) {
        const entry = wardToLad.get(props.WD23CD)
        props.LAD23CD = entry.lad
        if (!props.LAD23NM && entry.ladName) props.LAD23NM = entry.ladName
      }
      if (!props.ladCode && props.LAD23CD) props.ladCode = props.LAD23CD
      if (!props.ladName && props.LAD23NM) props.ladName = props.LAD23NM
      feature.properties = props
      return feature
    })
    if (skipGeo) {
      await fsp.writeFile(path.join(OUT_DIR, 'wards.geojson'), JSON.stringify(wardGeo))
    }
  }

  if (!skipGeo && countyGeo && cedGeo) {
    countyGeo.features = countyGeo.features.map(feature => {
      const props = feature.properties || {}
      if (!props.reference && (props.CTYUA23CD || props.CTYUA24CD || props.CTY24CD)) {
        props.reference = props.CTYUA23CD || props.CTYUA24CD || props.CTY24CD
      }
      if (!props.name && (props.CTYUA23NM || props.CTYUA24NM || props.CTY24NM)) {
        props.name = props.CTYUA23NM || props.CTYUA24NM || props.CTY24NM
      }
      feature.properties = props
      return feature
    })

    cedGeo.features = cedGeo.features.map(feature => {
      const props = feature.properties || {}
      if (!props.reference && (props.CED25CD || props.CED24CD || props.CED23CD)) {
        props.reference = props.CED25CD || props.CED24CD || props.CED23CD
      }
      if (!props.name && (props.CED25NM || props.CED24NM || props.CED23NM)) {
        props.name = props.CED25NM || props.CED24NM || props.CED23NM
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
  const countyNameByCode = new Map()
  const countyCodeByName = new Map()
  if (countyGeo?.features) {
    countyGeo.features.forEach(feature => {
      const code = feature.properties?.reference
      const name = feature.properties?.name
      if (code && name) {
        countyNameByCode.set(code, name)
        countyCodeByName.set(normalize(name), code)
      }
    })
  }
  const wardGeoCodes = wardGeo
    ? new Set(wardGeo.features.map(feature => feature.properties?.reference))
    : new Set()
  const cedGeoCodes = cedGeo
    ? new Set(cedGeo.features.map(feature => feature.properties?.reference))
    : new Set()
  const areaGeoCodes = new Set([...wardGeoCodes, ...cedGeoCodes])
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

    if (!areaGeoCodes.has(wardCode)) {
      const mapped = wardCodeCrosswalk.get(wardCode)
      if (mapped) wardCode = mapped
    }

    if (!areaGeoCodes.has(wardCode) && wardToLad?.byName) {
      const key = `${normalize(ladName)}|${normalize(wardName)}`
      const match = wardToLad.byName.get(key)
      if (match && match.ward) {
        wardCode = match.ward
      }
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
        vacancies: 0,
      })
    }

    const record = wardData.get(key)
    if (!record || record.lastYear !== year) return

    const totalVotes = Number(String(row.totalVotes || '').replace(/[^0-9]/g, '')) || 0
    record.totalVotes += totalVotes
    const vacancies = Number(String(row.vacancies || '').replace(/[^0-9]/g, '')) || 0
    if (vacancies > record.vacancies) record.vacancies = vacancies

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

  if (wardToLad?.byName) {
    const byName = new Map(wardToLad.byName)
    const cedByName = new Map()
    if (cedGeo?.features) {
      cedGeo.features.forEach(feature => {
        const code = feature.properties?.reference
        const wardName = feature.properties?.name
        if (!code || !wardName) return
        const key = normalize(wardName)
        const matches = cedByName.get(key) || []
        matches.push({
          ward: code,
          wardName,
        })
        cedByName.set(key, matches)
      })
    }
    if (cedGeo?.features) {
      cedGeo.features.forEach(feature => {
        const code = feature.properties?.reference
        const wardName = feature.properties?.name
        const countyCode = feature.properties?.county
        const countyName = countyNameByCode.get(countyCode)
        if (!code || !wardName || !countyCode || !countyName) return
        const key = `${normalize(countyName)}|${normalize(wardName)}`
        byName.set(key, {
          ward: code,
          lad: countyCode,
          ladName: countyName,
          wardName,
        })
      })
    }
    const wardIndexCache = new Map()
    const getWardNameIndex = ladName => {
      const key = normalize(ladName)
      if (wardIndexCache.has(key)) return wardIndexCache.get(key)
      const index = new Map()
      byName.forEach(value => {
        if (normalize(value.ladName) === key) {
          index.set(normalize(value.wardName), value)
        }
      })
      wardIndexCache.set(key, index)
      return index
    }
    const applyWardRows = (rows, year, allowOverwrite = true) => {
      rows.forEach(row => {
        const key = `${normalize(row.ladName)}|${normalize(row.wardName)}`
        const index = getWardNameIndex(row.ladName)
        let match = byName.get(key) || index.get(normalize(row.wardName))
        if (!match && COUNTY_ELECTIONS_2026.has(normalize(row.ladName))) {
          const countyCode = countyCodeByName.get(normalize(row.ladName))
          const cedMatches = cedByName.get(normalize(row.wardName)) || []
          if (countyCode && cedMatches.length === 1) {
            match = {
              ladName: row.ladName,
              lad: countyCode,
              wardName: cedMatches[0].wardName,
              ward: cedMatches[0].ward,
            }
          }
        }
        if (!match) return
        upsertWardRow(
          {
            ladName: match.ladName,
            ladCode: match.lad,
            wardName: match.wardName,
            wardCode: match.ward,
            totalVotes: row.totalVotes,
            partyVotes: row.partyVotes,
          },
          year,
          allowOverwrite
        )
      })
    }
    const birminghamRows = await fetchBirminghamWardResults()
    applyWardRows(birminghamRows, 2022)

    const huntingdonshireRows = await fetchHuntingdonshireWardResults()
    applyWardRows(huntingdonshireRows, 2022)

    const wikipediaCovered = new Set()
    for (const page of WIKIPEDIA_WARD_PAGES) {
      let wikiRows = []
      for (const url of page.urls) {
        wikiRows = await fetchWikipediaWardResults(url, page.ladName)
        if (wikiRows.length) break
      }
      if (wikiRows.length) {
        applyWardRows(wikiRows, page.year || 2022, false)
        wikipediaCovered.add(normalize(page.ladName))
      } else {
        console.warn(`Wikipedia ward results empty for ${page.ladName}`)
      }
    }

    if (!wikipediaCovered.has(normalize('South Cambridgeshire'))) {
      const southCambsRows = await fetchSouthCambridgeshireWardResults()
      applyWardRows(southCambsRows, 2022)
    }

    if (!wikipediaCovered.has(normalize('Newcastle-under-Lyme'))) {
      const tealeNewcastle = await fetchTealeWardResults(326, 'Newcastle-under-Lyme')
      applyWardRows(tealeNewcastle, 2022)
    }

    if (!wikipediaCovered.has(normalize('South Cambridgeshire'))) {
      const tealeSouthCambs = await fetchTealeWardResults(144, 'South Cambridgeshire')
      applyWardRows(tealeSouthCambs, 2022)
    }
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
      vacancies: record.vacancies || 0,
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
    baselineNationalByYear: BASELINE_NATIONAL_BY_YEAR,
    wards: baseline,
  }

  await fsp.writeFile(
    path.join(OUT_DIR, 'ward-baseline.json'),
    JSON.stringify(output)
  )
  await fsp.writeFile(
    path.join(OUT_DIR, 'council-seats.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), councils: councilSeats })
  )
  const councilPrevious = await buildCouncilPreviousSeats(councilSeats)
  await fsp.writeFile(
    path.join(OUT_DIR, 'council-previous.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), councils: councilPrevious })
  )

  const leaveShare = await buildLeaveShare(baseline, wardGeoCodes, wardGeo, cedGeo, ladGeo, ladToCounty)
  if (leaveShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'leave-share.json'),
      JSON.stringify(leaveShare)
    )
  }

  const ageShare = await buildAgeShare(baseline)
  if (ageShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'age-share.json'),
      JSON.stringify(ageShare)
    )
    const nameMatched = []
    baseline.forEach(ward => {
      if (ageShare.wards?.[ward.wardCode]) return
      const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
      if (ageShare.wardNames?.[nameKey]) {
        const match = ageShare.wardNames[nameKey]
        nameMatched.push({
          wardCode: ward.wardCode,
          wardName: ward.wardName,
          ladCode: ward.ladCode,
          ladName: ward.ladName,
          matchedWardCode: match.wardCode,
          matchedWardName: match.wardName,
          matchMethod: 'lad+ward',
        })
        return
      }
      const nameOnlyKey = normalize(ward.wardName)
      if (ageShare.wardNamesOnly?.[nameOnlyKey]) {
        const match = ageShare.wardNamesOnly[nameOnlyKey]
        nameMatched.push({
          wardCode: ward.wardCode,
          wardName: ward.wardName,
          ladCode: ward.ladCode,
          ladName: ward.ladName,
          matchedWardCode: match.wardCode,
          matchedWardName: match.wardName,
          matchMethod: 'name-only',
        })
        return
      }
      if (ageShare.wardNamesAggressive?.[nameOnlyKey]) {
        const match = ageShare.wardNamesAggressive[nameOnlyKey]
        nameMatched.push({
          wardCode: ward.wardCode,
          wardName: ward.wardName,
          ladCode: ward.ladCode,
          ladName: ward.ladName,
          matchedWardCode: match.wardCode,
          matchedWardName: match.wardName,
          matchMethod: 'name-aggressive',
        })
      }
    })
    const sortedMatches = nameMatched.sort((a, b) => {
      const ladCompare = a.ladName.localeCompare(b.ladName)
      if (ladCompare) return ladCompare
      return a.wardName.localeCompare(b.wardName)
    })
    await fsp.writeFile(
      path.join(OUT_DIR, 'age-name-matches.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), matches: sortedMatches })
    )
    const missingByLad = {}
    baseline.forEach(ward => {
      if (ageShare.wards?.[ward.wardCode]) return
      const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
      if (ageShare.wardNames?.[nameKey]) return
      const nameOnlyKey = normalize(ward.wardName)
      if (ageShare.wardNamesOnly?.[nameOnlyKey]) return
      if (ageShare.wardNamesAggressive?.[nameOnlyKey]) return
      const ladName = ward.ladName || 'Unknown'
      if (!missingByLad[ladName]) missingByLad[ladName] = []
      missingByLad[ladName].push({
        wardCode: ward.wardCode,
        wardName: ward.wardName,
        ladCode: ward.ladCode,
      })
    })
    const sorted = Object.fromEntries(
      Object.entries(missingByLad)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ladName, wards]) => [
          ladName,
          wards.sort((a, b) => a.wardName.localeCompare(b.wardName)),
        ])
    )
    await fsp.writeFile(
      path.join(OUT_DIR, 'age-missing.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), missingByLad: sorted })
    )
  }

  const nssecShare = await buildNssecShare(baseline)
  if (nssecShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'nssec-share.json'),
      JSON.stringify(nssecShare)
    )
    const missingByLad = {}
    baseline.forEach(ward => {
      if (nssecShare.wards?.[ward.wardCode]) return
      const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
      if (nssecShare.wardNames?.[nameKey]) return
      const nameOnlyKey = normalize(ward.wardName)
      if (nssecShare.wardNamesOnly?.[nameOnlyKey]) return
      if (nssecShare.wardNamesAggressive?.[nameOnlyKey]) return
      const ladName = ward.ladName || 'Unknown'
      if (!missingByLad[ladName]) missingByLad[ladName] = []
      missingByLad[ladName].push({
        wardCode: ward.wardCode,
        wardName: ward.wardName,
        ladCode: ward.ladCode,
      })
    })
    const sorted = Object.fromEntries(
      Object.entries(missingByLad)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ladName, wards]) => [
          ladName,
          wards.sort((a, b) => a.wardName.localeCompare(b.wardName)),
        ])
    )
    await fsp.writeFile(
      path.join(OUT_DIR, 'nssec-missing.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), missingByLad: sorted })
    )
  }

  const degreeShare = await buildDegreeShare(baseline)
  if (degreeShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'degree-share.json'),
      JSON.stringify(degreeShare)
    )
    const missingByLad = {}
    baseline.forEach(ward => {
      if (degreeShare.wards?.[ward.wardCode]) return
      const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
      if (degreeShare.wardNames?.[nameKey]) return
      const nameOnlyKey = normalize(ward.wardName)
      if (degreeShare.wardNamesOnly?.[nameOnlyKey]) return
      if (degreeShare.wardNamesAggressive?.[nameOnlyKey]) return
      const ladName = ward.ladName || 'Unknown'
      if (!missingByLad[ladName]) missingByLad[ladName] = []
      missingByLad[ladName].push({
        wardCode: ward.wardCode,
        wardName: ward.wardName,
        ladCode: ward.ladCode,
      })
    })
    const sorted = Object.fromEntries(
      Object.entries(missingByLad)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ladName, wards]) => [
          ladName,
          wards.sort((a, b) => a.wardName.localeCompare(b.wardName)),
        ])
    )
    await fsp.writeFile(
      path.join(OUT_DIR, 'degree-missing.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), missingByLad: sorted })
    )
  }

  const tenureShare = await buildTenureShare(baseline)
  if (tenureShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'tenure-share.json'),
      JSON.stringify(tenureShare)
    )
  }

  const ruralUrbanShare = await buildRuralUrbanShare(baseline)
  if (ruralUrbanShare) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'rural-urban-share.json'),
      JSON.stringify(ruralUrbanShare)
    )
  }

  const ladRegion = await buildLadRegionMap(baseline)
  if (ladRegion) {
    await fsp.writeFile(
      path.join(OUT_DIR, 'lad-region.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        lads: ladRegion.lads,
        regions: ladRegion.regions,
      })
    )
    await fsp.writeFile(
      path.join(OUT_DIR, 'lad-region-missing.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        missing: ladRegion.missing,
      })
    )
  }

  const outputLadGeo = skipGeo
    ? JSON.parse(await fsp.readFile(path.join(OUT_DIR, 'lads.geojson'), 'utf8'))
    : ladGeo

  outputLadGeo.features = outputLadGeo.features.map(feature => {
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
  }

  const wardCodes = new Set(baseline.map(entry => entry.wardCode))
  if (!skipGeo && wardGeo) {
    wardGeo.features = wardGeo.features.filter(feature =>
      wardCodes.has(feature.properties?.reference)
    )
  }
  if (!skipGeo && cedGeo) {
    const baselineByCode = new Map(baseline.map(entry => [entry.wardCode, entry]))
    cedGeo.features = cedGeo.features
      .filter(feature => wardCodes.has(feature.properties?.reference))
      .map(feature => {
        const props = feature.properties || {}
        const row = baselineByCode.get(props.reference)
        if (row) {
          props.ladCode = row.ladCode
          props.ladName = row.ladName
        }
        feature.properties = props
        return feature
      })
  }

  const ladCodes = new Set(baseline.map(entry => entry.ladCode))
  const ladGeoCodes = new Set(outputLadGeo.features.map(feature => feature.properties?.reference))
  outputLadGeo.features = outputLadGeo.features.filter(feature =>
    ladCodes.has(feature.properties?.reference)
  )

  if (!skipGeo) {
  if (!skipGeo && wardGeo) {
    await fsp.writeFile(path.join(OUT_DIR, 'wards.geojson'), JSON.stringify(wardGeo))
  }
    await fsp.writeFile(path.join(OUT_DIR, 'lads.geojson'), JSON.stringify(outputLadGeo))
    await fsp.writeFile(path.join(OUT_DIR, 'counties.geojson'), JSON.stringify(countyGeo))
    await fsp.writeFile(path.join(OUT_DIR, 'ced.geojson'), JSON.stringify(cedGeo))
  }

  const ladToCountyOutput = Object.fromEntries(ladToCounty.entries())
  await fsp.writeFile(
    path.join(OUT_DIR, 'lad-to-county.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), lads: ladToCountyOutput })
  )

  await fsp.writeFile(
    path.join(OUT_DIR, 'baseline-national.json'),
    JSON.stringify({
      baselineNational,
      baselineNationalByYear: BASELINE_NATIONAL_BY_YEAR,
      totalBaselineVotes,
    })
  )

  const audit = {
    generatedAt: new Date().toISOString(),
    wardsInBaseline: baseline.length,
    wardsInGeo: wardGeoCodes.size,
    wardsMatched: wardGeo ? wardGeo.features.length : 0,
    ladsInBaseline: ladCodes.size,
    ladsInGeo: ladGeoCodes.size,
    ladsMatched: outputLadGeo.features.length,
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
