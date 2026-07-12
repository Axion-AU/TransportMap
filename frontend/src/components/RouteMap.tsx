import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { band, BAND_COLORS } from '../lib/scoring';
import type { RouteDetail } from '../types/data';

interface RouteMapProps {
    detail: RouteDetail;
}

/**
 * The route page map: the representative shape geometry as a line, and
 * every stop on the route as a dot coloured by that stop's own final_score
 * (docs/route-scoring.md, "the page map" -- geometry only, not used for
 * scoring itself, which comes from routeScore()).
 */
const RouteMap = ({ detail }: RouteMapProps) => {
    const points: [number, number][] = detail.shape.length > 0
        ? detail.shape
        : detail.stops.map(s => [s.lat, s.lon] as [number, number]);

    if (points.length === 0) return null;

    const lats = points.map(p => p[0]);
    const lons = points.map(p => p[1]);
    const center: [number, number] = [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lons) + Math.max(...lons)) / 2,
    ];

    return (
        <MapContainer center={center} zoom={11} scrollWheelZoom={true} className="h-full w-full bg-slate-900">
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {detail.shape.length > 1 && (
                <Polyline positions={detail.shape} pathOptions={{ color: '#4A7AEB', weight: 3, opacity: 0.8 }} />
            )}

            {detail.stops.map((stop, i) => {
                const color = BAND_COLORS[band(stop.final_score)];
                return (
                    <CircleMarker
                        key={`stop-${i}`}
                        center={[stop.lat, stop.lon]}
                        radius={4}
                        pathOptions={{ color: '#0b0b12', weight: 1, fillColor: color, fillOpacity: 1 }}
                    >
                        <Popup>
                            <div className="text-xs font-sans">
                                <div className="font-semibold text-ink">{stop.name}</div>
                                <div className="text-ink-soft">{stop.mode_name} &mdash; {stop.final_score}/100</div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
};

export default RouteMap;
