import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import TransitLayer from './TransitLayer';
import ConnectivityPin from './ConnectivityPin';
import type { ReactNode } from 'react';

interface MapProps {
    viewMode: 'connectivity' | 'mode';
    children?: ReactNode;
}

const Map = ({ viewMode, children }: MapProps) => {
    // Melbourne coordinates
    const position: [number, number] = [-37.8136, 144.9631];

    return (
        <MapContainer center={position} zoom={12} scrollWheelZoom={true} className="h-full w-full bg-slate-900">
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <TransitLayer viewMode={viewMode} />
            <ConnectivityPin />
            {children}
        </MapContainer>
    );
};

export default Map;
