use super::models::*;
use super::loader::*;
use super::aggregator::*;
use super::scoring::*;
use super::exporter::*;
use super::cost::{aggregate_route_costs, RouteCost};
use super::routes::{aggregate_route_departures, build_route_facts, RouteFacts};
use rayon::prelude::*;
use geojson;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::path::Path;
use chrono::{NaiveDate, Datelike, Weekday};
use std::fs;
use csv;
use indicatif::{ProgressBar, ProgressStyle};

// How many near-term candidate dates to sample per weekday kind (Wed/Sat),
// and how far forward from today to look for them. A single representative
// date can land arbitrarily far in the future (the feed's calendar can span
// a year+), where it risks falling inside a real, already-published network
// change window in calendar_dates.txt (e.g. a route revision cancelling old
// trip patterns before publishing the replacement) and reading as near-total
// service loss for stops on the affected routes. Sampling several near-term
// dates and taking the per-stop MEDIAN trip count means a stop only drops
// out if it's inactive on most of the sample, not because of one
// exception-window date. N=5 keeps a clean median with headroom for 1-2
// holiday-week exclusions inside a 10-week window.
const REPRESENTATIVE_DATE_SAMPLE_SIZE: usize = 5;
const REPRESENTATIVE_DATE_WINDOW_WEEKS: i64 = 10;

fn is_holiday_week(d: NaiveDate) -> bool {
    (d.month() == 12 && d.day() >= 22) || (d.month() == 1 && d.day() <= 2)
}

// Near-term dates matching `weekday`, starting from `run_date`, excluding
// holiday weeks where enough non-holiday candidates exist. Falls back to
// `fallback` (as a single-element list) if the feed has no service dates.
fn pick_representative_dates(
    run_date: NaiveDate,
    weekday: Weekday,
    fallback: NaiveDate,
) -> Vec<NaiveDate> {
    let window_end = run_date + chrono::Duration::weeks(REPRESENTATIVE_DATE_WINDOW_WEEKS);
    let mut candidates = Vec::new();
    let mut curr = run_date;
    while curr <= window_end {
        if curr.weekday() == weekday {
            candidates.push(curr);
        }
        curr = curr + chrono::Duration::days(1);
    }

    let non_holiday: Vec<NaiveDate> = candidates.iter().cloned().filter(|&d| !is_holiday_week(d)).collect();
    if !non_holiday.is_empty() {
        candidates = non_holiday;
    }

    candidates.truncate(REPRESENTATIVE_DATE_SAMPLE_SIZE);
    if candidates.is_empty() {
        candidates.push(fallback);
    }
    candidates
}

// Merges N per-date route-cost maps (one per sampled weekday) into one, per
// route: daily_trip_count becomes the median across dates, and
// daily_vehicle_km is taken from whichever date achieved that median trip
// count (ties -> earliest date), keeping the pair internally consistent
// rather than independently medianed.
fn merge_route_costs_median(per_date: Vec<HashMap<String, RouteCost>>) -> HashMap<String, RouteCost> {
    let n = per_date.len();
    // A route absent from a date's map ran 0 trips that date (aggregate_route_costs
    // only inserts an entry when it finds an active trip) — that absence must count
    // toward the median just like an explicit 0, or a route knocked out on some
    // dates by calendar_dates.txt exceptions would have its median computed only
    // over the dates it happened to survive.
    let mut all_route_ids: HashSet<String> = HashSet::new();
    for map in &per_date {
        all_route_ids.extend(map.keys().cloned());
    }

    let mut merged = HashMap::new();
    for route_id in all_route_ids {
        let per_date_cost: Vec<Option<&RouteCost>> = per_date.iter().map(|m| m.get(&route_id)).collect();
        let mut counts: Vec<u32> = per_date_cost.iter().map(|c| c.map_or(0, |c| c.daily_trip_count)).collect();
        counts.sort_unstable();
        let median_count = counts[n / 2];

        if median_count == 0 {
            continue;
        }

        let best = per_date_cost.iter()
            .flatten()
            .min_by_key(|c| (c.daily_trip_count as i64 - median_count as i64).abs())
            .unwrap();

        merged.insert(route_id, RouteCost {
            route_id: best.route_id.clone(),
            mode_id: best.mode_id,
            daily_trip_count: median_count,
            daily_vehicle_km: best.daily_vehicle_km,
        });
    }
    merged
}

