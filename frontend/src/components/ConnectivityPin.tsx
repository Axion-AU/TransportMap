import { useState, useEffect, useRef } from 'react';
import { Marker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import { catchmentScore, CATCHMENT_RADIUS_M, type CatchmentResult, type StopLite, BAND_COLORS, BAND_LABELS, band } from '../lib/scoring';
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
    const requestIdRef = useRef(0);

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
        const requestId = ++requestIdRef.current;
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
            // A faster later click can resolve first; only the newest wins.
            if (requestId === requestIdRef.current) setPin({ lat, lng, ...result });
        } catch (err) {
            console.error('Pin scoring failed:', err);
        }
    };

    useMapEvents({
        click: handleMapClick
    });

    if (!pin) return null;

    const activeBand = band(pin.score);
    const scoreColor = BAND_COLORS[activeBand];

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
                    <div className="text-sm font-sans select-none">
                        <div className="mb-3 pb-3 border-b border-border-subtle flex justify-between items-start">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-[4px] bg-violet/20 border border-violet/30 flex items-center justify-center shadow-lg shadow-violet/10">
                                    <MapPin className="w-5 h-5 text-violet" />
                                </div>
                                <div>
                                    <div className="font-semibold text-base text-ink type-display tracking-wide uppercase leading-tight">Location Analysis</div>
                                    <div className="text-[10px] text-ink-soft type-overline tracking-wider">800m walking radius</div>
                                </div>
                            </div>
                        </div>

                        {pin.score < 50 && (
                            <div className="mb-3 px-3 py-2 bg-magenta/10 border border-magenta/20 rounded-[4px]">
                                <div className="text-xs font-bold text-magenta type-overline">Below viability line</div>
                                <div className="text-[10px] text-ink-soft mt-0.5 leading-snug">
                                    Public transport here fails routine car-free living.
                                </div>
                            </div>
                        )}

                        <div className="mb-4 p-3.5 rounded-[4px] bg-purple-900/50 border border-border-subtle" style={{ borderLeft: `3px solid ${scoreColor}` }}>
                            <div className="flex justify-between items-start mb-1">
                                <div className="text-xs font-semibold text-ink-soft type-overline">Catchment Score</div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-[2px] type-overline" style={{ backgroundColor: scoreColor + '20', color: scoreColor }}>
                                    {BAND_LABELS[activeBand]}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-3xl font-bold type-data" style={{ color: scoreColor }}>{pin.score.toFixed(0)}</span>
                                <span className="text-ink-faint text-sm font-medium type-overline">/100</span>
                            </div>

                            <div className="h-1.5 bg-purple-900 border border-border-subtle rounded-[4px] overflow-hidden mb-2">
                                <div className="h-full rounded-[4px]" style={{ width: `${pin.score}%`, backgroundColor: scoreColor }} />
                            </div>

                            <div className="flex justify-between text-[10px] text-ink-soft mt-2">
                                <div className="flex flex-col">
                                    <span className="font-bold text-ink type-data">{pin.viableCount}</span>
                                    <span className="type-overline text-ink-faint">Viable Routes</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="font-bold text-ink type-data">{pin.bestScore.toFixed(0)}</span>
                                    <span className="type-overline text-ink-faint">Best Stop Score</span>
                                </div>
                            </div>
                        </div>

                        {pin.viableRoutes.length > 0 ? (
                            <div className="space-y-1.5 mb-2">
                                {pin.viableRoutes.slice(0, 3).map(r => (
                                    <div key={r.id} className="flex justify-between items-center text-xs bg-purple-900/40 p-1.5 rounded-[2px] border border-border-subtle">
                                        <span className="font-medium text-ink-soft">{getRouteName(r.id)}</span>
                                        <span className="font-bold type-data" style={{ color: BAND_COLORS[band(r.score)] }}>{r.score.toFixed(0)}/100</span>
                                    </div>
                                ))}
                                {pin.viableRoutes.length > 3 && (
                                    <div className="text-[10px] text-ink-faint italic">+{pin.viableRoutes.length - 3} more viable routes</div>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs text-ink-faint italic mb-2">No routes above 50/100 within a walk</div>
                        )}

                        <div className="grid grid-cols-3 gap-2 mb-4 border-t border-border-subtle pt-3">
                            <div className="text-center">
                                <div className="text-[10px] text-ink-faint type-overline mb-0.5">Freq</div>
                                <div className="font-bold text-sm text-ink type-data">{pin.avgFrequency.toFixed(0)}</div>
                            </div>
                            <div className="text-center border-l border-border-subtle">
                                <div className="text-[10px] text-ink-faint type-overline mb-0.5">Cov</div>
                                <div className="font-bold text-sm text-ink type-data">{pin.avgCoverage.toFixed(0)}</div>
                            </div>
                            <div className="text-center border-l border-border-subtle">
                                <div className="text-[10px] text-ink-faint type-overline mb-0.5">Rel</div>
                                <div className="font-bold text-sm text-ink type-data">{pin.avgReliability.toFixed(0)}</div>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-border-subtle">
                            <div className="text-[10px] font-bold text-ink-faint type-overline mb-2">Nearby Stops</div>
                            <div className="space-y-1">
                                {uniqueStops.map((s, i) => {
                                    const stopBand = band(s.final_score);
                                    const stopColor = BAND_COLORS[stopBand];
                                    return (
                                        <div key={i} className="flex items-center justify-between text-xs">
                                            <span className="text-ink-soft truncate max-w-[180px]">{s.name}</span>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] type-data" style={{ backgroundColor: stopColor + '20', color: stopColor }}>
                                                {s.final_score.toFixed(0)}
                                            </span>
                                        </div>
                                    );
                                })}
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

