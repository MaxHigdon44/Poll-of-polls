import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import type { FeatureCollection } from 'geojson'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import { getScottishConstituencyName } from '../../lib/scotland/constituencyNames'
import SCOTLAND_2026_RESULTS from '../../public/data/scotland-2026-results.json'
import { computeWalesElectedMsTotals } from '../../lib/wales/electionResults2026'

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
  | 'findoutnow-alpaca-renewables-trust-oct-2025'
  | 'findoutnow-alpaca-energy-security-convincing-oct-2025'
  | 'findoutnow-alpaca-net-zero-convincing-oct-2025'
  | 'findoutnow-alpaca-solar-low-cost-convincing-oct-2025'

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

type SentimentConfig = {
  buttonLabel: string
  legendTitle: string
  valueLabel: string
  legendMinLabel: string
  legendMaxLabel: string
  rangeMin: number
  rangeMax: number
  colorMode: 'green' | 'purple' | 'yellow' | 'pink' | 'blue' | 'orange' | 'red' | 'magenta'
  regionDisplayMap: Record<string, { label: string; value: number }>
  supportByRegion: Record<string, number>
}

type CountryProjectionSummary = {
  country: string
  view: Exclude<ViewMode, 'overview'>
  metric: string
  rows: Array<{ party: string; count: number; delta: number }>
}

const ENGLAND_RESULTS_SUMMARY: CountryProjectionSummary = {
  country: 'England',
  view: 'england',
  metric: 'Council control results',
  rows: [
    { party: 'No overall control', count: 64, delta: 0 },
    { party: 'Labour', count: 24, delta: 0 },
    { party: 'Liberal Democrat', count: 17, delta: 0 },
    { party: 'Reform', count: 13, delta: 0 },
    { party: 'Conservative', count: 10, delta: 0 },
    { party: 'Green', count: 5, delta: 0 },
    { party: 'Other', count: 1, delta: 0 },
  ],
}

const SCOTLAND_RESULTS_BASELINE: Record<string, number> = {
  SNP: 64,
  Conservative: 31,
  Labour: 22,
  'Liberal Democrat': 4,
  Green: 8,
  Reform: 0,
  Other: 0,
}

const WALES_RESULTS_BASELINE: Record<string, number> = {
  Labour: 30,
  Conservative: 16,
  'Plaid Cymru': 13,
  'Liberal Democrat': 1,
  Reform: 0,
  Green: 0,
  Other: 0,
}

const SENTIMENT_LABELS: Record<SentimentLayerKey, string> = {
  'desnz-renewables-winter-2025': 'Support for renewable energy',
  'yougov-alpaca-ai-optimism-may-2025': 'Optimism over AI impact',
  'yougov-alpaca-data-centres-support-may-2025': 'Support for local data centres',
  'yougov-alpaca-data-centres-energy-negative-may-2025':
    'Concern over data centres and energy supply',
  'findoutnow-alpaca-renewables-trust-oct-2025':
    'Trust in renewable infrastructure developers',
  'findoutnow-alpaca-energy-security-convincing-oct-2025':
    'Energy security case for renewable infrastructure',
  'findoutnow-alpaca-net-zero-convincing-oct-2025':
    'Net-zero case for renewable infrastructure',
  'findoutnow-alpaca-solar-low-cost-convincing-oct-2025':
    'Low-cost solar case for renewable infrastructure',
}

const SENTIMENT_DESCRIPTIONS: Record<SentimentLayerKey, string> = {
  'desnz-renewables-winter-2025':
    'DESNZ Public Attitudes Tracker Winter 2025: support or opposition to renewable energy.',
  'yougov-alpaca-ai-optimism-may-2025':
    'YouGov / Alpaca Communications May 2025: optimism or pessimism about AI impact on the UK.',
  'yougov-alpaca-data-centres-support-may-2025':
    'YouGov / Alpaca Communications May 2025: support for more data centres being developed locally.',
  'yougov-alpaca-data-centres-energy-negative-may-2025':
    'YouGov / Alpaca Communications May 2025: perceived impact of new data centres on UK energy supply.',
  'findoutnow-alpaca-renewables-trust-oct-2025':
    'Alpaca Communications / Find Out Now October 2025: trust in developers to have local interests at heart.',
  'findoutnow-alpaca-energy-security-convincing-oct-2025':
    'Alpaca Communications / Find Out Now October 2025: how convincing energy security is as a reason to support development.',
  'findoutnow-alpaca-net-zero-convincing-oct-2025':
    'Alpaca Communications / Find Out Now October 2025: how convincing net-zero is as a reason to support development.',
  'findoutnow-alpaca-solar-low-cost-convincing-oct-2025':
    'Alpaca Communications / Find Out Now October 2025: how convincing low-cost solar is as a reason to support development.',
}

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

