import { describe, it, expect } from 'vitest';
import {
    band,
    catchmentScore,
    distanceMeters,
    diversityBonus,
    gridScore,
    suburbScore,
    type GridCell,
    type StopLite,
} from './scoring';
import { geohashEncode, tilesFor } from './geo';
import { verdictFor, headwayMinutes, modeNounFor } from './verdict';

function stop(partial: Partial<StopLite>): StopLite {
    return {
        id: 'S1',
        name: 'Test Stop',
        lat: -37.8136,
        lon: 144.9631,
        mode_id: 4,
        mode_name: 'metro_bus',
        final_score: 0,
        frequency_score: 0,
        coverage_score: 0,
        reliability_score: 0,
        average_wait_time: 0,
        route_ids: [],
        ...partial,
    };
}

describe('distanceMeters', () => {
    it('measures one degree of latitude near Melbourne', () => {
        expect(distanceMeters(-37.5, 145, -38.5, 145)).toBeCloseTo(111320, -2);
    });

    it('applies the cosine correction to longitude at Melbourne latitude', () => {
        const d = distanceMeters(-37.8136, 144.9, -37.8136, 145.0);
        // 0.1 degrees of longitude at lat -37.81 is about 8.80km, far less
        // than the 11.13km an uncorrected equirectangular formula gives.
        expect(d).toBeGreaterThan(8700);
        expect(d).toBeLessThan(8900);
    });
});

describe('diversityBonus', () => {
    it('matches the documented breakpoints', () => {
        expect(diversityBonus(0)).toBe(0);
        expect(diversityBonus(1)).toBe(20);
        expect(diversityBonus(2)).toBe(50);
        expect(diversityBonus(3)).toBe(70);
        expect(diversityBonus(4)).toBe(85);
        expect(diversityBonus(5)).toBe(100);
        expect(diversityBonus(9)).toBe(100);
    });
});

describe('catchmentScore', () => {
    const origin = { lat: -37.8136, lon: 144.9631 };

    it('returns zero with no stops in range', () => {
        const far = stop({ lat: -37.9, lon: 145.2, final_score: 90, route_ids: ['R1'] });
        const result = catchmentScore([far], origin.lat, origin.lon);
        expect(result.score).toBe(0);
        expect(result.nearbyStops).toHaveLength(0);
    });

    it('caps the score at 49 when no route clears the viability threshold', () => {
        const weak = stop({ final_score: 62, route_ids: [] });
        const result = catchmentScore([weak], origin.lat, origin.lon);
        expect(result.viableCount).toBe(0);
        expect(result.score).toBe(49);
    });

    it('golden: single strong route', () => {
        const s = stop({ final_score: 80, route_ids: ['R1'], frequency_score: 70, coverage_score: 60, reliability_score: 100 });
        const result = catchmentScore([s], origin.lat, origin.lon);
        // best 80 * 0.7 + diversityBonus((0.8)^2 = 0.64 -> 12.8) * 0.3 = 56 + 3.84 = 59.84
        expect(result.score).toBeCloseTo(59.84, 2);
        expect(result.viableCount).toBe(1);
        expect(result.bestScore).toBe(80);
        expect(result.avgFrequency).toBe(70);
    });

    it('golden: three viable routes across two stops', () => {
        const a = stop({ id: 'A', final_score: 90, route_ids: ['R1', 'R2'] });
        const b = stop({ id: 'B', lat: -37.8140, final_score: 60, route_ids: ['R3'] });
        const result = catchmentScore([a, b], origin.lat, origin.lon);
        // quality weighted count = 0.81 + 0.81 + 0.36 = 1.98
        // diversity = 20 + (1.98 - 1) * 30 = 49.4
        // score = 90 * 0.7 + 49.4 * 0.3 = 63 + 14.82 = 77.82
        expect(result.viableCount).toBe(3);
        expect(result.score).toBeCloseTo(77.82, 2);
    });
});

