/**
 * SAMPLE DATA generator.
 *
 * Produces the seven stops_*.geojson files in the exact shape the Rust GTFS
 * processor exports, for development and CI only. Every file carries the
 * foreign member `fixture: true`, which downstream tooling turns into a
 * site-wide sample banner, noindex on every page, watermarked share images,
 * and a suppressed sitemap. Never deploy a build made from this data.
 *
 * Deterministic: same seed, same output. Sub-scores are generated first and
 * the composite is computed with the exact formula from
 * src/gtfs_processor/scoring.rs, so sample pages still pass the
 * fact-check against /methodology.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');

// Deterministic PRNG (mulberry32).
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// name, approx centroid, quality 0..1, stop count, modes present.
// Quality drives every sub-score band; the spread mirrors the real pattern:
// inner suburbs score well, growth-corridor suburbs score badly.
const SUBURBS = [
    ['Fitzroy', -37.7983, 144.9788, 0.95, 24, ['tram', 'bus']],
    ['Carlton', -37.8001, 144.9674, 0.93, 22, ['tram', 'bus']],
    ['Richmond', -37.8182, 145.0000, 0.92, 28, ['train', 'tram', 'bus']],
    ['Brunswick', -37.7667, 144.9612, 0.88, 26, ['train', 'tram', 'bus']],
    ['South Yarra', -37.8396, 144.9926, 0.90, 24, ['train', 'tram', 'bus']],
    ['St Kilda', -37.8676, 144.9809, 0.82, 22, ['tram', 'bus']],
    ['Footscray', -37.8000, 144.9005, 0.85, 26, ['train', 'tram', 'bus']],
    ['Preston', -37.7420, 145.0000, 0.75, 22, ['train', 'tram', 'bus']],
    ['Coburg', -37.7443, 144.9640, 0.74, 20, ['train', 'tram', 'bus']],
    ['Box Hill', -37.8190, 145.1220, 0.78, 24, ['train', 'tram', 'bus']],
    ['Camberwell', -37.8320, 145.0580, 0.77, 22, ['train', 'tram', 'bus']],
    ['Glen Waverley', -37.8800, 145.1640, 0.62, 18, ['train', 'bus']],
    ['Sunshine', -37.7880, 144.8330, 0.68, 20, ['train', 'bus']],
    ['Dandenong', -37.9810, 145.2150, 0.60, 22, ['train', 'bus']],
    ['Frankston', -38.1420, 145.1230, 0.52, 20, ['train', 'bus']],
    ['Werribee', -37.9000, 144.6600, 0.42, 18, ['train', 'bus']],
    ['Hoppers Crossing', -37.8830, 144.7000, 0.38, 16, ['train', 'bus']],
    ['Epping', -37.6500, 145.0330, 0.45, 16, ['train', 'bus']],
    ['Mill Park', -37.6670, 145.0670, 0.30, 14, ['bus']],
    ['South Morang', -37.6500, 145.1000, 0.35, 14, ['train', 'bus']],
    ['Mernda', -37.6010, 145.0940, 0.28, 12, ['train', 'bus']],
    ['Doreen', -37.6010, 145.1440, 0.15, 10, ['bus']],
    ['Craigieburn', -37.6000, 144.9400, 0.32, 16, ['train', 'bus']],
    ['Mickleham', -37.5330, 144.9000, 0.08, 6, ['bus']],
    ['Donnybrook', -37.5440, 145.0030, 0.12, 6, ['train', 'bus']],
    ['Melton', -37.6830, 144.5850, 0.20, 14, ['train', 'bus']],
    ['Tarneit', -37.8320, 144.6940, 0.24, 14, ['train', 'bus']],
    ['Truganina', -37.8160, 144.7160, 0.14, 12, ['bus']],
    ['Point Cook', -37.9140, 144.7500, 0.16, 14, ['bus']],
    ['Wyndham Vale', -37.8920, 144.6300, 0.22, 10, ['train', 'bus']],
    ['Rowville', -37.9330, 145.2330, 0.18, 12, ['bus']],
    ['Wantirna South', -37.8830, 145.2170, 0.26, 12, ['bus']],
    ['Doncaster East', -37.7870, 145.1480, 0.34, 14, ['bus']],
    ['Templestowe', -37.7550, 145.1180, 0.20, 10, ['bus']],
    ['Clyde North', -38.1080, 145.3380, 0.10, 8, ['bus']],
    ['Cranbourne East', -38.1120, 145.3020, 0.18, 10, ['bus']],
    ['Officer', -38.0630, 145.4090, 0.14, 8, ['train', 'bus']],
    ['Pakenham', -38.0710, 145.4870, 0.30, 14, ['train', 'bus']],
    ['Berwick', -38.0300, 145.3460, 0.34, 14, ['train', 'bus']],
    ['Keilor East', -37.7440, 144.8620, 0.36, 12, ['bus']],
];

const STREETS = [
    'High St', 'Main Rd', 'Station St', 'Church St', 'Bell St', 'Union Rd',
    'Centre Rd', 'Springvale Rd', 'Plenty Rd', 'Ballarat Rd', 'Sydney Rd',
    'Burwood Hwy', 'Princes Hwy', 'Derrimut Rd', 'Sayers Rd', 'Taylors Rd',
];

// Headway score bands from src/gtfs_processor/scoring.rs (avg wait minutes).
function headwayScoreFor(wait) {
    if (wait <= 5) return 100;
    if (wait <= 10) return 95;
    if (wait <= 15) return 80;
    if (wait <= 20) return 65;
    if (wait <= 30) return 45;
    if (wait <= 40) return 30;
    if (wait <= 60) return 15;
    return 5;
}

function freqPenalty(headwayScore) {
    if (headwayScore < 20) return 0.5;
    if (headwayScore < 40) return 0.7;
    if (headwayScore < 60) return 0.85;
    return 1.0;
}

function catchPenalty(localCoverage) {
    if (localCoverage < 20) return 0.5;
    if (localCoverage < 40) return 0.7;
    if (localCoverage < 60) return 0.85;
    return 1.0;
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/**
 * Build one stop whose numbers obey the shipped formula chain:
 * frequency = headway*0.6 + span*0.3 + reliability*0.1
 * coverage  = min(100, network*0.7 + local*0.3 + intermodal)
 * base      = frequency*0.5 + coverage*0.5
 * final     = base * freqPenalty * catchPenalty
 */
