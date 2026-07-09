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
