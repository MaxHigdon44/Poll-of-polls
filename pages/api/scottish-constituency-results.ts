import type { NextApiRequest, NextApiResponse } from 'next'
import { load } from 'cheerio'

type ScottishConstituencyResult = {
  constituency: string
  region: string
  previousWinner2016: string | null
  winner2021: string | null
  msp2021: string | null
  majority: number | null
  turnout: number | null
  shares: {
    snp: number | null
    conservative: number | null
    labour: number | null
    libdem: number | null
    green: number | null
    other: number | null
  }
}

const SOURCE_URL =
  'https://en.wikipedia.org/wiki/Results_of_the_2021_Scottish_Parliament_election#Results_by_constituency'

function toNumber(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/%/g, '').trim()
  if (!cleaned || cleaned === '-') return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function cleanText(value: string) {
  const text = value.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
  return text === '-' ? null : text || null
}

function normalizePartyLabel(value: string | null) {
  if (!value) return null
  const cleaned = value.toLowerCase()
  if (cleaned === 'con') return 'Conservative'
  if (cleaned === 'lab') return 'Labour'
  if (cleaned === 'ld') return 'Liberal Democrat'
  if (cleaned === 'grn') return 'Green'
  if (cleaned === 'snp') return 'SNP'
  return value
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'PollOfPollsBot/1.0 (contact: local-dev)',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const $ = load(html)
    const heading = $('h2')
      .filter((_, el) =>
        $(el).text().replace(/\s+/g, ' ').trim().toLowerCase().includes('results by constituency')
      )
      .first()

    let table = heading.nextAll('table.wikitable').first()
    if (!table.length) {
      const wrapper = heading.closest('div.mw-heading')
      if (wrapper.length) {
        table = wrapper.nextUntil('div.mw-heading2').filter('table.wikitable').first()
      }
    }
    if (!table.length) {
      throw new Error('Could not find constituency results table')
    }

    const rows: ScottishConstituencyResult[] = []
    const rowSpans: Array<{ text: string; remaining: number }> = []
    table.find('tr').each((_, row) => {
      const cells = $(row).find('th, td').toArray()
      if (!cells.length) return
      const values: string[] = []
      let col = 0
      cells.forEach(cell => {
        while (rowSpans[col]?.remaining) {
          values[col] = rowSpans[col].text
          rowSpans[col].remaining -= 1
          col += 1
        }
        const text = cleanText($(cell).text()) || ''
        const colSpan = Number($(cell).attr('colspan') || 1)
        const rowSpan = Number($(cell).attr('rowspan') || 1)
        for (let i = 0; i < colSpan; i += 1) {
          values[col] = text
          if (rowSpan > 1) {
            rowSpans[col] = { text, remaining: rowSpan - 1 }
          }
          col += 1
        }
      })
      while (rowSpans[col]?.remaining) {
        values[col] = rowSpans[col].text
        rowSpans[col].remaining -= 1
        col += 1
      }
      const constituency = values[0] || null
      if (!constituency || constituency === 'Constituency' || constituency === 'Total') return
      if (values.length < 15) return

      // Wikipedia Results by constituency table structure:
      // 0 Constituency, 1 Region, 3 2016 winner, 5 2021 winner, 6 MSP,
      // 7 Majority, 8 Turnout, 9-14 Constituency vote share (SNP, Con, Lab, LD, Grn, Other)
      rows.push({
        constituency,
        region: values[1] || '',
        previousWinner2016: normalizePartyLabel(values[3] || null),
        winner2021: normalizePartyLabel(values[5] || null),
        msp2021: values[6] || null,
        majority: toNumber(values[7]),
        turnout: toNumber(values[8]),
        shares: {
          snp: toNumber(values[9]),
          conservative: toNumber(values[10]),
          labour: toNumber(values[11]),
          libdem: toNumber(values[12]),
          green: toNumber(values[13]),
          other: toNumber(values[14]),
        },
      })
    })

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({
      sourceUrl: SOURCE_URL,
      results: rows,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load Scottish constituency results' })
  }
}
