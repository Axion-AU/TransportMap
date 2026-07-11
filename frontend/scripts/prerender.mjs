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
    ?? (manifest.fixture ? 'https://transportscore.example' : 'https://transportscore.fusionparty.org.au');
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
    const isNoindex = noindex || manifest.fixture;
    // When indexable: opt into extended snippets and large image previews for
    // Google AI Overviews and social sharing. When noindexed: standard block.
    const robots = isNoindex
        ? '<meta name="robots" content="noindex, nofollow" />'
        : '<meta name="robots" content="max-snippet:-1, max-image-preview:large" />';
    return [
        `<title>${esc(title)}</title>`,
        `<meta name="description" content="${esc(description)}" />`,
        `<meta name="author" content="Fusion Party Australia" />`,
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
        `<meta name="twitter:image:alt" content="${esc(title)}" />`,
        robots,
        extra,
    ].filter(Boolean).join('\n    ');
}

/** Serialise one or more schema.org objects as a JSON-LD script tag. */
function schemaTag(schemas) {
    if (!schemas || schemas.length === 0) return '';
    const data = schemas.length === 1 ? schemas[0] : schemas;
    return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
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

// Shared publisher node reused across schemas.
const fusionOrg = {
    '@type': 'Organization',
    name: 'Fusion Party Australia',
    url: 'https://www.fusionparty.org.au',
};

const routes = [];

routes.push({
    urlPath: '/',
    title: 'Transport Score | How good is public transport at your address?',
    description: 'Every Melbourne suburb scored 0 to 100 on public transport frequency, coverage, and reliability, straight from the PTV timetable data. Look up yours.',
    ogImage: 'default.png',
    extra: schemaTag([{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Transport Score',
        url: SITE_ORIGIN,
        description: 'Every Melbourne suburb scored 0 to 100 on public transport quality, from PTV timetable data.',
        publisher: fusionOrg,
        potentialAction: {
            '@type': 'SearchAction',
            target: {
                '@type': 'EntryPoint',
                urlTemplate: `${SITE_ORIGIN}/score/{search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
        },
    }]),
});

routes.push({
    urlPath: '/suburbs',
    // Broader keyword target than just "worst served": captures ranking/comparison queries.
    title: 'Melbourne Public Transport Rankings: Every Suburb Scored | Transport Score',
    description: 'Melbourne suburbs ranked by public transport score, computed from the PTV timetable data. See who gets left behind.',
    ogImage: 'suburbs.png',
    extra: schemaTag([{
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Melbourne Suburbs Ranked by Public Transport Score',
        description: 'All Melbourne suburbs ranked 0–100 by public transport quality, computed from PTV timetable data.',
        url: `${SITE_ORIGIN}/suburbs`,
        numberOfItems: suburbIndex.suburbs.length,
        itemListElement: (suburbIndex.worst20 ?? []).slice(0, 10).map((slug, i) => {
            const s = suburbIndex.suburbs.find(x => x.slug === slug);
            return {
                '@type': 'ListItem',
                position: i + 1,
                name: s ? `${s.name}: ${s.score}/100` : slug,
                url: `${SITE_ORIGIN}/score/${slug}`,
            };
        }),
    }]),
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
    // Captures "how is public transport measured/scored Melbourne" queries.
    title: 'How Melbourne Public Transport Is Scored: Methodology | Transport Score',
    description: 'The complete scoring formula: data vintage, weights, thresholds, limitations, and changelog. Every displayed number is reproducible from this page.',
    ogImage: 'default.png',
    extra: schemaTag([{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: 'How is the Transport Score calculated?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Each stop is scored 0–100 on two equally weighted keys: frequency (50%) and coverage (50%), then multiplied by penalties. Frequency measures how often services run across peak, off-peak, and weekend hours. Coverage measures how well the stop connects to the broader network. Stop scores are aggregated to suburb level using a weighted average.',
                },
            },
            {
                '@type': 'Question',
                name: 'Where does the Transport Score data come from?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: `All scores are derived from the Public Transport Victoria (PTV) GTFS schedule feed, published on Data Vic (data.vic.gov.au). The dataset covers all seven PTV sub-feeds: metro train, metro tram, metro bus, regional train, regional coach, regional bus, and SkyBus. The current build uses the ${manifest.dataVintageLabel} data vintage.`,
                },
            },
            {
                '@type': 'Question',
                name: 'What are the Transport Score bands?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Scores are grouped into five bands: 0–20 (Stranded), 20–40 (Struggling), 40–60 (Adequate), 60–80 (Connected), and 80–100 (Excellent). These thresholds are fixed and used consistently across all suburb pages, share images, and the league table.',
                },
            },
            {
                '@type': 'Question',
                name: 'Can I reproduce the Transport Score myself?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Yes. The complete scoring formula is published on the methodology page, including all weights, thresholds, and the representative day selection rule. The source data is the PTV GTFS feed from Data Vic. If you cannot reproduce a number from the published formulas, that is treated as a bug.',
                },
            },
            {
                '@type': 'Question',
                name: 'Which suburbs have the worst public transport in Melbourne?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'The worst-served suburbs are listed on the rankings page, sorted by Transport Score. Many are in outer growth corridors where urban expansion has outpaced public transport investment. Scores as low as 8–15 out of 100 are common in these areas.',
                },
            },
            {
                '@type': 'Question',
                name: 'Why does my suburb score seem low?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'Scores reflect what the published PTV timetable actually delivers, not subjective experience. Low scores most commonly reflect infrequent peak-hour headways (greater than 30 minutes), limited operating hours, or poor connections to the broader network. Every contributing factor is broken down on the suburb score page.',
                },
            },
            {
                '@type': 'Question',
                name: 'How often is the Transport Score data updated?',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: `Scores are recomputed each time PTV publishes a new GTFS feed to Data Vic. The current build uses the ${manifest.dataVintageLabel} data vintage. The methodology version and data vintage are shown in the footer of every page.`,
                },
            },
        ],
    }]),
});

routes.push({
    urlPath: '/result',
    title: 'Your result | Transport Score',
    description: 'Public transport score for the 800m around a point. Addresses never leave your browser.',
    ogImage: 'default.png',
    noindex: true,
});

// Map page: Leaflet is lazy-loaded client-side; Googlebot sees only a loading
// spinner in the prerendered HTML. noindex prevents wasting crawl budget on
// content-free pages: the map has no standalone keyword value anyway.
routes.push({
    urlPath: '/map',
    title: 'Map explorer | Transport Score',
    description: 'Every scored public transport stop in Melbourne on one map.',
    ogImage: 'default.png',
    noindex: true,
});

const networkPlanPath = path.resolve(__dirname, '../public/data/network_plan.json');
if (fs.existsSync(networkPlanPath)) {
    const plan = JSON.parse(fs.readFileSync(networkPlanPath, 'utf8'));
    routes.push({
        urlPath: '/the-plan',
        title: `The plan | Transport Score`,
        description: `A costed feeder bus network moving 400m transit coverage from ${plan.baseline_pct_within_400.toFixed(0)}% to ${plan.proposed_pct_within_400.toFixed(0)}%, net ${Math.round(plan.net_annual_cost).toLocaleString()} AUD a year.`,
        ogImage: 'the-plan.png',
        noindex: Boolean(plan.fixture),
        island: `<script type="application/json" id="network-plan-data">${JSON.stringify(plan).replace(/</g, '\\u003c')}</script>`,
    });
} else {
    console.warn('[prerender] network_plan.json missing; /the-plan will not be prerendered.');
}

const worstSlugs = new Set([...(suburbIndex.worst20 ?? []), ...(suburbIndex.worst20Regional ?? [])]);

for (const s of suburbIndex.suburbs) {
    const detailPath = path.resolve(__dirname, `../public/data/suburbs/${s.slug}.json`);
    const detail = JSON.parse(fs.readFileSync(detailPath, 'utf8'));
    const hasCustomOg = worstSlugs.has(s.slug);
    // Append data vintage to description: AI engines weight freshness signals.
    const vintageNote = ` Scored from ${manifest.dataVintageLabel} PTV timetable data.`;
    const description = detail.verdict.replace(/\.$/, '') + vintageNote;
    routes.push({
        urlPath: `/score/${s.slug}`,
        title: `${detail.name} scores ${detail.score}/100 for public transport | Transport Score`,
        description,
        ogImage: hasCustomOg ? `${s.slug}.png` : 'default.png',
        island: `<script type="application/json" id="suburb-data">${JSON.stringify(detail).replace(/</g, '\\u003c')}</script>`,
        extra: schemaTag([
            {
                '@context': 'https://schema.org',
                '@type': 'Dataset',
                name: `${detail.name} Public Transport Score`,
                description: detail.verdict,
                url: `${SITE_ORIGIN}/score/${s.slug}`,
                creator: fusionOrg,
                temporalCoverage: manifest.dataVintageLabel,
                spatialCoverage: {
                    '@type': 'Place',
                    name: `${detail.name}, Melbourne, Victoria, Australia`,
                },
                measurementTechnique: 'PTV GTFS timetable frequency, coverage, and reliability scoring (0–100 scale)',
                variableMeasured: 'Public transport service quality',
            },
            {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Transport Score', item: SITE_ORIGIN },
                    { '@type': 'ListItem', position: 2, name: 'All suburbs', item: `${SITE_ORIGIN}/suburbs` },
                    { '@type': 'ListItem', position: 3, name: detail.name, item: `${SITE_ORIGIN}/score/${s.slug}` },
                ],
            },
        ]),
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
// lastmod uses the build date from the manifest so Google recrawls
// when data is refreshed.
const buildDate = (manifest.dataBuiltAt ?? new Date().toISOString()).slice(0, 10);
if (manifest.fixture) {
    fs.writeFileSync(path.join(CLIENT_DIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
} else {
    const urls = routes
        .filter(r => !r.noindex)
        .map(r => `  <url><loc>${SITE_ORIGIN}${r.urlPath}</loc><lastmod>${buildDate}</lastmod></url>`)
        .join('\n');
    fs.writeFileSync(
        path.join(CLIENT_DIR, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
    fs.writeFileSync(path.join(CLIENT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
}

console.log(`[prerender] wrote ${count} pages (${suburbIndex.suburbs.length} suburb pages), sitemap ${manifest.fixture ? 'suppressed (fixture)' : 'written'}.`);
