export const PARTY_LEAVE_REMAIN_DELTAS: Record<
  string,
  { remain: number; leave: number }
> = {
  Labour: { remain: 8.33, leave: -7.66 },
  Conservative: { remain: -1.67, leave: 5.3 },
  Reform: { remain: -14.67, leave: 19.0 },
  'Liberal Democrat': { remain: 5.0, leave: -4.33 },
  Green: { remain: 2.67, leave: -9.0 },
  SNP: { remain: 2.0, leave: -1.3 },
  'Plaid Cymru': { remain: 1.33, leave: -0.33 },
}

export const NATIONAL_LEAVE_SHARE = 0.52
export const LEAVE_EFFECT_STRENGTH = 0.6
export const LEAVE_EXPOSURE_CLAMP = 0.25

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function clampLeaveShare(leaveShare: number) {
  const diff = clamp(
    leaveShare - NATIONAL_LEAVE_SHARE,
    -LEAVE_EXPOSURE_CLAMP,
    LEAVE_EXPOSURE_CLAMP
  )
  return NATIONAL_LEAVE_SHARE + diff
}

export function getPartyLeaveAdjustment(party: string, leaveShare: number) {
  const delta = PARTY_LEAVE_REMAIN_DELTAS[party]
  if (!delta) return 0
  return delta.remain * (1 - leaveShare) + delta.leave * leaveShare
}

export function getCenteredPartyLeaveAdjustment(party: string, leaveShare: number) {
  const wardAdj = getPartyLeaveAdjustment(party, leaveShare)
  const natAdj = getPartyLeaveAdjustment(party, NATIONAL_LEAVE_SHARE)
  return wardAdj - natAdj
}
