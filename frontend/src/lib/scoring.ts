/**
 * The single implementation of the catchment and suburb scoring formulas.
 *
 * Shared by the browser (ResultPage, ConnectivityPin) and the build pipeline
 * (scripts/build-data.mjs), so a published suburb aggregate and a client-side
 * recalculation can never disagree. Pure TypeScript: no DOM, no Leaflet.
 *
 * Per-stop scores are produced upstream by the Rust GTFS processor
 * (src/gtfs_processor/scoring.rs) and consumed here as inputs. The formulas
 * in this file are documented verbatim on the /methodology page; change both
 * together or the fact-check gate fails.
 */

/** Minimal per-stop row used by lookups and aggregation. */
export interface StopLite {
    id: string;
    name: string;
    lat: number;
    lon: number;
    mode_id: number;
    mode_name: string;
    /** Composite 0-100 stop score (final_score from the Rust processor). */
    final_score: number;
    frequency_score: number;
    coverage_score: number;
    reliability_score: number;
    /** Peak average wait in minutes (display value). */
    average_wait_time: number;
    route_ids: string[];
}

export interface ViableRoute {
    id: string;
    score: number;
}

/** A single route's best-scoring stop, reduced to what a verdict needs to say about it. */
export interface RouteSample {
    score: number;
    peakWaitMinutes: number | null;
    modeName: string;
}

export interface CatchmentResult {
    score: number;
    nearbyStops: StopLite[];
    viableRoutes: ViableRoute[];
    viableCount: number;
    bestScore: number;
    avgFrequency: number;
    avgCoverage: number;
    avgReliability: number;
    /** The best viable route's own stop, or null if no route here clears VIABILITY_THRESHOLD. */
    bestViable: RouteSample | null;
    /** The single best-scoring stop regardless of viability; always set when any stop is nearby. */
    bestAvailable: RouteSample | null;
}

export interface SuburbBreakdown {
    frequency: number;
    coverage: number;
    reliability: number;
}

/** Per-mode summary within a suburb, used to notice when one mode carries the score and another drags it down. */
export interface ModeBreakdown {
    /** Raw mode_name from the GTFS processor, e.g. "metro_train", "metro_bus". */
    modeName: string;
    /** How many stops of this mode exist in the suburb -- how many residents this mode actually reaches. */
    stopCount: number;
    /** Best final_score of any single stop of this mode (can be an outlier one or two isolated stops reach). */
    bestScore: number;
    /** Mean final_score across all of this mode's stops -- what a typical stop of this mode looks like. */
    avgScore: number;
    /** Count of stops of this mode above VIABILITY_THRESHOLD. */
    viableCount: number;
}

export interface SuburbResult {
    score: number;
    breakdown: SuburbBreakdown;
    viableCount: number;
    bestScore: number;
    /** Median peak wait in minutes across the primary mode's stops (see suburbScore). */
    medianWaitMinutes: number | null;
    stopCount: number;
    /**
     * Per-mode summaries, sorted by stopCount (prevalence) first, not by
     * score: a suburb's "typical" experience is the mode most stops belong
     * to, not whichever mode happens to have the single best isolated stop
     * (confirmed wrong on Thomastown: 2 excellent train stops vs. 20
     * mediocre bus stops -- residents mostly get the buses, so the verdict
     * must describe the buses, not the trains). Always has at least one
     * entry when stopCount > 0.
     */
    modeBreakdown: ModeBreakdown[];
    /**
     * 'grid': population-weighted average of per-cell address-style scores
     * (methodology refactor item 1). 'legacy-mean': plain mean of stop
     * final_score, used when the suburb has no real polygon boundary or no
     * populated grid cells (e.g. outside the metro attribution scope).
     */
    scoreMethod: 'grid' | 'legacy-mean';
}

/** Raw GTFS processor mode_name (src/gtfs_processor/driver.rs) to rider-facing plural noun. */
export function friendlyModeName(modeName: string): string {
    switch (modeName) {
        case 'regional_train': return 'Regional trains';
        case 'metro_train': return 'Trains';
        case 'metro_tram': return 'Trams';
        case 'metro_bus': return 'Buses';
        case 'regional_coach': return 'Coaches';
        case 'regional_bus': return 'Regional buses';
        case 'skybus': return 'SkyBus';
        default: return 'Services';
    }
}

