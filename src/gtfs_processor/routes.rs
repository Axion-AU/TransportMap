use super::models::*;
use super::loader::process_stop_times;
use super::scoring::{parse_time, is_service_active, calculate_headway_score, calculate_service_span_score,
    calculate_reliability_score, combine_window_waits, calculate_average_wait_time_bidirectional};
use super::cost::shape_length_km;
use chrono::NaiveDate;
use std::collections::{HashMap, HashSet};
use std::error::Error;

/// `(normalised route_short_name, mode)` for bus/tram/coach/skybus; train
/// lines (mode_id 1/2) key on `route_long_name` instead since they have no
/// meaningful short name. Normalisation: trim, uppercase, strip leading
/// zero-padding, so "059", "59", " 59 " all collapse to the same key.
pub fn canonical_key(route: &ProcessedRoute) -> String {
    if route.mode_id == 1 || route.mode_id == 2 {
        let name = route.long_name.trim().to_uppercase();
        return format!("{}::{}", route.mode_id, name);
    }
    let raw = route.short_name.trim().to_uppercase();
    let stripped = raw.trim_start_matches('0');
    let normalised = if stripped.is_empty() { "0".to_string() } else { stripped.to_string() };
    format!("{}::{}", route.mode_id, normalised)
}

fn is_school_special(name_lower: &str) -> bool {
    name_lower.contains("school")
}

fn is_rail_replacement_or_special(name_lower: &str) -> bool {
    name_lower.contains("replacement bus") || name_lower.contains("rail replacement")
        || name_lower.contains("special event") || name_lower.contains("shuttle - event")
}

/// A canonical route: the union of one or more GTFS `route_id`s sharing a
/// `canonical_key`. Facts only, no scores — scoring happens in the
/// frontend build step from this plus the mesh-block population file, per
/// docs/route-scoring.md.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RouteFacts {
    pub canonical_key: String,
    pub short_name: String,
    pub long_name: String,
    pub mode_id: u32,
    pub color: String,
    pub member_route_ids: Vec<String>,

    // Frequency inputs, computed the same way as the per-stop frequency key
    // (scoring.rs calculate_scores) but from the union of the route's own
    // trips only.
    pub peak_wait_minutes: f32,
    pub offpeak_wait_minutes: f32,
    pub weekend_wait_minutes: f32,
    pub headway_score: f32,
    pub span_score: f32,
    pub reliability_score: f32,
    pub frequency_score: f32,
    pub active_days: usize,
    pub span_hours: f32,
    pub trips_per_weekday: u32,

    // Geometry: representative shape (greatest stop count, ties by shape
    // length), used for directness and the page map only.
    pub representative_shape_id: Option<String>,
    pub shape_length_km: f64,
    pub terminus_a: Option<(f64, f64)>,
    pub terminus_b: Option<(f64, f64)>,
    pub is_loop: bool,

    // Stops served (union across merged route_ids), for catchment and
    // suburbs-served.
    pub stop_ids: Vec<String>,

    // Classification flags.
    pub school_special: bool,
    pub rail_replacement_or_special: bool,
}

struct RouteAgg {
    wd_am: Vec<Vec<(f32, u8)>>,
    wd_pm: Vec<Vec<(f32, u8)>>,
    wd_mid: Vec<Vec<(f32, u8)>>,
    wd_eve: Vec<Vec<(f32, u8)>>,
    we_dep: Vec<Vec<(f32, u8)>>,
    weekday_trip_counts: Vec<HashSet<String>>,
    active_days: HashSet<u8>,
    seen_trips: HashSet<(usize, String)>,
}

impl RouteAgg {
    fn new(n_wd: usize, n_we: usize) -> Self {
        Self {
            wd_am: vec![Vec::new(); n_wd],
            wd_pm: vec![Vec::new(); n_wd],
            wd_mid: vec![Vec::new(); n_wd],
            wd_eve: vec![Vec::new(); n_wd],
            we_dep: vec![Vec::new(); n_we],
            weekday_trip_counts: vec![HashSet::new(); n_wd],
            active_days: HashSet::new(),
            seen_trips: HashSet::new(),
        }
    }
}

