import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Stop, Route } from '../types';
import { band, BAND_COLORS, BAND_LABELS, type Band } from '../lib/scoring';

interface StopPopupProps {
    stop: Stop;
    routes: Record<string, Route>;
}

const formatModeName = (name: string) => {
    if (!name) return '';
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

const BAND_TEXT_CLASS: Record<Band, string> = {
    stranded: 'text-band-stranded',
    poor: 'text-band-poor',
    patchy: 'text-band-patchy',
    decent: 'text-band-decent',
    good: 'text-band-good',
};

// Editorial asides, not jokes: matches "insurgent data journalism, rigor not volume".
const SCORE_CAPTION: Record<Band, string> = {
    good: 'This is what full funding looks like.',
    decent: 'Close, but funding still drops off at the edges.',
    patchy: 'This runs on luck, not on a timetable.',
    poor: 'A council could fix this for less than a freeway on-ramp.',
    stranded: 'A choice, not an accident.',
};

const useCountUp = (target: number, durationMs = 700) => {
    const [value, setValue] = useState(target);
    useEffect(() => {
        if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setValue(target);
            return;
        }
        let raf: number;
        const start = performance.now();
        const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
        setValue(0);
        const tick = (now: number) => {
            const p = Math.min(1, (now - start) / durationMs);
            setValue(target * easeOutQuart(p));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, durationMs]);
    return value;
};

const MetricRow = ({ label, value, nested }: { label: string; value: string; nested?: boolean }) => (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${nested ? 'pl-3 border-l border-border-subtle' : ''}`}>
        <span className="type-overline text-ink-soft text-[10px]">{label}</span>
        <span className="type-data text-xs text-ink">{value}</span>
    </div>
);

const NearbyModeList = ({ icon, label, stops }: {
    icon: string;
    label: string;
    stops: { name: string; score: number; distance: number; route_summary?: string }[];
}) => (
    <div className="text-[10px] mb-2">
        <div className="type-overline text-ink-soft mb-1">{icon} {label}</div>
        {stops.map((s, i) => (
            <div key={i} className="flex justify-between gap-2 py-0.5 border-l border-border-subtle pl-2">
                <span className="text-ink-soft truncate max-w-[160px]">{s.name}</span>
                <span className="type-data text-band-good shrink-0">{s.score.toFixed(0)}</span>
            </div>
        ))}
    </div>
);

export const StopPopup: React.FC<StopPopupProps> = ({ stop: initialStop, routes }) => {
    // If stop has sub_stops (cluster), allow switching. Default to initial (Best) stop.
    const [activeIndex, setActiveIndex] = useState(0);
    const [nearbyExpanded, setNearbyExpanded] = useState(false);
    const [v1DetailOpen, setV1DetailOpen] = useState(false);

    const stopsList = initialStop.sub_stops && initialStop.sub_stops.length > 0
        ? initialStop.sub_stops
        : [initialStop];

    const sortedStops = [...stopsList].sort((a, b) => b.final_score - a.final_score);
    const activeStop = sortedStops[activeIndex];

    const scoreBand = band(activeStop.final_score);
    const scoreColor = BAND_COLORS[scoreBand];
    const scoreLabel = BAND_LABELS[scoreBand];
    const animatedScore = useCountUp(activeStop.final_score);

    const hasNearby = !!(initialStop.nearby_stops && initialStop.nearby_stops.length > 0);
    const hasIntermodal = activeStop.intermodal_bonus !== undefined && activeStop.intermodal_bonus > 0;
    const hasPenalty = activeStop.freq_penalty_multiplier < 1.0 || activeStop.catch_penalty_multiplier < 1.0;
    const nearbyStops = initialStop.nearby_stops ?? [];
    const nearbyShown = nearbyExpanded ? nearbyStops : nearbyStops.slice(0, 3);

    const ModeTabs = sortedStops.length > 1 && (
        <div className="flex gap-1 mb-3">
            {sortedStops.map((s, idx) => (
                <button
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={`flex-1 py-1 px-2 rounded-[4px] text-[10px] font-medium transition-all border ${activeIndex === idx ? 'bg-surface-raised border-border-strong text-ink' : 'border-transparent text-ink-faint hover:text-ink-soft'
                        }`}
                >
                    {formatModeName(s.mode_name).replace(' Train', '')} ({s.final_score.toFixed(0)})
                </button>
            ))}
        </div>
    );

    const PenaltyBanner = hasPenalty && (
        <div className="mb-3 text-[10px]">
            <div className="font-semibold text-band-poor">Penalties applied</div>
            {activeStop.freq_penalty_multiplier < 1.0 && (
                <div className="text-ink-soft">Frequency reduced {((1 - activeStop.freq_penalty_multiplier) * 100).toFixed(0)}%</div>
            )}
            {activeStop.catch_penalty_multiplier < 1.0 && (
                <div className="text-ink-soft">Catchment reduced {((1 - activeStop.catch_penalty_multiplier) * 100).toFixed(0)}%</div>
            )}
        </div>
    );

    const BreakdownBody = (
        <>
            <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                    <div className="type-overline text-ink-faint mb-1">Frequency</div>
                    <div className="type-data text-xl text-ink mb-1">{activeStop.frequency_score.toFixed(0)}</div>
                    <MetricRow label="Headway" value={activeStop.headway_score.toFixed(0)} />
                    <MetricRow label="Span" value={activeStop.service_span_score.toFixed(0)} />
                    <MetricRow label="Reliability" value={activeStop.reliability_score.toFixed(0)} />
                </div>
                <div>
                    <div className="type-overline text-ink-faint mb-1">Coverage</div>
                    <div className="type-data text-xl text-ink mb-1">{activeStop.coverage_score.toFixed(0)}</div>
                    <MetricRow label="Network" value={(activeStop.network_coverage_score ?? 0).toFixed(0)} />
                    <MetricRow label="Hubs" value={`${activeStop.connectivity_tier || '-'} ${(activeStop.hub_reachability_score || 0).toFixed(0)}`} nested />
                    <MetricRow label="Orbital" value={`${(activeStop.orbital_directness_score || 0).toFixed(0)}${(activeStop.orbital_directness_score || 0) < 50 ? ' ⚠' : ''}`} nested />
                    <MetricRow label="Local" value={activeStop.local_coverage_score.toFixed(0)} />
                </div>
            </div>

            <div className="type-data text-xs text-ink-soft mb-3">Avg wait {activeStop.average_wait_time.toFixed(1)}m</div>

            {hasIntermodal ? (
                <div className="mb-3">
                    <div className="flex justify-between items-baseline mb-2">
                        <div className="type-overline text-band-good">Inter-modality bonus</div>
                        <div className="type-data text-band-good">+{activeStop.intermodal_bonus!.toFixed(1)}</div>
                    </div>
                    {activeStop.train_stops_nearby && activeStop.train_stops_nearby.length > 0 && (
                        <NearbyModeList icon="🚆" label="Train" stops={activeStop.train_stops_nearby} />
                    )}
                    {activeStop.tram_stops_nearby && activeStop.tram_stops_nearby.length > 0 && (
                        <NearbyModeList icon="🚋" label="Tram" stops={activeStop.tram_stops_nearby} />
                    )}
                    {activeStop.bus_stops_nearby && activeStop.bus_stops_nearby.length > 0 && (
                        <NearbyModeList icon="🚌" label="Bus" stops={activeStop.bus_stops_nearby} />
                    )}
                    <Link to="/methodology" className="text-blue hover:brightness-125 text-[10px] underline">How this is calculated</Link>
                </div>
            ) : (
                activeStop.frequency_score > 0 && (
                    <div className="mb-3 text-[10px] text-ink-faint">Single-mode station. No inter-modality bonus.</div>
                )
            )}

            {activeStop.mode_id === 2 && activeStop.patronage_annual && (
                <div className="mb-3 type-data text-xs text-ink-soft">
                    ~{Math.round(activeStop.patronage_annual / 365).toLocaleString()} passengers/day
                </div>
            )}

            {hasNearby && (
                <div className="pt-1">
                    <div className="type-overline text-ink-faint mb-2">Nearby (&lt;400m)</div>
                    {nearbyShown.map((nearby) => (
                        <div key={nearby.id} className="flex justify-between text-xs py-0.5">
                            <span className="text-ink-soft truncate max-w-[180px]">{nearby.name}</span>
                            <span className="text-ink-faint ml-2 shrink-0">{formatModeName(nearby.mode_name)} ({Math.round(nearby.distance)}m)</span>
                        </div>
                    ))}
                    {nearbyStops.length > 3 && (
                        <button
                            onClick={() => setNearbyExpanded(v => !v)}
                            className="text-blue hover:brightness-125 text-[10px] mt-1"
                        >
                            {nearbyExpanded ? 'Show fewer' : `Show ${nearbyStops.length - 3} more`}
                        </button>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div data-impeccable-variants="25213140" style={{ display: 'contents' }}>
            <style>{`
                @keyframes sp-pulse { 0% { filter: brightness(1); } 35% { filter: brightness(1.5); } 100% { filter: brightness(1); } }
                @keyframes sp-sweep { 0% { box-shadow: 0 0 0 rgba(255,255,255,0); } 40% { box-shadow: 0 0 12px rgba(255,255,255,0.45); } 100% { box-shadow: 0 0 0 rgba(255,255,255,0); } }
                @scope ([data-impeccable-variant="1"]) {
                    :scope .sp-bar-fill { transition: transform 900ms var(--ease-out); }
                    :scope .sp-detail-wrap { display: grid; grid-template-rows: 0fr; overflow: hidden; }
                    :scope[data-p-reveal] .sp-detail-wrap { transition: grid-template-rows 320ms var(--ease-out); }
                    :scope .sp-detail-wrap[data-open="true"] { grid-template-rows: 1fr; }
                    :scope .sp-detail-inner { min-height: 0; }
                    :scope .sp-chip { transition: transform 120ms var(--ease-out), filter 120ms var(--ease-out); }
                    :scope[data-p-chippress] .sp-chip:active { transform: scale(0.94); filter: brightness(1.15); }
                    @media (prefers-reduced-motion: reduce) {
                        :scope .sp-bar-fill, :scope .sp-detail-wrap { transition: none !important; }
                    }
                }
                @scope ([data-impeccable-variant="2"]) {
                    :scope[data-p-labelpulse] .sp-band-label { animation: sp-pulse 900ms var(--ease-out); }
                    :scope[data-p-barglow] .sp-bar-fill { animation: sp-sweep 900ms var(--ease-out); }
                    @media (prefers-reduced-motion: reduce) {
                        :scope .sp-band-label, :scope .sp-bar-fill { animation: none !important; }
                    }
                }
                @scope ([data-impeccable-variant="3"]) {
                    :scope .sp-caption { opacity: 0; transform: translateY(-4px); transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out); }
                    :scope[data-p-captions] .sp-caption-trigger:hover .sp-caption,
                    :scope[data-p-captions] .sp-caption-trigger:focus-within .sp-caption { opacity: 1; transform: translateY(0); }
                    :scope[data-p-always] .sp-caption { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Variant 1: satisfying interaction. Score bar fills in on open, breakdown expands with real motion, chips press. */}
            <div data-impeccable-variant="1" data-impeccable-params='[{"id":"reveal","kind":"toggle","default":true,"label":"Animate breakdown"},{"id":"chippress","kind":"toggle","default":true,"label":"Route chip press"}]' className="min-w-[280px]">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="font-bold text-base leading-tight mb-1 text-ink">{initialStop.name}</div>
                        <div className="type-overline text-ink-faint">{formatModeName(activeStop.mode_name)}</div>
                    </div>
                </div>
                {ModeTabs}
                <div className="mb-4 p-3 rounded-[4px]" style={{ backgroundColor: `${scoreColor}59` }}>
                    <div className="type-overline text-ink-soft mb-1">Station Score</div>
                    <div className="flex items-baseline gap-2">
                        <span className="type-data text-2xl" style={{ color: scoreColor }}>{activeStop.final_score.toFixed(0)}</span>
                        <span className="text-ink-faint">/100</span>
                        <span className={`ml-auto text-xs font-semibold ${BAND_TEXT_CLASS[scoreBand]}`}>{scoreLabel}</span>
                    </div>
                    <div className="mt-2 h-1 bg-border-subtle rounded-full overflow-hidden">
                        <div className="sp-bar-fill h-full w-full rounded-full origin-left" style={{ transform: `scaleX(${activeStop.final_score / 100})`, backgroundColor: scoreColor }} />
                    </div>
                </div>
                {PenaltyBanner}
                <div className="mb-3">
                    <div className="type-overline text-ink-faint mb-2">Routes</div>
                    <div className="flex flex-wrap gap-1">
                        {activeStop.route_ids.map((rid: string) => {
                            const route = routes[rid];
                            if (!route) return null;
                            return (
                                <span key={rid} className="sp-chip px-2 py-1 rounded-[4px] text-xs text-white font-medium" style={{ backgroundColor: route.color }} title={route.long_name}>
                                    {route.short_name || route.long_name}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <button
                    onClick={() => setV1DetailOpen(v => !v)}
                    aria-expanded={v1DetailOpen}
                    className="type-overline text-blue hover:brightness-125 cursor-pointer mb-2 select-none"
                >
                    {v1DetailOpen ? 'Hide score breakdown' : 'Show score breakdown'}
                </button>
                <div className="sp-detail-wrap" data-open={v1DetailOpen}>
                    <div className="sp-detail-inner">{BreakdownBody}</div>
                </div>
            </div>

            {/* Variant 2: typographic surprise. The score tallies up on open; the band label and bar can pulse to mark the read. */}
            <div data-impeccable-variant="2" data-impeccable-params='[{"id":"labelpulse","kind":"toggle","default":true,"label":"Band label pulse"},{"id":"barglow","kind":"toggle","default":false,"label":"Bar glow sweep"}]' className="min-w-[280px]" style={{ display: 'none' }}>
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="font-bold text-base leading-tight mb-1 text-ink">{initialStop.name}</div>
                        <div className="type-overline text-ink-faint">{formatModeName(activeStop.mode_name)}</div>
                    </div>
                </div>
                {ModeTabs}
                <div className="mb-4 p-3 rounded-[4px]" style={{ backgroundColor: `${scoreColor}59` }}>
                    <div className="type-overline text-ink-soft mb-1">Station Score</div>
                    <div className="flex items-baseline gap-2">
                        <span className="type-data text-2xl" style={{ color: scoreColor }}>{Math.round(animatedScore)}</span>
                        <span className="text-ink-faint">/100</span>
                        <span className={`sp-band-label ml-auto text-xs font-semibold ${BAND_TEXT_CLASS[scoreBand]}`}>{scoreLabel}</span>
                    </div>
                    <div className="mt-2 h-1 bg-border-subtle rounded-full overflow-hidden">
                        <div className="sp-bar-fill h-full w-full rounded-full origin-left" style={{ transform: `scaleX(${activeStop.final_score / 100})`, backgroundColor: scoreColor }} />
                    </div>
                </div>
                {PenaltyBanner}
                <div className="mb-3">
                    <div className="type-overline text-ink-faint mb-2">Routes</div>
                    <div className="flex flex-wrap gap-1">
                        {activeStop.route_ids.map((rid: string) => {
                            const route = routes[rid];
                            if (!route) return null;
                            return (
                                <span key={rid} className="px-2 py-1 rounded-[4px] text-xs text-white font-medium" style={{ backgroundColor: route.color }} title={route.long_name}>
                                    {route.short_name || route.long_name}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <details className="group">
                    <summary className="type-overline text-blue hover:brightness-125 cursor-pointer list-none [&::-webkit-details-marker]:hidden mb-2 select-none">
                        <span className="group-open:hidden">Show score breakdown</span>
                        <span className="hidden group-open:inline">Hide score breakdown</span>
                    </summary>
                    {BreakdownBody}
                </details>
            </div>

            {/* Variant 3: hidden editorial captions. Hovering (or focusing) the score reveals the one-line stakes behind the number. */}
            <div data-impeccable-variant="3" data-impeccable-params='[{"id":"captions","kind":"toggle","default":true,"label":"Reveal captions"},{"id":"always","kind":"toggle","default":false,"label":"Always show captions"}]' className="min-w-[280px]" style={{ display: 'none' }}>
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="font-bold text-base leading-tight mb-1 text-ink">{initialStop.name}</div>
                        <div className="type-overline text-ink-faint">{formatModeName(activeStop.mode_name)}</div>
                    </div>
                </div>
                {ModeTabs}
                <div className="sp-caption-trigger mb-4 p-3 rounded-[4px]" style={{ backgroundColor: `${scoreColor}59` }} tabIndex={0}>
                    <div className="type-overline text-ink-soft mb-1">Station Score</div>
                    <div className="flex items-baseline gap-2">
                        <span className="type-data text-2xl" style={{ color: scoreColor }}>{activeStop.final_score.toFixed(0)}</span>
                        <span className="text-ink-faint">/100</span>
                        <span className={`ml-auto text-xs font-semibold ${BAND_TEXT_CLASS[scoreBand]}`}>{scoreLabel}</span>
                    </div>
                    <div className="mt-2 h-1 bg-border-subtle rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${activeStop.final_score}%`, backgroundColor: scoreColor }} />
                    </div>
                    <div className="sp-caption text-[10px] italic text-ink-soft mt-2">{SCORE_CAPTION[scoreBand]}</div>
                </div>
                {PenaltyBanner}
                <div className="mb-3">
                    <div className="type-overline text-ink-faint mb-2">Routes</div>
                    <div className="flex flex-wrap gap-1">
                        {activeStop.route_ids.map((rid: string) => {
                            const route = routes[rid];
                            if (!route) return null;
                            return (
                                <span key={rid} className="px-2 py-1 rounded-[4px] text-xs text-white font-medium" style={{ backgroundColor: route.color }} title={route.long_name}>
                                    {route.short_name || route.long_name}
                                </span>
                            );
                        })}
                    </div>
                </div>
                <details className="group">
                    <summary className="type-overline text-blue hover:brightness-125 cursor-pointer list-none [&::-webkit-details-marker]:hidden mb-2 select-none">
                        <span className="group-open:hidden">Show score breakdown</span>
                        <span className="hidden group-open:inline">Hide score breakdown</span>
                    </summary>
                    {hasIntermodal && (
                        <div className="sp-caption-trigger mb-1" tabIndex={0}>
                            <div className="type-overline text-band-good">Inter-modality bonus</div>
                            <div className="sp-caption text-[10px] italic text-ink-soft">Redundancy like this is what a real network looks like.</div>
                        </div>
                    )}
                    {BreakdownBody}
                </details>
            </div>
        </div>
    );
};
