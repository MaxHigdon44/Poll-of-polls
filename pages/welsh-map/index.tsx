import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import type { FeatureCollection } from 'geojson'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { computePollsterWeight, computeSampleWeight } from '../../lib/weights'
import { getPartyLeaveAdjustment, LEAVE_EFFECT_STRENGTH } from '../../lib/local2026/leaveRemain'
import { AGE_EFFECT_STRENGTH, getAgeAdjustment } from '../../lib/local2026/age'
import { TENURE_EFFECT_STRENGTH, getTenureAdjustment } from '../../lib/local2026/tenure'
import { NSSEC_EFFECT_STRENGTH, getNssecAdjustment } from '../../lib/local2026/nssec'
import { DEGREE_EFFECT_STRENGTH, getDegreeAdjustment } from '../../lib/local2026/degree'
import { RURAL_URBAN_EFFECT_STRENGTH, getRuralUrbanAdjustment } from '../../lib/local2026/ruralUrban'

const PARTY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  'Plaid Cymru': '#008672',
  'Liberal Democrat': '#FAA61A',
  Reform: '#12B6CF',
  Green: '#02A95B',
  Other: '#9a9a9a',
}

const WelshSeneddMap = dynamic(() => import('../../components/WelshSeneddMap'), { ssr: false })

type CountryProjectionSummary = {
  country: string
  view: 'england' | 'scotland' | 'wales'
  metric: string
  rows: Array<{ party: string; count: number; delta: number }>
}