function makeStop(rand, suburb, i, modeName, modeId, routePool) {
    const [name, cLat, cLon, quality] = suburb;
    const jitter = () => (rand() - 0.5) * 0.02;
    const q = clamp(quality + (rand() - 0.5) * 0.25, 0.02, 1);

    // Wait: quality 1 -> ~4 min, quality 0 -> ~65 min.
    const wait = Math.round(clamp(4 + (1 - q) * 61 + (rand() - 0.5) * 6, 2, 75));
    const headway_score = headwayScoreFor(wait);
    const service_span_score = Math.round(clamp(30 + q * 65 + (rand() - 0.5) * 10, 20, 100));
    const reliability_score = q > 0.65 ? 100 : q > 0.35 ? 80 : 50;
    const frequency_score = headway_score * 0.6 + service_span_score * 0.3 + reliability_score * 0.1;

    const network = Math.round(clamp(25 + q * 70 + (rand() - 0.5) * 12, 10, 100));
    const local = Math.round(clamp(15 + q * 80 + (rand() - 0.5) * 15, 5, 100));
    const intermodal = modeName.includes('train') && q > 0.6 ? Math.round(rand() * 15) : 0;
    const coverage_score = Math.min(100, network * 0.7 + local * 0.3 + intermodal);

    const base_score = frequency_score * 0.5 + coverage_score * 0.5;
    const fp = freqPenalty(headway_score);
    const cp = catchPenalty(local);
    const final_score = base_score * fp * cp;

    const isStation = modeName.includes('train');
    const street = STREETS[Math.floor(rand() * STREETS.length)];
    const cross = STREETS[Math.floor(rand() * STREETS.length)];
    const stopName = isStation
        ? `${name} Station`
        : `${street}/${cross} (${name})`;

    const nRoutes = 1 + Math.floor(rand() * (q > 0.7 ? 3 : 2));
    const route_ids = [];
    for (let r = 0; r < nRoutes; r++) {
        route_ids.push(routePool[Math.floor(rand() * routePool.length)]);
    }

    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [cLon + jitter(), cLat + jitter()] },
        properties: {
            id: `FIX-${modeId}-${name.replace(/\s+/g, '').toUpperCase()}-${i}`,
            name: stopName,
            mode_id: modeId,
            mode_name: modeName,
            frequency_score: round2(frequency_score),
            headway_score,
            service_span_score,
            reliability_score,
            coverage_score: round2(coverage_score),
            network_coverage_score: network,
            local_coverage_score: local,
            hub_reachability_score: Math.round(40 + q * 60),
            cbd_direct_score: q > 0.6 ? 100 : 0,
            orbital_directness_score: Math.round(20 + q * 60),
            connectivity_tier: q > 0.7 ? 'Grid' : 'Local',
            base_score: round2(base_score),
            final_score: round2(final_score),
            connectivity_score: round2(final_score),
            freq_penalty_multiplier: fp,
            catch_penalty_multiplier: cp,
            average_wait_time: wait,
            intermodal_bonus: intermodal,
            color: '#999999',
            route_ids: [...new Set(route_ids)],
        },
    };
}

