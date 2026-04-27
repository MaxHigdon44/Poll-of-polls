const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const INPUT_PATH =
  process.env.TENURE_INPUT ||
  '/Users/maxhigdon/Downloads/scottish-parliamentary-constituency-blk/QS405SC.csv'
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'scotland-tenure-share.json')

function toNumber(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/,/g, '').trim()
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

const wb = xlsx.readFile(INPUT_PATH, { raw: true })
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true })
if (!rows.length) {
  throw new Error('No rows found in tenure CSV')
}
const header = rows[0].map(value => String(value || '').trim())
const idx = {
  code: 0,
  total: header.indexOf('All households'),
  owned: header.indexOf('Owned'),
  social: header.indexOf('Social rented'),
  private: header.indexOf('Private rented'),
  rentFree: header.indexOf('Living rent free'),
}

if (idx.total === -1 || idx.owned === -1 || idx.social === -1 || idx.private === -1 || idx.rentFree === -1) {
  throw new Error('Required tenure columns not found in QS405SC header')
}

const constituencies = {}
let baseline = null

for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i]
  if (!row || !row.length) continue
  const code = String(row[idx.code] || '').trim()
  if (!code) continue

  const total = toNumber(row[idx.total])
  const owned = toNumber(row[idx.owned])
  const social = toNumber(row[idx.social])
  const privateRented = toNumber(row[idx.private])
  const rentFree = toNumber(row[idx.rentFree])
  if (!total || total <= 0) continue

  const privateCombined = (privateRented || 0) + (rentFree || 0)
  const share = {
    owned: (owned || 0) / total,
    socialRented: (social || 0) / total,
    privateRented: privateCombined / total,
    totalHouseholds: total,
  }

  if (code === 'S92000003') {
    baseline = {
      owned: share.owned,
      socialRented: share.socialRented,
      privateRented: share.privateRented,
    }
  }

  constituencies[code] = share
}

if (!baseline) {
  throw new Error('Scotland baseline (S92000003) not found in tenure CSV')
}

const payload = {
  meta: {
    source: 'QS405SC.csv',
    baseline,
  },
  constituencies,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2))
console.log('Wrote', OUTPUT_PATH)
