
import { Marker, Popup, LayerGroup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { useState, useEffect } from 'react';
import type { Stop, Route } from '../types';
import { StopPopup } from './StopPopup';

import L from 'leaflet';

interface TransitLayerProps {
    viewMode: 'connectivity' | 'mode';
    /** Route shapes are sharded by mode; only fetched when the user opts in, and then only the shard(s) a selected stop needs. */
    showShapes?: boolean;
}



// Metro Tunnel stations (Arden, Parkville, State Library, Town Hall, Anzac)




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

const getScoreColor = (score: number) => {
    if (score >= 85) return '#10b981'; // Emerald 500
    if (score >= 70) return '#10b981'; // Emerald 500 (matching ConnectivityPin logic >70 is good)
    if (score >= 50) return '#f59e0b'; // Amber 500
    return '#ef4444'; // Red 500
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

    // Color Logic
    const bgColor = viewMode === 'connectivity'
        ? getScoreColor(stop.final_score) // Use score color
        : getModeColor(stop.mode_id);     // Use mode/line color

    const showPictogram = viewMode === 'mode' || size >= 32; // Show pictogram if mode view OR strictly large hub

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



/** Given a selected stop, the shapeIds its routes actually serve. */
const relevantShapeIdsFor = (stop: Stop, routes: Record<string, Route>): string[] => {
    const ids: string[] = [];
    for (const routeId of stop.route_ids) {
        const route = routes[routeId];
        if (!route) continue;
        if (route.shape_ids && stop.shape_ids) {
            for (const shapeId of route.shape_ids) {
                if (stop.shape_ids.includes(shapeId)) ids.push(shapeId);
            }
        } else {
            // Legacy fallback: shapes once keyed directly by routeId.
            ids.push(routeId);
        }
    }
    return ids;
};

const TransitLayer = ({ viewMode, showShapes = false }: TransitLayerProps) => {
    const map = useMap();
    const [stops, setStops] = useState<Stop[]>([]);
    // Route line geometry, fetched a shard at a time as stops are selected.
    const [shapes, setShapes] = useState<Record<string, [number, number][]>>({});
    const [shapeManifest, setShapeManifest] = useState<Record<string, string> | null>(null);
    const [loadedShards, setLoadedShards] = useState<Set<string>>(new Set());
    const [routes, setRoutes] = useState<Record<string, Route>>({});
    const [loading, setLoading] = useState(true);
    const [visibleStops, setVisibleStops] = useState<Stop[]>([]);
    const [selectedStop, setSelectedStop] = useState<Stop | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                console.log('Fetching transit data...');
                const [
                    metroTrainRes,
                    metroTramRes,
                    metroBusRes,
                    regionalTrainRes,
                    regionalCoachRes,
                    regionalBusRes,
                    skybusRes,
                    routesRes
                ] = await Promise.all([
                    fetch('/data/stops_metro_train.geojson'),
                    fetch('/data/stops_metro_tram.geojson'),
                    fetch('/data/stops_metro_bus.geojson'),
                    fetch('/data/stops_regional_train.geojson'),
                    fetch('/data/stops_regional_coach.geojson'),
                    fetch('/data/stops_regional_bus.geojson'),
                    fetch('/data/stops_skybus.geojson'),
                    fetch('/data/routes.json')
                ]);

                 
                const parseGeoJSONStops = async (res: Response): Promise<Stop[]> => {
                    const data = await res.json();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return data.features.map((f: any) => ({
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

                        // New Network Coverage Components
                        hub_reachability_score: f.properties.hub_reachability_score || 0,
                        cbd_direct_score: f.properties.cbd_direct_score || 0,
                        orbital_directness_score: f.properties.orbital_directness_score || 0,
                        connectivity_tier: f.properties.connectivity_tier || '-',

                        freq_penalty_multiplier: f.properties.freq_penalty_multiplier || 1.0,
                        catch_penalty_multiplier: f.properties.catch_penalty_multiplier || 1.0,

                        average_wait_time: f.properties.average_wait_time || 0,
                        color: f.properties.color || '#999',
                        route_ids: f.properties.route_ids || [],
                        shape_ids: f.properties.shape_ids || [],
                        nearby_stops: f.properties.nearby_stops || [],
                        patronage_annual: f.properties.patronage_annual,

                        // Inter-Modality Bonus
                        intermodal_bonus: f.properties.intermodal_bonus || 0,
                        intermodal_breakdown: f.properties.intermodal_breakdown || [],
                        connected_modes: f.properties.connected_modes || [],
                        train_stops_nearby: f.properties.train_stops_nearby || [],
                        tram_stops_nearby: f.properties.tram_stops_nearby || [],
                        bus_stops_nearby: f.properties.bus_stops_nearby || []
                    }));
                };

                const rawStops = [
                    ...(await parseGeoJSONStops(metroTrainRes)),
                    ...(await parseGeoJSONStops(metroTramRes)),
                    ...(await parseGeoJSONStops(metroBusRes)),
                    ...(await parseGeoJSONStops(regionalTrainRes)),
                    ...(await parseGeoJSONStops(regionalCoachRes)),
                    ...(await parseGeoJSONStops(regionalBusRes)),
                    ...(await parseGeoJSONStops(skybusRes))
                ];

                // Deduplicate / Chunk Stops
                const deduplicateStops = (stops: Stop[]) => {
                    const grouped = new Map<string, Stop[]>();

                    stops.forEach(stop => {
                        // Strip stop numbers like " #123" or " #124A" from end of string
                        const name = stop.name.replace(/\s+#\d+[A-Za-z]*$/, '').toLowerCase().trim();

                        let modeKey = stop.mode_id.toString();
                        // Group Regional (1) and Metro (2) trains together
                        if (stop.mode_id === 1 || stop.mode_id === 2) {
                            modeKey = "train_combined";
                        }

                        const key = `${name}_${modeKey} `;
                        if (!grouped.has(key)) grouped.set(key, []);
                        grouped.get(key)?.push(stop);
                    });

                    const mergedStops: Stop[] = [];

                    grouped.forEach((group) => {
                        if (group.length === 1) {
                            mergedStops.push(group[0]);
                        } else {
                            // Sort group to prioritize Metro (2) over Regional (1) for icon/styling
                            // Descending sort by mode_id (2 comes before 1) works if we want Metro first behavior? 
                            // Actually pure logic: 2 (Metro) > 1 (Regional).
                            group.sort((a, b) => {
                                // Prioritize Metro (2)
                                if (a.mode_id === 2 && b.mode_id !== 2) return -1;
                                if (b.mode_id === 2 && a.mode_id !== 2) return 1;
                                return 0;
                            });

                            // Sub-cluster by distance
                            const subClusters: Stop[][] = [];

                            group.forEach(s => {
                                let added = false;
                                for (const cluster of subClusters) {
                                    // Check distance to first in cluster
                                    const dLat = s.lat - cluster[0].lat;
                                    const dLon = s.lon - cluster[0].lon;
                                    const dist = Math.sqrt(dLat * dLat + dLon * dLon) * 111000;
                                    if (dist < 400) { // 400m threshold
                                        cluster.push(s);
                                        added = true;
                                        break;
                                    }
                                }
                                if (!added) subClusters.push([s]);
                            });

                            // Create merged stop for each subcluster
                            subClusters.forEach(cluster => {
                                if (cluster.length === 1) {
                                    mergedStops.push(cluster[0]);
                                    return;
                                }

                                const avgLat = cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length;
                                const avgLon = cluster.reduce((sum, s) => sum + s.lon, 0) / cluster.length;

                                // Best Mode Logic: Pick the stop with the HIGHEST score as the representative
                                // This ensures 'Watergardens' shows the Metro score (High) not the VLine score (Low)
                                const bestStop = cluster.reduce((prev, current) =>
                                    (prev.final_score > current.final_score) ? prev : current
                                );

                                // Union arrays
                                const allRoutes = new Set<string>();
                                const allShapes = new Set<string>();
                                cluster.forEach(s => {
                                    s.route_ids.forEach(id => allRoutes.add(id));
                                    s.shape_ids?.forEach(id => allShapes.add(id));
                                });

                                mergedStops.push({
                                    ...bestStop, // Inherit all scores/properties from the Best stop
                                    lat: avgLat,
                                    lon: avgLon,

                                    // Override aggregations
                                    route_ids: Array.from(allRoutes),
                                    shape_ids: Array.from(allShapes),

                                    // Store all stops in cluster for detailed breakdown
                                    sub_stops: cluster,

                                    // Update Name if mixed modes
                                    mode_name: cluster.some(s => s.mode_id !== bestStop.mode_id)
                                        ? `${bestStop.mode_name} / Interchange`
                                        : bestStop.mode_name
                                });
                            });
                        }
                    });

                    return mergedStops;
                };

                const allStops = deduplicateStops(rawStops);

                const routesData = await routesRes.json();

                setStops(allStops);
                setRoutes(routesData);
                setLoading(false);
                console.log('Data loaded successfully:', allStops.length, 'stops');
            } catch (err) {
                console.error('Error loading transit data:', err);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const updateVisibleStops = () => {
        if (loading || stops.length === 0) return;

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

    // Shape data is sharded by mode (~10-20MB each) instead of one ~90MB
    // blob. Fetch the small manifest once the user opts in, then fetch only
    // the shard(s) a selected stop's routes actually need.
    useEffect(() => {
        if (!showShapes || shapeManifest !== null) return;
        fetch('/data/shapes/manifest.json')
            .then(res => (res.ok ? res.json() : {}))
            .then(setShapeManifest)
            .catch(err => {
                console.error('Error loading shape manifest:', err);
                setShapeManifest({});
            });
    }, [showShapes, shapeManifest]);

    useEffect(() => {
        if (!showShapes || !selectedStop || !shapeManifest) return;

        const neededShapeIds = relevantShapeIdsFor(selectedStop, routes);
        const shardsToFetch = new Set<string>();
        for (const shapeId of neededShapeIds) {
            const shard = shapeManifest[shapeId];
            if (shard && !loadedShards.has(shard)) shardsToFetch.add(shard);
        }
        if (shardsToFetch.size === 0) return;

        Promise.all(
            [...shardsToFetch].map(shard =>
                fetch(`/data/shapes/${shard}`)
                    .then(res => (res.ok ? res.json() : {}))
                    .catch(err => {
                        console.error(`Error loading shape shard ${shard}:`, err);
                        return {};
                    }),
            ),
        ).then(shardResults => {
             
            setShapes(prev => Object.assign({}, prev, ...shardResults));
             
            setLoadedShards(prev => new Set([...prev, ...shardsToFetch]));
        });
    }, [showShapes, selectedStop, shapeManifest, routes, loadedShards]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- recompute viewport stops once data arrives
        updateVisibleStops();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stops, loading]); // Update when data loads

    if (loading) return null; // Or a loader component

    return (
        <LayerGroup>
            {/* Render lines for the selected stop, from whichever shards have loaded so far */}
            {showShapes && selectedStop && relevantShapeIdsFor(selectedStop, routes).map(shapeId => {
                const positions = shapes[shapeId];
                if (!positions) return null;

                const route = selectedStop.route_ids
                    .map(rid => routes[rid])
                    .find(r => r?.shape_ids?.includes(shapeId));

                return (
                    <Polyline
                        key={shapeId}
                        positions={positions}
                        pathOptions={{
                            color: route?.color ?? '#999',
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
                        click: (e) => {
                            L.DomEvent.stopPropagation(e.originalEvent);
                            setSelectedStop(stop);
                            // Smoothly center map on clicked station with offset to avoid address searcher
                            const point = map.latLngToContainerPoint([stop.lat, stop.lon]);
                            point.y -= 200; // Increased offset upward to avoid address searcher blocking popup
                            const newLatLng = map.containerPointToLatLng(point);
                            map.flyTo(newLatLng, map.getZoom(), {
                                duration: 0.5
                            });
                        }
                    }}
                >
                    <Popup autoPan={false}>
                        <StopPopup stop={stop} routes={routes} />
                    </Popup>
                </Marker >
            ))}
        </LayerGroup >
    );
};

export default TransitLayer;
