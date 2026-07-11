import { useState } from 'react';
import type { SuburbDetail } from '../types/data';

/**
 * Stage 2 methodology-refactor measure (docs/methodology_refactor.md items
 * 2 & 7): a gravity-weighted composite pt_time/car_time ratio across every
 * destination suburb within the current travel-time matrix's coverage
 * (weighted by jobs + dwellings, distance-decayed -- see
 * scripts/compute-car-competitiveness.mjs), plus jobs reachable within a
 * 45-minute PT trip.
 *
 * The free-flow/peak-congested toggle is built now but congested car_time
 * is not computed yet -- it needs a working DTP traffic API subscription
 * key (Bluetooth Travel Time / Freeway Travel Time), which this session did
 * not have. Selecting "Peak" shows an honest "not available yet" state
 * rather than a fabricated number.
 */
export const CarCompetitivenessSection = ({ detail }: { detail: SuburbDetail }) => {
    const [mode, setMode] = useState<'freeFlow' | 'congested'>('freeFlow');
    const cc = detail.carCompetitiveness;

    if (!cc) {
        return (
            <section className="space-y-3">
                <h2 className="type-display text-2xl text-ink">Car vs. public transport</h2>
                <p className="text-sm text-ink-soft">
                    Not available for {detail.name} yet -- this measure is rolling out suburb by suburb as the underlying
                    travel-time matrix expands. See the <a href="/methodology#car-competitiveness" className="text-blue">methodology page</a> for coverage.
                </p>
            </section>
        );
    }

    const ratio = mode === 'freeFlow' ? cc.ratioFreeFlow : cc.ratioCongested;
    const verdict = ratio === null
        ? null
        : ratio < 1.5
            ? 'car-competitive'
            : ratio < 2
                ? 'tolerable, but driving is faster'
                : ratio < 3
                    ? 'a real disadvantage'
                    : 'effectively not served for these trips';

    return (
        <section id="car-competitiveness" className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="type-display text-2xl text-ink">Car vs. public transport</h2>
                <div className="inline-flex rounded-[4px] border border-border-subtle overflow-hidden text-sm">
                    <button
                        type="button"
                        onClick={() => setMode('freeFlow')}
                        className={`px-3 py-1.5 ${mode === 'freeFlow' ? 'bg-ink text-purple-900' : 'text-ink-soft'}`}
                    >
                        Free-flow driving
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('congested')}
                        className={`px-3 py-1.5 ${mode === 'congested' ? 'bg-ink text-surface' : 'text-ink-soft'}`}
                    >
                        Peak-hour driving
                    </button>
                </div>
            </div>

            <p className="text-sm text-ink-soft">
                Averaged across every destination suburb we've computed travel times to, weighted by jobs and dwellings
                there (closer, bigger destinations count more) -- not just one cherry-picked trip.
            </p>

            {ratio === null ? (
                <div className="border border-border-subtle rounded-[4px] p-5 text-sm text-ink-soft bg-surface-raised">
                    Peak-hour driving times aren't computed yet -- this needs a working DTP traffic-data subscription we
                    don't have wired up yet. Free-flow (best-case-for-driving) numbers are shown instead when you switch
                    back.
                </div>
            ) : (
                <div className="border border-border-subtle rounded-[4px] p-5 md:p-6 bg-surface-raised space-y-2">
                    <div className="type-data text-3xl text-ink">
                        {ratio.toFixed(1)}<span className="text-lg text-ink-faint">x</span>
                    </div>
                    <p className="text-sm text-ink-soft">
                        Public transport takes on average <strong className="text-ink">{ratio.toFixed(1)} times as long</strong> as
                        driving ({mode === 'freeFlow' ? 'best-case, no traffic' : 'typical peak-hour'}) for {detail.name}'s
                        weighted set of destinations -- {verdict}.
                    </p>
                </div>
            )}

            {cc.exampleDestination && (
                <p className="text-xs text-ink-faint">
                    Example: {detail.name} to {cc.exampleDestination.name} -- {Math.round(cc.exampleDestination.carFreeFlowMinutes)} min by
                    car, {Math.round(cc.exampleDestination.ptMinutes)} min by public transport.
                </p>
            )}

            {detail.accessibility && (
                <p className="text-sm text-ink-soft">
                    Within a 45-minute public transport trip from {detail.name}, roughly{' '}
                    <strong className="text-ink">{detail.accessibility.jobsWithin45MinPt.toLocaleString()} jobs</strong> are reachable
                    (2021 Census place-of-work counts, SA2 geography).
                </p>
            )}
        </section>
    );
};
