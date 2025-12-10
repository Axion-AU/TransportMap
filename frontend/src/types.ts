export interface Route {
    id: string;
    short_name: string;
    long_name: string;
    color: string;
    mode_id?: number;
    shape_ids?: string[];
}

export interface NearbyStop {
    id: string;
    name: string;
    mode_name: string;
    distance: number;
}

export interface Stop {
    id: string;
    name: string;
    lat: number;
    lon: number;
    mode_id: number;
    mode_name: string;

    frequency_score: number;
    headway_score: number;
    service_span_score: number;
    reliability_score: number;

    coverage_score: number;
    network_coverage_score: number;
    local_coverage_score: number;

    connectivity_score: number;
    base_score: number;
    final_score: number;

    freq_penalty_multiplier: number;
    catch_penalty_multiplier: number;

    average_wait_time: number;
    color: string;
    route_ids: string[];
    shape_ids?: string[];
    nearby_stops?: NearbyStop[];
    patronage_annual?: number;
    sub_stops?: Stop[];

    // New Network Coverage Components
    hub_reachability_score: number;
    cbd_direct_score: number;
    orbital_directness_score: number;
    connectivity_tier: string;

    // Inter-Modality
    intermodal_bonus?: number;
    intermodal_breakdown?: string[];
    connected_modes?: string[];
    train_stops_nearby?: ConnectedStopInfo[];
    tram_stops_nearby?: ConnectedStopInfo[];
    bus_stops_nearby?: ConnectedStopInfo[];
}

export interface ConnectedStopInfo {
    name: string;
    mode: string;
    score: number;
    distance: number;
    route_summary: string;
}
