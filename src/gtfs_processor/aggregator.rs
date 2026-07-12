use super::models::*;
use super::loader::process_stop_times;
use super::scoring::{parse_time, is_service_active};
use chrono::NaiveDate;
use std::collections::{HashMap, HashSet};
use std::error::Error;

// Per-stop, per-candidate-date accumulator. Kept local to this pass rather
// than on StopData: only the median-collapsed result (trip_count) and the
// single median-representative date's departures survive into StopData.
struct StopAgg {
    weekday_counts: Vec<u32>,
    weekend_counts: Vec<u32>,
    wd_am: Vec<Vec<(f32, u8)>>,
    wd_pm: Vec<Vec<(f32, u8)>>,
    wd_mid: Vec<Vec<(f32, u8)>>,
    wd_eve: Vec<Vec<(f32, u8)>>,
    we_dep: Vec<Vec<(f32, u8)>>,
    recorded_wd: HashSet<(usize, String)>,
    recorded_we: HashSet<(usize, String)>,
}

impl StopAgg {
    fn new(n_wd: usize, n_we: usize) -> Self {
        Self {
            weekday_counts: vec![0; n_wd],
            weekend_counts: vec![0; n_we],
            wd_am: vec![Vec::new(); n_wd],
            wd_pm: vec![Vec::new(); n_wd],
            wd_mid: vec![Vec::new(); n_wd],
            wd_eve: vec![Vec::new(); n_wd],
            we_dep: vec![Vec::new(); n_we],
            recorded_wd: HashSet::new(),
            recorded_we: HashSet::new(),
        }
    }
}

// Given per-date counts, returns (index of the date whose count is closest
// to the median, the median count value itself). Ties broken by earliest
// date (smallest index). Used both to set the robust trip_count (the median
// value) and to pick one internally-consistent day's departures to display
// (the date nearest that median), rather than unioning departures across
// dates, which would let a single date's one-off "added service" specials
// inflate every stop's apparent frequency.
fn median_index(counts: &[u32]) -> (usize, u32) {
    if counts.is_empty() {
        return (0, 0);
    }
    let mut sorted = counts.to_vec();
    sorted.sort_unstable();
    let median_value = sorted[sorted.len() / 2];

    let mut best_idx = 0;
    let mut best_diff = i64::MAX;
    for (idx, &count) in counts.iter().enumerate() {
        let diff = (count as i64 - median_value as i64).abs();
        if diff < best_diff {
            best_diff = diff;
            best_idx = idx;
        }
    }
    (best_idx, median_value)
}

