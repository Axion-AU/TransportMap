import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Code } from 'lucide-react';
import ScoreCard from '../components/ScoreCard';
import ShareBar from '../components/ShareBar';
import JoinCta from '../components/JoinCta';
import LookupInput from '../components/LookupInput';
import ClientOnly from '../components/ClientOnly';
import { CarCompetitivenessSection } from '../components/CarCompetitivenessSection';
import type { SuburbDetail, SuburbIndex, SuburbIndexEntry } from '../types/data';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';
import { BAND_LABELS, BAND_COLORS, band } from '../lib/scoring';
import manifest from '../data/generated/manifest.json';
import suburbIndex from '../data/generated/suburb-index.json';

const SuburbMap = lazy(() => import('../components/SuburbMap'));

const index = suburbIndex as SuburbIndex;

// Melbourne-wide median score, used in FAQ comparisons.
const allScores = [...index.suburbs].map(s => s.score).sort((a, b) => a - b);
const melbourneMedian = allScores[Math.floor(allScores.length / 2)] ?? 50;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearby(slug: string, lat: number, lon: number, count = 4): SuburbIndexEntry[] {
    return index.suburbs
        .filter(s => s.slug !== slug && s.lat != null && s.lon != null)
        .map(s => ({ ...s, _dist: haversineKm(lat, lon, s.lat, s.lon) }))
        .sort((a: SuburbIndexEntry & { _dist: number }, b: SuburbIndexEntry & { _dist: number }) => a._dist - b._dist)
        .slice(0, count);
}

/**
 * Reads the JSON island injected at prerender time when present, so the
 * prerendered page paints with zero fetches and hydration matches exactly.
 */
function islandData(slug: string): SuburbDetail | null {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('suburb-data');
    if (!el?.textContent) return null;
    try {
        const parsed = JSON.parse(el.textContent) as SuburbDetail;
        return parsed.slug === slug ? parsed : null;
    } catch {
        return null;
    }
}

/** FAQ section: generates 3 structured Q&As from suburb data for AI extractability. */
const SuburbFaq = ({ detail }: { detail: SuburbDetail }) => {
    const diff = Math.abs(detail.score - melbourneMedian);
    const direction = detail.score >= melbourneMedian ? 'above' : 'below';
    const bandLabel = BAND_LABELS[detail.band];

    return (
        <section className="space-y-4">
            <h2 className="type-display text-2xl text-ink">About this score</h2>
            <dl className="divide-y divide-border-subtle">
                <div className="py-4 space-y-1">
                    <dt className="font-semibold text-ink">
                        What is {detail.name}&apos;s public transport score?
                    </dt>
                    <dd className="text-ink-soft leading-relaxed">
                        {detail.name} scores {detail.score}/100 for public transport, placing it in
                        the <strong className="text-ink">{bandLabel}</strong> band.{' '}
                        {detail.verdict}
                    </dd>
                </div>
                <div className="py-4 space-y-1">
                    <dt className="font-semibold text-ink">
                        How does {detail.name} compare to the Melbourne average?
                    </dt>
                    <dd className="text-ink-soft leading-relaxed">
                        {detail.name} is{' '}
                        <strong className="text-ink">
                            {diff} point{diff !== 1 ? 's' : ''} {direction}
                        </strong>{' '}
                        the Melbourne median of {melbourneMedian}/100.{' '}
                        {detail.score < melbourneMedian
                            ? 'Most Melbourne suburbs score higher.'
                            : 'Most Melbourne suburbs score lower.'}
                    </dd>
                </div>
                <div className="py-4 space-y-1">
                    <dt className="font-semibold text-ink">
                        What modes serve {detail.name}?
                    </dt>
                    <dd className="text-ink-soft leading-relaxed">
                        {detail.name} is served by {detail.modeNoun}. Scores are computed across
                        all modes that stop within the suburb, using{' '}
                        <Link to="/methodology" className="text-blue">
                            the published PTV GTFS timetable
                        </Link>
                        .
                    </dd>
                </div>
            </dl>
        </section>
    );
};

/**
 * The suburb map: real Vicmap boundary, the same 250m grid cells used to
 * compute the score (a coverage surface, not per-stop dots), and every
 * scored stop. Lazy-loaded and client-only since Leaflet needs the DOM and
 * is heavy enough not to want it in the initial bundle or the prerendered
 * HTML.
 */
const SuburbMapSection = ({ detail }: { detail: SuburbDetail }) => (
    <section className="space-y-3">
        <h2 className="type-display text-2xl text-ink">Coverage map</h2>
        <p className="text-sm text-ink-soft">
            {detail.boundary
                ? 'Shaded 250m cells are the same ones used to compute the score above, coloured by the same bands. Dots are individually scored stops.'
                : 'This suburb falls outside the real-boundary scoring area for now, so no coverage shading is shown -- dots are individually scored stops.'}
        </p>
        <div className="h-[420px] rounded-[4px] overflow-hidden border border-border-subtle">
            <ClientOnly fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-ink-faint">Loading map…</div>}>
                    <SuburbMap detail={detail} />
                </Suspense>
            </ClientOnly>
        </div>
    </section>
);

