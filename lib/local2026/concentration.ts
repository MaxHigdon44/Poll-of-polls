export function getConcentrationMultiplier(party: string, baselineShare: number) {
  if (party === 'Liberal Democrat') {
    if (baselineShare >= 25) return 1.2
    if (baselineShare >= 15) return 1.1
  }
  if (party === 'Green') {
    if (baselineShare >= 20) return 1.2
    if (baselineShare >= 12) return 1.1
  }
  return 1
}
