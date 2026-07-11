import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import type { SuburbDetail, SuburbIndex } from '../types/data';
import { BAND_COLORS, BAND_LABELS } from '../lib/scoring';
import { track } from '../lib/analytics';
import suburbIndex from '../data/generated/suburb-index.json';
import { usePageMeta } from '../lib/meta';
import JoinCta from '../components/JoinCta';

const index = suburbIndex as SuburbIndex;

function islandData(slugsKey: string): { detailA: SuburbDetail; detailB: SuburbDetail } | null {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById('compare-data');
    if (!el?.textContent) return null;
    try {
        const parsed = JSON.parse(el.textContent) as { detailA: SuburbDetail; detailB: SuburbDetail };
        const key = `${parsed.detailA.slug}-vs-${parsed.detailB.slug}`;
        return key === slugsKey ? parsed : null;
    } catch {
        return null;
    }
}

const CompareBar = ({ label, valA, valB }: { label: string; valA: number; valB: number }) => {
    const diff = valA - valB;
    return (
        <div className="py-3 border-b border-border-subtle last:border-0">
            <div className="flex justify-between text-xs type-overline text-ink-faint mb-1.5">{label}</div>
            <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4 text-left font-bold type-data text-ink text-sm sm:text-base">
                    {valA}/100
                </div>
                <div className="col-span-4 text-center text-[10px] text-ink-soft bg-surface-raised px-1.5 py-0.5 rounded-[2px] truncate">
                    {diff > 0 ? `+${diff} A` : diff < 0 ? `+${Math.abs(diff)} B` : 'Tie'}
                </div>
                <div className="col-span-4 text-right font-bold type-data text-ink text-sm sm:text-base">
                    {valB}/100
                </div>
            </div>
            {/* Visual comparison bar */}
            <div className="grid grid-cols-12 gap-3 mt-1.5">
                <div className="col-span-6 flex justify-end">
                    <div className="h-1.5 bg-white/10 rounded-[2px] w-full max-w-[150px] overflow-hidden flex justify-end">
                        <div className="h-full bg-cyan transition-all" style={{ width: `${valA}%` }} />
                    </div>
                </div>
                <div className="col-span-6">
                    <div className="h-1.5 bg-white/10 rounded-[2px] w-full max-w-[150px] overflow-hidden">
                        <div className="h-full bg-cyan transition-all" style={{ width: `${valB}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const SuburbSelector = ({ 
    label, 
    value, 
    onChange 
}: { 
    label: string; 
    value: string; 
    onChange: (val: string) => void 
}) => {
    const sortedSuburbs = useMemo(() => {
        return [...index.suburbs].sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <label className="type-overline text-ink-faint text-xs">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-surface-raised border border-border-strong rounded-[4px] px-3 py-2 text-sm text-ink focus:outline-none focus:border-magenta"
            >
                <option value="">Select a suburb...</option>
                {sortedSuburbs.map((s) => (
                    <option key={s.slug} value={s.slug}>
                        {s.name} ({s.score}/100)
                    </option>
                ))}
            </select>
        </div>
    );
};

const ComparePage = () => {
    const { slugA_vs_slugB = '' } = useParams();
    const navigate = useNavigate();

    // Parse comparison slugs
    const [slugA, slugB] = useMemo(() => {
        const parts = slugA_vs_slugB.split('-vs-');
        return [parts[0] || '', parts[1] || ''];
    }, [slugA_vs_slugB]);

    const island = useMemo(() => islandData(slugA_vs_slugB), [slugA_vs_slugB]);

    const [detailA, setDetailA] = useState<SuburbDetail | null>(island?.detailA || null);
    const [detailB, setDetailB] = useState<SuburbDetail | null>(island?.detailB || null);
    const [loading, setLoading] = useState(!island);
    const [error, setError] = useState<string | null>(null);

    // Form states for custom selector
    const [selectA, setSelectA] = useState(slugA);
    const [selectB, setSelectB] = useState(slugB);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectA(slugA);
        setSelectB(slugB);
    }, [slugA, slugB]);

    useEffect(() => {
        const cached = islandData(slugA_vs_slugB);
        if (cached) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDetailA(cached.detailA);
            setDetailB(cached.detailB);
            setLoading(false);
            return;
        }

        if (!slugA || !slugB) {
            setError('Invalid comparison slugs provided.');
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        Promise.all([
            fetch(`/data/suburbs/${slugA}.json`).then(r => { if (!r.ok) throw new Error(slugA); return r.json() as Promise<SuburbDetail>; }),
            fetch(`/data/suburbs/${slugB}.json`).then(r => { if (!r.ok) throw new Error(slugB); return r.json() as Promise<SuburbDetail>; })
        ])
            .then(([resA, resB]) => {
                if (!cancelled) {
                    setDetailA(resA);
                    setDetailB(resB);
                    setLoading(false);
                }
            })
            .catch((err: Error) => {
                if (!cancelled) {
                    console.error('Error fetching compare data:', err);
                    setError(`Could not load comparison data for suburb: ${err.message}`);
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [slugA_vs_slugB, slugA, slugB]);

    const title = detailA && detailB 
        ? `${detailA.name} vs ${detailB.name} Public Transport Comparison | Transport Score`
        : 'Compare Suburbs';

    const desc = detailA && detailB 
        ? `Compare public transport scores, wait times, coverage, and timetabled quality between ${detailA.name} (${detailA.score}/100) and ${detailB.name} (${detailB.score}/100).`
        : undefined;

    usePageMeta(title, desc);

    useEffect(() => {
        if (detailA && detailB) {
            track('compare_viewed', { slugA: detailA.slug, slugB: detailB.slug, scoreA: detailA.score, scoreB: detailB.score });
        }
    }, [detailA, detailB]);

    const handleCompare = () => {
        if (selectA && selectB && selectA !== selectB) {
            navigate(`/${selectA}-vs-${selectB}`);
        }
    };

    const winnerText = useMemo(() => {
        if (!detailA || !detailB) return '';
        const diff = Math.abs(detailA.score - detailB.score);
        if (diff === 0) return `Both suburbs score exactly the same (${detailA.score}/100).`;
        const winner = detailA.score > detailB.score ? detailA : detailB;
        const loser = detailA.score > detailB.score ? detailB : detailA;
        return `${winner.name} scores ${winner.score}/100 (${BAND_LABELS[winner.band]}), which is ${diff} points higher than ${loser.name} (${loser.score}/100, ${BAND_LABELS[loser.band]}).`;
    }, [detailA, detailB]);

    if (!slugA_vs_slugB.includes('-vs-')) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-16 space-y-6 text-center">
                <h1 className="type-display text-4xl">Page Not Found</h1>
                <p className="text-ink-soft">The page you are looking for does not exist.</p>
                <Link to="/" className="inline-block text-blue font-semibold">Go back home</Link>
            </div>
        );
    }

    if (loading) {
        return <div className="max-w-3xl mx-auto px-5 py-16 text-ink-soft">Loading comparison…</div>;
    }

    if (error || !detailA || !detailB) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-16 space-y-6">
                <h1 className="type-display text-4xl">Comparison Error</h1>
                <p className="text-band-poor">{error || 'Could not load the comparison. Please select two valid suburbs.'}</p>
                <div className="flex flex-col sm:flex-row gap-4 bg-surface-raised border border-border-subtle rounded-[4px] p-5">
                    <SuburbSelector label="Suburb A" value={selectA} onChange={setSelectA} />
                    <SuburbSelector label="Suburb B" value={selectB} onChange={setSelectB} />
                    <button
                        onClick={handleCompare}
                        disabled={!selectA || !selectB || selectA === selectB}
                        className="pressable px-6 py-2 bg-magenta text-white font-semibold rounded-[4px] self-end disabled:opacity-50"
                    >
                        Compare
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-10">
            <header className="space-y-4">
                <p className="type-overline text-magenta">Side-by-side comparison</p>
                <h1 className="type-display text-4xl md:text-6xl uppercase leading-none">
                    {detailA.name} <span className="text-ink-soft">vs</span> {detailB.name}
                </h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    Compare public transport quality, frequency, coverage, and access. Every number displayed matches the published timetable analysis.
                </p>
                <p className="text-sm text-ink-soft max-w-2xl leading-relaxed">{winnerText}</p>
            </header>

            {/* Custom Comparison Selector */}
            <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 space-y-4">
                <h2 className="type-display text-xl text-ink">Compare other suburbs</h2>
                <div className="flex flex-col sm:flex-row items-end gap-4">
                    <SuburbSelector label="Suburb A" value={selectA} onChange={setSelectA} />
                    <SuburbSelector label="Suburb B" value={selectB} onChange={setSelectB} />
                    <button
                        onClick={handleCompare}
                        disabled={!selectA || !selectB || selectA === selectB}
                        className="pressable w-full sm:w-auto px-6 py-2.5 bg-magenta text-white font-semibold rounded-[4px] disabled:opacity-50"
                    >
                        Compare
                    </button>
                </div>
            </div>

            {/* Comparison Table */}
            <section className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 space-y-6">
                <div className="grid grid-cols-12 gap-3 pb-3 border-b border-border-strong text-ink font-bold uppercase type-display text-sm sm:text-base">
                    <div className="col-span-4 text-left">{detailA.name}</div>
                    <div className="col-span-4 text-center text-ink-faint">Metric</div>
                    <div className="col-span-4 text-right">{detailB.name}</div>
                </div>

                {/* Score */}
                <div className="py-4 border-b border-border-subtle">
                    <div className="flex justify-between text-xs type-overline text-ink-faint mb-2">Overall Score & Band</div>
                    <div className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4 text-left">
                            <span className="type-data text-3xl sm:text-4xl" style={{ color: BAND_COLORS[detailA.band] }}>{detailA.score}</span>
                            <span className="type-data text-xs text-ink-faint">/100</span>
                            <div className="text-[10px] uppercase font-bold type-overline mt-1" style={{ color: BAND_COLORS[detailA.band] }}>
                                {BAND_LABELS[detailA.band]}
                            </div>
                        </div>
                        <div className="col-span-4 text-center text-[10px] text-ink-faint">
                            Score Band Comparison
                        </div>
                        <div className="col-span-4 text-right">
                            <span className="type-data text-3xl sm:text-4xl" style={{ color: BAND_COLORS[detailB.band] }}>{detailB.score}</span>
                            <span className="type-data text-xs text-ink-faint">/100</span>
                            <div className="text-[10px] uppercase font-bold type-overline mt-1" style={{ color: BAND_COLORS[detailB.band] }}>
                                {BAND_LABELS[detailB.band]}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sub-Scores */}
                <CompareBar label="Frequency Score" valA={detailA.breakdown.frequency} valB={detailB.breakdown.frequency} />
                <CompareBar label="Coverage Score" valA={detailA.breakdown.coverage} valB={detailB.breakdown.coverage} />
                <CompareBar label="Reliability Score" valA={detailA.breakdown.reliability} valB={detailB.breakdown.reliability} />

                {/* Stops Scored */}
                <div className="py-3 border-b border-border-subtle">
                    <div className="flex justify-between text-xs type-overline text-ink-faint mb-1">Total Stops Scored</div>
                    <div className="grid grid-cols-12 gap-3 items-center text-ink text-sm sm:text-base type-data">
                        <div className="col-span-4 text-left">{detailA.stopCount}</div>
                        <div className="col-span-4 text-center text-[10px] text-ink-soft">Stops</div>
                        <div className="col-span-4 text-right">{detailB.stopCount}</div>
                    </div>
                </div>

                {/* Viable Routes */}
                <div className="py-3 border-b border-border-subtle">
                    <div className="flex justify-between text-xs type-overline text-ink-faint mb-1">Viable Routes (&gt;50 pt)</div>
                    <div className="grid grid-cols-12 gap-3 items-center text-ink text-sm sm:text-base type-data">
                        <div className="col-span-4 text-left">{detailA.viableCount}</div>
                        <div className="col-span-4 text-center text-[10px] text-ink-soft">Routes</div>
                        <div className="col-span-4 text-right">{detailB.viableCount}</div>
                    </div>
                </div>

                {/* Median Wait */}
                <div className="py-3 border-b border-border-subtle last:border-0">
                    <div className="flex justify-between text-xs type-overline text-ink-faint mb-1">Median Wait Time</div>
                    <div className="grid grid-cols-12 gap-3 items-center text-ink text-sm sm:text-base type-data">
                        <div className="col-span-4 text-left">
                            {detailA.medianWaitMinutes != null ? `${detailA.medianWaitMinutes.toFixed(1)}m` : 'N/A'}
                        </div>
                        <div className="col-span-4 text-center text-[10px] text-ink-soft">Minutes</div>
                        <div className="col-span-4 text-right">
                            {detailB.medianWaitMinutes != null ? `${detailB.medianWaitMinutes.toFixed(1)}m` : 'N/A'}
                        </div>
                    </div>
                </div>
            </section>

            {/* Links and Shared Campaigns */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm justify-center">
                <Link to={`/score/${detailA.slug}`} className="text-blue font-semibold">View {detailA.name}'s detailed scorecard &rarr;</Link>
                <Link to={`/score/${detailB.slug}`} className="text-blue font-semibold">View {detailB.name}'s detailed scorecard &rarr;</Link>
            </div>

            {/* Campaign conversion banner */}
            <JoinCta slug={detailA.score < detailB.score ? detailA.slug : detailB.slug} suburbName={detailA.score < detailB.score ? detailA.name : detailB.name} score={Math.min(detailA.score, detailB.score)} band={detailA.score < detailB.score ? detailA.band : detailB.band} isRegional={detailA.isRegional || detailB.isRegional} />
        </div>
    );
};

export default ComparePage;
