import { useEffect, useMemo, useState } from 'react'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { computePollsterWeight, computeSampleWeight } from '../../lib/weights'
import { getPartyLeaveAdjustment, LEAVE_EFFECT_STRENGTH } from '../../lib/local2026/leaveRemain'
import { AGE_EFFECT_STRENGTH, getAgeAdjustment } from '../../lib/local2026/age'
import { TENURE_EFFECT_STRENGTH, getTenureAdjustment } from '../../lib/local2026/tenure'
import { NSSEC_EFFECT_STRENGTH, getNssecAdjustment } from '../../lib/local2026/nssec'
import { DEGREE_EFFECT_STRENGTH, getDegreeAdjustment } from '../../lib/local2026/degree'
import { RURAL_URBAN_EFFECT_STRENGTH, getRuralUrbanAdjustment } from '../../lib/local2026/ruralUrban'
import type { WalesProjectionSnapshot } from '@/lib/wales/projectionSnapshot'

type Poll = {
  poll_date: string
  pollDate?: string
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

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  'Plaid Cymru': '#008672',
  'Liberal Democrat': '#FAA61A',
  Reform: '#12B6CF',
  Green: '#02A95B',
}

export const BASELINE_WALES_GE2024 = {
  Labour: 37,
  'Plaid Cymru': 14.8,
  'Liberal Democrat': 6.5,
  Conservative: 18.2,
  Reform: 16.9,
  Green: 4.7,
}
const SENEDD_2021_BASELINE: Record<string, number> = {
  Labour: 30,
  Conservative: 16,
  'Plaid Cymru': 13,
  'Liberal Democrat': 1,
}

const SEAT_ROWS = [24, 22, 20, 16, 14]
const TOTAL_SEATS = 96
const HEMICYCLE_WIDTH = 820
const HEMICYCLE_HEIGHT = 360
const HEMICYCLE_MARGIN = 36
const HEMICYCLE_TOP_PADDING = 12
const HEMICYCLE_START_ANGLE = Math.PI
const HEMICYCLE_END_ANGLE = 0

function computeWelshRecencyWeight(ageDays: number) {
  if (ageDays < 10) return 1
  if (ageDays < 20) return 0.75
  if (ageDays < 40) return 0.5
  if (ageDays < 60) return 0.25
  return 0.1
}

export function computeWelshPollWeight(poll: Poll) {
  const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
  const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
  return (
    computeWelshRecencyWeight(ageDays) *
    computePollsterWeight(poll.pollster) *
    computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
  )
}

export function allocateDhondt(shares: Record<string, number>, seats: number) {
  const parties = Object.keys(shares)
  const allocated: Record<string, number> = {}
  parties.forEach(party => {
    allocated[party] = 0
  })
  for (let i = 0; i < seats; i += 1) {
    let bestParty = parties[0]
    let bestScore = -Infinity
    parties.forEach(party => {
      const score = (shares[party] ?? 0) / (allocated[party] + 1)
      if (score > bestScore) {
        bestScore = score
        bestParty = party
      }
    })
    allocated[bestParty] += 1
  }
  return allocated
}

export function computeWelshAggregate(polls: Poll[]) {
  if (!polls.length) return null
  const totals = {
    Labour: 0,
    Conservative: 0,
    'Plaid Cymru': 0,
    'Liberal Democrat': 0,
    Green: 0,
    Reform: 0,
  }
  const weights = { ...totals }
  const add = (key: keyof typeof totals, value: number | null, weight: number) => {
    if (value == null) return
    totals[key] += value * weight
    weights[key] += weight
  }
  polls.forEach(poll => {
    const weight = computeWelshPollWeight(poll)
    add('Labour', poll.labour, weight)
    add('Conservative', poll.conservative, weight)
    add('Plaid Cymru', poll.pc, weight)
    add('Liberal Democrat', poll.libdem, weight)
    add('Green', poll.green, weight)
    add('Reform', poll.reform, weight)
  })
  return {
    Labour: weights.Labour ? totals.Labour / weights.Labour : null,
    Conservative: weights.Conservative ? totals.Conservative / weights.Conservative : null,
    'Plaid Cymru': weights['Plaid Cymru'] ? totals['Plaid Cymru'] / weights['Plaid Cymru'] : null,
    'Liberal Democrat': weights['Liberal Democrat']
      ? totals['Liberal Democrat'] / weights['Liberal Democrat']
      : null,
    Green: weights.Green ? totals.Green / weights.Green : null,
    Reform: weights.Reform ? totals.Reform / weights.Reform : null,
  }
}

