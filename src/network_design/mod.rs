//! Feeder-network designer: given today's scored stops, a population
//! surface, points of interest, and candidate road corridors, proposes a
//! bus network that connects residents to high-quality transit, and
//! prices it net of any existing routes it makes redundant.
//!
//! Population, POI, and road-corridor data are synthetic for now (see
//! frontend/scripts/gen-network-fixture.mjs); real datasets can replace
//! those three input files without changing anything here.

pub mod assumptions;
pub mod coverage;
pub mod corridors;
pub mod cost;
pub mod geo;
pub mod synthesis;

use std::collections::HashMap;
use std::error::Error;
use std::fs;
use geojson::GeoJson;
use serde::Serialize;

use crate::gtfs_processor::cost::RouteCost;
use assumptions::{trips_per_day, ANCHOR_RADIUS_M, HIGH_QUALITY_THRESHOLD, STOP_SPACING_M};
use corridors::{eligible_candidates, CandidateRoute, PoiSet, RoadCorridorSet};
use coverage::{classify_baseline, compute_stats, PopulationGrid};
use cost::{annual_cost, detect_redundant_routes, read_bus_operating_cost_anchor, RedundantRoute};
use synthesis::design;

#[derive(Debug, Clone)]
pub struct Stop {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub mode_id: u32,
    pub final_score: f32,
    pub best_topology: String,
    pub route_ids: Vec<String>,
}

const STOP_FILES: [&str; 7] = [
    "stops_metro_train.geojson",
    "stops_metro_tram.geojson",
    "stops_metro_bus.geojson",
    "stops_regional_train.geojson",
    "stops_regional_coach.geojson",
    "stops_regional_bus.geojson",
    "stops_skybus.geojson",
];

fn load_stops(data_dir: &str) -> Result<(Vec<Stop>, bool), Box<dyn Error>> {
    let mut stops = Vec::new();
    let mut fixture = false;
    for file in STOP_FILES {
        let path = format!("{data_dir}/{file}");
        if !std::path::Path::new(&path).exists() {
            continue;
        }
        let text = fs::read_to_string(&path)?;
        let geo: GeoJson = text.parse()?;
        let GeoJson::FeatureCollection(fc) = geo else { continue };
        if let Some(fm) = &fc.foreign_members {
            if fm.get("fixture").and_then(|v| v.as_bool()).unwrap_or(false) {
                fixture = true;
            }
        }
        for f in fc.features {
            let Some(props) = &f.properties else { continue };
            let Some(geometry) = &f.geometry else { continue };
            let geojson::Value::Point(coords) = &geometry.value else { continue };
            let (lon, lat) = (coords[0], coords[1]);
            let id = props.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let name = props.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            let mode_id = props.get("mode_id").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let final_score = props.get("final_score").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
            let best_topology = props
                .get("best_topology")
                .and_then(|v| v.as_str())
                .unwrap_or("Local")
                .to_string();
            let route_ids = props
                .get("route_ids")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            stops.push(Stop { id, name, lat, lon, mode_id, final_score, best_topology, route_ids });
        }
    }
    Ok((stops, fixture))
}

