import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import type { FeatureCollection } from 'geojson'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'

const UkElectoralMap = dynamic(() => import('../../components/UkElectoralMap'), { ssr: false })
const UkBlankMap = dynamic(() => import('../../components/UkBlankMap'), { ssr: false })
const UkSentimentMap = dynamic(() => import('../../components/UkSentimentMap'), { ssr: false })

type ViewMode = 'overview' | 'england' | 'wales' | 'scotland'
type MapMode = 'electoral' | 'sentiment'
type SentimentLayerKey =
  | 'desnz-renewables-winter-2025'
  | 'yougov-alpaca-ai-optimism-may-2025'
  | 'yougov-alpaca-data-centres-support-may-2025'
  | 'yougov-alpaca-data-centres-energy-negative-may-2025'
  | 'alpaca-fon-reform-renewables-trust-oct-2025'
  | 'alpaca-fon-reform-renewables-energy-security-oct-2025'
  | 'alpaca-fon-reform-renewables-net-zero-oct-2025'
  | 'alpaca-fon-reform-renewables-solar-cost-oct-2025'

const SENTIMENT_LABELS: Record<SentimentLayerKey, string> = {
  'desnz-renewables-winter-2025': 'Support for renewable energy',
  'yougov-alpaca-ai-optimism-may-2025': 'Optimism over AI impact',
  'yougov-alpaca-data-centres-support-may-2025': 'Support for local data centres',
  'yougov-alpaca-data-centres-energy-negative-may-2025': 'Concern over data centres and energy supply',
  'alpaca-fon-reform-renewables-trust-oct-2025': 'Trust in renewable infrastructure developers',
  'alpaca-fon-reform-renewables-energy-security-oct-2025': 'Energy security case for renewable infrastructure',
  'alpaca-fon-reform-renewables-net-zero-oct-2025': 'Net-zero case for renewable infrastructure',
  'alpaca-fon-reform-renewables-solar-cost-oct-2025': 'Low-cost solar case for renewable infrastructure',
}

const SENTIMENT_DESCRIPTIONS: Record<SentimentLayerKey, string> = {
  'desnz-renewables-winter-2025': 'DESNZ Public Attitudes Tracker Winter 2025: support or opposition to renewable energy.',
  'yougov-alpaca-ai-optimism-may-2025': 'YouGov / Alpaca Communications May 2025: optimism or pessimism about AI impact on the UK.',
  'yougov-alpaca-data-centres-support-may-2025': 'YouGov / Alpaca Communications May 2025: support for more data centres being developed locally.',
  'yougov-alpaca-data-centres-energy-negative-may-2025': 'YouGov / Alpaca Communications May 2025: perceived impact of new data centres on UK energy supply.',
  'alpaca-fon-reform-renewables-trust-oct-2025': 'Alpaca Communications / Find Out Now October 2025: trust in developers to have local interests at heart.',
  'alpaca-fon-reform-renewables-energy-security-oct-2025': 'Alpaca Communications / Find Out Now October 2025: how convincing energy security is as a reason to support development.',
  'alpaca-fon-reform-renewables-net-zero-oct-2025': 'Alpaca Communications / Find Out Now October 2025: how convincing net-zero is as a reason to support development.',
  'alpaca-fon-reform-renewables-solar-cost-oct-2025': 'Alpaca Communications / Find Out Now October 2025: how convincing low-cost solar is as a reason to support development.',
}

type SentimentConfig = {
  legendTitle: string
  valueLabel: string
  legendMinLabel: string
  legendMaxLabel: string
  rangeMin: number
  rangeMax: number
  colorMode: 'green' | 'purple' | 'yellow' | 'pink'
  regionDisplayMap?: Record<string, { label: string; value: number }>
  supportByRegion: Record<string, number>
}

const RENEWABLE_SUPPORT = {
  'North East': 74,
  'North West': 81,
  'Yorkshire and The Humber': 75,
  'East Midlands': 75,
  'West Midlands': 67,
  'East of England': 73,
  London: 84,
  'South East': 80,
  'South West': 83,
  Wales: 82,
  Scotland: 76,
  'Northern Ireland': 79,
}

