
import { Marker, Popup, LayerGroup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { useState, useEffect } from 'react';
import { MapPin, Zap, Calendar, Users, BarChart3 } from 'lucide-react';
import L from 'leaflet';
import stopsData from '../data/stops.json';
import shapesData from '../data/shapes.json';
import routesData from '../data/routes.json';

interface NearbyStop {
    id: string;
    name: string;
    mode_name: string;
    distance: number;
}

interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    mode_id: number;
    mode_name: string;
    frequency_score: number;
    average_wait_time: number;
    coverage_score: number;
    reliability_score: number;
    connectivity_score: number;
    color: string;
    route_ids: string[];
    nearby_stops: NearbyStop[];
    patronage_annual?: number;
}

interface Route {
    id: string;
    short_name: string;
    long_name: string;
    color: string;
    mode_id: number;
}

interface TransitLayerProps {
    viewMode: 'connectivity' | 'mode';
}

const stops = stopsData as Stop[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shapes = shapesData as unknown as Record<string, [number, number][]>;
const routes = routesData as Record<string, Route>;

const getModeColor = (modeId: number) => {
    switch (modeId) {
        case 1: return '#8e44ad'; // Regional Train
        case 2: return '#2980b9'; // Metro Train
        case 3: return '#27ae60'; // Tram
        case 4: return '#e67e22'; // Bus
        case 5: return '#e67e22'; // Coach
        case 6: return '#e67e22'; // Regional Bus
        case 11: return '#e74c3c'; // SkyBus
        default: return '#7f8c8d';
    }
};

const getIcon = (stop: Stop, viewMode: 'connectivity' | 'mode') => {
    let iconUrl = '';
    let size = 24; // Default size

    // Size Hierarchy
    if ([1, 2, 11].includes(stop.mode_id)) {
        size = 32; // Trains / SkyBus
    } else if (stop.mode_id === 3) {
        size = 24; // Trams
    } else {
        size = 16; // Buses
    }

    // Icon Selection
    switch (stop.mode_id) {
        case 1: iconUrl = '/transport_pictograms/PICTO_MODE_RegionalTrain.svg'; break;
        case 2: iconUrl = '/transport_pictograms/PICTO_MODE_Train.svg'; break;
        case 3: iconUrl = '/transport_pictograms/PICTO_MODE_Tram.svg'; break;
        case 4: iconUrl = '/transport_pictograms/PICTO_MODE_Bus.svg'; break;
        case 5: iconUrl = '/transport_pictograms/PICTO_MODE_Coach.svg'; break;
        case 6: iconUrl = '/transport_pictograms/PICTO_MODE_Bus.svg'; break;
        case 11: iconUrl = '/transport_pictograms/PICTO_MODE_SkyBus.svg'; break;
        default: iconUrl = '/transport_pictograms/PICTO_MODE_Bus.svg';
    }

    const bgColor = viewMode === 'connectivity' ? stop.color : getModeColor(stop.mode_id);
    const showPictogram = viewMode === 'mode'; // Only show pictogram in Mode view

    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: ${bgColor}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
    ${showPictogram ? `<img src="${iconUrl}" style="width: ${size * 0.6}px; height: ${size * 0.6}px;" />` : ''}
            </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
    });
};