function round2(v) { return Math.round(v * 100) / 100; }

const MODE_FILES = {
    metro_train: { file: 'stops_metro_train.geojson', modeId: 2, mode: 'train' },
    metro_tram: { file: 'stops_metro_tram.geojson', modeId: 3, mode: 'tram' },
    metro_bus: { file: 'stops_metro_bus.geojson', modeId: 4, mode: 'bus' },
    regional_train: { file: 'stops_regional_train.geojson', modeId: 1, mode: 'train' },
    regional_coach: { file: 'stops_regional_coach.geojson', modeId: 5, mode: 'bus' },
    regional_bus: { file: 'stops_regional_bus.geojson', modeId: 6, mode: 'bus' },
    skybus: { file: 'stops_skybus.geojson', modeId: 11, mode: 'bus' },
};

export function generateFixture() {
    const rand = mulberry32(20261124); // election day seed
    const features = { metro_train: [], metro_tram: [], metro_bus: [], regional_train: [], regional_coach: [], regional_bus: [], skybus: [] };

    for (const suburb of SUBURBS) {
        const [name, , , quality, stopCount, modes] = suburb;
        const routePool = [];
        const prefix = name.replace(/\s+/g, '').toUpperCase().slice(0, 6);
        for (let r = 0; r < 6; r++) routePool.push(`FIXR-${prefix}-${r}`);

        for (let i = 0; i < stopCount; i++) {
            let modeName;
            if (modes.includes('train') && i < Math.max(1, Math.round(stopCount * 0.12))) {
                modeName = 'metro_train';
            } else if (modes.includes('tram') && i < stopCount * 0.4) {
                modeName = 'metro_tram';
            } else {
                modeName = 'metro_bus';
            }
            const { modeId } = MODE_FILES[modeName];
            features[modeName].push(makeStop(rand, suburb, i, modeName, modeId, routePool));
        }
        void quality;
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const [key, { file }] of Object.entries(MODE_FILES)) {
        const fc = {
            type: 'FeatureCollection',
            fixture: true,
            version: '0.0.0-fixture',
            generated_at: '2026-07-09T00:00:00Z',
            methodology_version: '2025.12',
            features: features[key],
        };
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(fc));
    }
    const total = Object.values(features).reduce((n, f) => n + f.length, 0);
    console.log(`[gen-fixture] wrote ${total} SAMPLE stops across ${SUBURBS.length} suburbs into ${DATA_DIR}`);
    console.log('[gen-fixture] this is fixture data; the build will banner, noindex, and watermark everything.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateFixture();
}
