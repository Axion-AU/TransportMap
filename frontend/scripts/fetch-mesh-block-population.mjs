/**
 * One-time fetch of real ABS 2021 Census mesh block dwelling/population
 * counts for Victoria (methodology refactor item 1 -- grid + population
 * aggregation), run manually and the result committed, not re-fetched at
 * build/CI time (same pattern as fetch-suburbs.mjs / fetch-locality-boundaries.mjs).
 *
 * Two official ABS sources are joined by mesh block code:
 *   - Boundaries: MB_2021_AUST_SHP_GDA2020.zip (digital boundary files,
 *     ASGS Edition 3). National shapefile, ~368k mesh blocks; filtered to
 *     Victoria here and never carried past this script -- only each mesh
 *     block's centroid is kept, not its polygon, so downstream code never
 *     has to do polygon-in-polygon work for population weighting.
 *   - Counts: the official ABS 2021 Census Mesh Block dwelling/person
 *     counts Excel release (abs.gov.au), Victoria's data split across two
 *     worksheets ("Table 2", "Table 2.1") because the source format caps
 *     each sheet at 60,000 rows.
 *
 * Output: data-src/vic-mesh-block-population.json, a flat array of
 * {code, lat, lon, population, dwellings}. Dwellings are used as the
 * population-weighting field in build-data.mjs, not usual-resident
 * population -- see that script's own comment for why (2021 Census
 * undercounts the newest growth-corridor estates on population more than
 * on dwellings).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import XLSX from 'xlsx';
import shapefile from 'shapefile';
import centerOfMass from '@turf/center-of-mass';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, '../data-src/vic-mesh-block-population.json');

const SHAPEFILE_ZIP_URL = 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/MB_2021_AUST_SHP_GDA2020.zip';
const COUNTS_XLSX_URL = 'https://www.abs.gov.au/census/guide-census-data/mesh-block-counts/2021/Mesh%20Block%20Counts%2C%202021.xlsx';

const VIC_STATE_NAME = 'Victoria';
// Victoria's counts span two worksheets because the source format caps
// each sheet at 60,000 rows (see the ABS release's own explanatory notes).
const VIC_SHEETS = ['Table 2', 'Table 2.1'];

async function downloadToTemp(url, filename) {
    console.log(`Downloading ${url} ...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const dest = path.join(os.tmpdir(), filename);
    fs.writeFileSync(dest, buffer);
    console.log(`  wrote ${dest} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return dest;
}

/** MB_CODE_2021 -> { dwellings, population }, Victoria only. */
function loadCounts(xlsxPath) {
    const wb = XLSX.readFile(xlsxPath);
    const counts = new Map();
    const mbCodePattern = /^\d{9,11}$/;
    for (const sheetName of VIC_SHEETS) {
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 6 });
        for (const row of rows) {
            const [mbCode, , , dwelling, person] = row;
            if (typeof mbCode !== 'string' || !mbCodePattern.test(mbCode)) continue; // skips header/footer/notes rows
            counts.set(mbCode, {
                dwellings: Number.isFinite(dwelling) ? dwelling : 0,
                population: Number.isFinite(person) ? person : 0,
            });
        }
    }
    return counts;
}

async function main() {
    const shpZipPath = await downloadToTemp(SHAPEFILE_ZIP_URL, 'mb2021-boundaries.zip');
    const xlsxPath = await downloadToTemp(COUNTS_XLSX_URL, 'mb2021-counts.xlsx');

    console.log('Extracting shapefile...');
    const extractDir = path.join(os.tmpdir(), 'mb2021-extracted');
    new AdmZip(shpZipPath).extractAllTo(extractDir, true);
    const shpPath = path.join(extractDir, 'MB_2021_AUST_GDA2020.shp');
    const dbfPath = path.join(extractDir, 'MB_2021_AUST_GDA2020.dbf');

    console.log('Loading Victoria dwelling/population counts...');
    const counts = loadCounts(xlsxPath);
    console.log(`  ${counts.size} Victorian mesh blocks with counts.`);

    console.log('Reading national mesh block boundaries, filtering to Victoria...');
    const source = await shapefile.open(shpPath, dbfPath);
    const cells = [];
    let total = 0;
    let missingCounts = 0;
    let noGeometry = 0;
    let result;
    while (!(result = await source.read()).done) {
        total++;
        const feature = result.value;
        if (feature.properties.STE_NAME21 !== VIC_STATE_NAME) continue;
        const code = feature.properties.MB_CODE21;
        const counted = counts.get(code);
        if (!counted) { missingCounts++; continue; }
        // A handful of mesh blocks (shipping lanes, migratory/offshore
        // categories) have null or degenerate geometry -- no land area to
        // weight population onto, so skip rather than crash.
        if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length === 0) {
            noGeometry++;
            continue;
        }
        const centroid = centerOfMass(feature);
        const [lon, lat] = centroid.geometry.coordinates;
        cells.push({ code, lat, lon, population: counted.population, dwellings: counted.dwellings });
        if (cells.length % 20000 === 0) console.log(`  processed ${cells.length} Victorian mesh blocks...`);
    }
    console.log(`Scanned ${total} national mesh blocks. Victoria: ${cells.length} matched, ${missingCounts} without a counts match, ${noGeometry} without usable geometry.`);

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cells));
    console.log(`Wrote ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)}MB).`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