const COUNTRY_WINNER_PARTIES = new Set([
  'Labour',
  'Conservative',
  'Reform',
  'Liberal Democrat',
  'Green',
  'SNP',
  'Plaid Cymru',
])

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

const SENTIMENT_CONFIGS: Record<SentimentLayerKey, SentimentConfig> = {
  'desnz-renewables-winter-2025': {
    buttonLabel:
      'DESNZ Public Attitudes Tracker Winter 2025 - Do you support or oppose the use of renewable energy for providing our electricity, fuel and heat?',
    legendTitle: 'Support for renewables',
    valueLabel: 'Support',
    legendMinLabel: '65%',
    legendMaxLabel: '85%',
    rangeMin: 67,
    rangeMax: 84,
    colorMode: 'green',
    regionDisplayMap: {
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
    },
    supportByRegion: RENEWABLE_SUPPORT,
  },
  'yougov-alpaca-ai-optimism-may-2025': {
    buttonLabel:
      'YouGov / Alpaca Communications May 2025 Data Centres Survey - In general, would you say you are optimistic or pessimistic about the impact that Artificial Intelligence will have on the UK overall?',
    legendTitle: 'Optimism about AI',
    valueLabel: 'Total Optimistic',
    legendMinLabel: '10%',
    legendMaxLabel: '25%',
    rangeMin: 10,
    rangeMax: 25,
    colorMode: 'purple',
    regionDisplayMap: AI_OPTIMISM_DISPLAY,
    supportByRegion: {
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
    },
  },
  'yougov-alpaca-data-centres-support-may-2025': {
    buttonLabel:
      'YouGov / Alpaca Communications May 2025 Data Centres Survey - Would you support more data centres being developed in your area?',
    legendTitle: 'Support for data centres',
    valueLabel: 'Support',
    legendMinLabel: '35%',
    legendMaxLabel: '55%',
    rangeMin: 35,
    rangeMax: 55,
    colorMode: 'yellow',
    regionDisplayMap: DATA_CENTRE_SUPPORT_DISPLAY,
    supportByRegion: {
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
    },
  },
  'yougov-alpaca-data-centres-energy-negative-may-2025': {
    buttonLabel:
      'YouGov / Alpaca Communications May 2025 Data Centres Survey - Do you think that the development of new data centres in the UK would have a positive or negative impact on energy supply in the UK?',
    legendTitle: 'Negative impact on\nenergy supply',
    valueLabel: 'Total Negative Impact',
    legendMinLabel: '25%',
    legendMaxLabel: '45%',
    rangeMin: 25,
    rangeMax: 45,
    colorMode: 'pink',
    regionDisplayMap: DATA_CENTRE_ENERGY_NEGATIVE_DISPLAY,
    supportByRegion: {
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
    },
  },
  'findoutnow-alpaca-renewables-trust-oct-2025': {
    buttonLabel:
      'Alpaca Communications / Find Out Now October 2025 Poll of Reform UK Supportes - If there were proposals to build renewable infrastructure near where you live, to what extent would you trust the developers to have your best interests at heart?',
    legendTitle: "Don't trust at all",
    valueLabel: "Don't trust at all",
    legendMinLabel: '57%',
    legendMaxLabel: '68%',
    rangeMin: 57,
    rangeMax: 68,
    colorMode: 'blue',
    regionDisplayMap: {
      'North East': { label: 'North East', value: 64.1 },
      'North West': { label: 'North West', value: 67.93 },
      'Yorkshire and The Humber': { label: 'Yorkshire and The Humber', value: 62.5 },
      'East Midlands': { label: 'East Midlands', value: 61.22 },
      'West Midlands': { label: 'West Midlands', value: 60.59 },
      'South East': { label: 'South East', value: 61.7 },
      'South West': { label: 'South West', value: 57.89 },
    },
    supportByRegion: {
      'North East': 64.1,
      'North West': 67.93,
      'Yorkshire and The Humber': 62.5,
      'East Midlands': 61.22,
      'West Midlands': 60.59,
      'South East': 61.7,
      'South West': 57.89,
    },
  },
  'findoutnow-alpaca-energy-security-convincing-oct-2025': {
    buttonLabel:
      "Alpaca Communications / Find Out Now October 2025 Poll of Reform UK Supportes - If there were proposals to build renewable infrastructure near where you live, how convincing would you find securing the UK's energy security as a reason to support the development?",
    legendTitle: 'Very Convincing or\nFairly Convincing',
    valueLabel: 'Very Convincing or Fairly Convincing',
    legendMinLabel: '6%',
    legendMaxLabel: '13%',
    rangeMin: 6,
    rangeMax: 13,
    colorMode: 'orange',
    regionDisplayMap: {
      'North East': { label: 'North East', value: 6.41 },
      'North West': { label: 'North West', value: 11.84 },
      'Yorkshire and The Humber': { label: 'Yorkshire and The Humber', value: 7.36 },
      'East Midlands': { label: 'East Midlands', value: 8.15 },
      'West Midlands': { label: 'West Midlands', value: 12.81 },
      'South East': { label: 'South East', value: 12.24 },
      'South West': { label: 'South West', value: 9.69 },
    },
    supportByRegion: {
      'North East': 6.41,
      'North West': 11.84,
      'Yorkshire and The Humber': 7.36,
      'East Midlands': 8.15,
      'West Midlands': 12.81,
      'South East': 12.24,
      'South West': 9.69,
    },
  },
  'findoutnow-alpaca-net-zero-convincing-oct-2025': {
    buttonLabel:
      'Alpaca Communications / Find Out Now October 2025 Poll of Reform UK Supportes - If there were proposals to build renewable infrastructure near where you live, how convincing would you find achieving net-zero in response to the climate emergency as a reason to support the development?',
    legendTitle: 'Very Convincing or\nFairly Convincing',
    valueLabel: 'Very Convincing or Fairly Convincing',
    legendMinLabel: '1%',
    legendMaxLabel: '7%',
    rangeMin: 1,
    rangeMax: 7,
    colorMode: 'magenta',
    regionDisplayMap: {
      'North East': { label: 'North East', value: 3.29 },
      'North West': { label: 'North West', value: 6.63 },
      'Yorkshire and The Humber': { label: 'Yorkshire and The Humber', value: 1.28 },
      'East Midlands': { label: 'East Midlands', value: 4.89 },
      'West Midlands': { label: 'West Midlands', value: 4.43 },
      'South East': { label: 'South East', value: 3.73 },
      'South West': { label: 'South West', value: 2.21 },
    },
    supportByRegion: {
      'North East': 3.29,
      'North West': 6.63,
      'Yorkshire and The Humber': 1.28,
      'East Midlands': 4.89,
      'West Midlands': 4.43,
      'South East': 3.73,
      'South West': 2.21,
    },
  },
  'findoutnow-alpaca-solar-low-cost-convincing-oct-2025': {
    buttonLabel:
      "Alpaca Communications / Find Out Now October 2025 Poll of Reform UK Supportes - If there were proposals to build renewable infrastructure near where you live, how convincing would you find the fact that solar is one of the UK's lowest cost sources of electricity as a reason to support the development?",
    legendTitle: 'Very Convincing or\nFairly Convincing',
    valueLabel: 'Very Convincing or Fairly Convincing',
    legendMinLabel: '2%',
    legendMaxLabel: '12%',
    rangeMin: 2,
    rangeMax: 12,
    colorMode: 'red',
    regionDisplayMap: {
      'North East': { label: 'North East', value: 2.21 },
      'North West': { label: 'North West', value: 6.52 },
      'Yorkshire and The Humber': { label: 'Yorkshire and The Humber', value: 8.97 },
      'East Midlands': { label: 'East Midlands', value: 9.69 },
      'West Midlands': { label: 'West Midlands', value: 9.36 },
      'South East': { label: 'South East', value: 11.17 },
      'South West': { label: 'South West', value: 9.21 },
    },
    supportByRegion: {
      'North East': 2.21,
      'North West': 6.52,
      'Yorkshire and The Humber': 8.97,
      'East Midlands': 9.69,
      'West Midlands': 9.36,
      'South East': 11.17,
      'South West': 9.21,
    },
  },
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
  }, [router])

  const countrySummaries = useMemo<CountryProjectionSummary[]>(() => {
    const scotlandCounts = ((SCOTLAND_2026_RESULTS as any).combinedSeatCounts || {}) as Record<string, number>
    const scotlandRows = Object.entries(scotlandCounts)
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([party, count]) => ({
        party,
        count: Number(count),
        delta: Number(count) - (SCOTLAND_RESULTS_BASELINE[party] || 0),
      }))

    const walesCounts = computeWalesElectedMsTotals()
    const walesRows = Object.entries(walesCounts)
      .filter(([, count]) => Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([party, count]) => ({
        party,
        count: Number(count),
        delta: Number(count) - (WALES_RESULTS_BASELINE[party] || 0),
      }))

    return [
      ENGLAND_RESULTS_SUMMARY,
      { country: 'Scotland', view: 'scotland', metric: 'MSP results', rows: scotlandRows },
      { country: 'Wales', view: 'wales', metric: 'MS results', rows: walesRows },
    ]
  }, [])

  const searchOptions = useMemo(() => {
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
          .map(feature => getScottishConstituencyName((feature.properties as any) || {}))
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
  }, [baseline, scotlandConstituencies, walesSeneddGeo])

  const searchResults =
    normalizeName(searchQuery).length < 2
      ? []
      : searchOptions.filter(option => option.searchKey.includes(normalizeName(searchQuery))).slice(0, 5)

  const currentSentiment = SENTIMENT_CONFIGS[sentimentLayer]
  const isOverviewMapReady =
    mapMode === 'sentiment'
      ? Boolean(countriesGeo && englandRegionsGeo)
      : Boolean(countriesGeo && ladsGeo && walesSeneddGeo && scotlandConstituencies)

  const countryWinnerColors = useMemo(() => {
    return Object.fromEntries(
      countrySummaries.map(summary => {
        const topParty = summary.rows
          .filter(row => COUNTRY_WINNER_PARTIES.has(row.party))
          .sort((a, b) => b.count - a.count)[0]?.party
        return [summary.view, SUMMARY_COLORS[topParty || ''] || '#64748b']
      })
    ) as Partial<Record<'england' | 'scotland' | 'wales', string>>
  }, [countrySummaries])

  return (
    <PageShell>
      <TopNav title="Poll of Polls" items={MAIN_TOPNAV_ITEMS} />
      <div className="poll-card poll-stack" style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1.08rem' }}>How to use the map</div>
        <div className="poll-muted">
          Signal turns current polling and recent election results into constituency, council and regional
          projections. Use the electoral map to choose a nation, then click a region, council or constituency
          to drill into the local projection. Switch to sentiment maps to see public attitudes by UK region.
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
                      void router.push({ pathname: option.pathname, query: option.query }, undefined, {
                        scroll: false,
                      })
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
      <div className="poll-card poll-map-card">
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
                {countrySummaries.length === 0 ? (
                  <div className="poll-muted">Loading live summaries…</div>
                ) : null}
                {countrySummaries.map(summary => (
                  <button
                    key={summary.country}
                    type="button"
                    onClick={() => {
                      setElectoralView(summary.view)
                      const href =
                        summary.view === 'england'
                          ? '/local-2026'
                          : summary.view === 'wales'
                            ? '/welsh-map'
                            : '/scottish-map'
                      void router.push(href, undefined, { scroll: false })
                    }}
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
                      {summary.rows.map(({ party, count }) => (
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
            ) : (
              <div className="poll-stack">
                {(Object.keys(SENTIMENT_CONFIGS) as SentimentLayerKey[]).map(key => (
                  <button
                    key={key}
                    onClick={() => setSentimentLayer(key as SentimentLayerKey)}
                    style={{
                      textAlign: 'left',
                      padding: '0.6rem 0.7rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(248, 250, 252, 0.14)',
                      background: sentimentLayer === key ? '#2b3444' : '#11151d',
                      color: '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'block', fontWeight: 600 }}>
                      {SENTIMENT_LABELS[key]}
                    </span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: '0.2rem',
                        color: 'var(--poll-nav-muted)',
                        fontSize: '0.78rem',
                        lineHeight: 1.35,
                        fontWeight: 500,
                      }}
                    >
                      {SENTIMENT_DESCRIPTIONS[key]}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="poll-map-panel" style={{ height: '100%' }}>
            {mapMode === 'sentiment' ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <UkSentimentMap
                  key={sentimentLayer}
                  countriesGeo={countriesGeo}
                  englandRegionsGeo={englandRegionsGeo}
                  legendTitle={currentSentiment.legendTitle}
                  valueLabel={currentSentiment.valueLabel}
                  legendMinLabel={currentSentiment.legendMinLabel}
                  legendMaxLabel={currentSentiment.legendMaxLabel}
                  rangeMin={currentSentiment.rangeMin}
                  rangeMax={currentSentiment.rangeMax}
                  colorMode={currentSentiment.colorMode}
                  noDataLabel="Not enough data"
                  regionDisplayMap={currentSentiment.regionDisplayMap}
                  supportByRegion={currentSentiment.supportByRegion}
                />
              </div>
            ) : isOverviewMapReady ? (
              <div className="poll-map-frame" style={{ height: '100%' }}>
                <UkElectoralMap
                  view={electoralView}
                  countriesGeo={countriesGeo}
                  englandGeo={ladsGeo}
                  walesGeo={walesSeneddGeo}
                  scotlandConstituencies={scotlandConstituencies}
                  scotlandRegions={scotlandRegions}
                  countryWinnerColors={countryWinnerColors}
                  onSelectView={selectedView => {
                    setElectoralView(selectedView)
                    const href =
                      selectedView === 'england'
                        ? '/local-2026'
                        : selectedView === 'wales'
                          ? '/welsh-map'
                          : '/scottish-map'
                    void router.push(href, undefined, { scroll: false })
                  }}
                />
              </div>
            ) : (
              <div className="poll-map-frame poll-map-frame--placeholder" style={{ height: '100%' }}>
                <UkBlankMap countriesGeo={countriesGeo} />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
