/**
 * Build-time data derivation.
 *
 * Reads the seven per-mode stops_*.geojson files exported by the Rust GTFS
 * processor and derives everything the site serves:
 *
 *   src/data/generated/suburb-index.json   bundled autocomplete + league table
 *   src/data/generated/manifest.json       data vintage, fixture flag, counts
 *   public/data/suburbs/<slug>.json        full per-suburb detail
 *   public/data/tiles/<geohash5>.json      sharded stops for address lookup
 *
 * Suburb attribution: real point-in-polygon against Vicmap Admin locality
 * boundaries (data-src/vic-localities.geojson, fetched by
 * scripts/fetch-locality-boundaries.mjs), scoped to the ~657 localities
 * within 70km of the Melbourne CBD (Greater Melbourne + commuter corridor).
 * Stops outside that scope, or on the rare gap/precision miss inside it,
 * fall back to the original heuristic cascade: trailing-parenthesis suburb
 * names, station names via scripts/station-suburbs.json, nearest-attributed
 * stop within 1km, then nearest vic-suburbs.json centroid within 5km. The QA
 * gate fails a non-fixture build when more than 10% of stops stay
 * unattributed.
 *
 * Aggregation happens in src/lib/scoring.ts, the same module the browser
 * uses. Keep it that way: one formula, one methodology page.
 *
 * Suburb-level scoring (methodology refactor item 1): 250m grid cells over
 * each suburb's real Vicmap polygon (only available within the same
 * ~657-locality metro scope as attribution above), weighted by real ABS
 * mesh-block dwelling counts (data-src/vic-mesh-block-population.json,
 * fetched by scripts/fetch-mesh-block-population.mjs). Suburbs without a
 * real polygon, or with zero populated cells, fall back to the legacy
 * stop-mean (src/lib/scoring.ts's `typicalStopScore`) -- see each detail
 * JSON's `scoreMethod` field for which applied.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import simplify from '@turf/simplify';
import { suburbScore, catchmentScore, computeVerdictInputs, band, LEAGUE_TABLE_MIN_STOPS, CATCHMENT_RADIUS_M, distanceMeters, friendlyModeName } from '../src/lib/scoring.ts';
import { verdictFor } from '../src/lib/verdict.ts';
import { geohashEncode, tilesFor, GRID_STEP_DEG } from '../src/lib/geo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');
const OUT_SUBURBS = path.join(DATA_DIR, 'suburbs');
const OUT_TILES = path.join(DATA_DIR, 'tiles');
const OUT_GENERATED = path.resolve(__dirname, '../src/data/generated');

/**
 * Editorial notes for suburbs whose real, verified score would otherwise
 * read as a data error. Keyed by slug. Almost every suburb has none --
 * only add an entry here for a confirmed real-world finding (see
 * CLAUDE.md's "Suburb attribution" note for the Doreen/Wollert precedent).
 *
 * Avalon: 4 populated dwelling cells sit 4.4-7.5km from the suburb's only
 * 4 stops, which are clustered at Avalon Airport terminal (serving
 * passengers/staff, not the residential pockets near Lara/Little River).
 * The 0/100 grid score is correct -- those residents have no stop within
 * catchment range -- even though the airport terminal itself is served
 * (bestScore reflects that). Confirmed 2026-07-11.
 */
const SUBURB_NOTES = {
    avalon: "Avalon's residential streets sit 4.4-7.5km from the suburb's only stops, which are clustered at Avalon Airport and serve passengers and staff, not nearby homes. The 0/100 score reflects genuine distance from the airport's bus stops, not a data gap -- someone living in Avalon can't walk to a service that exists to shuttle flyers to the terminal.",
};

const STOP_FILES = [
    'stops_metro_train.geojson',
    'stops_metro_tram.geojson',
    'stops_metro_bus.geojson',
    'stops_regional_train.geojson',
    'stops_regional_coach.geojson',
    'stops_regional_bus.geojson',
    'stops_skybus.geojson',
];

