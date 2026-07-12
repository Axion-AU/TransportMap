import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import routeIndex from '../data/generated/route-index.json';
import type { RouteIndex } from '../types/data';
import { BAND_COLORS } from '../lib/scoring';
import { usePageMeta } from '../lib/meta';

const index = routeIndex as RouteIndex;

const MODES = ['bus', 'tram', 'train', 'skybus'] as const;
const MODE_LABELS: Record<string, string> = { bus: 'Bus', tram: 'Tram', train: 'Train', skybus: 'SkyBus' };

/**
 * Route league table (docs/route-scoring.md): worst/best 20 per mode.
 * Eligibility (not school_special, not rail_replacement, catchmentPopulation
 * >= 5,000, >= 6 weekday trips) is applied at build time in build-data.mjs,
 * so every slug listed here already cleared the bar.
 */
const RouteLeagueTablePage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const modeParam = searchParams.get('mode');
    const [mode, setMode] = useState<string>(modeParam && MODES.includes(modeParam as typeof MODES[number]) ? modeParam : 'bus');
    const [listType, setListType] = useState<'worst' | 'best'>('worst');

    const title = listType === 'worst'
        ? `The 20 worst scoring ${MODE_LABELS[mode].toLowerCase()} routes in Melbourne`
        : `The 20 best scoring ${MODE_LABELS[mode].toLowerCase()} routes in Melbourne`;

    usePageMeta(
        `${title} | Transport Score`,
        'Melbourne routes ranked by what the route itself does: frequency, catchment, connectivity, and directness, computed from the PTV timetable data.',
    );

    const slugs = (listType === 'worst' ? index.worst20ByMode[mode] : index.best20ByMode[mode]) ?? [];
    const rows = slugs
        .map((slug, i) => {
            const r = index.routes.find(rt => rt.slug === slug);
            if (!r) return null;
            return { ...r, rank: i + 1 };
        })
        .filter((r): r is NonNullable<typeof r> => Boolean(r));

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-10">
            <header className="space-y-4">
                <p className="type-overline text-magenta">The route league table</p>
                <h1 className="type-display text-4xl md:text-6xl">{title}</h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    Ranked by what the route itself does, not what its stops inherit from their
                    surroundings. Routes need at least 5,000 people in catchment and 6 weekday trips
                    to qualify, so school runs and flexi-routes can't skew the list. Every number
                    reproduces from the <Link to="/methodology" className="text-blue">methodology page</Link>.
                </p>
            </header>

            <div className="flex flex-wrap gap-2 border-b border-border-subtle pb-2">
                {MODES.map(m => (
                    <button
                        key={m}
                        onClick={() => { setMode(m); setSearchParams({ mode: m }); }}
                        className={`font-semibold pb-2 px-1 border-b-2 transition-all ${
                            mode === m ? 'border-magenta text-magenta' : 'border-transparent text-ink-soft hover:text-ink'
                        }`}
                    >
                        {MODE_LABELS[m]}
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 text-sm">
                <button
                    onClick={() => setListType('worst')}
                    className={`px-4 py-2 rounded-[4px] border transition-all ${
                        listType === 'worst' ? 'bg-magenta border-magenta text-white font-semibold' : 'bg-surface-raised border-border-strong text-ink-soft hover:text-ink'
                    }`}
                >
                    Worst 20
                </button>
                <button
                    onClick={() => setListType('best')}
                    className={`px-4 py-2 rounded-[4px] border transition-all ${
                        listType === 'best' ? 'bg-magenta border-magenta text-white font-semibold' : 'bg-surface-raised border-border-strong text-ink-soft hover:text-ink'
                    }`}
                >
                    Best 20
                </button>
            </div>

            <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 md:p-6 overflow-x-auto">
                {rows.length === 0 ? (
                    <p className="text-ink-soft text-sm py-8 text-center">No eligible {MODE_LABELS[mode].toLowerCase()} routes yet.</p>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="type-overline text-ink-faint border-b border-border-strong">
                                <th className="py-2 pr-2">Rank</th>
                                <th className="py-2 pr-2">Route</th>
                                <th className="py-2 pr-2 text-right">Score</th>
                                <th className="py-2 text-right">Catchment population</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.slug} className="border-b border-border-subtle">
                                    <td className="py-2.5 pr-2 type-data text-ink-faint">#{r.rank}</td>
                                    <td className="py-2.5 pr-2">
                                        <Link to={`/route/${r.slug}`} className="text-ink hover:text-blue font-semibold">
                                            {r.number}
                                        </Link>
                                    </td>
                                    <td className="py-2.5 pr-2 text-right type-data" style={{ color: BAND_COLORS[r.band] }}>
                                        {r.score}/100
                                    </td>
                                    <td className="py-2.5 text-right type-data text-ink-faint">
                                        {r.catchmentPopulation.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default RouteLeagueTablePage;