const AI_OPTIMISM_DISPLAY = {
  'North East': { label: 'North', value: 19 },
  'North West': { label: 'North', value: 19 },
  'Yorkshire and The Humber': { label: 'North', value: 19 },
  'East Midlands': { label: 'Midlands', value: 15 },
  'West Midlands': { label: 'Midlands', value: 15 },
  'East of England': { label: 'South', value: 17 },
  'South East': { label: 'South', value: 17 },
  'South West': { label: 'South', value: 17 },
  London: { label: 'London', value: 20 },
  Wales: { label: 'Wales', value: 16 },
  Scotland: { label: 'Scotland', value: 12 },
  'Northern Ireland': { label: 'Northern Ireland', value: 16 },
}

const DATA_CENTRE_SUPPORT_DISPLAY = {
  'North East': { label: 'North', value: 44 },
  'North West': { label: 'North', value: 44 },
  'Yorkshire and The Humber': { label: 'North', value: 44 },
  'East Midlands': { label: 'Midlands', value: 38 },
  'West Midlands': { label: 'Midlands', value: 38 },
  'East of England': { label: 'South', value: 45 },
  'South East': { label: 'South', value: 45 },
  'South West': { label: 'South', value: 45 },
  London: { label: 'London', value: 39 },
  Wales: { label: 'Wales', value: 47 },
  Scotland: { label: 'Scotland', value: 45 },
  'Northern Ireland': { label: 'Northern Ireland', value: 52 },
}

const DATA_CENTRE_ENERGY_NEGATIVE_DISPLAY = {
  'North East': { label: 'North', value: 34 },
  'North West': { label: 'North', value: 34 },
  'Yorkshire and The Humber': { label: 'North', value: 34 },
  'East Midlands': { label: 'Midlands', value: 31 },
  'West Midlands': { label: 'Midlands', value: 31 },
  'East of England': { label: 'South', value: 36 },
  'South East': { label: 'South', value: 36 },
  'South West': { label: 'South', value: 36 },
  London: { label: 'London', value: 40 },
  Wales: { label: 'Wales', value: 26 },
  Scotland: { label: 'Scotland', value: 28 },
  'Northern Ireland': { label: 'Northern Ireland', value: 36 },
}

const SENTIMENT_CONFIGS: Record<SentimentLayerKey, SentimentConfig | null> = {
  'desnz-renewables-winter-2025': {
    legendTitle: 'Support for renewables',
    valueLabel: 'Support',
    legendMinLabel: '65%',
    legendMaxLabel: '85%',
    rangeMin: 67,
    rangeMax: 84,
    colorMode: 'green',
    supportByRegion: RENEWABLE_SUPPORT,
  },
  'yougov-alpaca-ai-optimism-may-2025': {
    legendTitle: 'Optimism about AI',
    valueLabel: 'Total Optimistic',
    legendMinLabel: '10%',
    legendMaxLabel: '25%',
    rangeMin: 10,
    rangeMax: 25,
    colorMode: 'purple',
    regionDisplayMap: AI_OPTIMISM_DISPLAY,
    supportByRegion: {},
  },
  'yougov-alpaca-data-centres-support-may-2025': {
    legendTitle: 'Support for data centres',
    valueLabel: 'Support',
    legendMinLabel: '35%',
    legendMaxLabel: '55%',
    rangeMin: 35,
    rangeMax: 55,
    colorMode: 'yellow',
    regionDisplayMap: DATA_CENTRE_SUPPORT_DISPLAY,
    supportByRegion: {},
  },
  'yougov-alpaca-data-centres-energy-negative-may-2025': {
    legendTitle: 'Negative impact on\nenergy supply',
    valueLabel: 'Total Negative Impact',
    legendMinLabel: '25%',
    legendMaxLabel: '45%',
    rangeMin: 25,
    rangeMax: 45,
    colorMode: 'pink',
    regionDisplayMap: DATA_CENTRE_ENERGY_NEGATIVE_DISPLAY,
    supportByRegion: {},
  },
  'alpaca-fon-reform-renewables-trust-oct-2025': null,
  'alpaca-fon-reform-renewables-energy-security-oct-2025': null,
  'alpaca-fon-reform-renewables-net-zero-oct-2025': null,
  'alpaca-fon-reform-renewables-solar-cost-oct-2025': null,
}

