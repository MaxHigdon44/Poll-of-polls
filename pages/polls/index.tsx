import { useEffect, useMemo, useState } from 'react'

type Poll = {
  poll_date: string
  poll_date_label: string | null
  pollster: string
  sample_size: number | null
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsterFilter, setPollsterFilter] = useState('')

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
  }, [])


  const pollsterOptions = useMemo(() => {
    const unique = new Set<string>()
    polls.forEach(poll => {
      if (poll.pollster) unique.add(poll.pollster)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [polls])

  const displayedPolls = useMemo(() => {
    return polls.filter(poll => {
      if (pollsterFilter && poll.pollster !== pollsterFilter) return false
      return true
    })
  }, [polls, pollsterFilter])

  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const numberFormatter = new Intl.NumberFormat('en-GB')
  const formatPercent = (value: number | null) =>
    value == null ? '' : `${value.toString()}%`
  const formatSampleSize = (value: number | null) =>
    value == null ? '' : numberFormatter.format(value)
  const formatDate = (value: string, label?: string | null) => {
    if (label) return label
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
  }

  const formatLead = (poll: Poll) => {
    const values = [
      poll.labour,
      poll.conservative,
      poll.reform,
      poll.libdem,
      poll.green,
      poll.snp,
      poll.pc,
      poll.others,
    ].filter((value): value is number => value != null)

    if (values.length < 2) return ''
    const sorted = [...values].sort((a, b) => b - a)
    const lead = sorted[0] - sorted[1]
    return lead.toString()
  }

  const getLeadColor = (poll: Poll) => {
    const entries: Array<[string, number | null]> = [
      ['labour', poll.labour],
      ['conservative', poll.conservative],
      ['reform', poll.reform],
      ['libdem', poll.libdem],
      ['green', poll.green],
      ['snp', poll.snp],
      ['pc', poll.pc],
    ]

    const valid = entries.filter(([, value]) => value != null) as Array<[string, number]>
    if (valid.length === 0) return undefined

    valid.sort((a, b) => b[1] - a[1])
    const top = valid[0]?.[0]

    const colors: Record<string, string> = {
      labour: '#E4003B',
      conservative: '#0087DC',
      reform: '#12B6CF',
      libdem: '#FAA61A',
      green: '#02A95B',
      snp: '#FDF38E',
      pc: '#008672',
    }

    return top ? colors[top] : undefined
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: '1rem',
          marginBottom: '0.25rem',
        }}
      >
        <h1 style={{ margin: 0 }}>Poll of Polls</h1>
        <a href="/aggregate">UK National Polling Average</a>
        <a href="/polls">Recent UK Polls</a>
      </div>
      <div style={{ marginBottom: '1rem', color: '#555' }}>
        UK National Poll Results from the Past Two Months
      </div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <label>
          Pollster
          <select
            style={{ marginLeft: '0.5rem' }}
            value={pollsterFilter}
            onChange={event => setPollsterFilter(event.target.value)}
          >
            <option value="">All</option>
            {pollsterOptions.map(pollster => (
              <option key={pollster} value={pollster}>
                {pollster}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th rowSpan={2}>Date Conducted</th>
            <th rowSpan={2}>Pollster</th>
            <th rowSpan={2}>Sample Size</th>
            <th>Labour</th>
            <th>Conservative</th>
            <th>Reform</th>
            <th>LD</th>
            <th>Grn</th>
            <th>SNP</th>
            <th>PC</th>
            <th rowSpan={2}>Other</th>
            <th rowSpan={2}>Lead</th>
          </tr>
          <tr>
            <th style={{ padding: 0, background: '#E4003B', height: '18px' }} />
            <th style={{ padding: 0, background: '#0087DC', height: '18px' }} />
            <th style={{ padding: 0, background: '#12B6CF', height: '18px' }} />
            <th style={{ padding: 0, background: '#FAA61A', height: '18px' }} />
            <th style={{ padding: 0, background: '#02A95B', height: '18px' }} />
            <th style={{ padding: 0, background: '#FDF38E', height: '18px' }} />
            <th style={{ padding: 0, background: '#008672', height: '18px' }} />
          </tr>
        </thead>
        <tbody>
          {displayedPolls.map((poll, index) => (
            <tr key={index}>
              <td>{formatDate(poll.poll_date, poll.poll_date_label)}</td>
              <td>{poll.pollster}</td>
              <td>{formatSampleSize(poll.sample_size)}</td>
              <td>{formatPercent(poll.labour)}</td>
              <td>{formatPercent(poll.conservative)}</td>
              <td>{formatPercent(poll.reform)}</td>
              <td>{formatPercent(poll.libdem)}</td>
              <td>{formatPercent(poll.green)}</td>
              <td>{formatPercent(poll.snp)}</td>
              <td>{formatPercent(poll.pc)}</td>
              <td>{formatPercent(poll.others)}</td>
              <td style={{ background: getLeadColor(poll) }}>{formatLead(poll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: '#555' }}>
        Data sourced from Wikipedia (CC BY-SA 4.0). Updated daily.
      </div>
    </div>
  )
}
