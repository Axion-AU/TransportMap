use super::models::*;
use super::loader::*;
use super::aggregator::*;
use super::scoring::*;
use super::exporter::*;
use super::cost::{aggregate_route_costs, RouteCost};
use rayon::prelude::*;
use geojson;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::path::Path;
use chrono::{NaiveDate, Datelike, Weekday};
use std::fs;
use csv;
use indicatif::{ProgressBar, ProgressStyle};

fn process_mode_internal(mode_id: u32, mode_name: &str, dir: &str)
    -> Result<(
        HashMap<String, StopData>,
        HashMap<String, ProcessedRoute>,
        HashMap<String, Vec<(f64, f64)>>,
        HashMap<String, String>,
        HashMap<String, RouteCost>,
        NaiveDate,
        NaiveDate,
    ), Box<dyn Error>>
{
     // 1. Calendars & Date
     let (service_days, service_dates, service_exceptions) = load_calendar(dir)?;
     
     // 2. Routes
     let (mut routes_map, valid_routes) = load_routes(dir, mode_id)?;
     
     // 3. Trips
     let trip_info = load_trips(dir, &valid_routes, &service_days)?; 

     // Representative Date Logic: among all candidate weekdays of the given
     // kind across the feed's service range, pick the one with the MEDIAN
     // active-trip count rather than the maximum. Picking the maximum
     // systematically selects calendar_dates.txt exception_type=1 "added
     // service" outliers (one-off specials, extra event services) as the
     // baseline for every stop's frequency score, inflating them feed-wide.
     // The median represents a typical day; holiday weeks are excluded from
     // the pool where possible since they're atypical in the other direction.
     fn pick_representative_date(
         candidates: &[NaiveDate],
         trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
         service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
         service_days: &HashMap<String, HashSet<u8>>,
         service_exceptions: &HashMap<String, HashMap<NaiveDate, u8>>,
         fallback: NaiveDate,
     ) -> NaiveDate {
         if candidates.is_empty() {
             return fallback;
         }

         let mut counts: Vec<(NaiveDate, i32)> = candidates.iter().map(|&date| {
             let active_count = trip_info.values()
                 .filter(|(_, service_id, _, _)| is_service_active(service_id, date, service_dates, service_days, service_exceptions))
                 .count() as i32;
             (date, active_count)
         }).collect();

         let is_holiday_week = |d: NaiveDate| (d.month() == 12 && d.day() >= 22) || (d.month() == 1 && d.day() <= 2);
         let non_holiday: Vec<(NaiveDate, i32)> = counts.iter().cloned().filter(|(d, _)| !is_holiday_week(*d)).collect();
         if !non_holiday.is_empty() {
             counts = non_holiday;
         }

         counts.sort_by_key(|(_, count)| *count);
         counts[counts.len() / 2].0
     }

     let (repr_weekday_date, repr_weekend_date) = if !service_dates.is_empty() {
         let min_date = service_dates.values().map(|(start, _)| *start).min().unwrap();
         let max_date = service_dates.values().map(|(_, end)| *end).max().unwrap();

         let mut candidate_weds = Vec::new();
         let mut candidate_sats = Vec::new();
         let mut curr = min_date;
         while curr <= max_date {
             match curr.weekday() {
                 Weekday::Wed => candidate_weds.push(curr),
                 Weekday::Sat => candidate_sats.push(curr),
                 _ => {}
             }
             curr = curr + chrono::Duration::days(1);
         }

         let weekday = pick_representative_date(&candidate_weds, &trip_info, &service_dates, &service_days, &service_exceptions, NaiveDate::from_ymd_opt(2025, 12, 17).unwrap());
         let weekend = pick_representative_date(&candidate_sats, &trip_info, &service_dates, &service_days, &service_exceptions, NaiveDate::from_ymd_opt(2025, 12, 20).unwrap());
         (weekday, weekend)
     } else {
         (NaiveDate::from_ymd_opt(2025, 12, 17).unwrap(), NaiveDate::from_ymd_opt(2025, 12, 20).unwrap())
     };

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
          |sid| is_service_active(sid, repr_weekday_date, &service_dates, &service_days, &service_exceptions),
          |sid| is_service_active(sid, repr_weekend_date, &service_dates, &service_days, &service_exceptions)
     )?;

     // Per-route daily operating cost baseline: trip count and vehicle-km
     // on the same representative day used for scoring, so the network
     // designer's "current cost" is directly comparable to its proposals.
     let route_costs = aggregate_route_costs(&trip_info, &shapes, &service_dates, &service_days, &service_exceptions, repr_weekday_date, mode_id);

     Ok((stops_map, routes_map, shapes, child_to_parent, route_costs, repr_weekday_date, repr_weekend_date))
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
    let mut representative_dates: HashMap<String, (NaiveDate, NaiveDate)> = HashMap::new();

    for (res, (_, mode_name, _)) in results.into_iter().zip(modes.iter()) {
        match res {
            Ok((sm, rm, shm, ctp, rc, repr_weekday, repr_weekend)) => {
                final_stops_map.extend(sm);
                final_routes_map.extend(rm);
                final_shapes_map.extend(shm);
                final_child_to_parent.extend(ctp);
                final_route_costs.extend(rc);
                representative_dates.insert(mode_name.to_string(), (repr_weekday, repr_weekend));
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
    if let Some((primary_weekday, primary_weekend)) = representative_dates.get("metro_train").cloned() {
        #[derive(serde::Serialize)]
        struct RepresentativeDates {
            primary_weekday: String,
            primary_weekend: String,
            #[serde(rename = "byMode")]
            by_mode: HashMap<String, (String, String)>,
        }
        let payload = RepresentativeDates {
            primary_weekday: primary_weekday.to_string(),
            primary_weekend: primary_weekend.to_string(),
            by_mode: representative_dates.iter()
                .map(|(k, (wd, we))| (k.clone(), (wd.to_string(), we.to_string())))
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
    
    Ok(())
}