fn median_idx(counts: &[usize]) -> usize {
    if counts.is_empty() { return 0; }
    let mut sorted = counts.to_vec();
    sorted.sort_unstable();
    let median = sorted[sorted.len() / 2];
    counts.iter().position(|&c| c == median).unwrap_or(0)
}

/// One pass over stop_times.txt, bucketing each trip's earliest-seen
/// departure time (a proxy for "when this trip runs", not tied to any one
/// stop) into the route's own peak/offpeak/weekend windows, per sampled
/// representative date, then taking the median across dates — same
/// discipline as aggregator::aggregate_stop_times, applied per-route
/// instead of per-stop so a route's frequency reflects only its own trips.
pub fn aggregate_route_departures(
    dir: &str,
    trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
    service_days: &HashMap<String, HashSet<u8>>,
    weekday_dates: &[NaiveDate],
    weekend_dates: &[NaiveDate],
    service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
    service_exceptions: &HashMap<String, HashMap<NaiveDate, u8>>,
) -> Result<HashMap<String, (Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, HashSet<u8>, u32)>, Box<dyn Error>> {
    let n_wd = weekday_dates.len();
    let n_we = weekend_dates.len();
    let mut trip_first_time: HashMap<String, f32> = HashMap::new();

    process_stop_times(dir, |record| {
        if let Some(hour) = parse_time(&record.arrival_time) {
            trip_first_time
                .entry(record.trip_id.clone())
                .and_modify(|t| if hour < *t { *t = hour; })
                .or_insert(hour);
        }
    })?;

    let mut agg_map: HashMap<String, RouteAgg> = HashMap::new();

    for (trip_id, hour) in &trip_first_time {
        let Some((route_id, service_id, _, direction_id)) = trip_info.get(trip_id) else { continue };
        let agg = agg_map.entry(route_id.clone()).or_insert_with(|| RouteAgg::new(n_wd, n_we));

        for (idx, &date) in weekday_dates.iter().enumerate() {
            if is_service_active(service_id, date, service_dates, service_days, service_exceptions) {
                if agg.seen_trips.insert((idx, trip_id.clone())) {
                    agg.weekday_trip_counts[idx].insert(trip_id.clone());
                    let h = *hour;
                    if h >= 7.0 && h < 9.0 { agg.wd_am[idx].push((h, *direction_id)); }
                    else if h >= 16.0 && h < 18.0 { agg.wd_pm[idx].push((h, *direction_id)); }
                    else if h >= 9.0 && h < 16.0 { agg.wd_mid[idx].push((h, *direction_id)); }
                    else if h >= 18.0 && h < 22.0 { agg.wd_eve[idx].push((h, *direction_id)); }
                }
                if let Some(days) = service_days.get(service_id) {
                    for d in days { agg.active_days.insert(*d); }
                }
            }
        }
        for (idx, &date) in weekend_dates.iter().enumerate() {
            if is_service_active(service_id, date, service_dates, service_days, service_exceptions) {
                if *hour >= 7.0 && *hour < 22.0 {
                    agg.we_dep[idx].push((*hour, *direction_id));
                }
                if let Some(days) = service_days.get(service_id) {
                    for d in days { agg.active_days.insert(*d); }
                }
            }
        }
    }

    let mut result = HashMap::new();
    for (route_id, agg) in agg_map {
        let wd_idx = median_idx(&agg.weekday_trip_counts.iter().map(|s| s.len()).collect::<Vec<_>>());
        let we_idx = if n_we > 0 { median_idx(&agg.we_dep.iter().map(|d| d.len()).collect::<Vec<_>>()) } else { 0 };
        let trips_per_weekday = agg.weekday_trip_counts.get(wd_idx).map(|s| s.len()).unwrap_or(0) as u32;
        result.insert(route_id, (
            agg.wd_am.get(wd_idx).cloned().unwrap_or_default(),
            agg.wd_pm.get(wd_idx).cloned().unwrap_or_default(),
            agg.wd_mid.get(wd_idx).cloned().unwrap_or_default(),
            agg.wd_eve.get(wd_idx).cloned().unwrap_or_default(),
            agg.we_dep.get(we_idx).cloned().unwrap_or_default(),
            agg.active_days.clone(),
            trips_per_weekday,
        ));
    }
    Ok(result)
}

