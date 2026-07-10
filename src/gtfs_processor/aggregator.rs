use super::models::*;
use super::loader::process_stop_times;
use super::scoring::parse_time;
use std::collections::{HashMap, HashSet};
use std::error::Error;

pub fn aggregate_stop_times<F, G>(
    dir: &str,
    mode_id: u32,
    stops_map: &mut HashMap<String, StopData>,
    child_to_parent: &HashMap<String, String>,
    trip_info: &HashMap<String, (String, String, Option<String>, u8)>,
    service_days: &HashMap<String, HashSet<u8>>,
    weekday_services: &HashSet<String>,
    weekend_services: &HashSet<String>,
    is_weekday_active: F,
    is_weekend_active: G,
) -> Result<(), Box<dyn Error>> 
where 
    F: Fn(&str) -> bool,
    G: Fn(&str) -> bool,
{
    process_stop_times(dir, |record| {
        let unique_stop_id = format!("{}-{}", mode_id, record.stop_id);
        let target_id = child_to_parent.get(&unique_stop_id).map(|s| s.as_str()).unwrap_or(&unique_stop_id);

        if let Some((route_id, service_id, shape_id_opt, direction_id)) = trip_info.get(&record.trip_id) {
            let active_weekday = is_weekday_active(service_id);
            let active_weekend = is_weekend_active(service_id);

            if active_weekday || active_weekend {
                if let Some(stop_data) = stops_map.get_mut(target_id) {
                    if active_weekday {
                        stop_data.trip_count += 1;
                        stop_data.routes.insert(route_id.clone());
                        if let Some(sid) = shape_id_opt {
                            stop_data.shapes.insert(sid.clone());
                        }
                    }

                    if let Some(days) = service_days.get(service_id) {
                        for d in days { stop_data.active_days.insert(*d); }
                    }

                    if let Some(hour) = parse_time(&record.arrival_time) {
                        if active_weekday && weekday_services.contains(service_id) {
                            if hour >= 7.0 && hour < 9.0 {
                                if stop_data.recorded_peak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_am_peak_departures.push((hour, *direction_id));
                                }
                            } else if hour >= 16.0 && hour < 18.0 {
                                if stop_data.recorded_peak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_pm_peak_departures.push((hour, *direction_id));
                                }
                            } else if hour >= 9.0 && hour < 16.0 {
                                if stop_data.recorded_offpeak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_midday_departures.push((hour, *direction_id));
                                }
                            } else if hour >= 18.0 && hour < 22.0 {
                                if stop_data.recorded_offpeak_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekday_evening_departures.push((hour, *direction_id));
                                }
                            }
                        }
                        if active_weekend && weekend_services.contains(service_id) {
                            if hour >= 7.0 && hour < 22.0 {
                                if stop_data.recorded_weekend_trips.insert(record.trip_id.clone()) {
                                    stop_data.weekend_departures.push((hour, *direction_id));
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}
