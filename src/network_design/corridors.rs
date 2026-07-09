use serde::Deserialize;
use super::geo::haversine_m;

#[derive(Debug, Clone, Deserialize)]
pub struct RoadCorridor {
    pub id: String,
    pub name: String,
    pub polyline: Vec<(f64, f64)>, // (lat, lon) pairs
    pub length_km: f64,
}

#[derive(Debug, Deserialize)]
pub struct RoadCorridorSet {
    pub fixture: bool,
    pub corridors: Vec<RoadCorridor>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Poi {
    pub id: String,
    pub name: String,
    pub category: String,
    pub lat: f64,
    pub lon: f64,
    pub weight: f64,
}

#[derive(Debug, Deserialize)]
pub struct PoiSet {
    pub fixture: bool,
    pub points: Vec<Poi>,
}

/// Places stops every `spacing_m` along a polyline, always including the
/// start point. Handles polylines of any length by carrying leftover
/// distance across segments; for the two-point fixture corridors this
/// reduces to simple linear interpolation.
pub fn stops_along_corridor(polyline: &[(f64, f64)], spacing_m: f64) -> Vec<(f64, f64)> {
    if polyline.len() < 2 {
        return polyline.to_vec();
    }
    let mut stops = vec![polyline[0]];
    let mut carry = 0.0_f64;
    for w in polyline.windows(2) {
        let (lat1, lon1) = w[0];
        let (lat2, lon2) = w[1];
        let seg_len = haversine_m(lat1, lon1, lat2, lon2);
        if seg_len <= 0.0 {
            continue;
        }
        let mut d = spacing_m - carry;
        while d < seg_len {
            let t = d / seg_len;
            stops.push((lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t));
            d += spacing_m;
        }
        carry = seg_len - (d - spacing_m);
    }
    stops
}

#[derive(Debug, Clone)]
pub struct CandidateRoute {
    pub corridor_id: String,
    pub name: String,
    pub stops: Vec<(f64, f64)>,
    pub length_km: f64,
}

/// A candidate is only eligible if at least one of its synthesized stops
/// sits near an existing high-quality anchor: this is a feeder network,
/// not a set of disconnected new lines. `anchor_radius_m` is deliberately
/// looser than the 400m/800m walk-coverage thresholds; it answers "is this
/// corridor plausibly connectable to trunk transit", not "is a resident
/// within walking distance".
pub fn eligible_candidates(
    corridors: &[RoadCorridor],
    hq_stops: &[(f64, f64)],
    anchor_radius_m: f64,
    spacing_m: f64,
) -> Vec<CandidateRoute> {
    corridors
        .iter()
        .filter_map(|c| {
            let stops = stops_along_corridor(&c.polyline, spacing_m);
            let touches = stops
                .iter()
                .any(|(lat, lon)| hq_stops.iter().any(|(hlat, hlon)| haversine_m(*lat, *lon, *hlat, *hlon) <= anchor_radius_m));
            touches.then(|| CandidateRoute {
                corridor_id: c.id.clone(),
                name: c.name.clone(),
                stops,
                length_km: c.length_km,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_a_stop_at_the_start_and_every_spacing_interval() {
        // ~1000m north-south line at the equator: 0.009 degrees of lat ≈ 1001m.
        let polyline = vec![(0.0, 0.0), (0.009, 0.0)];
        let stops = stops_along_corridor(&polyline, 400.0);
        // Expect stops at 0m, ~400m, ~800m.
        assert_eq!(stops.len(), 3);
        assert_eq!(stops[0], (0.0, 0.0));
    }

    #[test]
    fn short_corridor_still_gets_a_start_stop() {
        let polyline = vec![(0.0, 0.0), (0.0001, 0.0)];
        let stops = stops_along_corridor(&polyline, 400.0);
        assert_eq!(stops.len(), 1);
    }

    #[test]
    fn eligibility_requires_proximity_to_a_high_quality_anchor() {
        let near = RoadCorridor {
            id: "c1".into(),
            name: "Near".into(),
            polyline: vec![(0.0, 0.0), (0.005, 0.0)],
            length_km: 0.5,
        };
        let far = RoadCorridor {
            id: "c2".into(),
            name: "Far".into(),
            polyline: vec![(1.0, 1.0), (1.005, 1.0)],
            length_km: 0.5,
        };
        let hq_stops = vec![(0.0, 0.0)];
        let eligible = eligible_candidates(&[near, far], &hq_stops, 1500.0, 400.0);
        assert_eq!(eligible.len(), 1);
        assert_eq!(eligible[0].corridor_id, "c1");
    }
}
