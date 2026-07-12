# TIE Methodology Refactor

Tracking document for the structural rework of the Transport Inequality Engine's scoring methodology, opened 10 July 2026. This supersedes the incremental patches logged in the earlier bug investigation log for the items it covers (see cross-references below); that log remains the record for pure bug fixes not touched by this refactor.

Changelog entries in this document are dated to the day. Given the pace of change this week, monthly or milestone-based changelog entries are no longer sufficient to keep the methodology page honest; anyone checking "how we calculated this, down to the last decimal" should be able to see what changed and when at a granular level.

## Why this document exists

Two rounds of adversarial review (gunzel community testing, then a deeper structural pass) surfaced that several of the issues logged individually in the bug tracker share root causes that a patch-by-patch approach won't fix. This document tracks the refactor as a coherent body of work rather than a list of unrelated tickets.

## Root causes identified (structural review, 10 July 2026)

### 1. Suburb score averages stops, not places
Averaging stop-level scores means stop density drives the suburb score, not actual service quality. A tram corridor with stops every 250m dumps many near-identical records into the average, so stop-dense suburbs get scored on bus/tram headways regardless of what a station further out actually offers. Two suburbs with identical real service but different stop spacing currently score differently. Additionally, the address-level formula (best_viable + diversity) and the suburb-level formula (plain mean) are different formulas entirely, producing inconsistent numbers for the same location depending on which page a user checks.

