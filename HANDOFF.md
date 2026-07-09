# Handoff: Fusion Transport Score

Written 2026-07-09 for whoever (human or agent) picks this branch up next, especially on a machine that has the real PTV GTFS feed. This sandbox never did — that shaped several decisions below. Read this before touching anything.

## What this is

A Fusion Party Australia campaign site for the November 2026 Victorian election, on branch `claude/tie-fusion-rebrand-aozafw`, PR [#1](https://github.com/Axion-AU/TransportMap/pull/1) against `master`. The funnel: address or suburb in → a 0-100 public transport score out → share it → join Fusion. Built on top of a pre-existing Rust GTFS scoring engine ("Transport Inequality Engine") that was previously an internal Axion Ventures tool.

Two live surfaces:
- **The score funnel** (`/`, `/score/:slug`, `/result`, `/suburbs`, `/embed/suburbs`) — look up a suburb or address, get a score, share it, get a join CTA matched to how bad the score is.
- **The plan** (`/the-plan`) — an algorithmically generated, costed feeder bus network proposal, built by a Rust optimiser (`src/network_design/`), presented as "Fusion costed the fix."

Plus `/methodology` (every formula on the site, in public) and `/map` (the original stop-by-stop explorer, kept as a secondary deep-dive page).

## Repo layout

```
src/                    Rust: GTFS scoring engine + feeder-network designer
  gtfs_processor/       per-stop scoring (existing, ground truth for /methodology)
  gtfs_processor/cost.rs  NEW: per-route daily vehicle-km / trip-count aggregation
  network_design/        NEW: the bus-route generator + net cost model
  bin/process_gtfs.rs    run this first: GTFS -> scored stops + routes_cost.json
  bin/design_network.rs  run this second: population/POI/roads -> network_plan.json
frontend/               Vite + React (SSR-prerendered, static output)
  scripts/               the whole build-time data pipeline (see below)
  src/pages/              LandingPage, SuburbScorePage, ResultPage, LeagueTablePage,
                          EmbedLeagueTable, Methodology, MapPage, NetworkPlanPage
  src/config/             site.ts (authorisation line, join URL, UTM), anchors.json
                          (every price the site shows, sourced, dated), cta-copy.json
  wrangler.toml           Cloudflare Workers deploy (static assets, no server script)
HANDOFF.md               this file
README.md                data pipeline + launch checklist (read this too)
```

## The one thing that matters most: fixture vs real data

**This sandbox has never had real GTFS data**, and its network policy blocks every external data source (data.vic.gov.au, ABS, OSM/Overpass, Nominatim — all return 403). Every commit so far was built and verified against **generated sample data**, never real numbers. If your machine has the real GTFS feed, a lot of this becomes live for the first time. Concretely:

| Dataset | Fixture generator | Real source | Consumed by |
|---|---|---|---|
| Scored stops (`stops_*.geojson`) | `frontend/scripts/gen-fixture.mjs` | `cargo run --release --bin process_gtfs` reading `gtfs/<mode_id>/google_transit/*.txt` | almost everything |
| Route costs (`routes_cost.json`) | also `gen-fixture.mjs` (synthesized) | now real: `process_gtfs` computes it from trip counts × shape length (`src/gtfs_processor/cost.rs`) | `/the-plan`'s current-network cost baseline |
| Route shapes (`shapes.json` → sharded) | n/a, always real if present | `process_gtfs` (already worked before this session) | `/map` route lines |
| **Population grid, POI, road corridors** | `frontend/scripts/gen-network-fixture.mjs` | **no real pipeline exists yet** — nobody has ever built one, because this environment couldn't reach ABS/OSM either | `design_network` → `/the-plan` |

The last row is the important gap. Even with real GTFS on your machine, **`/the-plan` will still run on synthetic population/POI/road data** until someone supplies real files at `frontend/public/data/population_grid.json`, `poi.json`, `road_corridors.json` (exact shapes documented in `gen-network-fixture.mjs`'s output and read by `src/network_design/mod.rs::run`). That's real, uncompleted work, not a sandbox artifact.

### What to run locally, in order

```bash
# 1. Unzip real GTFS into gtfs/<mode_id>/google_transit/ (1 regional train, 2 metro
#    train, 3 metro tram, 4 metro bus, 5 regional coach, 6 regional bus, 11 SkyBus)
cargo run --release --bin process_gtfs
# writes frontend/public/data/{stops_*.geojson, routes.json, shapes.json, routes_cost.json}

# 2. Only once real population/POI/road files exist at frontend/public/data/:
cargo run --release --bin design_network
# writes frontend/public/data/network_plan.json

# 3.
cd frontend && npm install && npm run build
```

`npm run build`'s `prebuild` hook (`frontend/scripts/ensure-data.mjs`) auto-generates whatever's still missing as clearly-labelled sample data, so the build never hard-fails — but check the console output. If it says "generating SAMPLE fixture" for stops, your `gtfs/` directory wasn't found or didn't parse; if `design_network`'s cargo invocation fails, it falls back to a stub `network_plan.json`.

**How to tell what you're looking at**: every page shows a magenta "SAMPLE DATA" banner and gets `noindex` when `manifest.fixture` (stops) or `plan.fixture` (the network plan) is true. `frontend/src/data/generated/manifest.json` and `frontend/public/data/network_plan.json`'s `fixture`/`stub` fields are the ground truth. **Never deploy a build with either banner showing.**

## What's built, by area

1. **Rebrand** — Reclaim design system (deep purple/magenta, Barlow Condensed + Space Mono), no Axion identifiers anywhere, voice rules (no em-dashes, no "not just X but Y") enforced by `scripts/check-voice.mjs`.
2. **Lookup flow** — instant suburb autocomplete (bundled index, zero network), address mode geocodes client-side on explicit submit only (Nominatim usage policy), never stores or logs the address string.
3. **Shareability** — every suburb gets a static prerendered page + a generated 1200×630 OG image (satori + resvg) with the score, verdict, and authorisation line baked into the pixels. Worst-20 league table with an embeddable iframe variant.
4. **Conversion loop** — join CTA copy matched to score band, all prices sourced from `frontend/src/config/anchors.json` (never hardcoded — `check-compliance.mjs` greps for `$\d` outside that file and fails the build).
5. **Methodology** — every formula on the site transcribed from the actual Rust code, not aspirational copy. Rewritten once already because the pre-existing About/Methodology pages stated the wrong weights.
6. **Compliance gates** — `npm run check` fails the build if any page or OG image is missing the exact Victorian electoral authorisation line (`site.authorisationLine` in `src/config/site.ts`, single source of truth), or if fixture builds aren't clearly marked.
7. **Analytics** — Plausible adapter, event names only, suburb slug + band, never raw addresses.
8. **Cloudflare Workers deploy** — `wrangler.toml`, static-assets-only Worker. The one real engineering problem here: the committed `shapes.json` was 86MB (Workers cap is 25MiB/file), so it's now sharded by mode (`scripts/split-shapes.mjs`) into `public/data/shapes/*.json`, fetched on demand per selected stop instead of as one blob. Source lives at `frontend/data-src/shapes.json`, promoted automatically if the Rust processor drops a fresh one in `public/data/`.
9. **Feeder-network designer + `/the-plan`** — the newest piece, described below.

### The network designer, briefly

`src/network_design/`: classifies population coverage against today's high-quality stops (`final_score >= 70`), generates candidate bus routes along road corridors gated on proximity to real trunk transit, greedily picks routes toward 80%-within-400m / 100%-within-800m coverage (reporting an honest shortfall if the corridor set can't reach it, never fudging), and flags existing low-quality routes as redundant only when every one of their stops is now covered — netting their cost out. POIs (schools, hospitals, shopping centres) are a scoring bonus, never a hard requirement, per an explicit product decision. All of it is heavily unit tested (`cargo test`, 28 tests) with hand-computed expected values.

The bus operating cost anchor (`$6.50/km` in `anchors.json`) is **not a primary source** — it's the midpoint of a blog's analysis of state budget papers, flagged `TODO(confirm)`. Fix this before the plan's numbers go in front of anyone.

## Known gaps (also in `README.md`'s launch checklist)

- [ ] Real GTFS processed (this is what your local checkout should finally fix)
- [ ] Real population/POI/road-corridor data — **no pipeline exists for this yet**, it's synthetic no matter what GTFS you have
- [ ] Bus operating cost anchor needs a primary DTP/PTV source
- [ ] `VITE_SITE_ORIGIN`, `VITE_ANALYTICS_DOMAIN` env vars for a real deploy
- [ ] Join URL and membership price anchor are placeholders, need confirming with the membership team
- [ ] Official Fusion rings logo — currently a placeholder SVG approximation (`frontend/src/assets/fusion-rings.svg`)
- [ ] Authorisation line wording ("Authorised by K. Hunt, FUSION, Mansfield VIC") needs confirming as current
- [ ] Spot-check suburb attribution (stop-name parsing heuristic) against real data once available

## PR #1 / CodeRabbit

CodeRabbit is auto-reviewing every push. First pass (11 findings, all real, small) was fixed and confirmed resolved by CodeRabbit's own re-scan. It also flags a "Docstring Coverage 37%, threshold 80%" warning on every pass — that's CodeRabbit's own opinionated default, not anything this repo configures or enforces, and it runs against this codebase's deliberate sparse-comment style. Left unaddressed on purpose; don't let a fresh agent "fix" it by padding the code with boilerplate docstrings.

## Environment differences you'll hit locally that didn't apply here

- Nominatim geocoding will actually work in the browser (blocked here).
- `wrangler login` / `wrangler deploy` will actually reach Cloudflare (blocked here, only `--dry-run` was verified).
- You can actually download the PTV GTFS feed and any ABS/OSM data (all blocked here).
- `cargo run --bin process_gtfs` needs a `gtfs/` directory this sandbox never had — see `README.md` for the exact layout.
