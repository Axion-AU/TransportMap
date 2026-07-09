import { Link } from 'react-router-dom';
import LookupInput from '../components/LookupInput';
import suburbIndex from '../data/generated/suburb-index.json';
import anchorsConfig from '../config/anchors.json';
import type { SuburbIndex } from '../types/data';
import { usePageMeta } from '../lib/meta';

const index = suburbIndex as SuburbIndex;

const LandingPage = () => {
    usePageMeta('Transport Score | How good is public transport at your address?');

    const worst = index.worst20
        .map(slug => index.suburbs.find(s => s.slug === slug))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .slice(0, 3);
    const anchors = anchorsConfig.anchors;

    return (
        <div className="max-w-4xl mx-auto px-5 py-14 md:py-24 space-y-16">
            <header className="space-y-6">
                <p className="type-overline text-magenta">Every Melbourne suburb, scored from the timetable data</p>
                <h1 className="type-display text-5xl md:text-7xl max-w-3xl">
                    How good is public transport at your address?
                </h1>
                <p className="text-xl text-ink-soft max-w-2xl leading-relaxed">
                    We scored every public transport stop in Melbourne from 0 to 100 on frequency,
                    coverage, and reliability, straight from the PTV timetable. Type your suburb.
                    The number will explain a lot about your week.
                </p>
                <LookupInput autoFocus />
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
                {worst.map((s, i) => (
                    <Link
                        key={s.slug}
                        to={`/score/${s.slug}`}
                        className="pressable bg-surface-raised border border-border-subtle rounded-[4px] p-5 block"
                    >
                        <div className="type-overline text-ink-faint mb-2">#{i + 1} worst served</div>
                        <div className="type-display text-2xl mb-1">{s.name}</div>
                        <div className="type-data text-3xl text-band-stranded">{s.score}/100</div>
                    </Link>
                ))}
            </section>

            <section className="border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-3">
                <h2 className="type-display text-3xl">The numbers behind the anger</h2>
                <p className="text-ink-soft max-w-2xl leading-relaxed">
                    Running a car costs an average of {anchors.avgAnnualCarCost.display} a year.
                    In the worst served suburbs the timetable makes that spend compulsory.
                    Every score on this site traces back to published data on the{' '}
                    <Link to="/methodology" className="text-blue">methodology page</Link>.
                </p>
                <Link to="/suburbs" className="inline-block text-blue font-semibold">
                    See the 20 worst served suburbs
                </Link>
            </section>
        </div>
    );
};

export default LandingPage;
