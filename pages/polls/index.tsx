import { useEffect, useState } from 'react'

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

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
  }, [])

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

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Poll-of-Polls</h1>
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
          {polls.map((poll, index) => (
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
              <td>{formatLead(poll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