export function computeWelshProjectedConstituencies(args: {
  lookup: any
  gePcon: any
  aggregate: ReturnType<typeof computeWelshAggregate> | null
  leaveLookup: any
  ageLookup: any
  tenureLookup: any
  nssecLookup: any
  degreeLookup: any
  ruralLookup: any
  wardToSenedd: any
}) {
  const {
    lookup,
    gePcon,
    aggregate,
    leaveLookup,
    ageLookup,
    tenureLookup,
    nssecLookup,
    degreeLookup,
    ruralLookup,
    wardToSenedd,
  } = args
  if (!lookup?.results || !gePcon?.pcon) return []
  const aggregateSafe = aggregate || BASELINE_WALES_GE2024
  const deltas = {
    Labour: (aggregateSafe.Labour ?? BASELINE_WALES_GE2024.Labour) - BASELINE_WALES_GE2024.Labour,
    Conservative:
      (aggregateSafe.Conservative ?? BASELINE_WALES_GE2024.Conservative) -
      BASELINE_WALES_GE2024.Conservative,
    'Plaid Cymru':
      (aggregateSafe['Plaid Cymru'] ?? BASELINE_WALES_GE2024['Plaid Cymru']) -
      BASELINE_WALES_GE2024['Plaid Cymru'],
    'Liberal Democrat':
      (aggregateSafe['Liberal Democrat'] ?? BASELINE_WALES_GE2024['Liberal Democrat']) -
      BASELINE_WALES_GE2024['Liberal Democrat'],
    Reform: (aggregateSafe.Reform ?? BASELINE_WALES_GE2024.Reform) - BASELINE_WALES_GE2024.Reform,
    Green: (aggregateSafe.Green ?? BASELINE_WALES_GE2024.Green) - BASELINE_WALES_GE2024.Green,
  }

  const hasAdjustors =
    wardToSenedd?.wards &&
    ageLookup?.wards &&
    tenureLookup?.wards &&
    nssecLookup?.wards &&
    degreeLookup?.wards &&
    ruralLookup?.wards &&
    leaveLookup?.wards
  const wardToSeneddMap: Record<string, { senedd: string }> = wardToSenedd?.wards || {}
  const computeBaseline = (
    wardData: Record<string, any>,
    fields: string[],
    fallbackWeightMap?: Record<string, number>
  ) => {
    const totals: Record<string, number> = {}
    fields.forEach(field => {
      totals[field] = 0
    })
    let totalWeight = 0
    Object.keys(wardToSeneddMap).forEach(wardCode => {
      const entry = wardData[wardCode]
      if (!entry) return
      const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
      fields.forEach(field => {
        totals[field] += (entry[field] ?? 0) * weight
      })
      totalWeight += weight
    })
    const baseline: Record<string, number> = {}
    fields.forEach(field => {
      baseline[field] = totalWeight ? totals[field] / totalWeight : 0
    })
    return baseline
  }

  const aggregateBySenedd = (
    wardData: Record<string, any>,
    fields: string[],
    fallbackWeightMap?: Record<string, number>
  ) => {
    const totalsBySenedd: Record<string, Record<string, number>> = {}
    const weightsBySenedd: Record<string, number> = {}
    Object.entries(wardToSeneddMap).forEach(([wardCode, meta]) => {
      const entry = wardData[wardCode]
      if (!entry) return
      const seneddName = meta.senedd
      if (!seneddName) return
      if (!totalsBySenedd[seneddName]) {
        totalsBySenedd[seneddName] = {}
        fields.forEach(field => {
          totalsBySenedd[seneddName][field] = 0
        })
        weightsBySenedd[seneddName] = 0
      }
      const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
      fields.forEach(field => {
        totalsBySenedd[seneddName][field] += (entry[field] ?? 0) * weight
      })
      weightsBySenedd[seneddName] += weight
    })
    const result: Record<string, Record<string, number>> = {}
    Object.entries(totalsBySenedd).forEach(([seneddName, totals]) => {
      const weight = weightsBySenedd[seneddName] || 1
      result[seneddName] = {}
      fields.forEach(field => {
        result[seneddName][field] = totals[field] / weight
      })
    })
    return result
  }

  const ageWeightMap: Record<string, number> = {}
  const ageBaseline = hasAdjustors
    ? (() => {
        Object.entries(ageLookup.wards).forEach(([code, entry]: any) => {
          ageWeightMap[code] = entry.totalPop ?? 1
        })
        return computeBaseline(ageLookup.wards, ['age18_35', 'age35_55', 'age55_plus'])
      })()
    : null
  const tenureBaseline = hasAdjustors
    ? computeBaseline(tenureLookup.wards, [
        'ownedOutright',
        'ownsWithMortgage',
        'socialRented',
        'privateRented',
      ])
    : null
  const nssecBaseline = hasAdjustors
    ? computeBaseline(nssecLookup.wards, ['higher', 'intermediate', 'lower'])
    : null
  const degreeBaseline = hasAdjustors
    ? computeBaseline(degreeLookup.wards, ['degree', 'noDegree'])
    : null
  const ruralBaseline = hasAdjustors
    ? computeBaseline(ruralLookup.wards, [
        'conurbation',
        'cityTown',
        'ruralTownFringe',
        'ruralVillageHamlet',
      ])
    : null
  const leaveBaseline = hasAdjustors
    ? computeBaseline(
        Object.fromEntries(
          Object.entries(leaveLookup.wards).map(([code, entry]: any) => [code, { leaveShare: entry.leaveShare }])
        ),
        ['leaveShare'],
        ageWeightMap
      ).leaveShare
    : null

  const ageBySenedd = hasAdjustors ? aggregateBySenedd(ageLookup.wards, ['age18_35', 'age35_55', 'age55_plus']) : {}
  const tenureBySenedd = hasAdjustors
    ? aggregateBySenedd(tenureLookup.wards, ['ownedOutright', 'ownsWithMortgage', 'socialRented', 'privateRented'])
    : {}
  const nssecBySenedd = hasAdjustors ? aggregateBySenedd(nssecLookup.wards, ['higher', 'intermediate', 'lower']) : {}
  const degreeBySenedd = hasAdjustors ? aggregateBySenedd(degreeLookup.wards, ['degree', 'noDegree']) : {}
  const ruralBySenedd = hasAdjustors
    ? aggregateBySenedd(ruralLookup.wards, ['conurbation', 'cityTown', 'ruralTownFringe', 'ruralVillageHamlet'])
    : {}
  const leaveBySenedd = hasAdjustors
    ? aggregateBySenedd(
        Object.fromEntries(
          Object.entries(leaveLookup.wards).map(([code, entry]: any) => [code, { leaveShare: entry.leaveShare }])
        ),
        ['leaveShare'],
        ageWeightMap
      )
    : {}

  const getLeaveAdjustment = (party: string, leaveShare: number) => {
    if (!hasAdjustors || leaveBaseline == null) return 0
    const wardAdj = getPartyLeaveAdjustment(party, leaveShare)
    const natAdj = getPartyLeaveAdjustment(party, leaveBaseline)
    return wardAdj - natAdj
  }

  return lookup.results.map((row: any) => {
    const overlaps = (row.overlaps || []).slice(0, 2)
    const weights = overlaps.map(() => 1 / overlaps.length)
    const parties = ['Labour', 'Conservative', 'Plaid Cymru', 'Liberal Democrat', 'Reform', 'Green']
    const baseline: Record<string, number> = {}
    parties.forEach(party => {
      baseline[party] = overlaps.reduce((sum: number, item: any, idx: number) => {
        const pcon = gePcon.pcon?.[item.code]
        if (!pcon) return sum
        return sum + (pcon[party] ?? 0) * weights[idx]
      }, 0)
    })
    const projectedRaw: Record<string, number> = {}
    const seneddName = row.seneddName
    const ageShare = ageBySenedd[seneddName]
    const tenureShare = tenureBySenedd[seneddName]
    const nssecShare = nssecBySenedd[seneddName]
    const degreeShare = degreeBySenedd[seneddName]
    const ruralShare = ruralBySenedd[seneddName]
    const leaveShare = leaveBySenedd[seneddName]?.leaveShare
    parties.forEach(party => {
      let adj = 0
      if (party !== 'Plaid Cymru') {
        if (typeof leaveShare === 'number') {
          adj += getLeaveAdjustment(party, leaveShare) * LEAVE_EFFECT_STRENGTH
        }
        if (ageShare && ageBaseline) adj += getAgeAdjustment(party, ageShare as any, ageBaseline as any) * AGE_EFFECT_STRENGTH
        if (tenureShare && tenureBaseline) {
          adj += getTenureAdjustment(party, tenureShare as any, tenureBaseline as any) * TENURE_EFFECT_STRENGTH
        }
        if (nssecShare && nssecBaseline) adj += getNssecAdjustment(party, nssecShare as any, nssecBaseline as any) * NSSEC_EFFECT_STRENGTH
        if (degreeShare && degreeBaseline) adj += getDegreeAdjustment(party, degreeShare as any, degreeBaseline as any) * DEGREE_EFFECT_STRENGTH
        if (ruralShare && ruralBaseline) {
          adj += getRuralUrbanAdjustment(party, ruralShare as any, ruralBaseline as any) * RURAL_URBAN_EFFECT_STRENGTH
        }
      }
      projectedRaw[party] = Math.max(0, baseline[party] + (deltas as any)[party] + adj)
    })
    const total = parties.reduce((sum, party) => sum + projectedRaw[party], 0) || 1
    const projected: Record<string, number> = {}
    parties.forEach(party => {
      projected[party] = (projectedRaw[party] / total) * 100
    })
    const seats = allocateDhondt(projected, 6)
    return {
      name: row.seneddName,
      projected,
      seats,
    }
  })
}

