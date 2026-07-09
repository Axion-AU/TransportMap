import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ScoreCard from '../components/ScoreCard';
import ShareBar from '../components/ShareBar';
import JoinCta from '../components/JoinCta';
import LookupInput from '../components/LookupInput';
import type { SuburbDetail } from '../types/data';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';

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

const SuburbScorePage = () => {
    const { slug = '' } = useParams();
    const [detail, setDetail] = useState<SuburbDetail | null>(() => islandData(slug));
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        const island = islandData(slug);
        if (island) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- slug changes swap to inlined data without a fetch
            setDetail(island);
            return;
        }
         
        setDetail(null);
        setMissing(false);
        fetch(`/data/suburbs/${slug}.json`)
            .then(res => {
                if (!res.ok) throw new Error('missing');
                return res.json();
            })
            .then((d: SuburbDetail) => setDetail(d))
            .catch(() => setMissing(true));
    }, [slug]);

    usePageMeta(
        detail ? `${detail.name} scores ${detail.score}/100 for public transport | Transport Score` : 'Transport Score',
        detail?.verdict,
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

            <ShareBar slug={detail.slug} suburbName={detail.name} score={detail.score} verdict={detail.verdict} />

            <JoinCta slug={detail.slug} suburbName={detail.name} score={detail.score} band={detail.band} />

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <Link to="/suburbs" className="text-blue">Where does {detail.name} rank?</Link>
                <Link to="/map" className="text-blue">See every stop on the map</Link>
            </div>
        </div>
    );
};

export default SuburbScorePage;
