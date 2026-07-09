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
 * Suburb attribution: PTV stop names carry the suburb in trailing
 * parentheses ("Foo Rd/Bar St (Tarneit)"). Stations are mapped through
 * scripts/station-suburbs.json, then by their own name, then by the nearest
 * attributed stop within 1km. The QA gate fails a non-fixture build when
 * more than 5% of stops stay unattributed.
 *
 * Aggregation happens in src/lib/scoring.ts, the same module the browser
 * uses. Keep it that way: one formula, one methodology page.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suburbScore, band, LEAGUE_TABLE_MIN_STOPS, distanceMeters, VIABILITY_THRESHOLD } from '../src/lib/scoring.ts';
import { verdictFor, modeNounFor } from '../src/lib/verdict.ts';
import { geohashEncode } from '../src/lib/geo.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');
const OUT_SUBURBS = path.join(DATA_DIR, 'suburbs');
const OUT_TILES = path.join(DATA_DIR, 'tiles');
const OUT_GENERATED = path.resolve(__dirname, '../src/data/generated');

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

function loadStops() {
    let fixture = false;
    let generatedAt = null;
    let methodologyVersion = null;
    const stops = [];

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
    return { stops, fixture, generatedAt, methodologyVersion };
}

const PARENS_RE = /\(([^()]+)\)\s*$/;
const STATION_RE = /^(.*?)(?:\s+Railway)?\s+Station\b/i;

function attributeSuburbs(stops) {
    const attributed = new Map(); // stop index -> suburb name
    const unresolved = [];

    for (let i = 0; i < stops.length; i++) {
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
            continue;
        }
        unresolved.push(i);
    }

    // Nearest attributed stop within 1km.
    const attributedIdx = [...attributed.keys()];
    let rescued = 0;
    for (const i of unresolved) {
        let best = null;
        let bestDist = 1000;
        for (const j of attributedIdx) {
            const d = distanceMeters(stops[i].lat, stops[i].lon, stops[j].lat, stops[j].lon);
            if (d < bestDist) { bestDist = d; best = j; }
        }
        if (best !== null) {
            attributed.set(i, attributed.get(best));
            rescued++;
        }
    }

    const unattributedCount = stops.length - attributed.size;
    return { attributed, unattributedCount, rescued };
}

function main() {
    const { stops, fixture, generatedAt, methodologyVersion } = loadStops();
    console.log(`[build-data] loaded ${stops.length} stops (fixture: ${fixture})`);

    const { attributed, unattributedCount, rescued } = attributeSuburbs(stops);
    const unattributedPct = stops.length > 0 ? (unattributedCount / stops.length) * 100 : 0;
    console.log(`[build-data] attribution: ${attributed.size} attributed (${rescued} via nearest neighbour), ${unattributedCount} unattributed (${unattributedPct.toFixed(2)}%)`);

    if (!fixture && unattributedPct > 5) {
        console.error('[build-data] QA gate: more than 5% of stops have no suburb. Extend scripts/station-suburbs.json.');
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

    const index = [];
    const slugSeen = new Map();

    for (const [suburbName, suburbStops] of [...bySuburb.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        let slug = slugify(suburbName);
        if (!slug) continue;
        if (slugSeen.has(slug)) {
            slug = `${slug}-${slugSeen.get(slug) + 1}`;
        }
        slugSeen.set(slugify(suburbName), (slugSeen.get(slugify(suburbName)) ?? 0) + 1);

        const result = suburbScore(suburbStops);
        const scoreBand = band(result.score);
        const centroid = {
            lat: suburbStops.reduce((s, x) => s + x.lat, 0) / suburbStops.length,
            lon: suburbStops.reduce((s, x) => s + x.lon, 0) / suburbStops.length,
        };
        const viableModeIds = [...new Set(
            suburbStops.filter(s => s.final_score > VIABILITY_THRESHOLD).map(s => s.mode_id),
        )];
        const modeNoun = modeNounFor(viableModeIds.length > 0 ? viableModeIds : [...new Set(suburbStops.map(s => s.mode_id))]);
        const verdict = verdictFor(scoreBand, {
            medianWaitMinutes: result.medianWaitMinutes,
            modeNoun,
        });

        const topStops = [...suburbStops]
            .sort((a, b) => b.final_score - a.final_score)
            .slice(0, 5)
            .map(s => ({ name: s.name, mode_name: s.mode_name, final_score: Math.round(s.final_score) }));

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
            centroid: { lat: +centroid.lat.toFixed(5), lon: +centroid.lon.toFixed(5) },
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
        });
    }

    // League table: worst 20 with enough stops to be meaningful.
    const worst20 = [...index]
        .filter(s => s.stopCount >= LEAGUE_TABLE_MIN_STOPS)
        .sort((a, b) => a.score - b.score)
        .slice(0, 20)
        .map(s => s.slug);

    // Tiles for address lookup.
    const tiles = new Map();
    stops.forEach(s => {
        const key = geohashEncode(s.lat, s.lon);
        if (!tiles.has(key)) tiles.set(key, []);
        tiles.get(key).push({
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
        });
    });
    let maxTileBytes = 0;
    for (const [key, rows] of tiles) {
        const body = JSON.stringify(rows);
        maxTileBytes = Math.max(maxTileBytes, body.length);
        fs.writeFileSync(path.join(OUT_TILES, `${key}.json`), body);
    }

    const suburbIndex = { suburbs: index, worst20 };
    const indexBody = JSON.stringify(suburbIndex);
    fs.writeFileSync(path.join(OUT_GENERATED, 'suburb-index.json'), indexBody);

    const manifest = {
        fixture,
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
    };
    fs.writeFileSync(path.join(OUT_GENERATED, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`[build-data] wrote ${index.length} suburbs, ${tiles.size} tiles (largest ${(maxTileBytes / 1024).toFixed(0)}KB), index ${(indexBody.length / 1024).toFixed(0)}KB`);
    if (indexBody.length > 120 * 1024) {
        console.warn('[build-data] suburb-index.json exceeds 120KB; consider trimming fields before bundling.');
    }
}

main();
