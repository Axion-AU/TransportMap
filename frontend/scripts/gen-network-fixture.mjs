/**
 * SAMPLE DATA generator for the feeder-network designer.
 *
 * Population, POI, and road-corridor data do not exist anywhere in this
 * repo and every real source (ABS, data.vic.gov.au, OSM/Overpass) is
 * unreachable from this environment. This produces a deterministic,
 * clearly-labelled synthetic stand-in for all three so design_network can
 * run end to end. Real data replaces these three files in the same shape;
 * nothing downstream needs to change.
 *
 * Reuses the same ~40 suburb centroids as gen-fixture.mjs so the two
 * fixture layers tell one consistent story: the suburbs that scored badly
 * for existing transit are the same ones with sparse population coverage
 * in this synthetic population surface.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Same list as gen-fixture.mjs: name, lat, lon, quality (reused as a
// density weight here), stopCount (unused), modes (unused).
const SUBURBS = [
    ['Fitzroy', -37.7983, 144.9788, 0.95], ['Carlton', -37.8001, 144.9674, 0.93],
    ['Richmond', -37.8182, 145.0000, 0.92], ['Brunswick', -37.7667, 144.9612, 0.88],
    ['South Yarra', -37.8396, 144.9926, 0.90], ['St Kilda', -37.8676, 144.9809, 0.82],
    ['Footscray', -37.8000, 144.9005, 0.85], ['Preston', -37.7420, 145.0000, 0.75],
    ['Coburg', -37.7443, 144.9640, 0.74], ['Box Hill', -37.8190, 145.1220, 0.78],
    ['Camberwell', -37.8320, 145.0580, 0.77], ['Glen Waverley', -37.8800, 145.1640, 0.62],
    ['Sunshine', -37.7880, 144.8330, 0.68], ['Dandenong', -37.9810, 145.2150, 0.60],
    ['Frankston', -38.1420, 145.1230, 0.52], ['Werribee', -37.9000, 144.6600, 0.42],
    ['Hoppers Crossing', -37.8830, 144.7000, 0.38], ['Epping', -37.6500, 145.0330, 0.45],
    ['Mill Park', -37.6670, 145.0670, 0.30], ['South Morang', -37.6500, 145.1000, 0.35],
    ['Mernda', -37.6010, 145.0940, 0.28], ['Doreen', -37.6010, 145.1440, 0.15],
    ['Craigieburn', -37.6000, 144.9400, 0.32], ['Mickleham', -37.5330, 144.9000, 0.08],
    ['Donnybrook', -37.5440, 145.0030, 0.12], ['Melton', -37.6830, 144.5850, 0.20],
    ['Tarneit', -37.8320, 144.6940, 0.24], ['Truganina', -37.8160, 144.7160, 0.14],
    ['Point Cook', -37.9140, 144.7500, 0.16], ['Wyndham Vale', -37.8920, 144.6300, 0.22],
    ['Rowville', -37.9330, 145.2330, 0.18], ['Wantirna South', -37.8830, 145.2170, 0.26],
    ['Doncaster East', -37.7870, 145.1480, 0.34], ['Templestowe', -37.7550, 145.1180, 0.20],
    ['Clyde North', -38.1080, 145.3380, 0.10], ['Cranbourne East', -38.1120, 145.3020, 0.18],
    ['Officer', -38.0630, 145.4090, 0.14], ['Pakenham', -38.0710, 145.4870, 0.30],
    ['Berwick', -38.0300, 145.3460, 0.34], ['Keilor East', -37.7440, 144.8620, 0.36],
];

const GRID_STEP_DEG = 250 / 111320; // ~250m cells
const LAT_MIN = -38.25, LAT_MAX = -37.45, LON_MIN = 144.55, LON_MAX = 145.55;

function densityAt(lat, lon) {
    // Sum of Gaussian bumps centred on each suburb, radius scaled by its
    // "quality" (denser suburbs are also more built-up in this proxy).
    let d = 0;
    for (const [, sLat, sLon, quality] of SUBURBS) {
        const dLat = (lat - sLat) * 111320;
        const dLon = (lon - sLon) * 111320 * Math.cos(sLat * Math.PI / 180);
        const distM = Math.sqrt(dLat * dLat + dLon * dLon);
        const sigma = 900 + quality * 900; // denser suburbs also spread further
        d += Math.exp(-(distM * distM) / (2 * sigma * sigma)) * (2000 + quality * 8000);
    }
    return d;
}

// Greater Melbourne's real population, used only to rescale the synthetic
// surface to a plausible total. The shape of the distribution (denser
// inner suburbs, sparse growth corridors) is what matters for the
// coverage algorithm, not the raw Gaussian amplitude.
const TARGET_TOTAL_POPULATION = 5_000_000;

function genPopulationGrid(rand) {
    const raw = [];
    let id = 0;
    for (let lat = LAT_MIN; lat < LAT_MAX; lat += GRID_STEP_DEG) {
        for (let lon = LON_MIN; lon < LON_MAX; lon += GRID_STEP_DEG) {
            const base = densityAt(lat, lon);
            if (base < 5) continue; // skip near-empty cells, keeps the file small
            const weight = base * (0.85 + rand() * 0.3);
            raw.push({ id: `pc-${id++}`, lat: +lat.toFixed(5), lon: +lon.toFixed(5), weight });
        }
    }
    const rawTotal = raw.reduce((s, c) => s + c.weight, 0);
    const scale = TARGET_TOTAL_POPULATION / rawTotal;
    return raw.map(({ id, lat, lon, weight }) => ({ id, lat, lon, population: Math.max(1, Math.round(weight * scale)) }));
}

const POI_CATEGORIES = [
    { category: 'hospital', weight: 1.0, perSuburbChance: 0.12 },
    { category: 'school', weight: 0.6, perSuburbChance: 0.9 },
    { category: 'shopping_centre', weight: 0.8, perSuburbChance: 0.5 },
    { category: 'aged_care', weight: 0.5, perSuburbChance: 0.3 },
];

function genPoi(rand) {
    const poi = [];
    let id = 0;
    for (const [name, lat, lon] of SUBURBS) {
        for (const { category, weight, perSuburbChance } of POI_CATEGORIES) {
            const count = rand() < perSuburbChance ? 1 + Math.floor(rand() * (category === 'school' ? 2 : 1)) : 0;
            for (let i = 0; i < count; i++) {
                const jLat = lat + (rand() - 0.5) * 0.012;
                const jLon = lon + (rand() - 0.5) * 0.012;
                poi.push({
                    id: `poi-${id++}`,
                    name: `${name} ${category.replace('_', ' ')}${count > 1 ? ` ${i + 1}` : ''}`,
                    category,
                    lat: +jLat.toFixed(5),
                    lon: +jLon.toFixed(5),
                    weight,
                });
            }
        }
    }
    return poi;
}

function haversine(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * 111320;
    const mid = (lat1 + lat2) / 2 * Math.PI / 180;
    const dLon = (lon2 - lon1) * 111320 * Math.cos(mid);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

function genRoadCorridors() {
    // Candidate corridors: each suburb centroid connected to its 3 nearest
    // neighbours, standing in for the arterial road network. A straight
    // two-point "polyline" is enough for the simplified corridor-geometry
    // decision; real road geometry can replace this file directly.
    const corridors = [];
    let id = 0;
    for (let i = 0; i < SUBURBS.length; i++) {
        const [nameA, latA, lonA] = SUBURBS[i];
        const distances = SUBURBS
            .map((s, j) => (j === i ? null : { j, d: haversine(latA, lonA, s[1], s[2]) }))
            .filter(Boolean)
            .sort((a, b) => a.d - b.d)
            .slice(0, 3);
        for (const { j, d } of distances) {
            const [nameB, latB, lonB] = SUBURBS[j];
            // Avoid emitting both A->B and B->A.
            if (j < i && distances.some(x => x.j === i)) continue;
            corridors.push({
                id: `corridor-${id++}`,
                name: `${nameA}–${nameB} Corridor`,
                polyline: [[latA, lonA], [latB, lonB]],
                length_km: +(d / 1000).toFixed(2),
            });
        }
    }
    return corridors;
}

export function generateNetworkFixture() {
    const rand = mulberry32(20261124);

    const populationGrid = { fixture: true, cells: genPopulationGrid(rand) };
    const poi = { fixture: true, points: genPoi(rand) };
    const roadCorridors = { fixture: true, corridors: genRoadCorridors() };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'population_grid.json'), JSON.stringify(populationGrid));
    fs.writeFileSync(path.join(DATA_DIR, 'poi.json'), JSON.stringify(poi));
    fs.writeFileSync(path.join(DATA_DIR, 'road_corridors.json'), JSON.stringify(roadCorridors));

    const totalPop = populationGrid.cells.reduce((s, c) => s + c.population, 0);
    console.log(`[gen-network-fixture] wrote ${populationGrid.cells.length} population cells (${totalPop.toLocaleString()} people), ${poi.points.length} POIs, ${roadCorridors.corridors.length} road corridors.`);
    console.log('[gen-network-fixture] this is SAMPLE DATA; /the-plan will banner and noindex until real population/POI/road datasets replace these three files.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateNetworkFixture();
}
