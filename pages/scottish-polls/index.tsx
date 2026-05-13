import { useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
type Poll = {
  poll_date: string
  pollDate?: string
  poll_date_label: string | null
  pollDateLabel?: string | null
  pollster: string
  sample_size: number | null
  sampleSize?: number | null
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  others: number | null
}

function PollTable({
  title,
  polls,
  pollsterFilter,
}: {
  title: string
  polls: Poll[]
  pollsterFilter: string
}) {
  const displayedPolls = useMemo(() => {
    return polls.filter(poll => {
      if (poll.pollster === '2026 Scottish Parliament election') return false
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
  const formatPercent = (value: number | null) => (value == null ? '' : `${value.toString()}%`)
  const formatSampleSize = (value: number | null) =>
    value == null ? '' : numberFormatter.format(value)
  const formatDate = (value: string, label?: string | null) => {
    if (label) return label
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
  }

  const formatLead = (poll: Poll) => {
    const values = [
      poll.snp,
      poll.conservative,
      poll.labour,
      poll.libdem,
      poll.green,
      poll.reform,
      poll.others,
    ].filter((value): value is number => value != null)

    if (values.length < 2) return ''
    const sorted = [...values].sort((a, b) => b - a)
    return (sorted[0] - sorted[1]).toString()
  }

  const getLeadColor = (poll: Poll) => {
    const entries: Array<[string, number | null]> = [
      ['snp', poll.snp],
      ['conservative', poll.conservative],
      ['labour', poll.labour],
      ['libdem', poll.libdem],
      ['green', poll.green],
      ['reform', poll.reform],
    ]

    const valid = entries.filter(([, value]) => value != null) as Array<[string, number]>
    if (valid.length === 0) return undefined
    valid.sort((a, b) => b[1] - a[1])

    const colors: Record<string, string> = {
      snp: '#FDF38E',
      conservative: '#0087DC',
      labour: '#E4003B',
      libdem: '#FAA61A',
      green: '#02A95B',
      reform: '#12B6CF',
    }

    return colors[valid[0][0]]
  }

  return (
    <div className="poll-card poll-stack">
      <div className="poll-section-title">{title}</div>
      <div className="poll-table-wrap">
        <table className="poll-data-table">
          <thead>
            <tr>
              <th rowSpan={2}>Date Conducted</th>
              <th rowSpan={2}>Pollster</th>
              <th rowSpan={2}>Sample Size</th>
              <th>SNP</th>
              <th>Con</th>
              <th>Lab</th>
              <th>LD</th>
              <th>Grn</th>
              <th>Ref</th>
              <th rowSpan={2}>Other</th>
              <th rowSpan={2}>Lead</th>
            </tr>
            <tr>
              <th style={{ padding: 0, background: '#FDF38E', height: '18px' }} />
              <th style={{ padding: 0, background: '#0087DC', height: '18px' }} />
              <th style={{ padding: 0, background: '#E4003B', height: '18px' }} />
              <th style={{ padding: 0, background: '#FAA61A', height: '18px' }} />
              <th style={{ padding: 0, background: '#02A95B', height: '18px' }} />
              <th style={{ padding: 0, background: '#12B6CF', height: '18px' }} />
            </tr>
          </thead>
          <tbody>
            {displayedPolls.map((poll, index) => {
              const pollDate = poll.poll_date ?? poll.pollDate ?? ''
              const pollDateLabel = poll.poll_date_label ?? poll.pollDateLabel
              const sampleSize = poll.sample_size ?? poll.sampleSize ?? null
              return (
                <tr key={`${title}-${index}`}>
                  <td>{formatDate(pollDate, pollDateLabel)}</td>
                  <td>{poll.pollster}</td>
                  <td>{formatSampleSize(sampleSize)}</td>
                  <td>{formatPercent(poll.snp)}</td>
                  <td>{formatPercent(poll.conservative)}</td>
                  <td>{formatPercent(poll.labour)}</td>
                  <td>{formatPercent(poll.libdem)}</td>
                  <td>{formatPercent(poll.green)}</td>
                  <td>{formatPercent(poll.reform)}</td>
                  <td>{formatPercent(poll.others)}</td>
                  <td style={{ background: getLeadColor(poll), color: '#000' }}>{formatLead(poll)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ScottishPollsPage() {
  const [constituencyPolls, setConstituencyPolls] = useState<Poll[]>([])
  const [regionalPolls, setRegionalPolls] = useState<Poll[]>([])
  const [pollsterFilter, setPollsterFilter] = useState('')

  useEffect(() => {
    fetch('/api/scottish-polls')
      .then(res => res.json())
      .then(data => {
        setConstituencyPolls(data.constituencyPolls ?? [])
        setRegionalPolls(data.regionalPolls ?? [])
      })
  }, [])

  const pollsterOptions = useMemo(() => {
    const unique = new Set<string>()
    ;[...constituencyPolls, ...regionalPolls].forEach(poll => {
      if (poll.pollster === '2026 Scottish Parliament election') return
      if (poll.pollster) unique.add(poll.pollster)
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [constituencyPolls, regionalPolls])

  return (
    <PageShell>
      <TopNav title="Poll of Polls" items={MAIN_TOPNAV_ITEMS} />
      <div className="poll-card poll-stack">
        <div className="poll-muted">Scottish Parliament poll results frozen at May 7, 2026</div>
        <div className="poll-toolbar">
          <label>
            Pollster
            <select value={pollsterFilter} onChange={event => setPollsterFilter(event.target.value)}>
              <option value="">All</option>
              {pollsterOptions.map(pollster => (
                <option key={pollster} value={pollster}>
                  {pollster}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '2.5rem', marginTop: '1rem' }}>
        <PollTable
          title="Constituency Vote"
          polls={constituencyPolls}
          pollsterFilter={pollsterFilter}
        />
        <PollTable title="Regional Vote" polls={regionalPolls} pollsterFilter={pollsterFilter} />
      </div>
      <div className="poll-note">Data sourced from Wikipedia (CC BY-SA 4.0). Frozen at May 7, 2026.</div>
    </PageShell>
  )
}