export function computeWelshSeatCounts(
  projectedConstituencies: Array<{ seats: Record<string, number> }>
) {
  const counts: Record<string, number> = {}
  projectedConstituencies.forEach(entry => {
    Object.entries(entry.seats).forEach(([party, count]) => {
      counts[party] = (counts[party] || 0) + count
    })
  })
  return counts
}

function buildHemicyclePositions(rows: number[]) {
  const maxRadius = Math.min(
    HEMICYCLE_WIDTH / 2 - HEMICYCLE_MARGIN,
    HEMICYCLE_HEIGHT - HEMICYCLE_MARGIN - HEMICYCLE_TOP_PADDING
  )
  const ringGap = (maxRadius / (rows.length + 3)) * 0.8
  const centerX = HEMICYCLE_WIDTH / 2
  const centerY = HEMICYCLE_HEIGHT - HEMICYCLE_MARGIN
  const dots: Array<{ x: number; y: number; angle: number; radius: number }> = []
  rows.forEach((count, index) => {
    const radius = maxRadius - index * ringGap
    if (!count) return
    const step = (HEMICYCLE_START_ANGLE - HEMICYCLE_END_ANGLE) / (count - 1 || 1)
    for (let seatIndex = 0; seatIndex < count; seatIndex += 1) {
      const angle = HEMICYCLE_START_ANGLE - step * seatIndex
      const x = centerX + Math.cos(angle) * radius
      const y = centerY - Math.sin(angle) * radius
      dots.push({ x, y, angle, radius })
    }
  })
  return { dots, centerX, centerY, maxRadius }
}