const STATION_SUBURBS = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'station-suburbs.json'), 'utf8'),
);

const VIC_SUBURBS = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'vic-suburbs.json'), 'utf8'),
);

// Vicmap Admin locality polygons, scoped to Greater Melbourne + commuter
// corridor (see scripts/fetch-locality-boundaries.mjs for the 70km cut and
// why). Each entry precomputes a bbox so per-stop lookups can cheaply
// prefilter before the exact point-in-polygon test.
const LOCALITIES_PATH = path.resolve(__dirname, '../data-src/vic-localities.geojson');
const VIC_LOCALITIES = fs.existsSync(LOCALITIES_PATH)
    ? JSON.parse(fs.readFileSync(LOCALITIES_PATH, 'utf8')).features.map(f => {
        const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        for (const polygon of polygons) {
            for (const [lon, lat] of polygon[0]) {
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            }
        }
        return {
            feature: f,
            // Vicmap's locality_name/gazetted_locality_name are ALL CAPS.
            name: titleCase(f.properties.locality_name ?? f.properties.gazetted_locality_name),
            bbox: [minLon, minLat, maxLon, maxLat],
            centroid: { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 },
        };
    })
    : [];
if (VIC_LOCALITIES.length === 0) {
    console.warn('[build-data] data-src/vic-localities.geojson missing or empty; run scripts/fetch-locality-boundaries.mjs. Falling back to name-parsing attribution for all stops.');
}

// Stage 2 methodology-refactor measures (docs/methodology_refactor.md items
// 2 & 7: cumulative accessibility + car competitiveness), computed offline by
// scripts/compute-travel-time-matrix.mjs + scripts/compute-car-competitiveness.mjs
// (Docker-based OSRM/r5py routing, not run at build time). Read defensively,
// same pattern as the other data-src/*.json reads above -- most suburbs will
// have no entry here until the full-coverage OSM extract finishes and the
// matrix is recomputed against it (see that script's coverage note).
const CAR_COMPETITIVENESS_PATH = path.resolve(__dirname, '../data-src/car-competitiveness.json');
const CAR_COMPETITIVENESS = fs.existsSync(CAR_COMPETITIVENESS_PATH)
    ? JSON.parse(fs.readFileSync(CAR_COMPETITIVENESS_PATH, 'utf8'))
    : null;
if (!CAR_COMPETITIVENESS) {
    console.warn('[build-data] data-src/car-competitiveness.json missing; run scripts/compute-travel-time-matrix.mjs + scripts/compute-car-competitiveness.mjs. carCompetitiveness/accessibility will be null for every suburb.');
}

// Suburb name -> locality entry, for the grid aggregation step (item 1)
// below to find a suburb's real polygon by the same title-cased name
// attributeSuburbs() already produced.
const VIC_LOCALITIES_BY_NAME = new Map(VIC_LOCALITIES.map(l => [l.name, l]));

// Real gaps/precision misses right at a polygon edge fall back to the
// nearest locality's bbox centroid, but only within this radius -- wide
// enough to absorb a stop sitting a street's width outside its true
// boundary, tight enough that a stop genuinely outside metro-scope polygon
// coverage falls through to the legacy cascade below instead of being glued
// to a locality it isn't really in.
const LOCALITY_EDGE_FALLBACK_MAX_M = 300;

function findLocality(lat, lon) {
    const candidates = VIC_LOCALITIES.filter(l =>
        lon >= l.bbox[0] && lon <= l.bbox[2] && lat >= l.bbox[1] && lat <= l.bbox[3]
    );
    for (const l of candidates) {
        if (booleanPointInPolygon([lon, lat], l.feature)) {
            return { name: l.name, method: 'polygon' };
        }
    }
    // Near-miss fallback: nearest locality centroid, tightly capped.
    let best = null;
    let bestDist = LOCALITY_EDGE_FALLBACK_MAX_M;
    for (const l of VIC_LOCALITIES) {
        const d = distanceMeters(lat, lon, l.centroid.lat, l.centroid.lon);
        if (d < bestDist) { bestDist = d; best = l; }
    }
    if (best) return { name: best.name, method: 'edge-fallback' };
    return null; // outside metro scope entirely; caller falls through to the legacy cascade.
}

