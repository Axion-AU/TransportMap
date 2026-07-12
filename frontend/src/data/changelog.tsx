import type { ReactNode } from 'react';

/**
 * Every dated methodology/data change, newest first. Single source of truth
 * for both the full /changelog page and the short "latest entry" stub shown
 * on /methodology -- add new entries here, not in either page directly.
 */
export interface ChangelogEntry {
    date: string;
    content: ReactNode;
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        date: '2026-07-12',
        content: (
            <>
                Verdict sentences for grid-scored suburbs now come from the same
                population-weighted 250m cells as the headline score, not stop-level data.
                Fixed a real self-contradiction found on Thomastown: a STRANDED suburb (93%
                of its population beyond an 800m walk of a viable route) was quoting "buses
                every 16 minutes", a stop-level headway most residents could not reach.
                Verdicts now check, in order, what share of the suburb can actually walk to
                a viable route (reach), whether a genuine population-level mode split exists
                (a minority mode reaching at least a fifth of the served population and
                scoring well ahead of the rest, not noise from one or two stops), and only
                then the usual weakest-dimension read -- with the quoted wait and mode both
                population-weighted throughout. Legacy-mean suburbs and address-level results
                are unaffected; they have no suburb-wide population grid to draw from and
                keep the previous stop-based logic. Checked directly: reach drops below the
                new 40% threshold for 84 of 493 grid-scored suburbs, concentrated in
                STRANDED (median reach 8%) and essentially absent from DECENT/GOOD, matching
                the intended shape rather than overfiring across the board.
            </>
        ),
    },
    {
        date: '2026-07-11',
        content: (
            <>
                Car competitiveness and cumulative accessibility (Part 09) published: a
                gravity-weighted pt_time/car_time ratio and jobs reachable within 45
                minutes by public transport, computed from a real OSM + GTFS travel-time
                matrix (OSRM for driving, r5py for public transport, both run locally, no
                API costs). Jobs data corrected from the originally planned ABS DZN
                geography to SA2 -- DZN place-of-work counts are not in the free Census
                DataPacks (only TableBuilder, a more restricted product), confirmed
                directly against the ABS product release guide before writing any code.
                Coverage is partial at launch: only suburbs inside the OSM extract
                computed so far are included, reported honestly via the manifest rather
                than backfilled with an approximation. Peak-hour driving times are not
                live yet -- the DTP traffic-data API keys available this session did not
                authenticate against the real, documented endpoint, so only free-flow
                (best-case-for-driving) comparisons ship for now; the UI's peak/free-flow
                toggle is built and will light up once a working key is confirmed. Also
                fixed a real, previously-undiagnosed structural risk while building this:
                the representative-date picker's per-mode median (driver.rs) had drifted
                to a date almost two months in the future for metro_train on this run --
                a live instance of the "median can wander into a future service-change
                window" risk already flagged as open and unfixed in the methodology
                refactor log. The travel-time matrix uses a safer, manually-confirmed date
                instead; the underlying picker itself is still not fixed.
            </>
        ),
    },
    {
        date: '2026-07-10',
        content: (
            <>
                Suburb attribution now uses real point-in-polygon against Vicmap Admin
                locality boundaries for Greater Melbourne and the commuter corridor,
                replacing the previous name-parsing heuristic there (unattributed rate
                dropped from 7.54% to 5.76%; the remainder is outside this release's
                metro scope and still uses the old heuristic). Several suburbs' stop
                counts and scores changed as a direct result, including Carlton (previously
                a 1-stop fragment with its real ~44 stops misattributed elsewhere) and
                several outer growth-corridor suburbs gaining their first accurate entry.
                Also added: a validation fixture suite checking real scores against cited
                external sources (Victorian Auditor-General's Office, Infrastructure
                Victoria) on every build, and Rust/frontend unit tests now run in CI.
            </>
        ),
    },
    {
        date: '2026-07-10',
        content: (
            <>
                Headway, service span, night network, reliability, and penalty-multiplier
                scores now use continuous curves instead of step tables, collapsing roughly
                30 hand-picked breakpoints into 2-3 tunable parameters per curve. A wait of
                19 versus 21 minutes (or any other pair a step apart) no longer produces an
                arbitrary score jump. Checked against the validation fixture suite above
                before and after; every fixture still passes. One incidental, intentional
                change: reliability no longer flattens every active-day count below 5 into
                one identical score.
            </>
        ),
    },
    {
        date: '2026-07-10',
        content: (
            <>
                Suburb scores now come from a 250m grid over the suburb's real boundary,
                each cell scored like a single address and averaged weighted by real 2021
                ABS Census mesh block dwelling counts, replacing the plain stop-mean that
                let stop density (a tram corridor with a stop every 250m) drive the score
                instead of real service quality. Effect confirmed directly: St Kilda,
                Richmond, Fitzroy, South Yarra, North Melbourne, and Carlton all move from
                "decent" to "good" (they were suppressed by stop-averaging, not genuinely
                middling), while VAGO-cited growth-corridor suburbs stay patchy-to-poor as
                expected. One suburb (Doncaster East) moved further than expected on first
                check -- inspected directly rather than assumed a bug: its western portion,
                where most dwellings sit, has genuinely decent SmartBus coverage even
                without the still-unbuilt rail line VAGO's report cites, and its eastern
                edge alone drags the average down, not up. 496 of 762 suburbs (within
                Greater Melbourne and the commuter corridor) use this grid method; the
                remainder still use the stop-mean fallback (see "known limitations").
            </>
        ),
    },
    {
        date: '2026.07',
        content: (
            <>
                Suburb aggregation, league table, address catchment, and the feeder-network
                designer published. Distance calculation now applies cosine-of-latitude
                correction; the previous map tool overstated east-west distances by about
                25% at Melbourne's latitude, which made 800m catchments too generous east
                to west.
            </>
        ),
    },
    {
        date: '2025.12',
        content: (
            <>
                Per-stop scoring engine: two-key framework (frequency, coverage),
                penalty multipliers, intermodal bonus, night network bonus.
            </>
        ),
    },
];
