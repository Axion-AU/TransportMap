import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import suburbIndex from '../data/generated/suburb-index.json';
import type { SuburbIndex } from '../types/data';
import { BAND_COLORS, type Band } from '../lib/scoring';
import { site } from '../config/site';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';
import { Check, Code } from 'lucide-react';

const index = suburbIndex as SuburbIndex;
const LEAGUE_TABLE_MIN_STOPS = 3;

interface TableRow {
    name: string;
    slug: string;
    score: number;
    band: Band;
    stopCount: number;
    rank: number;
    highlighted?: boolean;
}


export const LeagueTable = ({
    rows,
    compact = false,
    linkTarget,
}: {
    rows: TableRow[];
    compact?: boolean;
    linkTarget?: string;
}) => {
    return (
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="type-overline text-ink-faint border-b border-border-strong">
                    <th className="py-2 pr-2">Rank</th>
                    <th className="py-2 pr-2">Suburb</th>
                    <th className="py-2 pr-2 text-right">Score</th>
                    {!compact && <th className="py-2 text-right">Stops scored</th>}
                </tr>
            </thead>
            <tbody>
                {rows.map((s) => (
                    <tr
                        key={s.slug}
                        className={`border-b border-border-subtle transition-all ${
                            s.highlighted ? 'bg-magenta/10 font-semibold' : ''
                        }`}
                    >
                        <td className="py-2.5 pr-2 type-data text-ink-faint">
                            #{s.rank}
                        </td>
                        <td className="py-2.5 pr-2">
                            <Link
                                to={`/score/${s.slug}`}
                                target={linkTarget}
                                className={`text-ink hover:text-blue ${
                                    s.highlighted ? 'text-magenta font-bold' : 'font-semibold'
                                }`}
                            >
                                {s.name}
                            </Link>
                        </td>
                        <td
                            className="py-2.5 pr-2 text-right type-data"
                            style={{ color: BAND_COLORS[s.band] }}
                        >

                            {s.score}/100
                        </td>
                        {!compact && (
                            <td className="py-2.5 text-right type-data text-ink-faint">
                                {s.stopCount}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export const WorstTable = ({ compact = false, linkTarget, slugs }: { compact?: boolean; linkTarget?: string; slugs: string[] }) => {
    const rows = slugs
        .map((slug, i) => {
            const s = index.suburbs.find(sub => sub.slug === slug);
            if (!s) return null;
            return {
                name: s.name,
                slug: s.slug,
                score: s.score,
                band: s.band,
                stopCount: s.stopCount,
                rank: i + 1,
            };
        })
        .filter((s): s is NonNullable<typeof s> => Boolean(s));

    return <LeagueTable rows={rows} compact={compact} linkTarget={linkTarget} />;
};

const SuburbSearchBox = ({ onSelect }: { onSelect: (slug: string) => void }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<typeof index.suburbs>([]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        if (val.length >= 2) {
            const matches = index.suburbs
                .filter(s => s.name.toLowerCase().includes(val.toLowerCase()))
                .slice(0, 5);
            setSuggestions(matches);
        } else {
            setSuggestions([]);
        }
    };

    return (
        <div className="relative w-full max-w-md">
            <input
                type="text"
                value={query}
                onChange={handleChange}
                placeholder="Type your suburb to see its rank..."
                className="w-full bg-surface-raised border border-border-strong rounded-[4px] px-4 py-2.5 text-ink placeholder-ink-faint focus:outline-none focus:border-magenta"
            />
            {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-surface-raised border border-border-strong rounded-[4px] shadow-lg z-10 divide-y divide-border-subtle">
                    {suggestions.map(s => (
                        <button
                            key={s.slug}
                            onClick={() => {
                                onSelect(s.slug);
                                setQuery('');
                                setSuggestions([]);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-magenta/10 hover:text-magenta transition-colors"
                        >
                            {s.name} <span className="text-xs text-ink-faint">({s.isRegional ? 'Regional' : 'Metro'})</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const LeagueTablePage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [region, setRegion] = useState<'metro' | 'regional'>('metro');
    const [listType, setListType] = useState<'worst' | 'best' | 'rankings'>('worst');
    const [focusSlug, setFocusSlug] = useState<string>('');

    // Handle initial load or update of query param focus
    useEffect(() => {
        const focus = searchParams.get('focus');
        if (focus) {
            const sub = index.suburbs.find(s => s.slug === focus);
            if (sub) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setRegion(sub.isRegional ? 'regional' : 'metro');
                setListType('rankings');
                setFocusSlug(focus);
            }
        }
    }, [searchParams]);

    const title = region === 'metro'
        ? (listType === 'worst' ? 'The 20 worst served suburbs in Melbourne' : listType === 'best' ? 'The 20 best served suburbs in Melbourne' : 'Suburbs ranked in Metropolitan Melbourne')
        : (listType === 'worst' ? 'The 20 worst served regional suburbs in Victoria' : listType === 'best' ? 'The 20 best served regional suburbs in Victoria' : 'Suburbs ranked in Regional Victoria');
    
    usePageMeta(
        `${title} | Transport Score`,
        'Melbourne and regional Victorian suburbs ranked by public transport score, computed from the PTV timetable data.',
    );
    const [copied, setCopied] = useState(false);

    const embedSnippet = `<iframe src="${site.origin}/embed/suburbs" width="100%" height="720" style="border:0" title="The 20 worst served suburbs in Melbourne, ranked by Transport Score"></iframe>`;

    const copyEmbed = async () => {
        try {
            await navigator.clipboard.writeText(embedSnippet);
            setCopied(true);
            track('share_clicked', { suburb: `league-table-${region}-${listType}`, channel: 'embed' });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable (unsupported or insecure context); no-op */
        }
    };

    // Calculate lists
    const targetSuburbs = index.suburbs
        .filter(s => s.isRegional === (region === 'regional') && s.stopCount >= LEAGUE_TABLE_MIN_STOPS)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    let displayRows: TableRow[] = [];

    if (listType === 'worst') {
        displayRows = targetSuburbs.slice(-20).reverse().map((s, i) => ({
            name: s.name,
            slug: s.slug,
            score: s.score,
            band: s.band,
            stopCount: s.stopCount,
            rank: targetSuburbs.length - i,
        }));
    } else if (listType === 'best') {
        displayRows = targetSuburbs.slice(0, 20).map((s, i) => ({
            name: s.name,
            slug: s.slug,
            score: s.score,
            band: s.band,
            stopCount: s.stopCount,
            rank: i + 1,
        }));
    } else if (listType === 'rankings') {
        const idx = targetSuburbs.findIndex(s => s.slug === focusSlug);
        if (idx !== -1) {
            const start = Math.max(0, Math.min(idx - 10, targetSuburbs.length - 20));
            const end = Math.min(targetSuburbs.length, start + 20);
            displayRows = targetSuburbs.slice(start, end).map((s, i) => ({
                name: s.name,
                slug: s.slug,
                score: s.score,
                band: s.band,
                stopCount: s.stopCount,
                rank: start + i + 1,
                highlighted: s.slug === focusSlug,
            }));
        }
    }

    const selectFocusSuburb = (slug: string) => {
        setSearchParams({ focus: slug });
    };

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-10">
            <header className="space-y-4">
                <p className="type-overline text-magenta">The league table</p>
                <h1 className="type-display text-4xl md:text-6xl">{title}</h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    Ranked by score, highest first. Suburbs need at least 3 scored stops to qualify,
                    so a single lonely flag stop cannot skew the list. Every row links to the full
                    breakdown and every number reproduces from the{' '}
                    <Link to="/methodology" className="text-blue">methodology page</Link>.
                </p>
            </header>

            {/* Region Tabs */}
            <div className="flex gap-4 border-b border-border-subtle pb-2">
                <button
                    onClick={() => {
                        setRegion('metro');
                        if (listType === 'rankings' && focusSlug) {
                            const sub = index.suburbs.find(s => s.slug === focusSlug);
                            if (sub?.isRegional) {
                                // reset rankings if region changed
                                setSearchParams({});
                                setListType('worst');
                                setFocusSlug('');
                            }
                        }
                    }}
                    className={`font-semibold pb-2 px-1 border-b-2 transition-all ${
                        region === 'metro'
                            ? 'border-magenta text-magenta'
                            : 'border-transparent text-ink-soft hover:text-ink'
                    }`}
                >
                    Metropolitan Melbourne
                </button>
                <button
                    onClick={() => {
                        setRegion('regional');
                        if (listType === 'rankings' && focusSlug) {
                            const sub = index.suburbs.find(s => s.slug === focusSlug);
                            if (!sub?.isRegional) {
                                // reset rankings if region changed
                                setSearchParams({});
                                setListType('worst');
                                setFocusSlug('');
                            }
                        }
                    }}
                    className={`font-semibold pb-2 px-1 border-b-2 transition-all ${
                        region === 'regional'
                            ? 'border-magenta text-magenta'
                            : 'border-transparent text-ink-soft hover:text-ink'
                    }`}
                >
                    Regional Victoria
                </button>
            </div>

            {/* List Type Tabs */}
            <div className="flex flex-wrap gap-2 text-sm">
                <button
                    onClick={() => {
                        setListType('worst');
                        setSearchParams({});
                        setFocusSlug('');
                    }}
                    className={`px-4 py-2 rounded-[4px] border transition-all ${
                        listType === 'worst'
                            ? 'bg-magenta border-magenta text-white font-semibold'
                            : 'bg-surface-raised border-border-strong text-ink-soft hover:text-ink'
                    }`}
                >
                    Worst 20
                </button>
                <button
                    onClick={() => {
                        setListType('best');
                        setSearchParams({});
                        setFocusSlug('');
                    }}
                    className={`px-4 py-2 rounded-[4px] border transition-all ${
                        listType === 'best'
                            ? 'bg-magenta border-magenta text-white font-semibold'
                            : 'bg-surface-raised border-border-strong text-ink-soft hover:text-ink'
                    }`}
                >
                    Best 20
                </button>
                <button
                    onClick={() => {
                        setListType('rankings');
                    }}
                    className={`px-4 py-2 rounded-[4px] border transition-all ${
                        listType === 'rankings'
                            ? 'bg-magenta border-magenta text-white font-semibold'
                            : 'bg-surface-raised border-border-strong text-ink-soft hover:text-ink'
                    }`}
                >
                    Find Suburb Rank
                </button>
            </div>

            {/* Search Box / Rankings focus */}
            {listType === 'rankings' && (
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 space-y-4">
                    <h2 className="type-display text-xl">Find Your Suburb's Ranking</h2>
                    <p className="text-sm text-ink-soft">
                        Enter your suburb below to see exactly where it ranks and compare it to the 19 suburbs ranked closest to it.
                    </p>
                    <SuburbSearchBox onSelect={selectFocusSuburb} />
                </div>
            )}

            {/* The Table */}
            {listType === 'rankings' && !focusSlug ? (
                <div className="text-center py-12 text-ink-soft border border-dashed border-border-subtle rounded-[4px]">
                    Use the search box above to select a suburb and display its rankings.
                </div>
            ) : (
                <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 md:p-6 overflow-x-auto">
                    <LeagueTable rows={displayRows} />
                </div>
            )}

            <section className="border border-border-subtle rounded-[4px] p-5 md:p-6 space-y-3">
                <h2 className="type-display text-2xl">Embed this table</h2>
                <p className="text-sm text-ink-soft">
                    Paste this into any article or newsletter. The table stays live and every row
                    keeps its authorisation line.
                </p>
                <pre className="bg-purple-900 border border-border-subtle rounded-[4px] p-3 text-xs overflow-x-auto text-ink-soft"><code>{embedSnippet}</code></pre>
                <button onClick={copyEmbed} className="pressable flex items-center gap-1.5 px-3 py-2 bg-surface-raised border border-border-strong text-sm font-semibold rounded-[4px]">
                    {copied ? <Check className="h-4 w-4 text-teal" /> : <Code className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy embed code'}
                </button>
            </section>
        </div>
    );
};

export default LeagueTablePage;
