import { useEffect, useMemo, useState } from 'react'

type Poll = {
  poll_date: string
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
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [pollsterFilter, setPollsterFilter] = useState('')
  const [minSampleSize, setMinSampleSize] = useState('')

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

  const filteredPolls = useMemo(() => {
    return polls.filter(poll => {
      if (startDate && poll.poll_date < startDate) return false
      if (endDate && poll.poll_date > endDate) return false
      if (pollsterFilter && poll.pollster !== pollsterFilter) return false
      if (minSampleSize) {
        const min = Number(minSampleSize)
        if (!Number.isNaN(min)) {
          if (poll.sample_size == null) return false
          if (poll.sample_size < min) return false
        }
      }
      return true
    })
  }, [polls, startDate, endDate, pollsterFilter, minSampleSize])

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
  const formatDate = (value: string) => {
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

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Poll-of-Polls</h1>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Start date
          <input
            type="date"
            value={startDate}
            onChange={event => setStartDate(event.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          End date
          <input
            type="date"
            value={endDate}
            onChange={event => setEndDate(event.target.value)}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Pollster
          <select
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          Min sample size
          <input
            type="number"
            min={0}
            step={1}
            placeholder="e.g. 1000"
            value={minSampleSize}
            onChange={event => setMinSampleSize(event.target.value)}
          />
        </label>
      </div>
      <table border={1} cellPadding={8} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th>Date Conducted</th>
            <th>Pollster</th>
            <th>Sample Size</th>
            <th>Labour</th>
            <th>Conservative</th>
            <th>Reform</th>
            <th>LD</th>
            <th>Grn</th>
            <th>SNP</th>
            <th>PC</th>
            <th>Other</th>
            <th>Lead</th>
          </tr>
        </thead>
        <tbody>
          {filteredPolls.map((poll, index) => (
            <tr key={index}>
              <td>{formatDate(poll.poll_date)}</td>
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
              <td>{formatLead(poll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
