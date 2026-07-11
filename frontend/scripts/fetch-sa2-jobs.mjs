/**
 * One-time fetch of real ABS 2021 Census place-of-work job counts for
 * Victoria, run manually and the result committed, not re-fetched at
 * build/CI time (same pattern as fetch-mesh-block-population.mjs /
 * fetch-locality-boundaries.mjs).
 *
 * Feeds the Stage 2 methodology-refactor work (car competitiveness /
 * cumulative accessibility, docs/methodology_refactor.md item 2 & 7):
 * jobs are one half of each destination suburb's gravity weight (the
 * other half is dwellings, already available per-cell from Stage 1's
 * grid work in build-data.mjs).
 *
 * CORRECTED FROM THE ORIGINAL PLAN: CLAUDE.md and the refactor doc assumed
 * "ABS DZN place-of-work data (free)". Checked directly against the ABS
 * 2021 Census product release guide before writing this script -- DZN
 * (Destination Zone) geography is NOT in the free CSV DataPacks; the
 * Working Population Profile DataPack only goes down to SA2 (DZN needs
 * TableBuilder, a different, more restricted product). SA2 is used here
 * instead -- it's suburb-scaled geography in metro Melbourne, a reasonable
 * (arguably better) match for suburb-to-suburb gravity weighting than
 * DZN's finer resolution.
 *
 * Two official ABS sources, joined by SA2 code:
 *   - Boundaries: SA2_2021_AUST_SHP_GDA2020.zip (digital boundary files,
 *     ASGS Edition 3, same product family as the mesh-block boundaries).
 *     Only each SA2's centroid is kept, not its polygon.
 *   - Jobs: the official 2021 Census Working Population Profile DataPack
 *     for SA2, Victoria (direct download from abs.gov.au, not a mirror).
 *     Table W01A/W01B ("POW_SA2" = place-of-work by SA2), column
 *     P_Tot_Tot = total employed persons whose place of work is in that
 *     SA2 -- i.e. total jobs located there.
 *
 * Output: data-src/vic-sa2-jobs.json, a flat array of
 * {code, name, lat, lon, jobs}.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import shapefile from 'shapefile';
import centerOfMass from '@turf/center-of-mass';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, '../data-src/vic-sa2-jobs.json');

const SHAPEFILE_ZIP_URL = 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/SA2_2021_AUST_SHP_GDA2020.zip';
const WPP_SA2_VIC_ZIP_URL = 'https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_WPP_SA2_for_VIC_short-header.zip';

const VIC_STATE_CODE21 = '2'; // SA2_2021_AUST_GDA2020.shp STE_CODE21 for Victoria

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

/** POW_SA2_CODE_2021 -> total jobs (P_Tot_Tot from W01A+W01B). */
function loadJobs(wppZipPath) {
    const extractDir = path.join(os.tmpdir(), 'wpp-sa2-vic-extracted');
    new AdmZip(wppZipPath).extractAllTo(extractDir, true);
    const dataDir = fs.readdirSync(extractDir).find(d => /Statistical Area 2/i.test(d));
    if (!dataDir) throw new Error(`Could not find the SA2 data folder inside ${wppZipPath}`);
    const csvDir = path.join(extractDir, dataDir);
    const w01a = fs.readFileSync(path.join(csvDir, '2021Census_W01A_VIC_POW_SA2.csv'), 'utf8').trim().split('\n');
    const w01b = fs.readFileSync(path.join(csvDir, '2021Census_W01B_VIC_POW_SA2.csv'), 'utf8').trim().split('\n');

    const bIdxByCode = new Map();
    const bHeader = w01b[0].split(',');
    const pTotTotIdx = bHeader.indexOf('P_Tot_Tot');
    if (pTotTotIdx === -1) throw new Error('P_Tot_Tot column not found in W01B -- ABS table layout may have changed.');
    for (let i = 1; i < w01b.length; i++) {
        const row = w01b[i].split(',');
        bIdxByCode.set(row[0], Number(row[pTotTotIdx]) || 0);
    }

    // W01A only used to confirm every W01B code also appears in W01A (sanity check the join key).
    const aCodes = new Set(w01a.slice(1).map(line => line.split(',')[0]));
    let missingFromA = 0;
    for (const code of bIdxByCode.keys()) if (!aCodes.has(code)) missingFromA++;
    if (missingFromA > 0) console.warn(`  ${missingFromA} SA2 codes in W01B not seen in W01A -- unexpected, but proceeding with W01B jobs figures.`);

    return bIdxByCode;
}

async function main() {
    const shpZipPath = await downloadToTemp(SHAPEFILE_ZIP_URL, 'sa2-2021-boundaries.zip');
    const wppZipPath = await downloadToTemp(WPP_SA2_VIC_ZIP_URL, 'wpp-sa2-vic.zip');

    console.log('Loading Victoria place-of-work job counts (W01A/W01B)...');
    const jobsByCode = loadJobs(wppZipPath);
    console.log(`  ${jobsByCode.size} Victorian SA2s with job counts.`);

    console.log('Extracting SA2 boundary shapefile...');
    const extractDir = path.join(os.tmpdir(), 'sa2-2021-extracted');
    new AdmZip(shpZipPath).extractAllTo(extractDir, true);
    const shpPath = path.join(extractDir, 'SA2_2021_AUST_GDA2020.shp');
    const dbfPath = path.join(extractDir, 'SA2_2021_AUST_GDA2020.dbf');

    console.log('Reading national SA2 boundaries, filtering to Victoria, joining to job counts...');
    const source = await shapefile.open(shpPath, dbfPath);
    const sa2s = [];
    let total = 0;
    let missingJobs = 0;
    let noGeometry = 0;
    let result;
    while (!(result = await source.read()).done) {
        total++;
        const feature = result.value;
        if (feature.properties.STE_CODE21 !== VIC_STATE_CODE21) continue;
        const code = feature.properties.SA2_CODE21;
        const jobs = jobsByCode.get(code);
        if (jobs === undefined) { missingJobs++; continue; }
        if (!feature.geometry || !feature.geometry.coordinates || feature.geometry.coordinates.length === 0) {
            noGeometry++;
            continue;
        }
        const centroid = centerOfMass(feature);
        const [lon, lat] = centroid.geometry.coordinates;
        sa2s.push({ code, name: feature.properties.SA2_NAME21, lat, lon, jobs });
    }
    console.log(`Scanned ${total} national SA2s. Victoria: ${sa2s.length} matched, ${missingJobs} without a jobs match (offshore/no-usual-address/migratory pseudo-codes), ${noGeometry} without usable geometry.`);

    const totalJobs = sa2s.reduce((sum, s) => sum + s.jobs, 0);
    console.log(`Total Victorian jobs by place of work (sum of matched SA2s): ${totalJobs.toLocaleString()}.`);

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(sa2s));
    console.log(`Wrote ${OUTPUT_FILE} (${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)}MB).`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
