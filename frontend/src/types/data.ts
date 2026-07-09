import type { Band } from '../lib/scoring';

export interface SuburbIndexEntry {
    name: string;
    slug: string;
    lat: number;
    lon: number;
    score: number;
    band: Band;
    stopCount: number;
}

export interface SuburbIndex {
    suburbs: SuburbIndexEntry[];
    worst20: string[];
}

export interface SuburbDetail {
    name: string;
    slug: string;
    score: number;
    scoreExact: number;
    band: Band;
    breakdown: { frequency: number; coverage: number; reliability: number };
    viableCount: number;
    bestScore: number;
    medianWaitMinutes: number | null;
    stopCount: number;
    modeNoun: string;
    verdict: string;
    centroid: { lat: number; lon: number };
}

export interface DataManifest {
    fixture: boolean;
    gtfsGeneratedAt: string | null;
    methodologyVersion: string | null;
    dataBuiltAt: string;
    dataVintageLabel: string;
    stopCount: number;
    suburbCount: number;
    unattributedCount: number;
    unattributedPct: number;
}