/// Merges GTFS route_ids sharing a canonical key into RouteFacts. Trips are
/// unioned for frequency (the per-route-id departure buckets are simply
/// concatenated before recomputing the windowed wait times), stops are
/// unioned for catchment/suburbs-served, and the representative shape is
/// the variant with the most stops (ties by length).
pub fn build_route_facts(
    routes_map: &HashMap<String, ProcessedRoute>,
    route_departures: &HashMap<String, (Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, HashSet<u8>, u32)>,
    route_stop_ids: &HashMap<String, HashSet<String>>,
    shapes: &HashMap<String, Vec<(f64, f64)>>,
) -> Vec<RouteFacts> {
    let mut groups: HashMap<String, Vec<&ProcessedRoute>> = HashMap::new();
    for route in routes_map.values() {
        groups.entry(canonical_key(route)).or_default().push(route);
    }

    let mut out = Vec::new();
    for (key, members) in groups {
        // Prefer the shortest/cleanest short_name and longest long_name among members for display.
        let display = members.iter().min_by_key(|r| r.short_name.len()).unwrap();
        let long_name_lower = members.iter().map(|r| r.long_name.to_lowercase()).collect::<Vec<_>>().join(" ");

        let mut wd_am = Vec::new();
        let mut wd_pm = Vec::new();
        let mut wd_mid = Vec::new();
        let mut wd_eve = Vec::new();
        let mut we_dep = Vec::new();
        let mut active_days: HashSet<u8> = HashSet::new();
        let mut trips_per_weekday = 0u32;
        let mut stop_ids: HashSet<String> = HashSet::new();

        let mut best_shape: Option<(&String, usize, f64)> = None; // (shape_id, stop_count_proxy, length_km)

        for r in &members {
            if let Some((am, pm, mid, eve, we, days, trips)) = route_departures.get(&r.id) {
                wd_am.extend(am.iter().cloned());
                wd_pm.extend(pm.iter().cloned());
                wd_mid.extend(mid.iter().cloned());
                wd_eve.extend(eve.iter().cloned());
                we_dep.extend(we.iter().cloned());
                trips_per_weekday += trips;
                // A raw union of GTFS service_days across every merged
                // route_id undercounts real operating days for routes
                // whose variants split across several fragmented calendar
                // entries (confirmed on 901/903: real 7-day SmartBus
                // orbitals showing active_days=2). Weekday/weekend
                // presence (does the route run any trips at all in the
                // sampled weekday window vs. the sampled weekend window)
                // is a coarser but far more robust signal of "how many of
                // the week's day-types does this route serve" than
                // reconstructing exact calendar day-of-week coverage from
                // merged, possibly-inconsistent per-variant calendars.
                let runs_weekdays = !am.is_empty() || !pm.is_empty() || !mid.is_empty() || !eve.is_empty();
                let runs_weekends = !we.is_empty();
                if runs_weekdays { active_days.extend([0u8, 1, 2, 3, 4]); }
                if runs_weekends { active_days.extend([5u8, 6]); }
                let _ = days; // superseded by the weekday/weekend presence signal above
            }
            if let Some(ids) = route_stop_ids.get(&r.id) {
                stop_ids.extend(ids.iter().cloned());
            }
            for shape_id in &r.shape_ids {
                let len = shapes.get(shape_id).map(|pts| shape_length_km(pts)).unwrap_or(0.0);
                let pt_count = shapes.get(shape_id).map(|pts| pts.len()).unwrap_or(0);
                let better = match &best_shape {
                    None => true,
                    Some((_, best_pts, best_len)) => pt_count > *best_pts || (pt_count == *best_pts && len > *best_len),
                };
                if better {
                    best_shape = Some((shape_id, pt_count, len));
                }
            }
        }

        let peak_wait = combine_window_waits(&wd_am, &wd_pm);
        let offpeak_wait = combine_window_waits(&wd_mid, &wd_eve);
        let weekend_wait = calculate_average_wait_time_bidirectional(&we_dep);

        let headway_score = (calculate_headway_score(peak_wait) * 0.6)
            + (calculate_headway_score(offpeak_wait) * 0.25)
            + (calculate_headway_score(weekend_wait) * 0.15);

        let mut all_deps: Vec<f32> = Vec::new();
        all_deps.extend(wd_am.iter().map(|(t, _)| *t));
        all_deps.extend(wd_pm.iter().map(|(t, _)| *t));
        all_deps.extend(wd_mid.iter().map(|(t, _)| *t));
        all_deps.extend(wd_eve.iter().map(|(t, _)| *t));
        let span_score = calculate_service_span_score(&all_deps, active_days.len(), false, 0.0);
        let span_hours = if all_deps.is_empty() {
            0.0
        } else {
            let min = all_deps.iter().cloned().fold(f32::INFINITY, f32::min);
            let max = all_deps.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            max - min
        };
        let reliability_score = calculate_reliability_score(active_days.len());
        let frequency_total = (headway_score * 0.60) + (span_score * 0.30) + (reliability_score * 0.10);

        let (representative_shape_id, shape_length_km_val) = match best_shape {
            Some((sid, _, len)) => (Some(sid.clone()), len),
            None => (None, 0.0),
        };
        let (terminus_a, terminus_b) = match &representative_shape_id {
            Some(sid) => match shapes.get(sid) {
                Some(pts) if pts.len() >= 2 => {
                    let a = pts.first().unwrap();
                    let b = pts.last().unwrap();
                    (Some((a.1, a.0)), Some((b.1, b.0))) // (lat, lon)
                }
                _ => (None, None),
            },
            None => (None, None),
        };
        let is_loop = match (terminus_a, terminus_b) {
            (Some(a), Some(b)) => {
                let d_lat = (a.0 - b.0) * 111.32;
                let mid_lat_rad = (a.0 + b.0) / 2.0 * std::f64::consts::PI / 180.0;
                let d_lon = (a.1 - b.1) * 111.32 * mid_lat_rad.cos();
                (d_lat * d_lat + d_lon * d_lon).sqrt() < 1.0
            }
            _ => false,
        };

        let name_lower = format!("{} {}", display.short_name.to_lowercase(), long_name_lower);
        let school_special = is_school_special(&name_lower) || trips_per_weekday < 6 || active_days.len() < 4;
        let rail_replacement_or_special = is_rail_replacement_or_special(&name_lower);

        out.push(RouteFacts {
            canonical_key: key,
            short_name: display.short_name.clone(),
            long_name: display.long_name.clone(),
            mode_id: display.mode_id,
            color: display.color.clone(),
            member_route_ids: members.iter().map(|r| r.id.clone()).collect(),
            peak_wait_minutes: peak_wait,
            offpeak_wait_minutes: offpeak_wait,
            weekend_wait_minutes: weekend_wait,
            headway_score,
            span_score,
            reliability_score,
            frequency_score: frequency_total,
            active_days: active_days.len(),
            span_hours,
            trips_per_weekday,
            representative_shape_id,
            shape_length_km: shape_length_km_val,
            terminus_a,
            terminus_b,
            is_loop,
            stop_ids: stop_ids.into_iter().collect(),
            school_special,
            rail_replacement_or_special,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(id: &str, short: &str, long: &str, mode_id: u32) -> ProcessedRoute {
        ProcessedRoute { id: id.to_string(), short_name: short.to_string(), long_name: long.to_string(), color: "#000".to_string(), mode_id, shape_ids: vec![] }
    }

    #[test]
    fn canonical_key_strips_zero_padding_and_case_for_bus() {
        assert_eq!(canonical_key(&route("r1", "059", "Bus", 4)), canonical_key(&route("r2", "59", "bus", 4)));
    }

    #[test]
    fn canonical_key_uses_long_name_for_train() {
        let a = route("r1", "", "Mernda", 2);
        let b = route("r2", "", "mernda", 2);
        assert_eq!(canonical_key(&a), canonical_key(&b));
    }

    #[test]
    fn canonical_key_differs_across_modes() {
        let bus = route("r1", "1", "One", 4);
        let tram = route("r2", "1", "One", 3);
        assert_ne!(canonical_key(&bus), canonical_key(&tram));
    }

    #[test]
    fn median_idx_picks_middle_value() {
        assert_eq!(median_idx(&[5, 5, 0, 5, 5]), 0);
    }
}
