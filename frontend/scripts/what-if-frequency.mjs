/**
 * Frequency what-if tool: estimates how much a car-competitiveness ratio
 * would improve if a given route's frequency changed (e.g. "2x frequency"),
 * without re-running the full r5py travel-time matrix per scenario.
 *
 * Fast analytical approximation, not a re-simulation -- explicitly the
 * cheaper of the two options CLAUDE.md's owner chose for this session
 * (2026-07-11). Limitations, stated plainly rather than hidden:
 *
 *   - Only adjusts wait time (half-headway convention, the same one
 *     src/lib/scoring.ts's catchmentScore already uses), not in-vehicle
 *     running time -- a real frequency increase doesn't change how long the
 *     vehicle takes to travel the route, just how long you wait for it.
 *   - "Affected" origin-destination pairs are approximated as pairs where
 *     BOTH the origin and destination suburb have at least one stop served
 *     by the target route -- a same-route-both-ends proxy for "this trip
 *     could plausibly use this route directly". Trips that would use the
 *     route for only part of a transfer journey are not adjusted, so this
 *     understates the real benefit for transfer-based trips. Stated on
 *     output, not hidden.
 *   - Does not re-run OSRM or r5py; car times are unchanged (a frequency
 *     change on a PT route has no effect on driving times, so this is exact
 *     for the denominator, only the numerator is approximated).
 *
 * Usage:
 *   node scripts/what-if-frequency.mjs --route=<route_id> --multiplier=2 [--origin=<slug>]
 * Omitting --origin reports the effect for every suburb with real coverage.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_SRC = path.resolve(__dirname, '../data-src');
const PUBLIC_DATA = path.resolve(__dirname, '../public/data');

const BETA_PER_MINUTE = 0.05; // must match compute-car-competitiveness.mjs

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
}));

const STOP_FILES = [
    'stops_metro_train.geojson', 'stops_metro_tram.geojson', 'stops_metro_bus.geojson',
    'stops_regional_train.geojson', 'stops_regional_coach.geojson', 'stops_regional_bus.geojson', 'stops_skybus.geojson',
];

function loadStopsForRoute(routeId) {
    const stops = [];
    for (const file of STOP_FILES) {
        const p = path.join(PUBLIC_DATA, file);
        if (!fs.existsSync(p)) continue;
        const { features } = JSON.parse(fs.readFileSync(p, 'utf8'));
        for (const f of features) {
            if (f.properties.route_ids?.includes(routeId)) {
                stops.push({
                    lat: f.geometry.coordinates[1],
                    lon: f.geometry.coordinates[0],
                    averageWaitMinutes: f.properties.average_wait_time,
                    name: f.properties.name,
                });
            }
        }
    }
    return stops;
}

/** Suburbs (from the travel-time matrix) with at least one stop near a route stop, within walk-catchment distance. */
function suburbsServedByRoute(matrixSuburbs, routeStops, radiusKm = 0.8) {
    const served = new Set();
    for (const s of matrixSuburbs) {
        for (const rs of routeStops) {
            const dLat = (rs.lat - s.lat) * 111;
            const dLon = (rs.lon - s.lon) * 111 * Math.cos(s.lat * Math.PI / 180);
            if (Math.sqrt(dLat * dLat + dLon * dLon) <= radiusKm) { served.add(s.slug); break; }
        }
    }
    return served;
}

function gravityRatio(i, n, weights, carMinutes, ptMinutes) {
    let weightedRatioSum = 0;
    let weightSum = 0;
    for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const car = carMinutes[i][j];
        const pt = ptMinutes[i][j];
        if (car === null || car === undefined || car <= 0 || pt === null || pt === undefined) continue;
        const w = weights[j] * Math.exp(-BETA_PER_MINUTE * car);
        weightedRatioSum += w * (pt / car);
        weightSum += w;
    }
    return weightSum === 0 ? null : weightedRatioSum / weightSum;
}

