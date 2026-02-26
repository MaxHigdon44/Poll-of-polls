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
    if (filteredPolls.length === 0) return null

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
  }, [filteredPolls])

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Poll of Polls</h1>
      <div style={{ marginBottom: '1rem', color: '#555' }}>
        UK National Poll Results from the Past Two Months
      </div>
      <div style={{ marginBottom: '1rem' }} />
      <div
        style={{
          padding: '1rem',
          border: '1px solid #ddd',
          borderRadius: '8px',
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Aggregate</div>
        {aggregate ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
              gap: '0.5rem',
              alignItems: 'center',
              fontSize: '0.95rem',
            }}
          >
            <div>Lab: {aggregate.labour?.toFixed(1) ?? '—'}</div>
            <div>Con: {aggregate.conservative?.toFixed(1) ?? '—'}</div>
            <div>Reform: {aggregate.reform?.toFixed(1) ?? '—'}</div>
            <div>LD: {aggregate.libdem?.toFixed(1) ?? '—'}</div>
            <div>Grn: {aggregate.green?.toFixed(1) ?? '—'}</div>
            <div>SNP: {aggregate.snp?.toFixed(1) ?? '—'}</div>
            <div>PC: {aggregate.pc?.toFixed(1) ?? '—'}</div>
            <div>Other: {aggregate.others?.toFixed(1) ?? '—'}</div>
            <div>Lead: {aggregate.lead || '—'}</div>
          </div>
        ) : (
          <div style={{ color: '#666' }}>No polls match the current filters.</div>
        )}
      </div>
    </div>
  )
}
