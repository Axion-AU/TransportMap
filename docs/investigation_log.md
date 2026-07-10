# TIE: issues to investigate

**SUPERSEDED as of 10 July 2026.** This document is now historical. Active tracking has moved to `tie-methodology-refactor.md`, which consolidates the structural root causes behind most items below and carries the current changelog. Items not touched by the refactor (desktop layout, fare-zone per-suburb audit, membership pricing) remain valid as standalone tickets, but should be migrated into the new document's own tracking rather than actioned from here going forward. Retained for historical reference only.

Surfaced by community testing in the politics discord, 9 July 2026, and by a coding agent session the same day. Not all confirmed as bugs, severity and confidence noted per item. Investigate and fix or document as intentional before public launch push.

## Fixed this session (9 July 2026, coding agent pass)

- #5 phantom stops: fixed for Digby/Albacutya/Abbeyard (attribution fallback capped at 5km). Addington unresolved, blocked on a shared-coordinate data quality issue affecting 493 of 929 unique coordinates in the source postcode dataset, needs real locality polygons, v2 item.
- #8 pricing: real tiers wired through anchors.json. Also caught and fixed a second issue: "less than a week of fares" claim went false once real Standard price ($69.08) exceeded the weekly-fares anchor ($58). Anchor copy and fee amounts need a shared source of truth going forward, not independently maintained config.
- #1 calendar exceptions: not the actual bug (exception handling was already correct). Investigating it surfaced the real issue: representative-date picker selected the day with maximum active-trip count, systematically grabbing "added service" anomalies as baseline. Fixed, switched to median.
- #4 / #10 / #12 frequency (Watsonia, Craigieburn, Melton): two stacked bugs, both fixed. AM/PM peak pooling (already found and fixed by Ethan) plus a second bug, through-stations pooling both travel directions under one stop_id, making headway look ~2x better than either direction alone. Fixed by computing wait per direction, taking the worse one. Verified by hand against raw GTFS.
- #3 block_id joining: investigated, dead end correctly identified. block_id is 0% populated in tram/bus feeds, 65% in metro train, unusable for Town Hall or any bus route. Town Hall's reported 62/100-with-penalty doesn't reproduce against current code (scores 79.9, no penalty), likely screenshotted against a stale build.
- #9 fare zones: existing isRegional flag now wired through to JoinCta, regional suburbs like Ocean Grove no longer assert a metro fare that doesn't apply.

## New, higher priority than anything previously logged

### 14. bestScore * 0.7 weighting inflates suburbs with one strong anchor stop — CONFIRMED AND FIXED
Data-confirmed, not a hypothesis: Craigieburn (headline 92, breakdown avg ~61, median wait 31.5min), Williams Landing (headline 91, breakdown avg ~60, median wait 31.8min), and Mildura (headline 83, breakdown avg ~62, median wait 30min) all showed the same pattern. The composite score was dominated by best_viable * 0.7, effectively the suburb's single best stop, almost always the train station, while the plain average across every stop in the suburb sat roughly 30 points lower and the typical (median) wait across all stops was around 30 minutes.
Root cause: suburbScore reused catchmentScore's best-stop-dominant formula (bestScore*0.7 + diversityBonus*0.3), correct for a single address's 800m catchment, wrong applied across an entire suburb where it let one strong rail anchor carry the whole number.
Decision made (Ethan): suburb score should represent typical access, not best-case access.
Fix: suburbScore is now the plain average of final_score across all the suburb's stops. Noted as a TODO to become population/dwelling-weighted once that dataset exists. bestScore/viableCount/breakdown unchanged and still shown separately as "best route" context. catchmentScore (single-address results) untouched, best-stop-dominant remains correct there since an address result should reflect what's actually walkable from that address.
Verified: Craigieburn 92→41, Williams Landing 91→41, Mildura 83→39, all now land in "poor" band, consistent with ~30min typical waits. Golden test and Methodology.tsx writeup updated to describe the two different questions (address vs. suburb) the two formulas now answer. Typecheck and vitest pass.

