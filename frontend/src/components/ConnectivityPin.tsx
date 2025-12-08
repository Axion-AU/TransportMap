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

        if (nearbyStops.length === 0) return { score: 0, stops: [], viableCount: 0, bestScore: 0 };

        // Viable Option: Score > 50
        const viableOptions = nearbyStops.filter(s => s.connectivity_score > 50);
        const viableCount = viableOptions.length;

        // Best Score
        const bestScore = nearbyStops.reduce((max, s) => Math.max(max, s.connectivity_score), 0);

        // Connectivity Formula: (Viable Options * 20) + (Best Score * 0.4)
        // Cap at 100
        let score = (viableCount * 20) + (bestScore * 0.4);
        score = Math.min(score, 100);

        return {
            score,
            stops: nearbyStops.sort((a, b) => b.connectivity_score - a.connectivity_score).slice(0, 5),
            viableCount,
            bestScore
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

    return (
        <>
            <Marker position={[pin.lat, pin.lng]} icon={pinIcon}>
                <Popup minWidth={250}>
                    <div className="text-center">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Connectivity Score</div>
                        <div className="text-4xl font-black text-slate-800 mb-1">
                            {pin.score.toFixed(0)}
                        </div>
                        <div className="text-xs text-gray-400 mb-3">
                            {pin.viableCount} Viable Options + Best {pin.bestScore.toFixed(0)}
                        </div>

                        <div className="text-left border-t border-gray-200 pt-2">
                            <div className="text-xs font-bold text-gray-600 mb-1">Nearby Options</div>
                            {pin.stops.map(s => (
                                <div key={s.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-100 last:border-0">
                                    <span className="truncate max-w-[140px] font-medium text-slate-700">{s.name}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`px-1.5 rounded text-[10px] text-white ${s.connectivity_score > 50 ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                                            {s.connectivity_score.toFixed(0)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Popup>
            </Marker>
            <Circle
                center={[pin.lat, pin.lng]}
                radius={800}
                pathOptions={{ color: '#3498db', fillColor: '#3498db', fillOpacity: 0.1, weight: 1, dashArray: '5, 5' }}
            />
        </>
    );
};

export default ConnectivityPin;
