import type { NextApiRequest, NextApiResponse } from 'next'
import { scrapeScottishPolls } from '../../lib/scrapePolls'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  try {
    const { sourceUrl, constituencyPolls, regionalPolls } = await scrapeScottishPolls(90)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ sourceUrl, constituencyPolls, regionalPolls })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Failed to load Scottish polling data' })
  }
}

