# Route Scores — Spec and Change Sheet

Route-level scoring and per-route pages. Depends on: piece 2 (polygon attribution, for suburbs-served lists), piece 3 (continuous curves, reused directly), piece 4 (mesh block population, for catchment). Independent of the verdict refactor; can build in parallel.

## Problem statement / goal

Suburb pages answer "how is this place served". Route pages answer "how good is this route", which is what people actually search ("901 bus timetable", "is the 903 any good") and what gunzels identify with. ~400 indexable pages (metro bus, tram, train, SkyBus), each with unique computed numbers, bidirectionally cross-linked with suburb pages. Second pSEO surface on the same data.

## Design principle

A route score measures what the route itself does. It must NOT average its stops' `final_score`s: stop scores inherit coverage components (hub reachability, walk catchment, intermodal bonuses) from their surroundings, which the route didn't earn and can't fix. Every component below is computable from the route's own trips, stops, and geometry plus the mesh block population file.

## Canonicalisation pass (build first, everything keys off it)

GTFS route identity is fragmented: one public route number maps to multiple `route_id`s (direction variants, branches, night network versions, seasonal timetables).

1. **Canonical key**: `(normalised route_short_name, mode)`. Normalise by trimming, uppercasing, stripping zero-padding. Train lines key on `route_long_name` (no short name), normalised to the line name ("Mernda", "Belgrave").
2. **Merge** all `route_id`s sharing a key into one canonical route. Union their trips for frequency; union their stops for catchment and suburbs-served.
3. **Representative geometry**: the variant (by `shape_id`) with the greatest stop count; ties broken by shape length. Used for directness and the page map only — frequency and catchment always use the union.
4. **Night network**: PTV night routes carry distinct short names (e.g. `N` prefixes or 9xx night variants); where the short name differs they stay separate routes. Where night trips share the day route's short name they merge, and the existing night-bonus logic in the frequency key already credits them.
5. **Classification flags**, set per canonical route:
   - `school_special`: route name matches school patterns, or fewer than 6 trips per weekday, or serves fewer than 4 days per week. Gets a page, excluded from league tables.
   - `rail_replacement` / `special_event`: GTFS route name or trip headsign patterns. No page, no table.
   - `loop`: termini within 1km of each other. Exempt from directness (see below).
6. **QA gate**: print canonical route count per mode; fail the build if any short name maps to more than one canonical route within a mode (indicates a broken merge).

## The route score, 0–100

```
route_score = frequency * 0.45
            + catchment * 0.25
            + connectivity * 0.20
            + directness * 0.10
```

Weights are proposals, tuned via the fixture suite like everything else. All four components use piece 3's continuous curves — no new step tables.

**Frequency (0.45).** The existing frequency key, computed from the canonical route's own trips: headway (peak 0.6 / offpeak 0.25 / weekend 0.15), span, days. This is the one key that was route-shaped all along; the Rust code is reused, not rewritten.

**Catchment (0.25).** Residents within 400m of any of the route's stops, computed by counting unique mesh blocks whose centroid falls within 400m of any stop (unique mesh blocks, so overlapping stop buffers never double-count). Score is a saturating curve on population served, log-scaled so a 40k-catchment orbital and a 15k-catchment feeder can both score well for their role; raw `catchmentPopulation` and `populationPerServiceKm` are also published as page stats.

**Connectivity (0.20).** Count of distinct high-quality interchanges: train stations, plus other canonical routes whose own headway score is ≥ 60, sharing a stop within 150m (same radius as the existing intermodal bonus). Saturating curve on the count. Activity centres join this component when the regional-access work lands; the curve gains a term, the component doesn't restructure.

**Directness (0.10).** Circuity ratio: representative shape length / straight-line distance between termini (cosine-corrected, same distance code as everywhere else). Curve: 100 at ratio ≤ 1.2, sliding to ~15 at ratio ≥ 2.5. `loop` routes are exempt: directness weight redistributes proportionally across the other three components, and the page states this ("orbital route, directness not scored") rather than silently scoring a loop at 0 or 100.

Bands: same five bands, same thresholds as suburbs. One vocabulary across the whole site.

## Route verdict lines

Same voice rules (`check-voice.mjs`), new template family in `verdicts.ts`. Route verdicts may quote the route's own headway freely — unlike suburb verdicts, the number genuinely is the route's. Binding-component logic mirrors `weakestDimension`: pick the clearly weakest of the four components (reuse `CLEAR_WEAKEST_GAP`), one template each, e.g. directness: "The {number} travels {circuity}km for every 1km of progress. Frequency isn't the problem, the routing is." Uniform-weak and per-band closers follow the suburb pattern.

## Overlapping corridors — stated limitation

Two hourly routes on one road give residents an effective 30-minute service; each route alone scores hourly. Correct for a route page (the page describes the route), and the suburb grid score already captures the combined effect for residents. Methodology page states this explicitly so it's a documented modelling choice, not a gotcha.

