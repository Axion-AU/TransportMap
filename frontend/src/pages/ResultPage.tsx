import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ScoreCard from '../components/ScoreCard';
import JoinCta from '../components/JoinCta';
import LookupInput from '../components/LookupInput';
import { catchmentScore, band, distanceMeters, friendlyModeName, VIABILITY_THRESHOLD, type StopLite, type ModeBreakdown } from '../lib/scoring';
import { verdictFor } from '../lib/verdict';
import { tilesFor } from '../lib/geo';
import suburbIndex from '../data/generated/suburb-index.json';
import type { SuburbIndex } from '../types/data';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';

const index = suburbIndex as SuburbIndex;

/**
 * Address-level result. Client-only and noindex: the URL carries rounded
 * coordinates, never an address. Shares are routed to the canonical suburb
 * page so public links stay crawlable and address-free.
 */
const ResultPage = () => {
    const [params] = useSearchParams();
    const lat = parseFloat(params.get('lat') ?? '');
    const lon = parseFloat(params.get('lon') ?? '');
    const valid = Number.isFinite(lat) && Number.isFinite(lon);

    const [stops, setStops] = useState<StopLite[] | null>(null);
    const [failed, setFailed] = useState(false);

    usePageMeta('Your result | Transport Score');

    useEffect(() => {
        if (!valid) return;
        const keys = tilesFor(lat, lon, 800);
        Promise.all(
            keys.map(k =>
                fetch(`/data/tiles/${k}.json`)
                    .then(r => (r.ok ? r.json() : []))
                    .catch(() => []),
            ),
        )
            .then((lists: StopLite[][]) => setStops(lists.flat()))
            .catch(() => setFailed(true));
    }, [lat, lon, valid]);

    const result = useMemo(() => {
        if (!stops) return null;
        return catchmentScore(stops, lat, lon);
    }, [stops, lat, lon]);

    const nearestSuburb = useMemo(() => {
        if (!valid || index.suburbs.length === 0) return null;
        return index.suburbs.reduce((best, s) => {
            const d = distanceMeters(lat, lon, s.lat, s.lon);
            return d < best.d ? { s, d } : best;
        }, { s: index.suburbs[0], d: Infinity }).s;
    }, [lat, lon, valid]);

    useEffect(() => {
        if (result && nearestSuburb) {
            track('score_viewed', { suburb: nearestSuburb.slug, band: band(result.score), method: 'address' });
        }
    }, [result, nearestSuburb]);

    if (!valid) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-16 space-y-6">
                <h1 className="type-display text-4xl">Start with your address</h1>
                <LookupInput autoFocus />
            </div>
        );
    }

    if (failed) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Could not load stop data. Try again.</div>;
    }

    if (!result) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Scoring the 800m around you…</div>;
    }

    const scoreBand = band(result.score);
    const modeStats = new Map<string, { stopCount: number; scoreSum: number; bestScore: number; viableCount: number }>();
    for (const s of result.nearbyStops) {
        const cur = modeStats.get(s.mode_name) ?? { stopCount: 0, scoreSum: 0, bestScore: 0, viableCount: 0 };
        cur.stopCount++;
        cur.scoreSum += s.final_score;
        cur.bestScore = Math.max(cur.bestScore, s.final_score);
        if (s.final_score > VIABILITY_THRESHOLD) cur.viableCount++;
        modeStats.set(s.mode_name, cur);
    }
    // Sorted by prevalence (stopCount), not best single stop: the primary
    // mode is whichever one most nearby stops belong to, matching
    // suburbScore's per-suburb logic (see scoring.ts's ModeBreakdown doc).
    const modeBreakdown: ModeBreakdown[] = [...modeStats.entries()]
        .map(([modeName, v]) => ({ modeName, stopCount: v.stopCount, bestScore: v.bestScore, avgScore: v.scoreSum / v.stopCount, viableCount: v.viableCount }))
        .sort((a, b) => b.stopCount - a.stopCount);
    const primaryModeName = modeBreakdown.length > 0 ? modeBreakdown[0].modeName : null;
    const waits = result.nearbyStops
        .filter(s => primaryModeName === null || s.mode_name === primaryModeName)
        .map(s => s.average_wait_time)
        .filter(w => Number.isFinite(w) && w > 0)
        .sort((a, b) => a - b);
    const medianWait = waits.length ? waits[Math.floor(waits.length / 2)] : null;
    const modeNoun = primaryModeName ? friendlyModeName(primaryModeName) : 'Services';
    const verdict = verdictFor(scoreBand, {
        medianWaitMinutes: medianWait,
        modeNoun,
        breakdown: {
            frequency: result.avgFrequency,
            coverage: result.avgCoverage,
            reliability: result.avgReliability,
        },
        modeBreakdown,
    });
    const roundedScore = Math.round(result.score);

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8">
            <ScoreCard
                title="Your address"
                score={roundedScore}
                band={scoreBand}
                breakdown={{
                    frequency: Math.round(result.avgFrequency),
                    coverage: Math.round(result.avgCoverage),
                    reliability: Math.round(result.avgReliability),
                }}
                verdict={verdict}
                subtitle={`${result.nearbyStops.length} stops within an 800m walk. ${result.viableCount} routes above the 50 point viability line.`}
            />

            {nearestSuburb && (
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 text-sm">
                    Want to share this? Share the{' '}
                    <Link to={`/score/${nearestSuburb.slug}`} className="text-blue font-semibold">
                        {nearestSuburb.name} suburb page
                    </Link>{' '}
                    instead. It carries the same story with no trace of your address.
                </div>
            )}

            {nearestSuburb && (
                <JoinCta slug={nearestSuburb.slug} suburbName={nearestSuburb.name} score={roundedScore} band={scoreBand} isRegional={nearestSuburb.isRegional} />
            )}
        </div>
    );
};

export default ResultPage;