// --- Grid + population aggregation (methodology refactor item 1) ---
// GRID_STEP_DEG comes from src/lib/geo.ts, shared with SuburbMap.tsx so a
// cell's displayed bounds always match the cell actually scored. Also
// matches gen-network-fixture.mjs's cell size for the (separate, still
// synthetic) feeder-network designer, deliberately.

function cellKeyFor(lat, lon) {
    const gx = Math.floor(lon / GRID_STEP_DEG);
    const gy = Math.floor(lat / GRID_STEP_DEG);
    return `${gx},${gy}`;
}

// gx,gy -> cell center lat/lon, so a populated cell's representative point
// is always the grid cell's own center, not a mesh block's centroid --
// mesh blocks are bucketed into whichever cell their centroid falls in,
// but the address-style score is computed at the cell center for every
// cell, keeping cell geometry consistent regardless of how many mesh
// blocks land in it.
function cellCenterFor(key) {
    const [gx, gy] = key.split(',').map(Number);
    return { lat: (gy + 0.5) * GRID_STEP_DEG, lon: (gx + 0.5) * GRID_STEP_DEG };
}

const MESH_BLOCK_POPULATION_PATH = path.resolve(__dirname, '../data-src/vic-mesh-block-population.json');

/** gx,gy cell key -> summed {dwellings, population} of every mesh block whose centroid falls in that 250m cell. */
function loadPopulationByCell() {
    if (!fs.existsSync(MESH_BLOCK_POPULATION_PATH)) {
        console.warn('[build-data] data-src/vic-mesh-block-population.json missing; run scripts/fetch-mesh-block-population.mjs. Falling back to legacy stop-mean aggregation for every suburb.');
        return new Map();
    }
    const meshBlocks = JSON.parse(fs.readFileSync(MESH_BLOCK_POPULATION_PATH, 'utf8'));
    const byCell = new Map();
    for (const mb of meshBlocks) {
        const key = cellKeyFor(mb.lat, mb.lon);
        const existing = byCell.get(key);
        if (existing) {
            existing.dwellings += mb.dwellings;
            existing.population += mb.population;
        } else {
            byCell.set(key, { dwellings: mb.dwellings, population: mb.population });
        }
    }
    return byCell;
}

/** Stops within radiusM of a point, using the tile index instead of scanning every stop. */
function stopsNearPoint(lat, lon, radiusM, tileIndex) {
    const keys = tilesFor(lat, lon, radiusM);
    const candidates = [];
    for (const key of keys) {
        const bucket = tileIndex.get(key);
        if (bucket) candidates.push(...bucket);
    }
    return candidates;
}

/**
 * One suburb's populated grid cells: 250m cells inside its real Vicmap
 * polygon with nonzero dwellings, each scored via catchmentScore at the
 * cell's center. Returns [] if the suburb has no real polygon (outside the
 * metro attribution scope) or no populated cells inside it -- the caller
 * treats an empty array the same as "no grid data" and falls back to the
 * legacy stop-mean.
 */