describe('suburbScore', () => {
    it('golden: aggregates breakdown and median wait', () => {
        const stops = [
            stop({ id: 'A', final_score: 90, route_ids: ['R1'], frequency_score: 80, coverage_score: 70, reliability_score: 100, average_wait_time: 5 }),
            stop({ id: 'B', final_score: 40, route_ids: ['R2'], frequency_score: 30, coverage_score: 50, reliability_score: 80, average_wait_time: 20 }),
            stop({ id: 'C', final_score: 55, route_ids: ['R3'], frequency_score: 45, coverage_score: 60, reliability_score: 50, average_wait_time: 15 }),
        ];
        const result = suburbScore(stops);
        // Suburb score is typical access, the plain average of final_score
        // across every stop, not best-stop-dominant like a single address:
        // (90 + 40 + 55) / 3 = 61.666...
        expect(result.score).toBeCloseTo(61.6667, 3);
        // bestScore/viableCount still come from the best-stop aggregation,
        // shown separately as "best route in this suburb".
        expect(result.bestScore).toBe(90);
        expect(result.viableCount).toBe(2);
        expect(result.breakdown.frequency).toBeCloseTo((80 + 30 + 45) / 3, 5);
        expect(result.breakdown.coverage).toBeCloseTo(60, 5);
        expect(result.breakdown.reliability).toBeCloseTo((100 + 80 + 50) / 3, 5);
        expect(result.medianWaitMinutes).toBe(15);
        expect(result.stopCount).toBe(3);
        expect(result.scoreMethod).toBe('legacy-mean');
    });

    it('uses gridScore when grid cells are supplied, not the stop-mean', () => {
        const stops = [stop({ id: 'A', final_score: 90 }), stop({ id: 'B', final_score: 10 })];
        // Grid cells disagree sharply with the stop mean (50) -- if this
        // still returned 50, suburbScore would be ignoring the grid input.
        const cells: GridCell[] = [
            { score: 80, avgFrequency: 80, avgCoverage: 80, avgReliability: 80, population: 100 },
            { score: 20, avgFrequency: 20, avgCoverage: 20, avgReliability: 20, population: 10 },
        ];
        const result = suburbScore(stops, cells);
        expect(result.scoreMethod).toBe('grid');
        // Population-weighted mean: (80*100 + 20*10) / 110 = 74.545...
        expect(result.score).toBeCloseTo(74.5455, 3);
        expect(result.breakdown.frequency).toBeCloseTo(74.5455, 3);
    });

    it('falls back to legacy-mean when grid cells are supplied but empty or unpopulated', () => {
        const stops = [stop({ id: 'A', final_score: 90 }), stop({ id: 'B', final_score: 10 })];
        expect(suburbScore(stops, []).scoreMethod).toBe('legacy-mean');
        expect(suburbScore(stops, [{ score: 80, avgFrequency: 0, avgCoverage: 0, avgReliability: 0, population: 0 }]).scoreMethod).toBe('legacy-mean');
    });
});

describe('gridScore', () => {
    it('returns null for no cells or zero total population', () => {
        expect(gridScore([])).toBeNull();
        expect(gridScore([{ score: 50, avgFrequency: 50, avgCoverage: 50, avgReliability: 50, population: 0 }])).toBeNull();
    });

    it('population-weights score and every breakdown field the same way', () => {
        const cells: GridCell[] = [
            { score: 100, avgFrequency: 90, avgCoverage: 80, avgReliability: 70, population: 1 },
            { score: 0, avgFrequency: 10, avgCoverage: 20, avgReliability: 30, population: 3 },
        ];
        const result = gridScore(cells)!;
        // Weighted mean, weight 1 vs 3 (total 4): (100*1 + 0*3)/4 = 25.
        expect(result.score).toBeCloseTo(25, 5);
        expect(result.avgFrequency).toBeCloseTo((90 * 1 + 10 * 3) / 4, 5);
        expect(result.avgCoverage).toBeCloseTo((80 * 1 + 20 * 3) / 4, 5);
        expect(result.avgReliability).toBeCloseTo((70 * 1 + 30 * 3) / 4, 5);
    });
});

describe('band', () => {
    it('maps scores to bands at the documented thresholds', () => {
        expect(band(0)).toBe('stranded');
        expect(band(29.9)).toBe('stranded');
        expect(band(30)).toBe('poor');
        expect(band(49.9)).toBe('poor');
        expect(band(50)).toBe('patchy');
        expect(band(70)).toBe('decent');
        expect(band(85)).toBe('good');
        expect(band(100)).toBe('good');
    });
});

describe('geo', () => {
    it('encodes Melbourne CBD to a stable geohash5', () => {
        expect(geohashEncode(-37.8136, 144.9631)).toBe('r1r0f');
    });

    it('covers an 800m radius with 1 to 4 tiles', () => {
        const tiles = tilesFor(-37.8136, 144.9631, 800);
        expect(tiles.length).toBeGreaterThanOrEqual(1);
        expect(tiles.length).toBeLessThanOrEqual(4);
    });
});

describe('verdict', () => {
    it('doubles the median wait into a headway', () => {
        expect(headwayMinutes(20)).toBe(40);
    });

    it('names the mode from mode ids', () => {
        expect(modeNounFor([2, 4])).toBe('Trains');
        expect(modeNounFor([3])).toBe('Trams');
        expect(modeNounFor([4])).toBe('Buses');
        expect(modeNounFor([])).toBe('Services');
    });

    it('includes the headway in low-band verdicts', () => {
        const line = verdictFor('stranded', { medianWaitMinutes: 20, modeNoun: 'Trains' });
        expect(line).toContain('Trains every 40 minutes');
    });

    it('never emits an em-dash or banned constructions', () => {
        const bands = ['stranded', 'poor', 'patchy', 'decent', 'good'] as const;
        for (const b of bands) {
            for (const wait of [null, 8, 20, 45]) {
                const line = verdictFor(b, { medianWaitMinutes: wait, modeNoun: 'Buses' });
                expect(line).not.toMatch(new RegExp('\\u2014'));
                expect(line).not.toMatch(new RegExp('not\\x20just', 'i'));
            }
        }
    });
});
