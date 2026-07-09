/**
 * Post-build compliance gate. Non-negotiables, in order:
 *   1. Every built HTML page carries the exact authorisation line.
 *   2. Every suburb page's og:image exists and the OG manifest confirms
 *      the authorisation line was in its element tree.
 *   3. Every prerendered page has a title, description, and canonical.
 *   4. No hardcoded dollar figures in components or pages; prices live in
 *      src/config/anchors.json only.
 *   5. Fixture builds are marked: noindex on every page, sample banner in
 *      every page shell, robots.txt disallows all.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../dist/client');
const SRC = path.resolve(__dirname, '../src');

// The authorisation line is read from source so a bad build cannot vouch
// for itself with a different string.
const siteSource = fs.readFileSync(path.join(SRC, 'config/site.ts'), 'utf8');
const authMatch = siteSource.match(/authorisationLine:\s*'([^']+)'/);
if (!authMatch) {
    console.error('[check-compliance] could not find authorisationLine in src/config/site.ts');
    process.exit(1);
}
const AUTH_LINE = authMatch[1];

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/data/generated/manifest.json'), 'utf8'));

function* htmlFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* htmlFiles(full);
        else if (entry.name.endsWith('.html')) yield full;
    }
}

const failures = [];

if (!fs.existsSync(CLIENT_DIR)) {
    console.error('[check-compliance] dist/client missing; run the build first.');
    process.exit(1);
}

// 1, 3, 5: per-page checks.
for (const file of htmlFiles(CLIENT_DIR)) {
    const rel = path.relative(CLIENT_DIR, file);
    const html = fs.readFileSync(file, 'utf8');

    if (!html.includes(AUTH_LINE)) {
        failures.push(`${rel}: missing authorisation line`);
    }
    if (!/<title>[^<]+<\/title>/.test(html)) {
        failures.push(`${rel}: missing title`);
    }
    if (!html.includes('name="description"')) {
        failures.push(`${rel}: missing meta description`);
    }
    if (!html.includes('rel="canonical"')) {
        failures.push(`${rel}: missing canonical`);
    }
    if (manifest.fixture) {
        if (!html.includes('noindex')) failures.push(`${rel}: fixture build page without noindex`);
        if (!html.includes('data-sample-banner') && !html.includes('SAMPLE DATA')) {
            failures.push(`${rel}: fixture build page without sample banner`);
        }
    }
}

// 2: OG coverage for every suburb page.
const ogManifestPath = path.join(CLIENT_DIR, 'og/og-manifest.json');
if (!fs.existsSync(ogManifestPath)) {
    failures.push('og/og-manifest.json missing; run build:og');
} else {
    const ogManifest = JSON.parse(fs.readFileSync(ogManifestPath, 'utf8'));
    if (ogManifest.authorisationLine !== AUTH_LINE) {
        failures.push('og-manifest authorisation line does not match site config');
    }
    const covered = new Set(ogManifest.images.filter(i => i.authLineIncluded).map(i => i.file));
    const scoreDir = path.join(CLIENT_DIR, 'score');
    if (fs.existsSync(scoreDir)) {
        for (const slug of fs.readdirSync(scoreDir)) {
            if (!covered.has(`${slug}.png`)) {
                failures.push(`score/${slug}: no verified og image`);
            }
            if (!fs.existsSync(path.join(CLIENT_DIR, 'og', `${slug}.png`))) {
                failures.push(`score/${slug}: og/${slug}.png file missing`);
            }
            const html = fs.readFileSync(path.join(scoreDir, slug, 'index.html'), 'utf8');
            const og = html.match(/property="og:image" content="([^"]+)"/);
            if (!og || !og[1].endsWith(`/og/${slug}.png`)) {
                failures.push(`score/${slug}: og:image tag does not point at its image`);
            }
        }
    }

    const planDir = path.join(CLIENT_DIR, 'the-plan');
    if (fs.existsSync(planDir)) {
        if (!covered.has('the-plan.png')) {
            failures.push('the-plan: no verified og image');
        }
        if (!fs.existsSync(path.join(CLIENT_DIR, 'og', 'the-plan.png'))) {
            failures.push('the-plan: og/the-plan.png file missing');
        }
        const html = fs.readFileSync(path.join(planDir, 'index.html'), 'utf8');
        const og = html.match(/property="og:image" content="([^"]+)"/);
        if (!og || !og[1].endsWith('/og/the-plan.png')) {
            failures.push('the-plan: og:image tag does not point at its image');
        }
    }
}

// 4: hardcoded prices outside anchors.json.
function* sourceFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !['generated', 'data'].includes(entry.name)) yield* sourceFiles(full);
        else if (/\.(tsx?|json)$/.test(entry.name) && !full.endsWith('anchors.json')) yield full;
    }
}
for (const file of [...sourceFiles(path.join(SRC, 'components')), ...sourceFiles(path.join(SRC, 'pages')), ...sourceFiles(path.join(SRC, 'config'))]) {
    const text = fs.readFileSync(file, 'utf8');
    const m = text.match(/\$\d[\d,.]*/);
    if (m) {
        failures.push(`${path.relative(process.cwd(), file)}: hardcoded price ${m[0]} (move it to src/config/anchors.json)`);
    }
}

// 5: robots for fixture builds.
if (manifest.fixture) {
    const robots = fs.readFileSync(path.join(CLIENT_DIR, 'robots.txt'), 'utf8');
    if (!robots.includes('Disallow: /')) failures.push('fixture build robots.txt must disallow all');
    if (fs.existsSync(path.join(CLIENT_DIR, 'sitemap.xml'))) failures.push('fixture build must not ship a sitemap');
}

if (failures.length > 0) {
    console.error(`[check-compliance] ${failures.length} failure(s):`);
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
}
console.log(`[check-compliance] all pages carry "${AUTH_LINE}", OG coverage complete, no hardcoded prices.`);
