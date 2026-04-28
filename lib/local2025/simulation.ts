export const MAY_2025_COUNCILS = [
  'Cambridgeshire',
  'Derbyshire',
  'Devon',
  'Gloucestershire',
  'Hertfordshire',
  'Kent',
  'Leicestershire',
  'Lincolnshire',
  'Nottinghamshire',
  'Oxfordshire',
  'Staffordshire',
  'Warwickshire',
  'Worcestershire',
  'Doncaster',
  'Buckinghamshire',
  'Cornwall',
  'County Durham',
  'North Northamptonshire',
  'Northumberland',
  'Shropshire',
  'West Northamptonshire',
  'Wiltshire',
] as const

export const MAY_2025_COUNCIL_SET = new Set(
  MAY_2025_COUNCILS.map(name => normalizeName(name))
)

export const MAY_2025_AGGREGATE = {
  aggregate_date: '2025-05-01T00:00:00.000Z',
  labour: 20,
  conservative: 15,
  reform: 30,
  libdem: 17,
  green: 11,
  snp: 0,
  pc: 0,
  others: 7,
  lead_party: 'Reform',
  lead_value: 10,
} as const

type WardBaselineLike = {
  wardCode: string
  wardName: string
  ladCode: string
  ladName: string
  vacancies?: number
  nationalShares: Record<string, number>
  localShares: Record<string, number>
}

function normalizeName(value: string | undefined | null) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bcounty durham\b/g, 'durham')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCouncilName(name: string) {
  return normalizeName(name)
    .replace(/[^\w\s]/g, '')
    .replace(/\bcouncil\b/g, '')
    .replace(/\bdistrict\b/g, '')
    .replace(/\bborough\b/g, '')
    .replace(/\bcity\b/g, '')
    .replace(/\bcity of\b/g, '')
    .replace(/\bborough of\b/g, '')
    .replace(/\bmetropolitan\b/g, '')
    .replace(/\bunitary\b/g, '')
    .replace(/\bkingston upon hull\b/g, 'hull')
    .replace(/\bof\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapControlToParty(label: string | null) {
  if (!label) return null
  const normalized = normalizeName(label)
  if (normalized.includes('no overall control')) return null
  if (normalized === 'ind' || normalized === 'independent' || normalized === 'independents') {
    return 'Independent'
  }
  if (normalized.includes('labour')) return 'Labour'
  if (normalized.includes('conservative')) return 'Conservative'
  if (normalized.includes('liberal democrat') || normalized.includes('lib dem')) {
    return 'Liberal Democrat'
  }
  if (normalized.includes('reform')) return 'Reform'
  if (normalized.includes('green')) return 'Green'
  if (normalized.includes('snp')) return 'SNP'
  if (normalized.includes('plaid')) return 'Plaid Cymru'
  return label
}

function normalizeSeatsParty(party: string) {
  const mapped = mapControlToParty(party)
  if (!mapped) return 'No overall control'
  const known = new Set([
    'Labour',
    'Conservative',
    'Reform',
    'Liberal Democrat',
    'Green',
    'SNP',
    'Plaid Cymru',
    'Independent',
  ])
  return known.has(mapped) ? mapped : party || 'Other'
}

export function buildSyntheticCouncilSeats(
  wards: WardBaselineLike[]
): { generatedAt: string; councils: Array<{ council: string; seatsUp: number; totalSeats: number; control: string | null }> } {
  const grouped = new Map<string, WardBaselineLike[]>()
  wards.forEach(ward => {
    const normalized = normalizeCouncilName(ward.ladName)
    if (!MAY_2025_COUNCIL_SET.has(normalizeName(ward.ladName))) return
    const list = grouped.get(normalized) || []
    list.push(ward)
    grouped.set(normalized, list)
  })

  const councils = Array.from(grouped.values())
    .map(rows => {
      const seatTotals: Record<string, number> = {}
      let totalSeats = 0
      rows.forEach(ward => {
        const vacancies = Math.max(ward.vacancies || 1, 1)
        totalSeats += vacancies
        const combined = { ...ward.nationalShares, ...ward.localShares }
        let winner = 'Other'
        let top = -1
        Object.entries(combined).forEach(([party, value]) => {
          const numeric = Number(value)
          if (!Number.isFinite(numeric)) return
          if (numeric > top) {
            top = numeric
            winner = party
          }
        })
        const normalizedWinner = normalizeSeatsParty(winner)
        seatTotals[normalizedWinner] = (seatTotals[normalizedWinner] || 0) + vacancies
      })
      const majority = Math.floor(totalSeats / 2) + 1
      const controlEntry = Object.entries(seatTotals).find(([, seats]) => seats >= majority)
      return {
        council: rows[0].ladName,
        seatsUp: totalSeats,
        totalSeats,
        control: controlEntry?.[0] === 'No overall control' ? null : controlEntry?.[0] || null,
      }
    })
    .sort((a, b) => a.council.localeCompare(b.council))

  return { generatedAt: new Date().toISOString(), councils }
}

export function buildSyntheticCouncilPrevious(
  wards: WardBaselineLike[]
): { generatedAt: string; councils: Array<{ council: string; url: string; lastElection: Record<string, number>; seatsBefore: Record<string, number>; wardIncumbents: Record<string, string> }> } {
  const grouped = new Map<string, WardBaselineLike[]>()
  wards.forEach(ward => {
    if (!MAY_2025_COUNCIL_SET.has(normalizeName(ward.ladName))) return
    const normalized = normalizeCouncilName(ward.ladName)
    const list = grouped.get(normalized) || []
    list.push(ward)
    grouped.set(normalized, list)
  })

  const councils = Array.from(grouped.values())
    .map(rows => {
      const seatsBefore: Record<string, number> = {}
      const wardIncumbents: Record<string, string> = {}
      rows.forEach(ward => {
        const combined = { ...ward.nationalShares, ...ward.localShares }
        let winner = 'Other'
        let top = -1
        Object.entries(combined).forEach(([party, value]) => {
          const numeric = Number(value)
          if (!Number.isFinite(numeric)) return
          if (numeric > top) {
            top = numeric
            winner = party
          }
        })
        const normalizedWinner = normalizeSeatsParty(winner)
        const vacancies = Math.max(ward.vacancies || 1, 1)
        seatsBefore[normalizedWinner] = (seatsBefore[normalizedWinner] || 0) + vacancies
        wardIncumbents[ward.wardName] = normalizedWinner
      })
      return {
        council: rows[0].ladName,
        url: '',
        lastElection: { ...seatsBefore },
        seatsBefore,
        wardIncumbents,
      }
    })
    .sort((a, b) => a.council.localeCompare(b.council))

  return { generatedAt: new Date().toISOString(), councils }
}
