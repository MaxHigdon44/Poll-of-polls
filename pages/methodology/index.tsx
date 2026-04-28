import PageShell from '../../components/PageShell'
import TopNav, { MAIN_TOPNAV_ITEMS } from '../../components/TopNav'

export default function MethodologyPage() {
  return (
    <PageShell>
      <TopNav
        title="Poll of Polls"
        items={MAIN_TOPNAV_ITEMS}
        subtitle="Methodology"
      />
      <div className="poll-card poll-prose">
        <p>
          This page documents the methodology behind Signal&apos;s election models, used to predict
          the May 2026 English Local Elections, the Scottish Parliamentary Elections, and the
          Senedd Elections.
        </p>

        <p>
          In short, the model starts from each ward, electoral division or constituency&apos;s
          previous election result, adjusts according to the current polling average, and then
          refines projected party shares in each seat by using local demographic data.
        </p>

        <h2>1. Polling Averages</h2>
        <p>
          The polling averages are built from recent voting intention polls for the Westminster
          elections, the Scottish Parliamentary elections, and the Senedd elections. These polls
          are sourced from Wikipedia.
        </p>
        <p>
          To create each polling average, polls are weighted according to polling quality, sample
          size, and recency. For instance, for the UK National Polling Average the recency weights
          are as follows:
        </p>
        <ul>
          <li>Less than 7 days old = 1.0</li>
          <li>7-14 days old = 0.75</li>
          <li>14-28 days old = 0.5</li>
          <li>28-42 = 0.25</li>
          <li>42-62 days = 0.1</li>
        </ul>

        <h2>2. Baseline Local Results</h2>
        <p>
          To calculate a ward, electoral division, or constituency&apos;s projected result, each
          model starts with the electoral baseline. For Scottish parliament constituencies and the
          vast majority of English councils, this baseline is simply that seat&apos;s electoral
          results from the previous iteration of the given election. For the new Welsh
          constituencies and seats in new local authorities, such as East Surrey Council, electoral
          baselines are calculated using the new seat&apos;s results from other previous elections.
          In Wales, for example, each Senedd constituency is a combination of two Welsh
          Westminster constituencies, and therefore an amalgamation of two 2024 General Election
          results is used as a baseline.
        </p>

        <h2>3. General Election Blend</h2>
        <p>
          Each ward, division, or constituency is also linked to a 2024 Westminster constituency.
          This allows for a light blend to be applied between the local baseline and the 2024
          General Election constituency result. This change is largely designed to capture the rise
          in support for Reform UK that began just prior to the 2024 General Election, and
          therefore is not reflected in elections from 2023 or earlier, which form the bulk of the
          electoral baselines.
        </p>

        <h2>4. Applying National Polling Swings</h2>
        <p>
          In a given seat, each party&apos;s vote share from the blended electoral baseline is then
          adjusted using the difference between its current polling average and how the party
          performed nationally in the election that formed the electoral baseline (the
          &ldquo;National Swing&rdquo;). In other words, the pre-adjustment vote share for a given
          party in a given seat = their electoral baseline +/- national swing.
        </p>
        <p>
          There are also some party-specific adaptions to how this calculation works to improve the
          accuracy of the model.
        </p>

        <h2>5. Demographic and Geographic Adjustments</h2>
        <p>
          The model then applies a series of additive party-specific adjustments based on
          demographic and geographic characteristics. These adjustments are based on demographic
          breakdowns of party polling as well as previous voting behaviour. Each adjustment is
          applied to centred variables, meaning that effects are only introduced where a ward,
          electoral division or constituency differs from the national or dataset-level average.
          This ensures the model adjusts relative strength rather than inflating overall vote
          shares.
        </p>
        <p>The following demographic and geographic factors are adjusted for:</p>
        <ul>
          <li>2016 Brexit Referendum Result</li>
          <li>Age profile</li>
          <li>NS-SEC (socio-economic classification)</li>
          <li>Education levels</li>
          <li>Rural / Urban classification</li>
          <li>Housing tenure</li>
          <li>Regional variation</li>
        </ul>
        <p>
          These adjustments, alongside a concentration multiplier for smaller parties, should be
          understood as relative modifiers of party support. They allow the model to reflect
          well-established patterns in British voting behaviour, such as:
        </p>
        <ul>
          <li>stronger Green support in urban, younger, graduate-heavy areas</li>
          <li>stronger Reform support in older, Leave-leaning, and rural areas</li>
          <li>
            variation in Labour and Conservative strength across socio-economic and regional lines
          </li>
        </ul>

        <h2>6. Local Parties and Independents</h2>
        <p>Local parties and independent candidates are treated separately from national parties.</p>
        <p>
          Their previous vote share is largely preserved, with only a small reduction applied
          before national party vote shares are recalculated around them.
        </p>
        <p>This ensures that:</p>
        <ul>
          <li>Strong local groups continue to perform well in areas where they are established.</li>
          <li>National swings do not unrealistically overwhelm local political dynamics.</li>
        </ul>

        <h2>7. Converting Votes into Seats</h2>
        <p>
          Once vote shares are projected, they are translated into seats. For single-member seats,
          as in Scotland or parts of English local government, it is simply the party with the
          highest vote that wins. In Welsh Senedd constituencies, the D&apos;Hondt formula is used
          to determine how the six-member constituencies are divided between parties.
        </p>
        <p>
          For English multi-member seats, larger leads usually result in one party winning all
          available seats. In closer contests, representation is often split. Therefore, if two
          seats are up for election in a ward, and the second place party is within 2% points of
          the first placed party, the model projects that the seats are split evenly.
        </p>
        <p>
          For three-member constituencies, if the second place-party is within 3% points of the
          first-place, then seats are split 2-1 in favour of the larger party. This approach
          captures the broad behaviour of local electoral systems without modelling every
          individual vote transfer or ballot structure.
        </p>

        <h2>8. Seat Totals and Council Control</h2>
        <p>
          Finally, projected seats are aggregated to produce totals for each council or
          legislature. These totals are used to estimate:
        </p>
        <ul>
          <li>Overall seat distributions</li>
          <li>Which party is likely to hold control</li>
          <li>Where no overall control is likely</li>
        </ul>
        <p>
          In the case of Scotland, the D&apos;Hondt formula and the Scottish Regional Voting
          Average, adjusted with a regional adjustment, are used to calculate the regional list
          seats.
        </p>
      </div>
    </PageShell>
  )
}
