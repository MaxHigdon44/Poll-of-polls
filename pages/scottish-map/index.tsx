import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import type { FeatureCollection } from 'geojson'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { blendShare } from '../../lib/local2026/ge'
import {
  SCOTLAND_AGE_EFFECT_STRENGTH,
  getScottishAgeAdjustment,
  type ScotlandAgeShare,
} from '../../lib/scotland/age'
import {
  SCOTLAND_DEGREE_EFFECT_STRENGTH,
  getScottishDegreeAdjustment,
  type ScotlandDegreeShare,
} from '../../lib/scotland/degree'
import {
  SCOTLAND_NSSEC_EFFECT_STRENGTH,
  getScottishNssecAdjustment,
  type ScotlandNssecShare,
} from '../../lib/scotland/nssec'
import {
  SCOTLAND_LEAVE_EFFECT_STRENGTH,
  SCOTLAND_NATIONAL_LEAVE_SHARE,
  clampLeaveShare,
  getCenteredScottishPartyLeaveAdjustment,
} from '../../lib/scotland/leaveRemain'
import {
  SCOTLAND_TENURE_EFFECT_STRENGTH,
  getScottishTenureAdjustment,
  type ScotlandTenureShare,
} from '../../lib/scotland/tenure'
import { computePollsterWeight, computeSampleWeight } from '../../lib/weights'
import type { ScotlandProjectionSnapshot } from '@/lib/scotland/projectionSnapshot'

const ScottishParliamentMap = dynamic(
  () => import('../../components/ScottishParliamentMap'),
  { ssr: false }
)

function normalizeScottishConstituencyName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/\bislands\b/g, '')
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeWestminsterName(name: string) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

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
  snp: number | null
  others: number | null
}

type GePconLookup = {
  pcon?: Record<string, Record<string, number>>
}

type SpcToWpcLookup = {
  results?: Array<{
    spcCode: string
    spcName: string
    primaryWpcCode: string | null
    primaryWpcName: string | null
    overlapShare: number
  }>
}

type ScotlandWpcLeaveLookup = {
  byCode?: Record<string, { code: string; name: string; leaveShare: number | null }>
  byName?: Record<string, { code: string; name: string; leaveShare: number | null }>
}

type ScotlandTenureLookup = {
  constituencies?: Record<string, ScotlandTenureShare & { totalHouseholds?: number }>
  meta?: { baseline?: ScotlandTenureShare }
}

type ScotlandAgeLookup = {
  constituencies?: Record<string, ScotlandAgeShare>
  meta?: { baseline?: ScotlandAgeShare }
}

type ScotlandDegreeLookup = {
  constituencies?: Record<string, ScotlandDegreeShare & { totalPop?: number }>
  meta?: { baseline?: ScotlandDegreeShare }
}

type ScotlandNssecLookup = {
  constituencies?: Record<string, ScotlandNssecShare & { totalPop?: number; excluded?: number }>
  meta?: { baseline?: ScotlandNssecShare; excluded?: number }
}

const BASELINE_2021_CONSTITUENCY = {
  snp: 47.7,
  conservative: 21.9,
  labour: 21.6,
  green: 1.3,
  libdem: 6.9,
  other: 0.6,
}

const PARTY_COLORS: Record<string, string> = {
  SNP: '#FDF38E',
  Conservative: '#0087DC',
  Labour: '#E4003B',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  Reform: '#12B6CF',
  Other: '#9a9a9a',
}

const SCOTLAND_GE2024_REFORM_BASELINE = 7
const GE_BLEND_OTHER = 0.05
const SCOTLAND_REGION_EFFECT_STRENGTH = 0.7

const SCOTLAND_REGION_DELTAS: Record<string, Record<string, number>> = {
  'north east scotland': {
    SNP: -0.5,
    Conservative: 3.5,
    Labour: -9.5,
    'Liberal Democrat': -0.5,
    Green: -1.5,
    Reform: 6,
  },
  'highlands and islands': {
    SNP: -2,
    Conservative: 0.5,
    Labour: -4,
    'Liberal Democrat': 9,
    Green: -3,
    Reform: -1.5,
  },
  'south scotland': {
    SNP: -2,
    Conservative: 4,
    Labour: -3.5,
    'Liberal Democrat': -5,
    Green: -2,
    Reform: 4,
  },
  'west scotland': {
    SNP: -1,
    Conservative: -2,
    Labour: 7.5,
    'Liberal Democrat': 2,
    Green: -3,
    Reform: -2.5,
  },
  central: {
    SNP: 7.5,
    Conservative: -0.5,
    Labour: -1.5,
    'Liberal Democrat': -4.5,
    Green: -2,
    Reform: 2.5,
  },
  'mid scotland and fife': {
    SNP: -2,
    Conservative: 3,
    Labour: 3.5,
    'Liberal Democrat': 2,
    Green: -2.5,
    Reform: -1,
  },
  lothians: {
    SNP: -1,
    Conservative: -1.5,
    Labour: 2.5,
    'Liberal Democrat': 4,
    Green: 5,
    Reform: -5,
  },
  glasgow: {
    SNP: 2.5,
    Conservative: -4.5,
    Labour: 3.5,
    'Liberal Democrat': -5,
    Green: 8,
    Reform: -4.5,
  },
}

