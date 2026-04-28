const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const AGE_SHARE_PATH = path.join(ROOT, 'public/data/age-share.json')
const BASELINE_PATH = path.join(ROOT, 'public/data/ward-baseline.json')
const OUT_PATH = path.join(ROOT, 'public/data/age-name-matches.json')

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[’']/g, '')
    .trim()
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function entryKey(entry) {
  if (!entry) return null
  const parts = [
    normalize(entry.wardName),
    Number(entry.age18_35 || 0).toFixed(8),
    Number(entry.age35_55 || 0).toFixed(8),
    Number(entry.age55_plus || 0).toFixed(8),
    Number(entry.totalPop || 0).toFixed(2),
  ]
  return parts.join('|')
}

function buildEntryIndex(wards) {
  const index = new Map()
  Object.entries(wards || {}).forEach(([code, entry]) => {
    const key = entryKey(entry)
    if (!key) return
    index.set(key, code)
  })
  return index
}

function resolveEntryCode(index, entry) {
  if (!entry) return null
  const key = entryKey(entry)
  if (!key) return null
  return index.get(key) || null
}

const ageShare = loadJson(AGE_SHARE_PATH)
const baseline = loadJson(BASELINE_PATH)

const wardIndex = buildEntryIndex(ageShare.wards || {})
const nameMatches = []

for (const ward of baseline.wards || []) {
  if (ageShare.wards?.[ward.wardCode]) continue
  const nameKey = `${normalize(ward.ladName)}|${normalize(ward.wardName)}`
  if (ageShare.wardNames?.[nameKey]) {
    const match = ageShare.wardNames[nameKey]
    nameMatches.push({
      wardCode: ward.wardCode,
      wardName: ward.wardName,
      ladCode: ward.ladCode,
      ladName: ward.ladName,
      matchedWardCode: resolveEntryCode(wardIndex, match),
      matchedWardName: match.wardName || null,
      matchMethod: 'lad+ward',
    })
    continue
  }
  const nameOnlyKey = normalize(ward.wardName)
  if (ageShare.wardNamesOnly?.[nameOnlyKey]) {
    const match = ageShare.wardNamesOnly[nameOnlyKey]
    nameMatches.push({
      wardCode: ward.wardCode,
      wardName: ward.wardName,
      ladCode: ward.ladCode,
      ladName: ward.ladName,
      matchedWardCode: resolveEntryCode(wardIndex, match),
      matchedWardName: match.wardName || null,
      matchMethod: 'name-only',
    })
    continue
  }
  if (ageShare.wardNamesAggressive?.[nameOnlyKey]) {
    const match = ageShare.wardNamesAggressive[nameOnlyKey]
    nameMatches.push({
      wardCode: ward.wardCode,
      wardName: ward.wardName,
      ladCode: ward.ladCode,
      ladName: ward.ladName,
      matchedWardCode: resolveEntryCode(wardIndex, match),
      matchedWardName: match.wardName || null,
      matchMethod: 'name-aggressive',
    })
  }
}

nameMatches.sort((a, b) => {
  const ladCompare = a.ladName.localeCompare(b.ladName)
  if (ladCompare) return ladCompare
  return a.wardName.localeCompare(b.wardName)
})

fs.writeFileSync(
  OUT_PATH,
  JSON.stringify({ generatedAt: new Date().toISOString(), matches: nameMatches })
)

console.log(`Wrote ${nameMatches.length} name-based matches to ${OUT_PATH}`)