/**
 * One 250m grid cell's address-style score (from catchmentScore at the
 * cell's center), tagged with its population weight (dwellings, not
 * usual-resident population -- see build-data.mjs's mesh-block fetch
 * script for why). Produced by build-data.mjs, which owns the polygon and
 * mesh-block lookups; this module only aggregates the results.
 */
export interface GridCell {
    score: number;
    avgFrequency: number;
    avgCoverage: number;
    avgReliability: number;
    population: number;
    /** Cell center, for downstream map rendering. Not used by gridScore's own math. */
    lat?: number;
    lon?: number;
    /** Carried straight from this cell's catchmentScore call, for computeVerdictInputs. */
    bestViable?: RouteSample | null;
    bestAvailable?: RouteSample | null;
}

/**
 * Population-weighted mean of a suburb's grid cells -- the address-style
 * score and its breakdown, both computed the same way so the published
 * headline and its 3-part breakdown stay mutually reproducible (unlike a
 * headline computed one way and a breakdown computed another). Returns null
 * if there are too few cells or their total population weight is zero, so
 * the caller can fall back to the legacy stop-mean. Below MIN_GRID_CELLS, a
 * single (or handful of) populated cell makes the score a coin-flip on
 * whether that one point's 800m catchment happens to reach a nearby stop,
 * rather than a real area-weighted average -- confirmed on Melbourne
 * Airport (one populated cell, 798.9m from its nearest stop, scoring 0/100
 * despite genuinely good Skybus/SmartBus service ~800m-1km away) and Avalon
 * (also single-cell, scoring 0 despite having some real service).
 */
export const MIN_GRID_CELLS = 3;

export function gridScore(cells: GridCell[]): { score: number; avgFrequency: number; avgCoverage: number; avgReliability: number } | null {
    const totalPopulation = cells.reduce((sum, c) => sum + c.population, 0);
    if (cells.length < MIN_GRID_CELLS || totalPopulation <= 0) return null;

    const weightedMean = (pick: (c: GridCell) => number) =>
        cells.reduce((sum, c) => sum + pick(c) * c.population, 0) / totalPopulation;

    return {
        score: weightedMean(c => c.score),
        avgFrequency: weightedMean(c => c.avgFrequency),
        avgCoverage: weightedMean(c => c.avgCoverage),
        avgReliability: weightedMean(c => c.avgReliability),
    };
}

/** Population-weighted median: the value at the point where cumulative weight crosses half the total. */
function weightedMedian(items: { value: number; weight: number }[]): number | null {
    const valid = items.filter(i => Number.isFinite(i.value) && i.weight > 0).sort((a, b) => a.value - b.value);
    const total = valid.reduce((sum, i) => sum + i.weight, 0);
    if (total <= 0) return null;
    let cumulative = 0;
    for (const item of valid) {
        cumulative += item.weight;
        if (cumulative >= total / 2) return item.value;
    }
    return valid[valid.length - 1].value;
}

/** One mode's population-weighted share of a suburb's reached grid cells. */
export interface ModeShare {
    modeName: string;
    /** Fraction of the reached (has-a-viable-route) population whose best option is this mode. */
    share: number;
    medianWaitMinutes: number | null;
    /** Population-weighted mean cell score for this mode's cells; used to size a genuine mode split, not displayed directly. */
    avgScore: number;
}

/**
 * Population-weighted verdict inputs, computed from the same grid cells as
 * gridScore (methodology refactor, verdict piece): what share of the suburb
 * can actually reach a viable route, the wait that share experiences, how
 * that reached population splits by mode, and what the unreached population
 * is left with instead. Only meaningful for grid-scored suburbs -- callers
 * without populated grid cells should not call this and should fall back to
 * the legacy stop-based verdict path instead.
 */
export interface VerdictInputs {
    reachShare: number;
    medianWaitMinutes: number | null;
    modeShares: ModeShare[];
    fallbackWaitMinutes: number | null;
    fallbackModeName: string | null;
}

