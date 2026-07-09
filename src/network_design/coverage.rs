use serde::Deserialize;
use super::geo::haversine_m;

#[derive(Debug, Clone, Deserialize)]
pub struct PopulationCell {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
    pub population: f64,
}

#[derive(Debug, Deserialize)]
pub struct PopulationGrid {
    pub fixture: bool,
    pub cells: Vec<PopulationCell>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CoverageBand {
    Uncovered = 0,
    Covered800 = 1,
    Covered400 = 2,
}

pub fn band_for_distance(distance_m: f64) -> CoverageBand {
    if distance_m <= 400.0 {
        CoverageBand::Covered400
    } else if distance_m <= 800.0 {
        CoverageBand::Covered800
    } else {
        CoverageBand::Uncovered
    }
}

/// Baseline band per cell against a fixed anchor set (today's high-quality
/// stops, before any new routes are proposed).
pub fn classify_baseline(cells: &[PopulationCell], anchors: &[(f64, f64)]) -> Vec<CoverageBand> {
    cells
        .iter()
        .map(|cell| {
            let best = anchors
                .iter()
                .map(|(lat, lon)| haversine_m(cell.lat, cell.lon, *lat, *lon))
                .fold(f64::MAX, f64::min);
            band_for_distance(best)
        })
        .collect()
}

#[derive(Debug, Clone, Copy)]
pub struct CoverageStats {
    pub total_population: f64,
    pub population_within_400: f64,
    pub population_within_800_cumulative: f64,
    pub pct_within_400: f64,
    pub pct_within_800: f64,
}

pub fn compute_stats(cells: &[PopulationCell], bands: &[CoverageBand]) -> CoverageStats {
    let total: f64 = cells.iter().map(|c| c.population).sum();
    let mut pop400 = 0.0;
    let mut pop800 = 0.0;
    for (cell, band) in cells.iter().zip(bands.iter()) {
        match band {
            CoverageBand::Covered400 => {
                pop400 += cell.population;
                pop800 += cell.population;
            }
            CoverageBand::Covered800 => {
                pop800 += cell.population;
            }
            CoverageBand::Uncovered => {}
        }
    }
    CoverageStats {
        total_population: total,
        population_within_400: pop400,
        population_within_800_cumulative: pop800,
        pct_within_400: if total > 0.0 { pop400 / total * 100.0 } else { 0.0 },
        pct_within_800: if total > 0.0 { pop800 / total * 100.0 } else { 0.0 },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cell(id: &str, lat: f64, lon: f64, population: f64) -> PopulationCell {
        PopulationCell { id: id.to_string(), lat, lon, population }
    }

    #[test]
    fn classifies_known_distances_into_correct_bands() {
        // 1 degree of latitude is ~111.32km; small offsets give predictable metres.
        let origin = (-37.8136, 144.9631);
        let cells = vec![
            cell("near", -37.8136 + 300.0 / 111_320.0, 144.9631, 100.0), // ~300m
            cell("mid", -37.8136 + 600.0 / 111_320.0, 144.9631, 100.0),  // ~600m
            cell("far", -37.8136 + 2000.0 / 111_320.0, 144.9631, 100.0), // ~2000m
        ];
        let bands = classify_baseline(&cells, &[origin]);
        assert_eq!(bands[0], CoverageBand::Covered400);
        assert_eq!(bands[1], CoverageBand::Covered800);
        assert_eq!(bands[2], CoverageBand::Uncovered);
    }

    #[test]
    fn stats_weight_by_population_not_cell_count() {
        let cells = vec![
            cell("a", 0.0, 0.0, 900.0),
            cell("b", 0.0, 0.0, 100.0),
        ];
        let bands = vec![CoverageBand::Covered400, CoverageBand::Uncovered];
        let stats = compute_stats(&cells, &bands);
        assert!((stats.pct_within_400 - 90.0).abs() < 0.001);
        assert!((stats.pct_within_800 - 90.0).abs() < 0.001);
    }
}
