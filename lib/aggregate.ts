import { computePollWeight } from './weights'

type PollInput = {
  pollDate: string
  pollster: string
  sampleSize: number | null
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
}

export type AggregateResult = {
  labour: number | null
  conservative: number | null
  reform: number | null
  libdem: number | null
  green: number | null
  snp: number | null
  pc: number | null
  others: number | null
  leadParty: string | null
  leadValue: number | null
}

export function computeAggregate(polls: PollInput[], asOf: Date): AggregateResult {
  if (polls.length === 0) {
    return {
      labour: null,
      conservative: null,
      reform: null,
      libdem: null,
      green: null,
      snp: null,
      pc: null,
      others: null,
      leadParty: null,
      leadValue: null,
    }
  }

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

  polls.forEach(poll => {
    const pollDate = new Date(poll.pollDate)
    const ageDays = Math.max(0, (asOf.getTime() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
    const pollWeight = computePollWeight({
      ageDays,
      pollster: poll.pollster,
      sampleSize: poll.sampleSize,
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

  const leadEntries: Array<[string, number | null]> = [
    ['Labour', agg.labour],
    ['Conservative', agg.conservative],
    ['Reform', agg.reform],
    ['Liberal Democrat', agg.libdem],
    ['Green', agg.green],
    ['SNP', agg.snp],
    ['Plaid Cymru', agg.pc],
    ['Other', agg.others],
  ]

  const valid = leadEntries.filter(([, value]) => value != null) as Array<[string, number]>
  if (valid.length < 2) {
    return { ...agg, leadParty: null, leadValue: null }
  }

  valid.sort((a, b) => b[1] - a[1])
  const [topName, topValue] = valid[0]
  const [, secondValue] = valid[1]

  return {
    ...agg,
    leadParty: topName,
    leadValue: topValue - secondValue,
  }
}
