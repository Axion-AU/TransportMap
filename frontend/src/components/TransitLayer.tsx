import { Marker, Popup, LayerGroup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { useState, useEffect } from 'react';
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
                            // Smoothly center map on clicked station
                            map.flyTo([stop.lat, stop.lon], map.getZoom(), {
                                duration: 0.5
                            });
                        }
                    }}
                >
                    <Popup>
                        <div className="text-sm min-w-[250px]">
                            <div className="font-bold text-lg mb-1">{stop.name}</div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2 py-0.5 rounded text-xs text-white bg-slate-600">{stop.mode_name}</span>
                                <span className="text-xs text-gray-500">ID: {stop.id}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-200 mb-3">
                                <div className="col-span-2">
                                    <div className="text-xs text-gray-500">Station Score</div>
                                    <div className="font-bold text-xl" style={{ color: stop.color }}>
                                        {stop.connectivity_score.toFixed(0)}/100
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Frequency (40%)</div>
                                    <div className="font-medium">{stop.frequency_score.toFixed(0)}/100</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Coverage (35%)</div>
                                    <div className="font-medium">{stop.coverage_score.toFixed(0)}</div>
                                </div>
                                <div className="col-span-2">
                                    <div className="text-xs text-gray-500">Reliability (25%)</div>
                                    <div className="font-medium">{(stop.reliability_score || 0).toFixed(0)}%</div>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 pt-2 mb-2">
                                <div className="text-xs text-gray-500 mb-1">Routes Serving Stop</div>
                                <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                                    {stop.route_ids.map(rid => {
                                        const route = routes[rid];
                                        if (!route) return null;
                                        return (
                                            <span
                                                key={rid}
                                                className="px-1.5 py-0.5 rounded text-xs text-white font-medium"
                                                style={{ backgroundColor: route.color }}
                                                title={route.long_name}
                                            >
                                                {route.short_name || route.long_name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {stop.nearby_stops && stop.nearby_stops.length > 0 && (
                                <div className="border-t border-gray-200 pt-2">
                                    <div className="text-xs text-gray-500 mb-1">Nearby Connections ({'<'}400m)</div>
                                    <div className="space-y-1 max-h-[80px] overflow-y-auto">
                                        {stop.nearby_stops.map(nearby => (
                                            <div key={nearby.id} className="flex justify-between text-xs">
                                                <span className="truncate max-w-[140px]" title={nearby.name}>{nearby.name}</span>
                                                <span className="text-gray-400 ml-2">{nearby.mode_name} ({Math.round(nearby.distance)}m)</span>
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