#[derive(Debug, Serialize)]
pub struct ProposedRouteOut {
    pub id: String,
    pub name: String,
    pub stops: Vec<(f64, f64)>,
    pub length_km: f64,
    pub daily_vehicle_km: f64,
    pub annual_cost: f64,
    pub newly_covered_population_400: f64,
    pub newly_covered_population_800: f64,
    pub poi_served: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct AssumptionsOut {
    pub peak_headway_min: f64,
    pub offpeak_headway_min: f64,
    pub span_start_hour: f64,
    pub span_end_hour: f64,
    pub trips_per_day: f64,
    pub stop_spacing_m: f64,
    pub anchor_radius_m: f64,
}

#[derive(Debug, Serialize)]
pub struct NetworkPlan {
    pub fixture: bool,
    pub generated_at: String,
    pub high_quality_threshold: f32,
    pub baseline_pct_within_400: f64,
    pub baseline_pct_within_800: f64,
    pub proposed_pct_within_400: f64,
    pub proposed_pct_within_800: f64,
    pub targets_met: bool,
    pub total_population: f64,
    pub proposed_routes: Vec<ProposedRouteOut>,
    pub redundant_routes: Vec<RedundantRoute>,
    pub new_network_annual_cost: f64,
    pub decommission_annual_savings: f64,
    pub net_annual_cost: f64,
    pub current_total_network_annual_cost: f64,
    pub cost_per_km: f64,
    pub cost_source: String,
    pub assumptions: AssumptionsOut,
}

pub fn run(data_dir: &str, anchors_path: &str) -> Result<NetworkPlan, Box<dyn Error>> {
    let (all_stops, stops_fixture) = load_stops(data_dir)?;
    let hq_stops: Vec<Stop> = all_stops.iter().filter(|s| s.final_score >= HIGH_QUALITY_THRESHOLD).cloned().collect();
    let hq_coords: Vec<(f64, f64)> = hq_stops.iter().map(|s| (s.lat, s.lon)).collect();

    let population: PopulationGrid = serde_json::from_str(&fs::read_to_string(format!("{data_dir}/population_grid.json"))?)?;
    let poi_set: PoiSet = serde_json::from_str(&fs::read_to_string(format!("{data_dir}/poi.json"))?)?;
    let corridor_set: RoadCorridorSet = serde_json::from_str(&fs::read_to_string(format!("{data_dir}/road_corridors.json"))?)?;

    let route_costs_list: Vec<RouteCost> = serde_json::from_str(&fs::read_to_string(format!("{data_dir}/routes_cost.json"))?)?;
    let route_costs: HashMap<String, RouteCost> = route_costs_list.into_iter().map(|rc| (rc.route_id.clone(), rc)).collect();

    let anchor = read_bus_operating_cost_anchor(anchors_path)?;

    let baseline_bands = classify_baseline(&population.cells, &hq_coords);
    let baseline_stats = compute_stats(&population.cells, &baseline_bands);

    let candidates = eligible_candidates(&corridor_set.corridors, &hq_coords, ANCHOR_RADIUS_M, STOP_SPACING_M);

    let trips = trips_per_day();
    let cost_per_km = anchor.cost_per_km;
    let daily_cost_of = |c: &CandidateRoute| c.length_km * trips * cost_per_km;

    let result = design(&population.cells, &baseline_bands, candidates, &poi_set.points, daily_cost_of);

    let mut new_route_stop_points: Vec<(f64, f64)> = Vec::new();
    let proposed_routes: Vec<ProposedRouteOut> = result
        .selected
        .iter()
        .map(|r| {
            let daily_vehicle_km = r.length_km * trips;
            new_route_stop_points.extend(r.stops.iter().copied());
            ProposedRouteOut {
                id: r.corridor_id.clone(),
                name: r.name.clone(),
                stops: r.stops.clone(),
                length_km: r.length_km,
                daily_vehicle_km,
                annual_cost: annual_cost(daily_vehicle_km, cost_per_km),
                newly_covered_population_400: r.newly_covered_population_400,
                newly_covered_population_800: r.newly_covered_population_800,
                poi_served: r.poi_served.clone(),
            }
        })
        .collect();

    let redundant_routes = detect_redundant_routes(&all_stops, &route_costs, &hq_stops, &new_route_stop_points, cost_per_km);

    let new_network_annual_cost: f64 = proposed_routes.iter().map(|r| r.annual_cost).sum();
    let decommission_annual_savings: f64 = redundant_routes.iter().map(|r| r.annual_saving).sum();
    let current_total_network_annual_cost: f64 =
        route_costs.values().map(|rc| annual_cost(rc.daily_vehicle_km, cost_per_km)).sum();

    let fixture = stops_fixture || population.fixture || poi_set.fixture || corridor_set.fixture;

    Ok(NetworkPlan {
        fixture,
        generated_at: chrono::Utc::now().to_rfc3339(),
        high_quality_threshold: HIGH_QUALITY_THRESHOLD,
        baseline_pct_within_400: baseline_stats.pct_within_400,
        baseline_pct_within_800: baseline_stats.pct_within_800,
        proposed_pct_within_400: result.final_stats.pct_within_400,
        proposed_pct_within_800: result.final_stats.pct_within_800,
        targets_met: result.targets_met,
        total_population: baseline_stats.total_population,
        proposed_routes,
        redundant_routes,
        new_network_annual_cost,
        decommission_annual_savings,
        net_annual_cost: new_network_annual_cost - decommission_annual_savings,
        current_total_network_annual_cost,
        cost_per_km,
        cost_source: anchor.source,
        assumptions: AssumptionsOut {
            peak_headway_min: assumptions::PEAK_HEADWAY_MIN,
            offpeak_headway_min: assumptions::OFFPEAK_HEADWAY_MIN,
            span_start_hour: assumptions::SPAN_START_HOUR,
            span_end_hour: assumptions::SPAN_END_HOUR,
            trips_per_day: trips,
            stop_spacing_m: STOP_SPACING_M,
            anchor_radius_m: ANCHOR_RADIUS_M,
        },
    })
}

pub fn write_plan(plan: &NetworkPlan, out_path: &str) -> Result<(), Box<dyn Error>> {
    fs::write(out_path, serde_json::to_string(plan)?)?;
    Ok(())
}
