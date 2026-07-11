import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SuburbDetail } from '../types/data';
import { BAND_COLORS, BAND_LABELS } from '../lib/scoring';
import { site } from '../config/site';
import { track } from '../lib/analytics';
import manifest from '../data/generated/manifest.json';

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

const EmbedBreakdownBar = ({ label, value }: { label: string; value: number }) => (
    <div>
        <div className="flex justify-between items-baseline mb-0.5">
            <span className="type-overline text-[9px] text-ink-soft">{label}</span>
            <span className="type-data text-xs text-ink">{value}/100</span>
        </div>
        <div className="h-1 bg-white/10 rounded-[2px] overflow-hidden">
            <div className="h-full bg-cyan" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        </div>
    </div>
);

const EmbedSuburbScore = () => {
    const { slug = '' } = useParams();
    const [detail, setDetail] = useState<SuburbDetail | null>(() => islandData(slug));
    const [missing, setMissing] = useState(false);

    useEffect(() => {
        let host = 'direct';
        try {
            host = document.referrer ? new URL(document.referrer).host : 'direct';
        } catch {
            /* unparseable referrer stays "direct" */
        }
        track('embed_loaded', { referrerHost: host, suburb: slug });
    }, [slug]);

    useEffect(() => {
        const island = islandData(slug);
        if (island) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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

        return () => {
            cancelled = true;
        };
    }, [slug]);

    if (missing) {
        return (
            <div className="min-h-screen bg-purple-900 text-ink p-4 flex flex-col justify-between text-center select-none">
                <div className="flex flex-col justify-center items-center flex-grow py-8">
                    <p className="text-ink-soft text-sm">Suburb data unavailable</p>
                    <a href={site.origin} target="_parent" className="text-blue text-xs mt-2 font-semibold">Search on Transport Score</a>
                </div>
                <div className="border-t border-border-subtle pt-2 mt-auto text-[10px] text-ink-faint text-left">
                    <p className="type-overline text-[8px] text-ink font-semibold tracking-wide">{site.authorisationLine}</p>
                </div>
            </div>
        );
    }

    if (!detail) {
        return (
            <div className="min-h-screen bg-purple-900 text-ink p-4 flex flex-col justify-between select-none">
                <div className="flex justify-center items-center flex-grow py-8">
                    <span className="text-ink-faint text-sm">Loading score…</span>
                </div>
                <div className="border-t border-border-subtle pt-2 mt-auto text-[10px] text-ink-faint">
                    <p className="type-overline text-[8px] text-ink font-semibold tracking-wide">{site.authorisationLine}</p>
                </div>
            </div>
        );
    }

    const color = BAND_COLORS[detail.band];

    return (
        <div className="min-h-screen bg-purple-900 text-ink p-4 flex flex-col justify-between select-none">
            <div>
                {manifest.fixture && (
                    <div data-sample-banner className="bg-magenta text-white text-center text-[10px] font-semibold py-0.5 mb-2 rounded-[2px]">
                        SAMPLE DATA
                    </div>
                )}
                
                <div className="flex justify-between items-start gap-4 mb-2">
                    <div>
                        <span className="type-overline text-[9px] text-ink-faint">Public transport score</span>
                        <h1 className="type-display text-xl leading-tight text-ink uppercase truncate max-w-[200px]">{detail.name}</h1>
                    </div>
                    <span className="type-display text-sm px-2 py-0.5 rounded-[4px] shrink-0" style={{ color, border: `1px solid ${color}` }}>
                        {BAND_LABELS[detail.band]}
                    </span>
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                    <span className="type-data text-5xl font-bold leading-none" style={{ color }}>{detail.score}</span>
                    <span className="type-data text-lg text-ink-faint">/100</span>
                </div>

                <p className="text-xs text-ink-soft leading-relaxed mb-4 line-clamp-2">{detail.verdict}</p>

                <div className="grid gap-3 grid-cols-3 mb-4">
                    <EmbedBreakdownBar label="Frequency" value={detail.breakdown.frequency} />
                    <EmbedBreakdownBar label="Coverage" value={detail.breakdown.coverage} />
                    <EmbedBreakdownBar label="Reliability" value={detail.breakdown.reliability} />
                </div>
            </div>

            <div className="border-t border-border-subtle pt-2 mt-auto space-y-1 text-[10px] text-ink-faint">
                <div className="flex justify-between items-center">
                    <span>Source: <a href={`${site.origin}/score/${detail.slug}`} target="_parent" className="text-blue font-semibold">Transport Score</a></span>
                    <a href={`${site.origin}/score/${detail.slug}`} target="_parent" className="text-blue font-semibold">Full analysis &rarr;</a>
                </div>
                <p className="type-overline text-[8px] text-ink font-semibold tracking-wide mt-1">{site.authorisationLine}</p>
            </div>
        </div>
    );
};

export default EmbedSuburbScore;
