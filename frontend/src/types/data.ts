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

export interface ProposedRoute {
    id: string;
    name: string;
    stops: [number, number][];
    length_km: number;
    daily_vehicle_km: number;
    annual_cost: number;
    newly_covered_population_400: number;
    newly_covered_population_800: number;
    poi_served: string[];
}

export interface RedundantRoute {
    route_id: string;
    reason: string;
    annual_saving: number;
}

export interface NetworkPlanAssumptions {
    peak_headway_min: number;
    offpeak_headway_min: number;
    span_start_hour: number;
    span_end_hour: number;
    trips_per_day: number;
    stop_spacing_m: number;
    anchor_radius_m: number;
}

/** Output of the Rust feeder-network designer (src/network_design). */
export interface NetworkPlan {
    fixture: boolean;
    stub?: boolean;
    generated_at: string;
    high_quality_threshold: number;
    baseline_pct_within_400: number;
    baseline_pct_within_800: number;
    proposed_pct_within_400: number;
    proposed_pct_within_800: number;
    targets_met: boolean;
    total_population: number;
    proposed_routes: ProposedRoute[];
    redundant_routes: RedundantRoute[];
    new_network_annual_cost: number;
    decommission_annual_savings: number;
    net_annual_cost: number;
    current_total_network_annual_cost: number;
    cost_per_km: number;
    cost_source: string;
    assumptions: NetworkPlanAssumptions;
}