function normalizeWelshName(name: string) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function WelshMapPage() {
  const router = useRouter()
  const embedParam = router.query.embed
  const isEmbed = embedParam === '1' || (Array.isArray(embedParam) && embedParam[0] === '1')
  const [constituencyGeo, setConstituencyGeo] = useState<FeatureCollection | null>(null)
  const [countriesGeo, setCountriesGeo] = useState<FeatureCollection | null>(null)
  const [lookup, setLookup] = useState<any>(null)
  const [gePcon, setGePcon] = useState<any>(null)
  const [polls, setPolls] = useState<any[]>([])
  const [leaveLookup, setLeaveLookup] = useState<any>(null)
  const [ageLookup, setAgeLookup] = useState<any>(null)
  const [tenureLookup, setTenureLookup] = useState<any>(null)
  const [nssecLookup, setNssecLookup] = useState<any>(null)
  const [degreeLookup, setDegreeLookup] = useState<any>(null)
  const [ruralLookup, setRuralLookup] = useState<any>(null)
  const [wardToSenedd, setWardToSenedd] = useState<any>(null)
  const [countrySummaries, setCountrySummaries] = useState<CountryProjectionSummary[]>([])
  const [selectedSeat, setSelectedSeat] = useState<{
    name: string
    result: {
      baseline: Record<string, number>
      projected: Record<string, number>
      projectedWinner: string | null
      seats: Record<string, number>
    } | null
  } | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const cacheBust = useMemo(() => Date.now(), [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const target = params.get('constituency')
    if (target) {
      setSelectedSeat(prev => (prev ? prev : { name: target, result: null }))
    }
  }, [])

  useEffect(() => {
    fetch(
      `https://datamap.gov.wales/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature&typename=geonode:senedd_final_2026&outputFormat=application/json&srsName=EPSG:4326&_=${cacheBust}`
    )
      .then(res => res.json())
      .then(data => setConstituencyGeo(data))
    fetch(`/data/uk-countries-2022.geojson?_=${cacheBust}`)
      .then(res => res.json())
      .then(setCountriesGeo)
      .catch(() => setCountriesGeo(null))
    fetch(`/data/senedd-to-wpc-lookup.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(data => setLookup(data))
    fetch(`/data/ge2024-pcon.json?_=${cacheBust}`)
      .then(res => res.json())
      .then(data => setGePcon(data))
    fetch('/api/welsh-polls')
      .then(res => res.json())
      .then(data => setPolls(data.polls ?? []))
    fetch('/api/home-summaries')
      .then(res => res.json())
      .then(data => setCountrySummaries(Array.isArray(data?.summaries) ? data.summaries : []))
      .catch(() => setCountrySummaries([]))
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
  }, [cacheBust])

  const walesSummary = useMemo(
    () => countrySummaries.find(summary => summary.view === 'wales') || null,
    [countrySummaries]
  )

  const aggregate = useMemo(() => {
    if (!polls.length) return null
    const totals: Record<string, number> = {
      Labour: 0,
      Conservative: 0,
      'Plaid Cymru': 0,
      'Liberal Democrat': 0,
      Green: 0,
      Reform: 0,
      Other: 0,
    }
    const weights = { ...totals }
    const add = (key: keyof typeof totals, value: number | null, weight: number) => {
      if (value == null) return
      totals[key] += value * weight
      weights[key] += weight
    }
    polls.forEach(poll => {
      const pollDate = new Date(poll.poll_date ?? poll.pollDate ?? '')
      const ageDays = Math.max(0, (Date.now() - pollDate.getTime()) / (24 * 60 * 60 * 1000))
      const recency =
        ageDays < 10 ? 1 : ageDays < 20 ? 0.75 : ageDays < 40 ? 0.5 : ageDays < 60 ? 0.25 : 0.1
      const weight =
        recency *
        computePollsterWeight(poll.pollster) *
        computeSampleWeight(poll.sample_size ?? poll.sampleSize ?? null)
      add('Labour', poll.labour, weight)
      add('Conservative', poll.conservative, weight)
      add('Plaid Cymru', poll.pc, weight)
      add('Liberal Democrat', poll.libdem, weight)
      add('Green', poll.green, weight)
      add('Reform', poll.reform, weight)
      add('Other', poll.others, weight)
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
      Other: weights.Other ? totals.Other / weights.Other : null,
    }
  }, [polls])

  const allocateDhondt = (shares: Record<string, number>, seats: number) => {
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

  const projectedResults = useMemo(() => {
    if (!lookup?.results || !gePcon?.pcon) return new Map()
    const baselineNational = {
      Labour: 37,
      'Plaid Cymru': 14.8,
      'Liberal Democrat': 6.5,
      Conservative: 18.2,
      Reform: 16.9,
      Green: 4.7,
      Other: 1.9,
    }
    const aggregateSafe = aggregate || baselineNational
    const deltas = {
      Labour: (aggregateSafe.Labour ?? baselineNational.Labour) - baselineNational.Labour,
      Conservative:
        (aggregateSafe.Conservative ?? baselineNational.Conservative) - baselineNational.Conservative,
      'Plaid Cymru':
        (aggregateSafe['Plaid Cymru'] ?? baselineNational['Plaid Cymru']) -
        baselineNational['Plaid Cymru'],
      'Liberal Democrat':
        (aggregateSafe['Liberal Democrat'] ?? baselineNational['Liberal Democrat']) -
        baselineNational['Liberal Democrat'],
      Reform: (aggregateSafe.Reform ?? baselineNational.Reform) - baselineNational.Reform,
      Green: (aggregateSafe.Green ?? baselineNational.Green) - baselineNational.Green,
      Other: (aggregateSafe.Other ?? baselineNational.Other) - baselineNational.Other,
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

    const map = new Map()
    lookup.results.forEach((row: any) => {
      const overlaps = (row.overlaps || []).slice(0, 2)
      if (!overlaps.length) return
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
            adj += getAgeAdjustment(party, ageShare as any, ageBaseline as any) * AGE_EFFECT_STRENGTH
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
      const winner = Object.entries(projected).sort((a, b) => b[1] - a[1])[0]?.[0] || null
      const seats = allocateDhondt(projected, 6)
      const key = normalizeWelshName(row.seneddName || row.seneddCode || '')
      map.set(key, { baseline, projected, projectedWinner: winner, seats })
    })
    return map
  }, [lookup, gePcon, aggregate])

  const constituencyNameIndex = useMemo(() => {
    const map = new Map<string, string>()
    if (!constituencyGeo) return map
    constituencyGeo.features.forEach(feature => {
      const props: any = feature.properties || {}
      const rawName = props.english_na || props.enw_cymrae || ''
      if (!rawName) return
      map.set(normalizeWelshName(rawName), rawName)
    })
    return map
  }, [constituencyGeo])

  const constituencyNames = useMemo(
    () => Array.from(constituencyNameIndex.values()).sort((a, b) => a.localeCompare(b)),
    [constituencyNameIndex]
  )

  const constituencySearchResults = useMemo(() => {
    const query = normalizeWelshName(searchValue)
    if (query.length < 2) return []
    return constituencyNames
      .filter(name => normalizeWelshName(name).includes(query))
      .slice(0, 6)
  }, [constituencyNames, searchValue])

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    const match = constituencyNameIndex.get(normalizeWelshName(value))
    if (match) {
      const key = normalizeWelshName(match)
      const result = projectedResults.get(key) || null
      setSelectedSeat({ name: match, result })
    }
  }

  const handleSearchSelect = (name: string) => {
    setSearchValue(name)
    const key = normalizeWelshName(name)
    const result = projectedResults.get(key) || null
    setSelectedSeat({ name, result })
  }

  useEffect(() => {
    if (!selectedSeat?.name) return
    if (!projectedResults.size) return
    const key = normalizeWelshName(selectedSeat.name)
    const result = projectedResults.get(key) || null
    setSelectedSeat(prev => (prev ? { ...prev, result: result || prev.result } : prev))
  }, [projectedResults, selectedSeat?.name])

  return (
    <PageShell>
      {!isEmbed && (
        <TopNav
          title="Poll of Polls"
          items={MAIN_TOPNAV_ITEMS}
          subtitle="Senedd Constituency Map"
          subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
        />
      )}
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
                  Welsh constituency
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="poll-card poll-map-card">
        <div className="poll-map-layout" style={{ height: '100%' }}>
          <div className="poll-card poll-map-sidebar" style={{ maxHeight: '100%', overflow: 'auto' }}>
            {selectedSeat ? (
              <>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  {selectedSeat.name}
                </div>
                {selectedSeat.result ? (
                  <>
                    <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>2024 GE baseline</div>
                    {Object.entries(selectedSeat.result.baseline)
                      .sort((a, b) => b[1] - a[1])
                      .map(([party, value]) => (
                        <div key={`baseline-${party}`} style={{ display: 'flex', gap: '0.5rem' }}>
                          <span>{party}:</span>
                          <span>{Math.round(value)}%</span>
                        </div>
                      ))}
                    <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>
                      Projected 2026 vote share
                    </div>
                    {Object.entries(selectedSeat.result.projected)
                      .sort((a, b) => b[1] - a[1])
                      .map(([party, value]) => (
                        <div key={`projected-${party}`} style={{ display: 'flex', gap: '0.5rem' }}>
                          <span>{party}:</span>
                          <span>{Math.round(value)}%</span>
                        </div>
                      ))}
                    <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>
                      Projected Constituency MSs
                    </div>
                    {Object.entries(selectedSeat.result.seats)
                      .filter(([, seats]) => seats > 0)
                      .sort((a, b) => {
                        const shareA = selectedSeat.result?.projected?.[a[0]] ?? 0
                        const shareB = selectedSeat.result?.projected?.[b[0]] ?? 0
                        if (shareB !== shareA) return shareB - shareA
                        return b[1] - a[1]
                      })
                      .map(([party, seats]) => (
                        <div
                          key={`seats-${party}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {Array.from({ length: seats }).map((_, idx) => (
                              <span
                                key={`${party}-dot-${idx}`}
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '999px',
                                  background: PARTY_COLORS[party] || '#999',
                                  display: 'inline-block',
                                }}
                              />
                            ))}
                          </div>
                          <span>{party}:</span>
                          <span>{seats}</span>
                        </div>
                      ))}
                  </>
                ) : (
                  <div className="poll-muted">No projection loaded.</div>
                )}
                <button style={{ marginTop: '1rem' }} onClick={() => setSelectedSeat(null)}>
                  Clear selection
                </button>
              </>
            ) : (
              <>
                {walesSummary ? (
                  <div
                    style={{
                      border: '1px solid var(--poll-border)',
                      borderRadius: '14px',
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      marginTop: '1rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{walesSummary.country}</div>
                    <div
                      className="poll-muted"
                      style={{ fontSize: '0.82rem', marginBottom: '0.45rem' }}
                    >
                      {walesSummary.metric}
                    </div>
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                      {walesSummary.rows.map(({ party, count }) => (
                        <div
                          key={party}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '999px',
                                background: PARTY_COLORS[party] || '#9ca3af',
                              }}
                            />
                            {party}
                          </span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="poll-muted" style={{ marginTop: '0.75rem' }}>
                  Colour of the constituency represents the largest party in each constituency.
                  <br />
                  <br />
                  Click a constituency to see the MSs elected, and the projected vote share per party.
                </div>
                <button
                  style={{ marginTop: '1rem' }}
                  onClick={() => (window.location.href = '/electoral-maps')}
                >
                  Back to UK overview
                </button>
              </>
            )}
          </div>
          <div className="poll-map-panel" style={{ height: '100%' }}>
            {constituencyGeo ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <WelshSeneddMap
                  constituencyGeo={constituencyGeo}
                  countriesGeo={countriesGeo}
                  projectedResults={projectedResults}
                  onSelectConstituency={setSelectedSeat}
                  selectedName={selectedSeat?.name || null}
                  onSelectCountry={country => {
                    if (country === 'england') void router.push('/local-2026', undefined, { scroll: false })
                    if (country === 'scotland') void router.push('/scottish-map', undefined, { scroll: false })
                  }}
                />
              </div>
            ) : (
              <div className="poll-map-frame poll-map-frame--placeholder" style={{ height: '100%' }} />
            )}
          </div>
        </div>
      </div>
      <div className="poll-card poll-stack" style={{ marginTop: '1.25rem' }}>
        <div style={{ marginTop: '0.75rem', color: '#555' }}>
          For a full list of projected constituency results and the predicted Senedd, please see the{' '}
          <a href="/senedd-projection" style={{ color: '#172033' }}>
            Senedd Projections Page
          </a>
          .
        </div>
      </div>
    </PageShell>
  )
}