const SCOTTISH_PARTY_COLORS: Record<string, string> = {
  SNP: '#FDF38E',
  Conservative: '#0087DC',
  Labour: '#E4003B',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  Reform: '#12B6CF',
  Other: '#888',
  Unknown: '#666',
}

function computeScottishRecencyWeight(ageDays: number) {
  if (ageDays < 10) return 1
  if (ageDays < 20) return 0.75
  if (ageDays < 40) return 0.5
  if (ageDays < 60) return 0.25
  return 0.1
}

function computeScottishPollWeight(poll: Poll) {
  const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
  const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
  return (
    computeScottishRecencyWeight(ageDays) *
    computePollsterWeight(poll.pollster) *
    computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
  )
}

function computeConstituencyAggregate(polls: Poll[]) {
  if (polls.length === 0) return null
  const totals = {
    snp: 0,
    conservative: 0,
    labour: 0,
    libdem: 0,
    green: 0,
    reform: 0,
    other: 0,
  }
  const weights = { ...totals }
  const add = (key: keyof typeof totals, value: number | null, weight: number) => {
    if (value == null) return
    totals[key] += value * weight
    weights[key] += weight
  }
  polls.forEach(poll => {
    const weight = computeScottishPollWeight(poll)
    add('snp', poll.snp, weight)
    add('conservative', poll.conservative, weight)
    add('labour', poll.labour, weight)
    add('libdem', poll.libdem, weight)
    add('green', poll.green, weight)
    add('reform', poll.reform, weight)
    add('other', poll.others, weight)
  })
  return {
    snp: weights.snp ? totals.snp / weights.snp : BASELINE_2021_CONSTITUENCY.snp,
    conservative: weights.conservative
      ? totals.conservative / weights.conservative
      : BASELINE_2021_CONSTITUENCY.conservative,
    labour: weights.labour ? totals.labour / weights.labour : BASELINE_2021_CONSTITUENCY.labour,
    libdem: weights.libdem ? totals.libdem / weights.libdem : BASELINE_2021_CONSTITUENCY.libdem,
    green: weights.green ? totals.green / weights.green : BASELINE_2021_CONSTITUENCY.green,
    reform: weights.reform ? totals.reform / weights.reform : SCOTLAND_GE2024_REFORM_BASELINE,
    other: weights.other ? totals.other / weights.other : BASELINE_2021_CONSTITUENCY.other,
  }
}

function getRelativeScottishReformShare(geShare: number | undefined) {
  const numeric = Number(geShare)
  if (!Number.isFinite(numeric)) return 0
  if (numeric === 0) return 0
  return numeric - SCOTLAND_GE2024_REFORM_BASELINE
}

function normalizeRegionName(region: string | null | undefined) {
  const normalized = String(region || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized === 'north east') return 'north east scotland'
  if (normalized === 'highlands') return 'highlands and islands'
  if (normalized === 'south') return 'south scotland'
  if (normalized === 'west') return 'west scotland'
  if (normalized === 'central scotland') return 'central'
  if (normalized === 'lothian') return 'lothians'
  if (normalized === 'mid and fife') return 'mid scotland and fife'
  if (normalized === 'mid scotland & fife') return 'mid scotland and fife'
  return normalized
}