const COUNTRY_PROJECTION_SUMMARIES = [
  {
    country: 'England',
    view: 'england' as const,
    metric: 'Projected council control',
    rows: [
      ['Reform', 31],
      ['Liberal Democrat', 20],
      ['Conservative', 10],
      ['Labour', 6],
      ['Green', 3],
      ['No overall control', 47],
    ],
  },
  {
    country: 'Scotland',
    view: 'scotland' as const,
    metric: 'Projected MSPs',
    rows: [
      ['SNP', 55],
      ['Labour', 31],
      ['Conservative', 18],
      ['Liberal Democrat', 11],
      ['Green', 10],
      ['Reform', 4],
    ],
  },
  {
    country: 'Wales',
    view: 'wales' as const,
    metric: 'Projected MSs',
    rows: [
      ['Plaid Cymru', 31],
      ['Labour', 24],
      ['Reform', 18],
      ['Conservative', 13],
      ['Liberal Democrat', 6],
      ['Green', 4],
    ],
  },
]

const SUMMARY_COLORS: Record<string, string> = {
  Labour: '#E4003B',
  Conservative: '#0087DC',
  Reform: '#12B6CF',
  'Liberal Democrat': '#FAA61A',
  Green: '#02A95B',
  SNP: '#FDF38E',
  'Plaid Cymru': '#008672',
  'No overall control': '#9ca3af',
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

function normalizeName(value: string | undefined | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/'s\b/gi, 's')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[',.]/g, ' ')
    .replace(/\bbeneden\b/g, 'benenden')
    .replace(/\s+/g, ' ')
    .trim()
}

type SearchOption = {
  type: 'council' | 'ward' | 'welsh-constituency' | 'scottish-constituency'
  label: string
  searchKey: string
  pathname: string
  query: Record<string, string>
}

type WardBaselineRow = {
  wardCode: string
  wardName: string
  ladCode: string
  ladName: string
}

type BaselineData = {
  wards: WardBaselineRow[]
}

