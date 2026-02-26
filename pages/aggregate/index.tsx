import { useEffect, useMemo, useState } from 'react'
import { computePollWeight } from '../../lib/weights'

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

export default function AggregatePage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsterFilter, setPollsterFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minSampleSize, setMinSampleSize] = useState('')
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
  }, [])

  useEffect(() => {
    setIsClient(true)
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
      if (pollsterFilter && poll.pollster !== pollsterFilter) return false
      if (startDate && poll.poll_date < startDate) return false
      if (endDate && poll.poll_date > endDate) return false
      if (minSampleSize) {
        const min = Number(minSampleSize)
        if (!Number.isNaN(min)) {
          if (poll.sample_size == null) return false
          if (poll.sample_size < min) return false
        }
      }
      return true
    })
  }, [polls, pollsterFilter, startDate, endDate, minSampleSize])

  const aggregate = useMemo(() => {
    if (!isClient || filteredPolls.length === 0) return null

    const now = new Date()
    const totals = {
      labour: 0,
      conservative: 0,
      reform: 0,
      libdem: 0,
      green: 0,
      snp: 0,
      pc: 0,
      others: 0,
    }
    const weights = {
      labour: 0,
      conservative: 0,
      reform: 0,
      libdem: 0,
      green: 0,
      snp: 0,
      pc: 0,
      others: 0,
    }

    filteredPolls.forEach(poll => {
      const pollDate = new Date(poll.poll_date)
      const ageDays = Math.max(0, (now.getTime() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
      const pollWeight = computePollWeight({
        ageDays,
        pollster: poll.pollster,
        sampleSize: poll.sample_size,
      })

      const add = (key: keyof typeof totals, value: number | null) => {
        if (value == null) return
        totals[key] += value * pollWeight
        weights[key] += pollWeight
      }

      add('labour', poll.labour)
      add('conservative', poll.conservative)
      add('reform', poll.reform)
      add('libdem', poll.libdem)
      add('green', poll.green)
      add('snp', poll.snp)
      add('pc', poll.pc)
      add('others', poll.others)
    })

    const agg = {
      labour: weights.labour ? totals.labour / weights.labour : null,
      conservative: weights.conservative ? totals.conservative / weights.conservative : null,
      reform: weights.reform ? totals.reform / weights.reform : null,
      libdem: weights.libdem ? totals.libdem / weights.libdem : null,
      green: weights.green ? totals.green / weights.green : null,
      snp: weights.snp ? totals.snp / weights.snp : null,
      pc: weights.pc ? totals.pc / weights.pc : null,
      others: weights.others ? totals.others / weights.others : null,
    }

    const lead = (() => {
      const entries: Array<[string, number | null]> = [
        ['Lab', agg.labour],
        ['Con', agg.conservative],
        ['Reform', agg.reform],
        ['LD', agg.libdem],
        ['Grn', agg.green],
        ['SNP', agg.snp],
        ['PC', agg.pc],
        ['Other', agg.others],
      ]

      const valid = entries.filter(([, value]) => value != null) as Array<[string, number]>
      if (valid.length < 2) return ''
      valid.sort((a, b) => b[1] - a[1])
      const [topName, topValue] = valid[0]
      const [, secondValue] = valid[1]
      const diff = topValue - secondValue
      if (diff === 0) return 'Tied'
      return `${topName} +${diff.toFixed(1)}`
    })()

    return { ...agg, lead }
  }, [filteredPolls, isClient])

  const chartData = useMemo(() => {
    if (!aggregate) return null
    const entries: Array<{ label: string; value: number | null; color: string }> = [
      { label: 'Labour', value: aggregate.labour, color: '#E4003B' },
      { label: 'Conservative', value: aggregate.conservative, color: '#0087DC' },
      { label: 'Reform', value: aggregate.reform, color: '#12B6CF' },
      { label: 'Liberal Democrat', value: aggregate.libdem, color: '#FAA61A' },
      { label: 'Green', value: aggregate.green, color: '#02A95B' },
      { label: 'SNP', value: aggregate.snp, color: '#FDF38E' },
      { label: 'Plaid Cymru', value: aggregate.pc, color: '#008672' },
      { label: 'Other', value: aggregate.others, color: '#888' },
    ]

    const sorted = [...entries].sort((a, b) => {
      const aVal = a.value ?? -1
      const bVal = b.value ?? -1
      return bVal - aVal
    })
    const maxValue = Math.max(...sorted.map(entry => entry.value ?? 0), 0)
    return { entries: sorted, maxValue }
  }, [aggregate])

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
        <a href="/polls">Recent UK National Polls</a>
      </div>
      <div style={{ marginTop: '0.9rem', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        UK National Polling Average
      </div>
      <div style={{ marginBottom: '1rem' }} />
      <div style={{ padding: '0.25rem 0' }}>
        {aggregate ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {chartData?.entries.map(entry => {
              const width =
                chartData.maxValue > 0 && entry.value != null
                  ? Math.max((entry.value / chartData.maxValue) * 100, 6)
                  : 0
              return (
                <div
                  key={entry.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr 70px',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: '12px', height: '12px', background: entry.color }} />
                    <span>{entry.label}</span>
                  </div>
                  <div
                    style={{
                      height: '12px',
                      background: '#eee',
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${width}%`,
                        background: entry.color,
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {entry.value != null ? `${entry.value.toFixed(1)}%` : '—'}
                  </div>
                </div>
              )
            })}
            <div
              style={{
                marginTop: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #eee',
                fontWeight: 600,
              }}
            >
              Lead: {aggregate.lead || '—'}
            </div>
          </div>
        ) : (
          <div style={{ color: '#666' }}>No polls match the current filters.</div>
        )}
      </div>
    </div>
  )
}
