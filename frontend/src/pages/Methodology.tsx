import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import manifest from '../data/generated/manifest.json';
import { usePageMeta } from '../lib/meta';
import { BAND_COLORS, BAND_LABELS, BAND_THRESHOLDS } from '../lib/scoring';
import anchorsConfig from '../config/anchors.json';

type Accent = 'magenta' | 'violet' | 'blue' | 'cyan' | 'teal';

const ACCENT_BORDER: Record<Accent, string> = {
    magenta: 'border-t-magenta',
    violet: 'border-t-violet',
    blue: 'border-t-blue',
    cyan: 'border-t-cyan',
    teal: 'border-t-teal',
};

const ACCENT_TEXT: Record<Accent, string> = {
    magenta: 'text-magenta',
    violet: 'text-violet',
    blue: 'text-blue',
    cyan: 'text-cyan',
    teal: 'text-teal',
};

const Section = ({ title, part, accent, children }: { title: string; part: string; accent: Accent; children: ReactNode }) => (
    <section className={`space-y-4 bg-surface-raised border border-border-subtle ${ACCENT_BORDER[accent]} border-t-2 rounded-[4px] p-6 md:p-8`}>
        <p className={`type-overline ${ACCENT_TEXT[accent]}`}>{part}</p>
        <h2 className="type-display text-3xl text-ink">{title}</h2>
        {children}
    </section>
);

const Formula = ({ children }: { children: ReactNode }) => (
    <pre className="bg-purple-900 border border-border-subtle rounded-[4px] p-4 overflow-x-auto type-data text-sm text-cyan">{children}</pre>
);

const Th = ({ children }: { children: ReactNode }) => (
    <th className="py-2 px-3 text-left type-overline text-ink-faint">{children}</th>
);
const Td = ({ children, mono = false }: { children: ReactNode; mono?: boolean }) => (
    <td className={`py-2 px-3 ${mono ? 'type-data' : ''}`}>{children}</td>
);

const Divider = () => <div className="spectrum-line" />;

// Worst band first, matching how the rest of the site frames a result:
// the number you got before the explanation of how you could do better.
const BANDS_WORST_FIRST = [...BAND_THRESHOLDS].reverse();

function bandUpperBound(index: number): number {
    const next = BANDS_WORST_FIRST[index + 1];
    return next ? next.min - 1 : 100;
}

/**
 * Ground truth for every number the site displays. The per-stop formulas
 * transcribe src/gtfs_processor/scoring.rs; the aggregation formulas
 * transcribe src/lib/scoring.ts. Change code and page together: the golden
 * tests recompute published scores from these formulas.
 */
