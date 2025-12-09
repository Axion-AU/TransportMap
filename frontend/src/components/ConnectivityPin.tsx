import { useState } from 'react';
import { Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
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

    // Define a default icon for the marker if pinIcon is not globally defined
    // This is a common Leaflet pattern, but ensure it's available or defined.
    // For this change, we'll assume `pinIcon` is either defined elsewhere or
    // `defaultPinIcon` (from the original code) is intended.
    // Let's use a basic default icon for demonstration if `pinIcon` is not provided.
    const defaultPinIcon = new L.Icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
    // Using `defaultPinIcon` as `pinIcon` for consistency with the original code's implicit usage
    // and to ensure the code is runnable without external definitions.
    const pinIcon = defaultPinIcon;


    const calculateScore = (lat: number, lng: number) => {
        // Find all stops within 800m (walkable)
        const nearbyStops = stops.filter(stop => {
            const dLat = stop.lat - lat;
            const dLon = stop.lon - lng;
            // Approx conversion for Melbourne latitude
            const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
            return dist < 800;
        });

        if (nearbyStops.length === 0) return {
            score: 0, stops: [], viableCount: 0, bestScore: 0,
            avgFrequency: 0, avgCoverage: 0, avgReliability: 0
        };

        // Viable Option: Score > 50
        const viableOptions = nearbyStops.filter(s => s.connectivity_score > 50);
        const viableCount = viableOptions.length;

        // Best Score
        const bestScore = nearbyStops.reduce((max, s) => Math.max(max, s.connectivity_score), 0);

        // Average scores for Three Keys
        const avgFrequency = nearbyStops.reduce((sum, s) => sum + s.frequency_score, 0) / nearbyStops.length;
        const avgCoverage = nearbyStops.reduce((sum, s) => sum + s.coverage_score, 0) / nearbyStops.length;
        const avgReliability = nearbyStops.reduce((sum, s) => sum + (s.reliability_score || 0), 0) / nearbyStops.length;

        // Connectivity Formula: (Viable Options * 20) + (Best Score * 0.4)
        // Cap at 100
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

    const scoreColor = pin.score >= 70 ? '#2ecc71' : pin.score >= 40 ? '#f1c40f' : '#e74c3c';

    return (
        <>
            <Marker position={[pin.lat, pin.lng]} icon={pinIcon}>
                <Popup minWidth={280} maxWidth={320}>
                    <div className="text-sm">
                        {/* Header */}
                        <div className="mb-3 pb-3 border-b border-gray-200">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-2xl">📍</span>
                                <div>
                                    <div className="font-bold text-base">Dropped Pin</div>
                                    <div className="text-xs text-gray-600">800m radius analysis</div>
                                </div>
                            </div>
                        </div>

                        {/* Location Score - Prominent */}
                        <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: scoreColor + '15' }}>
                            <div className="text-xs text-gray-600 mb-1">Location Score</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold" style={{ color: scoreColor }}>
                                    {pin.score.toFixed(0)}
                                </span>
                                <span className="text-gray-500">/100</span>
                                <span className="ml-auto text-xs font-medium" style={{ color: scoreColor }}>
                                    {pin.score >= 85 ? 'Excellent' :
                                        pin.score >= 70 ? 'Good' :
                                            pin.score >= 50 ? 'Fair' : 'Poor'}
                                </span>
                            </div>
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                        width: `${pin.score}%`,
                                        backgroundColor: scoreColor
                                    }}
                                />
                            </div>
                            <div className="text-xs text-gray-600 mt-2">
                                {pin.viableCount} viable options ({'>'}50) • Best: {pin.bestScore.toFixed(0)}
                            </div>
                        </div>

                        {/* Three Keys Averages */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Coverage</div>
                                <div className="font-bold text-base">{pin.avgCoverage.toFixed(0)}</div>
                                <div className={`text-[10px] font-medium mt-1 ${pin.avgCoverage >= 85 ? 'text-green-600' :
                                    pin.avgCoverage >= 70 ? 'text-yellow-600' :
                                        pin.avgCoverage >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgCoverage >= 85 ? 'Excellent' :
                                        pin.avgCoverage >= 70 ? 'Good' :
                                            pin.avgCoverage >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>

                            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Frequency</div>
                                <div className="font-bold text-base">{pin.avgFrequency.toFixed(0)}</div>
                                <div className={`text-[10px] font-medium mt-1 ${pin.avgFrequency >= 85 ? 'text-green-600' :
                                    pin.avgFrequency >= 70 ? 'text-yellow-600' :
                                        pin.avgFrequency >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgFrequency >= 85 ? 'Excellent' :
                                        pin.avgFrequency >= 70 ? 'Good' :
                                            pin.avgFrequency >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>

                            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Reliability</div>
                                <div className="font-bold text-base">{pin.avgReliability.toFixed(0)}</div>
                                <div className={`text-[10px] font-medium mt-1 ${pin.avgReliability >= 85 ? 'text-green-600' :
                                    pin.avgReliability >= 70 ? 'text-yellow-600' :
                                        pin.avgReliability >= 50 ? 'text-orange-600' : 'text-red-600'
                                    }`}>
                                    {pin.avgReliability >= 85 ? 'Excellent' :
                                        pin.avgReliability >= 70 ? 'Good' :
                                            pin.avgReliability >= 50 ? 'Fair' : 'Poor'}
                                </div>
                            </div>
                        </div>

                        {/* Nearby Options */}
                        <div className="pt-3 border-t border-gray-200">
                            <div className="text-xs text-gray-500 mb-2">Top 5 Nearby Stops</div>
                            <div className="space-y-1 max-h-[100px] overflow-y-auto">
                                {pin.stops.map(s => (
                                    <div key={s.id} className="flex justify-between items-center text-xs py-1">
                                        <span className="truncate max-w-[180px] font-medium text-slate-700">{s.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${s.connectivity_score > 70 ? 'bg-green-500' :
                                                s.connectivity_score > 50 ? 'bg-yellow-500' : 'bg-red-500'
                                                }`}>
                                                {s.connectivity_score.toFixed(0)}
                                            </span>
                                        </div>
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
                pathOptions={{ color: scoreColor, fillColor: scoreColor, fillOpacity: 0.1, weight: 2, dashArray: '5, 5' }}
            />
        </>
    );
};

export default ConnectivityPin;
