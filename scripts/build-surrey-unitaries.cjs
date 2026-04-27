const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RAW_WARDS = path.join(ROOT, 'data/raw/ward.geojson')
const OUT_OVERLAY = path.join(ROOT, 'public/data/surrey-unitaries-overlay.geojson')
const OUT_BOUNDARY = path.join(ROOT, 'public/data/surrey-unitaries-boundary.geojson')

const EAST_DISTRICTS = new Set([
  'Elmbridge',
  'Epsom and Ewell',
  'Mole Valley',
  'Reigate and Banstead',
  'Tandridge',
])

const WEST_DISTRICTS = new Set([
  'Waverley',
  'Guildford',
  'Woking',
  'Surrey Heath',
  'Runnymede',
  'Spelthorne',
])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function roundCoord(value) {
  return Number(value).toFixed(12)
}

function pointKey(point) {
  return `${roundCoord(point[0])},${roundCoord(point[1])}`
}

function canonicalSegment(a, b) {
  const aKey = pointKey(a)
  const bKey = pointKey(b)
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
}

function collectSegments(geometry, segmentCounts, segmentCoords) {
  if (!geometry) return
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : []

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const a = ring[i]
        const b = ring[i + 1]
        const key = canonicalSegment(a, b)
        segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1)
        if (!segmentCoords.has(key)) segmentCoords.set(key, [a, b])
      }
    }
  }
}

function buildBoundaryFeature(reference, name, features) {
  const segmentCounts = new Map()
  const segmentCoords = new Map()

  features.forEach(feature => collectSegments(feature.geometry, segmentCounts, segmentCoords))

  const coordinates = []
  for (const [key, count] of segmentCounts.entries()) {
    if (count !== 1) continue
    coordinates.push(segmentCoords.get(key))
  }

  return {
    type: 'Feature',
    properties: { reference, name },
    geometry: {
      type: 'MultiLineString',
      coordinates,
    },
  }
}

function buildOverlayFeature(reference, name, features) {
  const coordinates = []
  for (const feature of features) {
    const geometry = feature.geometry
    if (!geometry) continue
    if (geometry.type === 'Polygon') {
      coordinates.push(geometry.coordinates)
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => coordinates.push(polygon))
    }
  }

  return {
    type: 'Feature',
    properties: { reference, name },
    geometry: {
      type: 'MultiPolygon',
      coordinates,
    },
  }
}

function main() {
  const raw = readJson(RAW_WARDS)
  const eastFeatures = []
  const westFeatures = []

  for (const feature of raw.features || []) {
    const district = feature?.properties?.LAD25NM
    if (EAST_DISTRICTS.has(district)) {
      eastFeatures.push(feature)
    } else if (WEST_DISTRICTS.has(district)) {
      westFeatures.push(feature)
    }
  }

  const overlay = {
    type: 'FeatureCollection',
    features: [
      buildOverlayFeature('surrey-east', 'East Surrey', eastFeatures),
      buildOverlayFeature('surrey-west', 'West Surrey', westFeatures),
    ],
  }

  const boundary = {
    type: 'FeatureCollection',
    features: [
      buildBoundaryFeature('surrey-east', 'East Surrey', eastFeatures),
      buildBoundaryFeature('surrey-west', 'West Surrey', westFeatures),
    ],
  }

  fs.writeFileSync(OUT_OVERLAY, JSON.stringify(overlay))
  fs.writeFileSync(OUT_BOUNDARY, JSON.stringify(boundary))
  console.log(
    JSON.stringify(
      {
        overlayFeatures: overlay.features.length,
        boundaryFeatures: boundary.features.length,
        eastWardCount: eastFeatures.length,
        westWardCount: westFeatures.length,
      },
      null,
      2
    )
  )
}

main()
