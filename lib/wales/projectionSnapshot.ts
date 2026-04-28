import {
  computeWelshAggregate,
  computeWelshProjectedConstituencies,
  computeWelshSeatCounts,
} from '@/pages/senedd-projection'

type WelshPoll = Parameters<typeof computeWelshAggregate>[0][number]

function toPagePoll<T extends Record<string, unknown>>(poll: T): WelshPoll {
  return {
    ...poll,
    poll_date: String(poll.poll_date ?? poll.pollDate ?? ''),
    pollster: String(poll.pollster ?? ''),
    sample_size:
      typeof poll.sample_size === 'number'
        ? poll.sample_size
        : typeof poll.sampleSize === 'number'
          ? poll.sampleSize
          : null,
    labour: typeof poll.labour === 'number' ? poll.labour : null,
    conservative: typeof poll.conservative === 'number' ? poll.conservative : null,
    reform: typeof poll.reform === 'number' ? poll.reform : null,
    libdem: typeof poll.libdem === 'number' ? poll.libdem : null,
    green: typeof poll.green === 'number' ? poll.green : null,
    pc: typeof poll.pc === 'number' ? poll.pc : null,
    others: typeof poll.others === 'number' ? poll.others : null,
  }
}

export type WalesProjectionSnapshot = {
  generatedAt: string
  projectedConstituencies: Array<{
    name: string
    seats: Record<string, number>
  }>
  seatCounts: Record<string, number>
}

type WelshProjectedConstituency = ReturnType<typeof computeWelshProjectedConstituencies>[number]

export function computeWalesProjectionSnapshot(args: {
  generatedAt: string
  polls: Array<Record<string, unknown>>
  lookup: any
  gePcon: any
  leaveLookup: any
  ageLookup: any
  tenureLookup: any
  nssecLookup: any
  degreeLookup: any
  ruralLookup: any
  wardToSenedd: any
}) {
  const projectedConstituencies = computeWelshProjectedConstituencies({
    lookup: args.lookup,
    gePcon: args.gePcon,
    aggregate: computeWelshAggregate(args.polls.map(toPagePoll)),
    leaveLookup: args.leaveLookup,
    ageLookup: args.ageLookup,
    tenureLookup: args.tenureLookup,
    nssecLookup: args.nssecLookup,
    degreeLookup: args.degreeLookup,
    ruralLookup: args.ruralLookup,
    wardToSenedd: args.wardToSenedd,
  }).map((entry: WelshProjectedConstituency) => ({
    name: entry.name,
    seats: entry.seats,
  }))

  return {
    generatedAt: args.generatedAt,
    projectedConstituencies,
    seatCounts: computeWelshSeatCounts(projectedConstituencies),
  } satisfies WalesProjectionSnapshot
}
