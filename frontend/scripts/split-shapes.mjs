/**
 * Shards frontend/data-src/shapes.json (route line geometry) into per-mode
 * files under Cloudflare Workers' 25 MiB static asset limit, and keeps the
 * unsharded original out of the Vite public dir so it never ships whole.
 *
 * The route-line layer on /map is opt-in and secondary, so a missing
 * source here is a warning, not a build failure: the primary funnel does
 * not depend on it.
 *
 * Output: public/data/shapes/<mode>-<n>.json (each capped ~SHARD_CAP_BYTES)
 * and public/data/shapes/manifest.json ({ [shapeId]: "<mode>-<n>.json" }).
 * TransitLayer fetches the manifest once, then only the shard(s) a
 * selected stop's routes actually need.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA = path.resolve(__dirname, '../public/data');
const DATA_SRC = path.resolve(__dirname, '../data-src');
const OUT_DIR = path.join(PUBLIC_DATA, 'shapes');

const SHARD_CAP_BYTES = 18 * 1024 * 1024; // headroom under the 25MiB hard limit

const MODE_NAMES = {
    1: 'regional_train',
    2: 'metro_train',
    3: 'metro_tram',
    4: 'metro_bus',
    5: 'regional_coach',
    6: 'regional_bus',
    11: 'skybus',
};

function resolveShapesSource() {
    const freshFromProcessor = path.join(PUBLIC_DATA, 'shapes.json');
    const promoted = path.join(DATA_SRC, 'shapes.json');
    if (fs.existsSync(freshFromProcessor)) return { path: freshFromProcessor, promote: true };
    if (fs.existsSync(promoted)) return { path: promoted, promote: false };
    return null;
}

function main() {
    const routesPath = path.join(PUBLIC_DATA, 'routes.json');
    const source = resolveShapesSource();

    if (!source || !fs.existsSync(routesPath)) {
        console.warn('[split-shapes] no shapes.json / routes.json found; skipping. The /map route-line toggle will have nothing to load.');
        return;
    }

    const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
    const shapes = JSON.parse(fs.readFileSync(source.path, 'utf8'));

    const shapeMode = new Map();
    for (const route of Object.values(routes)) {
        const modeName = MODE_NAMES[route.mode_id] ?? 'unmapped';
        for (const shapeId of route.shape_ids ?? []) {
            shapeMode.set(shapeId, modeName);
        }
    }

    const byMode = new Map();
    for (const [shapeId, geometry] of Object.entries(shapes)) {
        const modeName = shapeMode.get(shapeId) ?? 'unmapped';
        if (!byMode.has(modeName)) byMode.set(modeName, []);
        byMode.get(modeName).push([shapeId, geometry]);
    }

    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const manifest = {};
    let shardCount = 0;
    let oversizedEntries = 0;

    for (const [modeName, entries] of byMode) {
        let shardIndex = 0;
        let current = {};
        let currentBytes = 2; // "{}"

        const flush = () => {
            if (Object.keys(current).length === 0) return;
            const file = `${modeName}-${shardIndex}.json`;
            fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(current));
            shardCount++;
            shardIndex++;
            current = {};
            currentBytes = 2;
        };

        for (const [shapeId, geometry] of entries) {
            const entryJson = JSON.stringify(geometry);
            const entryBytes = entryJson.length + shapeId.length + 4; // quotes, colon, comma

            if (entryBytes > SHARD_CAP_BYTES) {
                oversizedEntries++;
                console.warn(`[split-shapes] shape ${shapeId} (${modeName}) is ${(entryBytes / 1e6).toFixed(1)}MB alone; writing it as its own shard.`);
                flush();
                fs.writeFileSync(path.join(OUT_DIR, `${modeName}-${shardIndex}.json`), JSON.stringify({ [shapeId]: geometry }));
                manifest[shapeId] = `${modeName}-${shardIndex}.json`;
                shardIndex++;
                shardCount++;
                continue;
            }

            if (currentBytes + entryBytes > SHARD_CAP_BYTES) flush();

            current[shapeId] = geometry;
            currentBytes += entryBytes;
            manifest[shapeId] = `${modeName}-${shardIndex}.json`;
        }
        flush();
    }

    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));

    // Keep the huge unsharded file out of the Vite public dir; promote it
    // to the git-tracked source location if it was freshly generated there.
    if (source.promote) {
        fs.mkdirSync(DATA_SRC, { recursive: true });
        fs.copyFileSync(source.path, path.join(DATA_SRC, 'shapes.json'));
        fs.rmSync(source.path);
    }

    const totalShapes = Object.keys(manifest).length;
    console.log(`[split-shapes] wrote ${shardCount} shards (${totalShapes} shapes, ${byMode.size} modes) to ${OUT_DIR}${oversizedEntries ? `, ${oversizedEntries} oversized single-shape shard(s)` : ''}.`);
}

main();