/** Every scored stop in the suburb, sorted best to worst. */
const StopList = ({ detail }: { detail: SuburbDetail }) => {
    if (detail.stops.length === 0) return null;
    return (
        <section className="space-y-3">
            <h2 className="type-display text-2xl text-ink">Every stop in {detail.name}</h2>
            <div className="border border-border-subtle rounded-[4px] divide-y divide-border-subtle max-h-[480px] overflow-y-auto">
                {detail.stops.map((stop, i) => {
                    const stopBand = band(stop.final_score);
                    const stopColor = BAND_COLORS[stopBand];
                    return (
                        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <div className="min-w-0">
                                <div className="text-ink truncate">{stop.name}</div>
                                <div className="text-ink-faint text-xs">{stop.mode_name}</div>
                            </div>
                            <span
                                className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-[2px] type-data"
                                style={{ backgroundColor: stopColor + '20', color: stopColor }}
                            >
                                {stop.final_score}/100
                            </span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

/** Nearby suburbs: cross-links to geographically adjacent pages for internal linking. */
const NearbySuburbs = ({ detail }: { detail: SuburbDetail }) => {
    const nearby = getNearby(detail.slug, detail.centroid.lat, detail.centroid.lon);
    if (nearby.length === 0) return null;

    return (
        <section className="space-y-3">
            <h2 className="type-display text-2xl text-ink">Nearby suburbs</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {nearby.map(s => (
                    <Link
                        key={s.slug}
                        to={`/score/${s.slug}`}
                        className="pressable bg-surface-raised border border-border-subtle rounded-[4px] p-4 block"
                    >
                        <div className="text-sm font-semibold text-ink leading-tight mb-1">
                            {s.name}
                        </div>
                        <div className="type-data text-xl text-ink-soft">{s.score}/100</div>
                    </Link>
                ))}
            </div>
        </section>
    );
};

const SuburbScorePage = () => {
    const { slug = '' } = useParams();
    const [detail, setDetail] = useState<SuburbDetail | null>(() => islandData(slug));
    const [missing, setMissing] = useState(false);
    const [embedCopied, setEmbedCopied] = useState(false);

    const copyEmbed = async () => {
        if (!detail) return;
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://transportscore.fusionparty.org.au';
        const embedCode = `<iframe src="${origin}/embed/score/${detail.slug}" width="100%" height="320" style="border:0;background:transparent;" title="${detail.name} Transport Score"></iframe>`;
        try {
            await navigator.clipboard.writeText(embedCode);
            setEmbedCopied(true);
            setTimeout(() => setEmbedCopied(false), 2000);
        } catch {
            /* clipboard unavailable */
        }
    };

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
        fetch(`/data/suburbs/${slug}.json`)
            .then(res => {
                if (!res.ok) throw new Error('missing');
                return res.json();
            })
            .then((d: SuburbDetail) => {
                if (!cancelled) setDetail(d);
            })
            .catch(() => {
                if (!cancelled) setMissing(true);
            });
        // A slow response for a slug the user has since navigated away from
        // must not overwrite the newer one that already landed.
        return () => {
            cancelled = true;
        };
    }, [slug]);

    usePageMeta(
        detail ? `${detail.name} scores ${detail.score}/100 for public transport | Transport Score` : 'Transport Score',
        detail
            ? `${detail.verdict.replace(/\.$/, '')}. Scored from ${manifest.dataVintageLabel} PTV timetable data.`
            : undefined,
    );

    useEffect(() => {
        if (detail) track('score_viewed', { suburb: detail.slug, band: detail.band });
    }, [detail]);

    if (missing) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-16 space-y-6">
                <h1 className="type-display text-4xl">We do not have that suburb yet</h1>
                <p className="text-ink-soft">Coverage is Melbourne GTFS for now. Try a nearby suburb.</p>
                <LookupInput />
            </div>
        );
    }

    if (!detail) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Loading score…</div>;
    }

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8">
            <ScoreCard
                title={detail.name}
                score={detail.score}
                band={detail.band}
                breakdown={detail.breakdown}
                verdict={detail.verdict}
                subtitle={`${detail.stopCount} stops scored. Best route ${detail.bestScore}/100. ${detail.viableCount} routes above the 50 point viability line.`}
            />

            {detail.note && (
                <p className="border border-magenta rounded-[4px] p-3 text-sm">{detail.note}</p>
            )}

            <ShareBar slug={detail.slug} suburbName={detail.name} score={detail.score} verdict={detail.verdict} breakdown={detail.breakdown} />

            <JoinCta slug={detail.slug} suburbName={detail.name} score={detail.score} band={detail.band} isRegional={detail.isRegional} />

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link to={`/suburbs?focus=${detail.slug}`} className="text-blue">Where does {detail.name} rank?</Link>
                <Link to="/map" className="text-blue">See every stop on the map</Link>
            </div>

            <SuburbMapSection detail={detail} />

            <CarCompetitivenessSection detail={detail} />

            <section className="border border-border-subtle rounded-[4px] p-5 md:p-6 space-y-3 bg-surface-raised">
                <h2 className="type-display text-2xl text-ink">Embed this scorecard</h2>
                <p className="text-sm text-ink-soft">
                    Display this live scorecard on your own website or local community portal.
                </p>
                <pre className="bg-purple-900 border border-border-subtle rounded-[4px] p-3 text-xs overflow-x-auto text-ink-soft"><code>{`<iframe src="${typeof window !== 'undefined' ? window.location.origin : 'https://transportscore.fusionparty.org.au'}/embed/score/${detail.slug}" width="100%" height="320" style="border:0;background:transparent;" title="${detail.name} Transport Score"></iframe>`}</code></pre>
                <button
                    onClick={copyEmbed}
                    className="pressable flex items-center gap-1.5 px-3 py-2 bg-purple-900 border border-border-strong text-sm font-semibold rounded-[4px]"
                >
                    {embedCopied ? <Check className="h-4 w-4 text-teal" /> : <Code className="h-4 w-4" />}
                    {embedCopied ? 'Copied code' : 'Copy embed code'}
                </button>
            </section>

            <SuburbFaq detail={detail} />

            <StopList detail={detail} />

            <NearbySuburbs detail={detail} />
        </div>
    );
};

export default SuburbScorePage;
