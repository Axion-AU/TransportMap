import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LookupInput from '../components/LookupInput';
import TransitMeshVisual from '../components/TransitMeshVisual';
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

    const section1Ref = useRef<HTMLDivElement>(null);
    const section2Ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        if (section1Ref.current) observer.observe(section1Ref.current);
        if (section2Ref.current) observer.observe(section2Ref.current);

        return () => observer.disconnect();
    }, []);

    return (
        <div className="max-w-4xl mx-auto px-5 py-14 md:py-24 space-y-16">
            <div className="grid gap-8 md:grid-cols-12 items-center">
                <header className="space-y-6 md:col-span-7 relative z-20">
                    <p className="type-overline text-magenta animate-fade-in-up stagger-1">
                        Every Melbourne suburb, scored from timetable data
                    </p>
                    <h1 className="type-display text-5xl md:text-7xl max-w-3xl animate-fade-in-up stagger-2">
                        How good is public transport at your address?
                    </h1>
                    <p className="text-xl text-ink-soft max-w-2xl leading-relaxed animate-fade-in-up stagger-3">
                        We scored every stop in Melbourne from 0 to 100 on frequency,
                        coverage, and reliability, direct from the published PTV timetable. Enter your suburb.
                        The score explains your weekly commute.
                    </p>
                    <div className="animate-scale-up stagger-4 relative z-30" style={{ viewTransitionName: 'search-box' } as React.CSSProperties}>
                        <LookupInput autoFocus />
                    </div>
                </header>
                <div className="md:col-span-5 animate-fade-in-up stagger-5 relative z-10">
                    <TransitMeshVisual />
                </div>
            </div>

            <section 
                ref={section1Ref}
                className="grid gap-4 sm:grid-cols-3 scroll-reveal io-reveal"
            >
                {worst.map((s, i) => (
                    <Link
                         key={s.slug}
                         to={`/score/${s.slug}`}
                         style={{ viewTransitionName: `card-${s.slug}` } as React.CSSProperties}
                         className="pressable bg-surface-raised border border-border-subtle rounded-[4px] p-5 block"
                    >
                        <div className="type-overline text-ink-faint mb-2">#{i + 1} worst served</div>
                        <div className="type-display text-2xl mb-1">{s.name}</div>
                        <div className="type-data text-3xl text-band-stranded">{s.score}/100</div>
                    </Link>
                ))}
            </section>

            <section 
                ref={section2Ref}
                className="border border-border-subtle rounded-[4px] p-6 md:p-8 space-y-3 scroll-reveal io-reveal"
            >
                <h2 className="type-display text-3xl">The numbers behind the anger</h2>
                <p className="text-ink-soft max-w-2xl leading-relaxed">
                    Running a car costs an average of {anchors.avgAnnualCarCost.display} a year.
                    In the worst-served suburbs, the timetable makes that cost compulsory.
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
