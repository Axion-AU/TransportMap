//! Policy choices for synthesized feeder routes. These are not derived
//! from data; they are the service level Fusion is proposing to fund.
//! Kept in one place and documented verbatim on /methodology.

/// Stop spacing along a candidate corridor, matching the walk-catchment
/// radius used everywhere else on the site.
pub const STOP_SPACING_M: f64 = 400.0;

/// How close a corridor's stops must come to an existing high-quality
/// stop to count as "connectable to trunk transit". Looser than the
/// 400m/800m coverage thresholds on purpose; see corridors.rs.
pub const ANCHOR_RADIUS_M: f64 = 1500.0;

/// Score at or above which a stop counts as "high quality", matching the
/// "decent" band boundary already shown on every score page.
pub const HIGH_QUALITY_THRESHOLD: f32 = 70.0;

pub const PEAK_HEADWAY_MIN: f64 = 15.0;
pub const OFFPEAK_HEADWAY_MIN: f64 = 30.0;
pub const SPAN_START_HOUR: f64 = 7.0;
pub const SPAN_END_HOUR: f64 = 21.0;
/// Weekday morning + evening peak, 7-9am and 4-6pm.
pub const PEAK_HOURS_TOTAL: f64 = 4.0;

/// Round-trip daily service, both directions, at the headways above.
pub fn trips_per_day() -> f64 {
    let offpeak_hours = (SPAN_END_HOUR - SPAN_START_HOUR) - PEAK_HOURS_TOTAL;
    let peak_trips = (PEAK_HOURS_TOTAL * 60.0) / PEAK_HEADWAY_MIN;
    let offpeak_trips = (offpeak_hours * 60.0) / OFFPEAK_HEADWAY_MIN;
    (peak_trips + offpeak_trips) * 2.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trips_per_day_matches_hand_calculation() {
        // (4h*60/15 + 10h*60/30) * 2 directions = (16 + 20) * 2 = 72
        assert_eq!(trips_per_day(), 72.0);
    }
}
