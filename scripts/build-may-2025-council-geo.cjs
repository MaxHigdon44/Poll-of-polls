const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const COUNTIES_PATH = path.join(ROOT, 'public', 'data', 'counties-all.geojson')
const WARDS_PATH = '/Users/maxhigdon/Downloads/WD_MAY_2025_UK_BGC_V2_-6160789691130864750.geojson'
const OUT_PATH = path.join(ROOT, 'public', 'data', 'may-2025-councils.geojson')

const COUNTIES = [
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
]

const UNITARIES = [
  ['Buckinghamshire', 'E06000060'],
  ['Cornwall', 'E06000052'],
  ['County Durham', 'E06000047'],
  ['North Northamptonshire', 'E06000061'],
  ['Northumberland', 'E06000057'],
  ['Shropshire', 'E06000051'],
  ['West Northamptonshire', 'E06000062'],
  ['Wiltshire', 'E06000054'],
  ['Doncaster', 'E08000017'],
]

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function flattenToMultiPolygon(features) {
  const polygons = []
  features.forEach(feature => {
    const geometry = feature.geometry
    if (!geometry) return
    if (geometry.type === 'Polygon') {
      polygons.push(geometry.coordinates)
      return
    }
    if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(coords => polygons.push(coords))
    }
  })
  return {
    type: 'MultiPolygon',
    coordinates: polygons,
  }
}

function main() {
  const counties = loadJson(COUNTIES_PATH)
  const wards = loadJson(WARDS_PATH)

  const countyFeatures = counties.features.filter(feature =>
    COUNTIES.includes(feature.properties?.name)
  )

  const unitaryFeatures = UNITARIES.map(([name, code]) => {
    const wardFeatures = wards.features.filter(feature => feature.properties?.LAD25NM === name)
    return {
      type: 'Feature',
      properties: {
        reference: code,
        name,
      },
      geometry: flattenToMultiPolygon(wardFeatures),
    }
  })

  const output = {
    type: 'FeatureCollection',
    features: [...countyFeatures, ...unitaryFeatures],
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(output))
  console.log(`Wrote ${OUT_PATH}`)
}

main()
