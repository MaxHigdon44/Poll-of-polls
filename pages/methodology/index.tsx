import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'

export default function MethodologyPage() {
  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Model Methodology"
        subtitleStyle={{ fontSize: '1.5rem', color: '#172033' }}
      />
      <div className="poll-card poll-prose">
        <p>
          This page documents the Poll of Polls local election model used to predict the May 2026
          Local Elections in England. In short, the model starts from each ward or county electoral
          division&apos;s previous local result, blends in a small amount of 2024 general election
          geography, applies the current national polling average, then adjusts party shares using
          demographic and geographic factors before converting vote shares into seats.
        </p>

        <h2>1. National Polling Average</h2>
        <p>
        The national aggregate is built from recent Westminster voting intention polls on
        Wikipedia&apos;s{' '}
        <a href="https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_United_Kingdom_general_election">
          Opinion polling for the next United Kingdom general election
        </a>{' '}
        page. Polls are scraped from the national tables for the current year, limited to the most
        recent two months, and stored in Vercel Postgres.
        </p>
        <p>The aggregate is a weighted average. Each poll is weighted by:</p>
        <ul>
        <li>
          recency: less than 7 days = 1.0, less than 14 = 0.75, less than 28 = 0.5, less than 42
          = 0.25, otherwise 0.1
        </li>
        <li>
          pollster quality: for example YouGov, Survation, More in Common and Ipsos Mori are
          weighted at 1.1, most others at 1.0, Find Out Now at 0.9
        </li>
        <li>sample size: square root of sample size, capped at 3000</li>
        </ul>

        <h2>2. Baseline Local Results</h2>
        <p>
        The main model file is <code>public/data/ward-baseline.json</code>. Each row stores:
        </p>
        <ul>
        <li>ward or county electoral division code and name</li>
        <li>council code and name</li>
        <li>the most recent local election year used as the baseline</li>
        <li>party vote shares from that election</li>
        <li>local party and independent vote shares separately from national parties</li>
        <li>vacancies, total votes and previous winner information where available</li>
        </ul>
        <p>
        These baseline rows are compiled primarily from House of Commons Library spreadsheets:
        </p>
        <ul>
        <li>
          <code>data/raw/LEH-2024-results-HoC-version.xlsx</code>
        </li>
        <li>
          <code>data/raw/LEH-Candidates-2023.xlsx</code>
        </li>
        <li>
          <code>data/raw/local-elections-2022.xlsx</code>
        </li>
        <li>
          <code>data/raw/LEH-2021.xlsx</code>
        </li>
        </ul>
        <p>
        For some councils where the Commons Library files are incomplete at ward level, the model
        supplements them with Wikipedia ward-result pages.
        </p>

        <h2>3. Geography Files</h2>
        <p>
        Map shapes are loaded from public GeoJSON files generated from official boundary sources:
        </p>
        <ul>
        <li>
          <code>public/data/wards.geojson</code>: 2025 electoral ward boundaries
        </li>
        <li>
          <code>public/data/ced.geojson</code>: county electoral divisions used in the 2026 model
        </li>
        <li>
          <code>public/data/counties.geojson</code>: county council polygons
        </li>
        <li>
          <code>public/data/lads.geojson</code>: local authority polygons
        </li>
        </ul>
        <p>
        These are pulled from ONS/Open Geography Portal and ArcGIS Open Data downloads in the build
        scripts.
        </p>

        <h2>4. 2024 General Election Link</h2>
        <p>
        Each ward or division is linked to a 2024 Westminster constituency through
        <code>public/data/ward-to-pcon.json</code> and <code>public/data/ced-to-pcon.json</code>.
        Constituency-level 2024 vote shares are stored in <code>public/data/ge2024-pcon.json</code>.
        </p>
        <p>
        The model applies a light blend between the local baseline and the 2024 constituency result:
        </p>
        <ul>
        <li>Reform weight: 0.35</li>
        <li>Green weight: 0.05</li>
        <li>Labour / Conservative / Liberal Democrat / SNP / Plaid Cymru weight: 0.05</li>
        </ul>
        <p>
        For Reform and Green, if the local baseline is zero, the model uses their constituency
        over- or under-performance relative to their national 2024 general election share rather
        than just dropping in the raw constituency number.
        </p>

        <h2>5. Ward Projection Formula</h2>
        <p>
        After the baseline has been blended with the 2024 constituency result, each national
        party&apos;s unscaled score is:
        </p>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '1rem',
          overflowX: 'auto',
          borderRadius: '6px',
          lineHeight: 1.5,
        }}
      >
        <code>
          {`score =
  max(
    0,
    carried_baseline
    + national_delta
    + leave_adjustment
    + age_adjustment
    + region_adjustment
    + nssec_adjustment
    + degree_adjustment
    + tenure_adjustment
    + rural_urban_adjustment
          ) * concentration_multiplier`}
        </code>
      </pre>

        <h3>5.1 Baseline carry for Labour</h3>
        <p>
        Labour&apos;s local baseline is deliberately carried forward at 93% rather than 100% in
        2021, 2022 and 2024 baseline rows. Other parties currently keep 100% of their baseline
        share before the national delta is applied.
      </p>

      <h3>5.2 National delta</h3>
      <p style={{ lineHeight: 1.6 }}>The national delta is:</p>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '1rem',
          overflowX: 'auto',
          borderRadius: '6px',
          lineHeight: 1.5,
        }}
      >
        <code>{`current_poll_share - baseline_national_share_for_that_year`}</code>
      </pre>
      <p style={{ lineHeight: 1.6 }}>
        The relevant baseline year comes from the ward&apos;s own last local election year. So a
        2021 county division uses the model&apos;s stored 2021 national baseline, while a 2024 ward
        uses the stored 2024 baseline.
      </p>
      <p style={{ lineHeight: 1.6 }}>Current party-specific overrides in the live 2026 model:</p>
      <ul>
        <li>
          Labour negative deltas are multiplied by 1.4 for 2021 rows, 1.3 for 2022 rows, and 1.15
          for 2024 rows
        </li>
        <li>Conservative negative deltas are damped to 90% only in wards last contested in 2021</li>
        <li>
          Reform positive deltas are damped to 95% in 2021 wards where the previous baseline winner
          was Conservative
        </li>
        <li>SNP is only allowed to project in Scotland</li>
        <li>Plaid Cymru is only allowed to project in Wales</li>
      </ul>

      <h2>6. Demographic adjustments</h2>
      <p style={{ lineHeight: 1.6 }}>
        The model applies a series of <strong>additive party-specific adjustments</strong> based on
        demographic and geographic characteristics. These adjustments are designed to capture
        systematic differences in party support across different types of areas.
      </p>
      <p style={{ lineHeight: 1.6 }}>
        Each adjustment is applied to <strong>centred variables</strong>, meaning that effects are
        only introduced where a ward or electoral division differs from the national or
        dataset-level average. This ensures the model adjusts relative strength rather than
        inflating overall vote shares.
      </p>

      <h3>6.1 Sources of adjustment values</h3>
      <p style={{ lineHeight: 1.6 }}>
        The direction and magnitude of each demographic effect, meaning whether a party performs
        better or worse in a given group, are derived from an aggregate of recent polling
        crossbreaks.
      </p>
      <p style={{ lineHeight: 1.6 }}>
        For each variable, multiple recent polls were sourced that had voting breakdowns for the
        given adjustment. For each poll:
      </p>
      <ul>
        <li>party support within each subgroup was compared to overall headline support</li>
        <li>the difference, or delta, was calculated</li>
        <li>these deltas were then averaged across all available polls for that variable</li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        This produces a set of relative performance adjustments for each party within each
        demographic category. These are then mapped onto wards and electoral divisions using Census
        and ONS data.
      </p>

      <h3>6.2 Variables and strength parameters</h3>
      <p style={{ lineHeight: 1.6 }}>
        The following demographic and geographic factors are included, each with an adjustable
        strength parameter:
      </p>
      <ul>
        <li>
          <strong>Leave / Remain</strong>: 0.8
        </li>
        <li>
          <strong>Age</strong>: 0.8
        </li>
        <li>
          <strong>Region</strong>: 0.5
        </li>
        <li>
          <strong>NS-SEC (socio-economic classification)</strong>: 0.8
        </li>
        <li>
          <strong>Degree attainment</strong>: 0.8
        </li>
        <li>
          <strong>Housing tenure</strong>: 0.8
        </li>
        <li>
          <strong>Rural / Urban classification</strong>: 0.8
        </li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        These strength parameters scale the impact of each variable on projected vote share.
      </p>

      <h3>6.3 Implementation</h3>
      <p style={{ lineHeight: 1.6 }}>For each ward or electoral division:</p>
      <ol>
        <li>the demographic profile is calculated</li>
        <li>each variable is compared to its national baseline</li>
        <li>poll-derived party adjustments are applied proportionally</li>
        <li>adjustments are scaled by the relevant strength parameter</li>
        <li>all adjustments are summed to produce a net demographic effect</li>
      </ol>
      <p style={{ lineHeight: 1.6 }}>Because all variables are centred, the model:</p>
      <ul>
        <li>does <strong>not</strong> add uniform party boosts across all areas</li>
        <li>
          instead redistributes support based on how a ward or electoral division differs from the
          average
        </li>
      </ul>

      <h3>6.4 Interpretation</h3>
      <p style={{ lineHeight: 1.6 }}>
        These adjustments should be understood as <strong>relative modifiers of party support</strong>,
        not standalone predictors. They allow the model to reflect well-established geographic
        patterns in British voting behaviour, such as:
      </p>
      <ul>
        <li>stronger Green support in urban, younger, graduate-heavy areas</li>
        <li>stronger Reform support in older, Leave-leaning, and rural areas</li>
        <li>
          variation in Labour and Conservative strength across socio-economic and regional lines
        </li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        The lookup files themselves are stored in:
      </p>
      <ul>
        <li>
          <code>public/data/leave-share.json</code>
        </li>
        <li>
          <code>public/data/age-share.json</code>
        </li>
        <li>
          <code>public/data/lad-region.json</code>
        </li>
        <li>
          <code>public/data/nssec-share.json</code>
        </li>
        <li>
          <code>public/data/degree-share.json</code>
        </li>
        <li>
          <code>public/data/tenure-share.json</code>
        </li>
        <li>
          <code>public/data/rural-urban-share.json</code>
        </li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        They are generated from a mixture of ward-level files, LAD-level fallbacks, and LSOA-based
        aggregations via lookup tables. The raw source files in <code>data/raw</code> include:
      </p>
      <ul>
        <li>
          <code>leave_ward.xlsx</code> and <code>leave_lad.csv</code> for EU referendum leave share
        </li>
        <li>
          <code>age_ward.csv</code> for age structure
        </li>
        <li>
          <code>nssec_ward.csv</code> for NS-SEC
        </li>
        <li>
          <code>degree_ward.csv</code> for degree attainment
        </li>
        <li>
          <code>tenure_lsoa_grouped.csv</code> and <code>tenure_england_wales.csv</code> for housing tenure
        </li>
        <li>
          <code>lsoa_rural_urban_2011.geojson</code> plus <code>lsoa11_to_lsoa21.geojson</code> for rural/urban classification
        </li>
        <li>
          <code>lsoa_to_ward_2025.geojson</code> and <code>ward_to_ced_2025.geojson</code> for aggregation up to wards and county divisions
        </li>
        <li>
          <code>lad_region_2023.csv</code> for region mapping
        </li>
      </ul>

      <h2>7. Local Parties and Independents</h2>
      <p style={{ lineHeight: 1.6 }}>
        Local parties and independents are kept separate from the national-party block. Their stored
        baseline share is reduced to 90%, then held aside before the national-party shares are
        rescaled into the remaining vote space. This is designed to preserve local non-national
        strength without allowing it to completely dominate the map.
      </p>

      <h2>8. Concentration Multipliers</h2>
      <p style={{ lineHeight: 1.6 }}>
        The model includes simple concentration boosts for parties whose support is often
        geographically concentrated:
      </p>
      <ul>
        <li>Liberal Democrat: 1.1x if baseline is at least 15%, 1.2x if at least 25%</li>
        <li>Green: 1.1x if baseline is at least 12%, 1.2x if at least 20%</li>
      </ul>

      <h2>9. Multi-member Seat Allocation</h2>
      <p style={{ lineHeight: 1.6 }}>
        Once projected vote shares are produced, seats are assigned ward by ward using a simplified
        local rule:
      </p>
      <ul>
        <li>1 seat up: the top party wins the seat</li>
        <li>2 seats up: if second place is within 2 points, seats split 1-1; otherwise top party wins both</li>
        <li>3 seats up: if second place is within 3 points, seats split 2-1; otherwise top party wins all three</li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        This is why the map can show a striped ward even when one party is still the top party on
        vote share: the ward may be splitting councillors between the top two parties.
      </p>

      <h2>10. Vacancy and Control Data</h2>
      <p style={{ lineHeight: 1.6 }}>
        Council metadata is stored in <code>public/data/council-seats.json</code> and
        <code>public/data/council-previous.json</code>. Ward seat counts are supplemented through
        <code>public/data/ward-vacancies.json</code>, which is built from:
      </p>
      <ul>
        <li>
          <code>LEH-2021.xlsx</code>
        </li>
        <li>
          <code>local-elections-2022.xlsx</code>
        </li>
        <li>
          <code>london-2022-wards.xlsx</code>
        </li>
      </ul>
      <p style={{ lineHeight: 1.6 }}>
        This is used so multi-member London all-out wards and other councils with incomplete
        vacancy fields still allocate the correct number of seats.
      </p>

      <h2>11. Build Scripts</h2>
      <p style={{ lineHeight: 1.6 }}>
        The main files used to build and maintain the model data are:
      </p>
      <ul>
        <li>
          <code>scripts/build-local-2026.cjs</code>: main local-election dataset builder
        </li>
        <li>
          <code>scripts/build-ge2024.cjs</code>: 2024 constituency mapping and result tables
        </li>
        <li>
          <code>scripts/build-ward-vacancies.cjs</code>: ward vacancy lookup
        </li>
        <li>
          <code>scripts/build-degree.cjs</code>, <code>scripts/build-nssec.cjs</code>, <code>scripts/build-lad-region.cjs</code>
        </li>
      </ul>
      </div>
    </PageShell>
  )
}
