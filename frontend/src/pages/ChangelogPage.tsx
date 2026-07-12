import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../lib/meta';
import { CHANGELOG } from '../data/changelog';

const INITIAL_COUNT = 5;
const PAGE_SIZE = 5;

const ChangelogPage = () => {
    const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

    usePageMeta(
        'Changelog: Every Scoring and Data Change | Transport Score',
        'Every dated change to the scoring formula, data sources, and site, newest first. Every methodology change ships with its measured effect on real suburbs.',
    );

    const visible = CHANGELOG.slice(0, visibleCount);
    const remaining = CHANGELOG.length - visible.length;

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-16 space-y-8 text-ink-soft leading-relaxed">
            <header className="space-y-4">
                <p className="type-overline text-violet">Every change, dated</p>
                <h1 className="type-display text-5xl md:text-6xl text-ink">Changelog</h1>
                <p className="text-lg max-w-2xl">
                    Every change to the scoring formula, data sources, or coverage, in the order it shipped.
                    Each entry states what changed, why, and what it measurably did to real scores -- see{' '}
                    <Link to="/methodology" className="text-blue">the methodology</Link> for the formulas themselves.
                </p>
            </header>

            <ol className="space-y-6">
                {visible.map((entry, i) => (
                    // Dates repeat across entries shipped the same day, so index rather than date is the stable key.
                    <li
                        key={i}
                        className="flex flex-col sm:flex-row gap-2 sm:gap-5 bg-surface-raised border border-border-subtle border-t-2 border-t-violet rounded-[4px] p-5"
                    >
                        <span className="type-data text-ink shrink-0 sm:w-24">{entry.date}</span>
                        <span className="text-sm">{entry.content}</span>
                    </li>
                ))}
            </ol>

            {remaining > 0 && (
                <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    className="type-overline text-violet border border-border-subtle rounded-[4px] px-5 py-3 hover:bg-surface-raised transition-colors"
                >
                    Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
                </button>
            )}
        </div>
    );
};

export default ChangelogPage;
