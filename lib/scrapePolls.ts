import { load } from 'cheerio'

export type ScrapedPoll = {
  pollDate: string
  pollster: string
  area: string | null
  labour: number | null
  conservative: number | null
  libdem: number | null
  green: number | null
  reform: number | null
  others: number | null
}

const SOURCE_URL =
  'https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election'

function parsePollDate(dateText: string): Date | null {
  const cleaned = dateText.replace(/\[\d+\]/g, '').trim()
  const rangeMatch = cleaned.match(
    /(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Za-z]+)\s+(\d{4})/
  )
  if (rangeMatch) {
    const firstDateStr = `${rangeMatch[1]} ${rangeMatch[2]} ${rangeMatch[3]}`
    const parsed = new Date(firstDateStr)
    if (!Number.isNaN(parsed.getTime())) return parsed
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

  $('table.wikitable tbody tr').each((_, el) => {
    const tds = $(el).find('td')
    if (tds.length < 11) return

    const dateText = $(tds[0]).text().trim()
    const pollster = $(tds[1]).text().trim()
    const area = $(tds[2]).text().trim()

    const parsedDate = parsePollDate(dateText)
    if (!parsedDate) return
    if (parsedDate < cutoffDate) return

    polls.push({
      pollDate: parsedDate.toISOString().slice(0, 10),
      pollster,
      area: area || null,
      labour: toNumber($(tds[5]).text()),
      conservative: toNumber($(tds[6]).text()),
      libdem: toNumber($(tds[7]).text()),
      green: toNumber($(tds[8]).text()),
      reform: toNumber($(tds[9]).text()),
      others: toNumber($(tds[10]).text()),
    })
  })

  return { sourceUrl: SOURCE_URL, polls }
}