**Fix:** score places, not stops. Grid the suburb (250m cells or hexes), compute the address-style score per cell, average the cells, weighted by ABS mesh block population (free, published, available now). Fixes stop-density bias, corridor double-counting, the anchor-station problem (see #14 in the bug log), and the address/suburb inconsistency in one change, since both would use the same underlying formula.

**Supersedes:** #16 (suburb-attribution / zero-stop-suburb bug) is addressed as a side effect if grid cells are attributed via polygon rather than nearest-stop fallback (see item 6 below), but #16's Vicmap Admin fix should still land as its own change, since it's needed regardless of the grid work's timeline.

### 2. Coverage rewards connectivity, frequency barely penalises uselessness
Coverage is half the score, and 70% of coverage is network topology with CBD access as a flat binary. The frequency penalty only claws back 15% for headways between 40 and 60 minutes. Result: a suburb with a single hourly connection to the city can still score "decent," which doesn't match lived experience of that connection being effectively unusable.

**Fix (destination target):** replace hand-weighted keys with cumulative accessibility, how many jobs/POIs are reachable within a fixed travel time budget (e.g. 45 min), including wait time. This prices frequency into the measure automatically rather than needing a separately tuned penalty, and is an established methodology (tooling: r5py or OpenTripPlanner, taking GTFS + OSM street data). Also resolves the straight-line-distance approximation issue, since it routes on real streets.

**Superseded by item 7 below (car competitiveness):** the two are complementary, not competing, cumulative accessibility answers "how much can you reach," car competitiveness answers "how does that compare to driving." Both are on the roadmap; see sequencing.

### 3. Step tables create cliffs, defeat hand calibration
Headway bands, penalty tiers, diversity breakpoints, and the 50-point viable-route cutoff all create arbitrary boundary effects (a 49 contributes nothing, a 51 counts fully), and every "why is X one band above Y" complaint tempts a threshold nudge that shifts every suburb's score.

**Fix:** replace lookup tables with continuous curves (e.g. `100 * exp(-wait/k)` style functions), reducing the tunable surface from ~30 magic numbers to 2-3 parameters.

### 4. Walk catchment double-counts same-route stops
Multiple stops of the same tram/bus route within the catchment radius currently score as independent options. Fix: dedupe by route/corridor before counting toward catchment or diversity bonus.

### 5. Reliability sub-score is nearly constant, discriminates nothing
Days-of-service as a reliability proxy barely varies across the network and contributes little signal for 10% of the frequency key. Fold into span or drop.

### 6. Suburb attribution via stop-name parsing is fragile
Confirmed 7.54% failure rate. Fix: point-in-polygon against Vicmap Admin locality boundaries (free, authoritative, likely the same source underlying Google Maps' own suburb lines), replacing the current nearest-stop fallback entirely. Directly resolves #16 and the remaining #5 case (Addington/Burrumbeet coordinate collision).

## Car competitiveness (second structural review, 10 July 2026)

A new regional-access measure, proposed to replace the flat CBD-access binary:

```
competitiveness = pt_time / car_time
```

`pt_time`: door-to-door including initial wait (half the headway) plus transfer waits.
`car_time`: **decision pending, see Open Decisions** — free-flow vs typical/congested drive time.

Ratio bands (indicative, to become a continuous curve per item 3): under 1.5 is car-competitive, under 2 is tolerable, over 3 means the network has effectively declined to serve that trip.

**Destination set options, ascending effort:**
1. Plan Melbourne's designated activity centres (~30 published locations, e.g. Sunshine, Broadmeadows, Epping, Box Hill, Dandenong, Werribee). Politically durable, since it scores the network against the state's own planning framework. **Recommended starting point.**
2. Gravity-weighted travel time to all suburbs, weighted by jobs + population, distance-decayed.
3. Census journey-to-work DZN flows, weighting destinations by actual demonstrated travel demand. Gold standard; shows outer-suburban travel is largely orbital, not radial, an argument that supports existing party messaging.

**Build estimate:** ~30 destinations x 728 suburbs = ~22k cell matrix. r5py (GTFS + OSM) for PT times, OSRM (same OSM extract) for car times, both free, no API costs, runnable on existing infrastructure.

**Narrative value:** per-suburb, per-destination share cards ("Melton to Sunbury: 25 min by car, 94 min by public transport") are more visceral than an abstract score and function as self-contained viral assets in the same vein as the existing suburb-score cards.

**Warning:** outer-suburban ratios will likely be severe (3-4x common), meaning suburbs currently scoring "patchy" will drop to "stranded" once this lands. This is the formula becoming more honest, not a bug, but the league table will reshuffle hard. Requires a changelog entry and advance notice to whoever runs the Meat Grinder, since previously-approved takes referencing old scores will go stale the moment this ships.

## Open decisions

1. **car_time definition.** Free-flow time maximises the narrative gap but is the most attackable methodologically ("best-case driving vs worst-case transit isn't a fair comparison"). Typical/congested drive time is more defensible and still likely to be damning. **Recommend resolving this and stating the justification explicitly on the methodology page before car competitiveness ships**, given the brand's core claim is methodological rigor.
2. **Destination list for stage 1** (which activity centres, confirm against Melton's actual nearest set: Sunbury, Caroline Springs, Watergardens per the review).
3. **Sequencing**, addressed below.

## Sequencing (proposed)

**Stage 1** (~1 week estimate, on the existing engine): grid aggregation (item 1) + continuous curves (item 3) + polygon-based suburb attribution (item 6). Fixes most of what community testing surfaced. Ship with a changelog entry crediting the gunzel feedback.

**Stage 2** (parallel build, longer lead time): cumulative accessibility engine (item 2) + car competitiveness (destination set option 1 to start). Run in parallel against the validation fixture suite (below) until it passes, then cut over.

**Validation, both stages:**
- Build a fixture suite of 15-20 consensus suburbs (community + internal agreement on the correct band, e.g. Carlton = good, Tarneit interior = stranded). Becomes a CI regression test; any methodology change must keep fixtures in band or the build fails. Every future community complaint becomes a new fixture with a stated reason, not an ad hoc score tweak.
- Regress suburb scores against census journey-to-work PT mode share; publish the correlation (r²) on the methodology page as an external validity check nobody else in this space is showing.

## Changelog

**2026-07-10** — Document opened. Structural review identifies 6 root causes (stop-vs-place averaging, coverage/frequency imbalance, step-table cliffs, route double-counting, flat reliability signal, fragile suburb attribution). Car competitiveness measure proposed as CBD-access replacement. No code changes yet; stage 1 scoping in progress.

**2026-07-12** — Route scores shipped (`docs/route-scoring.md`, second pSEO surface alongside suburb pages: ~554 canonical routes across metro bus/tram/train/SkyBus, `/route/<mode>-<slug>` pages plus `/routes` league tables). New Rust pass (`src/gtfs_processor/routes.rs`) canonicalises `route_id`s sharing a `(normalised route_short_name, mode)` key (train lines key on `route_long_name` instead) and emits per-route frequency, span, geometry, and stop-union facts (`frontend/public/data/route_facts.json`) — no scores computed in Rust, matching the existing suburb-score split where composition lives in `frontend/src/lib/scoring.ts` (`routeScore`) and is consumed by `build-data.mjs`. `route_score = frequency*0.45 + catchment*0.25 + connectivity*0.20 + directness*0.10`; frequency reuses the existing curves computed from the route's own trips only (not inherited from its stops' surroundings, the explicit design principle in the spec); catchment is unique-mesh-block population within 400m of any stop; connectivity is a saturating curve on distinct train-station/high-headway-route interchanges within 150m; directness is a circuity-ratio curve, with loop routes (termini within 1km) exempt and their weight redistributed across the other three. League tables (worst/best 20 per mode) require catchment population ≥5,000 and ≥6 weekday trips, and exclude `school_special` and `rail_replacement_or_special` routes (the latter get no page at all). Verdicts (`routeVerdictFor` in `verdict.ts`) mirror the suburb weakest-dimension pattern with a 4-component version. Suburb pages and route pages cross-link bidirectionally (`SuburbDetail.routes`, `RouteDetail.suburbsServed`). Route pages also get a Leaflet map of the route's representative shape and stops (`RouteMap.tsx`), and a "why does public transport matter if I drive" persuasion section (`WhyPtMattersSection.tsx`) answering the recurring driver-first objection with the induced-demand/congestion argument plus Fusion's land-value-capture policy angle.
Two real bugs found and fixed during build against live GTFS data before this shipped: (1) `active_days` for a canonical route was reconstructed from a per-member trip *count* as if it were a set of day-of-week indices (`0..count`), collapsing real 7-day SmartBus orbitals (901, 903) to `active_days=1-2` and wrongly flagging them `school_special` — fixed by tracking real weekday/weekend *presence* (does the route run any trips in the sampled weekday window vs. weekend window) instead of unioning per-member GTFS calendar day-sets, which fragment unreliably across merged route_id variants; verified 901/903 now show `active_days=7`, `schoolSpecial=false`, and move from `decent` to `good`, matching the fixture seed set's "SmartBus orbitals: minBand patchy, high circuity must not tank them" expectation. (2) `span_hours` was never computed (hardcoded 0 in the JS layer) — now derived in Rust from the min/max departure hour across the route's own windowed departures, same discipline as `calculate_service_span_score`'s span-hours input. New fixtures: `frontend/scripts/fixtures/route-fixtures.json` (Mernda line, 901, 903, a confirmed real school-special (`bus-19`, 2 weekday trips), a confirmed real hourly outer feeder (`bus-838`)), checked by a new Tier E in `check-fixtures.mjs` (band floors/ceilings plus canonicalisation-uniqueness and league-table-eligibility invariants). Methodology page gets a matching Part 08 (plain English) / Part 10 (technical) section, shipped in the same change per CLAUDE.md's compliance rule.

**2026-07-10** — Stage 1, piece 1 shipped: `cargo test`/`npm test` now run in CI (previously wired to nothing); dead `scoring_tests.rs` removed; a 19-fixture validation suite (`frontend/scripts/fixtures/`, checked by `check-fixtures.mjs` in `npm run check`) checks real suburb/point scores against cited external sources (VAGO growth-areas audit, Infrastructure Victoria "Fast, frequent, fair") rather than invented consensus. Notably, verifying real data against the doc's own illustrative claim found "Tarneit interior = stranded" does not hold against real 2026 GTFS timetables (real interior points score patchy, low-to-mid 50s) — the fixture asserts the real value instead, and a genuinely real "stranded" example was found at Cranbourne East/Clyde (score 11).

**2026-07-10** — Stage 1, piece 2 (item 6) shipped: suburb attribution now uses real point-in-polygon against Vicmap Admin locality boundaries (`frontend/data-src/vic-localities.geojson`, fetched via `scripts/fetch-locality-boundaries.mjs`), scoped to the 657 localities within 70km of the Melbourne CBD (Greater Melbourne + commuter corridor); the previous name-parsing cascade remains, unchanged, for stops outside that scope. Unattributed rate dropped from 7.54% to 5.76%. Confirmed effects: `Carlton` regained its real ~44 stops (was a 1-stop fragment misattributed to Carlton North/Melbourne); `Banyule` (an LGA name, not a real Vicmap locality) disappeared from the league table; `Doreen`, `Wollert`, `Toolern Vale`, and `Strathtulloh` (a real, distinct Melton-area locality, not part of neighbouring Melton South) are real Vicmap localities but have zero stops scored inside their exact boundary today — not an attribution bug, but a real, more striking finding than this doc's original prediction that they'd simply gain a patchy/poor entry; `Melton` (town centre) similarly has zero stops today, with the area's real service captured under `Melton South` instead. Strathtulloh's zero-stops finding is independently confirmed by a real resident's account gathered this session (2.4km from the nearest bus stop, a 30-minute walk — well beyond catchmentScore's 800m radius). Suburb slugs changed as a direct, accepted (not redirected) consequence.

**2026-07-10** — Stage 1, piece 3 (item 3) shipped: `calculate_headway_score`, `calculate_service_span_score`'s hours/night-bonus components, `calculate_reliability_score`, and the shared frequency/catchment penalty multiplier now use continuous curves instead of step tables. Parameters fit against the old tables' breakpoints (tolerance-band unit tests, ±5 points for headway/penalty, wider for the service-span tail where a 2-parameter curve trades tail accuracy for a smooth mid-range fit — see `scoring.rs` test comments for the specific numbers). Verified against the full real-data pipeline and the piece 1 fixture suite: all 19 fixtures still pass after re-running `process_gtfs` with the new curves. One incidental, intentional side effect: `calculate_reliability_score` no longer flattens every active-day count below 5 into an identical flat 50 — days close to the 5-day anchor now score above the old flat value, days far from it score below, both a direct consequence of a smooth curve required to pass through two fixed points (7 days → 100, 5 days → 100·(5/7)^0.663 = 80, both exact). Root cause #5 (reliability barely discriminates) is *not* addressed by this piece — continuity was the only goal, per Stage 1 scope.

**Investigated same day**: a user-reported bug ("Metro Tunnel stations showing a frequency penalty despite genuine 100-180s peak / 5-10min off-peak frequency") was checked directly against real data after this piece's `process_gtfs` re-run (using freshly-uploaded GTFS): Arden, Parkville, Anzac, State Library, and Town Hall stations all now show `headway_score` ≈ 99 and `freq_penalty_multiplier` ≈ 0.998 (final scores 91-94, "good" band) — the reported bug does not reproduce against current data. Whether the fix was the curve replacement, the fresh GTFS upload, or both together wasn't isolated (not worth reverting either independently just to attribute credit); flagged here so a future session doesn't re-investigate from scratch. One fixture (`point-fixtures.json`'s Doreen entry) needed updating as a related, real consequence: a point 723m from Hawkstowe Railway Station (Mernda line) genuinely improved from poor to patchy once the same fresh data landed — Hawkstowe itself now scores 89.1, a real value, not a curve-fitting artifact.

