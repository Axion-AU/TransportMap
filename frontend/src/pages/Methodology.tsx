import { Link } from 'react-router-dom';
import manifest from '../data/generated/manifest.json';
import { usePageMeta } from '../lib/meta';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-4">
        <h2 className="type-display text-3xl border-b border-border-subtle pb-2">{title}</h2>
        {children}
    </section>
);

const Formula = ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-surface-raised border border-border-subtle rounded-[4px] p-4 overflow-x-auto type-data text-sm text-cyan">{children}</pre>
);

const Th = ({ children }: { children: React.ReactNode }) => (
    <th className="py-2 px-3 text-left type-overline text-ink-faint">{children}</th>
);
const Td = ({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) => (
    <td className={`py-2 px-3 ${mono ? 'type-data' : ''}`}>{children}</td>
);

/**
 * Ground truth for every number the site displays. The per-stop formulas
 * transcribe src/gtfs_processor/scoring.rs; the aggregation formulas
 * transcribe src/lib/scoring.ts. Change code and page together: the golden
 * tests recompute published scores from these formulas.
 */
const Methodology = () => {
    usePageMeta(
        'Methodology | Transport Score',
        'The complete scoring formula: data vintage, weights, thresholds, limitations, and changelog. Every displayed number is reproducible from this page.',
    );

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-12 text-ink-soft leading-relaxed">
            <header className="space-y-4">
                <p className="type-overline text-magenta">Show your working</p>
                <h1 className="type-display text-5xl md:text-6xl text-ink">Methodology</h1>
                <p className="text-lg max-w-2xl">
                    Every score on this site is computed from published timetable data with the
                    formulas below. If you cannot reproduce a number from this page, that is a bug.
                    Report it and we will fix it in public, in the changelog at the bottom.
                </p>
            </header>

            <Section title="Data">
                <ul className="space-y-2 list-disc pl-5">
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

            <Section title="The per-stop score, 0 to 100">
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
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-border-strong"><Th>Average wait</Th><Th>Headway score</Th></tr></thead>
                        <tbody className="divide-y divide-border-subtle">
                            <tr><Td>5 minutes or less</Td><Td mono>100</Td></tr>
                            <tr><Td>up to 10 minutes</Td><Td mono>95</Td></tr>
                            <tr><Td>up to 15 minutes</Td><Td mono>80</Td></tr>
                            <tr><Td>up to 20 minutes</Td><Td mono>65</Td></tr>
                            <tr><Td>up to 30 minutes</Td><Td mono>45</Td></tr>
                            <tr><Td>up to 40 minutes</Td><Td mono>30</Td></tr>
                            <tr><Td>up to 60 minutes</Td><Td mono>15</Td></tr>
                            <tr><Td>over 60 minutes</Td><Td mono>5</Td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Service span scores hours of operation (70%) and days per week (30%): a 23 hour
                    span earns 100, sliding to 30 points below 12 hours; days score is active days
                    out of 7. Night network services add up to 10 bonus points, capped at 100.
                    Reliability is a days-of-service proxy: 7 day service earns 100, 5 or 6 days
                    earns 80, less earns 50.
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
                    <li><strong className="text-ink">Intermodal bonus:</strong> up to 20 points for genuine train, tram, and bus interchange within 150m, discounted when the connecting service itself scores under 70.</li>
                </ul>

                <h3 className="type-display text-2xl text-ink pt-2">Penalties</h3>
                <p>
                    Transport is a chain, and one broken link breaks the trip. Two multipliers
                    punish weak links, keyed on the blended headway score and the local coverage
                    score respectively.
                </p>
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="border-b border-border-strong"><Th>Trigger score</Th><Th>Multiplier</Th></tr></thead>
                        <tbody className="divide-y divide-border-subtle">
                            <tr><Td>under 20</Td><Td mono>0.50</Td></tr>
                            <tr><Td>under 40</Td><Td mono>0.70</Td></tr>
                            <tr><Td>under 60</Td><Td mono>0.85</Td></tr>
                            <tr><Td>60 and above</Td><Td mono>1.00</Td></tr>
                        </tbody>
                    </table>
                </div>
            </Section>

            <Section title="From stops to your result">
                <p>
                    Address results score everything within an 800m walk. Suburb pages score all of
                    the suburb's stops. Both use the same aggregation:
                </p>
                <Formula>{`viable_route      = any route whose best stop scores over 50
quality_count     = sum over viable routes of (score / 100)^2
diversity_bonus   = 20 at 1.0, 50 at 2.0, 70 at 3.0, 85 at 4.0, 100 at 5.0+
                    (linear between breakpoints)
score             = best_viable * 0.7 + diversity_bonus * 0.3
no viable routes  = best available stop score, capped at 49`}</Formula>
                <p>
                    The three-part breakdown shown with every result is the plain average of the
                    stops' frequency, coverage, and reliability sub-scores. The headline wait in
                    verdict lines is the median peak wait across the stops, doubled into the gap
                    between services.
                </p>
                <p>
                    The league table ranks suburbs by this score, lowest first, and requires at
                    least 3 scored stops so a single flag stop cannot put a suburb on the list.
                </p>
                <p>
                    Distances are straight-line metres with cosine-of-latitude correction. Suburbs
                    are attributed from stop names: PTV bus and tram stops carry their suburb in
                    trailing parentheses, stations are mapped by name with a curated exception list,
                    and the remainder inherit the nearest attributed stop within 1km.
                </p>
            </Section>

            <Section title="What we do not score">
                <ul className="space-y-2 list-disc pl-5">
                    <li><strong className="text-ink">Fares:</strong> a service you cannot catch is unusable at any price. Fares appear on this site only as cost anchors, sourced and dated where shown.</li>
                    <li><strong className="text-ink">Real-time punctuality:</strong> the score measures the promise of the timetable, which is the generous reading. Reliability here means days-of-service consistency, and that is a proxy, stated plainly.</li>
                    <li><strong className="text-ink">Speed:</strong> frequent and predictable beats occasionally fast.</li>
                </ul>
            </Section>

            <Section title="Known limitations">
                <ul className="space-y-2 list-disc pl-5">
                    <li>Walking distances are straight-line, so barriers like freeways and rivers can flatter a stop's true catchment.</li>
                    <li>Suburb attribution from stop names is a heuristic; the build reports its failure rate ({manifest.unattributedPct}% unattributed in this build) and fails above 5%.</li>
                    <li>Scores describe the timetable, and cancelled or ghost services score better than they deserve.</li>
                    <li>Coverage is Melbourne GTFS. Statewide scoring is planned, and regional stops inside the feed are scored where present.</li>
                </ul>
            </Section>

            <Section title="Changelog">
                <ul className="space-y-2 list-disc pl-5 text-sm">
                    <li>
                        <span className="type-data text-ink">2026.07</span> Suburb aggregation, league
                        table, and address catchment published. Distance calculation now applies
                        cosine-of-latitude correction; the previous map tool overstated east-west
                        distances by about 25% at Melbourne's latitude, which made 800m catchments
                        too generous east to west.
                    </li>
                    <li>
                        <span className="type-data text-ink">2025.12</span> Per-stop scoring engine:
                        two-key framework (frequency, coverage), penalty multipliers, intermodal
                        bonus, night network bonus.
                    </li>
                </ul>
            </Section>

            <p className="text-sm">
                Check a suburb against this page any time from its score card, or start at the{' '}
                <Link to="/" className="text-blue">lookup</Link>.
            </p>
        </div>
    );
};

export default Methodology;
