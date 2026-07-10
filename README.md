# Transport Score

A Fusion Party Australia campaign tool for the November 2026 Victorian election. Enter your suburb or address, see how your public transport actually performs on a 0 to 100 scale, share the result, and join the party that costed the fix.

The scoring engine rates every Melbourne public transport stop on frequency, coverage, and reliability from the PTV GTFS timetable data. Every number the site displays is reproducible from the published methodology page.

## Structure

- `src/` Rust GTFS processor and feeder-network designer. Reads the PTV GTFS feed, scores every stop, exports per-mode GeoJSON; `src/network_design/` proposes a costed bus network connecting residents to high-quality transit.
- `frontend/` Vite + React site: lookup funnel, per-suburb pages, league table, the plan, methodology, map explorer.

## Data pipeline (run before any release)

1. **Obtain PTV GTFS Data**: Download the PTV GTFS feed zip from Data Vic (<https://discover.data.vic.gov.au/dataset/gtfs-schedule>).
   - **Automated extraction (Recommended)**: Place the downloaded `gtfs.zip` directly at the repository root (`/gtfs.zip`). The processor will automatically detect and extract it when run.
   - **Manual extraction fallback**: Alternatively, unzip it manually into the `gtfs/` folder at the repo root so each mode sits at `gtfs/<mode_id>/google_transit/` (1 regional train, 2 metro train, 3 metro tram, 4 metro bus, 5 regional coach, 6 regional bus, 11 SkyBus).
2. **Run the processor**: `cargo run --release --bin process_gtfs`. If `gtfs.zip` is found in the root, it extracts it first, then processes all modes and writes `frontend/public/data/stops_*.geojson`, `routes.json`, `shapes.json`, and `routes_cost.json`.
3. Supply real population, points-of-interest, and road-corridor data at `frontend/public/data/population_grid.json`, `poi.json`, and `road_corridors.json` (see `frontend/scripts/gen-network-fixture.mjs` for the exact shape each file must match), then run `cargo run --release --bin design_network`. It writes `frontend/public/data/network_plan.json`, the costed feeder network shown at `/the-plan`.
4. Build the site: `cd frontend && npm install && npm run build`. The build derives suburb aggregates, shards the route-line geometry into per-mode files under 25MB, prerenders every page including one per suburb, generates share images, and runs the compliance checks. A freshly generated `shapes.json` is automatically promoted into `frontend/data-src/` and removed from the public dir once sharded.

If the scored GeoJSON files, or the population/POI/road-corridor files, are absent, the build generates a clearly labelled sample dataset so development can proceed (`frontend/scripts/gen-fixture.mjs`, `gen-network-fixture.mjs`). If `network_plan.json` is missing and no Rust toolchain is available to compute it, the build falls back to an illustrative stub. Sample and stub builds show a banner on every page, mark every page `noindex`, and watermark every share image. Never deploy a sample or stub build.

## Compliance gates

The build fails if any generated page or share image is missing the electoral authorisation line, or if any copy contains an em-dash or a negate-then-correct construction. See `frontend/scripts/check-voice.mjs` and `frontend/scripts/check-compliance.mjs`.

## Deploying

`dist/client` is a plain static site (every page is prerendered HTML with client-side hydration) and runs on any static host. For Cloudflare Workers specifically, see `frontend/README.md`'s "Deploy to Cloudflare Workers" section: `cd frontend && npm run deploy:workers`.

## Launch checklist

- [ ] Real GTFS data processed and committed to the deploy artifact (no sample banner anywhere)
- [ ] Real population, POI, and road-corridor data supplied and `design_network` rerun (no sample banner on `/the-plan`)
- [ ] Bus operating cost anchor (`busOperatingCostPerKm` in `frontend/src/config/anchors.json`) confirmed against a primary DTP/PTV source, not the current blog-derived placeholder
- [ ] `VITE_SITE_ORIGIN` set to the production origin (share image URLs are absolute)
- [ ] `VITE_ANALYTICS_DOMAIN` set to the Plausible domain
- [ ] Join URL and membership price anchor confirmed in `frontend/src/config/`
- [ ] Authorisation line wording confirmed against current AEC/VEC requirements
- [ ] Official Fusion rings logo swapped in for the placeholder mark
- [ ] Spot check suburb attribution for 10 suburbs against the league table
