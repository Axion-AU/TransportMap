import { MapContainer, TileLayer, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ProposedRoute } from '../types/data';

interface NetworkPlanMapProps {
    routes: ProposedRoute[];
}

const SPECTRUM = ['#D428D4', '#7B3FE4', '#4A7AEB', '#0BB8D4', '#00DDB8'];

/**
 * Shows the proposed feeder routes only: high-quality stops and flagged
 * redundant routes aren't drawn here, since the plan output carries no
 * geometry for the routes it recommends decommissioning. Those are listed
 * in the table below the map instead.
 */
const NetworkPlanMap = ({ routes }: NetworkPlanMapProps) => {
    const position: [number, number] = [-37.8136, 144.9631];

    return (
        <MapContainer center={position} zoom={10} scrollWheelZoom={true} className="h-full w-full">
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            {routes.map((route, i) => {
                const color = SPECTRUM[i % SPECTRUM.length];
                return (
                    <Polyline key={route.id} positions={route.stops} pathOptions={{ color, weight: 3, opacity: 0.85 }}>
                        <Popup>
                            <strong>{route.name}</strong>
                            <br />
                            {route.length_km.toFixed(1)}km, {route.stops.length} stops
                        </Popup>
                    </Polyline>
                );
            })}
        </MapContainer>
    );
};

export default NetworkPlanMap;
