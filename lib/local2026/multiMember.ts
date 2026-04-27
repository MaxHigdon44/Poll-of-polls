export function allocateProjectedSeats(
  shares: Record<string, number>,
  seatsUp: number
): Record<string, number> {
  const sorted = Object.entries(shares)
    .map(([party, value]) => ({ party, value: Number(value) }))
    .filter(entry => Number.isFinite(entry.value) && entry.value > 0)
    .sort((a, b) => b.value - a.value)

  if (!sorted.length || seatsUp <= 0) return {}

  const top = sorted[0]
  const second = sorted[1]

  if (seatsUp === 2 && second && top.value - second.value <= 2) {
    return {
      [top.party]: 1,
      [second.party]: 1,
    }
  }

  if (seatsUp === 3 && second && top.value - second.value <= 3) {
    return {
      [top.party]: 2,
      [second.party]: 1,
    }
  }

  return {
    [top.party]: seatsUp,
  }
}

export function getSeatAllocationLabel(seats: number) {
  if (seats === 1) return 'One Cllr elected'
  if (seats === 2) return 'Two Cllrs elected'
  if (seats === 3) return 'Three Cllrs elected'
  return `${seats} Cllrs elected`
}
