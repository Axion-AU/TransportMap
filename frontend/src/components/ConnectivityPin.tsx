import { useState } from 'react';
import { Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { MapPin, TrendingUp, Calendar, Zap } from 'lucide-react';
import L from 'leaflet';
import stopsData from '../data/stops.json';

interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    mode_id: number;
    mode_name: string;
    frequency_score: number;
    coverage_score: number;
    reliability_score: number;
    connectivity_score: number;
    color: string;
}

const stops = stopsData as Stop[];

interface PinState {
    lat: number;
    lng: number;
    score: number;
    stops: Stop[];
    viableCount: number;
    bestScore: number;
    avgFrequency: number;
    avgCoverage: number;
    avgReliability: number;
}

const ConnectivityPin = () => {
    const [pin, setPin] = useState<PinState | null>(null);

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
        const nearbyStops = stops.filter(stop => {
            const dLat = stop.lat - lat;
            const dLon = stop.lon - lng;
            const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
            return dist < 800;
        });

        if (nearbyStops.length === 0) return {
            score: 0, stops: [], viableCount: 0, bestScore: 0,
            avgFrequency: 0, avgCoverage: 0, avgReliability: 0
        };

        const viableOptions = nearbyStops.filter(s => s.connectivity_score > 50);
        const viableCount = viableOptions.length;
        const bestScore = nearbyStops.reduce((max, s) => Math.max(max, s.connectivity_score), 0);

        const avgFrequency = nearbyStops.reduce((sum, s) => sum + s.frequency_score, 0) / nearbyStops.length;
        const avgCoverage = nearbyStops.reduce((sum, s) => sum + s.coverage_score, 0) / nearbyStops.length;
        const avgReliability = nearbyStops.reduce((sum, s) => sum + (s.reliability_score || 0), 0) / nearbyStops.length;

        let score = (viableCount * 20) + (bestScore * 0.4);
        score = Math.min(score, 100);

        return {
            score,
            stops: nearbyStops.sort((a, b) => b.connectivity_score - a.connectivity_score).slice(0, 5),
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

    const scoreColor = pin.score >= 70 ? '#10b981' : pin.score >= 40 ? '#f59e0b' : '#ef4444';

    return (
        <>
            <Marker position={[pin.lat, pin.lng]} icon={pinIcon}>
                <Popup minWidth={300} maxWidth={340}>
                    <div className="text-sm">
                        {/* Header */}
                        <div className="mb-3 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <MapPin className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <div className="font-semibold text-base text-gray-900">Location Analysis</div>
                                    <div className="text-xs text-gray-500">800m walking radius</div>
                                </div>
                            </div>
                        </div>

                        {/* Score Card */}
                        <div className="mb-4 p-3.5 rounded-xl" style={{ backgroundColor: scoreColor + '10', borderLeft: `3px solid ${scoreColor}` }}>
                            <div className="text-xs font-medium text-gray-600 mb-1.5">Location Score</div>
                            <div className="flex items-baseline gap-2 mb-2.5">
                                <span className="text-3xl font-bold" style={{ color: scoreColor }}>
                                    {pin.score.toFixed(0)}
                                </span>
                                <span className="text-gray-400 text-lg font-medium">/100</span>
                                <span className="ml-auto text-sm font-semibold px-2.5 py-1 rounded-lg" style={{
                                    backgroundColor: scoreColor + '15',
                                    color: scoreColor
                                }}>
                                    {pin.score >= 85 ? 'Excellent' :
                                        pin.score >= 70 ? 'Good' :
                                            pin.score >= 50 ? 'Fair' : 'Poor'}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width: `${pin.score}%`,
                                        background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}dd)`
                                    }}
                                />
                            </div>
                            <div className="text-xs text-gray-600 mt-2 flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3" />
                                {pin.viableCount} viable options • Top: {pin.bestScore.toFixed(0)}
                            </div>
                        </div>

                        {/* Three Keys */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-1 mb-1.5">
                                    <MapPin className="w-3 h-3 text-gray-400" />
                                    <div className="text-[10px] text-gray-500 uppercase font-medium">Coverage</div>
                                </div>
                                <div className="font-bold text-lg text-gray-900">{pin.avgCoverage.toFixed(0)}</div>
                                <div className={`text-[10px] font-semibold mt-1 ${pin.avgCoverage >= 85 ? 'text-green-600' :
                                        pin.avgCoverage >= 70 ? 'text-yellow-600' :
                                            pin.avgCoverage >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgCoverage >= 85 ? 'Excellent' :
                                        pin.avgCoverage >= 70 ? 'Good' :
                                            pin.avgCoverage >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-1 mb-1.5">
                                    <Zap className="w-3 h-3 text-gray-400" />
                                    <div className="text-[10px] text-gray-500 uppercase font-medium">Frequency</div>
                                </div>
                                <div className="font-bold text-lg text-gray-900">{pin.avgFrequency.toFixed(0)}</div>
                                <div className={`text-[10px] font-semibold mt-1 ${pin.avgFrequency >= 85 ? 'text-green-600' :
                                        pin.avgFrequency >= 70 ? 'text-yellow-600' :
                                            pin.avgFrequency >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgFrequency >= 85 ? 'Excellent' :
                                        pin.avgFrequency >= 70 ? 'Good' :
                                            pin.avgFrequency >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                <div className="flex items-center gap-1 mb-1.5">
                                    <Calendar className="w-3 h-3 text-gray-400" />
                                    <div className="text-[10px] text-gray-500 uppercase font-medium">Reliability</div>
                                </div>
                                <div className="font-bold text-lg text-gray-900">{pin.avgReliability.toFixed(0)}</div>
                                <div className={`text-[10px] font-semibold mt-1 ${pin.avgReliability >= 85 ? 'text-green-600' :
                                        pin.avgReliability >= 70 ? 'text-yellow-600' :
                                            pin.avgReliability >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgReliability >= 85 ? 'Excellent' :
                                        pin.avgReliability >= 70 ? 'Good' :
                                            pin.avgReliability >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>
                        </div>

                        {/* Nearby Stops */}
                        <div className="pt-3 border-t border-gray-100">
                            <div className="text-xs font-semibold text-gray-700 mb-2.5">Top 5 Nearby Stops</div>
                            <div className="space-y-2 max-h-[120px] overflow-y-auto">
                                {pin.stops.map(s => (
                                    <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                                        <span className="text-xs text-gray-700 font-medium truncate max-w-[180px]">{s.name}</span>
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${s.connectivity_score > 85 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                                                s.connectivity_score > 70 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                                                    s.connectivity_score > 50 ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                                                        'bg-gradient-to-r from-red-500 to-red-600'
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
