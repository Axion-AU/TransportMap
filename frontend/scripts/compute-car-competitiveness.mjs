/**
 * Derives the Stage 2 methodology-refactor suburb metrics (docs/
 * methodology_refactor.md items 2 & 7) from frontend/data-src/
 * travel-time-matrix.json (compute-travel-time-matrix.mjs) plus real ABS
 * jobs (data-src/vic-sa2-jobs.json) and dwellings (data-src/
 * vic-mesh-block-population.json) data:
 *
 *   - car competitiveness: a gravity-weighted composite pt_time/car_time
 *     ratio per suburb (Hansen-accessibility style), destination set =
 *     "gravity-weighted travel time to all suburbs" (methodology doc's
 *     option 2, not the lower-effort ~30-activity-centre option 1).
 *   - cumulative accessibility: jobs reachable within a 45-minute PT trip.
 *
 * Formula (per origin suburb i, over every destination j within the
 * travel-time matrix's coverage, j != i, where both pt and car times exist):
 *
 *   weight_j        = jobs_j + dwellings_j
 *   decay_ij        = exp(-BETA * car_time_ij)      -- nearer destinations count more
 *   ratio_ij        = pt_time_ij / car_time_ij       -- per docs/methodology_refactor.md item 7
 *   ratioFreeFlow_i = sum_j(weight_j * decay_ij * ratio_ij) / sum_j(weight_j * decay_ij)
 *
 * BETA is NOT calibrated against real journey-to-work distance decay (that's
 * the doc's own stretch validation goal -- regress against Census JTW mode
 * share, not yet done). A commonly-cited moderate work-trip decay rate is
 * used as a placeholder and stated as such on the methodology page -- this
 * script does not pretend it's precisely fitted.
 *
 * Suburb dwelling totals are summed here directly from mesh-block centroids
 * point-in-polygon-tested against each suburb's Vicmap locality boundary --
 * a narrower, self-contained version of the same test build-data.mjs's grid
 * step already does per-cell. Duplicated rather than restructuring the
 * pipeline's execution order (build-data.mjs needs this script's *output*,
 * so this script can't depend on build-data.mjs's suburb detail JSONs).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_SRC = path.resolve(__dirname, '../data-src');

const BETA_PER_MINUTE = 0.05; // see header comment -- uncalibrated placeholder
const ACCESSIBILITY_BUDGET_MINUTES = 45;

function loadJson(p, label) {
    if (!fs.existsSync(p)) {
        console.warn(`[compute-car-competitiveness] Missing ${label} at ${p}; run its fetch/compute script first.`);
        return null;
    }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function suburbDwellings(matrixSuburbs, localities, meshBlocks) {
    // For each matrix suburb, find its Vicmap locality polygon by name and
    // sum the dwellings of every mesh-block centroid that falls inside it.
    const byName = new Map(localities.features.map(f => [
        (f.properties.locality_name ?? f.properties.gazetted_locality_name ?? '').toLowerCase(),
        f,
    ]));
    const result = new Map();
    for (const s of matrixSuburbs) {
        const feature = byName.get(s.name.toLowerCase());
        if (!feature) { result.set(s.slug, 0); continue; }
        let total = 0;
        for (const mb of meshBlocks) {
            if (booleanPointInPolygon([mb.lon, mb.lat], feature)) total += mb.dwellings;
        }
        result.set(s.slug, total);
    }
    return result;
}

function suburbJobs(matrixSuburbs, sa2s) {
    // Assign each SA2's jobs to its single NEAREST matrix suburb (not every
    // suburb within some radius) -- SA2s don't share the suburb name index
    // build-data.mjs uses for localities, so this is a proximity match, but
    // it must be nearest-only. An earlier "sum every SA2 within 3km" version
    // double- and triple-counted the same real jobs across overlapping
    // nearby suburbs (297 suburbs packed into a ~30km-radius extract means
    // many centroids sit within 3km of each other) -- caught because the
    // resulting jobsWithin45MinPt exceeded Victoria's entire real jobs total
    // (3.03M, see fetch-sa2-jobs.mjs) by more than 2x. Nearest-only keeps
    // every SA2's jobs counted exactly once across the whole suburb set.
    const result = new Map(matrixSuburbs.map(s => [s.slug, 0]));
    for (const sa2 of sa2s) {
        let nearest = null;
        let nearestDistKm = Infinity;
        for (const s of matrixSuburbs) {
            const dLat = (sa2.lat - s.lat) * 111;
            const dLon = (sa2.lon - s.lon) * 111 * Math.cos(s.lat * Math.PI / 180);
            const distKm = Math.sqrt(dLat * dLat + dLon * dLon);
            if (distKm < nearestDistKm) { nearestDistKm = distKm; nearest = s; }
        }
        if (nearest && nearestDistKm <= 10) result.set(nearest.slug, (result.get(nearest.slug) ?? 0) + sa2.jobs);
    }
    return result;
}

function main() {
    const matrixPath = path.join(DATA_SRC, 'travel-time-matrix.json');
    const matrix = loadJson(matrixPath, 'travel-time-matrix.json');
    if (!matrix) { console.error('[compute-car-competitiveness] Cannot proceed without travel-time-matrix.json.'); process.exit(1); }

    const sa2s = loadJson(path.join(DATA_SRC, 'vic-sa2-jobs.json'), 'vic-sa2-jobs.json') ?? [];
    const meshBlocks = loadJson(path.join(DATA_SRC, 'vic-mesh-block-population.json'), 'vic-mesh-block-population.json') ?? [];
    const localities = loadJson(path.join(DATA_SRC, 'vic-localities.geojson'), 'vic-localities.geojson');

    const { suburbs, carFreeFlowMinutes, ptMinutes } = matrix;
    const n = suburbs.length;
    console.log(`[compute-car-competitiveness] ${n} suburbs, ${sa2s.length} SA2 job records, ${meshBlocks.length} mesh blocks.`);

    const dwellingsBySlug = localities ? suburbDwellings(suburbs, localities, meshBlocks) : new Map(suburbs.map(s => [s.slug, 0]));
    const jobsBySlug = suburbJobs(suburbs, sa2s);

    const weights = suburbs.map(s => (jobsBySlug.get(s.slug) ?? 0) + (dwellingsBySlug.get(s.slug) ?? 0));

    const results = {};
    let skippedNoData = 0;
    for (let i = 0; i < n; i++) {
        let weightedRatioSum = 0;
        let weightSum = 0;
        let bestExample = null; // nearest destination with real data, for share-card narrative
        for (let j = 0; j < n; j++) {
            if (i === j) continue;
            const car = carFreeFlowMinutes[i][j];
            const pt = ptMinutes[i][j];
            if (car === null || car === undefined || car <= 0 || pt === null || pt === undefined) continue;
            const decay = Math.exp(-BETA_PER_MINUTE * car);
            const w = weights[j] * decay;
            weightedRatioSum += w * (pt / car);
            weightSum += w;
            if (!bestExample || car < bestExample.carFreeFlowMinutes) {
                bestExample = { slug: suburbs[j].slug, name: suburbs[j].name, ptMinutes: pt, carFreeFlowMinutes: car };
            }
        }
        if (weightSum === 0) { skippedNoData++; continue; }
        const jobsWithin45 = suburbs.reduce((sum, s2, j) => {
            if (i === j) return sum;
            const pt = ptMinutes[i][j];
            if (pt !== null && pt !== undefined && pt <= ACCESSIBILITY_BUDGET_MINUTES) return sum + (jobsBySlug.get(s2.slug) ?? 0);
            return sum;
        }, 0);
        results[suburbs[i].slug] = {
            carCompetitiveness: {
                ratioFreeFlow: Math.round((weightedRatioSum / weightSum) * 100) / 100,
                ratioCongested: null, // deferred -- see Stage 2 plan's "Peak-congested car_time source" status
                exampleDestination: bestExample,
            },
            accessibility: { jobsWithin45MinPt: Math.round(jobsWithin45) },
        };
    }
    console.log(`[compute-car-competitiveness] Computed ${Object.keys(results).length} suburbs (${skippedNoData} skipped, no usable destination data).`);

    const outputPath = path.join(DATA_SRC, 'car-competitiveness.json');
    fs.writeFileSync(outputPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        betaPerMinute: BETA_PER_MINUTE,
        betaCalibrated: false,
        accessibilityBudgetMinutes: ACCESSIBILITY_BUDGET_MINUTES,
        bySlug: results,
    }));
    console.log(`[compute-car-competitiveness] Wrote ${outputPath}.`);
}

main();