export function computeVerdictInputs(cells: GridCell[]): VerdictInputs {
    const totalPopulation = cells.reduce((sum, c) => sum + c.population, 0);
    const reached = cells.filter(c => c.bestViable);
    const reachedPopulation = reached.reduce((sum, c) => sum + c.population, 0);
    const reachShare = totalPopulation > 0 ? reachedPopulation / totalPopulation : 0;

    const medianWaitMinutes = weightedMedian(
        reached
            .filter(c => c.bestViable!.peakWaitMinutes !== null)
            .map(c => ({ value: c.bestViable!.peakWaitMinutes!, weight: c.population }))
    );

    const byMode = new Map<string, GridCell[]>();
    for (const c of reached) {
        const name = c.bestViable!.modeName;
        if (!byMode.has(name)) byMode.set(name, []);
        byMode.get(name)!.push(c);
    }
    const modeShares: ModeShare[] = [...byMode.entries()]
        .map(([modeName, modeCells]) => {
            const pop = modeCells.reduce((sum, c) => sum + c.population, 0);
            return {
                modeName,
                share: reachedPopulation > 0 ? pop / reachedPopulation : 0,
                medianWaitMinutes: weightedMedian(
                    modeCells
                        .filter(c => c.bestViable!.peakWaitMinutes !== null)
                        .map(c => ({ value: c.bestViable!.peakWaitMinutes!, weight: c.population }))
                ),
                avgScore: pop > 0 ? modeCells.reduce((sum, c) => sum + c.score * c.population, 0) / pop : 0,
            };
        })
        .sort((a, b) => b.share - a.share);

    const unreachedWithService = cells.filter(c => !c.bestViable && c.bestAvailable && c.bestAvailable.peakWaitMinutes !== null);
    const fallbackWaitMinutes = weightedMedian(
        unreachedWithService.map(c => ({ value: c.bestAvailable!.peakWaitMinutes!, weight: c.population }))
    );
    let fallbackModeName: string | null = null;
    if (unreachedWithService.length > 0) {
        const modePopulation = new Map<string, number>();
        for (const c of unreachedWithService) {
            const name = c.bestAvailable!.modeName;
            modePopulation.set(name, (modePopulation.get(name) ?? 0) + c.population);
        }
        fallbackModeName = [...modePopulation.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    return { reachShare, medianWaitMinutes, modeShares, fallbackWaitMinutes, fallbackModeName };
}

export const CATCHMENT_RADIUS_M = 800;
export const VIABILITY_THRESHOLD = 50;
/** Suburbs need at least this many stops to appear in the league table. */
export const LEAGUE_TABLE_MIN_STOPS = 3;

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Equirectangular distance with cosine-latitude correction, in metres.
 * Accurate to well under 1% at suburb scale. The previous implementation
 * ignored the cos(lat) term, overstating east-west distance by about 25%
 * at Melbourne's latitude; noted in the /methodology changelog.
 */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = (lat2 - lat1) * METERS_PER_DEGREE_LAT;
    const midLatRad = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * METERS_PER_DEGREE_LAT * Math.cos(midLatRad);
    return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Diversity bonus: rewards having several genuinely usable routes, with
 * strong diminishing returns. Input is the quality-weighted route count
 * (each viable route contributes (score/100)^2).
 */
export function diversityBonus(count: number): number {
    if (count <= 0) return 0;
    if (count <= 1) return count * 20;
    if (count <= 2) return 20 + (count - 1) * 30;
    if (count <= 3) return 50 + (count - 2) * 20;
    if (count <= 4) return 70 + (count - 3) * 15;
    if (count <= 5) return 85 + (count - 4) * 15;
    return 100;
}

/**
 * Core aggregation over a set of stops: best viable route 70%, route
 * diversity 30%. With no viable route (none above 50), the score is the
 * best available stop capped at 49, keeping it under the viability line.
 * Used directly for single-address catchments (catchmentScore); suburbScore
 * only takes the breakdown/viableCount/bestScore fields from this and
 * computes its own headline score (see typicalStopScore below).
 */
/** A finite, positive wait is a real display value; anything else (missing, zero, NaN) means "unknown". */
function peakWait(stop: StopLite): number | null {
    return Number.isFinite(stop.average_wait_time) && stop.average_wait_time > 0 ? stop.average_wait_time : null;
}

function aggregateStops(stops: StopLite[]): Omit<CatchmentResult, 'nearbyStops'> {
    if (stops.length === 0) {
        return { score: 0, viableRoutes: [], viableCount: 0, bestScore: 0, avgFrequency: 0, avgCoverage: 0, avgReliability: 0, bestViable: null, bestAvailable: null };
    }

    const routeBest = new Map<string, { score: number; stop: StopLite }>();
    for (const stop of stops) {
        for (const rid of stop.route_ids ?? []) {
            const current = routeBest.get(rid);
            if (!current || stop.final_score > current.score) {
                routeBest.set(rid, { score: stop.final_score, stop });
            }
        }
    }

    const viableRoutes: ViableRoute[] = [];
    routeBest.forEach(({ score }, id) => {
        if (score > VIABILITY_THRESHOLD) viableRoutes.push({ id, score });
    });
    viableRoutes.sort((a, b) => b.score - a.score);

    const bestViable: RouteSample | null = viableRoutes.length > 0
        ? (() => {
            const top = routeBest.get(viableRoutes[0].id)!;
            return { score: top.score, peakWaitMinutes: peakWait(top.stop), modeName: top.stop.mode_name };
        })()
        : null;

    const bestAvailableStop = stops.reduce<StopLite | null>((best, s) => (!best || s.final_score > best.final_score ? s : best), null);
    const bestAvailable: RouteSample | null = bestAvailableStop
        ? { score: bestAvailableStop.final_score, peakWaitMinutes: peakWait(bestAvailableStop), modeName: bestAvailableStop.mode_name }
        : null;

    const bestScore = bestViable?.score ?? bestAvailable?.score ?? 0;

    const qualityWeightedCount = viableRoutes.reduce((sum, r) => sum + (r.score / 100) ** 2, 0);

    let score: number;
    if (viableRoutes.length > 0) {
        score = bestScore * 0.7 + diversityBonus(qualityWeightedCount) * 0.3;
    } else {
        score = Math.min(bestScore, VIABILITY_THRESHOLD - 1);
    }
    score = Math.min(score, 100);

    const avg = (pick: (s: StopLite) => number) =>
        stops.reduce((sum, s) => sum + (pick(s) || 0), 0) / stops.length;

    return {
        score,
        viableRoutes,
        viableCount: viableRoutes.length,
        bestScore,
        avgFrequency: avg(s => s.frequency_score),
        avgCoverage: avg(s => s.coverage_score),
        avgReliability: avg(s => s.reliability_score),
        bestViable,
        bestAvailable,
    };
}

/** Score everything within CATCHMENT_RADIUS_M walking distance of a point. */
export function catchmentScore(stops: StopLite[], lat: number, lon: number): CatchmentResult {
    const nearbyStops = stops
        .filter(s => distanceMeters(s.lat, s.lon, lat, lon) < CATCHMENT_RADIUS_M)
        .sort((a, b) => b.final_score - a.final_score);
    return { ...aggregateStops(nearbyStops), nearbyStops };
}

/**
 * Legacy fallback for suburbScore, used only when no grid cells are
 * available (methodology refactor item 1 shipped 2026-07-10; this was the
 * suburb-level formula before it). Plain average of every scored stop's
 * final_score: still means stop density can drive the number rather than
 * real service quality (the exact problem item 1 fixes), and averages
 * across stops kilometres apart rather than population-weighting them --
 * kept only for suburbs outside the real-polygon attribution scope, or
 * with zero populated grid cells, so those suburbs still get a published
 * number instead of none at all.
 */
function typicalStopScore(stops: StopLite[]): number {
    if (stops.length === 0) return 0;
    return stops.reduce((sum, s) => sum + s.final_score, 0) / stops.length;
}

/**
 * Aggregate a whole suburb's stops into one published score.
 *
 * `gridCells`, when supplied by build-data.mjs (real polygon boundary and
 * at least one populated 250m cell), is used for both the headline score
 * and the breakdown via `gridScore` -- this is the item 1 fix (grid +
 * population aggregation) replacing the plain stop-mean. `viableCount` and
 * `bestScore` still come from the suburb's stops directly regardless,
 * since they're inherently about "does a viable route exist here," not a
 * population-weighted average.
 */
export function suburbScore(stops: StopLite[], gridCells?: GridCell[]): SuburbResult {
    const agg = aggregateStops(stops);

    // Group by real mode_name (regional_train/metro_train/metro_tram/...)
    // rather than a single pooled sample: a suburb's "Trains" headline noun
    // can otherwise blend e.g. hourly V/Line with turn-up-and-go Metro, or
    // trains with a much worse local bus network, into one misleading number.
    const modeStats = new Map<string, { stopCount: number; scoreSum: number; bestScore: number; viableCount: number }>();
    for (const s of stops) {
        const cur = modeStats.get(s.mode_name) ?? { stopCount: 0, scoreSum: 0, bestScore: 0, viableCount: 0 };
        cur.stopCount++;
        cur.scoreSum += s.final_score;
        cur.bestScore = Math.max(cur.bestScore, s.final_score);
        if (s.final_score > VIABILITY_THRESHOLD) cur.viableCount++;
        modeStats.set(s.mode_name, cur);
    }
    // Sorted by stopCount: the primary mode is whichever one most stops (and
    // so most residents) actually get, not whichever has the single best
    // isolated stop -- see the ModeBreakdown/SuburbResult doc comments.
    const modeBreakdown: ModeBreakdown[] = [...modeStats.entries()]
        .map(([modeName, v]) => ({ modeName, stopCount: v.stopCount, bestScore: v.bestScore, avgScore: v.scoreSum / v.stopCount, viableCount: v.viableCount }))
        .sort((a, b) => b.stopCount - a.stopCount);

    // The verdict's headway describes the primary (most prevalent) mode
    // only, so the quoted number matches what most residents actually
    // experience, rather than an isolated outlier stop or a median across
    // mixed regional/metro/other-mode stops.
    const primaryModeName = modeBreakdown.length > 0 ? modeBreakdown[0].modeName : null;
    const waits = stops
        .filter(s => primaryModeName === null || s.mode_name === primaryModeName)
        .map(s => s.average_wait_time)
        .filter(w => Number.isFinite(w) && w > 0)
        .sort((a, b) => a - b);
    const medianWaitMinutes = waits.length > 0 ? waits[Math.floor(waits.length / 2)] : null;

    const grid = gridCells ? gridScore(gridCells) : null;

    return {
        score: grid ? grid.score : typicalStopScore(stops),
        breakdown: grid
            ? { frequency: grid.avgFrequency, coverage: grid.avgCoverage, reliability: grid.avgReliability }
            : { frequency: agg.avgFrequency, coverage: agg.avgCoverage, reliability: agg.avgReliability },
        viableCount: agg.viableCount,
        bestScore: agg.bestScore,
        medianWaitMinutes,
        stopCount: stops.length,
        modeBreakdown,
        scoreMethod: grid ? 'grid' : 'legacy-mean',
    };
}

export type Band = 'stranded' | 'poor' | 'patchy' | 'decent' | 'good';

export const BAND_THRESHOLDS: { band: Band; min: number }[] = [
    { band: 'good', min: 85 },
    { band: 'decent', min: 70 },
    { band: 'patchy', min: 50 },
    { band: 'poor', min: 30 },
    { band: 'stranded', min: 0 },
];

export function band(score: number): Band {
    for (const { band: b, min } of BAND_THRESHOLDS) {
        if (score >= min) return b;
    }
    return 'stranded';
}

export const BAND_LABELS: Record<Band, string> = {
    stranded: 'STRANDED',
    poor: 'POOR',
    patchy: 'PATCHY',
    decent: 'DECENT',
    good: 'GOOD',
};

/** Reclaim data-band colours (see src/config/theme.css). */
export const BAND_COLORS: Record<Band, string> = {
    stranded: '#D428D4',
    poor: '#E4573F',
    patchy: '#E8A33D',
    decent: '#4A7AEB',
    good: '#00DDB8',
};
