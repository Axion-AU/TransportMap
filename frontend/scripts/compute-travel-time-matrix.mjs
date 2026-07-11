/**
 * Computes the Stage 2 methodology-refactor travel-time matrix
 * (docs/methodology_refactor.md items 2 & 7: cumulative accessibility +
 * car competitiveness) between every suburb centroid in
 * src/data/generated/suburb-index.json that falls inside the current OSM
 * extract's coverage.
 *
 * Orchestrates two Docker-based routing engines (neither needs a permanent
 * local Java/Python install, matching the "compute once, commit the small
 * derived output" pattern already used by fetch-locality-boundaries.mjs /
 * fetch-mesh-block-population.mjs):
 *   - car (free-flow only, see Peak-congested car_time status in the plan):
 *     osrm/osrm-backend, built from the OSM extract, queried via its
 *     /table service.
 *   - PT: this directory's own r5py image (frontend/scripts/r5py/), built
 *     from the OSM extract + the same GTFS feeds the Rust pipeline scores.
 *
 * Run manually (not part of `npm run build`) -- it needs Docker, takes
 * minutes to hours depending on coverage, and its output
 * (frontend/data-src/travel-time-matrix.json) is committed like every
 * other data-src/*.json in this pipeline.
 *
 * Coverage note: as of 2026-07-10 the full-Victoria OSM extract (clipped
 * from Geofabrik's Australia file) is still downloading in the background
 * (Geofabrik has no Victoria-only extract, and this session's connection to
 * it ran at ~88KB/s). This script currently defaults to the much smaller,
 * fast BBBike pre-built Melbourne.osm.pbf (~25-30km radius around the CBD)
 * so the pipeline can run today; pass --osm=<path> to point at the full
 * extract once it's ready. Suburbs outside the extract's bounding box are
 * skipped and reported, not silently dropped or approximated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DATA_SRC = path.resolve(__dirname, '../data-src');
const RAW_DIR = path.join(DATA_SRC, 'raw');
const OUTPUT_FILE = path.join(DATA_SRC, 'travel-time-matrix.json');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
}));

const OSM_PATH = args.osm ? path.resolve(args.osm) : path.join(RAW_DIR, 'melbourne-bbbike.osm.pbf');
// GTFS-BBox pairing: the bundled BBBike extract's real bbox (frontend/data-src/raw --
// confirmed via its .poly file this session); override with --bbox=minlon,minlat,maxlon,maxlat
// when using a different extract (e.g. the full clipped Victoria one).
const DEFAULT_BBOX = [144.68, -38.02, 145.30, -37.53];
const BBOX = args.bbox ? args.bbox.split(',').map(Number) : DEFAULT_BBOX;

// Representative date: deliberately NOT read verbatim from metro_train's
// entry in representative_dates.json -- see docs/methodology_refactor.md
// Stage 2 progress log. metro_train's median-picked date came out ~2 months
// in the future this session (a live instance of the known, unfixed
// median-drift risk); metro_bus's date (2026-07-08) is used instead, the
// nearest real Wednesday to today and already spot-verified safe in the
// Stage 1 Cobblebank investigation.
const REPR_DATE = args.reprDate || '2026-07-08';
const DEPARTURE_TIME = args.departureTime || '08:00';

const OSRM_MODES = [2, 3, 4]; // metro_train, metro_tram, metro_bus -- inner/middle network; extend once full-coverage extract covers regional_train/bus too.

function log(...msg) { console.log('[compute-travel-time-matrix]', ...msg); }

function sh(cmd, opts = {}) {
    log('$', cmd);
    return execSync(cmd, { stdio: 'inherit', ...opts });
}

/** Suburb centroids inside the extract's bbox. */
function loadOrigins() {
    const indexPath = path.join(REPO_ROOT, 'frontend/src/data/generated/suburb-index.json');
    const { suburbs } = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const [minLon, minLat, maxLon, maxLat] = BBOX;
    const inside = suburbs.filter(s => s.lon >= minLon && s.lon <= maxLon && s.lat >= minLat && s.lat <= maxLat);
    log(`${inside.length} of ${suburbs.length} suburbs fall inside the current OSM extract's bbox [${BBOX.join(', ')}].`);
    return inside;
}

/** Flat (non-nested) per-mode GTFS zips for r5py, dropping empty optional tables that make R5's strict GTFS parser fail. */
function prepareFlatGtfs() {
    const outDir = path.join(RAW_DIR, 'gtfs-flat');
    fs.mkdirSync(outDir, { recursive: true });
    const zipPaths = [];
    for (const mode of OSRM_MODES) {
        const srcDir = path.join(REPO_ROOT, 'gtfs', String(mode), 'google_transit');
        if (!fs.existsSync(srcDir)) { log(`  mode ${mode}: no GTFS dir, skipping`); continue; }
        const workDir = path.join(outDir, `mode_${mode}`);
        fs.rmSync(workDir, { recursive: true, force: true });
        fs.mkdirSync(workDir, { recursive: true });
        for (const f of fs.readdirSync(srcDir)) {
            if (!f.endsWith('.txt')) continue;
            const src = path.join(srcDir, f);
            if (['transfers.txt', 'pathways.txt', 'levels.txt'].includes(f)) {
                const lineCount = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).length;
                if (lineCount <= 1) { log(`  mode ${mode}: skipping empty ${f}`); continue; }
            }
            fs.copyFileSync(src, path.join(workDir, f));
        }
        const zipPath = path.join(outDir, `mode_${mode}.zip`);
        fs.rmSync(zipPath, { force: true });
        sh(`cd "${workDir}" && zip -qr "${zipPath}" .`);
        zipPaths.push(zipPath);
    }
    return zipPaths;
}

