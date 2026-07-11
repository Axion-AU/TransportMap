use super::models::*;
use crate::gtfs_processor::scoring::parse_gtfs_date;
use csv;
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::path::Path;
use chrono::NaiveDate;

pub fn load_calendar(dir: &str) -> Result<(
    HashMap<String, HashSet<u8>>,
    HashMap<String, (NaiveDate, NaiveDate)>,
    HashMap<String, HashMap<NaiveDate, u8>>,
), Box<dyn Error>> {
    let mut active_days = HashMap::new();
    let mut service_dates = HashMap::new();
    let calendar_path = format!("{}/calendar.txt", dir);

    if Path::new(&calendar_path).exists() {
        let mut rdr = csv::Reader::from_path(&calendar_path)?;
        for result in rdr.deserialize() {
            let record: GtfsCalendar = result?;
            let mut days = HashSet::new();
            if record.monday == 1 { days.insert(0); }
            if record.tuesday == 1 { days.insert(1); }
            if record.wednesday == 1 { days.insert(2); }
            if record.thursday == 1 { days.insert(3); }
            if record.friday == 1 { days.insert(4); }
            if record.saturday == 1 { days.insert(5); }
            if record.sunday == 1 { days.insert(6); }
            
            active_days.insert(record.service_id.clone(), days);
            
            if let (Some(start), Some(end)) = (parse_gtfs_date(&record.start_date), parse_gtfs_date(&record.end_date)) {
                service_dates.insert(record.service_id, (start, end));
            }
        }
    }

    let mut exceptions = HashMap::new();
    let calendar_dates_path = format!("{}/calendar_dates.txt", dir);
    if Path::new(&calendar_dates_path).exists() {
        let mut rdr = csv::Reader::from_path(&calendar_dates_path)?;
        for result in rdr.deserialize() {
            let record: GtfsCalendarDate = result?;
            if let Some(date) = parse_gtfs_date(&record.date) {
                exceptions.entry(record.service_id)
                    .or_insert_with(HashMap::new)
                    .insert(date, record.exception_type);
            }
        }
    }

    Ok((active_days, service_dates, exceptions))
}

pub fn load_routes(dir: &str, mode_id: u32) -> Result<(HashMap<String, ProcessedRoute>, HashSet<String>), Box<dyn Error>> {
    let mut routes_map = HashMap::new();
    let mut valid_routes = HashSet::new();
    let routes_path = format!("{}/routes.txt", dir);

    if Path::new(&routes_path).exists() {
        let mut rdr = csv::Reader::from_path(&routes_path)?;
        for result in rdr.deserialize() {
            let record: GtfsRoute = result?;
            
            if mode_id == 2 && record.route_long_name.to_lowercase().contains("replacement bus") {
                continue;
            }

            valid_routes.insert(record.route_id.clone());
            
            let default_color = match mode_id {
                1 => "8e44ad", 2 => "2980b9", 3 => "27ae60", 
                4 | 6 => "e67e22", 11 => "e74c3c", _ => "7f8c8d",
            };
            let color = record.route_color.unwrap_or(default_color.to_string());
            
            routes_map.insert(record.route_id.clone(), ProcessedRoute {
                id: record.route_id.clone(),
                short_name: record.route_short_name,
                long_name: record.route_long_name,
                color: format!("#{}", color),
                mode_id: mode_id,
                shape_ids: Vec::new(),
            });
        }
    }
    Ok((routes_map, valid_routes))
}

pub fn load_trips(dir: &str, valid_routes: &HashSet<String>, active_days: &HashMap<String, HashSet<u8>>)
    -> Result<HashMap<String, (String, String, Option<String>, u8)>, Box<dyn Error>>
{
    let mut trip_info = HashMap::new();
    let trips_path = format!("{}/trips.txt", dir);

    if Path::new(&trips_path).exists() {
        let mut rdr = csv::Reader::from_path(&trips_path)?;
        for result in rdr.deserialize() {
            let record: GtfsTrip = result?;
            if valid_routes.contains(&record.route_id) && active_days.contains_key(&record.service_id) {
                let direction: u8 = record.direction_id.as_deref().and_then(|d| d.parse().ok()).unwrap_or(0);
                trip_info.insert(record.trip_id, (record.route_id, record.service_id, record.shape_id, direction));
            }
        }
    }
    Ok(trip_info)
}

pub fn load_shapes(dir: &str) -> Result<HashMap<String, Vec<(f64, f64)>>, Box<dyn Error>> {
    let mut all_shapes: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    let shapes_path = format!("{}/shapes.txt", dir);

    if Path::new(&shapes_path).exists() {
        let mut raw_shapes: Vec<GtfsShape> = Vec::new();
        let mut rdr = csv::Reader::from_path(&shapes_path)?;
        for result in rdr.deserialize() {
            let record: GtfsShape = result?;
            raw_shapes.push(record);
        }
        
        raw_shapes.sort_by(|a, b| {
            a.shape_id.cmp(&b.shape_id)
                .then(a.shape_pt_sequence.cmp(&b.shape_pt_sequence))
        });
        
        let mut current_id = String::new();
        let mut current_points = Vec::new();
        
        for shape in raw_shapes {
            if shape.shape_id != current_id {
                if !current_id.is_empty() {
                    let simplified: Vec<_> = current_points.iter().step_by(3).cloned().collect();
                    all_shapes.insert(current_id.clone(), simplified);
                }
                current_id = shape.shape_id;
                current_points = Vec::new();
            }
            current_points.push((shape.shape_pt_lon, shape.shape_pt_lat));
        }
        if !current_id.is_empty() {
            let simplified: Vec<_> = current_points.iter().step_by(3).cloned().collect();
            all_shapes.insert(current_id, simplified);
        }
    }
    Ok(all_shapes)
}

pub fn load_stops(dir: &str) -> Result<(HashMap<String, GtfsStop>, HashMap<String, String>), Box<dyn Error>> {
    let mut stops_map = HashMap::new();
    let mut child_to_parent = HashMap::new();
    let stops_path = format!("{}/stops.txt", dir);

    if Path::new(&stops_path).exists() {
        let mut rdr = csv::Reader::from_path(&stops_path)?;
        for result in rdr.deserialize() {
            let record: GtfsStop = result?;
            
            if let Some(ref parent) = record.parent_station {
                 if !parent.is_empty() {
                     child_to_parent.insert(record.stop_id.clone(), parent.clone());
                 }
            }
            
            stops_map.insert(record.stop_id.clone(), record);
        }
    }
    Ok((stops_map, child_to_parent))
}

pub fn process_stop_times<F>(dir: &str, mut callback: F) -> Result<(), Box<dyn Error>>
where F: FnMut(GtfsStopTime)
{
    let st_path = format!("{}/stop_times.txt", dir);
    if Path::new(&st_path).exists() {
        let mut rdr = csv::Reader::from_path(&st_path)?;
        for result in rdr.deserialize() {
             if let Ok(record) = result {
                 callback(record);
             }
        }
    }
    Ok(())
}
