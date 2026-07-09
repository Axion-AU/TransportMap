use std::collections::HashSet;
use super::coverage::{band_for_distance, compute_stats, CoverageBand, CoverageStats, PopulationCell};
use super::corridors::{CandidateRoute, Poi};
use super::geo::haversine_m;

/// One unit of POI importance weight counts as this many "people" for
/// scoring purposes, so POIs nudge route selection without ever
/// outweighing the primary population-coverage targets. A policy choice,
/// documented on /methodology alongside the rest of the algorithm.
pub const POI_PERSON_EQUIVALENT: f64 = 400.0;
/// Newly covering a person within 400m is worth more than within 800m,
/// since the harder target (80%) is the 400m one.
pub const POP_400_WEIGHT: f64 = 1.0;
pub const POP_800_WEIGHT: f64 = 0.4;

pub const TARGET_PCT_400: f64 = 80.0;
pub const TARGET_PCT_800: f64 = 100.0;

const POI_CLAIM_RADIUS_M: f64 = 400.0;
const CELL_SEARCH_RADIUS_M: f64 = 800.0;

#[derive(Debug, Clone, serde::Serialize)]
pub struct SelectedRoute {
    pub corridor_id: String,
    pub name: String,
    pub stops: Vec<(f64, f64)>,
    pub length_km: f64,
    pub daily_vehicle_km: f64,
    pub newly_covered_population_400: f64,
    pub newly_covered_population_800: f64,
    pub poi_served: Vec<String>,
}

pub struct DesignResult {
    pub selected: Vec<SelectedRoute>,
    pub final_bands: Vec<CoverageBand>,
    pub baseline_stats: CoverageStats,
    pub final_stats: CoverageStats,
    pub targets_met: bool,
}

fn nearby_cell_indices(candidate: &CandidateRoute, cells: &[PopulationCell]) -> Vec<usize> {
    cells
        .iter()
        .enumerate()
        .filter_map(|(i, cell)| {
            candidate
                .stops
                .iter()
                .any(|(lat, lon)| haversine_m(cell.lat, cell.lon, *lat, *lon) <= CELL_SEARCH_RADIUS_M)
                .then_some(i)
        })
        .collect()
}

fn nearby_poi_indices(candidate: &CandidateRoute, poi: &[Poi]) -> Vec<usize> {
    poi.iter()
        .enumerate()
        .filter_map(|(i, p)| {
            candidate
                .stops
                .iter()
                .any(|(lat, lon)| haversine_m(p.lat, p.lon, *lat, *lon) <= POI_CLAIM_RADIUS_M)
                .then_some(i)
        })
        .collect()
}

fn candidate_best_distance(candidate: &CandidateRoute, lat: f64, lon: f64) -> f64 {
    candidate
        .stops
        .iter()
        .map(|(s_lat, s_lon)| haversine_m(lat, lon, *s_lat, *s_lon))
        .fold(f64::MAX, f64::min)
}