function runOsrmPipeline(origins) {
    const osrmBase = OSM_PATH.replace(/\.osm\.pbf$/, '.osrm');
    if (!fs.existsSync(osrmBase)) {
        log('Running osrm-extract/partition/customize (first run for this extract)...');
        const dataDir = path.dirname(OSM_PATH);
        const osmFile = path.basename(OSM_PATH);
        const osrmFile = path.basename(osrmBase);
        sh(`docker run --rm -v "${dataDir}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/${osmFile}`);
        sh(`docker run --rm -v "${dataDir}:/data" osrm/osrm-backend osrm-partition /data/${osrmFile}`);
        sh(`docker run --rm -v "${dataDir}:/data" osrm/osrm-backend osrm-customize /data/${osrmFile}`);
    } else {
        log('Reusing existing osrm-extract/partition/customize output.');
    }

    const containerName = 'transportmap-osrm-matrix';
    sh(`docker rm -f ${containerName} >/dev/null 2>&1 || true`, { shell: '/bin/bash' });
    sh(`docker run -d --name ${containerName} -p 5000:5000 -v "${path.dirname(OSM_PATH)}:/data" osrm/osrm-backend osrm-routed --algorithm mld --max-table-size 5000 /data/${path.basename(osrmBase)}`);
    // give it a moment to come up
    execSync('sleep 4');

    const coords = origins.map(o => `${o.lon},${o.lat}`).join(';');
    const url = `http://localhost:5000/table/v1/driving/${coords}?annotations=duration`;
    log(`Querying OSRM table service for ${origins.length}x${origins.length} pairs...`);
    const res = spawnSync('curl', ['-s', url], { maxBuffer: 1024 * 1024 * 200 });
    const body = JSON.parse(res.stdout.toString());
    sh(`docker rm -f ${containerName} >/dev/null 2>&1 || true`, { shell: '/bin/bash' });
    if (body.code !== 'Ok') throw new Error(`OSRM table request failed: ${body.code} ${body.message ?? ''}`);
    // durations are seconds -> minutes
    return body.durations.map(row => row.map(d => (d === null ? null : d / 60)));
}

function runR5pyPipeline(origins) {
    const workDir = path.join(RAW_DIR, 'r5py-run');
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(workDir, 'gtfs'), { recursive: true });
    fs.copyFileSync(OSM_PATH, path.join(workDir, 'osm.pbf'));
    for (const zip of prepareFlatGtfs()) {
        fs.copyFileSync(zip, path.join(workDir, 'gtfs', path.basename(zip)));
    }
    const csvLines = ['id,lat,lon', ...origins.map(o => `${o.slug},${o.lat},${o.lon}`)];
    fs.writeFileSync(path.join(workDir, 'origins.csv'), csvLines.join('\n'));

    log('Building r5py Docker image...');
    sh(`cd "${path.join(__dirname, 'r5py')}" && docker build -t transportmap-r5py .`);

    log(`Running r5py PT matrix for ${origins.length} suburbs (this can take a while for larger runs)...`);
    sh(`docker run --rm -v "${workDir}:/data" -e REPR_DATE=${REPR_DATE} -e DEPARTURE_TIME=${DEPARTURE_TIME} transportmap-r5py`);

    const pairs = JSON.parse(fs.readFileSync(path.join(workDir, 'pt-matrix.json'), 'utf8'));
    const indexBySlug = new Map(origins.map((o, i) => [o.slug, i]));
    const n = origins.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(null));
    for (const { from, to, travelTimeMinutes } of pairs) {
        const i = indexBySlug.get(from);
        const j = indexBySlug.get(to);
        if (i === undefined || j === undefined) continue;
        matrix[i][j] = travelTimeMinutes;
    }
    return matrix;
}

function main() {
    if (!fs.existsSync(OSM_PATH)) throw new Error(`OSM extract not found at ${OSM_PATH}. Run fetch-osm-extract.mjs first, or pass --osm=<path>.`);

    const origins = loadOrigins();
    if (origins.length === 0) throw new Error('No suburbs fall inside the given bbox -- check --bbox.');

    const carFreeFlowMinutes = runOsrmPipeline(origins);
    const ptMinutes = runR5pyPipeline(origins);

    const output = {
        generatedAt: new Date().toISOString(),
        osmExtract: path.basename(OSM_PATH),
        bbox: BBOX,
        representativeDate: REPR_DATE,
        departureTime: DEPARTURE_TIME,
        carCongestionSource: null, // deferred -- see "Peak-congested car_time source" in the Stage 2 plan; no working DTP API key yet.
        suburbs: origins.map(o => ({ slug: o.slug, name: o.name, lat: o.lat, lon: o.lon })),
        carFreeFlowMinutes,
        carCongestedMinutes: null,
        ptMinutes,
    };
    fs.mkdirSync(DATA_SRC, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
    log(`Wrote ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)}MB), ${origins.length} suburbs.`);
}

main();