export default function SeneddProjectionPage() {
  const [lookup, setLookup] = useState<any>(null)
  const [gePcon, setGePcon] = useState<any>(null)
  const [polls, setPolls] = useState<Poll[]>([])
  const [leaveLookup, setLeaveLookup] = useState<any>(null)
  const [ageLookup, setAgeLookup] = useState<any>(null)
  const [tenureLookup, setTenureLookup] = useState<any>(null)
  const [nssecLookup, setNssecLookup] = useState<any>(null)
  const [degreeLookup, setDegreeLookup] = useState<any>(null)
  const [ruralLookup, setRuralLookup] = useState<any>(null)
  const [wardToSenedd, setWardToSenedd] = useState<any>(null)
  const [projectionSnapshot, setProjectionSnapshot] = useState<WalesProjectionSnapshot | null>(null)
  const [projectionSnapshotStatus, setProjectionSnapshotStatus] = useState<
    'loading' | 'ready' | 'missing'
  >('loading')
  const cacheBust = useMemo(() => Date.now(), [])

  useEffect(() => {
    fetch('/api/senedd-projection')
      .then(async res => {
        if (!res.ok) throw new Error('snapshot unavailable')
        return (await res.json()) as WalesProjectionSnapshot
      })
      .then(data => {
        if (!data?.projectedConstituencies || !data?.seatCounts) throw new Error('invalid snapshot')
        setProjectionSnapshot(data)
        setProjectionSnapshotStatus('ready')
      })
      .catch(() => {
        setProjectionSnapshot(null)
        setProjectionSnapshotStatus('missing')
      })
  }, [])

  useEffect(() => {
    if (projectionSnapshotStatus !== 'missing') return

    fetch(`/data/senedd-to-wpc-lookup.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(data => setLookup(data))
    fetch(`/data/ge2024-pcon.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(data => setGePcon(data))
    fetch('/api/welsh-polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
    fetch(`/data/leave-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setLeaveLookup)
    fetch(`/data/age-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setAgeLookup)
    fetch(`/data/tenure-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setTenureLookup)
    fetch(`/data/nssec-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setNssecLookup)
    fetch(`/data/degree-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setDegreeLookup)
    fetch(`/data/rural-urban-share.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setRuralLookup)
    fetch(`/data/ward-to-senedd.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(setWardToSenedd)
  }, [cacheBust, projectionSnapshotStatus])

  const aggregate = useMemo(() => {
    if (!polls.length) return null
    const totals = {
      Labour: 0,
      Conservative: 0,
      'Plaid Cymru': 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
    }
    const weights = { ...totals }
    const add = (key: keyof typeof totals, value: number | null, weight: number) => {
      if (value == null) return
      totals[key] += value * weight
      weights[key] += weight
    }
    polls.forEach(poll => {
      const weight = computeWelshPollWeight(poll)
      add('Labour', poll.labour, weight)
      add('Conservative', poll.conservative, weight)
      add('Plaid Cymru', poll.pc, weight)
      add('Liberal Democrat', poll.libdem, weight)
      add('Green', poll.green, weight)
      add('Reform', poll.reform, weight)
    })
    return {
      Labour: weights.Labour ? totals.Labour / weights.Labour : null,
      Conservative: weights.Conservative ? totals.Conservative / weights.Conservative : null,
      'Plaid Cymru': weights['Plaid Cymru'] ? totals['Plaid Cymru'] / weights['Plaid Cymru'] : null,
      'Liberal Democrat': weights['Liberal Democrat']
        ? totals['Liberal Democrat'] / weights['Liberal Democrat']
        : null,
      Green: weights.Green ? totals.Green / weights.Green : null,
      Reform: weights.Reform ? totals.Reform / weights.Reform : null,
    }
  }, [polls])

  type ProjectedConstituency = {
    name: string
    seats: Record<string, number>
  }

  const projectedConstituencies = useMemo<ProjectedConstituency[]>(() => {
    if (projectionSnapshot) return projectionSnapshot.projectedConstituencies
    if (!lookup?.results || !gePcon?.pcon) return []
    const aggregateSafe = aggregate || BASELINE_WALES_GE2024
    const deltas = {
      Labour: (aggregateSafe.Labour ?? BASELINE_WALES_GE2024.Labour) - BASELINE_WALES_GE2024.Labour,
      Conservative:
        (aggregateSafe.Conservative ?? BASELINE_WALES_GE2024.Conservative) -
        BASELINE_WALES_GE2024.Conservative,
      'Plaid Cymru':
        (aggregateSafe['Plaid Cymru'] ?? BASELINE_WALES_GE2024['Plaid Cymru']) -
        BASELINE_WALES_GE2024['Plaid Cymru'],
      'Liberal Democrat':
        (aggregateSafe['Liberal Democrat'] ?? BASELINE_WALES_GE2024['Liberal Democrat']) -
        BASELINE_WALES_GE2024['Liberal Democrat'],
      Reform: (aggregateSafe.Reform ?? BASELINE_WALES_GE2024.Reform) - BASELINE_WALES_GE2024.Reform,
      Green: (aggregateSafe.Green ?? BASELINE_WALES_GE2024.Green) - BASELINE_WALES_GE2024.Green,
    }

    const hasAdjustors =
      wardToSenedd?.wards &&
      ageLookup?.wards &&
      tenureLookup?.wards &&
      nssecLookup?.wards &&
      degreeLookup?.wards &&
      ruralLookup?.wards &&
      leaveLookup?.wards
    const wardToSeneddMap: Record<string, { senedd: string }> = wardToSenedd?.wards || {}
    const computeBaseline = (
      wardData: Record<string, any>,
      fields: string[],
      fallbackWeightMap?: Record<string, number>
    ) => {
      const totals: Record<string, number> = {}
      fields.forEach(field => {
        totals[field] = 0
      })
      let totalWeight = 0
      Object.keys(wardToSeneddMap).forEach(wardCode => {
        const entry = wardData[wardCode]
        if (!entry) return
        const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
        fields.forEach(field => {
          totals[field] += (entry[field] ?? 0) * weight
        })
        totalWeight += weight
      })
      const baseline: Record<string, number> = {}
      fields.forEach(field => {
        baseline[field] = totalWeight ? totals[field] / totalWeight : 0
      })
      return baseline
    }

    const aggregateBySenedd = (
      wardData: Record<string, any>,
      fields: string[],
      fallbackWeightMap?: Record<string, number>
    ) => {
      const totalsBySenedd: Record<string, Record<string, number>> = {}
      const weightsBySenedd: Record<string, number> = {}
      Object.entries(wardToSeneddMap).forEach(([wardCode, meta]) => {
        const entry = wardData[wardCode]
        if (!entry) return
        const seneddName = meta.senedd
        if (!seneddName) return
        if (!totalsBySenedd[seneddName]) {
          totalsBySenedd[seneddName] = {}
          fields.forEach(field => {
            totalsBySenedd[seneddName][field] = 0
          })
          weightsBySenedd[seneddName] = 0
        }
        const weight = entry.totalPop ?? fallbackWeightMap?.[wardCode] ?? 1
        fields.forEach(field => {
          totalsBySenedd[seneddName][field] += (entry[field] ?? 0) * weight
        })
        weightsBySenedd[seneddName] += weight
      })
      const result: Record<string, Record<string, number>> = {}
      Object.entries(totalsBySenedd).forEach(([seneddName, totals]) => {
        const weight = weightsBySenedd[seneddName] || 1
        result[seneddName] = {}
        fields.forEach(field => {
          result[seneddName][field] = totals[field] / weight
        })
      })
      return result
    }

    const ageWeightMap: Record<string, number> = {}
    const ageBaseline = hasAdjustors
      ? (() => {
          Object.entries(ageLookup.wards).forEach(([code, entry]: any) => {
            ageWeightMap[code] = entry.totalPop ?? 1
          })
          return computeBaseline(ageLookup.wards, ['age18_35', 'age35_55', 'age55_plus'])
        })()
      : null
    const tenureBaseline = hasAdjustors
      ? computeBaseline(tenureLookup.wards, [
          'ownedOutright',
          'ownsWithMortgage',
          'socialRented',
          'privateRented',
        ])
      : null
    const nssecBaseline = hasAdjustors
      ? computeBaseline(nssecLookup.wards, ['higher', 'intermediate', 'lower'])
      : null
    const degreeBaseline = hasAdjustors
      ? computeBaseline(degreeLookup.wards, ['degree', 'noDegree'])
      : null
    const ruralBaseline = hasAdjustors
      ? computeBaseline(ruralLookup.wards, [
          'conurbation',
          'cityTown',
          'ruralTownFringe',
          'ruralVillageHamlet',
        ])
      : null
    const leaveBaseline = hasAdjustors
      ? computeBaseline(
          Object.fromEntries(
            Object.entries(leaveLookup.wards).map(([code, entry]: any) => [
              code,
              { leaveShare: entry.leaveShare },
            ])
          ),
          ['leaveShare'],
          ageWeightMap
        ).leaveShare
      : null

    const ageBySenedd = hasAdjustors
      ? aggregateBySenedd(ageLookup.wards, ['age18_35', 'age35_55', 'age55_plus'])
      : {}
    const tenureBySenedd = hasAdjustors
      ? aggregateBySenedd(tenureLookup.wards, [
          'ownedOutright',
          'ownsWithMortgage',
          'socialRented',
          'privateRented',
        ])
      : {}
    const nssecBySenedd = hasAdjustors
      ? aggregateBySenedd(nssecLookup.wards, ['higher', 'intermediate', 'lower'])
      : {}
    const degreeBySenedd = hasAdjustors
      ? aggregateBySenedd(degreeLookup.wards, ['degree', 'noDegree'])
      : {}
    const ruralBySenedd = hasAdjustors
      ? aggregateBySenedd(ruralLookup.wards, [
          'conurbation',
          'cityTown',
          'ruralTownFringe',
          'ruralVillageHamlet',
        ])
      : {}
    const leaveBySenedd = hasAdjustors
      ? aggregateBySenedd(
          Object.fromEntries(
            Object.entries(leaveLookup.wards).map(([code, entry]: any) => [
              code,
              { leaveShare: entry.leaveShare },
            ])
          ),
          ['leaveShare'],
          ageWeightMap
        )
      : {}

    const getLeaveAdjustment = (party: string, leaveShare: number) => {
      if (!hasAdjustors || leaveBaseline == null) return 0
      const wardAdj = getPartyLeaveAdjustment(party, leaveShare)
      const natAdj = getPartyLeaveAdjustment(party, leaveBaseline)
      return wardAdj - natAdj
    }

    return lookup.results.map((row: any) => {
      const overlaps = (row.overlaps || []).slice(0, 2)
      const weights = overlaps.map(() => 1 / overlaps.length)
      const parties = [
        'Labour',
        'Conservative',
        'Plaid Cymru',
        'Liberal Democrat',
        'Reform',
        'Green',
      ]
      const baseline: Record<string, number> = {}
      parties.forEach(party => {
        baseline[party] = overlaps.reduce((sum: number, item: any, idx: number) => {
          const pcon = gePcon.pcon?.[item.code]
          if (!pcon) return sum
          return sum + (pcon[party] ?? 0) * weights[idx]
        }, 0)
      })
      const projectedRaw: Record<string, number> = {}
      const seneddName = row.seneddName
      const ageShare = ageBySenedd[seneddName]
      const tenureShare = tenureBySenedd[seneddName]
      const nssecShare = nssecBySenedd[seneddName]
      const degreeShare = degreeBySenedd[seneddName]
      const ruralShare = ruralBySenedd[seneddName]
      const leaveShare = leaveBySenedd[seneddName]?.leaveShare
      parties.forEach(party => {
        let adj = 0
        if (party !== 'Plaid Cymru') {
          if (typeof leaveShare === 'number') {
            adj += getLeaveAdjustment(party, leaveShare) * LEAVE_EFFECT_STRENGTH
          }
          if (ageShare && ageBaseline) {
            adj +=
              getAgeAdjustment(party, ageShare as any, ageBaseline as any) * AGE_EFFECT_STRENGTH
          }
          if (tenureShare && tenureBaseline) {
            adj +=
              getTenureAdjustment(party, tenureShare as any, tenureBaseline as any) *
              TENURE_EFFECT_STRENGTH
          }
          if (nssecShare && nssecBaseline) {
            adj +=
              getNssecAdjustment(party, nssecShare as any, nssecBaseline as any) *
              NSSEC_EFFECT_STRENGTH
          }
          if (degreeShare && degreeBaseline) {
            adj +=
              getDegreeAdjustment(party, degreeShare as any, degreeBaseline as any) *
              DEGREE_EFFECT_STRENGTH
          }
          if (ruralShare && ruralBaseline) {
            adj +=
              getRuralUrbanAdjustment(party, ruralShare as any, ruralBaseline as any) *
              RURAL_URBAN_EFFECT_STRENGTH
          }
        }
        projectedRaw[party] = Math.max(0, baseline[party] + (deltas as any)[party] + adj)
      })
      const total = parties.reduce((sum, party) => sum + projectedRaw[party], 0) || 1
      const projected: Record<string, number> = {}
      parties.forEach(party => {
        projected[party] = (projectedRaw[party] / total) * 100
      })
      const seats = allocateDhondt(projected, 6)
      return {
        name: row.seneddName,
        projected,
        seats,
      }
    })
  }, [projectionSnapshot, lookup, gePcon, aggregate])

  const seatCounts = useMemo(() => {
    if (projectionSnapshot) return projectionSnapshot.seatCounts
    const counts: Record<string, number> = {}
    projectedConstituencies.forEach((entry: ProjectedConstituency) => {
      Object.entries(entry.seats).forEach(([party, count]) => {
        counts[party] = (counts[party] || 0) + count
      })
    })
    return counts
  }, [projectionSnapshot, projectedConstituencies])

  const seatOrder = useMemo(() => {
    const entries = Object.entries(seatCounts).sort((a, b) => b[1] - a[1])
    return entries.map(([party]) => party)
  }, [seatCounts])

  const seatAssignments = useMemo(() => {
    const seats: string[] = []
    seatOrder.forEach(party => {
      const count = seatCounts[party] || 0
      for (let i = 0; i < count; i += 1) seats.push(party)
    })
    return seats.slice(0, TOTAL_SEATS)
  }, [seatOrder, seatCounts])

  const hemicycle = useMemo(() => buildHemicyclePositions(SEAT_ROWS), [])
  const hemicycleDots = useMemo(() => {
    const ordered = [...hemicycle.dots].sort((a, b) => {
      if (a.angle !== b.angle) return b.angle - a.angle
      return b.radius - a.radius
    })
    return ordered.map((dot, index) => ({
      ...dot,
      party: seatAssignments[index] || 'Other',
    }))
  }, [hemicycle.dots, seatAssignments])

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Projected Senedd"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card poll-stack">
        <div className="poll-muted">
          Constituency projections are allocated using d’Hondt for 6 MSs per constituency.
        </div>
      </div>
      <div className="poll-card poll-stack">
        <div className="poll-section-title">Projected Senedd (96 seats)</div>
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          <svg
            viewBox={`0 0 ${HEMICYCLE_WIDTH} ${HEMICYCLE_HEIGHT}`}
            width="100%"
            height="340"
            role="img"
            aria-label="Projected Senedd hemicycle"
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            {hemicycleDots.map((dot, index) => (
              <circle
                key={`${dot.party}-${index}`}
                className="poll-hemicycle-seat"
                cx={dot.x}
                cy={dot.y}
                r={5.2}
                fill={PARTY_COLORS[dot.party] || '#ccc'}
                stroke="rgba(0,0,0,0.08)"
                strokeWidth="1"
                style={{ animationDelay: `${index * 14}ms` }}
              >
                <title>{dot.party}</title>
              </circle>
            ))}
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem' }}>
            {Object.entries(seatCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([party, count]) => {
                const baseline = SENEDD_2021_BASELINE[party] ?? 0
                const delta = count - baseline
                const deltaLabel =
                  delta === 0 ? '-' : delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`
                const deltaColor = delta > 0 ? '#1B8A3A' : delta < 0 ? '#B02A37' : '#666'
                return (
                  <div key={party} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        background: PARTY_COLORS[party] || '#ccc',
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>{party}</span>
                    <span style={{ color: 'var(--poll-nav-muted)' }}>{count}</span>
                    <span style={{ color: deltaColor }}>({deltaLabel})</span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
      <div className="poll-card poll-stack poll-projection-card">
        <div className="poll-section-title">Projected Constituencies</div>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {projectedConstituencies
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(entry => (
              <div
                className="poll-projection-row"
                key={entry.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.5fr',
                  gap: '0.75rem',
                  alignItems: 'center',
                  padding: '0.45rem 0.6rem',
                  borderBottom: '1px solid rgba(248, 250, 252, 0.1)',
                }}
              >
                <a
                  href={`/welsh-map?constituency=${encodeURIComponent(entry.name)}`}
                  style={{ color: '#172033', textDecoration: 'none' }}
                >
                  {entry.name}
                </a>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
                  {Object.entries(entry.seats)
                    .filter(([, seats]) => seats > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([party, count]) => (
                      <div key={`${entry.name}-${party}`} style={{ display: 'flex', gap: '0.4rem' }}>
                        <span style={{ color: PARTY_COLORS[party] || '#333' }}>
                          {party}:
                        </span>
                        <span style={{ color: 'var(--poll-nav-muted)' }}>{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      </div>
      <div className="poll-note">
        For more information on how the Senedd electoral system works, please click{' '}
        <a
          href="https://senedd.wales/senedd-now/senedd-blog/senedd-election-2026-what-is-the-d-hondt-formula-and-how-does-it-work/"
          target="_blank"
          rel="noreferrer"
        >
          here
        </a>
        .
      </div>
    </PageShell>
  )
}