**2026-07-10** — Stage 1, piece 4 (item 1) shipped: suburb scores are now a 250m grid over each suburb's real Vicmap polygon, each populated cell scored via the existing address-style formula (`aggregateStops`/`catchmentScore`) at its centre and averaged weighted by real ABS 2021 Census mesh block **dwelling** counts (not usual-resident population — see below), replacing the plain stop-mean (`typicalStopScore`, kept only as a fallback). Real data sourced this session: Vicmap's own MB_2021_AUST_SHP_GDA2020 boundary shapefile (national, 228MB zipped, filtered to Victoria's 88,736 mesh blocks) joined to the official ABS mesh block dwelling/population count Excel release by mesh block code — both fetched directly from abs.gov.au, not a third-party mirror, per the user's steer mid-session. Output committed as `frontend/data-src/vic-mesh-block-population.json` (flat centroid + counts, 8.8MB; full mesh-block polygons never enter the runtime pipeline, per the plan's scope decision). Population-weighting uses `dwellings`, not `population`, because 2021 Census counts undercount exactly the newest growth-corridor estates this tool cares about — a house standing but unoccupied at census time still counts as a dwelling. The suburb-level breakdown (frequency/coverage/reliability) is now computed the same population-weighted way as the headline, from the same per-cell data, so the two stay mutually reproducible (previously flagged as a real gap in review, not a nitpick).

Verified directly against the real pipeline: 496 of 762 suburbs (Greater Melbourne + commuter corridor) now use grid scoring; 266 fall back to the legacy stop-mean (`scoreMethod: 'legacy-mean'` on their detail JSON) for suburbs outside that scope or with no populated cells. Confirmed the root-cause prediction directly: St Kilda (71→90), Richmond (77→88), Fitzroy (77→94), South Yarra (71→90), North Melbourne (79→92), and Carlton (82, 1-stop fragment→93, real ~44 stops) all move from "decent" to "good" — these were suppressed by stop-density bias, not genuinely middling, exactly as root cause #1 predicted. Tightened the 5 Tier-A fixtures accordingly (minBand decent→good) and graduated Carlton from a Tier-B point fixture to Tier A now that its suburb bucket is accurate. One fixture (Doncaster East) needed a real, verified correction rather than a forced re-match: its score moved from 55/patchy to 81/decent, and directly inspecting all 178 real populated cells confirmed this is genuine — the suburb's western portion (most of its dwellings) has real, decent SmartBus coverage despite the VAGO-cited unbuilt rail line, which is a claim about an unmet rail *promise*, not a blanket verdict on current bus access. Fixture updated (maxBand patchy→decent) with the full investigation recorded in its citation.

**2026-07-10** — Suburb page gets a real map: the same Vicmap boundary polygon and 250m scoring grid cells used for item 1 above are now exposed on each suburb's detail JSON (`boundary`, `gridCells`, `stops`) and rendered on `/score/<slug>` via a new `SuburbMap` component — real boundary outline, translucent band-coloured coverage cells (not a smoothed approximation), and every scored stop, plus a full sorted stop list. Verified in-browser (Playwright screenshot pass against Carlton): renders correctly, zero console errors. Fixed a real dead-code bug found while wiring this up: `build-data.mjs` computed a `topStops` list every run and never wrote it anywhere.

**Investigated same day**: a real Cobblebank-area report ("no bus stops near the station") traced through GTFS source files directly — `routes.txt`/`trips.txt`/`calendar.txt`/`calendar_dates.txt` for route 454 showed 60 consecutive weekday cancellations starting 2026-07-13 across nearly the entire mode-4 (bus) feed (120,450 exception rows, 7,117 of 7,118 services affected). Confirmed via a real news release (Transport Vic, 10 July 2026) this is a genuine, imminent service change, not corruption: new Route 451 launches 26 July, route 454 doubles frequency and extends to Woodgrove, plus further announced Weir Views/Strathtulloh-to-station routes — the GTFS feed already encodes the old pattern's end date ahead of the replacement being published. Confirmed the live pipeline is unaffected: the representative weekday date picked for buses (2026-07-08) falls before the cutoff, so current scores are correct. Real Cobblebank bus stops were re-confirmed present with plausible scores (63.5, 57.7) once a stale local `/tmp` cache was refreshed — no attribution or scoring bug. Flagged as a real, open question for later: how the pipeline should handle GTFS-known-future service changes before their replacement pattern is published (candidate fix: bias representative-date selection toward "today" rather than a whole-calendar median, since the median can wander into a mass-cancellation window on a large enough network change). Not fixed this session, not currently causing incorrect output.

During this same investigation the underlying `gtfs/` data was refreshed twice more mid-session (stop count 25,774 → 25,779 → 28,037), each a genuine real service addition (confirmed directly: new named stops like Hawkstowe Station/Hawkstowe Pde, McDonalds Rd/Davisson St). Two point fixtures (Epping North, Doreen/Hawkstowe) moved further in the same honest direction as their earlier corrections and were updated again with the full chain of revisions recorded in their citations, rather than silently re-matched.

**2026-07-12** — Verdict sentences for grid-scored suburbs (`scoreMethod: 'grid'`) now built from the same population-weighted 250m cells as the headline score, not stop-level data. `catchmentScore`/`aggregateStops` (`frontend/src/lib/scoring.ts`) additionally expose each catchment's best-viable and best-available route (`score`, `peakWaitMinutes`, `modeName`); `build-data.mjs` carries these per grid cell and derives `computeVerdictInputs`: `reachShare` (population share in a cell with a viable route within 800m), a population-weighted median wait among reached cells, per-mode population shares (`modeShares`), and the wait/mode the unreached population is left with instead (`fallbackWaitMinutes`/`fallbackModeName`). `verdictFor` (`frontend/src/lib/verdict.ts`) now gates on these first for grid suburbs: reach (`reachShare < 0.4`) ahead of a genuine population mode split (a minority mode covering ≥20% of the reached population and scoring ≥25 points better) ahead of the existing weakest-dimension read, whose headway/mode noun now also come from the population-weighted inputs rather than stop counts. Legacy-mean suburbs and every address-level caller (`ResultPage.tsx`, which has no suburb-wide population grid) are unaffected — they keep the original stop-based logic, now `legacyVerdictFor`, verbatim.

Fixed the exact contradiction that motivated this piece: Thomastown (STRANDED, reachShare 0.07) previously quoted "buses every 16 minutes" from a stop-level mode split baked on top of a stranded overall verdict; it now reads "The buses here are genuinely good. 93% of this suburb can't walk to them, and the trains filling the gap run every 10 minutes." Stop-count mode-prevalence is retired for suburb verdicts (kept only for the legacy path and the reach gate's stop-level "strong anchor ≥70" check, per spec). Verified: `reachShare` across the 493 grid-scored suburbs splits along band lines as expected (84 total below the 0.4 reach threshold, concentrated in `stranded` at a median reachShare of 0.08, essentially absent from `decent`/`good`) — not a signal to retune the constant. New `frontend/scripts/fixtures/verdict-fixtures.json` (Tier D in `check-fixtures.mjs`) regex-checks Thomastown, Deanside, Pakenham, and a healthy Fitzroy control against the old contradictory phrasing; all pass, as does `check-voice.mjs` against the new templates.

## Migrated from the old investigation log (not touched by this refactor, still open)

These items were tracked in `tie-investigation-log.md`, now superseded. They're independent of the methodology refactor above and remain open tickets in their own right.

- **Desktop layout: search bar overlaps score card.** Known CSS leftover from a previous version, confirmed by the team. Low complexity, fix opportunistically.
- **Fare-zone anchor accuracy.** The isRegional flag fix (Ocean Grove) landed, but a full per-suburb audit of myki zone logic hasn't been done. Worth confirming no other suburbs are asserting the wrong zone or cap.
- **Membership pricing consistency.** Real tiers ($69.08 / $17.27 / $0) are wired through, but anchor copy (fares/petrol/pay comparisons) needs a shared source of truth with fee amounts so future fee-unit indexing doesn't silently break a price claim again, as happened once already.
- **Calendar exception handling, trip dedup, block_id joining (original #1/#2/#3).** Largely resolved by the AM/PM peak bug fix and direction-merging fix from the 9 July session; block_id was confirmed unusable (0% populated in tram/bus feeds) and not pursued further. Worth a final confirmation pass once the grid-aggregation refactor lands, since the underlying frequency calculation is being touched again as part of this work.

# USER NOTE: 
To investigate: Metro Tunnel stations are showing a frequency penalty. During peak hours, these stations receive a genuine turn up and go frequency of 100-180 seconds, off peak, headways are between 5-10 minutes, meaning average wait is 2.5-5 minutes. There should be no penalty.

**Investigated 2026-07-10, see Stage 1 piece 3 changelog entry above for the full writeup.** Does not reproduce against current data (fresh GTFS + the continuous-curve replacement landed same day): Arden, Parkville, Anzac, State Library, Town Hall all show `headway_score` ≈ 99 and `freq_penalty_multiplier` ≈ 0.998 now. Re-open this note if it resurfaces after this point.

Uploaded latest GTFS data:
The GTFS Schedule dataset contains static timetable information of public transport services in Victoria. The modes included are:

All metropolitan and regional trains
All metropolitan and regional buses (including coach)
All metropolitan trams
It is published in a standardised data format according to the GTFS specification.

Release Notes

DTPs GTFS Release Notes (.docx)

DTPs GTFS Release Notes (.pdf)

Additional Notes

GTFS Schedule now includes additional features. These include:

Transfers

Introduction of transfers.txt to complement existing Block Transfers information
Wheelchair Access

New attribute of 'wheelchair_accessible' was added to trips.txt
New attribute of 'wheelchair_boarding' was added to stops.txt to identify wheelchair accessible stops and platforms
Pathways

Introduction of pathways.txt for more detailed path links into stations ('pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional', 'traversal_time')
Addition of new records in stops.txt to support more detailed path links inside stations
Levels

New attribute of 'level_id' was added to stops.txt
Introduction of levels.txt to use in conjunction with pathways.txt ('level_id', 'level_index', 'level_name')
Platform Numbers

New records were added to stops.txt to include the name and location of all 'Metro Train' platforms. In accordance with the GTFS Specification, parent stop records of train stations have also been created.
Bus Replacement Stops

New records were added to stops.txt to include the name and location of all 'Metro Train' Bus Replacement stops. Note their 'platform_code' has been designated as 'R-Bus'.
Bus Replacement trips

Additional bus replacement trips information has been incorporated into the consolidated train routes in trips.txt and shapes.txt. Note - 'route_id' and 'trip_id' structure has changed from previous GTFS.zip files as part of DTP's backend system improvements.
Tram ID improvements

'route_id' and 'trip_id' are updated to include business identifiers to improve matching to GTFS Realtime data feeds
Tram Headsign changes

'trip_headsign' in trips.txt is updated to show improved end of trip destination text.
Folder Structure

The GTFS.zip file is currently structured with folder of Public Transport mode operational branches as per this list.

1 (Regional Train)

2 (Metropolitan Train)

3 (Metropolitan Tram)

4 Myki Bus (Metro Bus and Regional Town Bus)

5 (Regional Coach)

6 (Regional Bus)

10 (Interstate)

11 (SkyBus)

Data Currency

This information is updated on a weekly or as needed basis. There may be periods where publication is delayed due to scheduled maintenance or unforeseen circumstances.

Valid Time Period

The data contains a rolling 30 days of data from the date of export. Some route information may not be complete for this entire period due to service information not yet being made available. As this information becomes available to DTP, it will be made available in subsequent data publications.

Geographic Accuracy

The path information provided is generated based on a mix of automatic algorithm and manual pathing. There may be inaccuracies with the paths and hence the paths may not always match on road operations.

Data
GTFS Schedule
Format:
ZIP
File size:
248.26 MB
gtfs
levels
navigation
pathways
platforms
public transport
routes
stops
timetable
wayfinding
wheelchair access
Additional Info
Field	Value
Abstract	The GTFS Schedule dataset contains static timetable information of public transport services in Victoria.
Organisation	Department of Transport and Planning
Update Frequency	Weekly
Reporting Period End	3 July 2026
Last Updated Date	3 July 2026