## Page schema and pSEO

- **URL**: `/route/{mode}-{slug}` (`/route/bus-901`, `/route/tram-96`, `/route/train-mernda`).
- **Stats block**: score + band, four component scores, headways (peak/offpeak/weekend), span, catchment population, population per service km, circuity, interchange count.
- **Suburbs served**: every suburb (from piece 2 attribution) containing ≥1 of the route's stops, listed with their suburb scores, linked. The reciprocal list (routes with scores) is added to suburb pages. This bidirectional linking is the pSEO flywheel and the genuinely useful feature.
- **Verdict line** per above.
- **Share image**: same generator pathway as suburb cards; number, band, one stat.
- **League tables**: worst 20 routes and best 20 routes per mode. Eligibility: not `school_special`, not `rail_replacement`, `catchmentPopulation ≥ 5,000`, ≥ 6 weekday trips. Without these filters the worst-20 is a list of school runs and flexi-routes, and the story dies with an easy DoT rebuttal.
- **Sitemap**: route URLs added to the generated sitemap alongside suburb pages.

## Change sheet

| # | File | Change |
|---|------|--------|
| 1 | `src/gtfs_processor/` (new `routes.rs` + wiring in `mod.rs`) | Canonicalisation pass; per-route frequency via existing scoring functions; trips/day, span, days, shape length, terminus coordinates, stop list, classification flags. Emits `routes.json` intermediate. |
| 2 | `frontend/scripts/build-data.mjs` | Consume `routes.json`: catchment population from `vic-mesh-block-population.json` (unique mesh blocks within 400m of any stop, reuse geohash tiles from `geo.ts`); connectivity from shared-stop analysis against other canonical routes; directness; compose `route_score`; suburbs-served from piece 2 attribution; write per-route detail JSON + `route-index.json`; append routes-with-scores to each suburb detail. |
| 3 | `frontend/src/lib/scoring.ts` | `routeScore(components)` as a pure, unit-testable function; band mapping reused. |
| 4 | `frontend/src/lib/verdicts.ts` | `routeVerdictFor(band, components, stats)` template family. |
| 5 | `frontend/src/types/data.ts` | `RouteDetail`, `RouteIndexEntry`; extend `SuburbDetail` with `routes: {slug, number, mode, score, band}[]`. |
| 6 | `frontend/src/pages/RoutePage.tsx` (new), route league table page (new or `LeagueTablePage.tsx` extension), `SuburbScorePage.tsx` (routes-served section), router + sitemap generation | Page layer. |
| 7 | `frontend/scripts/fixtures/route-fixtures.json` + `check-fixtures.mjs` | Floor/ceiling band fixtures plus eligibility assertions (seed set below). |
| 8 | `frontend/src/pages/Methodology.tsx` | New part: route score formula, canonicalisation, the four components, league table eligibility, overlapping-corridor limitation. Ships in the same release as the code, per CLAUDE.md. |
| 9 | `docs/methodology_refactor.md` + changelog | Record route scoring as a new methodology version entry. |

## Fixture seed set

- **train-mernda** (or any metro line): minBand `decent` — turn-up-and-go peak frequency must clear the bar or the frequency curve is miscalibrated.
- **bus-901 / bus-903** (SmartBus orbitals): minBand `patchy`, and `loop`/directness handling must not tank them — high circuity is their job; if orbitals land `stranded`, the directness weight or curve is wrong.
- **One known school special**: assert `school_special = true` and absent from every league table.
- **One hourly outer feeder** (pick from real data at build time): maxBand `poor`.
- **Canonicalisation invariants**: exactly one canonical route per short name per mode; no route with `catchmentPopulation < 5000` appears in any league table.

## Verification order

1. Canonicalisation diagnostic: full table of canonical routes per mode with merged `route_id` counts, eyeballed against known PTV route lists before any scoring runs.
2. Unit tests: `routeScore` composition, circuity (incl. loop exemption and weight redistribution), mesh-block catchment dedup on synthetic overlapping stops.
3. Full-network sweep: score distribution per mode printed; sanity anchors (metro trains near top, school specials flagged out, SmartBus mid-table). Tune weights/curves here, before fixtures lock.
4. Route fixtures + `check-voice.mjs` over all generated route verdicts.
5. Cross-link integrity check in `check-fixtures.mjs`: every route slug referenced on a suburb page resolves, and vice versa (dead internal links are a pSEO own-goal).
6. Methodology.tsx diff reviewed against shipped formulas in the same PR.

## Out of scope

- Effective combined-corridor frequency (documented limitation instead).
- Activity-centre connectivity term (lands with the regional access work).
- Regional routes (blocked on the same metro boundary decision as piece 2).
- Route-level reliability from real-time data (root cause #5's sibling).
- Per-stop pages (third pSEO surface, separate decision).