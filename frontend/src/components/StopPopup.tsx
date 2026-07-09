import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Stop, Route } from '../types';

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

export const StopPopup: React.FC<StopPopupProps> = ({ stop: initialStop, routes }) => {
    // If stop has sub_stops (cluster), allow switching. Default to initial (Best) stop.
    // We need to find the "active" stop data to display.
    const [activeIndex, setActiveIndex] = useState(0);

    // If sub_stops exist, use them. Otherwise just the single stop.
    // Note: initialStop IS one of the stops (the best one), but with unioned routes.
    // If we want detailed breakdown, we should use sub_stops if available.
    // But sub_stops might not include the "unioned" data (like lat/lon isn't important for popup content).
    // Let's treat initialStop as index 0 (Representative) OR use sub_stops list.

    // Actually, `deduplicateStops` sets `sub_stops` to the cluster array.
    // The `initialStop` is a MERGED object (unioned routes).
    // But for SCORING details, we want the specific sub-stop data.

    const stopsList = initialStop.sub_stops && initialStop.sub_stops.length > 0
        ? initialStop.sub_stops
        : [initialStop];

    // Sort stops list so that the "Best" (representative) is first?
    // `deduplicateStops` found bestStop. 
    // Let's ensure the tabs are ordered nicely (e.g. Metro first, then VLine).
    const sortedStops = [...stopsList].sort((a, b) => b.final_score - a.final_score);

    const activeStop = sortedStops[activeIndex];

    return (
        <div className="min-w-[280px]">
            {/* Header / Tabs */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <div className="font-bold text-base leading-tight mb-1">{initialStop.name}</div>
                    <div className="text-xs text-gray-600">{formatModeName(activeStop.mode_name)}</div>
                </div>
            </div>

            {/* Mode Tabs if multiple */}
            {sortedStops.length > 1 && (
                <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg">
                    {sortedStops.map((s, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveIndex(idx)}
                            className={`flex-1 py-1 px-2 rounded text-[10px] font-medium transition-all ${activeIndex === idx
                                ? 'bg-white shadow text-gray-900'
                                : 'text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            {formatModeName(s.mode_name).replace(' Train', '')} ({s.final_score.toFixed(0)})
                        </button>
                    ))}
                </div>
            )}

            {/* Connectivity Score - Prominent */}
            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: activeStop.color + '15' }}>
                <div className="text-xs text-gray-600 mb-1">Station Score</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: activeStop.color }}>
                        {activeStop.final_score.toFixed(0)}
                    </span>
                    <span className="text-gray-500">/100</span>
                    <span className="ml-auto text-xs font-medium" style={{ color: activeStop.color }}>
                        {activeStop.final_score >= 85 ? 'Excellent' :
                            activeStop.final_score >= 70 ? 'Good' :
                                activeStop.final_score >= 50 ? 'Fair' : 'Poor'}
                    </span>
                </div>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{
                            width: `${activeStop.final_score}% `,
                            backgroundColor: activeStop.color
                        }}
                    />
                </div>
            </div>

            {/* Penalty Warning Banner */}
            {(activeStop.freq_penalty_multiplier < 1.0 || activeStop.catch_penalty_multiplier < 1.0) && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-xs font-bold text-red-700 flex items-center gap-1">
                        ⚠️ Penalties Applied
                    </div>
                    <div className="text-[10px] text-red-600 mt-1">
                        {activeStop.freq_penalty_multiplier < 1.0 && (
                            <div>• Frequency Penalty: {((1 - activeStop.freq_penalty_multiplier) * 100).toFixed(0)}% reduction</div>
                        )}
                        {activeStop.catch_penalty_multiplier < 1.0 && (
                            <div>• Catchment Penalty: {((1 - activeStop.catch_penalty_multiplier) * 100).toFixed(0)}% reduction</div>
                        )}
                    </div>
                </div>
            )}

            {/* Three Keys / Two Keys Detailed Breakdown */}
            <div className="grid grid-cols-2 gap-2 mb-4">
                {/* Frequency Key */}
                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 col-span-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 font-bold">Frequency Key</div>
                    <div className="font-bold text-xl mb-1">{activeStop.frequency_score.toFixed(0)}</div>

                    <div className="space-y-1 mt-2">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Headway (30%)</span>
                            <span className="font-medium">{activeStop.headway_score.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Span (15%)</span>
                            <span className="font-medium">{activeStop.service_span_score.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Reliability (5%)</span>
                            <span className="font-medium">{activeStop.reliability_score.toFixed(0)}</span>
                        </div>
                    </div>
                </div>

                {/* Coverage Key */}
                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 col-span-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 font-bold">Coverage Key</div>
                    <div className="font-bold text-xl mb-1">{activeStop.coverage_score.toFixed(0)}</div>

                    <div className="space-y-1 mt-2">
                        {/* Network Breakdown */}
                        <div className="border-b border-gray-200 pb-1 mb-1">
                            <div className="flex justify-between text-[10px] font-bold text-gray-700">
                                <span>Network (35%)</span>
                                <span>{activeStop.network_coverage_score?.toFixed(0) || '0'}</span>
                            </div>

                            {/* Hub Connectivity */}
                            <div className="flex justify-between text-[9px] mt-1">
                                <span className="text-gray-500">Hubs (50%)</span>
                                <div className="flex items-center gap-1">
                                    <span className="font-medium text-xs text-blue-700">{activeStop.connectivity_tier || '-'}</span>
                                    <span className="font-medium text-gray-700">{(activeStop.hub_reachability_score || 0).toFixed(0)}</span>
                                </div>
                            </div>

                            {/* Orbital */}
                            <div className="flex justify-between text-[9px]">
                                <span className="text-gray-500">Orbital (30%)</span>
                                <span className={`font-medium ${(activeStop.orbital_directness_score || 0) < 50 ? 'text-red-600' : 'text-gray-700'}`}>
                                    {(activeStop.orbital_directness_score || 0).toFixed(0)}
                                    {(activeStop.orbital_directness_score || 0) < 50 && " ⚠️"}
                                </span>
                            </div>

                            {/* CBD */}
                            <div className="flex justify-between text-[9px]">
                                <span className="text-gray-500">CBD (20%)</span>
                                <span className="font-medium">{(activeStop.cbd_direct_score || 0).toFixed(0)}</span>
                            </div>
                        </div>

                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Local (15%)</span>
                            <span className="font-medium">{activeStop.local_coverage_score.toFixed(0)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Wait Time Badge */}
            <div className="mb-3 flex gap-2">
                <div className="px-2 py-1 rounded bg-gray-100 text-xs font-medium text-gray-600">
                    🕒 Avg Wait: {activeStop.average_wait_time.toFixed(1)}m
                </div>
            </div>

            {/* Inter-Modality Bonus */}
            {activeStop.intermodal_bonus !== undefined && activeStop.intermodal_bonus > 0 ? (
                <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="text-xs font-bold text-green-900 flex items-center gap-1">
                                ✨ Inter-Modality Bonus
                                {activeStop.intermodal_bonus >= 15 && <span className="ml-1 text-[9px] bg-green-200 text-green-800 px-1 rounded-full">Premium</span>}
                            </div>
                            <div className="text-[10px] text-green-700 mt-0.5">
                                {activeStop.intermodal_breakdown?.[0]}
                            </div>
                        </div>
                        <div className="font-bold text-green-700 text-lg">+{activeStop.intermodal_bonus.toFixed(1)}</div>
                    </div>

                    {/* Connected Modes List */}
                    <div className="space-y-2 mt-3">
                        {/* Train */}
                        {activeStop.train_stops_nearby && activeStop.train_stops_nearby.length > 0 && (
                            <div className="text-[10px]">
                                <div className="font-bold text-green-800 mb-1 flex justify-between">
                                    <span>🚆 Train</span>
                                </div>
                                {activeStop.train_stops_nearby.map((s, i) => (
                                    <div key={i} className="pl-2 border-l-2 border-green-200 mb-1">
                                        <div className="flex justify-between">
                                            <span className="font-medium text-gray-700">{s.name}</span>
                                            <span className="font-bold text-green-700">{s.score.toFixed(0)}/100</span>
                                        </div>
                                        <div className="text-gray-500 text-[9px]">{s.route_summary || 'Metro Train'} • {Math.round(s.distance)}m</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Tram */}
                        {activeStop.tram_stops_nearby && activeStop.tram_stops_nearby.length > 0 && (
                            <div className="text-[10px]">
                                <div className="font-bold text-green-800 mb-1">🚋 Tram</div>
                                {activeStop.tram_stops_nearby.map((s, i) => (
                                    <div key={i} className="pl-2 border-l-2 border-green-200 mb-1">
                                        <div className="flex justify-between">
                                            <span className="font-medium text-gray-700">{s.name}</span>
                                            <span className="font-bold text-green-700">{s.score.toFixed(0)}/100</span>
                                        </div>
                                        <div className="text-gray-500 text-[9px]">{s.route_summary} • {Math.round(s.distance)}m</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Bus */}
                        {activeStop.bus_stops_nearby && activeStop.bus_stops_nearby.length > 0 && (
                            <div className="text-[10px]">
                                <div className="font-bold text-green-800 mb-1">🚌 Bus</div>
                                {activeStop.bus_stops_nearby.map((s, i) => (
                                    <div key={i} className="pl-2 border-l-2 border-green-200 mb-1">
                                        <div className="flex justify-between">
                                            <span className="font-medium text-gray-700">{s.name}</span>
                                            <span className={`font-bold ${s.score >= 50 ? 'text-green-700' : 'text-orange-600'}`}>{s.score.toFixed(0)}/100</span>
                                        </div>
                                        <div className="text-gray-500 text-[9px]">{s.route_summary} • {Math.round(s.distance)}m</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Explainer */}
                    <div className="mt-3 pt-2 border-t border-green-200">
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] font-bold text-green-800">📊 What This Means</div>
                            <Link to="/methodology" className="text-[9px] text-green-700 underline hover:text-green-900">
                                View Methodology →
                            </Link>
                        </div>
                        <div className="text-[9px] text-green-700 leading-tight">
                            Only high-quality connections (Score 50+) award full bonus points.
                            {activeStop.intermodal_bonus >= 20
                                ? " This location offers top-tier redundancy with 3 independent modes."
                                : " Adding another high-quality mode could boost this score to +20."}
                        </div>
                    </div>
                </div>
            ) : (
                // Single-Mode Warning (Only if strictly single mode but NO bonus)
                // If it's isolated.
                (activeStop.frequency_score > 0) && (
                    <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <div className="text-xs font-bold text-gray-500 mb-1">⚠️ Single-Mode Station</div>
                        <div className="text-[10px] text-gray-500">
                            No inter-modality bonus (+0).
                            Specific integration with other high-frequency modes could add up to +20 points.
                        </div>
                    </div>
                )
            )}

            {/* Patronage Data (Metro Train only) */}
            {activeStop.mode_id === 2 && activeStop.patronage_annual && (
                <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="text-xs font-medium text-blue-900 mb-2">📊 Daily Patronage</div>
                    <div className="font-bold text-base text-blue-900">
                        ~{Math.round(activeStop.patronage_annual / 365).toLocaleString()} passengers/day
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                        {(activeStop.patronage_annual / 1000000).toFixed(1)}M annual
                    </div>
                </div>
            )}

            {/* Routes Serving Stop */}
            <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">Routes Serving Stop</div>
                <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
                    {activeStop.route_ids.map((rid: string) => {
                        const route = routes[rid];
                        if (!route) return null;
                        return (
                            <span
                                key={rid}
                                className="px-2 py-1 rounded text-xs text-white font-medium"
                                style={{ backgroundColor: route.color }}
                                title={route.long_name}
                            >
                                {route.short_name || route.long_name}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* Nearby Connections */}
            {initialStop.nearby_stops && initialStop.nearby_stops.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-2">Nearby Connections (&lt;400m)</div>
                    <div className="space-y-1 max-h-[80px] overflow-y-auto">
                        {initialStop.nearby_stops.map((nearby) => (
                            <div key={nearby.id} className="flex justify-between text-xs">
                                <span className="truncate max-w-[180px]" title={nearby.name}>{nearby.name}</span>
                                <span className="text-gray-400 ml-2 flex-shrink-0">{formatModeName(nearby.mode_name)} ({Math.round(nearby.distance)}m)</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
