import { Link } from 'react-router-dom';
import { BAND_COLORS, BAND_LABELS, type Band } from '../lib/scoring';

interface ScoreCardProps {
    title: string;
    score: number;
    band: Band;
    breakdown: { frequency: number; coverage: number; reliability: number };
    verdict: string;
    subtitle?: string;
}

const BreakdownBar = ({ label, value }: { label: string; value: number }) => (
    <div>
        <div className="flex justify-between items-baseline mb-1">
            <span className="type-overline text-ink-soft">{label}</span>
            <span className="type-data text-sm text-ink">{value}/100</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-[2px] overflow-hidden">
            <div className="h-full bg-cyan" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
        </div>
    </div>
);

const ScoreCard = ({ title, score, band, breakdown, verdict, subtitle }: ScoreCardProps) => {
    const color = BAND_COLORS[band];
    return (
        <section className="bg-surface-raised border border-border-subtle rounded-[4px] p-6 md:p-8" style={{ borderTop: `2px solid ${color}` }}>
            <div className="type-overline text-ink-faint mb-1">Public transport score</div>
            <h1 className="type-display text-4xl md:text-5xl mb-6">{title}</h1>
            {subtitle && <p className="text-ink-soft -mt-4 mb-6 text-sm">{subtitle}</p>}

            <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mb-6">
                <div className="flex items-baseline gap-2">
                    <span className="type-data text-7xl md:text-8xl leading-none" style={{ color }}>{score}</span>
                    <span className="type-data text-2xl text-ink-faint">/100</span>
                </div>
                <span className="type-display text-2xl px-3 py-1 rounded-[4px]" style={{ color, border: `1px solid ${color}` }}>
                    {BAND_LABELS[band]}
                </span>
            </div>

            <p className="text-lg md:text-xl leading-relaxed mb-8 max-w-2xl">{verdict}</p>

            <div className="grid gap-4 sm:grid-cols-3 mb-6">
                <BreakdownBar label="Frequency" value={breakdown.frequency} />
                <BreakdownBar label="Coverage" value={breakdown.coverage} />
                <BreakdownBar label="Reliability" value={breakdown.reliability} />
            </div>

            <Link to="/methodology" className="text-sm text-blue hover:brightness-125">
                How we calculated this, down to the last decimal
            </Link>
        </section>
    );
};

export default ScoreCard;