const TransitLayer = ({ viewMode }: TransitLayerProps) => {
    const map = useMap();
    const [visibleStops, setVisibleStops] = useState<Stop[]>([]);
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);

    const updateVisibleStops = () => {
        const bounds = map.getBounds();
        const zoom = map.getZoom();

        let filtered = stops.filter(s => bounds.contains([s.lat, s.lon]));

        if (zoom < 12) {
            filtered = filtered.filter(s => [1, 2].includes(s.mode_id));
        } else if (zoom < 14) {
            filtered = filtered.filter(s => [1, 2, 3].includes(s.mode_id));
        }

        if (filtered.length > 500) {
            filtered = filtered.slice(0, 500);
        }

        setVisibleStops(filtered);
    };

    useMapEvents({
        moveend: updateVisibleStops,
        zoomend: updateVisibleStops,
        click: () => setSelectedStop(null) // Deselect on map click
    });

    useEffect(() => {
        updateVisibleStops();
    }, []);

    return (
        <LayerGroup>
            {/* Render Lines for Selected Stop */}
            {selectedStop && selectedStop.route_ids.map(routeId => {
                const positions = shapes[routeId];
                const route = routes[routeId];
                if (!positions) return null;

                const color = route ? route.color : getModeColor(selectedStop.mode_id);

                return (
                    <Polyline
                        key={routeId}
                        positions={positions}
                        pathOptions={{
                            color: color,
                            weight: 4,
                            opacity: 0.8
                        }}
                    />
                );
            })}

            {visibleStops.map(stop => (
                <Marker
                    key={stop.id}
                    position={[stop.lat, stop.lon]}
                    icon={getIcon(stop, viewMode)}
                    eventHandlers={{
                        click: () => {
                            setSelectedStop(stop);
                            // Smoothly center map on clicked station with offset to avoid address searcher
                            const point = map.latLngToContainerPoint([stop.lat, stop.lon]);
                            point.y -= 80; // Offset upward to avoid address searcher blocking popup
                            const newLatLng = map.containerPointToLatLng(point);
                            map.flyTo(newLatLng, map.getZoom(), {
                                duration: 0.5
                            });
                        }
                    }}
                >
                    <Popup>
                        <div className="text-sm min-w-[280px] max-w-[320px]">
                            {/* Header with Pictogram */}
                            <div className="flex items-start gap-3 mb-3 pb-3 border-b border-gray-200">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: getModeColor(stop.mode_id) }}>
                                    <img
                                        src={(() => {
                                            switch (stop.mode_id) {
                                                case 1: return '/transport_pictograms/PICTO_MODE_RegionalTrain.svg';
                                                case 2: return '/transport_pictograms/PICTO_MODE_Train.svg';
                                                case 3: return '/transport_pictograms/PICTO_MODE_Tram.svg';
                                                case 4: return '/transport_pictograms/PICTO_MODE_Bus.svg';
                                                case 5: return '/transport_pictograms/PICTO_MODE_Coach.svg';
                                                case 6: return '/transport_pictograms/PICTO_MODE_Bus.svg';
                                                case 11: return '/transport_pictograms/PICTO_MODE_SkyBus.svg';
                                                default: return '/transport_pictograms/PICTO_MODE_Bus.svg';
                                            }
                                        })()}
                                        alt={stop.mode_name}
                                        className="w-7 h-7"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-base leading-tight mb-1">{stop.name}</div>
                                    <div className="text-xs text-gray-600">{stop.mode_name}</div>
                                </div>
                            </div>

                            {/* Connectivity Score - Prominent */}
                            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: stop.color + '15' }}>
                                <div className="text-xs text-gray-600 mb-1">Station Score</div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-bold" style={{ color: stop.color }}>
                                        {stop.connectivity_score.toFixed(0)}
                                    </span>
                                    <span className="text-gray-500">/100</span>
                                    <span className="ml-auto text-xs font-medium" style={{ color: stop.color }}>
                                        {stop.connectivity_score >= 85 ? 'Excellent' :
                                            stop.connectivity_score >= 70 ? 'Good' :
                                                stop.connectivity_score >= 50 ? 'Fair' : 'Poor'}
                                    </span>
                                </div>
                                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${stop.connectivity_score}% `,
                                            backgroundColor: stop.color
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Three Keys Grid */}
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                {/* Coverage */}
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Coverage</div>
                                    <div className="text-xs text-gray-400 mb-1">35%</div>
                                    <div className="font-bold text-lg">{stop.coverage_score.toFixed(0)}</div>
                                    <div className={`text - [10px] font - medium mt - 1 ${stop.coverage_score >= 85 ? 'text-green-600' :
                                        stop.coverage_score >= 70 ? 'text-yellow-600' :
                                            stop.coverage_score >= 50 ? 'text-orange-600' : 'text-red-600'
                                        } `}>
                                        {stop.coverage_score >= 85 ? 'Excellent' :
                                            stop.coverage_score >= 70 ? 'Good' :
                                                stop.coverage_score >= 50 ? 'Fair' : 'Poor'}
                                    </div>
                                </div>

                                {/* Frequency */}
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Frequency</div>
                                    <div className="text-xs text-gray-400 mb-1">40%</div>
                                    <div className="font-bold text-lg">{stop.frequency_score.toFixed(0)}</div>
                                    <div className={`text - [10px] font - medium mt - 1 ${stop.frequency_score >= 85 ? 'text-green-600' :
                                        stop.frequency_score >= 70 ? 'text-yellow-600' :
                                            stop.frequency_score >= 50 ? 'text-orange-600' : 'text-red-600'
                                        } `}>
                                        {stop.frequency_score >= 85 ? 'Excellent' :
                                            stop.frequency_score >= 70 ? 'Good' :
                                                stop.frequency_score >= 50 ? 'Fair' : 'Poor'}
                                    </div>
                                </div>

                                {/* Reliability */}
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Reliability</div>
                                    <div className="text-xs text-gray-400 mb-1">25%</div>
                                    <div className="font-bold text-lg">{(stop.reliability_score || 0).toFixed(0)}</div>
                                    <div className={`text - [10px] font - medium mt - 1 ${(stop.reliability_score || 0) >= 85 ? 'text-green-600' :
                                        (stop.reliability_score || 0) >= 70 ? 'text-yellow-600' :
                                            (stop.reliability_score || 0) >= 50 ? 'text-orange-600' : 'text-red-600'
                                        } `}>
                                        {(stop.reliability_score || 0) >= 85 ? 'Excellent' :
                                            (stop.reliability_score || 0) >= 70 ? 'Good' :
                                                (stop.reliability_score || 0) >= 50 ? 'Fair' : 'Poor'}
                                    </div>
                                </div>
                            </div>

                            {/* Patronage Data (Metro Train only) */}
                            {stop.mode_id === 2 && stop.patronage_annual && (
                                <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                                    <div className="text-xs font-medium text-blue-900 mb-2">📊 Daily Patronage</div>
                                    <div className="font-bold text-base text-blue-900">
                                        ~{Math.round(stop.patronage_annual / 365).toLocaleString()} entries/day
                                    </div>
                                    <div className="text-xs text-blue-700 mt-1">
                                        {(stop.patronage_annual / 1000000).toFixed(1)}M annual (validates score)
                                    </div>
                                </div>
                            )}

                            {/* Routes Serving Stop */}
                            <div className="mb-3">
                                <div className="text-xs text-gray-500 mb-2">Routes Serving Stop</div>
                                <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
                                    {stop.route_ids.map(rid => {
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
                            {stop.nearby_stops && stop.nearby_stops.length > 0 && (
                                <div className="pt-3 border-t border-gray-200">
                                    <div className="text-xs text-gray-500 mb-2">Nearby Connections (&lt;400m)</div>
                                    <div className="space-y-1 max-h-[80px] overflow-y-auto">
                                        {stop.nearby_stops.map(nearby => (
                                            <div key={nearby.id} className="flex justify-between text-xs">
                                                <span className="truncate max-w-[180px]" title={nearby.name}>{nearby.name}</span>
                                                <span className="text-gray-400 ml-2 flex-shrink-0">{nearby.mode_name} ({Math.round(nearby.distance)}m)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Popup>
                </Marker>
            ))}
        </LayerGroup>
    );
};

export default TransitLayer;
