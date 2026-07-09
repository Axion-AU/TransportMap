import { useState, useEffect } from 'react';
import { Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import { catchmentScore, CATCHMENT_RADIUS_M, type CatchmentResult, type StopLite } from '../lib/scoring';
import { tilesFor } from '../lib/geo';

interface PinState extends CatchmentResult {
    lat: number;
    lng: number;
}

/**
 * Pin-drop catchment score. Uses the shared formula from lib/scoring and
 * fetches only the geohash tiles around the click instead of the full
 * stop dataset.
 */
const ConnectivityPin = () => {
    const [routes, setRoutes] = useState<Record<string, { short_name?: string; long_name?: string }>>({});
    const [pin, setPin] = useState<PinState | null>(null);

    useEffect(() => {
        fetch('/data/routes.json')
            .then(res => res.json())
            .then(setRoutes)
            .catch(err => console.error('Error loading routes for pin:', err));
    }, []);

    const pinIcon = new L.Icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        try {
            const keys = tilesFor(lat, lng, CATCHMENT_RADIUS_M);
            const lists = await Promise.all(
                keys.map(k =>
                    fetch(`/data/tiles/${k}.json`)
                        .then(r => (r.ok ? r.json() : []))
                        .catch(() => [] as StopLite[]),
                ),
            );
            const result = catchmentScore((lists as StopLite[][]).flat(), lat, lng);
            setPin({ lat, lng, ...result });
        } catch (err) {
            console.error('Pin scoring failed:', err);
        }
    };

    useMapEvents({
        click: handleMapClick
    });

    if (!pin) return null;

    const scoreColor = pin.score >= 70 ? '#10b981' : pin.score >= 50 ? '#f59e0b' : '#ef4444';

    const uniqueStops = pin.nearbyStops.reduce<StopLite[]>((acc, current) => {
        if (!acc.find(item => item.name === current.name)) acc.push(current);
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

                        {pin.score < 50 && (
                            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                                <div className="text-xs font-bold text-red-700">Below the viability line</div>
                                <div className="text-[10px] text-red-600 mt-0.5 leading-snug">
                                    Public transport here fails routine car-free living.
                                </div>
                            </div>
                        )}

                        <div className="mb-4 p-3.5 rounded-xl" style={{ backgroundColor: scoreColor + '10', borderLeft: `3px solid ${scoreColor}` }}>
                            <div className="flex justify-between items-start mb-1">
                                <div className="text-xs font-medium text-gray-600">Catchment Score</div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: scoreColor + '20', color: scoreColor }}>
                                    {pin.score >= 85 ? 'Excellent' : pin.score >= 70 ? 'Good' : pin.score >= 50 ? 'Fair' : 'Poor'}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-3xl font-bold" style={{ color: scoreColor }}>{pin.score.toFixed(0)}</span>
                                <span className="text-gray-400 text-sm font-medium">/100</span>
                            </div>

                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                                <div className="h-full rounded-full" style={{ width: `${pin.score}%`, backgroundColor: scoreColor }} />
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
                            <div className="text-xs text-gray-500 italic mb-2">No routes above 50/100 within a walk</div>
                        )}

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

                        <div className="pt-2 border-t border-gray-100">
                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Nearby Stops</div>
                            <div className="space-y-1">
                                {uniqueStops.map((s, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600 truncate max-w-[180px]">{s.name}</span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.final_score >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                            {s.final_score.toFixed(0)}
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
                radius={CATCHMENT_RADIUS_M}
                pathOptions={{ color: scoreColor, fillColor: scoreColor, fillOpacity: 0.08, weight: 2, dashArray: '8, 4' }}
            />
        </>
    );
};

export default ConnectivityPin;
