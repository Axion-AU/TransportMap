/**
 * Static prerender. Renders every route (including one page per suburb)
 * through the SSR bundle and writes crawlable HTML with per-page title,
 * description, canonical, and OG tags into dist/client. Suburb pages get
 * their data inlined as a JSON island so first paint needs zero fetches.
 *
 * Run after build:client, build:server, and build:og. Any render error
 * fails the build: a blank crawlable page is worse than no build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../dist/client');
const GENERATED = path.resolve(__dirname, '../src/data/generated');

const manifest = JSON.parse(fs.readFileSync(path.join(GENERATED, 'manifest.json'), 'utf8'));
const suburbIndex = JSON.parse(fs.readFileSync(path.join(GENERATED, 'suburb-index.json'), 'utf8'));

const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN
    ?? (manifest.fixture ? 'https://transportscore.example' : null);
if (!SITE_ORIGIN) {
    console.error('[prerender] VITE_SITE_ORIGIN must be set for a non-fixture build (absolute og:image and canonical URLs).');
    process.exit(1);
}

const { render } = await import(path.resolve(__dirname, '../dist/server/entry-server.js'));
const template = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
if (!template.includes('<!--app-head-->') || !template.includes('<!--app-html-->')) {
    console.error('[prerender] index.html is missing the app-head/app-html placeholders.');
    process.exit(1);
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function headFor({ title, description, urlPath, ogImage, noindex, extra = '' }) {
    const canonical = `${SITE_ORIGIN}${urlPath}`;
    const robots = noindex || manifest.fixture ? '<meta name="robots" content="noindex, nofollow" />' : '';
    return [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(description)}" />`,
        `<link rel="canonical" href="${canonical}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:site_name" content="Transport Score" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(description)}" />`,
        `<meta property="og:url" content="${canonical}" />`,
        `<meta property="og:image" content="${SITE_ORIGIN}/og/${ogImage}" />`,
        `<meta property="og:image:width" content="1200" />`,
        `<meta property="og:image:height" content="630" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        robots,
        extra,
    ].filter(Boolean).join('\n    ');
}

// Template already carries a <title> and description for the dev server;
// strip them so prerendered heads are the single source.
const baseTemplate = template
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta name="description"[^>]*\/>\s*/, '');

function writePage(urlPath, head, appHtml, island = '') {
    // Function replacers so $&/$$/$`/$' in generated copy or JSON islands
    // are inserted literally instead of being treated as replacement tokens.
    const html = baseTemplate
        .replace('<!--app-head-->', () => head + (island ? `\n    ${island}` : ''))
        .replace('<!--app-html-->', () => appHtml);
    const outDir = urlPath === '/' ? CLIENT_DIR : path.join(CLIENT_DIR, urlPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

const routes = [];

routes.push({
    urlPath: '/',
    title: 'Transport Score | How good is public transport at your address?',
    description: 'Every Melbourne suburb scored 0 to 100 on public transport frequency, coverage, and reliability, straight from the PTV timetable data. Look up yours.',
    ogImage: 'default.png',
});
routes.push({
    urlPath: '/suburbs',
    title: 'The 20 worst served suburbs in Melbourne | Transport Score',
    description: 'Melbourne suburbs ranked by public transport score, computed from the PTV timetable data. See who gets left behind.',
    ogImage: 'suburbs.png',
});
routes.push({
    urlPath: '/embed/suburbs',
    title: 'The 20 worst served suburbs in Melbourne',
    description: 'Embeddable league table of Melbourne public transport scores.',
    ogImage: 'suburbs.png',
    noindex: true,
});
routes.push({
    urlPath: '/methodology',
    title: 'Methodology | Transport Score',
    description: 'The complete scoring formula: data vintage, weights, thresholds, limitations, and changelog. Every displayed number is reproducible from this page.',
    ogImage: 'default.png',
});
routes.push({
    urlPath: '/result',
    title: 'Your result | Transport Score',
    description: 'Public transport score for the 800m around a point. Addresses never leave your browser.',
    ogImage: 'default.png',
    noindex: true,
});
routes.push({
    urlPath: '/map',
    title: 'Map explorer | Transport Score',
    description: 'Every scored public transport stop in Melbourne on one map.',
    ogImage: 'default.png',
});

for (const s of suburbIndex.suburbs) {
    const detailPath = path.resolve(__dirname, `../public/data/suburbs/${s.slug}.json`);
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    routes.push({
        urlPath: `/score/${s.slug}`,
        title: `${detail.name} scores ${detail.score}/100 for public transport | Transport Score`,
        description: detail.verdict,
        ogImage: `${s.slug}.png`,
        island: `<script type="application/json" id="suburb-data">${JSON.stringify(detail).replace(/</g, '\\u003c')}</script>`,
    });
}

let count = 0;
for (const route of routes) {
    let appHtml;
    try {
        appHtml = render(route.urlPath);
    } catch (err) {
        console.error(`[prerender] render failed for ${route.urlPath}:`, err);
        process.exit(1);
    }
    writePage(route.urlPath, headFor(route), appHtml, route.island ?? '');
    count++;
}

// 404 fallback: rendered through the router (no route matches) so the
// shell, banner, and authorisation footer are all present.
writePage('/404', headFor({
    urlPath: '/404',
    title: 'Not found | Transport Score',
    description: 'That page does not exist.',
    ogImage: 'default.png',
    noindex: true,
}), render('/this-page-does-not-exist'));
fs.copyFileSync(path.join(CLIENT_DIR, '404', 'index.html'), path.join(CLIENT_DIR, '404.html'));
fs.rmSync(path.join(CLIENT_DIR, '404'), { recursive: true });

// Sitemap and robots: suppressed entirely for fixture builds.
if (manifest.fixture) {
    fs.writeFileSync(path.join(CLIENT_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
} else {
    const urls = routes
        .filter(r => !r.noindex)
        .map(r => `  <url><loc>${SITE_ORIGIN}${r.urlPath}</loc></url>`)
        .join('\n');
    fs.writeFileSync(
        path.join(CLIENT_DIR, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
    fs.writeFileSync(path.join(CLIENT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
}

console.log(`[prerender] wrote ${count} pages (${suburbIndex.suburbs.length} suburb pages), sitemap ${manifest.fixture ? 'suppressed (fixture)' : 'written'}.`);
