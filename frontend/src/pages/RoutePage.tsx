import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import ScoreCard from '../components/ScoreCard';
import LookupInput from '../components/LookupInput';
import ClientOnly from '../components/ClientOnly';
import WhyPtMattersSection from '../components/WhyPtMattersSection';
import type { RouteDetail } from '../types/data';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';
import { BAND_LABELS } from '../lib/scoring';
import manifest from '../data/generated/manifest.json';

const RouteMap = lazy(() => import('../components/RouteMap'));

/** Reads the JSON island injected at prerender time, mirroring SuburbScorePage's islandData. */
function islandData(slug: string): RouteDetail | null {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('route-data');
    if (!el?.textContent) return null;
    try {
        const parsed = JSON.parse(el.textContent) as RouteDetail;
        return parsed.slug === slug ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Route detail page (docs/route-scoring.md). Mirrors SuburbScorePage's
 * island-then-fetch pattern so the prerendered page paints with zero
 * fetches and hydration matches exactly.
 */
const RoutePage = () => {
    const { slug = '' } = useParams();
    const [detail, setDetail] = useState<RouteDetail | null>(() => islandData(slug));
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        const island = islandData(slug);
        if (island) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- slug changes swap to inlined data without a fetch
            setDetail(island);
            return;
        }

        let cancelled = false;
        setDetail(null);
        setMissing(false);
        fetch(`/data/routes-detail/${slug}.json`)
            .then(res => {
                if (!res.ok) throw new Error('missing');
                return res.json();
            })
            .then((d: RouteDetail) => {
                if (!cancelled) setDetail(d);
            })
            .catch(() => {
                if (!cancelled) setMissing(true);
            });
        return () => {
            cancelled = true;
        };
    }, [slug]);

    usePageMeta(
        detail ? `The ${detail.number} scores ${detail.score}/100 | Transport Score` : 'Transport Score',
        detail
            ? `${detail.verdict.replace(/\.$/, '')}. Scored from ${manifest.dataVintageLabel} PTV timetable data.`
            : undefined,
    );

    useEffect(() => {
        if (detail) track('route_score_viewed', { route: detail.slug, band: detail.band });
    }, [detail]);

    if (missing) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-16 space-y-6">
                <h1 className="type-display text-4xl">We do not have that route yet</h1>
                <p className="text-ink-soft">Coverage is Melbourne metro bus, tram, train, and SkyBus for now.</p>
                <LookupInput />
            </div>
        );
    }

    if (!detail) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Loading score…</div>;
    }

    const stats: { label: string; value: string }[] = [
        { label: 'Peak wait', value: `${detail.peakWaitMinutes.toFixed(1)} min` },
        { label: 'Off-peak wait', value: `${detail.offpeakWaitMinutes.toFixed(1)} min` },
        { label: 'Weekend wait', value: `${detail.weekendWaitMinutes.toFixed(1)} min` },
        { label: 'Service span', value: `${detail.spanHours.toFixed(1)} hrs` },
        { label: 'Weekday trips', value: `${detail.weekdayTrips}` },
        { label: 'Catchment population', value: detail.catchmentPopulation.toLocaleString() },
        { label: 'Population per service km', value: detail.populationPerServiceKm.toLocaleString() },
        { label: 'Circuity', value: detail.circuityRatio !== null ? `${detail.circuityRatio.toFixed(2)}x` : 'orbital, not scored' },
        { label: 'Interchanges', value: `${detail.interchangeCount}` },
    ];

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8">
            <ScoreCard
                title={`Route ${detail.number}`}
                score={detail.score}
                band={detail.band}
                breakdown={{
                    frequency: detail.breakdown.frequency,
                    coverage: detail.breakdown.catchment,
                    reliability: detail.breakdown.connectivity,
                }}
                verdict={detail.verdict}
                subtitle={`${detail.longName}. Frequency ${detail.breakdown.frequency}/100, catchment ${detail.breakdown.catchment}/100, connectivity ${detail.breakdown.connectivity}/100, directness ${detail.isLoop ? 'not scored (orbital)' : `${detail.breakdown.directness}/100`}.`}
            />

            {detail.schoolSpecial && (
                <p className="border border-magenta rounded-[4px] p-3 text-sm">
                    This is a school-special service (low trip count or limited weekly days). It's excluded from league tables.
                </p>
            )}

            <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {stats.map(s => (
                    <div key={s.label} className="border border-border-subtle rounded-[4px] p-3">
                        <div className="text-xs text-ink-faint uppercase">{s.label}</div>
                        <div className="type-data text-lg text-ink">{s.value}</div>
                    </div>
                ))}
            </section>

            <section className="space-y-3">
                <h2 className="type-display text-2xl text-ink">Route map</h2>
                <p className="text-sm text-ink-soft">
                    Every stop on the {detail.number}, coloured by that stop's own score. The line is the
                    route's representative shape, used for the directness figure above.
                </p>
                <div className="h-[420px] rounded-[4px] overflow-hidden border border-border-subtle">
                    <ClientOnly fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                        <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                            <RouteMap detail={detail} />
                        </Suspense>
                    </ClientOnly>
                </div>
            </section>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link to={`/routes?mode=${detail.mode}&focus=${detail.slug}`} className="text-blue">Where does the {detail.number} rank?</Link>
                <Link to="/methodology" className="text-blue">How this score is calculated</Link>
            </div>

            {detail.suburbsServed.length > 0 && (
                <section className="space-y-3">
                    <h2 className="type-display text-2xl text-ink">Suburbs served</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {detail.suburbsServed.map(slug => (
                            <Link
                                key={slug}
                                to={`/score/${slug}`}
                                className="pressable bg-surface-raised border border-border-subtle rounded-[4px] p-3 block text-sm text-ink capitalize"
                            >
                                {slug.replace(/-/g, ' ')}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <section className="space-y-2 text-sm text-ink-soft">
                <p>
                    Overlapping corridors: another route running the same road doesn't lift this route's own score --
                    each route is scored on what it alone does. Two hourly routes on one road give residents an
                    effective 30-minute service, but each route alone still scores hourly; see{' '}
                    <Link to="/methodology" className="text-blue">/methodology</Link>.
                </p>
                <p>Band: <strong className="text-ink">{BAND_LABELS[detail.band]}</strong>.</p>
            </section>

            <WhyPtMattersSection />
        </div>
    );
};

export default RoutePage;