const Methodology = () => {
    const [viewMode, setViewMode] = useState<'plain' | 'technical'>('plain');

    usePageMeta(
        'How Melbourne Public Transport Is Scored: Methodology | Transport Score',
        'The complete scoring formula: data vintage, weights, thresholds, limitations, and changelog. Every displayed number is reproducible from this page.',
    );

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8 text-ink-soft leading-relaxed">
            <header className="space-y-4">
                <p className="type-overline text-magenta">Show your working</p>
                <h1 className="type-display text-5xl md:text-6xl text-ink">Methodology</h1>
                <p className="text-lg max-w-2xl">
                    Every score on this site is computed from published timetable data. Below you can
                    explore the simple "plain English" summary or toggle to review the exact mathematical formulas.
                </p>
                {/* Author attribution and freshness: E-E-A-T signals for AI engines */}
                <p className="text-sm text-ink-faint">
                    Published by Fusion Party Australia transport policy team.{' '}
                    <time dateTime={manifest.dataBuiltAt?.slice(0, 10) ?? ''}>
                        Last updated {manifest.dataVintageLabel}.
                    </time>
                </p>
            </header>

            {/* Key facts card: structured for AI snippet extraction (40-60 word answer blocks) */}
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 border border-border-subtle rounded-[4px] p-5 bg-surface-raised text-sm">
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Score range</dt>
                    <dd className="text-ink font-semibold">0 to 100</dd>
                </div>
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Data source</dt>
                    <dd className="text-ink font-semibold">
                        <a
                            href="https://discover.data.vic.gov.au/dataset/gtfs-schedule"
                            className="text-blue"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            PTV GTFS (data.vic.gov.au)
                        </a>
                    </dd>
                </div>
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Scoring dimensions</dt>
                    <dd className="text-ink font-semibold">Frequency 50%, Coverage 50%</dd>
                </div>
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Coverage area</dt>
                    <dd className="text-ink font-semibold">Metropolitan Melbourne</dd>
                </div>
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Data vintage</dt>
                    <dd className="text-ink font-semibold type-data">{manifest.dataVintageLabel}</dd>
                </div>
                <div>
                    <dt className="type-overline text-ink-faint mb-1">Suburbs scored</dt>
                    <dd className="text-ink font-semibold type-data">{manifest.suburbCount.toLocaleString()}</dd>
                </div>
            </dl>

            <Divider />

            {/* Toggle tabs */}
            <div className="flex gap-6 border-b border-border-subtle pb-1">
                <button
                    onClick={() => setViewMode('plain')}
                    className={`font-semibold pb-2 px-1 border-b-2 transition-all ${
                        viewMode === 'plain'
                            ? 'border-magenta text-magenta text-lg'
                            : 'border-transparent text-ink-soft hover:text-ink text-lg'
                    }`}
                >
                    Plain English
                </button>
                <button
                    onClick={() => setViewMode('technical')}
                    className={`font-semibold pb-2 px-1 border-b-2 transition-all ${
                        viewMode === 'technical'
                            ? 'border-magenta text-magenta text-lg'
                            : 'border-transparent text-ink-soft hover:text-ink text-lg'
                    }`}
                >
                    Technical Details
                </button>
            </div>

            {viewMode === 'plain' ? (
                <>
                    <Section title="The Data We Use" part="Part 01" accent="magenta">
                        <p>
                            We build these scores using the exact same timetable and stop information published by public transport operators, combined with official census data from the Australian Bureau of Statistics (ABS).
                        </p>
                        <ul className="space-y-2 list-disc pl-5">
                            <li>
                                <strong className="text-ink">Real Timetables:</strong> We use the official Public Transport Victoria (PTV) scheduling data. This includes all trains, trams, buses, and coaches.
                            </li>
                            <li>
                                <strong className="text-ink">Representative Day:</strong> We score the network based on a standard school-term Wednesday. We don't skew the results using public holidays, school holidays, or weekend-only timetables (though we do measure weekend service separately for the frequency score).
                            </li>
                            <li>
                                <strong className="text-ink">Dwelling Count:</strong> We look at where homes actually exist using the ABS Census. This helps us weight the scores by real population distribution.
                            </li>
                        </ul>
                    </Section>

                    <Section title="The Score Bands" part="Part 02" accent="violet">
                        <p>
                            Every address and suburb receives a score from <span className="type-data text-ink">0 to 100</span>, which falls into one of five color-coded bands. A higher score means more frequent services, closer stops, and better connections.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {BANDS_WORST_FIRST.map(({ band, min }, i) => {
                                const upper = bandUpperBound(i);
                                return (
                                    <div
                                        key={band}
                                        className="bg-purple-900 border border-border-subtle rounded-[4px] p-4"
                                        style={{ borderTop: `2px solid ${BAND_COLORS[band]}` }}
                                    >
                                        <div className="type-data text-3xl mb-1" style={{ color: BAND_COLORS[band] }}>
                                            {min}{upper < 100 ? `–${upper}` : '+'}
                                        </div>
                                        <div className="type-display text-lg text-ink">{BAND_LABELS[band]}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title="How We Score a Stop" part="Part 03" accent="blue">
                        <p>
                            Each individual stop (whether it's a train station, tram stop, or bus sign) is scored out of 100 based on two equally important ingredients:
                        </p>
                        <div className="space-y-4 pt-2">
                            <div>
                                <h4 className="font-semibold text-ink text-lg">1. Frequency (50% of the score): "How long you wait"</h4>
                                <p className="text-sm">
                                    We measure how often services arrive during morning and afternoon peaks, off-peak weekdays, and weekends. A 5-minute wait gets a top score, while a 30-minute wait drops the score significantly. We also reward stops that run 7 days a week and run late into the night.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-ink text-lg">2. Coverage (50% of the score): "Where you can go"</h4>
                                <p className="text-sm">
                                    We look at the connections a stop offers. Does it take you directly to major city hubs (like Flinders Street)? Can you easily interchange to other lines or travel between suburbs without going all the way into the city first? We also reward stops that have other transit options close by.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-ink text-lg">The Weak-Link Penalty</h4>
                                <p className="text-sm text-ink-soft">
                                    Public transport is only as good as its weakest link. If a stop has great coverage but the bus only comes once an hour, or if a bus comes every 5 minutes but goes nowhere useful, the score is heavily penalized. Both frequency and coverage must be decent to get a good score.
                                </p>
                            </div>
                        </div>
                    </Section>

                    <Section title="How Address and Suburb Scores are Calculated" part="Part 04" accent="cyan">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-semibold text-ink text-lg">Address Scores</h4>
                                <p className="text-sm">
                                    When you search a specific address, we look at every transit stop within an 800-metre walk (about a 10-minute walk). Your address score is determined by your best nearby service, plus a bonus if you have a diverse mix of options (like both a train and a bus).
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-ink text-lg">Suburb Scores: Real-World Coverage</h4>
                                <p className="text-sm">
                                    To find a suburb's typical score, we avoid simply averaging the stops. Averaging the stops would let a single train station inflate the score of a huge suburb where most people live miles away. Instead:
                                </p>
                                <ul className="space-y-1 list-disc pl-5 text-sm pt-2">
                                    <li>We divide the suburb's actual boundaries into 250-metre grid squares.</li>
                                    <li>We score each square individually, measuring what transport is within walking distance.</li>
                                    <li>We weight the scores by where houses and apartments actually exist using census data.</li>
                                </ul>
                                <p className="text-sm pt-2">
                                    This means a suburb only gets a high score if high-quality transport is actually accessible to the majority of its residents.
                                </p>
                            </div>
                        </div>
                    </Section>

                    <Section title="What We Do Not Measure" part="Part 05" accent="teal">
                        <p>
                            To keep our scoring objective and focused on planning, we intentionally leave out:
                        </p>
                        <ul className="space-y-2 list-disc pl-5 text-sm">
                            <li>
                                <strong className="text-ink">Fares and Ticket Prices:</strong> A frequent service is unusable if it doesn't exist, regardless of how much it costs to ride.
                            </li>
                            <li>
                                <strong className="text-ink">Punctuality and Cancellations:</strong> Our score is based on the promised timetable. In reality, delays and cancellations make service worse, not better, than what we show.
                            </li>
                            <li>
                                <strong className="text-ink">Speed:</strong> Having a predictable, frequent service beats an occasional fast express.
                            </li>
                        </ul>
                    </Section>

                    <Section title="The Network Plan: How We Build the 'Fix'" part="Part 06" accent="magenta">
                        <p>
                            Every suburb page features a budgeted, proposed feeder bus network to show how we can fix poor access. Here is how it is designed:
                        </p>
                        <ul className="space-y-2 list-disc pl-5 text-sm">
                            <li>
                                <strong className="text-ink">Connecting to What Works:</strong> The goal of the plan is to connect residents directly to existing high-quality train, tram, or bus corridor hubs (stops scoring 70 or above).
                            </li>
                            <li>
                                <strong className="text-ink">The Walk Target:</strong> We aim to place a high-quality stop within 400 metres (a 5-minute walk) of 80% of residents, and within 800 metres of 100% of residents.
                            </li>
                            <li>
                                <strong className="text-ink">Cost-Efficiency:</strong> We prioritize routing candidate buses along existing road corridors that serve the highest number of homes per dollar spent. We then estimate the net annual operating cost by subtracting the cost of redundant, low-frequency routes that the new plan replaces.
                            </li>
                        </ul>
                    </Section>

                    <Section title="Car vs. Public Transport" part="Part 07" accent="cyan">
                        <p>
                            For suburbs where we've computed it, we show how long a real public transport trip takes compared to
                            driving, averaged across nearby jobs and homes rather than one cherry-picked destination. This is
                            still rolling out suburb by suburb, and for now only shows best-case (free-flow) driving times --
                            peak-hour traffic comparisons are coming once we have the right data access in place.
                        </p>
                    </Section>
                </>
            ) : (
                <>
                    <Section title="Data" part="Part 01" accent="magenta">
                        <ul className="space-y-2 list-disc pl-5 text-sm">
                            <li>
                                <strong className="text-ink">Source:</strong> the Public Transport Victoria GTFS
                                schedule feed, published on Data Vic. All seven sub-feeds: regional train,
                                metro train, metro tram, metro bus, regional coach, regional bus, SkyBus.
                            </li>
                            <li>
                                <strong className="text-ink">Vintage of this build:</strong>{' '}
                                <span className="type-data text-ink">{manifest.dataVintageLabel}</span>
                                {manifest.gtfsGeneratedAt ? ` (processor run ${String(manifest.gtfsGeneratedAt).slice(0, 10)})` : ''}.
                                Methodology version <span className="type-data text-ink">{manifest.methodologyVersion}</span>.
                            </li>
                            <li>
                                <strong className="text-ink">Representative day:</strong> scores are computed for
                                the second Wednesday of the feed's longest calendar span, skipping school and
                                public holiday windows. Weekend metrics use the same feed's weekend services.
                            </li>
                            <li>
                                <strong className="text-ink">Scale of this build:</strong>{' '}
                                {manifest.stopCount.toLocaleString()} stops across {manifest.suburbCount} suburbs.
                            </li>
                        </ul>
                        {manifest.fixture && (
                            <p className="border border-magenta rounded-[4px] p-3 text-sm">
                                This build runs on generated sample data for testing. Every page carries a
                                banner, search engines are told not to index it, and share images are
                                watermarked. The formulas below still hold: sample stops are generated to
                                satisfy them exactly.
                            </p>
                        )}
                    </Section>

                    <Section title="The score bands" part="Part 02" accent="violet">
                        <p>
                            Every result, suburb page, and share image is labelled with one of these five
                            bands. The thresholds below are the exact numbers the site uses, not a rough guide.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {BANDS_WORST_FIRST.map(({ band, min }, i) => {
                                const upper = bandUpperBound(i);
                                return (
                                    <div
                                        key={band}
                                        className="bg-purple-900 border border-border-subtle rounded-[4px] p-4"
                                        style={{ borderTop: `2px solid ${BAND_COLORS[band]}` }}
                                    >
                                        <div className="type-data text-3xl mb-1" style={{ color: BAND_COLORS[band] }}>
                                            {min}{upper < 100 ? `–${upper}` : '+'}
                                        </div>
                                        <div className="type-display text-lg text-ink">{BAND_LABELS[band]}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title="The per-stop score, 0 to 100" part="Part 03" accent="blue">
                        <p>
                            Each stop earns a base score from two equally weighted keys, then multiplicative
                            penalties are applied. Penalties only reduce; the ceiling is 100.
                        </p>
                        <Formula>{`base_score  = frequency_key * 0.5 + coverage_key * 0.5
final_score = base_score * frequency_penalty * catchment_penalty`}</Formula>

                        <h3 className="type-display text-2xl text-ink pt-2">Frequency key (50% of the score)</h3>
                        <Formula>{`frequency_key = headway_score * 0.6 + service_span_score * 0.3 + reliability_score * 0.1
headway_score = peak * 0.6 + offpeak * 0.25 + weekend * 0.15`}</Formula>
                        <p>
                            Headway is scored on the average wait, which is half the gap between services.
                            Peak means weekdays 7 to 9am and 4 to 6pm; off peak is 9am to 4pm and 6 to 10pm;
                            weekend is 7am to 10pm.
                        </p>
                        <Formula>{`headway_score = 100 / (1 + (average_wait / 28)^2.2)`}</Formula>
                        <p>
                            A continuous curve (as of 2026-07-10), not a step table: a 5 minute wait scores
                            close to 100, a 30 minute wait close to 45, a 60 minute wait close to 15, sliding
                            smoothly in between so two suburbs a minute apart in average wait are never
                            separated by an arbitrary band. The two constants above are the entire tunable
                            surface for this curve, replacing what used to be eight independently hand-picked
                            breakpoints.
                        </p>
                        <p>
                            Service span scores hours of operation (70%) and days per week (30%). Hours use
                            their own continuous curve, <Formula>{`hours_score = 100 / (1 + e^(-(span_hours - 12) / 4.329))`}</Formula>{' '}
                            centred so a 12 hour span scores 50, climbing toward 100 for a near-24-hour span
                            and down toward 20 to 30 for a short one. Days score is active days out of 7.
                            Night network services add a bonus, also continuous and decaying with night
                            frequency rather than a flat +10/+5/+2 tier, capped so the total never exceeds 100.
                            Reliability (10% of the frequency key) is also continuous:{' '}
                            <Formula>{`reliability_score = 100 * (active_days / 7)^0.663`}</Formula>{' '}
                            7 day service scores 100, 5 days scores 80 (both exact, by construction), and
                            days in between are no longer flattened into one identical bucket.
                        </p>

                        <h3 className="type-display text-2xl text-ink pt-2">Coverage key (50% of the score)</h3>
                        <Formula>{`coverage_key = min(100, network * 0.7 + local * 0.3 + intermodal_bonus)
network      = hub_reachability * 0.5 + orbital_directness * 0.3 + cbd_access * 0.2
local        = walk_catchment * 0.5 + feeder * 0.3 + active_transport * 0.2`}</Formula>
                        <ul className="space-y-2 list-disc pl-5 text-sm">
                            <li><strong className="text-ink">Hub reachability:</strong> super hubs (Southern Cross, Flinders Street, Melbourne Central) score 100; city loop or a major hub 85 to 95; a route into the city 65; anything else 40.</li>
                            <li><strong className="text-ink">Orbital directness:</strong> can you travel suburb to suburb without the CBD? Rail interchanges score 90, SmartBus and grid routes 60 to 85, feeder buses 30.</li>
                            <li><strong className="text-ink">CBD access:</strong> binary, 100 or 0, for a direct city service.</li>
                            <li><strong className="text-ink">Walk catchment:</strong> 3 or more stops within 400m scores 100, two scores 70, one scores 40, none scores 10.</li>
                            <li><strong className="text-ink">Intermodal bonus:</strong> up to 20 points for physical train, tram, and bus interchanges within 150m, discounted when the connecting service itself scores under 70.</li>
                        </ul>

                        <h3 className="type-display text-2xl text-ink pt-2">Penalties</h3>
                        <p>
                            Transport is a chain, and one broken link breaks the trip. Two multipliers
                            punish weak links, keyed on the blended headway score and the local coverage
                            score respectively.
                        </p>
                        <Formula>{`multiplier = 0.5 + 0.5 / (1 + e^(-(trigger_score - 35) / 12))`}</Formula>
                        <p>
                            A continuous curve (as of 2026-07-10), not four fixed tiers: a trigger score of 15
                            scores a multiplier near 0.58, 30 near 0.70, 50 near 0.89, 70 near 0.97, sliding
                            between a floor of 0.5 and a ceiling of 1.0 rather than jumping at 20/40/60. Both
                            penalties (frequency and catchment) share this same curve, applied to their own
                            trigger score.
                        </p>
                    </Section>

                    <Section title="From stops to your result" part="Part 04" accent="cyan">
                        <p>
                            Address results score everything within an 800m walk, and ask "what is the best
                            option at this exact point":
                        </p>
                        <Formula>{`viable_route      = any route whose best stop scores over 50
quality_count     = sum over viable routes of (score / 100)^2
diversity_bonus   = 20 at 1.0, 50 at 2.0, 70 at 3.0, 85 at 4.0, 100 at 5.0+
                    (linear between breakpoints)
score             = best_viable * 0.7 + diversity_bonus * 0.3
no viable routes  = best available stop score, capped at 49`}</Formula>
                        <p>
                            Suburb pages ask a different question: "what is typical access across this
                            suburb", not "what is the best this suburb can offer". A single strong anchor
                            stop (usually a train station) should not carry a whole suburb's score when most
                            of that suburb cannot walk to it, and stop density (a tram corridor with a stop
                            every 250m) shouldn't either -- two suburbs with identical real service but
                            different stop spacing should score the same. As of 2026-07-10, the suburb score
                            is computed by gridding the suburb's real boundary into 250m cells, scoring each
                            cell exactly like a single address (the same best_viable * 0.7 + diversity_bonus *
                            0.3 formula above, applied at the cell's centre), then averaging the cells
                            weighted by real ABS Census mesh block dwelling counts (2021, the latest available
                            -- see the note on data vintage below):
                        </p>
                        <Formula>{`cell_score        = address-style score (above), computed at each 250m cell's centre
suburb_score      = sum(cell_score * cell_dwellings) / sum(cell_dwellings)`}</Formula>
                        <p>
                            The three-part breakdown shown with every result is computed the same
                            population-weighted way, from each cell's own frequency/coverage/reliability
                            averages -- so the headline score and its breakdown are always mutually
                            reproducible from the same underlying cells, not two separately-averaged numbers.
                            A suburb outside Greater Melbourne and the commuter corridor (where a real polygon
                            boundary isn't yet in scope, see "known limitations"), or with no populated cells
                            inside it, falls back to a plain mean of its stops' final scores instead -- every
                            suburb detail page states which method produced its number.
                        </p>
                        <p>
                            <strong className="text-ink">Data vintage:</strong> population weights come from
                            the 2021 Census (the most recent mesh block release; the next Census is in August
                            2026, with mesh block data typically following a year or more later), and weight
                            by dwelling count rather than usual-resident population -- growth-corridor estates
                            built after 2021 are undercounted on people more than on dwellings, and this tool's
                            whole point is the newest, worst-served pockets, not the best-documented ones.
                            A dwelling standing but not yet occupied at census time still counts; a resident
                            who has since moved in but wasn't there for the count would not.
                        </p>
                        <p>
                            The suburb's best stop is still shown alongside the score for context (labelled
                            "best route"), using the same best_viable figure as the address formula above --
                            that one figure is deliberately not population-weighted, since "your best nearby
                            option" is a different question to "typical access here".
                        </p>
                        <p>
                            The headline wait in verdict lines is the population-weighted median peak wait
                            among the same 250m grid cells behind the score, counting only cells whose best
                            viable route a resident can actually walk to, doubled into the gap between
                            services. Verdicts also cite reach, the share of the suburb's dwellings living in
                            a cell with at least one viable route within 800m: when that share drops below
                            40%, the verdict says so directly rather than describing only the reached
                            minority's experience as if it were the whole suburb's.
                        </p>
                        <p>
                            The league table ranks suburbs by this score, lowest first, and requires at
                            least 3 scored stops so a single flag stop cannot put a suburb on the list.
                        </p>
                        <p>
                            Distances are straight-line metres with cosine-of-latitude correction. Suburbs
                            are attributed by real point-in-polygon against Vicmap Admin locality boundaries
                            (the Victorian government's authoritative locality dataset), scoped to Greater
                            Melbourne and the commuter corridor. A small remainder outside that scope, or on
                            a rare gap at a polygon edge, falls back to a heuristic: trailing-parenthesis
                            suburb names on stops, station names mapped by a curated exception list, then the
                            nearest attributed stop within 1km.
                        </p>
                    </Section>

                    <Section title="What we do not score" part="Part 05" accent="teal">
                        <ul className="space-y-2 list-disc pl-5">
                            <li><strong className="text-ink">Fares:</strong> a service you cannot catch is unusable at any price. Fares appear on this site only as cost anchors, sourced and dated where shown.</li>
                            <li><strong className="text-ink">Real-time punctuality:</strong> the score measures the promise of the timetable, which is the generous reading. Reliability here means days-of-service consistency, and that is a proxy, stated plainly.</li>
                            <li><strong className="text-ink">Speed:</strong> frequent and predictable beats occasionally fast.</li>
                        </ul>
                    </Section>

                    <Section title="Known limitations" part="Part 06" accent="magenta">
                        <ul className="space-y-2 list-disc pl-5">
                            <li>Walking distances are straight-line, so barriers like freeways and rivers can flatter a stop's true catchment.</li>
                            <li>Suburb attribution is real point-in-polygon for Greater Melbourne and the commuter corridor; a small remainder outside that scope still uses a name-parsing heuristic. The build reports its failure rate ({manifest.unattributedPct}% unattributed in this build) and fails above 10%.</li>
                            <li>A locality can be a real, official Victorian place with zero stops scored inside its exact boundary, and so not appear in the league table at all -- that is not good service, it is the opposite. This was confirmed for several growth-corridor localities once real boundaries replaced name-parsing: the timetabled network has not yet reached the exact gazetted area, even where nearby stops score patchy-to-poor.</li>
                            <li>Grid + population aggregation (the suburb score formula above) is scoped to the same Greater Melbourne + commuter corridor as attribution. Suburbs outside that scope, or with no populated 250m cell inside their real boundary, fall back to a plain stop-mean instead -- flagged as such on that suburb's own detail data, though not yet called out visually on the page itself.</li>
                            <li>Scores describe the timetable, and cancelled or ghost services score better than they deserve.</li>
                            <li>Coverage is Melbourne GTFS. Statewide scoring is planned, and regional stops inside the feed are scored where present.</li>
                            <li>The plan's population, points of interest, and road corridors are synthetic placeholders until real ABS population, POI, and road datasets are supplied. Real data will change every number on <Link to="/the-plan" className="text-blue">the plan</Link>.</li>
                            <li>Car competitiveness (Part 09 below) currently covers {manifest.carCompetitivenessCoverageCount.toLocaleString()} suburbs -- only those whose centroid falls inside the OSM road/GTFS extract we've computed travel times against so far, not the full site coverage. Its gravity-decay weighting constant is a commonly-cited placeholder, not yet calibrated against real Census journey-to-work distance decay ({manifest.carCompetitivenessBetaCalibrated ? 'now calibrated' : 'not yet calibrated'}). Peak-hour (congested) driving times are not available yet ({manifest.carCompetitivenessCongestionAvailable ? 'now live' : 'pending a working DTP traffic-data API key'}) -- only best-case free-flow driving is shown.</li>
                        </ul>
                    </Section>

                    <Section title="Changelog" part="Part 07" accent="violet">
                        <ul className="space-y-3 text-sm">
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2026-07-11</span>
                                <span>
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
                                </span>
                            </li>
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2026-07-10</span>
                                <span>
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
                                </span>
                            </li>
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2026-07-10</span>
                                <span>
                                    Headway, service span, night network, reliability, and penalty-multiplier
                                    scores now use continuous curves instead of step tables, collapsing roughly
                                    30 hand-picked breakpoints into 2-3 tunable parameters per curve. A wait of
                                    19 versus 21 minutes (or any other pair a step apart) no longer produces an
                                    arbitrary score jump. Checked against the validation fixture suite above
                                    before and after; every fixture still passes. One incidental, intentional
                                    change: reliability no longer flattens every active-day count below 5 into
                                    one identical score.
                                </span>
                            </li>
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2026-07-10</span>
                                <span>
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
                                </span>
                            </li>
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2026.07</span>
                                <span>
                                    Suburb aggregation, league table, address catchment, and the feeder-network
                                    designer published. Distance calculation now applies cosine-of-latitude
                                    correction; the previous map tool overstated east-west distances by about
                                    25% at Melbourne's latitude, which made 800m catchments too generous east
                                    to west.
                                </span>
                            </li>
                            <li className="flex gap-3">
                                <span className="type-data text-ink shrink-0">2025.12</span>
                                <span>
                                    Per-stop scoring engine: two-key framework (frequency, coverage),
                                    penalty multipliers, intermodal bonus, night network bonus.
                                </span>
                            </li>
                        </ul>
                    </Section>

                    <Section title="The plan, how it is built" part="Part 08" accent="blue">
                        <p>
                            <Link to="/the-plan" className="text-blue">The plan</Link> is a feeder bus network
                            designed to connect residents to transit that already works. Every number on it comes
                            from the formulas below, run by a separate program, not by hand.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">What counts as high quality</h3>
                        <p>
                            A stop qualifies as a trunk anchor at <span className="type-data text-ink">final_score {'>'}= 70</span>,
                            the same "decent" threshold shown on every score page. No separate bar was invented for this feature.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Coverage targets and candidate routes</h3>
                        <Formula>{`target        = 80% of residents within 400m, 100% within 800m, of a high-quality stop
candidate     = a road corridor with a synthesized stop within 1500m of a high-quality stop
stop spacing  = every 400m along the corridor, matching the walk-catchment radius used everywhere else`}</Formula>
                        <p>
                            The 1500m "anchor radius" is deliberately looser than the 400m/800m coverage
                            thresholds: it answers "can this corridor plausibly connect to trunk transit",
                            not "is a resident within walking distance of it".
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Route selection</h3>
                        <Formula>{`coverage_value = newly_covered_pop_400 * 1.0
               + newly_covered_pop_800 * 0.4
               + poi_weight_served * 400  (points of interest as a bonus, never the gate)
value          = coverage_value / daily_cost
each round     = add the highest-value remaining candidate, repeat until both targets are met
               = stop and report the shortfall honestly if no candidate adds coverage`}</Formula>
                        <p>
                            This greedy maximal-covering heuristic is transparent and fast, rather than a mathematically optimal network design. A denser road network than these fixture corridors will find more candidates and can close a shortfall this build reports.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Cost and what gets retired</h3>
                        <Formula>{`daily_vehicle_km   = corridor length (km) * trips per day
trips per day      = (peak hours * 60 / peak headway + offpeak hours * 60 / offpeak headway) * 2 directions
annual cost        = daily_vehicle_km * cost per km * 365
redundant route    = every stop on an existing low-quality route is now within 400m of
                     a high-quality stop or a newly proposed route
net annual cost    = new routes' annual cost − retired routes' annual cost`}</Formula>
                        <div className="bg-purple-900 border border-border-subtle rounded-[4px] overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="border-b border-border-strong"><Th>Assumption</Th><Th>Value</Th></tr></thead>
                                <tbody className="divide-y divide-border-subtle">
                                    <tr><Td>Peak headway</Td><Td mono>10 min</Td></tr>
                                    <tr><Td>Off-peak headway</Td><Td mono>15 min</Td></tr>
                                    <tr><Td>Service span</Td><Td mono>4am to midnight</Td></tr>
                                    <tr><Td>Cost per service km</Td><Td mono>{anchorsConfig.anchors.busOperatingCostPerKm.display}</Td></tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm">
                            These are policy choices Fusion is proposing to fund, not figures pulled from data.
                            The cost rate is a config value, sourced and dated on <Link to="/the-plan" className="text-blue">the plan</Link> itself; it refreshes on the same cycle as every other price anchor on this site.
                        </p>
                    </Section>

                    <Section title="Car competitiveness and cumulative accessibility" part="Part 09" accent="cyan">
                        <p>
                            The suburb score above answers "how good is the service that exists". This section answers a
                            different question: "compared to driving, and compared to how many jobs a real trip actually
                            reaches, how much does that service matter". Both measures are computed from the same real
                            travel-time matrix -- built from OpenStreetMap road data and the same PTV GTFS timetable
                            everything else on this site uses, routed with <a href="https://project-osrm.org/" className="text-blue">OSRM</a> for driving
                            and <a href="https://r5py.readthedocs.io/" className="text-blue">r5py</a> (Conveyal's R5 transit router) for public transport, both run
                            locally with no ongoing API cost.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Car competitiveness</h3>
                        <Formula>{`ratio(i, j)      = pt_time(i, j) / car_time(i, j)
weight(j)        = jobs(j) + dwellings(j)
decay(i, j)      = exp(-BETA * car_time(i, j))            BETA = 0.05 per minute, see note below
ratioFreeFlow(i) = sum_j[ weight(j) * decay(i,j) * ratio(i,j) ] / sum_j[ weight(j) * decay(i,j) ]`}</Formula>
                        <p>
                            This is a Hansen-style gravity-weighted accessibility ratio, not a single cherry-picked trip: every
                            destination suburb we've computed a travel time to counts, weighted by how many jobs and homes are
                            there and how close it is. A ratio of 1.5 means public transport takes 1.5x as long as driving,
                            averaged across a suburb's realistic set of destinations; the methodology refactor log's indicative
                            bands treat under 1.5 as car-competitive, under 2 as tolerable, and over 3 as the network having
                            effectively declined to serve those trips.
                        </p>
                        <p>
                            <strong className="text-ink">BETA is not yet calibrated</strong> against real travel-behaviour data --
                            it's a commonly-cited moderate work-trip decay rate, not fitted to Melbourne. Regressing suburb scores
                            against Census journey-to-work mode share (and publishing the correlation here) is planned but not
                            yet done; treat the exact ratio values as indicative until then, not as decimal-precise.
                        </p>
                        <p>
                            <strong className="text-ink">Peak-hour driving times aren't live yet.</strong> The plan was to price
                            congestion using DTP's own real-time Bluetooth Travel Time and Freeway Travel Time open data (segment-level,
                            same publisher as the GTFS feed) rather than a generic city-wide index -- but this needs a working
                            DTP Open Data subscription key, and the credentials available this session didn't authenticate
                            against the real, documented endpoint. Only free-flow (best-case-for-driving) comparisons ship for
                            now; the free-flow/peak toggle on each suburb page is built and will activate once a working key is
                            confirmed.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Cumulative accessibility</h3>
                        <Formula>{`jobsWithin45MinPt(i) = sum of jobs(j) for every destination j reachable within 45 minutes by public transport`}</Formula>
                        <p>
                            Jobs are 2021 Census place-of-work counts by SA2 (Statistical Area 2) -- a correction from this
                            project's original plan to use DZN (Destination Zone) geography, which turned out not to be in the
                            free Census DataPacks (only in TableBuilder, a separate, more restricted ABS product). SA2 is
                            suburb-scaled geography in metro Melbourne, a reasonable match for suburb-level accessibility.
                        </p>
                        <h3 className="type-display text-2xl text-ink pt-2">Coverage</h3>
                        <p>
                            This is the newest measure on the site and does not yet cover every suburb: {manifest.carCompetitivenessCoverageCount.toLocaleString()} suburbs
                            have it so far, limited to whichever OSM road extract the travel-time matrix was last computed
                            against. Suburbs without it show a plain "not available yet" message rather than an approximated
                            number. Coverage expands as the underlying extract does.
                        </p>
                    </Section>
                </>
            )}

            <Divider />

            {/* Frequently Asked Questions */}
            <section className="space-y-6 pt-4">
                <h2 className="type-display text-4xl text-ink">Frequently Asked Questions</h2>
                <div className="space-y-4">
                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-2">
                        <h3 className="font-semibold text-ink text-lg">Why does my suburb have a low score when there is a train station nearby?</h3>
                        <p className="text-sm text-ink-soft">
                            A suburb's score is computed by dividing the entire suburb into 250-metre grid squares and weighting the result by where homes actually exist (using census data). A single train station provides excellent service for the people living right next to it, but if 90% of the suburb's residents live too far away to walk to the station, the suburb's overall score will reflect that lack of access.
                        </p>
                    </div>

                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-2">
                        <h3 className="font-semibold text-ink text-lg">Where does the data come from?</h3>
                        <p className="text-sm text-ink-soft">
                            All timetables, route alignments, and stop locations are sourced from the official Public Transport Victoria (PTV) GTFS schedule data published on the Victorian government's Data Vic portal. Suburb boundaries are defined by the authoritative Vicmap Admin locality dataset, and dwelling densities are sourced from the Australian Bureau of Statistics (ABS) 2021 Census mesh blocks.
                        </p>
                    </div>

                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-2">
                        <h3 className="font-semibold text-ink text-lg">Does the score account for late, cancelled, or "ghost" services?</h3>
                        <p className="text-sm text-ink-soft">
                            No. The score measures the <em>promise</em> of the published timetable. We assume services run exactly as scheduled. Because real-world cancellations, late runs, and ghost buses degrade the user experience, the score represents the best possible version of the service.
                        </p>
                    </div>

                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-2">
                        <h3 className="font-semibold text-ink text-lg">Why isn't my suburb listed in the league table?</h3>
                        <p className="text-sm text-ink-soft">
                            To ensure rankings are meaningful and fair, a suburb must have at least 3 active, scheduled stops inside its official boundary to qualify for the league table. Additionally, our high-resolution grid analysis is currently scoped to Greater Melbourne and the surrounding commuter corridors where official Vicmap boundary and ABS population data are fully integrated.
                        </p>
                    </div>

                    <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-2">
                        <h3 className="font-semibold text-ink text-lg">How is the proposed "Fix" (the Network Plan) designed?</h3>
                        <p className="text-sm text-ink-soft">
                            We run a computer model that identifies areas where residents live too far from high-quality transit. It proposes feeder bus routes along existing road corridors to connect those residents directly to existing high-frequency train, tram, or bus hubs. The model selects the most cost-effective routes first, aiming to bring high-quality transport within walking distance of everyone in the suburb.
                        </p>
                    </div>
                </div>
            </section>

            <div className="text-center pt-4">
                <p className="text-sm mb-4">
                    Check a suburb against this page any time, straight from its score card.
                </p>
                <Link
                    to="/"
                    className="pressable inline-block px-6 py-3 bg-magenta text-white font-semibold rounded-[4px]"
                >
                    Look up your suburb
                </Link>
            </div>
        </div>
    );
};

export default Methodology;
