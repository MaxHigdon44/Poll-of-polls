import { load } from 'cheerio'

export type ScrapedPoll = {
  pollDate: string
  pollster: string
  sampleSize: number | null
  area: string | null
  labour: number | null
  conservative: number | null
  libdem: number | null
  green: number | null
  reform: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

const SOURCE_URL =
  'https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election'

function parsePollDate(dateText: string, fallbackYear?: number): Date | null {
  const cleaned = dateText.replace(/\[\d+\]/g, '').trim()
  const rangeMatch = cleaned.match(
    /(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Za-z]+)\s+(\d{4})/
  )
  if (rangeMatch) {
    const firstDateStr = `${rangeMatch[1]} ${rangeMatch[2]} ${rangeMatch[3]}`
    const parsed = new Date(firstDateStr)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  if (fallbackYear) {
    const shortMatch = cleaned.match(/(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Za-z]+)/)
    if (shortMatch) {
      const firstDateStr = `${shortMatch[1]} ${shortMatch[2]} ${fallbackYear}`
      let parsed = new Date(firstDateStr)
      if (!Number.isNaN(parsed.getTime())) {
        const now = new Date()
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000
        if (parsed.getTime() > now.getTime() + oneWeekMs) {
          parsed = new Date(`${shortMatch[1]} ${shortMatch[2]} ${fallbackYear - 1}`)
        }
        return parsed
      }
    }
  }

  const firstDateStr = cleaned.split('–')[0].split('-')[0].trim()
  const parsed = new Date(firstDateStr)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function toNumber(value: string): number | null {
  const cleaned = value.replace('%', '').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function toSampleSize(value: string): number | null {
  const cleaned = value.replace(/[^0-9]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function normalizeHeader(text: string): string {
  return text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function cleanPollster(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
}

type CheerioElement = Parameters<ReturnType<typeof load>>[0]

function selectNationalYearTables($: ReturnType<typeof load>, year: number) {
  const nationalHeading = $('h2')
    .filter((_, el) => $(el).text().replace(/\s+/g, ' ').trim().includes('National poll results'))
    .first()
  if (nationalHeading.length === 0) return []

  const nationalSection = nationalHeading.nextUntil('h2')
  const yearHeading = nationalSection
    .filter(
      (_, el) =>
        $(el).is('h3, h4') &&
        $(el).text().replace(/\s+/g, ' ').trim().includes(String(year))
    )
    .first()

  if (yearHeading.length === 0) return []

  return yearHeading.nextUntil('h2, h3, h4').filter('table.wikitable').toArray()
}

function hasNationalPollHeaders(columnMap: Record<string, number>) {
  return (
    Number.isFinite(columnMap.date) &&
    Number.isFinite(columnMap.pollster) &&
    Number.isFinite(columnMap.sampleSize) &&
    Number.isFinite(columnMap.labour) &&
    Number.isFinite(columnMap.conservative) &&
    Number.isFinite(columnMap.reform) &&
    Number.isFinite(columnMap.libdem) &&
    Number.isFinite(columnMap.green)
  )
}

function buildColumnIndexMap($: ReturnType<typeof load>, table: CheerioElement) {
  const map: Record<string, number> = {}
  let headerRow = $(table).find('thead tr').last()
  if (headerRow.length === 0) {
    headerRow = $(table)
      .find('tbody tr')
      .filter((_, row) => $(row).find('th').length > 0)
      .first()
  }

  const headerCells = headerRow.find('th')
  headerCells.each((index, cell) => {
    const header = normalizeHeader($(cell).text())
    if (!header) return

    if (header.includes('date')) map.date = index
    else if (header.includes('pollster')) map.pollster = index
    else if (header.includes('sample')) map.sampleSize = index
    else if (header.includes('area')) map.area = index
    else if (header === 'lab' || header.includes('labour')) map.labour = index
    else if (header === 'con' || header.includes('conservative')) map.conservative = index
    else if (header.includes('lib') || header.includes('ld')) map.libdem = index
    else if (header.includes('reform') || header === 'ref') map.reform = index
    else if (header.includes('green') || header === 'grn') map.green = index
    else if (header.includes('snp')) map.snp = index
    else if (header.includes('pc') || header.includes('plaid')) map.pc = index
    else if (header.includes('other')) map.others = index
  })

  return map
}

export async function scrapePolls(lastMonths = 2): Promise<{
  sourceUrl: string
  polls: ScrapedPoll[]
}> {
  const response = await fetch(SOURCE_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const $ = load(html)
  const polls: ScrapedPoll[] = []

  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - lastMonths)
  const currentYear = new Date().getFullYear()

  const seen = new Set<string>()

  const candidateTables = selectNationalYearTables($, currentYear)
  const tablesToParse = candidateTables

  if (tablesToParse.length === 0) {
    return { sourceUrl: SOURCE_URL, polls }
  }

  tablesToParse.forEach(table => {
    const columnMap = buildColumnIndexMap($, table)
    if (!hasNationalPollHeaders(columnMap)) return

    $(table)
      .find('tbody tr')
      .each((_, el) => {
        const tds = $(el).find('td')
        if (tds.length === 0) return

        const dateCell = $(tds[columnMap.date])
        const dateText = dateCell.text().trim()
        const pollster = cleanPollster($(tds[columnMap.pollster]).text())
        if (!dateText || !pollster) return

        const sortValue = dateCell.attr('data-sort-value')
        const parsedDate = sortValue
          ? parsePollDate(sortValue, currentYear)
          : parsePollDate(dateText, currentYear)
        if (!parsedDate) return
        if (parsedDate.getFullYear() < currentYear) return
        if (parsedDate < cutoffDate) return

        const areaIndex = columnMap.area ?? -1
        const sampleIndex = columnMap.sampleSize ?? -1

        const poll = {
          pollDate: parsedDate.toISOString().slice(0, 10),
          pollster,
          sampleSize: sampleIndex >= 0 ? toSampleSize($(tds[sampleIndex]).text()) : null,
          area: areaIndex >= 0 ? $(tds[areaIndex]).text().trim() || null : null,
          labour: columnMap.labour != null ? toNumber($(tds[columnMap.labour]).text()) : null,
          conservative:
            columnMap.conservative != null ? toNumber($(tds[columnMap.conservative]).text()) : null,
          libdem: columnMap.libdem != null ? toNumber($(tds[columnMap.libdem]).text()) : null,
          green: columnMap.green != null ? toNumber($(tds[columnMap.green]).text()) : null,
          reform: columnMap.reform != null ? toNumber($(tds[columnMap.reform]).text()) : null,
          snp: columnMap.snp != null ? toNumber($(tds[columnMap.snp]).text()) : null,
          pc: columnMap.pc != null ? toNumber($(tds[columnMap.pc]).text()) : null,
          others: columnMap.others != null ? toNumber($(tds[columnMap.others]).text()) : null,
        }

        const hasPartyData =
          poll.labour != null ||
          poll.conservative != null ||
          poll.libdem != null ||
          poll.green != null ||
          poll.reform != null ||
          poll.snp != null ||
          poll.pc != null ||
          poll.others != null

        if (!hasPartyData) return

        const dedupeKey = [
          poll.pollDate,
          poll.pollster,
          poll.sampleSize ?? '',
          poll.area ?? '',
          poll.labour ?? '',
          poll.conservative ?? '',
          poll.libdem ?? '',
          poll.green ?? '',
          poll.reform ?? '',
          poll.snp ?? '',
          poll.pc ?? '',
          poll.others ?? '',
        ].join('|')

        if (seen.has(dedupeKey)) return
        seen.add(dedupeKey)

        polls.push(poll)
      })
  })

  return { sourceUrl: SOURCE_URL, polls }
}
