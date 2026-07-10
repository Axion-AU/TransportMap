/**
 * One-time fetch of Vicmap Admin locality boundaries (methodology refactor
 * item 6 -- polygon-based suburb attribution), run manually and the result
 * committed, not re-fetched at build/CI time (same pattern as
 * fetch-suburbs.mjs).
 *
 * Scoped to Greater Melbourne + commuter corridor: the source WFS layer
 * covers all 2,973 Victorian localities statewide, but real point-in-polygon
 * attribution against the full state would newly and correctly attribute
 * every regional stop to its real town, reshuffling the regional half of the
 * site as an unplanned side effect of this piece. Filtering to localities
 * within 70km of the Melbourne CBD (kept: 657) covers every commuter/growth
 * corridor town already load-bearing in build-data.mjs's `regionalExceptions`
 * list, while excluding genuinely separate regional cities. See
 * docs/methodology_refactor.md and the plan this was scoped against for the
 * specific distances checked (Melton 33.9km, Geelong 64.3km in-scope but
 * already correctly routed to worst20Regional by the existing isRegional
 * flag, Kyneton 78.4km/Warragul 90.8km/Traralgon 143.8km out of scope).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, '../data-src/vic-localities.geojson');

const WFS_URL = 'https://opendata.maps.vic.gov.au/geoserver/wfs'
    + '?service=WFS&version=2.0.0&request=GetFeature'
    + '&typeNames=open-data-platform:locality_polygon'
    + '&outputFormat=application/json';

const CBD_LAT = -37.8136;
const CBD_LON = 144.9631;
const METRO_SCOPE_RADIUS_KM = 70;

function centroidOf(geometry) {
    const ring = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates[0][0]; // MultiPolygon: first polygon's outer ring
    let lat = 0, lon = 0;
    for (const [pLon, pLat] of ring) { lat += pLat; lon += pLon; }
    return { lat: lat / ring.length, lon: lon / ring.length };
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * 111.32;
    const midLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * 111.32 * Math.cos(midLatRad);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

async function main() {
    console.log('Fetching Vicmap Admin locality boundaries...');
    const response = await fetch(WFS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const geojson = await response.json();
    console.log(`Fetched ${geojson.features.length} statewide localities.`);

    const scoped = geojson.features.filter(f => {
        const c = centroidOf(f.geometry);
        return distanceKm(CBD_LAT, CBD_LON, c.lat, c.lon) <= METRO_SCOPE_RADIUS_KM;
    });
    console.log(`Kept ${scoped.length} localities within ${METRO_SCOPE_RADIUS_KM}km of the Melbourne CBD.`);

    const out = { type: 'FeatureCollection', features: scoped };
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));
    console.log(`Wrote ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)}MB).`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
