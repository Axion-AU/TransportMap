use super::models::*;
use super::loader::*;
use super::aggregator::*;
use super::scoring::*;
use super::exporter::*;
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
        HashMap<String, String>
    ), Box<dyn Error>> 
{
     // 1. Calendars & Date
     let (service_days, service_dates) = load_calendar(dir)?;
     
     // Representative Date Logic
     let repr_date = if let Some((_, (start, end))) = service_dates.iter()
        .max_by_key(|(_, (start, end))| (*end - *start).num_days()) {
        
        let mut candidate = find_nth_weekday(*start, Weekday::Wed, 2);
        while candidate <= *end {
            let month = candidate.month();
            let day = candidate.day();
            let is_holiday_period = (month == 12 && day >= 20) || (month == 1 && day <= 5) || (month == 4 && day >= 18 && day <= 22);
            if !is_holiday_period { break; }
            candidate = candidate + chrono::Duration::days(7);
        }
        if candidate <= *end { candidate } else { *start }
    } else {
         NaiveDate::from_ymd_opt(2025, 6, 11).unwrap() 
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

     // 2. Routes
     let (mut routes_map, valid_routes) = load_routes(dir, mode_id)?;
     
     // 3. Trips
     let trip_info = load_trips(dir, &valid_routes, &service_days)?; 

     // UPDATE ROUTE SHAPES IDs 
     let mut route_shapes: HashMap<String, HashSet<String>> = HashMap::new();
     for (_, (rid, _, shape_opt)) in &trip_info {
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
         |sid| is_service_active(sid, repr_date, &service_dates, &service_days)
     )?;
     
     Ok((stops_map, routes_map, shapes, child_to_parent))
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
    
    for res in results {
        match res {
            Ok((sm, rm, shm, ctp)) => {
                final_stops_map.extend(sm);
                final_routes_map.extend(rm);
                final_shapes_map.extend(shm);
                final_child_to_parent.extend(ctp);
            },
            Err(e) => eprintln!("Error processing mode: {}", e),
        }
    }
    
    println!("Writing routes and shapes...");
    fs::write("frontend/public/data/routes.json", serde_json::to_string(&final_routes_map)?)?;
    fs::write("frontend/public/data/shapes.json", serde_json::to_string(&final_shapes_map)?)?;
    
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