/// Greedy maximal-covering-location heuristic. Each round picks the
/// remaining candidate with the best (newly covered population + POI
/// bonus) per dollar of daily operating cost, commits it, and repeats
/// until both targets are met or no remaining candidate adds coverage.
/// `daily_cost_of` computes a candidate's assumed daily operating cost.
pub fn design(
    cells: &[PopulationCell],
    baseline_bands: &[CoverageBand],
    candidates: Vec<CandidateRoute>,
    poi: &[Poi],
    daily_cost_of: impl Fn(&CandidateRoute) -> f64,
) -> DesignResult {
    let baseline_stats = compute_stats(cells, baseline_bands);
    let mut bands = baseline_bands.to_vec();
    let mut poi_claimed: HashSet<usize> = HashSet::new();
    let mut selected = Vec::new();

    let nearby_cells: Vec<Vec<usize>> = candidates.iter().map(|c| nearby_cell_indices(c, cells)).collect();
    let nearby_poi: Vec<Vec<usize>> = candidates.iter().map(|c| nearby_poi_indices(c, poi)).collect();
    let mut taken = vec![false; candidates.len()];

    loop {
        let stats = compute_stats(cells, &bands);
        let targets_met = stats.pct_within_400 >= TARGET_PCT_400 && stats.pct_within_800 >= TARGET_PCT_800;
        if targets_met {
            let final_stats = stats;
            return DesignResult { selected, final_bands: bands, baseline_stats, final_stats, targets_met: true };
        }

        let mut best_idx: Option<usize> = None;
        let mut best_value = 0.0_f64;
        let mut best_new400 = 0.0_f64;
        let mut best_new800 = 0.0_f64;
        let mut best_poi_weight = 0.0_f64;

        for i in 0..candidates.len() {
            if taken[i] {
                continue;
            }
            let mut new400 = 0.0;
            let mut new800 = 0.0;
            for &ci in &nearby_cells[i] {
                let current = bands[ci];
                let d = candidate_best_distance(&candidates[i], cells[ci].lat, cells[ci].lon);
                let achievable = band_for_distance(d);
                if achievable > current {
                    match achievable {
                        CoverageBand::Covered400 => new400 += cells[ci].population,
                        CoverageBand::Covered800 => new800 += cells[ci].population,
                        CoverageBand::Uncovered => {}
                    }
                }
            }
            let poi_weight: f64 = nearby_poi[i]
                .iter()
                .filter(|pi| !poi_claimed.contains(*pi))
                .map(|pi| poi[*pi].weight)
                .sum();

            let coverage_value = new400 * POP_400_WEIGHT + new800 * POP_800_WEIGHT + poi_weight * POI_PERSON_EQUIVALENT;
            let cost = daily_cost_of(&candidates[i]).max(1e-6);
            let value = coverage_value / cost;

            if coverage_value > 0.0 && value > best_value {
                best_value = value;
                best_idx = Some(i);
                best_new400 = new400;
                best_new800 = new800;
                best_poi_weight = poi_weight;
            }
        }

        let Some(idx) = best_idx else {
            // No remaining candidate adds any coverage; report the honest shortfall.
            let final_stats = compute_stats(cells, &bands);
            return DesignResult { selected, final_bands: bands, baseline_stats, final_stats, targets_met: false };
        };

        // Commit: upgrade bands for this candidate's nearby cells and claim its POIs.
        for &ci in &nearby_cells[idx] {
            let d = candidate_best_distance(&candidates[idx], cells[ci].lat, cells[ci].lon);
            let achievable = band_for_distance(d);
            if achievable > bands[ci] {
                bands[ci] = achievable;
            }
        }
        let newly_claimed: Vec<usize> = nearby_poi[idx]
            .iter()
            .copied()
            .filter(|pi| !poi_claimed.contains(pi))
            .collect();
        let served_poi_names: Vec<String> = newly_claimed.iter().map(|pi| poi[*pi].name.clone()).collect();
        poi_claimed.extend(newly_claimed);

        taken[idx] = true;

        selected.push(SelectedRoute {
            corridor_id: candidates[idx].corridor_id.clone(),
            name: candidates[idx].name.clone(),
            stops: candidates[idx].stops.clone(),
            length_km: candidates[idx].length_km,
            // daily_cost_of returns dollars, not km; the caller (mod.rs)
            // knows trips_per_day() and fills this in from length_km.
            daily_vehicle_km: 0.0,
            newly_covered_population_400: best_new400,
            newly_covered_population_800: best_new800,
            poi_served: served_poi_names,
        });
        let _ = best_poi_weight;
        // `taken[idx]` already guards against reselecting this candidate;
        // at most `candidates.len()` iterations can ever commit a pick,
        // which is the loop's hard termination bound.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::corridors::CandidateRoute;

    fn cell(id: &str, lat: f64, lon: f64, population: f64) -> PopulationCell {
        PopulationCell { id: id.to_string(), lat, lon, population }
    }

    #[test]
    fn picks_the_cheaper_route_first_when_it_covers_the_same_population() {
        let cells = vec![cell("a", 0.0, 0.0, 1000.0)];
        let baseline = vec![CoverageBand::Uncovered];
        let cheap = CandidateRoute { corridor_id: "cheap".into(), name: "Cheap".into(), stops: vec![(0.0, 0.0)], length_km: 1.0 };
        let expensive = CandidateRoute { corridor_id: "exp".into(), name: "Expensive".into(), stops: vec![(0.0, 0.0)], length_km: 5.0 };

        let result = design(&cells, &baseline, vec![expensive, cheap], &[], |c| c.length_km * 10.0);
        assert_eq!(result.selected.len(), 1, "one route already covers the only cell, no need for a second");
        assert_eq!(result.selected[0].corridor_id, "cheap");
    }

    #[test]
    fn stops_once_targets_are_met_and_does_not_over_add() {
        let cells: Vec<PopulationCell> = (0..10).map(|i| cell(&format!("c{i}"), 0.0, 0.0, 100.0)).collect();
        let baseline = vec![CoverageBand::Uncovered; 10];
        let candidates = vec![CandidateRoute {
            corridor_id: "only".into(),
            name: "Only".into(),
            stops: vec![(0.0, 0.0)],
            length_km: 1.0,
        }];

        let result = design(&cells, &baseline, candidates, &[], |c| c.length_km);
        assert!(result.targets_met);
        assert_eq!(result.selected.len(), 1, "the loop must stop the instant targets are met, not keep adding");
    }

    #[test]
    fn reports_an_honest_shortfall_when_no_candidate_can_reach_the_target() {
        let cells = vec![cell("far", 10.0, 10.0, 1000.0)]; // nowhere near the only candidate
        let baseline = vec![CoverageBand::Uncovered];
        let candidates = vec![CandidateRoute {
            corridor_id: "useless".into(),
            name: "Useless".into(),
            stops: vec![(0.0, 0.0)],
            length_km: 1.0,
        }];

        let result = design(&cells, &baseline, candidates, &[], |c| c.length_km);
        assert!(!result.targets_met);
        assert!(result.selected.is_empty(), "a candidate that covers nothing should never be selected");
    }
}