export default function ScottishMapPage() {
  const router = useRouter()
  const embedParam = router.query.embed
  const isEmbed = embedParam === '1' || (Array.isArray(embedParam) && embedParam[0] === '1')
  const [constituencyGeo, setConstituencyGeo] = useState<FeatureCollection | null>(null)
  const [regionGeo, setRegionGeo] = useState<FeatureCollection | null>(null)
  const [countriesGeo, setCountriesGeo] = useState<FeatureCollection | null>(null)
  const [constituencyResults, setConstituencyResults] = useState<
    Map<
      string,
      {
        previousWinner2021: string | null
        region: string
        msp2021: string | null
        turnout: number | null
        majority: number | null
        shares: {
          snp: number | null
          conservative: number | null
          labour: number | null
          libdem: number | null
          green: number | null
          reform?: number | null
          other: number | null
        }
        projected?: {
          snp: number
          conservative: number
          labour: number
          libdem: number
          green: number
          reform: number
          other: number
        }
        leaveShare?: number | null
        degreeShare?: ScotlandDegreeShare
        nssecShare?: ScotlandNssecShare
        projectedWinner?: string | null
      }
    >
  >(new Map())
  const [constituencyPolls, setConstituencyPolls] = useState<Poll[]>([])
  const [geLookup, setGeLookup] = useState<GePconLookup | null>(null)
  const [spcToWpcLookup, setSpcToWpcLookup] = useState<SpcToWpcLookup | null>(null)
  const [wpcLeaveLookup, setWpcLeaveLookup] = useState<ScotlandWpcLeaveLookup | null>(null)
  const [tenureLookup, setTenureLookup] = useState<ScotlandTenureLookup | null>(null)
  const [ageLookup, setAgeLookup] = useState<ScotlandAgeLookup | null>(null)
  const [degreeLookup, setDegreeLookup] = useState<ScotlandDegreeLookup | null>(null)
  const [nssecLookup, setNssecLookup] = useState<ScotlandNssecLookup | null>(null)
  const [geBlendWeight, setGeBlendWeight] = useState(GE_BLEND_OTHER)
  const [tenureStrength, setTenureStrength] = useState(SCOTLAND_TENURE_EFFECT_STRENGTH)
  const [ageStrength, setAgeStrength] = useState(SCOTLAND_AGE_EFFECT_STRENGTH)
  const [degreeStrength, setDegreeStrength] = useState(SCOTLAND_DEGREE_EFFECT_STRENGTH)
  const [nssecStrength, setNssecStrength] = useState(SCOTLAND_NSSEC_EFFECT_STRENGTH)
  const [leaveStrength, setLeaveStrength] = useState(SCOTLAND_LEAVE_EFFECT_STRENGTH)
  const [regionStrength, setRegionStrength] = useState(SCOTLAND_REGION_EFFECT_STRENGTH)
  const [hasMounted, setHasMounted] = useState(false)
  const [focusConstituency, setFocusConstituency] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [mapDisplayMode, setMapDisplayMode] = useState<'projected' | 'incumbent'>('projected')
  const [projectionSnapshot, setProjectionSnapshot] = useState<ScotlandProjectionSnapshot | null>(null)
  const [projectionSnapshotStatus, setProjectionSnapshotStatus] = useState<
    'loading' | 'ready' | 'missing'
  >('loading')
  const settingsKey = 'scotlandModelSettings'

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(settingsKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed.geBlendWeight === 'number') setGeBlendWeight(parsed.geBlendWeight)
          if (typeof parsed.tenureStrength === 'number') setTenureStrength(parsed.tenureStrength)
          if (typeof parsed.ageStrength === 'number') setAgeStrength(parsed.ageStrength)
          if (typeof parsed.degreeStrength === 'number') setDegreeStrength(parsed.degreeStrength)
          if (typeof parsed.nssecStrength === 'number') setNssecStrength(parsed.nssecStrength)
          if (typeof parsed.leaveStrength === 'number') setLeaveStrength(parsed.leaveStrength)
          if (typeof parsed.regionStrength === 'number') setRegionStrength(parsed.regionStrength)
        }
      } catch {
        // ignore malformed local storage
      }
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const name = params.get('constituency')
      setFocusConstituency(name)
    }
    setHasMounted(true)
    fetch('/api/scottish-parliament-projection')
      .then(async res => {
        if (!res.ok) throw new Error('snapshot unavailable')
        return (await res.json()) as ScotlandProjectionSnapshot
      })
      .then(data => {
        if (!data?.constituencyRows || !data?.combinedSeatCounts) {
          throw new Error('invalid snapshot')
        }
        setProjectionSnapshot(data)
        setProjectionSnapshotStatus('ready')
      })
      .catch(() => {
        setProjectionSnapshot(null)
        setProjectionSnapshotStatus('missing')
      })
    fetch('/data/scotland-constituencies.geojson')
      .then(res => res.json())
      .then(data => setConstituencyGeo(data))
    fetch('/data/scotland-regions.geojson')
      .then(res => res.json())
      .then(data => setRegionGeo(data))
    fetch('/data/uk-countries-2022.geojson')
      .then(res => res.json())
      .then(setCountriesGeo)
      .catch(() => setCountriesGeo(null))
    fetch('/api/scottish-constituency-results')
      .then(res => res.json())
      .then(data => {
        const map = new Map()
        ;(data.results ?? []).forEach((row: any) => {
          const snapshotEntry = (projectionSnapshot?.constituencyRows || []).find(
            entry => normalizeScottishConstituencyName(entry.name) === normalizeScottishConstituencyName(row.constituency)
          )
          const value = {
            previousWinner2021: row.winner2021 ?? null,
            region: row.region ?? '',
            msp2021: row.msp2021 ?? null,
            turnout: row.turnout ?? null,
            majority: row.majority ?? null,
            shares: row.shares ?? {},
            projected: snapshotEntry?.projected || undefined,
            projectedWinner: snapshotEntry?.projectedWinner || undefined,
          }
          map.set(row.constituency, value)
          map.set(normalizeScottishConstituencyName(row.constituency), value)
        })
        setConstituencyResults(map)
      })
  }, [])

  useEffect(() => {
    if (projectionSnapshotStatus !== 'missing') return

    fetch('/api/scottish-polls')
      .then(res => res.json())
      .then(data => setConstituencyPolls(data.constituencyPolls ?? []))
    fetch('/data/ge2024-pcon.json')
      .then(res => res.json())
      .then(data => setGeLookup(data))
      .catch(() => setGeLookup(null))
    fetch('/data/spc-to-wpc-lookup.json')
      .then(res => res.json())
      .then(data => setSpcToWpcLookup(data))
      .catch(() => setSpcToWpcLookup(null))
    fetch('/data/scotland-wpc-leave-share.json')
      .then(res => res.json())
      .then(data => setWpcLeaveLookup(data))
      .catch(() => setWpcLeaveLookup(null))
    fetch('/data/scotland-tenure-share.json')
      .then(res => res.json())
      .then(data => setTenureLookup(data))
      .catch(() => setTenureLookup(null))
    fetch('/data/scotland-age-share.json')
      .then(res => res.json())
      .then(data => setAgeLookup(data))
      .catch(() => setAgeLookup(null))
    fetch('/data/scotland-degree-share.json')
      .then(res => res.json())
      .then(data => setDegreeLookup(data))
      .catch(() => setDegreeLookup(null))
    fetch('/data/scotland-nssec-share.json')
      .then(res => res.json())
      .then(data => setNssecLookup(data))
      .catch(() => setNssecLookup(null))
  }, [projectionSnapshotStatus])

  useEffect(() => {
    if (!hasMounted || typeof window === 'undefined') return
    const payload = {
      geBlendWeight,
      tenureStrength,
      ageStrength,
      degreeStrength,
      nssecStrength,
      leaveStrength,
      regionStrength,
    }
    window.localStorage.setItem(settingsKey, JSON.stringify(payload))
  }, [
    hasMounted,
    geBlendWeight,
    tenureStrength,
    ageStrength,
    degreeStrength,
    nssecStrength,
    leaveStrength,
    regionStrength,
  ])

  const spcCodeByName = useMemo(() => {
    const map = new Map<string, string>()
    if (!constituencyGeo) return map
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const code = props.SPC22CD || ''
      if (!name || !code) return
      map.set(normalizeScottishConstituencyName(name), code)
    })
    return map
  }, [constituencyGeo])

  const spcToWpcByName = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>()
    ;(spcToWpcLookup?.results ?? []).forEach(row => {
      if (!row?.primaryWpcCode) return
      map.set(normalizeScottishConstituencyName(row.spcName), {
        code: row.primaryWpcCode,
        name: row.primaryWpcName || '',
      })
    })
    return map
  }, [spcToWpcLookup])

  const constituencyAggregate = useMemo(
    () => computeConstituencyAggregate(constituencyPolls),
    [constituencyPolls]
  )

  const projectedResults = useMemo(() => {
    if (projectionSnapshot) {
      const map = new Map(constituencyResults)
      projectionSnapshot.constituencyRows.forEach(entry => {
        const normalizedName = normalizeScottishConstituencyName(entry.name)
        const existing = map.get(entry.name) || map.get(normalizedName) || {
          previousWinner2021: entry.previousWinner2021,
          region: entry.region,
          msp2021: null,
          turnout: null,
          majority: null,
          shares: {
            snp: null,
            conservative: null,
            labour: null,
            libdem: null,
            green: null,
            reform: null,
            other: null,
          },
        }
        const nextValue = {
          ...existing,
          previousWinner2021: existing.previousWinner2021 ?? entry.previousWinner2021,
          region: existing.region || entry.region,
          projected: entry.projected || existing.projected,
          projectedWinner: entry.projectedWinner || existing.projectedWinner,
        }
        map.set(entry.name, nextValue)
        map.set(normalizedName, nextValue)
      })
      return map
    }
    if (!constituencyAggregate) return constituencyResults
    const tenureBaseline: ScotlandTenureShare = tenureLookup?.meta?.baseline || {
      owned: 0,
      socialRented: 0,
      privateRented: 0,
    }
    const ageBaseline: ScotlandAgeShare = ageLookup?.meta?.baseline || {
      age16_34: 0,
      age35_54: 0,
      age55_plus: 0,
    }
    const degreeBaseline: ScotlandDegreeShare = degreeLookup?.meta?.baseline || {
      degree: 0,
      noDegree: 0,
    }
    const nssecBaseline: ScotlandNssecShare = nssecLookup?.meta?.baseline || {
      higher: 0,
      intermediate: 0,
      lower: 0,
    }
    const deltas = {
      snp: constituencyAggregate.snp - BASELINE_2021_CONSTITUENCY.snp,
      conservative: constituencyAggregate.conservative - BASELINE_2021_CONSTITUENCY.conservative,
      labour: constituencyAggregate.labour - BASELINE_2021_CONSTITUENCY.labour,
      libdem: constituencyAggregate.libdem - BASELINE_2021_CONSTITUENCY.libdem,
      green: constituencyAggregate.green - BASELINE_2021_CONSTITUENCY.green,
      reform: constituencyAggregate.reform - SCOTLAND_GE2024_REFORM_BASELINE,
      other: constituencyAggregate.other - BASELINE_2021_CONSTITUENCY.other,
    }
    const map = new Map(constituencyResults)
    for (const [name, result] of map.entries()) {
      const normalizedName = normalizeScottishConstituencyName(name)
      const wpcInfo = spcToWpcByName.get(normalizedName)
      const wpcCode = wpcInfo?.code
      const wpcName = wpcInfo?.name
      const geShares = wpcCode ? geLookup?.pcon?.[wpcCode] : null
      const wpcLeaveByCode = wpcCode ? wpcLeaveLookup?.byCode?.[wpcCode] : null
      const wpcLeaveByName = wpcName
        ? wpcLeaveLookup?.byName?.[normalizeWestminsterName(wpcName)]
        : null
      const leaveShare = wpcLeaveByCode?.leaveShare ?? wpcLeaveByName?.leaveShare ?? null
      const spcCode = spcCodeByName.get(normalizedName)
      const tenureShare =
        (spcCode && tenureLookup?.constituencies?.[spcCode]) || tenureBaseline
      const ageShare = (spcCode && ageLookup?.constituencies?.[spcCode]) || ageBaseline
      const degreeShare =
        (spcCode && degreeLookup?.constituencies?.[spcCode]) || degreeBaseline
      const nssecShare =
        (spcCode && nssecLookup?.constituencies?.[spcCode]) || nssecBaseline
      const regionKey = normalizeRegionName(result.region)
      const regionAdjustments = SCOTLAND_REGION_DELTAS[regionKey] || {}
      const adjustedLeaveShare = clampLeaveShare(
        typeof leaveShare === 'number' ? leaveShare : SCOTLAND_NATIONAL_LEAVE_SHARE
      )
      const tenureAdjustments = {
        snp: getScottishTenureAdjustment('SNP', tenureShare, tenureBaseline),
        conservative: getScottishTenureAdjustment('Conservative', tenureShare, tenureBaseline),
        labour: getScottishTenureAdjustment('Labour', tenureShare, tenureBaseline),
        libdem: getScottishTenureAdjustment('Liberal Democrat', tenureShare, tenureBaseline),
        green: getScottishTenureAdjustment('Green', tenureShare, tenureBaseline),
        reform: getScottishTenureAdjustment('Reform', tenureShare, tenureBaseline),
      }
      const ageAdjustments = {
        snp: getScottishAgeAdjustment('SNP', ageShare, ageBaseline),
        conservative: getScottishAgeAdjustment('Conservative', ageShare, ageBaseline),
        labour: getScottishAgeAdjustment('Labour', ageShare, ageBaseline),
        libdem: getScottishAgeAdjustment('Liberal Democrat', ageShare, ageBaseline),
        green: getScottishAgeAdjustment('Green', ageShare, ageBaseline),
        reform: getScottishAgeAdjustment('Reform', ageShare, ageBaseline),
      }
      const degreeAdjustments = {
        snp: getScottishDegreeAdjustment('SNP', degreeShare, degreeBaseline),
        conservative: getScottishDegreeAdjustment('Conservative', degreeShare, degreeBaseline),
        labour: getScottishDegreeAdjustment('Labour', degreeShare, degreeBaseline),
        libdem: getScottishDegreeAdjustment('Liberal Democrat', degreeShare, degreeBaseline),
        green: getScottishDegreeAdjustment('Green', degreeShare, degreeBaseline),
        reform: getScottishDegreeAdjustment('Reform', degreeShare, degreeBaseline),
      }
      const nssecAdjustments = {
        snp: getScottishNssecAdjustment('SNP', nssecShare, nssecBaseline),
        conservative: getScottishNssecAdjustment('Conservative', nssecShare, nssecBaseline),
        labour: getScottishNssecAdjustment('Labour', nssecShare, nssecBaseline),
        libdem: getScottishNssecAdjustment('Liberal Democrat', nssecShare, nssecBaseline),
        green: getScottishNssecAdjustment('Green', nssecShare, nssecBaseline),
        reform: getScottishNssecAdjustment('Reform', nssecShare, nssecBaseline),
      }
      const leaveAdjustments = {
        snp: getCenteredScottishPartyLeaveAdjustment('SNP', adjustedLeaveShare),
        conservative: getCenteredScottishPartyLeaveAdjustment('Conservative', adjustedLeaveShare),
        labour: getCenteredScottishPartyLeaveAdjustment('Labour', adjustedLeaveShare),
        libdem: getCenteredScottishPartyLeaveAdjustment('Liberal Democrat', adjustedLeaveShare),
        green: getCenteredScottishPartyLeaveAdjustment('Green', adjustedLeaveShare),
        reform: getCenteredScottishPartyLeaveAdjustment('Reform', adjustedLeaveShare),
      }
      const baseShares = {
        snp: result.shares.snp ?? 0,
        conservative: result.shares.conservative ?? 0,
        labour: result.shares.labour ?? 0,
        libdem: result.shares.libdem ?? 0,
        green: result.shares.green ?? 0,
        reform: result.shares.reform ?? 0,
        other: result.shares.other ?? 0,
      }
      const blendedBase = {
        snp:
          geShares?.SNP != null ? blendShare(baseShares.snp, geShares.SNP, geBlendWeight) : baseShares.snp,
        conservative:
          geShares?.Conservative != null
            ? blendShare(baseShares.conservative, geShares.Conservative, geBlendWeight)
            : baseShares.conservative,
        labour:
          geShares?.Labour != null ? blendShare(baseShares.labour, geShares.Labour, geBlendWeight) : baseShares.labour,
        libdem:
          geShares?.['Liberal Democrat'] != null
            ? blendShare(baseShares.libdem, geShares['Liberal Democrat'], geBlendWeight)
            : baseShares.libdem,
        green:
          geShares?.Green != null ? blendShare(baseShares.green, geShares.Green, geBlendWeight) : baseShares.green,
        reform:
          baseShares.reform === 0
            ? getRelativeScottishReformShare(geShares?.Reform)
            : geShares?.Reform != null
              ? blendShare(baseShares.reform, geShares.Reform, geBlendWeight)
              : baseShares.reform,
        other: baseShares.other,
      }
      const swingApplied = {
        snp: blendedBase.snp + deltas.snp,
        conservative: blendedBase.conservative + deltas.conservative,
        labour: blendedBase.labour + deltas.labour,
        libdem: blendedBase.libdem + deltas.libdem,
        green: blendedBase.green + deltas.green,
        reform: blendedBase.reform + deltas.reform,
        other: blendedBase.other + deltas.other,
      }
      const projectedRaw = {
        snp: Math.max(
          0,
          swingApplied.snp +
            tenureStrength * tenureAdjustments.snp +
            ageStrength * ageAdjustments.snp +
            degreeStrength * degreeAdjustments.snp +
            nssecStrength * nssecAdjustments.snp +
            leaveStrength * leaveAdjustments.snp +
            regionStrength * (regionAdjustments.SNP ?? 0)
        ),
        conservative: Math.max(
          0,
          swingApplied.conservative +
            tenureStrength * tenureAdjustments.conservative +
            ageStrength * ageAdjustments.conservative +
            degreeStrength * degreeAdjustments.conservative +
            nssecStrength * nssecAdjustments.conservative +
            leaveStrength * leaveAdjustments.conservative +
            regionStrength * (regionAdjustments.Conservative ?? 0)
        ),
        labour: Math.max(
          0,
          swingApplied.labour +
            tenureStrength * tenureAdjustments.labour +
            ageStrength * ageAdjustments.labour +
            degreeStrength * degreeAdjustments.labour +
            nssecStrength * nssecAdjustments.labour +
            leaveStrength * leaveAdjustments.labour +
            regionStrength * (regionAdjustments.Labour ?? 0)
        ),
        libdem: Math.max(
          0,
          swingApplied.libdem +
            tenureStrength * tenureAdjustments.libdem +
            ageStrength * ageAdjustments.libdem +
            degreeStrength * degreeAdjustments.libdem +
            nssecStrength * nssecAdjustments.libdem +
            leaveStrength * leaveAdjustments.libdem +
            regionStrength * (regionAdjustments['Liberal Democrat'] ?? 0)
        ),
        green: Math.max(
          0,
          swingApplied.green +
            tenureStrength * tenureAdjustments.green +
            ageStrength * ageAdjustments.green +
            degreeStrength * degreeAdjustments.green +
            nssecStrength * nssecAdjustments.green +
            leaveStrength * leaveAdjustments.green +
            regionStrength * (regionAdjustments.Green ?? 0)
        ),
        reform: Math.max(
          0,
          swingApplied.reform +
            tenureStrength * tenureAdjustments.reform +
            ageStrength * ageAdjustments.reform +
            degreeStrength * degreeAdjustments.reform +
            nssecStrength * nssecAdjustments.reform +
            leaveStrength * leaveAdjustments.reform +
            regionStrength * (regionAdjustments.Reform ?? 0)
        ),
        other: Math.max(0, swingApplied.other),
      }
      const total = Object.values(projectedRaw).reduce((sum, value) => sum + value, 0) || 1
      const projected = {
        snp: (projectedRaw.snp / total) * 100,
        conservative: (projectedRaw.conservative / total) * 100,
        labour: (projectedRaw.labour / total) * 100,
        libdem: (projectedRaw.libdem / total) * 100,
        green: (projectedRaw.green / total) * 100,
        reform: (projectedRaw.reform / total) * 100,
        other: (projectedRaw.other / total) * 100,
      }
      const projectedWinner = (
        Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      )
      const projectedWinnerLabel =
        projectedWinner === 'snp'
          ? 'SNP'
          : projectedWinner === 'conservative'
            ? 'Conservative'
            : projectedWinner === 'labour'
              ? 'Labour'
              : projectedWinner === 'libdem'
                ? 'Liberal Democrat'
                : projectedWinner === 'green'
                  ? 'Green'
                  : projectedWinner === 'reform'
                    ? 'Reform'
                    : projectedWinner === 'other'
                      ? 'Other'
                      : null
      map.set(name, {
        ...result,
        leaveShare,
        degreeShare,
        nssecShare,
        projected,
        projectedWinner: projectedWinnerLabel,
      })
    }
    return map
  }, [
    projectionSnapshot,
    constituencyAggregate,
    constituencyResults,
    geLookup,
    spcToWpcByName,
    spcCodeByName,
    wpcLeaveLookup,
    tenureLookup,
    ageLookup,
    degreeLookup,
    nssecLookup,
    geBlendWeight,
    tenureStrength,
    ageStrength,
    degreeStrength,
    nssecStrength,
    leaveStrength,
    regionStrength,
  ])

  const projectedSeatCounts = useMemo(() => {
    const counts: Record<string, number> = {
      SNP: 0,
      Conservative: 0,
      Labour: 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
      Other: 0,
      Unknown: 0,
    }
    if (!constituencyGeo) return counts
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const normalizedName = normalizeScottishConstituencyName(name)
      const result = projectedResults.get(name) || projectedResults.get(normalizedName)
      const winner = result?.projectedWinner || 'Unknown'
      counts[winner] = (counts[winner] || 0) + 1
    })
    return counts
  }, [constituencyGeo, projectedResults])

  const previousSeatCounts = useMemo(() => {
    const counts: Record<string, number> = {
      SNP: 0,
      Conservative: 0,
      Labour: 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
      Other: 0,
      Unknown: 0,
    }
    if (!constituencyGeo) return counts
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      const normalizedName = normalizeScottishConstituencyName(name)
      const result = projectedResults.get(name) || projectedResults.get(normalizedName)
      const prevWinner = result?.previousWinner2021 || 'Unknown'
      counts[prevWinner] = (counts[prevWinner] || 0) + 1
    })
    return counts
  }, [constituencyGeo, projectedResults])

  const projectedSeatSummary = useMemo(() => {
    const parties = Object.keys(projectedSeatCounts)
    return parties
      .map(party => ({
        party,
        seats: projectedSeatCounts[party] || 0,
        delta: (projectedSeatCounts[party] || 0) - (previousSeatCounts[party] || 0),
      }))
      .filter(item => item.seats > 0 || item.delta !== 0)
      .sort((a, b) => b.seats - a.seats)
  }, [projectedSeatCounts, previousSeatCounts])

  const focusFeature = useMemo(() => {
    if (!constituencyGeo || !focusConstituency) return null
    const target = normalizeScottishConstituencyName(focusConstituency)
    for (const feature of constituencyGeo.features) {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      if (!name) continue
      if (normalizeScottishConstituencyName(name) !== target) continue
      return feature
    }
    return null
  }, [constituencyGeo, focusConstituency])

  const constituencyNameIndex = useMemo(() => {
    const map = new Map<string, string>()
    if (!constituencyGeo) return map
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const name = props.SPC22NM || ''
      if (!name) return
      map.set(normalizeScottishConstituencyName(name), name)
    })
    return map
  }, [constituencyGeo])

  const constituencyNames = useMemo(
    () => Array.from(constituencyNameIndex.values()).sort((a, b) => a.localeCompare(b)),
    [constituencyNameIndex]
  )

  const constituencySearchResults = useMemo(() => {
    const query = normalizeScottishConstituencyName(searchValue)
    if (query.length < 2) return []
    return constituencyNames
      .filter(name => normalizeScottishConstituencyName(name).includes(query))
      .slice(0, 6)
  }, [constituencyNames, searchValue])

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    const match = constituencyNameIndex.get(normalizeScottishConstituencyName(value))
    if (match) setFocusConstituency(match)
  }

  const handleSearchSelect = (name: string) => {
    setSearchValue(name)
    setFocusConstituency(name)
  }

  return (
    <PageShell>
      {!isEmbed && (
        <TopNav
          title="Poll of Polls"
          items={MAIN_TOPNAV_ITEMS}
          subtitle="Scottish Parliament Map"
          subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
        />
      )}
      {hasMounted && null}
      <div className="poll-card" style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Search constituencies</div>
        <input
          type="text"
          value={searchValue}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder="Search constituencies"
          style={{
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            padding: '0.6rem 0.75rem',
            borderRadius: '10px',
            border: '1px solid rgba(248, 250, 252, 0.18)',
            fontSize: '0.95rem',
          }}
        />
        {constituencySearchResults.length > 0 ? (
          <div
            style={{
              marginTop: '0.5rem',
              border: '1px solid rgba(248, 250, 252, 0.1)',
              borderRadius: '10px',
              padding: '0.4rem',
              display: 'grid',
              gap: '0.25rem',
              background: '#0d1118',
            }}
          >
            {constituencySearchResults.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => handleSearchSelect(name)}
                style={{
                  textAlign: 'left',
                  padding: '0.5rem 0.65rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--poll-nav-ink)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600 }}>{name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--poll-nav-muted)' }}>
                  Scottish constituency
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="poll-card poll-map-card">
        <div className="poll-map-layout" style={{ height: '100%' }}>
          <div className="poll-card poll-map-sidebar" style={{ maxHeight: '100%', overflow: 'auto' }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.45rem' }}>Map View</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginLeft: '-0.15rem' }}>
                {(['projected', 'incumbent'] as const).map(mode => {
                  const isActive = mapDisplayMode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMapDisplayMode(mode)}
                      style={{
                        padding: '0.45rem 0.65rem',
                        borderRadius: '999px',
                        border: '1px solid var(--poll-border)',
                        background: isActive ? '#2b3444' : '#11151d',
                        color: 'var(--poll-nav-ink)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {mode === 'projected' ? 'Predicted' : 'Incumbent'}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ marginTop: '1rem', fontWeight: 600 }}>Projected Constituency Seats</div>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
              {projectedSeatSummary.map(item => {
                const deltaLabel =
                  item.delta === 0
                    ? '-'
                    : item.delta > 0
                      ? `↑ ${item.delta}`
                      : `↓ ${Math.abs(item.delta)}`
                const deltaColor =
                  item.delta > 0 ? '#1B8A3A' : item.delta < 0 ? '#B02A37' : '#666'
                const color = PARTY_COLORS[item.party] || '#172033'
                return (
                  <div
                    key={item.party}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.98rem',
                    }}
                  >
                    <span style={{ color, minWidth: 0 }}>{item.party}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        gap: '0.5rem',
                        alignItems: 'center',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ color: '#f8fafc' }}>{item.seats}</span>
                      <span style={{ color: deltaColor }}>({deltaLabel})</span>
                    </span>
                  </div>
                )
              })}
            </div>
            <div style={{ marginTop: '0.75rem', color: '#555' }}>
              Click a constituency to see vote share per party.
            </div>
            <div style={{ marginTop: '0.5rem', color: '#f8fafc' }}>
              For the Regional List Seats, please see the{' '}
              <a href="/scottish-parliament-projection" style={{ color: '#f8fafc' }}>
                Scottish Parliamentary Elections Projections Page
              </a>
              .
            </div>
            <button
              style={{ marginTop: '1rem' }}
              onClick={() => (window.location.href = '/electoral-maps')}
            >
              Back to UK overview
            </button>
          </div>
          <div className="poll-map-panel" style={{ height: '100%' }}>
            {constituencyGeo && regionGeo ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <ScottishParliamentMap
                  constituencyGeo={constituencyGeo}
                  regionGeo={regionGeo}
                  countriesGeo={countriesGeo}
                  displayMode={mapDisplayMode}
                  onSelectCountry={country => {
                    if (country === 'england') void router.push('/local-2026', undefined, { scroll: false })
                    if (country === 'wales') void router.push('/welsh-map', undefined, { scroll: false })
                  }}
                  constituencyResults={projectedResults}
                  focusFeature={focusFeature as any}
                />
              </div>
            ) : (
              <div className="poll-map-frame poll-map-frame--placeholder" style={{ height: '100%' }} />
            )}
          </div>
        </div>
      </div>
      
      {hasMounted && (
        <div className="poll-card poll-stack" style={{ marginTop: '1.25rem' }}>
          <div style={{ marginTop: '0.75rem', color: '#555' }}>
            For the projected regional list seats and the predicted Scottish Parliament, please see
            the{' '}
            <a href="/scottish-parliament-projection" style={{ color: '#172033' }}>
              Scottish Parliamentary Elections Projection Page
            </a>
            .
          </div>
        </div>
      )}
    </PageShell>
  )
}
