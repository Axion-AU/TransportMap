/**
 * Share image generation: satori (element tree to SVG) + resvg (SVG to
 * PNG). One image per suburb plus defaults, written to dist/client/og/.
 *
 * Compliance: the template throws without the exact authorisation line
 * from src/config/site.ts, the SVG output is checked for the line before
 * rasterising, and og-manifest.json records the result for the
 * check-compliance gate.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { ogTemplate, OG_WIDTH, OG_HEIGHT } from './og-template.mjs';
import { site } from '../src/config/site.ts';
import { BAND_COLORS } from '../src/lib/scoring.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../dist/client');
const OG_DIR = path.join(CLIENT_DIR, 'og');
const GENERATED = path.resolve(__dirname, '../src/data/generated');

const manifest = JSON.parse(fs.readFileSync(path.join(GENERATED, 'manifest.json'), 'utf8'));
const suburbIndex = JSON.parse(fs.readFileSync(path.join(GENERATED, 'suburb-index.json'), 'utf8'));

const fontFile = (pkg, file) =>
    fs.readFileSync(path.resolve(__dirname, `../node_modules/@fontsource/${pkg}/files/${file}`));

const fonts = [
    { name: 'Barlow', data: fontFile('barlow', 'barlow-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Barlow', data: fontFile('barlow', 'barlow-latin-600-normal.woff'), weight: 600, style: 'normal' },
    { name: 'Barlow Condensed', data: fontFile('barlow-condensed', 'barlow-condensed-latin-900-normal.woff'), weight: 900, style: 'normal' },
    { name: 'Space Mono', data: fontFile('space-mono', 'space-mono-latin-700-normal.woff'), weight: 700, style: 'normal' },
];

const siteLabel = new URL(site.origin).host;

// Load the official logo as a base64 data URL so satori can render it.
const logoSvgPath = path.resolve(__dirname, '../public/solo-mono-white.svg');
const logoDataUrl = `data:image/svg+xml;base64,${fs.readFileSync(logoSvgPath).toString('base64')}`;

/** Walk a satori element tree and collect every text node. */
function treeText(node) {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(treeText).join(' ');
    return treeText(node.props?.children);
}

async function renderPng(props, outFile) {
    const tree = ogTemplate({ ...props, expectedAuthLine: site.authorisationLine, authLine: site.authorisationLine, fixture: manifest.fixture, siteLabel, logoDataUrl });
    // Belt and braces: satori outputs glyph paths, so verify the line in
    // the element tree that produces the pixels.
    if (!treeText(tree).includes(site.authorisationLine)) {
        throw new Error(`OG compliance failure: authorisation text missing from element tree for ${outFile}`);
    }
    const svg = await satori(tree, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
    fs.writeFileSync(path.join(OG_DIR, outFile), png);
}

fs.mkdirSync(OG_DIR, { recursive: true });

const entries = [];
const jobs = [];

jobs.push({
    file: 'default.png',
    props: {
        heading: 'How good is public transport at your address?',
        score: null,
        scoreColor: '#D428D4',
        verdict: 'Every Melbourne suburb scored 0 to 100 from the PTV timetable data.',
    },
});
jobs.push({
    file: 'suburbs.png',
    props: {
        heading: 'The 20 worst served suburbs in Melbourne',
        score: null,
        scoreColor: '#D428D4',
        verdict: 'Ranked from the timetable data. Every score is reproducible from the methodology page.',
    },
});

const networkPlanPath = path.resolve(__dirname, '../public/data/network_plan.json');
if (fs.existsSync(networkPlanPath)) {
    const plan = JSON.parse(fs.readFileSync(networkPlanPath, 'utf8'));
    const netCost = Math.round(plan.net_annual_cost).toLocaleString('en-AU');
    jobs.push({
        file: 'the-plan.png',
        props: {
            heading: 'We costed the fix',
            score: null,
            scoreColor: '#00DDB8',
            verdict: `400m transit coverage: ${plan.baseline_pct_within_400.toFixed(0)}% to ${plan.proposed_pct_within_400.toFixed(0)}%. Net cost $${netCost} a year.`,
        },
    });
}

const worstSlugs = new Set([...(suburbIndex.worst20 ?? []), ...(suburbIndex.worst20Regional ?? [])]);

for (const s of suburbIndex.suburbs) {
    if (!worstSlugs.has(s.slug)) continue;
    const detail = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../public/data/suburbs/${s.slug}.json`), 'utf8'));
    jobs.push({
        file: `${s.slug}.png`,
        slug: s.slug,
        props: {
            heading: detail.name,
            score: detail.score,
            scoreColor: BAND_COLORS[detail.band],
            verdict: detail.verdict,
        },
    });
}


const BATCH = 8;
for (let i = 0; i < jobs.length; i += BATCH) {
    await Promise.all(jobs.slice(i, i + BATCH).map(async job => {
        await renderPng(job.props, job.file);
        entries.push({ file: job.file, slug: job.slug ?? null, authLineIncluded: true });
    }));
}

fs.writeFileSync(path.join(OG_DIR, 'og-manifest.json'), JSON.stringify({
    authorisationLine: site.authorisationLine,
    fixture: manifest.fixture,
    images: entries,
}, null, 2));

console.log(`[generate-og] wrote ${entries.length} share images to ${OG_DIR} (fixture watermark: ${manifest.fixture}).`);