type RouteDeparturesEntry = (Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, Vec<(f32, u8)>, HashSet<u8>, u32);

fn process_mode_internal(mode_id: u32, mode_name: &str, dir: &str)
    -> Result<(
        HashMap<String, StopData>,
        HashMap<String, ProcessedRoute>,
        HashMap<String, Vec<(f64, f64)>>,
        HashMap<String, String>,
        HashMap<String, RouteCost>,
        NaiveDate,
        NaiveDate,
        Vec<NaiveDate>,
        Vec<NaiveDate>,
        HashMap<String, RouteDeparturesEntry>,
    ), Box<dyn Error>>
{
     // 1. Calendars & Date
     let (service_days, service_dates, service_exceptions) = load_calendar(dir)?;

     // 2. Routes
     let (mut routes_map, valid_routes) = load_routes(dir, mode_id)?;

     // 3. Trips
     let trip_info = load_trips(dir, &valid_routes, &service_days)?;

     let run_date = chrono::Local::now().date_naive();
     let (weekday_dates, weekend_dates) = if !service_dates.is_empty() {
         let weekday_dates = pick_representative_dates(run_date, Weekday::Wed, NaiveDate::from_ymd_opt(2025, 12, 17).unwrap());
         let weekend_dates = pick_representative_dates(run_date, Weekday::Sat, NaiveDate::from_ymd_opt(2025, 12, 20).unwrap());
         (weekday_dates, weekend_dates)
     } else {
         (vec![NaiveDate::from_ymd_opt(2025, 12, 17).unwrap()], vec![NaiveDate::from_ymd_opt(2025, 12, 20).unwrap()])
     };

     // "Primary" date per kind: the sampled date whose network-wide active-trip
     // count is closest to the median across the sample, for JSON output and
     // any downstream consumer that wants a single canonical date rather than
     // the full sampled set (e.g. the travel-time matrix scripts).
     fn primary_date(
         candidates: &[NaiveDate],
         trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
         service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
         service_days: &HashMap<String, HashSet<u8>>,
         service_exceptions: &HashMap<String, HashMap<NaiveDate, u8>>,
     ) -> NaiveDate {
         let mut counts: Vec<(NaiveDate, i32)> = candidates.iter().map(|&date| {
             let active_count = trip_info.values()
                 .filter(|(_, service_id, _, _)| is_service_active(service_id, date, service_dates, service_days, service_exceptions))
                 .count() as i32;
             (date, active_count)
         }).collect();
         counts.sort_by_key(|(_, count)| *count);
         counts[counts.len() / 2].0
     }

     let repr_weekday_date = primary_date(&weekday_dates, &trip_info, &service_dates, &service_days, &service_exceptions);
     let repr_weekend_date = primary_date(&weekend_dates, &trip_info, &service_dates, &service_days, &service_exceptions);

     // Pre-calculate active services
     let mut weekday_services = HashSet::new();
     let mut weekend_services = HashSet::new();
     for (sid, days) in &service_days {
          if days.contains(&0) || days.contains(&1) || days.contains(&2) || days.contains(&3) || days.contains(&4) {
              weekday_services.insert(sid.clone());
          }
          if days.contains(&5) || days.contains(&6) {
              weekend_services.insert(sid.clone());
          }
     }

     // UPDATE ROUTE SHAPES IDs 
     let mut route_shapes: HashMap<String, HashSet<String>> = HashMap::new();
     for (_, (rid, _, shape_opt, _)) in &trip_info {
          if let Some(sid) = shape_opt {
              route_shapes.entry(rid.clone()).or_default().insert(sid.clone());
          }
     }
     for (rid, route) in routes_map.iter_mut() {
          if let Some(shapes) = route_shapes.get(rid) {
              route.shape_ids = shapes.iter().cloned().collect();
          }
     }
     
     // 4. Shapes
     let shapes = load_shapes(dir)?;
     
     // 5. Stops
     let (raw_stops, raw_child_parents) = load_stops(dir)?;
     
     // Transform stops
     let mut stops_map = HashMap::new();
     for (id, s) in raw_stops {
          let pid = format!("{}-{}", mode_id, id);
          let mut data = StopData::new(s.stop_name, s.stop_lat, s.stop_lon, mode_id, mode_name.to_string());
          if s.location_type == Some(1) { data.is_parent = true; }
          stops_map.insert(pid, data);
     }
     
     let mut child_to_parent = HashMap::new();
     for (cid, pid) in raw_child_parents {
          let c_pid = format!("{}-{}", mode_id, cid);
          let p_pid = format!("{}-{}", mode_id, pid);
          child_to_parent.insert(c_pid, p_pid);
     }
     
     // 6. Aggregate
     aggregate_stop_times(
          dir,
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
     )?;

     // Per-route daily operating cost baseline: trip count and vehicle-km,
     // median across the same near-term sampled weekdays used for stop
     // scoring, so a route isn't zeroed out (or inflated) by a single date's
     // calendar_dates.txt exceptions. daily_vehicle_km is taken from
     // whichever sampled date achieved the median trip count, rather than
     // separately medianed, to keep the pair internally consistent.
     let route_costs = merge_route_costs_median(
          weekday_dates.iter().map(|&date| {
               aggregate_route_costs(&trip_info, &shapes, &service_dates, &service_days, &service_exceptions, date, mode_id)
          }).collect()
     );

     // Per-route frequency inputs (docs/route-scoring.md): the route's own
     // trips only, windowed and median-collapsed the same way as per-stop
     // aggregation, but keyed by route_id instead of stop_id.
     let route_departures = aggregate_route_departures(
          dir,
          &trip_info,
          &service_days,
          &weekday_dates,
          &weekend_dates,
          &service_dates,
          &service_exceptions,
     )?;

     Ok((stops_map, routes_map, shapes, child_to_parent, route_costs, repr_weekday_date, repr_weekend_date, weekday_dates, weekend_dates, route_departures))
}

