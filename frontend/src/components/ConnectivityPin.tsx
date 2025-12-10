import { useState, useEffect } from 'react';
import { Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import L from 'leaflet';

interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    mode_id: number;
    mode_name: string;
    frequency_score: number;
    headway_score: number;
    service_span_score: number;
    reliability_score: number;

    coverage_score: number;
    network_coverage_score: number;
    local_coverage_score: number;

    freq_penalty_multiplier: number;
    catch_penalty_multiplier: number;

    base_score: number;
    final_score: number;

    connectivity_score: number;
    color: string;
    route_ids: string[];
}

interface PinState {
    lat: number;
    lng: number;
    score: number;
    stops: Stop[];
    viableRoutes: { id: string, score: number }[];
    viableCount: number;
    bestScore: number;
    avgFrequency: number;
    avgCoverage: number;
    avgReliability: number;
}

const ConnectivityPin = () => {
    const [stops, setStops] = useState<Stop[]>([]);
    const [routes, setRoutes] = useState<Record<string, any>>({});
    const [pin, setPin] = useState<PinState | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Load Routes
                const routesRes = await fetch('/data/routes.json');
                const routesData = await routesRes.json();
                setRoutes(routesData);

                // Load Stops
                const files = [
                    '/data/stops_metro_train.geojson',
                    '/data/stops_metro_tram.geojson',
                    '/data/stops_metro_bus.geojson',
                    '/data/stops_regional_train.geojson',
                    '/data/stops_regional_coach.geojson',
                    '/data/stops_regional_bus.geojson',
                    '/data/stops_skybus.geojson'
                ];

                const responses = await Promise.all(files.map(f => fetch(f)));
                let allStops: Stop[] = [];

                for (const res of responses) {
                    const data = await res.json();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const parsed = data.features.map((f: any) => ({
                        id: f.properties.id,
                        name: f.properties.name,
                        lat: f.geometry.coordinates[1],
                        lon: f.geometry.coordinates[0],
                        mode_id: f.properties.mode_id,
                        mode_name: f.properties.mode_name,

                        frequency_score: f.properties.frequency_score || 0,
                        headway_score: f.properties.headway_score || 0,
                        service_span_score: f.properties.service_span_score || 0,
                        reliability_score: f.properties.reliability_score || 0,

                        coverage_score: f.properties.coverage_score || 0,
                        network_coverage_score: f.properties.network_coverage_score || 0,
                        local_coverage_score: f.properties.local_coverage_score || 0,

                        connectivity_score: f.properties.connectivity_score || 0,
                        base_score: f.properties.base_score || 0,
                        final_score: f.properties.final_score || 0,

                        freq_penalty_multiplier: f.properties.freq_penalty_multiplier || 1.0,
                        catch_penalty_multiplier: f.properties.catch_penalty_multiplier || 1.0,

                        color: f.properties.color || '#999',
                        route_ids: f.properties.route_ids || []
                    }));
                    allStops = [...allStops, ...parsed];
                }
                setStops(allStops);
            } catch (err) {
                console.error('Error loading data for pin:', err);
            }
        };

        fetchData();
    }, []);

    const defaultPinIcon = new L.Icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
    const pinIcon = defaultPinIcon;

    const calculateScore = (lat: number, lng: number) => {
        if (stops.length === 0) return {
            score: 0, stops: [], viableRoutes: [], viableCount: 0, bestScore: 0,
            avgFrequency: 0, avgCoverage: 0, avgReliability: 0
        };

        const nearbyStops = stops.filter(stop => {
            const dLat = stop.lat - lat;
            const dLon = stop.lon - lng;
            const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
            return dist < 800;
        });

        if (nearbyStops.length === 0) return {
            score: 0, stops: [], viableRoutes: [], viableCount: 0, bestScore: 0,
            avgFrequency: 0, avgCoverage: 0, avgReliability: 0
        };

        // Group by Route ID to identify unique options
        const routeBestScores = new Map<string, number>();

        nearbyStops.forEach(stop => {
            if (stop.route_ids && stop.route_ids.length > 0) {
                stop.route_ids.forEach(rid => {
                    const current = routeBestScores.get(rid) || 0;
                    routeBestScores.set(rid, Math.max(current, stop.connectivity_score));
                });
            }
        });

        // Calculate Viable Routes (>50)
        let viableRoutes: { id: string, score: number }[] = [];
        routeBestScores.forEach((score, id) => {
            if (score > 50) {
                viableRoutes.push({ id, score });
            }
        });

        // Sort by score
        viableRoutes.sort((a, b) => b.score - a.score);

        const viableCount = viableRoutes.length;
        const bestScore = viableRoutes.length > 0 ? viableRoutes[0].score :
            (nearbyStops.length > 0 ? Math.max(...nearbyStops.map(s => s.connectivity_score)) : 0);

        // Quality Weighted Count
        const qualityWeightedCount = viableRoutes.reduce((sum, r) => {
            return sum + Math.pow(r.score / 100.0, 2);
        }, 0);

        // Diversity Bonus Calculation
        const getDiversityBonus = (count: number) => {
            if (count <= 0) return 0;
            if (count <= 1) return count * 20;
            if (count <= 2) return 20 + (count - 1) * 30;
            if (count <= 3) return 50 + (count - 2) * 20;
            if (count <= 4) return 70 + (count - 3) * 15;
            if (count <= 5) return 85 + (count - 4) * 15;
            return 100;
        };

        const diversityBonus = getDiversityBonus(qualityWeightedCount);

        let score = 0;
        if (viableRoutes.length > 0) {
            score = (bestScore * 0.7) + (diversityBonus * 0.3);
        } else {
            const bestAvailable = nearbyStops.reduce((max, s) => Math.max(max, s.connectivity_score), 0);
            score = Math.min(bestAvailable, 49);
        }

        score = Math.min(score, 100);

        const avgFrequency = nearbyStops.reduce((sum, s) => sum + s.frequency_score, 0) / nearbyStops.length;
        const avgCoverage = nearbyStops.reduce((sum, s) => sum + s.coverage_score, 0) / nearbyStops.length;
        const avgReliability = nearbyStops.reduce((sum, s) => sum + (s.reliability_score || 0), 0) / nearbyStops.length;

        // Sort stops for display
        const sortedStops = nearbyStops.sort((a, b) => b.connectivity_score - a.connectivity_score);

        return {
            score,
            stops: sortedStops,
            viableRoutes,
            viableCount,
            bestScore,
            avgFrequency,
            avgCoverage,
            avgReliability
        };
    };

    const handleMapClick = (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        const result = calculateScore(lat, lng);
        setPin({ lat, lng, ...result });
    };

    useMapEvents({
        click: handleMapClick
    });

    if (!pin) return null;

    const scoreColor = pin.score >= 70 ? '#10b981' : pin.score >= 50 ? '#f59e0b' : '#ef4444';

    // Deduplicate stops for list (by name)
    const uniqueStops = pin.stops.reduce<Stop[]>((acc, current) => {
        if (!acc.find(item => item.name === current.name)) {
            acc.push(current);
        }
        return acc;
    }, []).slice(0, 5);

    const getRouteName = (rid: string) => {
        if (routes[rid]) return routes[rid].short_name || routes[rid].long_name;
        return rid;
    };

    return (
        <>
            <Marker position={[pin.lat, pin.lng]} icon={pinIcon}>
                <Popup minWidth={320} maxWidth={360}>
                    <div className="text-sm font-sans">
                        {/* Header */}
                        <div className="mb-3 pb-3 border-b border-gray-100 flex justify-between items-start">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <MapPin className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <div className="font-semibold text-base text-gray-900 leading-tight">Location Analysis</div>
                                    <div className="text-[10px] text-gray-500">800m walking radius</div>
                                </div>
                            </div>
                        </div>

                        {/* Viability Warning */}
                        {pin.score < 50 && (
                            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                <div className="text-xs font-bold text-red-700 flex items-center gap-1">
                                    ⚠️ Below Viability Threshold
                                </div>
                                <div className="text-[10px] text-red-600 mt-0.5 leading-snug">
                                    Public transport here is effectively non-viable for routine car-free living.
                                </div>
                            </div>
                        )}

                        {/* Score Card */}
                        <div className="mb-4 p-3.5 rounded-xl transition-colors" style={{ backgroundColor: scoreColor + '10', borderLeft: `3px solid ${scoreColor}` }}>
                            <div className="flex justify-between items-start mb-1">
                                <div className="text-xs font-medium text-gray-600">Connectivity Score</div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: scoreColor + '20', color: scoreColor }}>
                                    {pin.score >= 85 ? 'Excellent' : pin.score >= 70 ? 'Good' : pin.score >= 50 ? 'Fair' : 'Poor'}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-3xl font-bold" style={{ color: scoreColor }}>{pin.score.toFixed(0)}</span>
                                <span className="text-gray-400 text-sm font-medium">/100</span>
                            </div>

                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${pin.score}%`, backgroundColor: scoreColor }}
                                />
                            </div>

                            <div className="flex justify-between text-[10px] text-gray-500 mt-2">
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-700">{pin.viableCount}</span>
                                    <span>Viable Routes</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="font-bold text-gray-700">{pin.bestScore.toFixed(0)}</span>
                                    <span>Best Stop Score</span>
                                </div>
                            </div>
                        </div>

                        {/* PT Access Summary */}
                        <div className="mb-4">
                            <div className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wide">PT Access Summary</div>

                            {/* Viable Routes List */}
                            {pin.viableRoutes.length > 0 ? (
                                <div className="space-y-1.5 mb-2">
                                    {pin.viableRoutes.slice(0, 3).map(r => (
                                        <div key={r.id} className="flex justify-between items-center text-xs bg-gray-50 p-1.5 rounded border border-gray-100">
                                            <span className="font-medium text-gray-700">{getRouteName(r.id)}</span>
                                            <span className="font-bold text-green-600">{r.score.toFixed(0)}/100</span>
                                        </div>
                                    ))}
                                    {pin.viableRoutes.length > 3 && (
                                        <div className="text-[10px] text-gray-500 italic">+{pin.viableRoutes.length - 3} more viable routes</div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-gray-500 italic mb-2">No viable routes found (&gt50/100)</div>
                            )}

                            {/* Best Stop Info */}
                            {uniqueStops.length > 0 && (
                                <div className="text-[10px] text-gray-600 mt-2">
                                    <span className="font-semibold text-gray-700">Best Option:</span> {uniqueStops[0].name} ({uniqueStops[0].connectivity_score.toFixed(0)}/100)
                                </div>
                            )}
                        </div>

                        {/* Three Keys Grid */}
                        <div className="grid grid-cols-3 gap-2 mb-4 border-t border-gray-100 pt-3">
                            <div className="text-center">
                                <div className="text-[10px] text-gray-400 uppercase mb-0.5">Freq</div>
                                <div className="font-bold text-sm text-gray-700">{pin.avgFrequency.toFixed(0)}</div>
                            </div>
                            <div className="text-center border-l border-gray-100">
                                <div className="text-[10px] text-gray-400 uppercase mb-0.5">Cov</div>
                                <div className="font-bold text-sm text-gray-700">{pin.avgCoverage.toFixed(0)}</div>
                            </div>
                            <div className="text-center border-l border-gray-100">
                                <div className="text-[10px] text-gray-400 uppercase mb-0.5">Rel</div>
                                <div className="font-bold text-sm text-gray-700">{pin.avgReliability.toFixed(0)}</div>
                            </div>
                        </div>

                        {/* Top Nearby Stops List */}
                        <div className="pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Nearby Stops</div>
                            <div className="space-y-1">
                                {uniqueStops.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600 truncate max-w-[180px]">{s.name}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.connectivity_score >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-700'
                                            }`}>
                                            {s.connectivity_score.toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </Popup>
            </Marker>
            <Circle
                center={[pin.lat, pin.lng]}
                radius={800}
                pathOptions={{ color: scoreColor, fillColor: scoreColor, fillOpacity: 0.08, weight: 2, dashArray: '8, 4' }}
            />
        </>
    );
};

export default ConnectivityPin;
