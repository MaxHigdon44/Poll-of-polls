const fs = require('fs')
const path = require('path')
const ROOT = process.cwd()
const RAW_DIR = path.join(ROOT, 'data/raw')
const OUT_DIR = path.join(ROOT, 'public/data')

const GE_CSV_FILE = 'HoC-GE2024-results-by-constituency.csv'
const WARD_PCON_FILE = 'ward_to_pcon_2024.csv'
const PCON_GEOJSON_FILE = 'pcon24.geojson'
const CED_GEOJSON_FILE = 'ced.geojson'
const CED_PCON_OVERRIDES = {
  E58000988: 'E14001256',
  E58000994: 'E14001396',
}

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

function getOuterRings(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates) ? [geometry.coordinates[0]] : []
  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates) ? geometry.coordinates.map(polygon => polygon[0]).filter(Boolean) : []
  }
  return []
}

function getPolygonSets(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
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
  if (Math.abs(areaFactor) < 1e-12) {
    const total = ring.reduce(
      (acc, [x, y]) => {
        acc.x += x
        acc.y += y
        return acc
      },
      { x: 0, y: 0 }
    )
    return [total.x / ring.length, total.y / ring.length]
  }
  return [cx / (3 * areaFactor), cy / (3 * areaFactor)]
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
  const polygonSets = getPolygonSets(geometry)
  return polygonSets.some(polygon => {
    if (!Array.isArray(polygon) || polygon.length === 0) return false
    if (!pointInRing(point, polygon[0])) return false
    for (let i = 1; i < polygon.length; i += 1) {
      if (pointInRing(point, polygon[i])) return false
    }
    return true
  })
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

function pointInBBox(point, bbox) {
  return (
    point[0] >= bbox.minX &&
    point[0] <= bbox.maxX &&
    point[1] >= bbox.minY &&
    point[1] <= bbox.maxY
  )
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
  const bbox = getBBox(feature.geometry)
  const bboxCenter = [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2]
  const meanPoint = largestRing.reduce(
    (acc, [x, y]) => {
      acc.x += x
      acc.y += y
      return acc
    },
    { x: 0, y: 0 }
  )
  const ringMean = [meanPoint.x / largestRing.length, meanPoint.y / largestRing.length]
  const sampleIndexes = [
    0,
    Math.floor(largestRing.length / 4),
    Math.floor(largestRing.length / 2),
    Math.floor((largestRing.length * 3) / 4),
  ]
  const candidates = [centroid, bboxCenter, ringMean]
  sampleIndexes.forEach(index => {
    const vertex = largestRing[index]
    if (!vertex) return
    candidates.push(vertex)
    candidates.push([(centroid[0] + vertex[0]) / 2, (centroid[1] + vertex[1]) / 2])
    candidates.push([(bboxCenter[0] + vertex[0]) / 2, (bboxCenter[1] + vertex[1]) / 2])
  })
  for (const candidate of candidates) {
    if (candidate && pointInGeometry(candidate, feature.geometry)) return candidate
  }
  return largestRing[0] || null
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

async function buildCedToPcon() {
  const cedPath = path.join(OUT_DIR, CED_GEOJSON_FILE)
  const pconPath = path.join(RAW_DIR, PCON_GEOJSON_FILE)
  if (!fs.existsSync(cedPath) || !fs.existsSync(pconPath)) {
    return { cedToPcon: {}, cedNames: {}, unmatched: [] }
  }

  const cedGeo = JSON.parse(await fs.promises.readFile(cedPath, 'utf8'))
  const pconGeo = JSON.parse(await fs.promises.readFile(pconPath, 'utf8'))
  const pcons = (pconGeo.features || []).map(feature => ({
    code: feature.properties?.PCON24CD,
    bbox: getBBox(feature.geometry),
    geometry: feature.geometry,
  }))

  const cedToPcon = {}
  const cedNames = {}
  const unmatched = []

  ;(cedGeo.features || []).forEach(feature => {
    const cedCode = feature.properties?.reference || feature.properties?.CED25CD
    const cedName = feature.properties?.name || feature.properties?.CED25NM
    const ladName = feature.properties?.ladName
    if (!cedCode || !cedName) return
    const point = getRepresentativePoint(feature)
    if (!point) {
      unmatched.push(cedCode)
      return
    }
    const match = pcons.find(
      pcon => pcon.code && pointInBBox(point, pcon.bbox) && pointInGeometry(point, pcon.geometry)
    )
    const pconCode = match?.code || CED_PCON_OVERRIDES[cedCode]
    if (!pconCode) {
      unmatched.push(cedCode)
      return
    }
    cedToPcon[cedCode] = pconCode
    if (ladName) {
      const key = normalize(`${ladName}|${cedName}`)
      if (!cedNames[key]) cedNames[key] = pconCode
    }
  })

  return { cedToPcon, cedNames, unmatched }
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
  const { cedToPcon, cedNames, unmatched } = await buildCedToPcon()
  const results = await buildGe2024ByPcon()
  const missing = Array.from(new Set(Object.values(wardToPcon).filter(code => !results[code])))
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'ward-to-pcon.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), wards: wardToPcon, wardNames })
  )
  await fs.promises.writeFile(
    path.join(OUT_DIR, 'ced-to-pcon.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), ceds: cedToPcon, cedNames, unmatched })
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
  console.log(`Wrote ced-to-pcon.json (${Object.keys(cedToPcon).length}), unmatched: ${unmatched.length}`)
  console.log(`Missing constituency matches: ${missing.length}`)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
