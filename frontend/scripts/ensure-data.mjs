/**
 * Dev convenience: make sure derived data exists before `vite` starts.
 * Generates the labelled fixture when no scored GeoJSON is present, then
 * runs the derivation if its outputs are missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');
const GENERATED = path.resolve(__dirname, '../src/data/generated');

if (!fs.existsSync(path.join(DATA_DIR, 'stops_metro_train.geojson'))) {
    console.log('[ensure-data] no scored stop data found; generating SAMPLE fixture.');
    const { generateFixture } = await import('./gen-fixture.mjs');
    generateFixture();
}

if (!fs.existsSync(path.join(GENERATED, 'suburb-index.json')) || !fs.existsSync(path.join(GENERATED, 'manifest.json'))) {
    console.log('[ensure-data] deriving suburb data.');
    execFileSync('npx', ['tsx', path.join(__dirname, 'build-data.mjs')], { stdio: 'inherit' });
}

if (!fs.existsSync(path.join(DATA_DIR, 'shapes', 'manifest.json'))) {
    console.log('[ensure-data] sharding route line shapes.');
    execFileSync('npx', ['tsx', path.join(__dirname, 'split-shapes.mjs')], { stdio: 'inherit' });
}

if (!fs.existsSync(path.join(DATA_DIR, 'stops_manifest.json'))) {
    console.log('[ensure-data] sharding stops GeoJSONs.');
    execFileSync('npx', ['tsx', path.join(__dirname, 'split-stops.mjs')], { stdio: 'inherit' });
}


if (!fs.existsSync(path.join(DATA_DIR, 'population_grid.json'))
    || !fs.existsSync(path.join(DATA_DIR, 'poi.json'))
    || !fs.existsSync(path.join(DATA_DIR, 'road_corridors.json'))) {
    console.log('[ensure-data] no population/POI/road data found; generating SAMPLE fixture.');
    const { generateNetworkFixture } = await import('./gen-network-fixture.mjs');
    generateNetworkFixture();
}

if (!fs.existsSync(path.join(DATA_DIR, 'routes_cost.json'))) {
    console.log('[ensure-data] no route cost baseline found; regenerating stop fixture to produce one.');
    const { generateFixture } = await import('./gen-fixture.mjs');
    generateFixture();
}

if (!fs.existsSync(path.join(DATA_DIR, 'network_plan.json'))) {
    console.log('[ensure-data] designing the feeder network.');
    const repoRoot = path.resolve(__dirname, '../..');
    try {
        execFileSync('cargo', ['run', '--release', '--bin', 'design_network'], { cwd: repoRoot, stdio: 'inherit' });
    } catch (err) {
        console.warn('[ensure-data] cargo unavailable or design_network failed; writing a stub network_plan.json instead.', err.message);
        const { generateNetworkPlanFixture } = await import('./gen-network-plan-fixture.mjs');
        generateNetworkPlanFixture();
    }
}