function main() {
    const routeId = args.route;
    const multiplier = Number(args.multiplier);
    if (!routeId || !multiplier || multiplier <= 0) {
        console.error('Usage: node scripts/what-if-frequency.mjs --route=<route_id> --multiplier=2 [--origin=<slug>]');
        process.exit(1);
    }

    const matrix = JSON.parse(fs.readFileSync(path.join(DATA_SRC, 'travel-time-matrix.json'), 'utf8'));
    const carComp = JSON.parse(fs.readFileSync(path.join(DATA_SRC, 'car-competitiveness.json'), 'utf8'));
    const { suburbs, carFreeFlowMinutes, ptMinutes } = matrix;
    const n = suburbs.length;

    const routeStops = loadStopsForRoute(routeId);
    if (routeStops.length === 0) {
        console.error(`No stops found for route '${routeId}' in the current stops_*.geojson files.`);
        process.exit(1);
    }
    const avgWait = routeStops.reduce((s, r) => s + (r.averageWaitMinutes ?? 0), 0) / routeStops.length;
    const servedSlugs = suburbsServedByRoute(suburbs, routeStops);
    console.log(`Route '${routeId}': ${routeStops.length} stops, ~${avgWait.toFixed(1)}min average wait today, serving ${servedSlugs.size} of ${n} matrix suburbs.`);

    // wait delta = old_wait - old_wait/multiplier, floored at a small minimum in-vehicle+walk residual so we never simulate a negative or zero travel time.
    const waitDeltaMinutes = avgWait * (1 - 1 / multiplier);
    console.log(`Estimated wait reduction: ${waitDeltaMinutes.toFixed(1)} min per affected trip (half-headway convention).`);

    const weights = suburbs.map(s => {
        const c = carComp.bySlug[s.slug];
        // reconstruct the same jobs+dwellings weight used to produce ratioFreeFlow isn't stored directly;
        // approximate by inverting the accessibility figure isn't reliable, so re-derive is out of scope for
        // this fast tool -- use accessibility.jobsWithin45MinPt as a proxy weight (real, but not identical
        // to the exact jobs+dwellings weight compute-car-competitiveness.mjs used).
        return c?.accessibility?.jobsWithin45MinPt ?? 0;
    });

    const adjustedPt = ptMinutes.map(row => [...row]);
    for (let i = 0; i < n; i++) {
        if (!servedSlugs.has(suburbs[i].slug)) continue;
        for (let j = 0; j < n; j++) {
            if (i === j || !servedSlugs.has(suburbs[j].slug)) continue;
            if (adjustedPt[i][j] === null) continue;
            adjustedPt[i][j] = Math.max(1, adjustedPt[i][j] - waitDeltaMinutes);
        }
    }

    // "before" is recomputed here with this script's own weight proxy (jobsWithin45MinPt),
    // NOT read from carComp.bySlug's stored ratioFreeFlow -- that value was computed with a
    // different (exact jobs+dwellings) weight scheme, and comparing across two different
    // weight schemes produces a spurious delta even for suburbs the route change doesn't
    // touch at all. Both sides of the comparison must use the same weights so the delta
    // isolates only the frequency change's effect. Absolute "before" values here will
    // therefore differ slightly from the site's published ratioFreeFlow; only the delta
    // (and only for suburbs actually served by the route) is meaningful from this tool.
    const origins = args.origin ? [args.origin] : suburbs.map(s => s.slug).filter(slug => servedSlugs.has(slug));
    console.log(`\n${'suburb'.padEnd(24)} before  after   delta`);
    for (const slug of origins) {
        const i = suburbs.findIndex(s => s.slug === slug);
        if (i === -1) continue;
        const before = gravityRatio(i, n, weights, carFreeFlowMinutes, ptMinutes);
        const after = gravityRatio(i, n, weights, carFreeFlowMinutes, adjustedPt);
        if (before === null || after === null) continue;
        console.log(`${suburbs[i].name.padEnd(24)} ${before.toFixed(2).padStart(6)}  ${after.toFixed(2).padStart(6)}  ${(after - before).toFixed(2).padStart(6)}`);
    }

    console.log('\nNote: this is a fast approximation (wait-time only, same-route-both-ends proxy for affected trips), not a re-simulation. See this script\'s header for stated limitations.');
}

main();
