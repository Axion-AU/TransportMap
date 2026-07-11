import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import type { SuburbIndex } from '../types/data';
import { usePageMeta } from '../lib/meta';
import suburbIndex from '../data/generated/suburb-index.json';

const index = suburbIndex as SuburbIndex;

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

const CompareIndexPage = () => {
    const navigate = useNavigate();
    const [suburbA, setSuburbA] = useState('');
    const [suburbB, setSuburbB] = useState('');

    usePageMeta(
        'Compare Suburbs | Transport Score',
        'Compare public transport scores, wait times, coverage, and timetabled quality side-by-side between Melbourne suburbs.'
    );

    const handleCompare = () => {
        if (suburbA && suburbB && suburbA !== suburbB) {
            navigate(`/compare/${suburbA}-vs-${suburbB}`);
        }
    };

    const popularComparisons = [
        { name: 'Carlton vs Werribee', path: '/compare/carlton-vs-werribee' },
        { name: 'Richmond vs Melton', path: '/compare/richmond-vs-melton' },
        { name: 'Fitzroy vs Point Cook', path: '/compare/fitzroy-vs-point-cook' },
        { name: 'St Kilda vs Clyde', path: '/compare/st-kilda-vs-clyde' },
        { name: 'South Yarra vs Tarneit', path: '/compare/south-yarra-vs-tarneit' },
        { name: 'Brunswick vs Wollert', path: '/compare/brunswick-vs-wollert' },
        { name: 'Coburg vs Craigieburn', path: '/compare/coburg-vs-craigieburn' },
        { name: 'North Melbourne vs Truganina', path: '/compare/north-melbourne-vs-truganina' },
        { name: 'Footscray vs Doncaster East', path: '/compare/footscray-vs-doncaster-east' },
        { name: 'Preston vs Epping North', path: '/compare/preston-vs-epping-north' },
    ];

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-10">
            <header className="space-y-4">
                <span className="type-overline text-magenta">Public Transport comparison</span>
                <h1 className="type-display text-4xl md:text-6xl uppercase leading-none">
                    Compare Suburbs
                </h1>
                <p className="text-lg text-ink-soft max-w-2xl leading-relaxed">
                    Select any two Melbourne suburbs below to compare their public transport connectivity, frequency, coverage, and reliability side-by-side.
                </p>
            </header>

            {/* Selection Panel */}
            <div className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <SuburbSelector label="First Suburb" value={suburbA} onChange={setSuburbA} />
                    <div className="text-ink-faint text-sm font-bold uppercase py-2 sm:pt-6">VS</div>
                    <SuburbSelector label="Second Suburb" value={suburbB} onChange={setSuburbB} />
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        onClick={handleCompare}
                        disabled={!suburbA || !suburbB || suburbA === suburbB}
                        className="pressable w-full sm:w-auto px-8 py-3 bg-magenta text-white font-semibold rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm shadow-md"
                    >
                        Compare Suburbs
                    </button>
                </div>
            </div>

            {/* Popular Comparisons */}
            <section className="space-y-4">
                <h2 className="type-display text-2xl text-ink">Popular Comparisons</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {popularComparisons.map((c) => (
                        <Link
                            key={c.path}
                            to={c.path}
                            className="pressable block p-4 bg-surface-raised border border-border-subtle rounded-[4px] hover:border-magenta transition-all"
                        >
                            <span className="text-sm font-semibold text-ink leading-tight block mb-1">
                                {c.name}
                            </span>
                            <span className="text-xs text-ink-soft">View side-by-side public transport scorecard &rarr;</span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default CompareIndexPage;
