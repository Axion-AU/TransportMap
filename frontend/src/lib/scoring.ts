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

export interface CatchmentResult {
    score: number;
    nearbyStops: StopLite[];
    viableRoutes: ViableRoute[];
    viableCount: number;
    bestScore: number;
    avgFrequency: number;
    avgCoverage: number;
    avgReliability: number;
}

export interface SuburbBreakdown {
    frequency: number;
    coverage: number;
    reliability: number;
}

export interface SuburbResult {
    score: number;
    breakdown: SuburbBreakdown;
    viableCount: number;
    bestScore: number;
    /** Median peak wait in minutes across stops that report one. */
    medianWaitMinutes: number | null;
    stopCount: number;
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
 */
function aggregateStops(stops: StopLite[]): Omit<CatchmentResult, 'nearbyStops'> {
    if (stops.length === 0) {
        return { score: 0, viableRoutes: [], viableCount: 0, bestScore: 0, avgFrequency: 0, avgCoverage: 0, avgReliability: 0 };
    }

    const routeBestScores = new Map<string, number>();
    for (const stop of stops) {
        for (const rid of stop.route_ids ?? []) {
            const current = routeBestScores.get(rid) ?? 0;
            routeBestScores.set(rid, Math.max(current, stop.final_score));
        }
    }

    const viableRoutes: ViableRoute[] = [];
    routeBestScores.forEach((score, id) => {
        if (score > VIABILITY_THRESHOLD) viableRoutes.push({ id, score });
    });
    viableRoutes.sort((a, b) => b.score - a.score);

    const bestAvailable = stops.reduce((max, s) => Math.max(max, s.final_score), 0);
    const bestScore = viableRoutes.length > 0 ? viableRoutes[0].score : bestAvailable;

    const qualityWeightedCount = viableRoutes.reduce((sum, r) => sum + (r.score / 100) ** 2, 0);

    let score: number;
    if (viableRoutes.length > 0) {
        score = bestScore * 0.7 + diversityBonus(qualityWeightedCount) * 0.3;
    } else {
        score = Math.min(bestAvailable, VIABILITY_THRESHOLD - 1);
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
    };
}

/** Score everything within CATCHMENT_RADIUS_M walking distance of a point. */
export function catchmentScore(stops: StopLite[], lat: number, lon: number): CatchmentResult {
    const nearbyStops = stops
        .filter(s => distanceMeters(s.lat, s.lon, lat, lon) < CATCHMENT_RADIUS_M)
        .sort((a, b) => b.final_score - a.final_score);
    return { ...aggregateStops(nearbyStops), nearbyStops };
}

/** Aggregate a whole suburb's stops into one published score. */
export function suburbScore(stops: StopLite[]): SuburbResult {
    const agg = aggregateStops(stops);
    const waits = stops
        .map(s => s.average_wait_time)
        .filter(w => Number.isFinite(w) && w > 0)
        .sort((a, b) => a - b);
    const medianWaitMinutes = waits.length > 0 ? waits[Math.floor(waits.length / 2)] : null;

    return {
        score: agg.score,
        breakdown: {
            frequency: agg.avgFrequency,
            coverage: agg.avgCoverage,
            reliability: agg.avgReliability,
        },
        viableCount: agg.viableCount,
        bestScore: agg.bestScore,
        medianWaitMinutes,
        stopCount: stops.length,
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
