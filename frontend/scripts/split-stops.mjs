import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');

const MODES = [
    'metro_train',
    'metro_tram',
    'metro_bus',
    'regional_train',
    'regional_coach',
    'regional_bus',
    'skybus'
];

const MAX_FEATURES_PER_SHARD = 5000;

console.log('[split-stops] starting stops sharding...');

const manifest = {};

for (const mode of MODES) {
    const originalFile = path.join(DATA_DIR, `stops_${mode}.geojson`);
    if (!fs.existsSync(originalFile)) {
        const shards = [];
        let part = 1;
        while (fs.existsSync(path.join(DATA_DIR, `stops_${mode}_part${part}.geojson`))) {
            shards.push(`/data/stops_${mode}_part${part}.geojson`);
            part++;
        }
        if (shards.length > 0) {
            manifest[mode] = shards;
            console.log(`[split-stops] using existing shards for ${mode}: ${shards.length} files`);
            continue;
        }
        
        manifest[mode] = [`/data/stops_${mode}.geojson`];
        continue;
    }

    const fileSizeMb = fs.statSync(originalFile).size / (1024 * 1024);
    if (fileSizeMb < 15) {
        console.log(`[split-stops] ${mode} is small (${fileSizeMb.toFixed(2)} MB), no sharding needed.`);
        manifest[mode] = [`/data/stops_${mode}.geojson`];
        let part = 1;
        while (fs.existsSync(path.join(DATA_DIR, `stops_${mode}_part${part}.geojson`))) {
            fs.unlinkSync(path.join(DATA_DIR, `stops_${mode}_part${part}.geojson`));
            part++;
        }
        continue;
    }

    console.log(`[split-stops] ${mode} is large (${fileSizeMb.toFixed(2)} MB), sharding...`);
    const geojson = JSON.parse(fs.readFileSync(originalFile, 'utf8'));
    const features = geojson.features || [];
    const totalFeatures = features.length;
    const shardCount = Math.ceil(totalFeatures / MAX_FEATURES_PER_SHARD);
    const shards = [];

    for (let i = 0; i < shardCount; i++) {
        const shardFeatures = features.slice(i * MAX_FEATURES_PER_SHARD, (i + 1) * MAX_FEATURES_PER_SHARD);
        const shardGeoJSON = {
            type: "FeatureCollection",
            crs: geojson.crs,
            features: shardFeatures
        };
        const shardPath = path.join(DATA_DIR, `stops_${mode}_part${i + 1}.geojson`);
        fs.writeFileSync(shardPath, JSON.stringify(shardGeoJSON));
        shards.push(`/data/stops_${mode}_part${i + 1}.geojson`);
    }

    manifest[mode] = shards;
    console.log(`[split-stops] split ${mode} into ${shardCount} shards`);

    fs.unlinkSync(originalFile);
    console.log(`[split-stops] deleted original ${originalFile}`);
}

fs.writeFileSync(path.join(DATA_DIR, 'stops_manifest.json'), JSON.stringify(manifest, null, 2));
console.log('[split-stops] wrote stops_manifest.json');
