use std::collections::HashMap;
use std::error::Error;
use crate::gtfs_processor::cost::RouteCost;
use super::geo::haversine_m;
use super::Stop;

pub const DAYS_PER_YEAR: f64 = 365.0;

pub struct AnchorRate {
    pub cost_per_km: f64,
    pub source: String,
}

/// Reads the bus operating cost anchor straight from the frontend's
/// anchors.json so the Rust designer and the site's displayed citation
/// can never drift apart.
pub fn read_bus_operating_cost_anchor(anchors_path: &str) -> Result<AnchorRate, Box<dyn Error>> {
    let text = std::fs::read_to_string(anchors_path)?;
    let json: serde_json::Value = serde_json::from_str(&text)?;
    let anchor = &json["anchors"]["busOperatingCostPerKm"];
    let cost_per_km = anchor["value"]
        .as_f64()
        .ok_or("anchors.json: anchors.busOperatingCostPerKm.value missing or not a number")?;
    let source = anchor["source"].as_str().unwrap_or("unknown").to_string();
    Ok(AnchorRate { cost_per_km, source })
}

pub fn annual_cost(daily_vehicle_km: f64, cost_per_km: f64) -> f64 {
    daily_vehicle_km * cost_per_km * DAYS_PER_YEAR
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RedundantRoute {
    pub route_id: String,
    pub reason: String,
    pub annual_saving: f64,
}

/// A route is only ever a decommission candidate if it currently has no
/// high-quality stop on it (a route already carrying a trunk stop is not
/// "redundant", it likely is the trunk). Among those weak routes, only
/// flag one where every single stop is now covered; one uncovered stop
/// keeps the whole route in service.
pub fn detect_redundant_routes(
    all_stops: &[Stop],
    route_costs: &HashMap<String, RouteCost>,
    hq_stops: &[Stop],
    new_route_stops: &[(f64, f64)],
    cost_per_km: f64,
) -> Vec<RedundantRoute> {
    let mut by_route: HashMap<&str, Vec<&Stop>> = HashMap::new();
    for s in all_stops {
        for rid in &s.route_ids {
            by_route.entry(rid.as_str()).or_default().push(s);
        }
    }

    let mut redundant = Vec::new();
    for (route_id, stops) in &by_route {
        if stops.is_empty() {
            continue;
        }
        let is_weak = stops.iter().all(|s| s.final_score < super::assumptions::HIGH_QUALITY_THRESHOLD);
        if !is_weak {
            continue;
        }

        let all_covered = stops.iter().all(|s| {
            let near_hq = hq_stops.iter().any(|h| haversine_m(s.lat, s.lon, h.lat, h.lon) <= 400.0);
            let near_new = new_route_stops.iter().any(|(lat, lon)| haversine_m(s.lat, s.lon, *lat, *lon) <= 400.0);
            near_hq || near_new
        });
        if !all_covered {
            continue;
        }

        if let Some(rc) = route_costs.get(*route_id) {
            redundant.push(RedundantRoute {
                route_id: route_id.to_string(),
                reason: "every stop on this route is now within 400m of high-quality transit".to_string(),
                annual_saving: annual_cost(rc.daily_vehicle_km, cost_per_km),
            });
        }
    }
    redundant
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stop(id: &str, lat: f64, lon: f64, final_score: f32, route_ids: &[&str]) -> Stop {
        Stop {
            id: id.to_string(),
            name: id.to_string(),
            lat,
            lon,
            mode_id: 4,
            final_score,
            best_topology: "Local".to_string(),
            route_ids: route_ids.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn route_cost(route_id: &str, daily_vehicle_km: f64) -> (String, RouteCost) {
        (
            route_id.to_string(),
            RouteCost { route_id: route_id.to_string(), mode_id: 4, daily_trip_count: 20, daily_vehicle_km },
        )
    }

    #[test]
    fn flags_a_weak_route_whose_every_stop_is_now_covered() {
        let all_stops = vec![
            stop("s1", -37.80, 145.00, 20.0, &["R1"]),
            stop("s2", -37.801, 145.001, 25.0, &["R1"]),
        ];
        let hq_stops = vec![stop("hq1", -37.8001, 145.0001, 90.0, &["HQ"])];
        let route_costs: HashMap<_, _> = [route_cost("R1", 10.0)].into_iter().collect();

        let redundant = detect_redundant_routes(&all_stops, &route_costs, &hq_stops, &[], 6.5);
        assert_eq!(redundant.len(), 1);
        assert_eq!(redundant[0].route_id, "R1");
        assert!(redundant[0].annual_saving > 0.0);
    }

    #[test]
    fn does_not_flag_a_route_with_one_uncovered_stop() {
        let all_stops = vec![
            stop("s1", -37.80, 145.00, 20.0, &["R1"]),
            stop("s2", -39.0, 148.0, 25.0, &["R1"]), // far from anything
        ];
        let hq_stops = vec![stop("hq1", -37.8001, 145.0001, 90.0, &["HQ"])];
        let route_costs: HashMap<_, _> = [route_cost("R1", 10.0)].into_iter().collect();

        let redundant = detect_redundant_routes(&all_stops, &route_costs, &hq_stops, &[], 6.5);
        assert!(redundant.is_empty());
    }

    #[test]
    fn does_not_flag_a_route_that_already_has_a_high_quality_stop() {
        let all_stops = vec![
            stop("s1", -37.80, 145.00, 95.0, &["R1"]),
            stop("s2", -37.801, 145.001, 20.0, &["R1"]),
        ];
        let hq_stops = vec![stop("s1", -37.80, 145.00, 95.0, &["R1"])];
        let route_costs: HashMap<_, _> = [route_cost("R1", 10.0)].into_iter().collect();

        let redundant = detect_redundant_routes(&all_stops, &route_costs, &hq_stops, &[], 6.5);
        assert!(redundant.is_empty(), "a route already carrying a high-quality stop is not redundant");
    }
}