### 15. Band thresholds need recalibration check post-#14
Flagged by the same session, not yet actioned. Current bands (good≥85, decent≥70, patchy≥50, poor≥30) were calibrated against the old best-stop-dominant suburb scores. With typical-access scores now generally lower across the board, most suburbs will shift down a band or two, intended for car-dependent suburbs, but needs a check that genuinely well-served suburbs (inner-city, dense consistent coverage) don't also get unfairly demoted by the same shift.
Action: pull the full league table post-#14 fix, eyeball the distribution, confirm inner-city suburbs still land in good/decent bands appropriately before adjusting thresholds if needed. This is a separate call from #14 itself.

## Critical: data pipeline correctness

### 1. Calendar exception handling
Suspected: the GTFS processor is not correctly walking calendar_dates.txt and excluding exception_type 2 (service removed on a specific date). If unhandled, cancelled/seasonal/one-off services are being counted as active, inflating frequency scores.
Reported by: Bayswayter Mushroom Eater ("is the processor correctly going through the calendar and removing exception type 2")
Action: audit calendar_dates.txt handling in the ingestion pipeline. Confirm exception_type 1 (added) and 2 (removed) are both applied before frequency calculation.

### 2. Duplicate trips across overlapping feeds/calendars
Suspected: trips are being double-counted when GTFS splits weekday/weekend/school-holiday service into separate but overlapping trip_ids, artificially improving headway.
Reported by: Bayswayter Mushroom Eater ("you just have to combine the stop times and delete any dupes... also this doesn't work for the buses")
Action: audit trip deduplication logic across calendar variants, specifically for bus routes where this was flagged as currently broken.

### 3. Town Hall station frequency penalty / trip joining
Suspected: Town Hall's frequency score is wrong because trips need to be joined via block_id rather than scored as independent trips.
Reported by: Alex ("Why does town hall station have a frequency penalty"), Bayswayter ("town hall is an odd one because you really need to join runs using the block id, or else it might break")
Evidence: Town Hall showing 62/100 with a "Frequency Penalty: 15% reduction" flag applied, avg wait 2.5m displayed, inconsistent with known service levels.
Action: implement block_id-based trip joining for frequency calc, re-test Town Hall specifically after fix.

### 4. Watsonia average wait incorrect
Reported by: Alex ("The average wait at watsonia station is not every 6.6 minutes")
Likely downstream of #1 and/or #2. Re-test after those fixes; if still wrong, investigate Watsonia's feed independently.

### 5. Phantom stops in towns with no service
Confirmed by user testing: Albacutya, Abbeyard, Addington, and Digby are marked as having more than one transport stop despite having none.
Reported by: 01/07/2026 RBC IS GONE ("these are just a couple of incorrectly marked examples")
Severity: high. This is a suburb-attribution bug, not a scoring bug, likely in the nearest-stop-within-1km fallback logic described in the methodology doc. A phantom stop in a town with zero service is the single most damaging possible screenshot for a tool whose entire pitch is precision. Fix before any further promotion.
Action: audit stop-to-suburb attribution for low-density regional areas, check the 1km fallback radius isn't pulling in unrelated stops, spot check other regional towns beyond the 4 flagged.

## Design/methodology: not confirmed bugs, needs a decision

