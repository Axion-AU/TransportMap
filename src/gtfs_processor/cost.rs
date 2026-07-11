use std::collections::{HashMap, HashSet};
use chrono::NaiveDate;
use super::scoring::is_service_active;

/// Per-route daily operating stats on the representative day: how many
/// trips run and how far they travel. The baseline for both "what does
/// the current network cost" and redundancy detection in network_design.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RouteCost {
    pub route_id: String,
    pub mode_id: u32,
    pub daily_trip_count: u32,
    pub daily_vehicle_km: f64,
}

/// Haversine length of a shape's polyline in kilometres. Shapes are
/// stored as (lon, lat) pairs, decimated by loader::load_shapes.
pub fn shape_length_km(points: &[(f64, f64)]) -> f64 {
    let mut km = 0.0;
    for pair in points.windows(2) {
        let (lon1, lat1) = pair[0];
        let (lon2, lat2) = pair[1];
        let d_lat = (lat2 - lat1) * 111.32;
        let mid_lat_rad = (lat1 + lat2) / 2.0 * std::f64::consts::PI / 180.0;
        let d_lon = (lon2 - lon1) * 111.32 * mid_lat_rad.cos();
        km += (d_lat * d_lat + d_lon * d_lon).sqrt();
    }
    km
}

/// Sums trips active on the representative day into per-route daily
/// vehicle-km. `trip_info` is (trip_id -> (route_id, service_id, shape_id, direction_id))
/// as produced by loader::load_trips; `shapes` is shape_id -> polyline.
pub fn aggregate_route_costs(
    trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
    shapes: &HashMap<String, Vec<(f64, f64)>>,
    service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
    service_days: &HashMap<String, HashSet<u8>>,
    service_exceptions: &HashMap<String, HashMap<NaiveDate, u8>>,
    repr_date: NaiveDate,
    mode_id: u32,
) -> HashMap<String, RouteCost> {
    // Cache shape lengths: many trips on a route reuse the same shape_id.
    let mut shape_km_cache: HashMap<&str, f64> = HashMap::new();
    let mut costs: HashMap<String, RouteCost> = HashMap::new();

    for (route_id, service_id, shape_opt, _direction_id) in trip_info.values() {
        if !is_service_active(service_id, repr_date, service_dates, service_days, service_exceptions) {
            continue;
        }
        let km = match shape_opt {
            Some(sid) => {
                if let Some(&cached) = shape_km_cache.get(sid.as_str()) {
                    cached
                } else if let Some(points) = shapes.get(sid) {
                    let len = shape_length_km(points);
                    shape_km_cache.insert(sid.as_str(), len);
                    len
                } else {
                    0.0
                }
            }
            None => 0.0,
        };

        let entry = costs.entry(route_id.clone()).or_insert_with(|| RouteCost {
            route_id: route_id.clone(),
            mode_id,
            daily_trip_count: 0,
            daily_vehicle_km: 0.0,
        });
        entry.daily_trip_count += 1;
        entry.daily_vehicle_km += km;
    }

    costs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shape_length_matches_known_distance() {
        // Roughly 0.1 degrees of latitude at any longitude is ~11.132km.
        let points = vec![(144.9631, -37.8136), (144.9631, -37.7136)];
        let km = shape_length_km(&points);
        assert!((km - 11.132).abs() < 0.05, "expected ~11.132km, got {km}");
    }

    #[test]
    fn shape_length_sums_multiple_segments() {
        let points = vec![(144.9631, -37.8136), (144.9631, -37.8036), (144.9631, -37.7936)];
        let km = shape_length_km(&points);
        assert!((km - 2.0 * 1.1132).abs() < 0.02, "expected ~2.226km, got {km}");
    }

    #[test]
    fn aggregate_counts_only_active_service_and_sums_correct_route() {
        let mut trip_info = HashMap::new();
        trip_info.insert("t1".to_string(), ("R1".to_string(), "weekday".to_string(), Some("s1".to_string()), 0u8));
        trip_info.insert("t2".to_string(), ("R1".to_string(), "weekday".to_string(), Some("s1".to_string()), 1u8));
        trip_info.insert("t3".to_string(), ("R2".to_string(), "weekend_only".to_string(), Some("s2".to_string()), 0u8));

        let mut shapes = HashMap::new();
        shapes.insert("s1".to_string(), vec![(144.9631, -37.8136), (144.9631, -37.8036)]);
        shapes.insert("s2".to_string(), vec![(144.9631, -37.8136), (144.9631, -37.7936)]);

        let mut service_days = HashMap::new();
        service_days.insert("weekday".to_string(), HashSet::from([0u8, 1, 2, 3, 4]));
        service_days.insert("weekend_only".to_string(), HashSet::from([5u8, 6]));
        let service_dates = HashMap::new();
        let service_exceptions = HashMap::new();

        // A Wednesday: weekday service active, weekend_only is not.
        let repr_date = NaiveDate::from_ymd_opt(2026, 7, 8).unwrap();
        let costs = aggregate_route_costs(&trip_info, &shapes, &service_dates, &service_days, &service_exceptions, repr_date, 4);

        assert_eq!(costs.len(), 1, "only R1 should have active trips on a Wednesday");
        let r1 = costs.get("R1").unwrap();
        assert_eq!(r1.daily_trip_count, 2);
        assert!((r1.daily_vehicle_km - 2.0 * 1.1132).abs() < 0.02);
        assert!(costs.get("R2").is_none());
    }
}

