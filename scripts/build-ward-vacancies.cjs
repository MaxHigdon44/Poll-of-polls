const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'public/data/ward-vacancies.json')

function normalizeName(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
}

function setVacancy(target, key, value) {
  if (!key || !value) return
  target[key] = Math.max(target[key] || 0, value)
}

function buildFromWorkbook(filePath, sheetName, config, output) {
  const wb = xlsx.readFile(filePath)
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
  const header = rows[config.headerRow]
  const idx = {}
  header.forEach((cell, i) => {
    idx[String(cell)] = i
  })

  for (let i = config.dataStartRow; i < rows.length; i += 1) {
    const row = rows[i]
    const code = row[idx[config.code]]
    const wardName = row[idx[config.wardName]]
    const councilName = row[idx[config.councilName]]
    const vacancies = Number(row[idx[config.vacancies]]) || 0
    if (!code || !wardName || !councilName || !vacancies) continue
    setVacancy(output.wards, String(code), vacancies)
    setVacancy(
      output.wardNames,
      `${normalizeName(councilName)}|${normalizeName(wardName)}`,
      vacancies
    )
  }
}

function main() {
  const out = { wards: {}, wardNames: {} }

  buildFromWorkbook(
    path.join(ROOT, 'data/raw/LEH-2021.xlsx'),
    'Wards-results',
    {
      headerRow: 1,
      dataStartRow: 2,
      code: 'Ward/ED code',
      wardName: 'Ward/ED name',
      councilName: 'Local authority name',
      vacancies: 'Vacancies',
    },
    out
  )

  buildFromWorkbook(
    path.join(ROOT, 'data/raw/local-elections-2022.xlsx'),
    'Wards-results',
    {
      headerRow: 1,
      dataStartRow: 2,
      code: 'Ward code',
      wardName: 'Ward name',
      councilName: 'Local authority name',
      vacancies: 'Vacancies',
    },
    out
  )

  buildFromWorkbook(
    path.join(ROOT, 'data/raw/london-2022-wards.xlsx'),
    'Candidates',
    {
      headerRow: 0,
      dataStartRow: 1,
      code: 'WD22CD',
      wardName: 'Ward name',
      councilName: 'Borough',
      vacancies: 'Number of councillors in ward',
    },
    out
  )

  fs.writeFileSync(OUT_FILE, JSON.stringify(out))
  console.log(
    JSON.stringify(
      {
        wards: Object.keys(out.wards).length,
        wardNames: Object.keys(out.wardNames).length,
      },
      null,
      2
    )
  )
}

main()
