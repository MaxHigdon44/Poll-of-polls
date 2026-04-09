import dynamic from 'next/dynamic'
import { useState } from 'react'
import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'
import type {
  UnifiedFocusRegion,
  UnifiedLayerKey,
  UnifiedSidebarData,
} from '../../components/CombinedOverviewMap'

const CombinedOverviewMap = dynamic(() => import('../../components/CombinedOverviewMap'), { ssr: false })

const COUNCIL_TYPE_OPTIONS = [
  { key: 'district', label: 'District Councils', color: '#2E8B57' },
  { key: 'county', label: 'County Councils', color: '#E75480' },
  { key: 'london', label: 'London Boroughs', color: '#6A1B9A' },
  { key: 'metro', label: 'Metropolitan Boroughs', color: '#FB8C00' },
  { key: 'unitary', label: 'Unitary Authorities', color: '#1E88E5' },
] as const
type CouncilCategory = (typeof COUNCIL_TYPE_OPTIONS)[number]['key']

export default function ElectoralMapsPage() {
  const [focusRegion, setFocusRegion] = useState<UnifiedFocusRegion>('all')
  const [focusResetToken, setFocusResetToken] = useState(0)
  const [showSentiment, setShowSentiment] = useState(false)
  const [visibleCouncilTypes, setVisibleCouncilTypes] = useState<Set<CouncilCategory>>(
    () => new Set(COUNCIL_TYPE_OPTIONS.map(option => option.key))
  )
  const [sidebarData, setSidebarData] = useState<UnifiedSidebarData>({
    selectedEnglishCouncilName: null,
    selectedScottishConstituency: null,
    scottishSeatSummary: [],
    selectedWelshConstituency: null,
  })

  const selectedLayers = new Set<UnifiedLayerKey>([
    'english-local',
    'scottish-parliament',
    'welsh-senedd',
    ...(showSentiment ? (['renewables-sentiment'] as UnifiedLayerKey[]) : []),
  ])

  const activateFocusRegion = (
    region: UnifiedFocusRegion,
    options?: { resetSelections?: boolean }
  ) => {
    setFocusRegion(region)
    if (options?.resetSelections !== false) {
      setFocusResetToken(prev => prev + 1)
    }
  }

  const renderMapPanel = () => {
    return (
      <CombinedOverviewMap
        key="combined-overview"
        selectedLayers={selectedLayers}
        visibleCouncilTypes={visibleCouncilTypes}
        focusRegion={focusRegion}
        focusResetToken={focusResetToken}
        onSidebarDataChange={setSidebarData}
        onRequestFocusRegion={activateFocusRegion}
      />
    )
  }

  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Electoral and Sentiment Maps"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card" style={{ height: '86vh', minHeight: '860px', overflow: 'hidden' }}>
        <div className="poll-map-layout" style={{ height: '100%' }}>
          <div className="poll-card poll-map-sidebar" style={{ maxHeight: '100%', overflow: 'auto' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Map View</div>
            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.85rem' }}>
              {[
                ['all', 'All Elections'],
                ['english', 'English Local Elections'],
                ['scotland', 'Scotland'],
                ['wales', 'Wales'],
              ].map(([key, label]) => {
                const active = focusRegion === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      activateFocusRegion(key as UnifiedFocusRegion, { resetSelections: true })
                    }
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '12px',
                      border: active ? '1px solid #172033' : '1px solid rgba(15, 23, 42, 0.16)',
                      background: active ? '#172033' : '#fff',
                      color: active ? '#fff' : '#172033',
                      cursor: 'pointer',
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setShowSentiment(prev => !prev)}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '12px',
                  border: showSentiment ? '1px solid #0f5132' : '1px solid rgba(15, 23, 42, 0.16)',
                  background: showSentiment ? '#dff3e7' : '#fff',
                  color: '#172033',
                  cursor: 'pointer',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                Renewables Sentiment: {showSentiment ? 'On' : 'Off'}
              </button>
            </div>

            {focusRegion === 'english' ? (
              <>
                {sidebarData.selectedEnglishCouncilName ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.45rem' }}>
                      {sidebarData.selectedEnglishCouncilName}
                    </div>
                    <div className="poll-muted" style={{ marginBottom: '0.8rem' }}>
                      Ward or division colouring is now shown on the map for this selected council. Click any ward or division for projected vote-share details.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Council Types</div>
                    {COUNCIL_TYPE_OPTIONS.map(option => {
                      const checked = visibleCouncilTypes.has(option.key)
                      return (
                        <label
                          key={option.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.55rem',
                            marginBottom: '0.45rem',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setVisibleCouncilTypes(prev => {
                                const next = new Set(prev)
                                if (next.has(option.key)) next.delete(option.key)
                                else next.add(option.key)
                                return next
                              })
                            }}
                          />
                          <span style={{ width: '12px', height: '12px', background: option.color }} />
                          <span>{option.label}</span>
                        </label>
                      )
                    })}
                    <div className="poll-muted" style={{ marginTop: '0.75rem' }}>
                      Click a council area to zoom into ward or division projections.
                    </div>
                  </>
                )}
              </>
            ) : null}

            {focusRegion === 'scotland' ? (
              <>
                {sidebarData.selectedScottishConstituency ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.45rem' }}>
                      {sidebarData.selectedScottishConstituency.name}
                    </div>
                    {sidebarData.selectedScottishConstituency.projectedWinner ? (
                      <div style={{ color: '#555', marginBottom: '0.55rem' }}>
                        Projected winner: {sidebarData.selectedScottishConstituency.projectedWinner}
                      </div>
                    ) : null}
                    {(sidebarData.selectedScottishConstituency.projected
                      ? Object.entries(sidebarData.selectedScottishConstituency.projected)
                          .sort((a, b) => b[1] - a[1])
                      : []
                    ).map(([party, value]) => (
                      <div key={party} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span>{party}</span>
                        <span>{value.toFixed(1)}%</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div style={{ marginTop: '1rem', fontWeight: 600 }}>Projected Constituency Seats</div>
                    <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {sidebarData.scottishSeatSummary.map(item => {
                        const deltaLabel =
                          item.delta === 0 ? '-' : item.delta > 0 ? `↑ ${item.delta}` : `↓ ${Math.abs(item.delta)}`
                        const deltaColor = item.delta > 0 ? '#1B8A3A' : item.delta < 0 ? '#B02A37' : '#666'
                        return (
                          <div
                            key={item.party}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          >
                            <span>{item.party}</span>
                            <span style={{ fontWeight: 600 }}>
                              {item.seats} <span style={{ color: deltaColor }}>({deltaLabel})</span>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="poll-muted" style={{ marginTop: '0.75rem' }}>
                      Click a constituency to see projected constituency vote share.
                    </div>
                  </>
                )}
              </>
            ) : null}

            {focusRegion === 'wales' ? (
              <>
                {sidebarData.selectedWelshConstituency ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.45rem' }}>
                      {sidebarData.selectedWelshConstituency.name}
                    </div>
                    {sidebarData.selectedWelshConstituency.result ? (
                      <>
                        <div style={{ fontWeight: 600, marginTop: '0.35rem' }}>2024 GE baseline</div>
                        {Object.entries(sidebarData.selectedWelshConstituency.result.baseline)
                          .sort((a, b) => b[1] - a[1])
                          .map(([party, value]) => (
                            <div key={`baseline-${party}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{party}</span>
                              <span>{value.toFixed(1)}%</span>
                            </div>
                          ))}
                        <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>Projected 2026 vote share</div>
                        {Object.entries(sidebarData.selectedWelshConstituency.result.projected)
                          .sort((a, b) => b[1] - a[1])
                          .map(([party, value]) => (
                            <div key={`projected-${party}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{party}</span>
                              <span>{value.toFixed(1)}%</span>
                            </div>
                          ))}
                        <div style={{ fontWeight: 600, marginTop: '0.75rem' }}>Projected Constituency MSs</div>
                        {Object.entries(sidebarData.selectedWelshConstituency.result.seats)
                          .filter(([, seats]) => seats > 0)
                          .sort((a, b) => {
                            const shareA = sidebarData.selectedWelshConstituency?.result?.projected?.[a[0]] ?? 0
                            const shareB = sidebarData.selectedWelshConstituency?.result?.projected?.[b[0]] ?? 0
                            if (shareB !== shareA) return shareB - shareA
                            return b[1] - a[1]
                          })
                          .map(([party, seats]) => (
                            <div
                              key={`seats-${party}`}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ display: 'flex', gap: '4px' }}>
                                  {Array.from({ length: seats }).map((_, idx) => (
                                    <span
                                      key={`${party}-dot-${idx}`}
                                      style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '999px',
                                        background:
                                          party === 'Labour'
                                            ? '#E4003B'
                                            : party === 'Conservative'
                                              ? '#0087DC'
                                              : party === 'Plaid Cymru'
                                                ? '#008672'
                                                : party === 'Liberal Democrat'
                                                  ? '#FAA61A'
                                                  : party === 'Reform'
                                                    ? '#12B6CF'
                                                    : party === 'Green'
                                                      ? '#02A95B'
                                                      : '#9a9a9a',
                                        display: 'inline-block',
                                      }}
                                    />
                                  ))}
                                </span>
                                <span>{party}</span>
                              </span>
                              <span>{seats}</span>
                            </div>
                          ))}
                        <button
                          type="button"
                          style={{ marginTop: '1rem' }}
                          onClick={() => activateFocusRegion('wales')}
                        >
                          Clear selection
                        </button>
                      </>
                    ) : (
                      <div className="poll-muted">No projection loaded.</div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ marginTop: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                      Parties
                    </div>
                    {[
                      ['Labour', '#E4003B'],
                      ['Conservative', '#0087DC'],
                      ['Plaid Cymru', '#008672'],
                      ['Liberal Democrat', '#FAA61A'],
                      ['Reform', '#12B6CF'],
                      ['Green', '#02A95B'],
                      ['Other', '#9a9a9a'],
                    ].map(([party, color]) => (
                      <div key={party} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span style={{ width: '12px', height: '12px', background: color }} />
                        <span>{party}</span>
                      </div>
                    ))}
                    <div className="poll-muted" style={{ marginTop: '0.75rem' }}>
                      Colour of the constituency represents the largest party in each constituency.
                      <br />
                      <br />
                      Click a constituency to see the MSs elected, and the projected vote share per party.
                    </div>
                  </>
                )}
              </>
            ) : null}

            {focusRegion === 'all' ? (
              <div className="poll-muted" style={{ marginTop: '0.2rem', marginBottom: '1rem' }}>
                All political layers stay visible on one shared map. Use the region buttons to jump focus, and toggle renewables sentiment on top when needed.
              </div>
            ) : null}
          </div>

          <div className="poll-card poll-map-panel" style={{ height: '100%' }}>
            <div className="poll-map-frame" style={{ height: '100%' }}>
              {renderMapPanel()}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