pub fn aggregate_stop_times(
    dir: &str,
    mode_id: u32,
    stops_map: &mut HashMap<String, StopData>,
    child_to_parent: &HashMap<String, String>,
    trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
    service_days: &HashMap<String, HashSet<u8>>,
    weekday_services: &HashSet<String>,
    weekend_services: &HashSet<String>,
    weekday_dates: &[NaiveDate],
    weekend_dates: &[NaiveDate],
    service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
    service_exceptions: &HashMap<String, HashMap<NaiveDate, u8>>,
) -> Result<(), Box<dyn Error>> {
    let n_wd = weekday_dates.len();
    let n_we = weekend_dates.len();
    let mut agg_map: HashMap<String, StopAgg> = HashMap::new();

    process_stop_times(dir, |record| {
        let unique_stop_id = format!("{}-{}", mode_id, record.stop_id);
        let target_id = child_to_parent
            .get(&unique_stop_id)
            .cloned()
            .unwrap_or(unique_stop_id);

        if !stops_map.contains_key(&target_id) {
            return;
        }

        let Some((route_id, service_id, shape_id_opt, direction_id)) = trip_info.get(&record.trip_id) else {
            return;
        };

        let hour_opt = parse_time(&record.arrival_time);
        let agg = agg_map
            .entry(target_id.clone())
            .or_insert_with(|| StopAgg::new(n_wd, n_we));

        let mut any_weekday_active = false;
        for (idx, &date) in weekday_dates.iter().enumerate() {
            if is_service_active(service_id, date, service_dates, service_days, service_exceptions) {
                any_weekday_active = true;
                agg.weekday_counts[idx] += 1;
                if let Some(hour) = hour_opt {
                    if weekday_services.contains(service_id) && agg.recorded_wd.insert((idx, record.trip_id.clone())) {
                        if hour >= 7.0 && hour < 9.0 {
                            agg.wd_am[idx].push((hour, *direction_id));
                        } else if hour >= 16.0 && hour < 18.0 {
                            agg.wd_pm[idx].push((hour, *direction_id));
                        } else if hour >= 9.0 && hour < 16.0 {
                            agg.wd_mid[idx].push((hour, *direction_id));
                        } else if hour >= 18.0 && hour < 22.0 {
                            agg.wd_eve[idx].push((hour, *direction_id));
                        }
                    }
                }
            }
        }

        let mut any_weekend_active = false;
        for (idx, &date) in weekend_dates.iter().enumerate() {
            if is_service_active(service_id, date, service_dates, service_days, service_exceptions) {
                any_weekend_active = true;
                agg.weekend_counts[idx] += 1;
                if let Some(hour) = hour_opt {
                    if weekend_services.contains(service_id)
                        && hour >= 7.0 && hour < 22.0
                        && agg.recorded_we.insert((idx, record.trip_id.clone()))
                    {
                        agg.we_dep[idx].push((hour, *direction_id));
                    }
                }
            }
        }

        if any_weekday_active || any_weekend_active {
            if let Some(stop_data) = stops_map.get_mut(&target_id) {
                if any_weekday_active {
                    stop_data.routes.insert(route_id.clone());
                    if let Some(sid) = shape_id_opt {
                        stop_data.shapes.insert(sid.clone());
                    }
                }
                if let Some(days) = service_days.get(service_id) {
                    for d in days {
                        stop_data.active_days.insert(*d);
                    }
                }
            }
        }
    })?;

    for (stop_id, agg) in agg_map {
        if let Some(stop_data) = stops_map.get_mut(&stop_id) {
            let (median_wd_idx, median_wd_count) = median_index(&agg.weekday_counts);
            stop_data.trip_count = median_wd_count;
            if n_wd > 0 {
                stop_data.weekday_am_peak_departures = agg.wd_am[median_wd_idx].clone();
                stop_data.weekday_pm_peak_departures = agg.wd_pm[median_wd_idx].clone();
                stop_data.weekday_midday_departures = agg.wd_mid[median_wd_idx].clone();
                stop_data.weekday_evening_departures = agg.wd_eve[median_wd_idx].clone();
            }

            if n_we > 0 {
                let (median_we_idx, _) = median_index(&agg.weekend_counts);
                stop_data.weekend_departures = agg.we_dep[median_we_idx].clone();
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_stop_times(dir: &std::path::Path, rows: &[(&str, &str, &str)]) {
        let mut content = String::from("trip_id,stop_id,arrival_time\n");
        for (trip_id, stop_id, arrival) in rows {
            content.push_str(&format!("{},{},{}\n", trip_id, stop_id, arrival));
        }
        fs::write(dir.join("stop_times.txt"), content).unwrap();
    }

    #[test]
    fn median_index_picks_closest_to_median_and_breaks_ties_early() {
        let (idx, median) = median_index(&[5, 5, 0, 5, 5]);
        assert_eq!(median, 5);
        assert_eq!(idx, 0);
    }

    #[test]
    fn median_index_empty_returns_zero() {
        let (idx, median) = median_index(&[]);
        assert_eq!((idx, median), (0, 0));
    }

    // Regression test for the Mill Park / Thomastown bug: a stop served by a
    // route that has a calendar_dates.txt service-removal exception on ONE
    // of the sampled dates (e.g. a real, already-published network change
    // affecting a future date) must keep its trip_count from the other,
    // unaffected dates rather than collapsing to whatever that one date says.
    #[test]
    fn trip_count_survives_a_single_exception_date_via_median() {
        let tmp = std::env::temp_dir().join(format!("tie_agg_test_{}", std::process::id()));
        fs::create_dir_all(&tmp).unwrap();
        write_stop_times(&tmp, &[("t1", "s1", "08:00:00")]);

        let mode_id = 4u32;
        let mut stops_map = HashMap::new();
        stops_map.insert("4-s1".to_string(), StopData::new("Stop 1".into(), -37.68, 145.06, mode_id, "metro_bus".into()));
        let child_to_parent = HashMap::new();

        let mut trip_info = HashMap::new();
        trip_info.insert("t1".to_string(), ("R559".to_string(), "svc1".to_string(), None, 0u8));

        let mut service_days = HashMap::new();
        service_days.insert("svc1".to_string(), HashSet::from([0u8, 1, 2, 3, 4]));
        let mut weekday_services = HashSet::new();
        weekday_services.insert("svc1".to_string());
        let weekend_services = HashSet::new();

        let weekday_dates: Vec<NaiveDate> = (0..5)
            .map(|i| NaiveDate::from_ymd_opt(2026, 9, 2 + i * 7).unwrap()) // 5 consecutive Wednesdays
            .collect();
        let weekend_dates: Vec<NaiveDate> = vec![];

        let mut service_dates = HashMap::new();
        service_dates.insert(
            "svc1".to_string(),
            (NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(), NaiveDate::from_ymd_opt(2026, 12, 31).unwrap()),
        );

        // One future date (the 4th sampled Wednesday) has the service removed,
        // mirroring the real 2026-09-16 statewide calendar_dates.txt exceptions.
        let mut service_exceptions = HashMap::new();
        let mut exceptions_for_svc1 = HashMap::new();
        exceptions_for_svc1.insert(weekday_dates[3], 2u8);
        service_exceptions.insert("svc1".to_string(), exceptions_for_svc1);

        aggregate_stop_times(
            tmp.to_str().unwrap(),
            mode_id,
            &mut stops_map,
            &child_to_parent,
            &trip_info,
            &service_days,
            &weekday_services,
            &weekend_services,
            &weekday_dates,
            &weekend_dates,
            &service_dates,
            &service_exceptions,
        ).unwrap();

        fs::remove_dir_all(&tmp).ok();

        let stop = stops_map.get("4-s1").unwrap();
        assert_eq!(stop.trip_count, 1, "median across 4 active + 1 removed date should still be 1, not 0");
        assert_eq!(stop.weekday_am_peak_departures.len(), 1);
    }
}
