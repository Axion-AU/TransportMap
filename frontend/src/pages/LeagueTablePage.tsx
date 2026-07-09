import { useState } from 'react';
import { Link } from 'react-router-dom';
import suburbIndex from '../data/generated/suburb-index.json';
import type { SuburbIndex } from '../types/data';
import { BAND_COLORS } from '../lib/scoring';
import { site } from '../config/site';
import { usePageMeta } from '../lib/meta';
import { track } from '../lib/analytics';
import { Check, Code } from 'lucide-react';

const index = suburbIndex as SuburbIndex;

export const WorstTable = ({ compact = false, linkTarget }: { compact?: boolean; linkTarget?: string }) => {
    const rows = index.worst20
        .map(slug => index.suburbs.find(s => s.slug === slug))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));

    return (
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="type-overline text-ink-faint border-b border-border-strong">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Suburb</th>
                    <th className="py-2 pr-2 text-right">Score</th>
                    {!compact && <th className="py-2 text-right">Stops scored</th>}
                </tr>
            </thead>
            <tbody>
                {rows.map((s, i) => (
                    <tr key={s.slug} className="border-b border-border-subtle">
                        <td className="py-2.5 pr-2 type-data text-ink-faint">{i + 1}</td>
                        <td className="py-2.5 pr-2">
                            <Link to={`/score/${s.slug}`} target={linkTarget} className="text-ink font-semibold hover:text-blue">
                                {s.name}
                            </Link>
                        </td>
                        <td className="py-2.5 pr-2 text-right type-data" style={{ color: BAND_COLORS[s.band] }}>
                            {s.score}/100
                        </td>
                        {!compact && <td className="py-2.5 text-right type-data text-ink-faint">{s.stopCount}</td>}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const LeagueTablePage = () => {
    usePageMeta(
        'The 20 worst served suburbs in Melbourne | Transport Score',
        'Melbourne suburbs ranked by public transport score, computed from the PTV timetable data.',
    );
    const [copied, setCopied] = useState(false);

    const embedSnippet = `<iframe src="${site.origin}/embed/suburbs" width="100%" height="720" style="border:0" title="The 20 worst served suburbs in Melbourne, ranked by Transport Score"></iframe>`;

    const copyEmbed = async () => {
        await navigator.clipboard.writeText(embedSnippet);
        setCopied(true);
        track('share_clicked', { suburb: 'league-table', channel: 'embed' });
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-10">
            <header className="space-y-4">
                <p className="type-overline text-magenta">The league table</p>
                <h1 className="type-display text-5xl md:text-6xl">The 20 worst served suburbs in Melbourne</h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    Ranked by score, lowest first. Suburbs need at least 3 scored stops to qualify,
                    so a single lonely flag stop cannot skew the list. Every row links to the full
                    breakdown and every number reproduces from the{' '}
                    <Link to="/methodology" className="text-blue">methodology page</Link>.
                </p>
            </header>

            <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-5 md:p-6 overflow-x-auto">
                <WorstTable />
            </div>

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
