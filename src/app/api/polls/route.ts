import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const polls = [
    { source: 'YouGov', date: '2026-02-23', party: 'Labour', percentage: 42 },
    { source: 'YouGov', date: '2026-02-23', party: 'Conservative', percentage: 38 }
  ]
  return NextResponse.json(polls)
}