export default function ElectoralMapsPage() {
  const router = useRouter()
  const [mapMode, setMapMode] = useState<MapMode>('electoral')
  const [electoralView, setElectoralView] = useState<ViewMode>('overview')
  const [sentimentLayer, setSentimentLayer] = useState<SentimentLayerKey>('desnz-renewables-winter-2025')
  const [countriesGeo, setCountriesGeo] = useState<FeatureCollection | null>(null)
  const [ladsGeo, setLadsGeo] = useState<FeatureCollection | null>(null)
  const [englandRegionsGeo, setEnglandRegionsGeo] = useState<FeatureCollection | null>(null)
  const [walesSeneddGeo, setWalesSeneddGeo] = useState<FeatureCollection | null>(null)
  const [scotlandConstituencies, setScotlandConstituencies] = useState<FeatureCollection | null>(null)
  const [scotlandRegions, setScotlandRegions] = useState<FeatureCollection | null>(null)
  const [baseline, setBaseline] = useState<BaselineData | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const routeAfterZoomRef = useRef<number | null>(null)
  const sentimentConfig = SENTIMENT_CONFIGS[sentimentLayer]

  const getNationHref = (view: ViewMode) => {
    if (view === 'overview') return null
    if (view === 'england') return '/local-2026'
    if (view === 'wales') return '/welsh-map'
    return '/scottish-map'
  }

  const openNationMap = (view: ViewMode) => {
    const href = getNationHref(view)
    if (!href) return
    if (routeAfterZoomRef.current != null) {
      window.clearTimeout(routeAfterZoomRef.current)
    }
    setElectoralView(view)
    routeAfterZoomRef.current = window.setTimeout(() => {
      routeAfterZoomRef.current = null
      void router.push(href, undefined, { scroll: false })
    }, 360)
  }

  useEffect(() => {
    void loadJson<FeatureCollection>('/data/uk-countries-2022.geojson').then(setCountriesGeo)
    void loadJson<FeatureCollection>('/data/lads.geojson').then(setLadsGeo)
    void loadJson<FeatureCollection>('/data/england-regions.geojson').then(setEnglandRegionsGeo)
    void loadJson<FeatureCollection>('/data/wales-constituencies-2026.geojson').then(setWalesSeneddGeo)
    void loadJson<FeatureCollection>('/data/scotland-constituencies.geojson').then(setScotlandConstituencies)
    void loadJson<FeatureCollection>('/data/scotland-regions.geojson').then(setScotlandRegions)
    void loadJson<BaselineData>('/data/ward-baseline.json').then(setBaseline)
    void router.prefetch('/local-2026')
    void router.prefetch('/scottish-map')
    void router.prefetch('/welsh-map')
  }, [])

  const searchOptions = (() => {
    const options: SearchOption[] = []
    if (baseline?.wards?.length) {
    const councilMap = new Map<string, { ladCode: string; ladName: string }>()
      const wardOptions = baseline.wards.map(ward => {
      councilMap.set(ward.ladCode, { ladCode: ward.ladCode, ladName: ward.ladName })
      return {
        type: 'ward' as const,
        label: `${ward.wardName} — ${ward.ladName}`,
        searchKey: normalizeName(`${ward.wardName} ${ward.ladName}`),
          pathname: '/local-2026',
          query: {
            council: ward.ladCode,
            ward: ward.wardCode,
            wardNameKey: `${normalizeName(ward.ladName)}|${normalizeName(ward.wardName)}`,
          },
      }
    })
    const councilOptions = Array.from(councilMap.values()).map(council => ({
      type: 'council' as const,
      label: council.ladName,
      searchKey: normalizeName(council.ladName),
        pathname: '/local-2026',
        query: { council: council.ladCode },
    }))
      options.push(...councilOptions, ...wardOptions)
    }
    if (walesSeneddGeo?.features?.length) {
      options.push(
        ...walesSeneddGeo.features
          .map(feature => String((feature.properties as any)?.SEN26NM || '').trim())
          .filter(Boolean)
          .map(name => ({
            type: 'welsh-constituency' as const,
            label: name,
            searchKey: normalizeName(name),
            pathname: '/welsh-map',
            query: { constituency: name },
          }))
      )
    }
    if (scotlandConstituencies?.features?.length) {
      options.push(
        ...scotlandConstituencies.features
          .map(feature => String((feature.properties as any)?.SPC22NM || '').trim())
          .filter(Boolean)
          .map(name => ({
            type: 'scottish-constituency' as const,
            label: name,
            searchKey: normalizeName(name),
            pathname: '/scottish-map',
            query: { constituency: name },
          }))
      )
    }
    return options
  })()

  const searchResults =
    normalizeName(searchQuery).length < 2
      ? []
      : searchOptions
          .filter(option => option.searchKey.includes(normalizeName(searchQuery)))
          .slice(0, 5)

  useEffect(() => {
    return () => {
      if (routeAfterZoomRef.current != null) {
        window.clearTimeout(routeAfterZoomRef.current)
      }
    }
  }, [])

  const isOverviewMapReady =
    mapMode === 'sentiment'
      ? Boolean(countriesGeo && englandRegionsGeo)
      : Boolean(countriesGeo && ladsGeo && walesSeneddGeo && scotlandConstituencies)

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle=""
      />
      <div className="poll-card poll-stack" style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1.08rem' }}>How to use the map</div>
        <div className="poll-muted">
          Signal turns current polling and recent election results into constituency, council and
          regional projections. Use the electoral map to choose a nation, then click a region,
          council or constituency to drill into the local projection. Switch to sentiment maps to
          see public attitudes by UK region.
        </div>
      </div>
      <div className="poll-card" style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMapMode('electoral')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '999px',
              border: '1px solid rgba(248, 250, 252, 0.28)',
              background: mapMode === 'electoral' ? '#2b3444' : '#11151d',
              color: '#f8fafc',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Electoral Maps
          </button>
          <button
            onClick={() => setMapMode('sentiment')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '999px',
              border: '1px solid rgba(248, 250, 252, 0.28)',
              background: mapMode === 'sentiment' ? '#2b3444' : '#11151d',
              color: '#f8fafc',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sentiment Maps
          </button>
        </div>
        {mapMode === 'electoral' ? (
          <div style={{ marginTop: '0.75rem' }}>
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search councils, wards or constituencies"
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
            {searchResults.length > 0 ? (
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
                {searchResults.map(option => (
                  <button
                    key={`${option.type}-${option.label}`}
                    type="button"
                    onClick={() => {
                      void router.push(
                        { pathname: option.pathname, query: option.query },
                        undefined,
                        { scroll: false }
                      )
                    }}
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
                    <div style={{ fontWeight: 600 }}>{option.label}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--poll-nav-muted)' }}>
                      {option.type === 'ward'
                        ? 'Ward'
                        : option.type === 'council'
                          ? 'Council'
                          : option.type === 'welsh-constituency'
                            ? 'Welsh constituency'
                            : 'Scottish constituency'}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="poll-card" style={{ height: '86vh', minHeight: '860px', overflow: 'hidden' }}>
        <div className="poll-map-layout" style={{ height: '100%' }}>
          <div
            className="poll-card poll-map-sidebar"
            style={
              mapMode === 'sentiment'
                ? { maxHeight: '100%', overflowY: 'auto', overflowX: 'hidden' }
                : { maxHeight: 'none', overflow: 'visible' }
            }
          >
            {mapMode === 'electoral' ? (
              <div className="poll-stack">
                {COUNTRY_PROJECTION_SUMMARIES.map(summary => (
                  <button
                    key={summary.country}
                    type="button"
                    onClick={() => openNationMap(summary.view)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: '1px solid var(--poll-border)',
                      borderRadius: '14px',
                      padding: '0.75rem',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--poll-nav-ink)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{summary.country}</div>
                    <div className="poll-muted" style={{ fontSize: '0.82rem', marginBottom: '0.45rem' }}>
                      {summary.metric}
                    </div>
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                      {summary.rows.map(([party, count]) => (
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
                                background: SUMMARY_COLORS[String(party)] || '#9ca3af',
                              }}
                            />
                            {party}
                          </span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : mapMode === 'sentiment' ? (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.15rem' }}>Sentiment layers</div>
                {(Object.keys(SENTIMENT_LABELS) as SentimentLayerKey[]).map(layerKey => {
                  const isActive = sentimentLayer === layerKey
                  return (
                    <button
                      key={layerKey}
                      type="button"
                      onClick={() => setSentimentLayer(layerKey)}
                      style={{
                        textAlign: 'left',
                        padding: '0.6rem 0.7rem',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.62)',
                        background: isActive ? '#2b3444' : '#11151d',
                        color: '#f8fafc',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'block' }}>{SENTIMENT_LABELS[layerKey]}</span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: '0.25rem',
                          fontSize: '0.82rem',
                          fontWeight: 400,
                          opacity: 0.72,
                        }}
                      >
                        {SENTIMENT_DESCRIPTIONS[layerKey]}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          <div className="poll-map-panel" style={{ height: '100%' }}>
            {mapMode === 'sentiment' ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                {sentimentConfig ? (
                  <UkSentimentMap
                    key={sentimentLayer}
                    countriesGeo={countriesGeo}
                    englandRegionsGeo={englandRegionsGeo}
                    legendTitle={sentimentConfig.legendTitle}
                    valueLabel={sentimentConfig.valueLabel}
                    legendMinLabel={sentimentConfig.legendMinLabel}
                    legendMaxLabel={sentimentConfig.legendMaxLabel}
                    rangeMin={sentimentConfig.rangeMin}
                    rangeMax={sentimentConfig.rangeMax}
                    colorMode={sentimentConfig.colorMode}
                    regionDisplayMap={sentimentConfig.regionDisplayMap}
                    supportByRegion={sentimentConfig.supportByRegion}
                  />
                ) : (
                  <div className="poll-card poll-stack" style={{ margin: '1rem', maxWidth: '620px' }}>
                    <div style={{ fontWeight: 700 }}>{SENTIMENT_LABELS[sentimentLayer]}</div>
                    <div className="poll-muted">
                      This layer is restored in the selector, but this local project does not
                      currently include the regional values needed to draw it on the map.
                    </div>
                    <div className="poll-muted">
                      Send me the old data file or the regional figures for this October 2025
                      Reform UK supporter poll and I will wire it into the map without inventing
                      values.
                    </div>
                  </div>
                )}
              </div>
            ) : countriesGeo && ladsGeo && walesSeneddGeo && scotlandConstituencies ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <UkElectoralMap
                  view={electoralView}
                  countriesGeo={countriesGeo}
                  englandGeo={ladsGeo}
                  walesGeo={walesSeneddGeo}
                  scotlandConstituencies={scotlandConstituencies}
                  scotlandRegions={scotlandRegions}
                  onSelectView={openNationMap}
                />
              </div>
            ) : (
              <div className="poll-map-frame poll-map-frame--placeholder" style={{ height: '100%' }} />
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
