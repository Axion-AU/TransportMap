import { MapContainer, TileLayer, GeoJSON, Rectangle, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { band, BAND_COLORS } from '../lib/scoring';
import { GRID_STEP_DEG } from '../lib/geo';
import type { SuburbDetail } from '../types/data';

interface SuburbMapProps {
    detail: SuburbDetail;
}

/**
 * The suburb page map: the real Vicmap boundary (when the suburb has one),
 * the same 250m grid cells used to compute its score rendered as a
 * translucent coverage surface, and every scored stop. Deliberately an
 * honest picture of what was actually computed -- real cells, real colours
 * from the same band palette as the score card -- not a smoothed
 * illustration.
 */
const SuburbMap = ({ detail }: SuburbMapProps) => {
    const center: [number, number] = [detail.centroid.lat, detail.centroid.lon];
    const halfStep = GRID_STEP_DEG / 2;

    return (
        <MapContainer center={center} zoom={13} scrollWheelZoom={true} className="h-full w-full bg-slate-900">
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {detail.boundary && (
                <GeoJSON
                    data={detail.boundary}
                    pathOptions={{ color: '#ffffff', weight: 2, opacity: 0.6, fillOpacity: 0, dashArray: '4, 4' }}
                />
            )}

            {detail.gridCells.map((cell, i) => {
                const color = BAND_COLORS[band(cell.score)];
                const bounds: [[number, number], [number, number]] = [
                    [cell.lat - halfStep, cell.lon - halfStep],
                    [cell.lat + halfStep, cell.lon + halfStep],
                ];
                return (
                    <Rectangle
                        key={`cell-${i}`}
                        bounds={bounds}
                        pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.4 }}
                    />
                );
            })}

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

export default SuburbMap;
