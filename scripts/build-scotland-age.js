const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const INPUT_PATH =
  process.env.AGE_INPUT ||
  '/Users/maxhigdon/Downloads/scottish-parliamentary-constituency-blk/QS103SC.csv'
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'scotland-age-share.json')

const wb = xlsx.readFile(INPUT_PATH, { raw: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true })
if (!rows.length) {
  throw new Error('No rows found in age CSV')
}

const header = rows[0].map(value => String(value || '').trim())
const totalIndex = header.indexOf('All people')
if (totalIndex === -1) {
  throw new Error('All people column not found in QS103SC header')
}

const ageLabels = header.slice(totalIndex + 1)

function buildAgeMap(row) {
  const ages = {}
  for (let i = 0; i < ageLabels.length; i += 1) {
    const label = ageLabels[i]
    const value = Number(String(row[totalIndex + 1 + i] || '').replace(/,/g, ''))
    ages[label] = Number.isFinite(value) ? value : 0
  }
  return ages
}

function sumRange(ages, start, end) {
  let sum = 0
  for (let age = start; age <= end; age += 1) {
    sum += ages[String(age)] || 0
  }
  return sum
}

function computeShares(ages) {
  const band16_34 = sumRange(ages, 16, 34)
  const band35_54 = sumRange(ages, 35, 54)
  const band55Plus = sumRange(ages, 55, 99) + (ages['100 and over'] || 0)
  const total16Plus = band16_34 + band35_54 + band55Plus
  if (!total16Plus) {
    return { age16_34: 0, age35_54: 0, age55_plus: 0 }
  }
  return {
    age16_34: band16_34 / total16Plus,
    age35_54: band35_54 / total16Plus,
    age55_plus: band55Plus / total16Plus,
  }
}

const constituencies = {}
let baseline = null

for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i]
  if (!row || !row.length) continue
  const code = String(row[0] || '').trim()
  if (!code) continue

  const ages = buildAgeMap(row)
  const shares = computeShares(ages)

  if (code === 'S92000003') {
    baseline = { ...shares }
  }

  if (code.startsWith('S1600')) {
    constituencies[code] = shares
  }
}

if (!baseline) {
  throw new Error('Scotland baseline (S92000003) not found in age CSV')
}

const payload = {
  meta: {
    source: 'QS103SC.csv',
    note: 'Shares are proportions of population aged 16+.',
    baseline,
  },
  constituencies,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2))
console.log('Wrote', OUTPUT_PATH)
