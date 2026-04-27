import { useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/PageShell'
import { computePollWeight } from '../../lib/weights'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'

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

type AggregateSeriesRow = {
  aggregate_date: string
  labour: number | string | null
  conservative: number | string | null
  reform: number | string | null
  libdem: number | string | null
  green: number | string | null
  snp: number | string | null
  pc: number | string | null
  others: number | string | null
}

type TrendParty =
  | 'labour'
  | 'conservative'
  | 'reform'
  | 'libdem'
  | 'green'
  | 'snp'
  | 'pc'

const TREND_PARTIES: Array<{ key: TrendParty; label: string; color: string }> = [
  { key: 'labour', label: 'Labour', color: '#E4003B' },
  { key: 'conservative', label: 'Conservative', color: '#0087DC' },
  { key: 'reform', label: 'Reform', color: '#12B6CF' },
  { key: 'libdem', label: 'Liberal Democrat', color: '#FAA61A' },
  { key: 'green', label: 'Green', color: '#02A95B' },
  { key: 'snp', label: 'SNP', color: '#FDF38E' },
  { key: 'pc', label: 'Plaid Cymru', color: '#008672' },
]

function normalizeSeriesValue(value: number | string | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPercentTick(value: number): string {
  return Number.isInteger(value) ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`
}

export default function AggregatePage() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [aggregateSeries, setAggregateSeries] = useState<AggregateSeriesRow[]>([])
  const [pollsterFilter, setPollsterFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [minSampleSize, setMinSampleSize] = useState('')
  const [isClient, setIsClient] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<{
    party: string
    color: string
    value: number
    date: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    fetch('/api/polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
  }, [])

  useEffect(() => {
    fetch('/api/aggregate')
      .then(res => res.json())
      .then(data => setAggregateSeries(data.aggregates ?? []))
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

  const trendChart = useMemo(() => {
    const series = [...aggregateSeries]
      .filter(row => row.aggregate_date)
      .sort((a, b) => new Date(a.aggregate_date).getTime() - new Date(b.aggregate_date).getTime())
      .slice(-120)

    if (series.length < 2) return null

    const width = 960
    const height = 520
    const padding = { top: 20, right: 20, bottom: 40, left: 46 }
    const innerWidth = width - padding.left - padding.right
    const innerHeight = height - padding.top - padding.bottom

    const allValues = series.flatMap(row =>
      TREND_PARTIES.map(party => normalizeSeriesValue(row[party.key])).filter(
        (value): value is number => value != null
      )
    )

    if (allValues.length === 0) return null

    const minValue = Math.min(...allValues, 0)
    const maxValue = Math.max(...allValues, 0)
    const rangeMin = Math.max(0, Math.floor((minValue - 1) / 2.5) * 2.5)
    const rangeMax = Math.ceil((maxValue + 1) / 2.5) * 2.5
    const valueRange = Math.max(rangeMax - rangeMin, 1)

    const xForIndex = (index: number) =>
      padding.left + (index / Math.max(series.length - 1, 1)) * innerWidth
    const yForValue = (value: number) =>
      padding.top + innerHeight - ((value - rangeMin) / valueRange) * innerHeight

    const tickValues: number[] = []
    for (let value = rangeMax; value >= rangeMin; value -= 2.5) {
      tickValues.push(Number(value.toFixed(1)))
    }

    const xTickIndexes = Array.from(new Set([0, Math.floor((series.length - 1) / 2), series.length - 1]))
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
    })
    const tooltipDateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

    const lines = TREND_PARTIES.map(party => {
      const points = series
        .map((row, index) => {
          const value = normalizeSeriesValue(row[party.key])
          if (value == null) return null
          return `${xForIndex(index)},${yForValue(value)}`
        })
        .filter((point): point is string => point != null)

      return { ...party, points: points.join(' ') }
    }).filter(line => line.points)

    const pointGroups = TREND_PARTIES.map(party => ({
      ...party,
      points: series
        .map((row, index) => {
          const value = normalizeSeriesValue(row[party.key])
          if (value == null) return null
          return {
            x: xForIndex(index),
            y: yForValue(value),
            value,
            date: row.aggregate_date,
          }
        })
        .filter(
          (
            point
          ): point is {
            x: number
            y: number
            value: number
            date: string
          } => point != null
        ),
    }))

    return {
      width,
      height,
      tickValues,
      xTickIndexes,
      dateFormatter,
      tooltipDateFormatter,
      series,
      xForIndex,
      yForValue,
      lines,
      pointGroups,
    }
  }, [aggregateSeries])

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="UK National Polling Average"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card">
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
          <div className="poll-muted">No polls match the current filters.</div>
        )}
      </div>
      <div className="poll-card poll-stack poll-card--spaced">
        <div className="poll-section-title">Aggregate Trend Over Time for Major Parties</div>
        {trendChart ? (
          <>
            <div className="poll-trend-legend">
              {TREND_PARTIES.map(party => (
                <div key={party.key} className="poll-trend-legend__item">
                  <span
                    className="poll-trend-legend__swatch"
                    style={{ background: party.color }}
                  />
                  <span>{party.label}</span>
                </div>
              ))}
            </div>
            <div className="poll-trend-chart-wrap">
              <div className="poll-trend-chart-stage">
                <svg
                  viewBox={`0 0 ${trendChart.width} ${trendChart.height}`}
                  className="poll-trend-chart"
                  role="img"
                  aria-label="Aggregate trend over time for major national parties"
                >
                  {trendChart.tickValues.map(value => {
                    const y = trendChart.yForValue(value)
                    return (
                      <g key={value}>
                        <line
                          x1={42}
                          x2={trendChart.width - 20}
                          y1={y}
                          y2={y}
                          stroke="rgba(248,250,252,0.14)"
                          strokeWidth="1"
                        />
                        <text
                          x={34}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="12"
                          fill="rgba(248,250,252,0.72)"
                        >
                          {formatPercentTick(value)}
                        </text>
                      </g>
                    )
                  })}
                  {trendChart.xTickIndexes.map(index => {
                    const row = trendChart.series[index]
                    const x = trendChart.xForIndex(index)
                    return (
                      <text
                        key={row.aggregate_date}
                        x={x}
                        y={trendChart.height - 10}
                        textAnchor={index === 0 ? 'start' : index === trendChart.series.length - 1 ? 'end' : 'middle'}
                        fontSize="12"
                        fill="rgba(248,250,252,0.72)"
                      >
                        {trendChart.dateFormatter.format(new Date(row.aggregate_date))}
                      </text>
                    )
                  })}
                  {trendChart.lines.map(line => (
                    <polyline
                      key={line.key}
                      fill="none"
                      stroke={line.color}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={line.points}
                    />
                  ))}
                  {trendChart.pointGroups.map(group =>
                    group.points.map(point => (
                      <circle
                        key={`${group.key}-${point.date}`}
                        cx={point.x}
                        cy={point.y}
                        r="5.5"
                        fill={group.color}
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        tabIndex={0}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            party: group.label,
                            color: group.color,
                            value: point.value,
                            date: trendChart.tooltipDateFormatter.format(new Date(point.date)),
                            x: point.x,
                            y: point.y,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(current => (current?.date === trendChart.tooltipDateFormatter.format(new Date(point.date)) && current.party === group.label ? null : current))}
                        onFocus={() =>
                          setHoveredPoint({
                            party: group.label,
                            color: group.color,
                            value: point.value,
                            date: trendChart.tooltipDateFormatter.format(new Date(point.date)),
                            x: point.x,
                            y: point.y,
                          })
                        }
                        onBlur={() => setHoveredPoint(null)}
                      />
                    ))
                  )}
                </svg>
                {hoveredPoint ? (
                  <div
                    className="poll-trend-tooltip"
                    style={{
                      left: `min(calc(${(hoveredPoint.x / trendChart.width) * 100}% + 12px), calc(100% - 170px))`,
                      top: `max(calc(${(hoveredPoint.y / trendChart.height) * 100}% - 72px), 8px)`,
                    }}
                  >
                    <div
                      className="poll-trend-tooltip__party"
                      style={{ color: hoveredPoint.color }}
                    >
                      {hoveredPoint.party}
                    </div>
                    <div className="poll-trend-tooltip__value">{hoveredPoint.value.toFixed(1)}%</div>
                    <div className="poll-trend-tooltip__date">{hoveredPoint.date}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="poll-muted">No aggregate trend data available.</div>
        )}
      </div>
    </PageShell>
  )
}