### 6. Diversity bonus ceiling flattens high-end scores → proposed fix: logarithmic curve
The scoring formula caps diversity_bonus at quality_count >= 5.0, and best_viable is also effectively ceiling-bound. Result: suburbs with very different service levels (e.g. Williams Landing vs South Yarra) can land on the same score once both clear ~5 viable routes.
Reported by: Alex ("If a metric is rating Williams Landing and South Yarra the same something needs to change")
Root cause diagnosis: the underlying scale is roughly linear, which compresses distinctions at both ends: near-ceiling suburbs bunch together (this item), and near-floor suburbs also bunch together unless something else (like the #12 bug) artificially spreads them out (see #13).
Proposed fix (Ethan, 9 July): move to a logarithmic (or similar non-linear, e.g. power/sigmoid) scoring curve instead of patching the linear cap. A log-scaled curve gives more resolution at both the low end (shit vs decent) and high end (good vs exceptional) without a separate ceiling patch and a separate investigation into floor-end compression. This likely supersedes the two options previously floated (extend the curve past 5.0, or add a modal-diversity differentiator) and may resolve #6, #7, and #13 together.
Recommend: prototype the log-curve against known suburbs (Craigieburn, Watsonia, Williams Landing, South Yarra, Ocean Grove, Mildura) post-#12 fix, compare score distribution before committing to a v2 methodology change.

### 7. Inter-modality bonus weights mode presence, not mode quality
Flinders Street example: two train connections listed at 85/100 and 62/100 both count toward the same "train" mode bucket for the inter-modality bonus, rather than the bonus being weighted by best-in-mode score.
Reported by: Alex ("Doing this by modes is not the best way")
Design question, not a hotfix. Consider alongside the #6 log-curve prototype, may be partially resolved by it.

## Confirmed elsewhere (from prior screenshots, not this log's source but same launch-readiness pass)

### 8. Membership price mismatch
Join card on result pages shows "$30 a year," actual fee tiers are Standard $69.08 / Concession $17.27 / Free $0. No tier matches $30. Fix before further promotion, this is a credibility issue not just a UX bug.

### 9. Fare-zone anchor accuracy
Ocean Grove result page cited a fare figure a user corrected by hand as wrong zone (marked as zone 5 vs actual zone 1/2) and wrong cap amount. Audit the fare-anchor logic to confirm it's using the correct myki zone per suburb, not a flat statewide figure.

### 10. Craigieburn frequency wildly wrong
Reported: bus route showing something like a 59 minute wait when actual frequency is 20 minutes both peak and off-peak. Stop count itself was described as accurate, so this is a headway calculation issue, not a coverage/attribution one.
Reported by: Jas ("the stop amount is fairly accurate, but the buses run every 20 minutes both on and off peak so I don't know where you're getting 59 minutes from")
Likely same family as #1/#2/#3 (calendar exceptions, dedup, trip joining), but flagged separately since it's a different route/suburb and worth confirming the same fix resolves it rather than assuming.
Also reported: Craigieburn's league table rank (67th) reads as inconsistent with the above, i.e. the headway bug may be actively mispositioning it in the rankings. Re-check ranking after the headway fix lands, don't just patch the display number.

### 11. Desktop layout: search bar overlaps score card
Reported by: Jas ("can you fix the desktop version, I can't read the card. The search bar gets in the way")
Confirmed by FUS-GRN-LCP as known, "leftover from a previous version." Straightforward CSS/layout fix, not a data issue. Low complexity, fix opportunistically.

### 12. AM/PM peak headway miscalculation — CONFIRMED AND FIXED
Root cause identified: AM and PM peak departures were being collected into one set, then the gap between the last AM departure and first PM departure was being calculated as a service headway. This produced an artificial ~7 hour wait, dragging the frequency average up.
Fixed by FUS-GRN-LCP, 9 July 2026.
Likely the actual root cause (or a major contributor) behind #4 (Watsonia) and #10 (Craigieburn), possibly others in the frequency-penalty family. Re-test all previously flagged suburbs (Town Hall, Watsonia, Craigieburn, Ocean Grove) after this fix to confirm which issues it resolves versus which still need the calendar/dedup/block_id work.

### 13. Possible systemic bias: scores more accurate for bad service than good service
Self-observed by FUS-GRN-LCP before the #12 fix: "the scores seem most accurate when the transport is worse." Worth checking whether this pattern persists post-#12, or whether it was entirely an artifact of the AM/PM peak bug (which would disproportionately distort suburbs with a real midday gap, i.e. worse-served areas, while suburbs with all-day frequent service wouldn't trigger the artificial 7 hour gap in the first place). If the pattern still holds after re-testing, it's likely the same linear-scale compression problem described in #6, just visible at the opposite end. Treat #6 and #13 as one investigation: the log-curve prototype should be checked against both.

### 16. Suburbs with zero physical stops inheriting a neighbouring suburb's score
Strathtulloh has no physical transit stops within its own boundary; all nearby stops are physically located in Cobblebank to the north. The address-level catchmentScore correctly returns 0/100 (no viable stop within the walking catchment). The suburb-level score, however, returns 45/100, indicating stops from Cobblebank are being attributed to Strathtulloh for the purpose of the suburb aggregate.
Reported by: Ethan, personal address, 10 July 2026.
Likely mechanism: the same suburb-attribution fallback described in the methodology ("the remainder inherit the nearest attributed stop within 1km") is designed for individual unlabelled stops, but is evidently also affecting suburb-level aggregation, pulling in a neighbouring suburb's stops for a suburb that has none of its own.
Distinct from #5: #5 was phantom stops appearing in towns with zero stops nearby at all (a distance-cap problem, since fixed by capping at 5km). This is a different failure: a real suburb adjacent to real stops, where those stops belong to a different, named suburb, being counted as if they belong to the suburb with no stops of its own. A 5km cap alone would not fix this, since Cobblebank's stops are likely well within 5km of Strathtulloh.
Recommended fix: suburb-level aggregation should only include stops whose suburb attribution matches the suburb being scored. A suburb with zero attributed stops should score 0, or display an explicit "no transit stops in this suburb" state, rather than inheriting a neighbour's stops through the same fallback meant for individual ambiguous stops. This is likely to affect other newer or smaller growth-corridor suburbs adjacent to established ones, not just Strathtulloh, worth checking the pattern broadly rather than patching this one case.
The underlying, more durable fix: stop suburb-attribution via nearest-neighbour fallback entirely and use real locality boundary polygons instead. This data exists as an open, authoritative dataset, not something that needs to be inferred or approximated: Vicmap Admin (the Victorian government's official locality boundary layer) publishes exact suburb/locality polygons, and the ABS also publishes locality boundaries nationally. This is very likely the same data (or a close derivative) that underlies Google Maps' own suburb boundary lines, since locality boundaries are an administrative dataset, not something drawn by hand. Swapping the current nearest-stop fallback for a proper point-in-polygon check against Vicmap Admin boundaries would fix this issue, #5's remaining Addington/Burrumbeet coordinate collision, and likely a class of similar attribution errors in one pass, rather than requiring a bespoke patch per affected suburb.

## Policy/content opportunity (not a bug, do not action in codebase)

Jas raised a substantive planning critique in the same thread: Craigieburn station is surrounded by an at-grade 1,500-space carpark instead of transit-oriented density, and roughly half of station users are park-and-riders from Mickleham, Donnybrook and Kalkallo who would be better served by improved bus connections than by more parking. This is a real land-use argument (TOD vs car-dependent park-and-ride design) that lines up with existing land value capture and transport equity policy interests. Worth routing to the policy/content pipeline as a potential Craigieburn-specific case study, separate from the TIE bug fixes.

## Suggested triage order

1. Phantom stops (#5) and price mismatch (#8) — most damaging if screenshotted, fix first.
2. Re-test Town Hall, Watsonia, Craigieburn, Ocean Grove now that #12 (AM/PM peak bug) is fixed — confirm what's resolved before doing further pipeline work.
3. Remaining frequency issues after re-test: calendar exceptions (#1), dedup (#2), block_id joining (#3) — fix as one pass if still needed.
4. Fare-zone accuracy (#9) — audit per-suburb logic.
5. Craigieburn league table rank — re-verify after #12 and any remaining fixes land, don't patch the number in isolation.
6. Suburb attribution for zero-stop suburbs (#16) — likely affects multiple growth-corridor suburbs, worth checking pattern broadly, not just Strathtulloh.
7. Prototype logarithmic scoring curve (#6/#13, possibly #7) against the known suburb set, compare distribution to current linear scale, decide whether to ship as v2.
8. Desktop layout overlap (#11) — low complexity, fix opportunistically.