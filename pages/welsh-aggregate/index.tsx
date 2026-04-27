import { useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { computePollsterWeight, computeSampleWeight } from '../../lib/weights'

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
  pc: number | null
  others: number | null
}

function computeWelshRecencyWeight(ageDays: number) {
  if (ageDays < 10) return 1
  if (ageDays < 20) return 0.75
  if (ageDays < 40) return 0.5
  if (ageDays < 60) return 0.25
  return 0.1
}

function computeWelshPollWeight(poll: Poll) {
  const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
  const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
  return (
    computeWelshRecencyWeight(ageDays) *
    computePollsterWeight(poll.pollster) *
    computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
  )
}

function computeAggregate(polls: Poll[]) {
  if (polls.length === 0) return null

  const totals = {
    labour: 0,
    conservative: 0,
    pc: 0,
    libdem: 0,
    green: 0,
    reform: 0,
    others: 0,
  }
  const weights = { ...totals }

  const add = (key: keyof typeof totals, value: number | null, weight: number) => {
    if (value == null) return
    totals[key] += value * weight
    weights[key] += weight
  }

  polls.forEach(poll => {
    const weight = computeWelshPollWeight(poll)
    add('labour', poll.labour, weight)
    add('conservative', poll.conservative, weight)
    add('pc', poll.pc, weight)
    add('libdem', poll.libdem, weight)
    add('green', poll.green, weight)
    add('reform', poll.reform, weight)
    add('others', poll.others, weight)
  })

  const result = {
    labour: weights.labour ? totals.labour / weights.labour : null,
    conservative: weights.conservative ? totals.conservative / weights.conservative : null,
    pc: weights.pc ? totals.pc / weights.pc : null,
    libdem: weights.libdem ? totals.libdem / weights.libdem : null,
    green: weights.green ? totals.green / weights.green : null,
    reform: weights.reform ? totals.reform / weights.reform : null,
    others: weights.others ? totals.others / weights.others : null,
  }

  const valid = [
    ['Labour', result.labour],
    ['Conservative', result.conservative],
    ['Plaid Cymru', result.pc],
    ['Liberal Democrat', result.libdem],
    ['Green', result.green],
    ['Reform', result.reform],
    ['Other', result.others],
  ].filter(([, value]) => value != null) as Array<[string, number]>

  if (valid.length < 2) return { ...result, lead: null as string | null }
  valid.sort((a, b) => b[1] - a[1])
  return { ...result, lead: `${valid[0][0]} +${(valid[0][1] - valid[1][1]).toFixed(1)}` }
}

function AggregateCard({ title, aggregate }: { title: string; aggregate: ReturnType<typeof computeAggregate> }) {
  const entries = useMemo(() => {
    if (!aggregate) return null
    const rows = [
      { label: 'Labour', value: aggregate.labour, color: '#E4003B' },
      { label: 'Conservative', value: aggregate.conservative, color: '#0087DC' },
      { label: 'Plaid Cymru', value: aggregate.pc, color: '#008672' },
      { label: 'Liberal Democrat', value: aggregate.libdem, color: '#FAA61A' },
      { label: 'Green', value: aggregate.green, color: '#02A95B' },
      { label: 'Reform', value: aggregate.reform, color: '#12B6CF' },
      { label: 'Other', value: aggregate.others, color: '#888' },
    ].sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
    const maxValue = Math.max(...rows.map(row => row.value ?? 0), 0)
    return { rows, maxValue }
  }, [aggregate])

  return (
    <div className="poll-card">
      <div className="poll-section-title">{title}</div>
      {aggregate && entries ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {entries.rows.map(entry => {
            const width =
              entries.maxValue > 0 && entry.value != null
                ? Math.max((entry.value / entries.maxValue) * 100, 6)
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
        <div className="poll-muted">No polls available.</div>
      )}
    </div>
  )
}

export default function WelshAggregatePage() {
  const [polls, setPolls] = useState<Poll[]>([])

  useEffect(() => {
    fetch('/api/welsh-polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
  }, [])

  const aggregate = useMemo(() => computeAggregate(polls), [polls])

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Senedd Polling Average"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <AggregateCard title="Welsh Voting Average" aggregate={aggregate} />
      <div className="poll-note">Data sourced from Wikipedia (CC BY-SA 4.0). Updated on request.</div>
    </PageShell>
  )
}
