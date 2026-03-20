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

type AggregateHistoryRow = {
  aggregate_date: string
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

type AggregateHistoryResponse = {
  aggregates: AggregateHistoryRow[]
}

const HISTORY_SERIES = [
  { key: 'labour', label: 'Labour', color: '#E4003B' },
  { key: 'conservative', label: 'Conservative', color: '#0087DC' },
  { key: 'reform', label: 'Reform', color: '#12B6CF' },
  { key: 'libdem', label: 'Liberal Democrat', color: '#FAA61A' },
  { key: 'green', label: 'Green', color: '#02A95B' },
] as const

export default function AggregatePage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [aggregateHistory, setAggregateHistory] = useState<AggregateHistoryRow[]>([])
  const [pollsterFilter, setPollsterFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minSampleSize, setMinSampleSize] = useState('')
  const [isClient, setIsClient] = useState(false)
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))

    fetch('/api/aggregate')
      .then(res => res.json())
      .then((data: AggregateHistoryResponse) => setAggregateHistory(data.aggregates ?? []))
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

  const historyChart = useMemo(() => {
    if (!aggregateHistory.length) return null
    const series = [...aggregateHistory]
      .reverse()
      .map(row => ({
        date: new Date(row.aggregate_date),
        labour: row.labour,
        conservative: row.conservative,
        reform: row.reform,
        libdem: row.libdem,
        green: row.green,
      }))
      .filter(row => !Number.isNaN(row.date.getTime()))
    if (series.length < 2) return null

    const width = 920
    const height = 390
    const margin = { top: 28, right: 24, bottom: 84, left: 52 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom
    const values = HISTORY_SERIES.flatMap(item =>
      series.map(row => row[item.key]).filter((value): value is number => value != null)
    )
    const maxValue = Math.max(...values)
    const paddedMax = Math.min(50, Math.ceil((maxValue + 1.5) / 2) * 2)
    const yMin = 10
    const yMax = Math.max(yMin + 4, paddedMax)

    const xForIndex = (index: number) =>
      margin.left + (index / Math.max(series.length - 1, 1)) * plotWidth
    const yForValue = (value: number) =>
      margin.top + plotHeight - ((value - yMin) / Math.max(yMax - yMin, 1)) * plotHeight
    const formatDate = (date: Date) =>
      date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    const paths = HISTORY_SERIES.map(item => {
      const points = series
        .map((row, index) => {
          const value = row[item.key]
          if (value == null) return null
          return `${xForIndex(index)},${yForValue(value)}`
        })
        .filter(Boolean)
      if (points.length < 2) return null
      return { ...item, d: `M ${points.join(' L ')}` }
    }).filter(Boolean) as Array<{ key: string; label: string; color: string; d: string }>

    const yTicks: number[] = []
    for (let tick = yMin; tick <= yMax; tick += 1) {
      yTicks.push(tick)
    }

    const weeklyTickIndexes: number[] = []
    let lastTickTime = -Infinity
    series.forEach((row, index) => {
      const time = row.date.getTime()
      if (time - lastTickTime >= 7 * 24 * 60 * 60 * 1000) {
        weeklyTickIndexes.push(index)
        lastTickTime = time
      }
    })
    const points = HISTORY_SERIES.flatMap(item =>
      series.flatMap((row, index) => {
        const value = row[item.key]
        if (value == null) return []
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) return []
        return [
          {
            key: `${item.key}-${index}`,
            label: item.label,
            color: item.color,
            x: xForIndex(index),
            y: yForValue(numericValue),
            value: numericValue,
            date: row.date,
          },
        ]
      })
    )

    return {
      width,
      height,
      margin,
      yTicks,
      weeklyTickIndexes,
      series,
      paths,
      points,
      xForIndex,
      yForValue,
      formatDate,
    }
  }, [aggregateHistory])

  const hoveredPoint = useMemo(() => {
    if (!historyChart || !hoveredPointKey) return null
    return historyChart.points.find(point => point.key === hoveredPointKey) || null
  }, [historyChart, hoveredPointKey])

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
        <a href="/aggregate" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          National Polling Average
        </a>
        <a href="/polls" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          Recent UK Polls
        </a>
        <a href="/local-2026" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          May 2026 Local Elections Projections
        </a>
        <a href="/council-projections" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          Council Projections
        </a>
        <a href="/methodology" style={{ padding: '0.15rem 0.35rem', display: 'inline-block' }}>
          Methodology
        </a>
      </div>
      <div style={{ marginTop: '1.6rem', marginBottom: '1.1rem', fontSize: '1.5rem' }}>
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
      {historyChart && (
        <div style={{ marginTop: '3rem' }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Aggregate Trend Over Time for Major National Parties
          </div>
          <div
            style={{
              border: '1px solid #eee',
              borderRadius: 12,
              padding: '1rem',
              background: '#fafafa',
            }}
          >
            <svg
              viewBox={`0 0 ${historyChart.width} ${historyChart.height}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              role="img"
              aria-label="Polling trend chart"
            >
              {historyChart.yTicks.map(tick => {
                const y = historyChart.yForValue(tick)
                const isMajor = tick % 5 === 0
                return (
                  <g key={tick}>
                    <line
                      x1={historyChart.margin.left}
                      x2={historyChart.width - historyChart.margin.right}
                      y1={y}
                      y2={y}
                      stroke={isMajor ? '#d8d8d8' : '#efefef'}
                      strokeWidth={isMajor ? '1.2' : '0.8'}
                    />
                    {isMajor && (
                      <text
                        x={historyChart.margin.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#666"
                      >
                        {tick}%
                      </text>
                    )}
                  </g>
                )
              })}
              {historyChart.weeklyTickIndexes.map(index => {
                const x = historyChart.xForIndex(index)
                return (
                  <g key={index}>
                    <line
                      x1={x}
                      x2={x}
                      y1={historyChart.margin.top}
                      y2={historyChart.height - historyChart.margin.bottom}
                      stroke="#f0f0f0"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={historyChart.height - 24}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#666"
                      transform={`rotate(-35 ${x} ${historyChart.height - 24})`}
                    >
                      {historyChart.formatDate(historyChart.series[index].date)}
                    </text>
                  </g>
                )
              })}
              <line
                x1={historyChart.margin.left}
                x2={historyChart.margin.left}
                y1={historyChart.margin.top}
                y2={historyChart.height - historyChart.margin.bottom}
                stroke="#999"
                strokeWidth="1.2"
              />
              <line
                x1={historyChart.margin.left}
                x2={historyChart.width - historyChart.margin.right}
                y1={historyChart.height - historyChart.margin.bottom}
                y2={historyChart.height - historyChart.margin.bottom}
                stroke="#999"
                strokeWidth="1.2"
              />
              {historyChart.paths.map(path => (
                <path
                  key={path.key}
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {historyChart.points.map(point => (
                <circle
                  key={point.key}
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill={point.color}
                  stroke="#fff"
                  strokeWidth="1.5"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPointKey(point.key)}
                  onMouseLeave={() => setHoveredPointKey(current => (current === point.key ? null : current))}
                />
              ))}
              {hoveredPoint && (() => {
                const tooltipWidth = 144
                const tooltipHeight = 48
                const tooltipX = Math.max(
                  historyChart.margin.left,
                  Math.min(
                    hoveredPoint.x - tooltipWidth / 2,
                    historyChart.width - historyChart.margin.right - tooltipWidth
                  )
                )
                const preferredY = hoveredPoint.y - tooltipHeight - 10
                const tooltipY =
                  preferredY >= 4
                    ? preferredY
                    : Math.min(
                        hoveredPoint.y + 10,
                        historyChart.height - historyChart.margin.bottom - tooltipHeight
                      )
                return (
                  <g pointerEvents="none">
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={tooltipWidth}
                      height={tooltipHeight}
                      rx="8"
                      fill="#fff"
                      stroke="#ddd"
                    />
                    <text
                      x={tooltipX + 8}
                      y={tooltipY + 14}
                      fontSize="11"
                      fontWeight="600"
                      fill={hoveredPoint.color}
                    >
                      {hoveredPoint.label}
                    </text>
                    <text
                      x={tooltipX + 8}
                      y={tooltipY + 28}
                      fontSize="11"
                      fill="#111"
                    >
                      {hoveredPoint.value.toFixed(1)}%
                    </text>
                    <text
                      x={tooltipX + 8}
                      y={tooltipY + 42}
                      fontSize="10"
                      fill="#666"
                    >
                      {historyChart.formatDate(hoveredPoint.date)}
                    </text>
                  </g>
                )
              })()}
            </svg>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                marginTop: '2rem',
                fontSize: '0.9rem',
              }}
            >
              {HISTORY_SERIES.map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: '12px', height: '12px', background: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
