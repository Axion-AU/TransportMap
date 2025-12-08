use crate::models::TransportOption;

pub struct ConnectivityCalculator;

impl ConnectivityCalculator {
    pub fn calculate_total_score(options: &[TransportOption]) -> f32 {
        let viable_count = options.iter()
            .filter(|o| o.raw_score > 50.0)
            .count() as f32;

        let best_score = options.iter()
            .map(|o| o.raw_score)
            .fold(0.0, f32::max);

        // Cap at 100.0
        let score = (viable_count * 20.0) + (best_score * 0.4);
        score.min(100.0)
    }
}

pub fn calculate_parking_score(drive_time: f32, arrival_time_mins: u32, fill_time_mins: u32) -> f32 {
    // 1. Accessibility Score: Shorter drive is better
    // Typically <20 min drive is required
    let access_component = (100.0 - drive_time * 2.0).max(0.0) * 0.5;

    // 2. Availability Score: Based on arrival vs fill time
    let availability_factor = if arrival_time_mins < fill_time_mins {
        // Arriving before full: Determine probability/comfort
        let mins_before = (fill_time_mins - arrival_time_mins) as f32;
        (mins_before / 60.0).min(1.0)
    } else {
        // Arriving after full: Rapid decay
        let mins_after = (arrival_time_mins - fill_time_mins) as f32;
        (0.3 - (mins_after / 120.0)).max(0.0)
    };
    
    // Weighted combination
    access_component + (availability_factor * 100.0 * 0.5)
}

pub fn calculate_walk_score(minutes: f32, freq_score: f32, coverage_score: f32) -> f32 {
    let walk_component = (100.0 - minutes * 5.0).max(0.0) * 0.4; // 5 min = 75pts, 15 min = 25pts
    let freq_component = freq_score * 0.4;
    let cov_component = coverage_score * 0.2;
    
    walk_component + freq_component + cov_component
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AccessMode, TransportOption};

    #[test]
    fn test_connectivity_score() {
        let options = vec![
            TransportOption { mode: AccessMode::FeederBus, raw_score: 80.0, is_viable: true, time_sensitive: false },
            TransportOption { mode: AccessMode::WalkToPT, raw_score: 60.0, is_viable: true, time_sensitive: false },
            TransportOption { mode: AccessMode::BikeToPT, raw_score: 40.0, is_viable: false, time_sensitive: false },
        ];
        // Viable count = 2 -> 40 points
        // Best score = 80 -> 32 points
        // Total = 72
        let score = ConnectivityCalculator::calculate_total_score(&options);
        assert_eq!(score, 72.0);
    }

    #[test]
    fn test_parking_score_early() {
        // Drive 10 mins (Score: (100 - 20) * 0.5 = 40)
        // Arrive 30 mins early (Factor: 30/60 = 0.5) -> 0.5 * 50 = 25
        // Total = 65
        let score = calculate_parking_score(10.0, 420, 450); // 7:00 vs 7:30
        assert_eq!(score, 65.0);
    }

    #[test]
    fn test_parking_score_late() {
        // Drive 10 mins (Score: 40)
        // Arrive 10 mins late (Factor: 0.3 - (10/120) = 0.3 - 0.0833 = 0.2166) -> 0.2166 * 50 = 10.83
        // Total = 50.83
        let score = calculate_parking_score(10.0, 460, 450); // 7:40 vs 7:30
        assert!((score - 50.833).abs() < 0.01);
    }

    #[test]
    fn test_walk_score() {
        // 5 mins walk -> (100 - 25) * 0.4 = 30
        // Freq 80 -> 32
        // Cov 60 -> 12
        // Total = 74
        let score = calculate_walk_score(5.0, 80.0, 60.0);
        assert_eq!(score, 74.0);
    }
}