function computeGridCellsForSuburb(suburbName, populationByCell, tileIndex) {
    const locality = VIC_LOCALITIES_BY_NAME.get(suburbName);
    if (!locality) return [];

    const [minLon, minLat, maxLon, maxLat] = locality.bbox;
    const gxMin = Math.floor(minLon / GRID_STEP_DEG);
    const gxMax = Math.floor(maxLon / GRID_STEP_DEG);
    const gyMin = Math.floor(minLat / GRID_STEP_DEG);
    const gyMax = Math.floor(maxLat / GRID_STEP_DEG);

    const cells = [];
    for (let gx = gxMin; gx <= gxMax; gx++) {
        for (let gy = gyMin; gy <= gyMax; gy++) {
            const key = `${gx},${gy}`;
            const pop = populationByCell.get(key);
            if (!pop || pop.dwellings <= 0) continue; // drop zero-population cells (parks, industrial land)
            const center = cellCenterFor(key);
            if (!booleanPointInPolygon([center.lon, center.lat], locality.feature)) continue; // belongs to a neighbouring suburb's bbox, not this one
            const nearby = stopsNearPoint(center.lat, center.lon, CATCHMENT_RADIUS_M, tileIndex);
            const result = catchmentScore(nearby, center.lat, center.lon);
            cells.push({
                score: result.score,
                avgFrequency: result.avgFrequency,
                avgCoverage: result.avgCoverage,
                avgReliability: result.avgReliability,
                population: pop.dwellings,
                lat: center.lat,
                lon: center.lon,
                bestViable: result.bestViable,
                bestAvailable: result.bestAvailable,
            });
        }
    }
    return cells;
}