pub fn run_processing(gtfs_root: &str) -> Result<(), Box<dyn Error>> {
    let modes = vec![
        (1, "regional_train", format!("{}/1/google_transit", gtfs_root)),
        (2, "metro_train", format!("{}/2/google_transit", gtfs_root)),
        (3, "metro_tram", format!("{}/3/google_transit", gtfs_root)),
        (4, "metro_bus", format!("{}/4/google_transit", gtfs_root)),
        (5, "regional_coach", format!("{}/5/google_transit", gtfs_root)),
        (6, "regional_bus", format!("{}/6/google_transit", gtfs_root)),
        (11, "skybus", format!("{}/11/google_transit", gtfs_root)),
    ];

    println!("Starting parallel processing of {} modes...", modes.len());

    let pb = ProgressBar::new(modes.len() as u64);
    pb.set_style(ProgressStyle::default_bar()
        .template("[{elapsed_precise}] {bar:40.cyan/blue} {pos}/{len} {msg}")
        .unwrap());

    let results: Vec<Result<_, String>> = modes.par_iter().map(|(mode_id, mode_name, dir)| {
         pb.set_message(format!("Processing {}", mode_name));
         let res = process_mode_internal(*mode_id, mode_name, dir);
         pb.inc(1);
         res.map_err(|e| e.to_string())
    }).collect(); 
    
    pb.finish_with_message("Done!");
    
    // Check results
    let mut final_stops_map = HashMap::new();
    let mut final_routes_map = HashMap::new();
    let mut final_shapes_map = HashMap::new();
    let mut final_child_to_parent = HashMap::new();
    let mut final_route_costs: HashMap<String, RouteCost> = HashMap::new();
    // (primary_weekday, primary_weekend, sampled_weekday_dates, sampled_weekend_dates)
    let mut representative_dates: HashMap<String, (NaiveDate, NaiveDate, Vec<NaiveDate>, Vec<NaiveDate>)> = HashMap::new();
    let mut final_route_departures: HashMap<String, RouteDeparturesEntry> = HashMap::new();

    for (res, (_, mode_name, _)) in results.into_iter().zip(modes.iter()) {
        match res {
            Ok((sm, rm, shm, ctp, rc, repr_weekday, repr_weekend, weekday_dates, weekend_dates, rd)) => {
                final_stops_map.extend(sm);
                final_routes_map.extend(rm);
                final_shapes_map.extend(shm);
                final_child_to_parent.extend(ctp);
                final_route_costs.extend(rc);
                representative_dates.insert(mode_name.to_string(), (repr_weekday, repr_weekend, weekday_dates, weekend_dates));
                final_route_departures.extend(rd);
            },
            Err(e) => eprintln!("Error processing mode: {}", e),
        }
    }

    // Written for frontend/scripts/r5py/compute_pt_matrix.py (Stage 2 travel-time
    // matrix, docs/methodology_refactor.md item 2 & 7) so the PT accessibility/car
    // competitiveness matrix runs on the same representative day already used for
    // per-stop scoring, rather than re-deriving a possibly-different date. metro_train
    // is used as the single whole-network date for the multimodal matrix run (it's
    // the network backbone connecting most origin-destination pairs); all per-mode
    // dates are included here too since they can differ slightly by feed.
    //
    // primary_weekday/primary_weekend stay single ISO dates for backward
    // compatibility with the two known consumers above, which only read
    // those fields. weekday_dates/weekend_dates carry the full near-term
    // sampled set (see driver.rs pick_representative_dates) for auditing —
    // e.g. confirming a suburb's stop counts recovered because the sample
    // is no longer dominated by one far-future exception-window date.
    if let Some((primary_weekday, primary_weekend, _, _)) = representative_dates.get("metro_train").cloned() {
        #[derive(serde::Serialize)]
        struct ModeDates {
            weekday_dates: Vec<String>,
            weekend_dates: Vec<String>,
            primary_weekday: String,
            primary_weekend: String,
        }
        #[derive(serde::Serialize)]
        struct RepresentativeDates {
            primary_weekday: String,
            primary_weekend: String,
            #[serde(rename = "byMode")]
            by_mode: HashMap<String, ModeDates>,
        }
        let payload = RepresentativeDates {
            primary_weekday: primary_weekday.to_string(),
            primary_weekend: primary_weekend.to_string(),
            by_mode: representative_dates.iter()
                .map(|(k, (wd, we, wds, wes))| (k.clone(), ModeDates {
                    weekday_dates: wds.iter().map(|d| d.to_string()).collect(),
                    weekend_dates: wes.iter().map(|d| d.to_string()).collect(),
                    primary_weekday: wd.to_string(),
                    primary_weekend: we.to_string(),
                }))
                .collect(),
        };
        fs::write("frontend/public/data/representative_dates.json", serde_json::to_string_pretty(&payload)?)?;
    }

    println!("Writing routes and shapes...");
    fs::write("frontend/public/data/routes.json", serde_json::to_string(&final_routes_map)?)?;
    fs::write("frontend/public/data/shapes.json", serde_json::to_string(&final_shapes_map)?)?;

    println!("Writing route costs ({} routes)...", final_route_costs.len());
    let route_costs_list: Vec<&RouteCost> = final_route_costs.values().collect();
    fs::write("frontend/public/data/routes_cost.json", serde_json::to_string(&route_costs_list)?)?;
    
    // LOAD PATRONAGE
    let mut patronage_map: HashMap<String, u32> = HashMap::new();
    if Path::new("frontend/public/data/annual_metropolitan_train_station_entries_fy_2024_2025.csv").exists() {
         let mut rdr = csv::Reader::from_path("frontend/public/data/annual_metropolitan_train_station_entries_fy_2024_2025.csv")?;
         for result in rdr.records() {
             if let Ok(record) = result {
                 if let (Some(name), Some(annual_str)) = (record.get(2), record.get(5)) {
                     if let Ok(annual) = annual_str.replace(",","").parse::<u32>() {
                         let norm = name.to_lowercase().replace(" railway station", "").trim().to_string();
                         patronage_map.insert(norm, annual);
                     }
                 }
             }
         }
         println!("Loaded {} patronage records", patronage_map.len());
    }
    
    // LOAD ARTERIAL ROADS
    let mut arterial_roads: HashSet<String> = HashSet::new();
    if Path::new("frontend/public/data/dtp_managed_roads.geojson").exists() {
        println!("Loading arterial roads...");
        let contents = fs::read_to_string("frontend/public/data/dtp_managed_roads.geojson")?;
        if let Ok(geojson) = contents.parse::<geojson::GeoJson>() {
            if let geojson::GeoJson::FeatureCollection(collection) = geojson {
                for feature in collection.features {
                    if let Some(props) = feature.properties {
                        // Extract RD_NAME and DEC_NAME
                        // Keys might be mixed case in JSON, but typically uppercase given the dump
                        for key in ["RD_NAME", "DEC_NAME", "LOCAL_NAME"] {
                             if let Some(val) = props.get(key) {
                                 if let Some(s) = val.as_str() {
                                     let clean = s.trim().to_uppercase();
                                     if !clean.is_empty() {
                                         arterial_roads.insert(clean);
                                     }
                                 }
                             }
                        }
                    }
                }
            }
        }
        println!("Loaded {} arterial road names", arterial_roads.len());
    }

    // SCORING
    let processed_stops = calculate_scores(&final_stops_map, &final_child_to_parent, &patronage_map, &final_routes_map, &arterial_roads);
    
    println!("Processed {} stops.", processed_stops.len());
    
    // EXPORT
    write_geojson_chunked(&processed_stops)?;

    // ROUTE FACTS (docs/route-scoring.md): canonicalise route_ids sharing a
    // (short_name, mode) key, union their trips/stops, and emit raw facts —
    // no scores. route_score composition happens in the frontend build step.
    println!("Building route facts...");
    let mut route_stop_ids: HashMap<String, HashSet<String>> = HashMap::new();
    for stop in &processed_stops {
        for route_id in &stop.route_ids {
            route_stop_ids.entry(route_id.clone()).or_default().insert(stop.id.clone());
        }
    }
    let route_facts: Vec<RouteFacts> = build_route_facts(&final_routes_map, &final_route_departures, &route_stop_ids, &final_shapes_map);
    println!("Wrote {} canonical routes.", route_facts.len());
    fs::write("frontend/public/data/route_facts.json", serde_json::to_string(&route_facts)?)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::cost::RouteCost;

    fn cost(trip_count: u32, km: f64) -> RouteCost {
        RouteCost { route_id: "R559".to_string(), mode_id: 4, daily_trip_count: trip_count, daily_vehicle_km: km }
    }

    // Same bug class as the Mill Park stop-count regression, at the route-cost
    // level: a route absent on one sampled date (calendar_dates.txt exception)
    // must not have its cost figures derived from that one date alone.
    #[test]
    fn merge_route_costs_median_survives_a_date_where_route_is_absent() {
        let per_date = vec![
            HashMap::from([("R559".to_string(), cost(10, 50.0))]),
            HashMap::from([("R559".to_string(), cost(10, 50.0))]),
            HashMap::from([("R559".to_string(), cost(10, 50.0))]),
            HashMap::new(), // service removed on this date, route absent entirely
            HashMap::from([("R559".to_string(), cost(10, 50.0))]),
        ];

        let merged = merge_route_costs_median(per_date);
        let r559 = merged.get("R559").unwrap();
        assert_eq!(r559.daily_trip_count, 10, "median of [10,10,10,0,10] is 10");
        assert_eq!(r559.daily_vehicle_km, 50.0);
    }

    #[test]
    fn merge_route_costs_median_drops_a_route_inactive_on_majority_of_dates() {
        let per_date = vec![
            HashMap::from([("R1".to_string(), cost(2, 5.0))]),
            HashMap::new(),
            HashMap::new(),
        ];
        let merged = merge_route_costs_median(per_date);
        assert!(merged.get("R1").is_none(), "median trip count is 0, route should be dropped");
    }
}
