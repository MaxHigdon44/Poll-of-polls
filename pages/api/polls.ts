import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const polls = [
    { source: 'YouGov', date: '2026-02-23', party: 'Labour', percentage: 42 },
    { source: 'YouGov', date: '2026-02-23', party: 'Conservative', percentage: 38 }
  ]
  res.status(200).json(polls)
}