export function slugify(name) {
    return name
        .toLowerCase()
        .replace(/['’.]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function titleCase(name) {
    return name.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function loadStops() {
    let fixture = false;
    let generatedAt = null;
    let methodologyVersion = null;
    const stops = [];

    const manifestPath = path.join(DATA_DIR, 'stops_manifest.json');
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        for (const mode of Object.keys(manifest)) {
            const files = manifest[mode];
            for (const file of files) {
                const relativePath = file.replace(/^\/data\//, '');
                const full = path.join(DATA_DIR, relativePath);
                if (!fs.existsSync(full)) {
                    console.error(`[build-data] missing manifest file ${relativePath}.`);
                    process.exit(1);
                }
                const fc = JSON.parse(fs.readFileSync(full, 'utf8'));
                fixture = fixture || fc.fixture === true;
                generatedAt = generatedAt ?? fc.generated_at ?? null;
                methodologyVersion = methodologyVersion ?? fc.methodology_version ?? null;

                for (const f of fc.features ?? []) {
                    const p = f.properties ?? {};
                    stops.push({
                        id: p.id,
                        name: p.name ?? '',
                        lat: f.geometry.coordinates[1],
                        lon: f.geometry.coordinates[0],
                        mode_id: p.mode_id ?? 0,
                        mode_name: p.mode_name ?? 'unknown',
                        final_score: p.final_score ?? 0,
                        frequency_score: p.frequency_score ?? 0,
                        coverage_score: p.coverage_score ?? 0,
                        reliability_score: p.reliability_score ?? 0,
                        average_wait_time: p.average_wait_time ?? 0,
                        route_ids: p.route_ids ?? [],
                    });
                }
            }
        }
    } else {
        for (const file of STOP_FILES) {
            const full = path.join(DATA_DIR, file);
            if (!fs.existsSync(full)) {
                console.error(`[build-data] missing ${file}. Run the Rust processor (real data) or npm run gen:fixture.`);
                process.exit(1);
            }
            const fc = JSON.parse(fs.readFileSync(full, 'utf8'));
            fixture = fixture || fc.fixture === true;
            generatedAt = generatedAt ?? fc.generated_at ?? null;
            methodologyVersion = methodologyVersion ?? fc.methodology_version ?? null;

            for (const f of fc.features ?? []) {
                const p = f.properties ?? {};
                stops.push({
                    id: p.id,
                    name: p.name ?? '',
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    mode_id: p.mode_id ?? 0,
                    mode_name: p.mode_name ?? 'unknown',
                    final_score: p.final_score ?? 0,
                    frequency_score: p.frequency_score ?? 0,
                    coverage_score: p.coverage_score ?? 0,
                    reliability_score: p.reliability_score ?? 0,
                    average_wait_time: p.average_wait_time ?? 0,
                    route_ids: p.route_ids ?? [],
                });
            }
        }
    }
    return { stops, fixture, generatedAt, methodologyVersion };
}

const PARENS_RE = /\(([^()]+)\)\s*$/;
const STATION_RE = /^(.*?)(?:\s+Railway)?\s+Station\b/i;

function attributeSuburbs(stops) {
    const attributed = new Map(); // stop index -> suburb name
    const unresolved = [];
    let polygonAttributed = 0;
    let edgeFallbackAttributed = 0;

    // Pass 1: real point-in-polygon against Vicmap Admin locality boundaries,
    // scoped to Greater Melbourne + commuter corridor. This is authoritative
    // where it applies -- it does not need the name-parsing heuristics below.
    for (let i = 0; i < stops.length; i++) {
        const hit = findLocality(stops[i].lat, stops[i].lon);
        if (hit) {
            attributed.set(i, hit.name);
            if (hit.method === 'polygon') polygonAttributed++;
            else edgeFallbackAttributed++;
        } else {
            unresolved.push(i);
        }
    }

    // Everything below is the legacy cascade, unchanged, and now only runs
    // for stops outside the polygon dataset's metro scope (i.e. genuinely
    // regional stops) -- see fetch-locality-boundaries.mjs for the 70km cut.
    for (const i of unresolved) {
        const name = stops[i].name;
        const parens = name.match(PARENS_RE);
        if (parens) {
            attributed.set(i, titleCase(parens[1].trim()));
            continue;
        }
        const station = name.match(STATION_RE);
        if (station) {
            const base = station[1].trim();
            attributed.set(i, STATION_SUBURBS[base] ?? titleCase(base));
        }
    }

    // Nearest attributed stop within 1km, among stops resolved by this same
    // legacy cascade pass (not the polygon-attributed set -- those are a
    // different, metro-scoped population and pairing across the two would
    // just re-import polygon accuracy into the intentionally-untouched
    // regional fallback).
    const legacyAttributedIdx = unresolved.filter(i => attributed.has(i));
    let rescued = 0;
    for (const i of unresolved) {
        if (attributed.has(i)) continue;
        let best = null;
        let bestDist = 1000;
        for (const j of legacyAttributedIdx) {
            const d = distanceMeters(stops[i].lat, stops[i].lon, stops[j].lat, stops[j].lon);
            if (d < bestDist) { bestDist = d; best = j; }
        }
        if (best !== null) {
            attributed.set(i, attributed.get(best));
            rescued++;
        }
    }

    // Fallback: nearest suburb centroid from vic-suburbs.json for still unresolved
    // stops. Around 60% of Victoria's suburbs have zero directly-named (parens or
    // "Station") stops and rely entirely on this pass, so it can't be capped as
    // tightly as the 1km neighbour pass above without erasing legitimate regional
    // attribution: the surrounding VIC_SUBURBS localities are themselves sparse
    // in the country. But left uncapped, a leftover stop gets glued to whichever
    // of Victoria's ~3,000 suburb names is nearest however far that is, which is
    // how stops as far as 23km away ended up attributed to towns with zero real
    // service (e.g. Digby, Albacutya). 5km keeps the median (~1.7km) and long
    // rural tail intact while rejecting that class of outlier.
    const SUBURB_CENTROID_MAX_DIST_M = 5000;
    let fallbackRescued = 0;
    for (const i of unresolved) {
        if (!attributed.has(i)) {
            let best = null;
            let bestDist = SUBURB_CENTROID_MAX_DIST_M;
            for (const suburb of VIC_SUBURBS) {
                const d = distanceMeters(stops[i].lat, stops[i].lon, suburb.lat, suburb.lon);
                if (d < bestDist) {
                    bestDist = d;
                    best = suburb.name;
                }
            }
            if (best !== null) {
                attributed.set(i, titleCase(best));
                fallbackRescued++;
            }
        }
    }

    const legacyAttributed = unresolved.filter(i => attributed.has(i)).length;
    const unattributedCount = stops.length - attributed.size;
    return {
        attributed,
        unattributedCount,
        rescued: rescued + fallbackRescued,
        polygonAttributed,
        edgeFallbackAttributed,
        legacyAttributed,
    };
}

function main() {
    const { stops, fixture, generatedAt, methodologyVersion } = loadStops();
    console.log(`[build-data] loaded ${stops.length} stops (fixture: ${fixture})`);

    const { attributed, unattributedCount, rescued, polygonAttributed, edgeFallbackAttributed, legacyAttributed } = attributeSuburbs(stops);
    const unattributedPct = stops.length > 0 ? (unattributedCount / stops.length) * 100 : 0;
    console.log(`[build-data] attribution: ${attributed.size} attributed (${polygonAttributed} by polygon, ${edgeFallbackAttributed} by locality-edge fallback, ${legacyAttributed} by legacy cascade [${rescued} of those via nearest neighbour]), ${unattributedCount} unattributed (${unattributedPct.toFixed(2)}%)`);

    // Threshold kept at 10% (previously raised from 5% under the old
    // name-parsing cascade): real polygon attribution should push this much
    // lower for the ~657-locality metro scope, but stops genuinely outside
    // that scope still rely on the legacy cascade and its own 5km centroid
    // cap, so some regional stops remain legitimately unattributed rather
    // than glued to whatever suburb happens to be nearest however far away.
    if (!fixture && unattributedPct > 10) {
        console.error('[build-data] QA gate: more than 10% of stops have no suburb. Extend scripts/station-suburbs.json.');
        process.exit(1);
    }

    // Group by suburb.
    const bySuburb = new Map();
    attributed.forEach((suburb, i) => {
        if (!bySuburb.has(suburb)) bySuburb.set(suburb, []);
        bySuburb.get(suburb).push(stops[i]);
    });

    fs.rmSync(OUT_SUBURBS, { recursive: true, force: true });
    fs.rmSync(OUT_TILES, { recursive: true, force: true });
    fs.mkdirSync(OUT_SUBURBS, { recursive: true });
    fs.mkdirSync(OUT_TILES, { recursive: true });
    fs.mkdirSync(OUT_GENERATED, { recursive: true });

    // Tile index built once, up front: reused both for grid-cell lookups
    // below (item 1) and for the tile files written at the end of main(),
    // rather than scanning every stop again for each.
    const tileIndex = new Map();
    for (const s of stops) {
        const key = geohashEncode(s.lat, s.lon);
        if (!tileIndex.has(key)) tileIndex.set(key, []);
        tileIndex.get(key).push(s);
    }

    const populationByCell = loadPopulationByCell();
    console.log(`[build-data] population grid: ${populationByCell.size} populated 250m cells from real ABS mesh-block dwelling counts${populationByCell.size === 0 ? ' (none loaded -- see warning above)' : ''}`);

    const index = [];
    const slugSeen = new Map();
    let gridScored = 0;
    let legacyScored = 0;

    for (const [suburbName, suburbStops] of [...bySuburb.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        let slug = slugify(suburbName);
        if (!slug) continue;
        if (slugSeen.has(slug)) {
            slug = `${slug}-${slugSeen.get(slug) + 1}`;
        }
        slugSeen.set(slugify(suburbName), (slugSeen.get(slugify(suburbName)) ?? 0) + 1);

        const gridCells = computeGridCellsForSuburb(suburbName, populationByCell, tileIndex);
        const result = suburbScore(suburbStops, gridCells);
        if (result.scoreMethod === 'grid') gridScored++; else legacyScored++;
        const scoreBand = band(result.score);
        const centroid = {
            lat: suburbStops.reduce((s, x) => s + x.lat, 0) / suburbStops.length,
            lon: suburbStops.reduce((s, x) => s + x.lon, 0) / suburbStops.length,
        };
        const modeNoun = result.modeBreakdown.length > 0 ? friendlyModeName(result.modeBreakdown[0].modeName) : 'Services';
        const verdictInputs = result.scoreMethod === 'grid' ? computeVerdictInputs(gridCells) : undefined;
        const verdict = verdictFor(scoreBand, {
            medianWaitMinutes: result.medianWaitMinutes,
            modeNoun,
            breakdown: result.breakdown,
            modeBreakdown: result.modeBreakdown,
            verdictInputs,
        });

        const stopList = [...suburbStops]
            .sort((a, b) => b.final_score - a.final_score)
            .map(s => ({
                name: s.name,
                mode_name: s.mode_name,
                final_score: Math.round(s.final_score),
                lat: +s.lat.toFixed(5),
                lon: +s.lon.toFixed(5),
            }));

        // Real suburb boundary + the same grid cells used for scoring above,
        // for the suburb page map: an honest picture of what was actually
        // computed (real polygon, real 250m cells), not an illustration.
        const locality = VIC_LOCALITIES_BY_NAME.get(suburbName);
        // Simplified for display only -- point-in-polygon above already ran
        // against the full-precision locality.feature; a suburb-page map
        // doesn't need cadastral-line precision, and some real Vicmap
        // polygons carry thousands of vertices (e.g. Sunbury: 9,000+),
        // dominating the detail JSON's size for no visible benefit at
        // suburb-page zoom levels.
        const boundary = locality ? simplify(locality.feature, { tolerance: 0.0005, highQuality: true }).geometry : null;
        const gridCellSummary = gridCells.map(c => ({
            lat: +c.lat.toFixed(5),
            lon: +c.lon.toFixed(5),
            score: Math.round(c.score),
        }));

        const melb = { lat: -37.8136, lon: 144.9631 };
        const distKm = distanceMeters(centroid.lat, centroid.lon, melb.lat, melb.lon) / 1000.0;
        const regionalExceptions = [
            'beveridge',
            'wallan',
            'bacchus marsh',
            'darley',
            'maddingley',
            'hopetoun park',
            'gisborne',
            'new gisborne',
            'macedon',
            'mount macedon',
            'riddells creek',
            'romsey',
            'lancefield',
            'kinglake',
            'kinglake west',
            'lara',
            'little river'
        ];
        const isRegional = distKm > 55.0 || regionalExceptions.includes(suburbName.toLowerCase());

        const stage2 = CAR_COMPETITIVENESS?.bySlug?.[slug] ?? null;

        const detail = {
            name: suburbName,
            slug,
            score: Math.round(result.score),
            scoreExact: Math.round(result.score * 100) / 100,
            band: scoreBand,
            breakdown: {
                frequency: Math.round(result.breakdown.frequency),
                coverage: Math.round(result.breakdown.coverage),
                reliability: Math.round(result.breakdown.reliability),
            },
            viableCount: result.viableCount,
            bestScore: Math.round(result.bestScore),
            medianWaitMinutes: result.medianWaitMinutes,
            stopCount: result.stopCount,
            modeNoun,
            verdict,
            verdictInputs: verdictInputs ?? null,
            centroid: { lat: +centroid.lat.toFixed(5), lon: +centroid.lon.toFixed(5) },
            isRegional,
            scoreMethod: result.scoreMethod,
            boundary,
            gridCells: gridCellSummary,
            stops: stopList,
            carCompetitiveness: stage2?.carCompetitiveness ?? null,
            accessibility: stage2?.accessibility ?? null,
            note: SUBURB_NOTES[slug] ?? null,
        };

        fs.writeFileSync(path.join(OUT_SUBURBS, `${slug}.json`), JSON.stringify(detail));
        index.push({
            name: suburbName,
            slug,
            lat: detail.centroid.lat,
            lon: detail.centroid.lon,
            score: detail.score,
            band: scoreBand,
            stopCount: result.stopCount,
            isRegional,
        });
    }

    // League table: worst 20 with enough stops to be meaningful.
    const worst20 = [...index]
        .filter(s => !s.isRegional && s.stopCount >= LEAGUE_TABLE_MIN_STOPS)
        .sort((a, b) => a.score - b.score)
        .slice(0, 20)
        .map(s => s.slug);

    const worst20Regional = [...index]
        .filter(s => s.isRegional && s.stopCount >= LEAGUE_TABLE_MIN_STOPS)
        .sort((a, b) => a.score - b.score)
        .slice(0, 20)
        .map(s => s.slug);

    // Tiles for address lookup, derived from the same tileIndex built
    // earlier for grid-cell lookups rather than re-scanning every stop.
    let maxTileBytes = 0;
    for (const [key, bucket] of tileIndex) {
        const rows = bucket.map(s => ({
            id: s.id,
            name: s.name,
            lat: +s.lat.toFixed(5),
            lon: +s.lon.toFixed(5),
            mode_id: s.mode_id,
            mode_name: s.mode_name,
            final_score: s.final_score,
            frequency_score: s.frequency_score,
            coverage_score: s.coverage_score,
            reliability_score: s.reliability_score,
            average_wait_time: s.average_wait_time,
            route_ids: s.route_ids,
        }));
        const body = JSON.stringify(rows);
        maxTileBytes = Math.max(maxTileBytes, body.length);
        fs.writeFileSync(path.join(OUT_TILES, `${key}.json`), body);
    }

    const suburbIndex = { suburbs: index, worst20, worst20Regional };

    const indexBody = JSON.stringify(suburbIndex);
    fs.writeFileSync(path.join(OUT_GENERATED, 'suburb-index.json'), indexBody);

    const planPath = path.join(DATA_DIR, 'network_plan.json');
    // /the-plan runs on separate population/POI/road datasets to the GTFS
    // pipeline above, so it needs its own fixture flag rather than reusing
    // the GTFS build's `fixture`. Missing entirely counts as not ready.
    const planFixture = !fs.existsSync(planPath)
        || JSON.parse(fs.readFileSync(planPath, 'utf8')).fixture !== false;

    const manifest = {
        fixture,
        planFixture,
        gtfsGeneratedAt: generatedAt,
        methodologyVersion,
        dataBuiltAt: new Date().toISOString(),
        dataVintageLabel: fixture
            ? 'SAMPLE DATA'
            : `PTV GTFS processed ${String(generatedAt ?? '').slice(0, 10)}`,
        stopCount: stops.length,
        suburbCount: index.length,
        unattributedCount,
        unattributedPct: Math.round(unattributedPct * 100) / 100,
        // Stage 2 (car competitiveness / cumulative accessibility) coverage --
        // honest count, not every suburb has this yet (see CAR_COMPETITIVENESS
        // read above). Null betaCalibrated flags the gravity-decay constant as
        // not yet fitted against real journey-to-work data.
        carCompetitivenessCoverageCount: CAR_COMPETITIVENESS ? Object.keys(CAR_COMPETITIVENESS.bySlug).length : 0,
        carCompetitivenessBetaCalibrated: CAR_COMPETITIVENESS?.betaCalibrated ?? null,
        carCompetitivenessCongestionAvailable: false, // see Stage 2 plan: no working DTP traffic API key yet
    };
    fs.writeFileSync(path.join(OUT_GENERATED, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`[build-data] scoring: ${gridScored} suburbs via grid+population (item 1), ${legacyScored} via legacy stop-mean (no real polygon or no populated cells)`);
    console.log(`[build-data] wrote ${index.length} suburbs, ${tileIndex.size} tiles (largest ${(maxTileBytes / 1024).toFixed(0)}KB), index ${(indexBody.length / 1024).toFixed(0)}KB`);
    if (indexBody.length > 120 * 1024) {
        console.warn('[build-data] suburb-index.json exceeds 120KB; consider trimming fields before bundling.');
    }
}

// Only run the build when this file is executed directly, not when another
// script (e.g. check-fixtures.mjs) imports it for a helper like `loadStops`.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
