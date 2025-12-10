use super::models::*;
use super::loader::process_stop_times;
use super::scoring::parse_time;
use std::collections::{HashMap, HashSet};
use std::error::Error;

pub fn aggregate_stop_times<F>(
    dir: &str,
    mode_id: u32,
    stops_map: &mut HashMap<String, StopData>,
    child_to_parent: &HashMap<String, String>,
    trip_info: &HashMap<String, (String, String, Option<String>)>,
    service_days: &HashMap<String, HashSet<u8>>,
    weekday_services: &HashSet<String>,
    weekend_services: &HashSet<String>,
    is_service_active: F
) -> Result<(), Box<dyn Error>> 
where F: Fn(&str) -> bool
{
    process_stop_times(dir, |record| {
        let unique_stop_id = format!("{}-{}", mode_id, record.stop_id);
        let target_id = child_to_parent.get(&unique_stop_id).map(|s| s.as_str()).unwrap_or(&unique_stop_id); // child_to_parent values are String

        // Note: child_to_parent returns String, stops_map keys are String (owned).
        // target_id above is &str.
        // stops_map.get_mut expects &str. Matches.
        
        if let Some((route_id, service_id, shape_id_opt)) = trip_info.get(&record.trip_id) {
            // Apply service checks
            if is_service_active(service_id) {
                if let Some(stop_data) = stops_map.get_mut(target_id) {
                     stop_data.trip_count += 1;
                     stop_data.routes.insert(route_id.clone());
                     if let Some(sid) = shape_id_opt {
                         stop_data.shapes.insert(sid.clone());
                     }
                     
                     // Reliability: Add active days
                     if let Some(days) = service_days.get(service_id) {
                         for d in days { stop_data.active_days.insert(*d); }
                     }
                     
                     // Time logic
                     if let Some(hour) = parse_time(&record.arrival_time) {
                         let is_weekday = weekday_services.contains(service_id);
                         let is_weekend = weekend_services.contains(service_id);
                         
                         if is_weekday {
                            if (hour >= 7.0 && hour < 9.0) || (hour >= 16.0 && hour < 18.0) {
                                if stop_data.recorded_peak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_peak_departures.push(hour);
                                }
                            } else if (hour >= 9.0 && hour < 16.0) || (hour >= 18.0 && hour < 22.0) {
                                if stop_data.recorded_offpeak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_offpeak_departures.push(hour);
                                }
                            }
                         }
                         if is_weekend {
                            if hour >= 7.0 && hour < 22.0 {
                                if stop_data.recorded_weekend_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekend_departures.push(hour);
                                }
                            }
                         }
                     }
                }
            }
        }
    })
}
