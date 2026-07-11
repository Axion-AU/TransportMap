/**
 * Validation fixture suite (docs/methodology_refactor.md, "Validation, both
 * stages"). Two tiers:
 *
 *   Tier A (suburb-level): checks published suburb scores against
 *   fixtures/suburb-fixtures.json, only for suburbs whose current
 *   attribution isn't visibly fragmented.
 *
 *   Tier B (point-level): checks catchmentScore at real coordinates against
 *   fixtures/point-fixtures.json, for claims about a location that today's
 *   suburb attribution gets wrong or doesn't cover at all.
 *
 * Every fixture asserts a floor (minBand) or ceiling (maxBand), not an exact
 * band -- methodology changes are expected to move real scores, and this
 * suite exists to catch regressions past a cited real-world reference point,
 * not to freeze the current numbers. Every fixture carries a citation to a
 * real external source (VAGO audit, Infrastructure Victoria report, or
 * network topology) recorded in fixtures/*.json, not invented consensus.
 *
 * Skipped entirely on fixture (sample-data) builds: the assertions are
 * calibrated against real GTFS-derived scores and mean nothing against
 * gen-fixture.mjs's synthetic dataset.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catchmentScore, band, BAND_THRESHOLDS } from '../src/lib/scoring.ts';
import { loadStops } from './build-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.resolve(__dirname, '../src/data/generated');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// Worst-to-best band order, derived from the authoritative BAND_THRESHOLDS
// (declared best-to-worst) rather than hand-duplicated.
const BAND_ORDER = [...BAND_THRESHOLDS].reverse().map(t => t.band);
const rank = b => BAND_ORDER.indexOf(b);

function checkBand(label, actualBand, fixture, failures) {
    if (fixture.minBand && rank(actualBand) < rank(fixture.minBand)) {
        failures.push(`${label}: expected at least '${fixture.minBand}', got '${actualBand}' -- ${fixture.citation}`);
    }
    if (fixture.maxBand && rank(actualBand) > rank(fixture.maxBand)) {
        failures.push(`${label}: expected at most '${fixture.maxBand}', got '${actualBand}' -- ${fixture.citation}`);
    }
}

function main() {
    const manifestPath = path.join(GENERATED_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('[check-fixtures] manifest.json missing; run build:data first.');
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.fixture) {
        console.log('[check-fixtures] fixture (sample-data) build; skipping -- these assertions are calibrated against real data.');
        return;
    }

    const failures = [];

    // Tier A: suburb-level.
    const suburbFixtures = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'suburb-fixtures.json'), 'utf8'));
    const suburbIndex = JSON.parse(fs.readFileSync(path.join(GENERATED_DIR, 'suburb-index.json'), 'utf8'));
    const bySlug = new Map(suburbIndex.suburbs.map(s => [s.slug, s]));

    for (const fixture of suburbFixtures) {
        const suburb = bySlug.get(fixture.slug);
        if (!suburb) {
            failures.push(`suburb '${fixture.slug}': not found in suburb-index.json (expected to exist) -- ${fixture.citation}`);
            continue;
        }
        checkBand(`suburb '${fixture.slug}' (score ${suburb.score})`, suburb.band, fixture, failures);
    }

    // Tier B: point-level, via catchmentScore directly.
    const pointFixtures = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'point-fixtures.json'), 'utf8'));
    const { stops } = loadStops();

    for (const fixture of pointFixtures) {
        const result = catchmentScore(stops, fixture.lat, fixture.lon);
        const actualBand = band(result.score);
        checkBand(`point '${fixture.label}' (score ${result.score.toFixed(1)})`, actualBand, fixture, failures);
    }

    // Tier C: car competitiveness (Stage 2, docs/methodology_refactor.md items 2 & 7).
    // Ratio fixtures assert a floor (minRatio) or ceiling (maxRatio) on
    // ratioFreeFlow -- same floor/ceiling discipline as bands above, not an
    // exact match, since the gravity-decay constant isn't calibrated yet
    // (see the methodology page). Skipped for suburbs the matrix doesn't
    // cover yet, reported as skipped rather than silently passing.
    const carCompPath = path.join(FIXTURES_DIR, 'car-competitiveness-fixtures.json');
    let carCompChecked = 0;
    let carCompSkipped = 0;
    if (fs.existsSync(carCompPath)) {
        const carCompFixtures = JSON.parse(fs.readFileSync(carCompPath, 'utf8'));
        for (const fixture of carCompFixtures) {
            const detailPath = path.join(__dirname, '../public/data/suburbs', `${fixture.slug}.json`);
            if (!fs.existsSync(detailPath)) {
                failures.push(`car-competitiveness '${fixture.slug}': suburb detail not found -- ${fixture.citation}`);
                continue;
            }
            const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
            const ratio = detail.carCompetitiveness?.ratioFreeFlow;
            if (ratio === undefined || ratio === null) {
                carCompSkipped++;
                continue; // not covered by the travel-time matrix yet -- not a failure
            }
            if (fixture.minRatio !== undefined && ratio < fixture.minRatio) {
                failures.push(`car-competitiveness '${fixture.slug}' (ratio ${ratio}): expected at least ${fixture.minRatio} -- ${fixture.citation}`);
            }
            if (fixture.maxRatio !== undefined && ratio > fixture.maxRatio) {
                failures.push(`car-competitiveness '${fixture.slug}' (ratio ${ratio}): expected at most ${fixture.maxRatio} -- ${fixture.citation}`);
            }
            carCompChecked++;
        }
    }

    console.log(`[check-fixtures] checked ${suburbFixtures.length} suburb fixtures, ${pointFixtures.length} point fixtures, ${carCompChecked} car-competitiveness fixtures (${carCompSkipped} skipped, not yet covered by the travel-time matrix).`);

    if (failures.length > 0) {
        console.error(`[check-fixtures] ${failures.length} fixture(s) failed:`);
        for (const f of failures) console.error(`  - ${f}`);
        process.exit(1);
    }
    console.log('[check-fixtures] all fixtures passed.');
}

main();
