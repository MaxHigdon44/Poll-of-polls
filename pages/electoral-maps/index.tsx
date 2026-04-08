import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
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

export default function ElectoralMapsPage() {
  const router = useRouter()
  const [view, setView] = useState<ViewMode>('overview')
  const [mapMode, setMapMode] = useState<MapMode>('electoral')
  const [sentimentLayer, setSentimentLayer] = useState<SentimentLayerKey>('desnz-renewables-winter-2025')
  const [countriesGeo, setCountriesGeo] = useState<FeatureCollection | null>(null)
  const [ladsGeo, setLadsGeo] = useState<FeatureCollection | null>(null)
  const [englandRegionsGeo, setEnglandRegionsGeo] = useState<FeatureCollection | null>(null)
  const [walesSeneddGeo, setWalesSeneddGeo] = useState<FeatureCollection | null>(null)
  const [scotlandConstituencies, setScotlandConstituencies] = useState<FeatureCollection | null>(null)
  const [scotlandRegions, setScotlandRegions] = useState<FeatureCollection | null>(null)

  useEffect(() => {
    if (view === 'overview') return
    const href =
      view === 'england'
        ? '/local-2026'
        : view === 'wales'
          ? '/welsh-map'
          : '/scottish-map'
    router.push(href)
    setView('overview')
  }, [router, view])

  useEffect(() => {
    fetch('/data/uk-countries-2022.geojson')
      .then(res => res.json())
      .then(data => setCountriesGeo(data))
    fetch('/data/lads.geojson')
      .then(res => res.json())
      .then(data => setLadsGeo(data))
    fetch('/data/england-regions.geojson')
      .then(res => res.json())
      .then(data => setEnglandRegionsGeo(data))
    fetch('/data/wales-constituencies-2026.geojson')
      .then(res => res.json())
      .then(data => setWalesSeneddGeo(data))
    fetch('/data/scotland-constituencies.geojson')
      .then(res => res.json())
      .then(data => setScotlandConstituencies(data))
    fetch('/data/scotland-regions.geojson')
      .then(res => res.json())
      .then(data => setScotlandRegions(data))
  }, [])

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="UK Overview"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card" style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Map options</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMapMode('electoral')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '999px',
              border: '1px solid rgba(15, 23, 42, 0.15)',
              background: mapMode === 'electoral' ? '#172033' : '#fff',
              color: mapMode === 'electoral' ? '#fff' : '#172033',
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
              border: '1px solid rgba(15, 23, 42, 0.15)',
              background: mapMode === 'sentiment' ? '#172033' : '#fff',
              color: mapMode === 'sentiment' ? '#fff' : '#172033',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sentiment Maps
          </button>
        </div>
      </div>
      <div className="poll-card" style={{ height: '86vh', minHeight: '860px', overflow: 'hidden' }}>
        <div className="poll-map-layout" style={{ height: '100%' }}>
          <div className="poll-card poll-map-sidebar" style={{ maxHeight: '100%', overflow: 'auto' }}>
            {mapMode === 'electoral' && view === 'overview' ? (
              <div className="poll-muted">
                Click England, Scotland, or Wales to open each electoral map.
              </div>
            ) : mapMode === 'sentiment' ? (
              <>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Sentiment layers</div>
                <button
                  onClick={() => setSentimentLayer('desnz-renewables-winter-2025')}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.7rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                    background:
                      sentimentLayer === 'desnz-renewables-winter-2025' ? '#172033' : '#fff',
                    color:
                      sentimentLayer === 'desnz-renewables-winter-2025' ? '#fff' : '#172033',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  DESNZ Public Attitudes Tracker Winter 2025 - Do you support or oppose the use of
                  renewable energy for providing our electricity, fuel and heat?
                </button>
                <button
                  onClick={() => setSentimentLayer('yougov-alpaca-ai-optimism-may-2025')}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.7rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                    background:
                      sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025' ? '#172033' : '#fff',
                    color:
                      sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025' ? '#fff' : '#172033',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  YouGov / Alpaca Communications May 2025 Data Centres Survey - In general,
                  would you say you are optimistic or pessimistic about the impact that Artificial
                  Intelligence will have on the UK overall?
                </button>
                <button
                  onClick={() => setSentimentLayer('yougov-alpaca-data-centres-support-may-2025')}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.7rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                    background:
                      sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                        ? '#172033'
                        : '#fff',
                    color:
                      sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                        ? '#fff'
                        : '#172033',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  YouGov / Alpaca Communications May 2025 Data Centres Survey - Would you
                  support more data centres being developed in your area?
                </button>
                <button
                  onClick={() => setSentimentLayer('yougov-alpaca-data-centres-energy-negative-may-2025')}
                  style={{
                    textAlign: 'left',
                    padding: '0.6rem 0.7rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(15, 23, 42, 0.12)',
                    background:
                      sentimentLayer === 'yougov-alpaca-data-centres-energy-negative-may-2025'
                        ? '#172033'
                        : '#fff',
                    color:
                      sentimentLayer === 'yougov-alpaca-data-centres-energy-negative-may-2025'
                        ? '#fff'
                        : '#172033',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  YouGov / Alpaca Communications May 2025 Data Centres Survey - Do you
                  think that the development of new data centres in the UK would have a positive
                  or negative impact on energy supply in the UK?
                </button>
              </>
            ) : null}
          </div>
          <div className="poll-card poll-map-panel" style={{ height: '100%' }}>
            {mapMode === 'sentiment' ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <UkSentimentMap
                  key={sentimentLayer}
                  countriesGeo={countriesGeo}
                  englandRegionsGeo={englandRegionsGeo}
                  legendTitle={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? 'Support for renewables'
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? 'Optimism about AI'
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? 'Support for data centres'
                          : 'Negative impact on\nenergy supply'
                  }
                  valueLabel={
                    sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                      ? 'Total Optimistic'
                      : sentimentLayer === 'yougov-alpaca-data-centres-energy-negative-may-2025'
                        ? 'Total Negative Impact'
                        : 'Support'
                  }
                  legendMinLabel={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? '65%'
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? '10%'
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? '35%'
                          : '25%'
                  }
                  legendMaxLabel={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? '85%'
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? '25%'
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? '55%'
                          : '45%'
                  }
                  rangeMin={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? 67
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? 10
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? 35
                          : 25
                  }
                  rangeMax={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? 84
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? 25
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? 55
                          : 45
                  }
                  colorMode={
                    sentimentLayer === 'desnz-renewables-winter-2025'
                      ? 'green'
                      : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                        ? 'purple'
                        : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                          ? 'yellow'
                          : 'pink'
                  }
                  regionDisplayMap={
                    sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                      ? {
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
                      : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                        ? {
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
                        : sentimentLayer === 'yougov-alpaca-data-centres-energy-negative-may-2025'
                          ? {
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
                      : {
                          'North East': { label: 'North East', value: 74 },
                          'North West': { label: 'North West', value: 81 },
                          'Yorkshire and The Humber': { label: 'Yorkshire and The Humber', value: 75 },
                          'East Midlands': { label: 'East Midlands', value: 75 },
                          'West Midlands': { label: 'West Midlands', value: 67 },
                          'East of England': { label: 'East of England', value: 73 },
                          London: { label: 'London', value: 84 },
                          'South East': { label: 'South East', value: 80 },
                          'South West': { label: 'South West', value: 83 },
                          Wales: { label: 'Wales', value: 82 },
                          Scotland: { label: 'Scotland', value: 76 },
                          'Northern Ireland': { label: 'Northern Ireland', value: 79 },
                        }
                  }
                  supportByRegion={{
                    ...(sentimentLayer === 'desnz-renewables-winter-2025'
                      ? {
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
                        : sentimentLayer === 'yougov-alpaca-ai-optimism-may-2025'
                          ? {
                              'North East': 19,
                              'North West': 19,
                              'Yorkshire and The Humber': 19,
                            'East Midlands': 15,
                            'West Midlands': 15,
                            London: 20,
                            'East of England': 17,
                            'South East': 17,
                            'South West': 17,
                            Wales: 16,
                            Scotland: 12,
                            'Northern Ireland': 16,
                          }
                          : sentimentLayer === 'yougov-alpaca-data-centres-support-may-2025'
                            ? {
                                'North East': 44,
                                'North West': 44,
                                'Yorkshire and The Humber': 44,
                                'East Midlands': 38,
                                'West Midlands': 38,
                                London: 39,
                                'East of England': 45,
                                'South East': 45,
                                'South West': 45,
                                Wales: 47,
                                Scotland: 45,
                                'Northern Ireland': 52,
                              }
                            : {
                                'North East': 34,
                                'North West': 34,
                                'Yorkshire and The Humber': 34,
                                'East Midlands': 31,
                                'West Midlands': 31,
                                London: 40,
                                'East of England': 36,
                                'South East': 36,
                                'South West': 36,
                                Wales: 26,
                                Scotland: 28,
                                'Northern Ireland': 36,
                              }),
                  }}
                />
              </div>
            ) : countriesGeo && ladsGeo && walesSeneddGeo && scotlandConstituencies ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <UkElectoralMap
                  view={view}
                  countriesGeo={countriesGeo}
                  englandGeo={ladsGeo}
                  walesGeo={walesSeneddGeo}
                  scotlandConstituencies={scotlandConstituencies}
                  scotlandRegions={scotlandRegions}
                  onSelectView={setView}
                />
              </div>
            ) : (
              <div className="poll-muted">Loading map...</div>
            )}
          </div>
        </div>
      </div>
      <div className="poll-card poll-stack" style={{ marginTop: '1.25rem' }}>
        <div style={{ marginTop: '0.5rem', color: '#666' }} />
      </div>
    </PageShell>
  )
}
