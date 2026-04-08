export const SCOTTISH_PARTY_LEAVE_REMAIN_DELTAS: Record<
  string,
  { remain: number; leave: number }
> = {
  SNP: { remain: 7.5, leave: -13 },
  Conservative: { remain: 0, leave: 5 },
  Labour: { remain: 3, leave: -4.5 },
  'Liberal Democrat': { remain: 1.5, leave: -2.5 },
  Green: { remain: 0, leave: 0 },
  Reform: { remain: -7.5, leave: 20 },
}

export const SCOTLAND_NATIONAL_LEAVE_SHARE = 0.38
export const SCOTLAND_LEAVE_EFFECT_STRENGTH = 0.8
export const SCOTLAND_LEAVE_EXPOSURE_CLAMP = 0.25

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clampLeaveShare(leaveShare: number) {
  const diff = clamp(
    leaveShare - SCOTLAND_NATIONAL_LEAVE_SHARE,
    -SCOTLAND_LEAVE_EXPOSURE_CLAMP,
    SCOTLAND_LEAVE_EXPOSURE_CLAMP
  )
  return SCOTLAND_NATIONAL_LEAVE_SHARE + diff
}

export function getScottishPartyLeaveAdjustment(party: string, leaveShare: number) {
  const delta = SCOTTISH_PARTY_LEAVE_REMAIN_DELTAS[party]
  if (!delta) return 0
  return delta.remain * (1 - leaveShare) + delta.leave * leaveShare
}

export function getCenteredScottishPartyLeaveAdjustment(party: string, leaveShare: number) {
  const wardAdj = getScottishPartyLeaveAdjustment(party, leaveShare)
  const natAdj = getScottishPartyLeaveAdjustment(party, SCOTLAND_NATIONAL_LEAVE_SHARE)
  return wardAdj - natAdj
}
