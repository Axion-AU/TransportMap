# Transport Score

A Fusion Party Australia campaign tool for the November 2026 Victorian election. Enter your suburb or address, see how your public transport actually performs on a 0 to 100 scale, share the result, and join the party that costed the fix.

The scoring engine rates every Melbourne public transport stop on frequency, coverage, and reliability from the PTV GTFS timetable data. Every number the site displays is reproducible from the published methodology page.

## Structure

- `src/` Rust GTFS processor. Reads the PTV GTFS feed, scores every stop, exports per-mode GeoJSON.
- `frontend/` Vite + React site: lookup funnel, per-suburb pages, league table, methodology, map explorer.

## Data pipeline (run before any release)

1. Download the PTV GTFS feed from Data Vic (<https://discover.data.vic.gov.au/dataset/gtfs-schedule>) and unzip it into `gtfs/` at the repo root so each mode sits at `gtfs/<mode_id>/google_transit/` (1 regional train, 2 metro train, 3 metro tram, 4 metro bus, 5 regional coach, 6 regional bus, 11 SkyBus).
2. Run the processor: `cargo run --release --bin process_gtfs`. It writes `frontend/public/data/stops_*.geojson`, `routes.json`, and `shapes.json`.
3. Build the site: `cd frontend && npm install && npm run build`. The build derives suburb aggregates, prerenders every suburb page, generates share images, and runs the compliance checks.

If the scored GeoJSON files are absent, the build generates a clearly labelled sample dataset so development can proceed. Sample builds show a banner on every page, mark every page `noindex`, and watermark every share image. Never deploy a sample build.

## Compliance gates

The build fails if any generated page or share image is missing the electoral authorisation line, or if any copy contains an em-dash or a negate-then-correct construction. See `frontend/scripts/check-voice.mjs` and `frontend/scripts/check-compliance.mjs`.

## Launch checklist

- [ ] Real GTFS data processed and committed to the deploy artifact (no sample banner anywhere)
- [ ] `VITE_SITE_ORIGIN` set to the production origin (share image URLs are absolute)
- [ ] `VITE_ANALYTICS_DOMAIN` set to the Plausible domain
- [ ] Join URL and membership price anchor confirmed in `frontend/src/config/`
- [ ] Authorisation line wording confirmed against current AEC/VEC requirements
- [ ] Official Fusion rings logo swapped in for the placeholder mark
- [ ] Spot check suburb attribution for 10 suburbs against the league table
