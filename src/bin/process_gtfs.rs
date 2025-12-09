use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fs;
use std::path::Path;
use std::io;
use chrono::{NaiveDate, Datelike, Weekday};

#[derive(Debug, Deserialize)]
struct GtfsStop {
    stop_id: String,
    stop_name: String,
    stop_lat: f64,
    stop_lon: f64,
    location_type: Option<u8>,
    parent_station: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GtfsRoute {
    route_id: String,
    route_short_name: String,
    route_long_name: String,
    route_color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GtfsTrip {
    route_id: String,
    trip_id: String,
    service_id: String,
    shape_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GtfsStopTime {
    trip_id: String,
    stop_id: String,
    arrival_time: String,
}

#[derive(Debug, Deserialize)]
struct GtfsShape {
    shape_id: String,
    shape_pt_lat: f64,
    shape_pt_lon: f64,
    shape_pt_sequence: u32,
}

#[derive(Debug, Deserialize)]
struct GtfsCalendar {
    service_id: String,
    monday: u8,
    tuesday: u8,
    wednesday: u8,
    thursday: u8,
    friday: u8,
    saturday: u8,
    sunday: u8,
    start_date: String,  // YYYYMMDD format
    end_date: String,    // YYYYMMDD format
}

#[derive(Debug, Serialize, Clone)]
struct NearbyStop {
    id: String,
    name: String,
    mode_name: String,
    distance: f64,
}

#[derive(Debug, Serialize, Clone)]
struct ProcessedStop {
    id: String,
    name: String,
    lat: f64,
    lon: f64,
    mode_id: u32,
    mode_name: String,
    frequency_score: f32,
    average_wait_time: f32, // New Metric: Minutes
    coverage_score: f32,
    reliability_score: f32, // New Metric
    connectivity_score: f32,
    color: String,
    route_ids: Vec<String>,
    nearby_stops: Vec<NearbyStop>,
    patronage_annual: Option<u32>,  // Annual entries (Metro Train only)
}

#[derive(Debug, Serialize, Clone)]
struct ProcessedRoute {
    id: String,
    short_name: String,
    long_name: String,
    color: String,
    mode_id: u32,
}

struct StopData {
    name: String,
    lat: f64,
    lon: f64,
    mode_id: u32,
    mode_name: String,
    trip_count: u32,
    routes: HashSet<String>,
    is_parent: bool,
    
    // Store actual departure times (hours since midnight)
    weekday_peak_departures: Vec<f32>,
    weekday_offpeak_departures: Vec<f32>,
    weekend_departures: Vec<f32>,
    
    // Track which trips we've already recorded (to avoid duplicates across days)
    recorded_peak_trips: HashSet<String>,
    recorded_offpeak_trips: HashSet<String>,
    recorded_weekend_trips: HashSet<String>,
    
    active_days: HashSet<u8>,
}

fn parse_time(time_str: &str) -> Option<f32> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() < 2 { return None; }
    let h: f32 = parts[0].parse().ok()?;
    let m: f32 = parts[1].parse().ok()?;
    Some(h + m / 60.0)
}

// Calculate average headway from actual departure times
fn calculate_average_headway(mut departures: Vec<f32>) -> Option<f32> {
    if departures.len() < 2 {
        return None;
    }
    
    // Sort departure times
    departures.sort_by(|a, b| a.partial_cmp(b).unwrap());
    
    // Calculate gaps between consecutive departures
    let mut headways = Vec::new();
    for i in 1..departures.len() {
        let gap_hours = departures[i] - departures[i - 1];
        let gap_minutes = gap_hours * 60.0;
        headways.push(gap_minutes);
    }
    
    // Return average headway
    let sum: f32 = headways.iter().sum();
    Some(sum / headways.len() as f32)
}

// Convert average headway to average wait time
fn calculate_average_wait_time(departures: Vec<f32>) -> f32 {
    match calculate_average_headway(departures) {
        Some(avg_headway) => avg_headway / 2.0,  // Average wait = half the headway
        None => 999.0,  // No service
    }
}

// Convert wait time to a 0-100 score
fn wait_time_to_score(wait_minutes: f32) -> f32 {
    if wait_minutes >= 999.0 {
        return 0.0;
    }
    
    // Score tiers based on wait time
    if wait_minutes < 2.5 {
        100.0
    } else if wait_minutes < 5.0 {
        95.0
    } else if wait_minutes < 7.5 {
        85.0
    } else if wait_minutes < 10.0 {
        75.0
    } else if wait_minutes < 15.0 {
        60.0
    } else if wait_minutes < 20.0 {
        45.0
    } else if wait_minutes < 30.0 {
        30.0
    } else {
        15.0
    }
}

// Parse GTFS date format (YYYYMMDD) to NaiveDate
fn parse_gtfs_date(date_str: &str) -> Option<NaiveDate> {
    if date_str.len() != 8 {
        return None;
    }
    let year: i32 = date_str[0..4].parse().ok()?;
    let month: u32 = date_str[4..6].parse().ok()?;
    let day: u32 = date_str[6..8].parse().ok()?;
    NaiveDate::from_ymd_opt(year, month, day)
}

// Find nth occurrence of a weekday after start_date
fn find_nth_weekday(start_date: NaiveDate, target_weekday: Weekday, n: usize) -> NaiveDate {
    let mut date = start_date;
    let mut count = 0;
    
    loop {
        if date.weekday() == target_weekday {
            count += 1;
            if count == n {
                return date;
            }
        }
        date = date.succ_opt().unwrap();
    }
}

// Check if a service is active on a specific date
fn is_service_active(
    service_id: &str,
    date: NaiveDate,
    service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
    service_days: &HashMap<String, HashSet<u8>>
) -> bool {
    // Check if service has date range
    if let Some((start, end)) = service_dates.get(service_id) {
        if date < *start || date > *end {
            return false;
        }
    }
    
    // Check if weekday is active
    if let Some(active_days) = service_days.get(service_id) {
        let weekday_num = match date.weekday() {
            Weekday::Mon => 0,
            Weekday::Tue => 1,
            Weekday::Wed => 2,
            Weekday::Thu => 3,
            Weekday::Fri => 4,
            Weekday::Sat => 5,
            Weekday::Sun => 6,
        };
        return active_days.contains(&weekday_num);
    }
    
    false
}



fn main() -> Result<(), Box<dyn Error>> {
    let gtfs_root = "gtfs";
    let output_file = "frontend/src/data/stops.json";
    let shapes_output_file = "frontend/src/data/shapes.json";
    let routes_output_file = "frontend/src/data/routes.json";
    
    let modes: HashMap<u32, &str> = HashMap::from([
        (1, "Regional Train"),
        (2, "Metro Train"),
        (3, "Metro Tram"),
        (4, "Metro Bus"),
        (5, "Regional Coach"),
        (6, "Regional Bus"),
        (10, "Interstate"),
        (11, "SkyBus"),
    ]);

    // Load patronage data (Metro Train stations only)
    let mut patronage_map: HashMap<String, u32> = HashMap::new();
    let patronage_path = "frontend/src/data/annual_metropolitan_train_station_entries_fy_2024_2025.csv";
    if Path::new(&patronage_path).exists() {
        if let Ok(mut rdr) = csv::Reader::from_path(&patronage_path) {
            for result in rdr.records() {
                if let Ok(record) = result {
                    if record.len() >= 6 {
                        if let (Some(stop_id), Some(annual_str)) = (record.get(1), record.get(5)) {
                            if let Ok(annual) = annual_str.parse::<u32>() {
                                patronage_map.insert(stop_id.to_string(), annual);
                            }
                        }
                    }
                }
            }
        }
        println!("Loaded {} patronage records", patronage_map.len());
    }


    let mut stops_map: HashMap<String, StopData> = HashMap::new();
    let mut child_to_parent: HashMap<String, String> = HashMap::new();
    let mut route_shape_counts: HashMap<String, HashMap<String, u32>> = HashMap::new();
    let mut all_shapes: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    let mut routes_map: HashMap<String, ProcessedRoute> = HashMap::new();

    for (mode_id, mode_name) in &modes {
        let dir = format!("{}/{}/google_transit", gtfs_root, mode_id);
        if !Path::new(&dir).exists() {
            continue;
        }
        println!("Processing Mode {}: {}", mode_id, mode_name);

        // 0. Load Calendar (Service IDs -> Active Days + Date Ranges)
        let mut service_days: HashMap<String, HashSet<u8>> = HashMap::new();
        let mut service_dates: HashMap<String, (NaiveDate, NaiveDate)> = HashMap::new();
        let mut weekday_services = HashSet::new();
        let mut weekend_services = HashSet::new();
        
        let cal_path = format!("{}/calendar.txt", dir);
        if Path::new(&cal_path).exists() {
            let mut rdr = csv::Reader::from_path(&cal_path)?;
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
                
                if record.monday == 1 || record.tuesday == 1 || record.wednesday == 1 || record.thursday == 1 || record.friday == 1 {
                    weekday_services.insert(record.service_id.clone());
                }
                if record.saturday == 1 || record.sunday == 1 {
                    weekend_services.insert(record.service_id.clone());
                }
               
                // Parse date range
                if let (Some(start), Some(end)) = (parse_gtfs_date(&record.start_date), parse_gtfs_date(&record.end_date)) {
                    service_dates.insert(record.service_id.clone(), (start, end));
                }
                
                service_days.insert(record.service_id.clone(), days);
            }
        }
        
        // Select representative date: 2nd Wednesday of longest service period (avoiding holidays)
        let repr_date = if let Some((_service_id, (start, end))) = service_dates.iter()
            .max_by_key(|(_, (start, end))| (*end - *start).num_days()) {
            
            // Try to find a suitable Wednesday (avoid major holidays)
            let mut candidate = find_nth_weekday(*start, Weekday::Wed, 2);
            
            // Skip if near Christmas/New Year (Dec 20 - Jan 5) or other problematic dates
            while candidate <= *end {
                let month = candidate.month();
                let day = candidate.day();
                
                // Check if date is in a holiday period
                let is_holiday_period = 
                    (month == 12 && day >= 20) ||  // Christmas period
                    (month == 1 && day <= 5) ||    // New Year period
                    (month == 4 && day >= 18 && day <= 22);  // Easter period (approximate)
                
                if !is_holiday_period {
                    break;
                }
                
                // Try next Wednesday
                candidate = candidate + chrono::Duration::days(7);
            }
            
            if candidate <= *end { candidate } else { *start }
        } else {
            // Fallback if no calendar data: use a default date mid-2025 (not near holidays)
            NaiveDate::from_ymd_opt(2025, 6, 11).unwrap()  // Wednesday, June 11, 2025
        };
        
        println!("  Representative date: {}", repr_date);

        // 1. Load Routes
        let mut valid_routes = HashSet::new();
        let routes_path = format!("{}/routes.txt", dir);
        if Path::new(&routes_path).exists() {
            let mut rdr = csv::Reader::from_path(&routes_path)?;
            for result in rdr.deserialize() {
                let record: GtfsRoute = result?;
                if *mode_id == 2 && record.route_long_name.to_lowercase().contains("replacement bus") {
                    continue;
                }
                valid_routes.insert(record.route_id.clone());
                
                let default_color = match *mode_id {
                    1 => "8e44ad", 2 => "2980b9", 3 => "27ae60", 
                    4 | 6 => "e67e22", 11 => "e74c3c", _ => "7f8c8d",
                };
                let color = record.route_color.unwrap_or(default_color.to_string());
                
                routes_map.insert(record.route_id.clone(), ProcessedRoute {
                    id: record.route_id.clone(),
                    short_name: record.route_short_name,
                    long_name: record.route_long_name,
                    color: format!("#{}", color),
                    mode_id: *mode_id,
                });
            }
        }

        // 2. Load Trips
        let mut trip_info = HashMap::new();
        let trips_path = format!("{}/trips.txt", dir);
        if Path::new(&trips_path).exists() {
            let mut rdr = csv::Reader::from_path(&trips_path)?;
            for result in rdr.deserialize() {
                let record: GtfsTrip = result?;
                if valid_routes.contains(&record.route_id) {
                    trip_info.insert(record.trip_id.clone(), (record.route_id.clone(), record.service_id));
                    
                    if let Some(shape_id) = record.shape_id {
                        *route_shape_counts.entry(record.route_id).or_default().entry(shape_id).or_default() += 1;
                    }
                }
            }
        }

        // 3. Load Shapes (Simplified)
        let shapes_path = format!("{}/shapes.txt", dir);
        if Path::new(&shapes_path).exists() {
            let mut rdr = csv::Reader::from_path(&shapes_path)?;
            let mut temp_shapes: HashMap<String, Vec<(u32, f64, f64)>> = HashMap::new();
            for result in rdr.deserialize() {
                let record: GtfsShape = result?;
                temp_shapes.entry(record.shape_id).or_default().push((record.shape_pt_sequence, record.shape_pt_lat, record.shape_pt_lon));
            }
            for (sid, mut points) in temp_shapes {
                points.sort_by_key(|k| k.0);
                let simplified: Vec<(f64, f64)> = points.iter().step_by(5).map(|(_, lat, lon)| (*lat, *lon)).collect();
                all_shapes.insert(sid, simplified);
            }
        }

        // 4. Load Stops
        let stops_path = format!("{}/stops.txt", dir);
        if Path::new(&stops_path).exists() {
            let mut rdr = csv::Reader::from_path(&stops_path)?;
            for result in rdr.deserialize() {
                let record: GtfsStop = result?;
                let unique_id = format!("{}-{}", mode_id, record.stop_id);
                let is_station = record.location_type == Some(1);
                let parent_id = record.parent_station.clone().filter(|p| !p.is_empty()).map(|p| format!("{}-{}", mode_id, p));

                if let Some(pid) = parent_id {
                    child_to_parent.insert(unique_id.clone(), pid);
                }

                stops_map.insert(unique_id, StopData {
                    name: record.stop_name,
                    lat: record.stop_lat,
                    lon: record.stop_lon,
                    mode_id: *mode_id,
                    mode_name: mode_name.to_string(),
                    trip_count: 0,
                    routes: HashSet::new(),
                    is_parent: is_station,
                    weekday_peak_departures: Vec::new(),
                    weekday_offpeak_departures: Vec::new(),
                    weekend_departures: Vec::new(),
                    recorded_peak_trips: HashSet::new(),
                    recorded_offpeak_trips: HashSet::new(),
                    recorded_weekend_trips: HashSet::new(),
                    active_days: HashSet::new(),
                });
            }
        }

        // 5. Stream Stop Times
        let st_path = format!("{}/stop_times.txt", dir);
        if Path::new(&st_path).exists() {
            println!("  Streaming stop_times.txt...");
            let mut rdr = csv::Reader::from_path(&st_path)?;
            for result in rdr.deserialize() {
                let record: GtfsStopTime = result?;
                let unique_stop_id = format!("{}-{}", mode_id, record.stop_id);
                let target_id = child_to_parent.get(&unique_stop_id).unwrap_or(&unique_stop_id);

                if let Some((route_id, service_id)) = trip_info.get(&record.trip_id) {
                    // CRITICAL: Only process trips active on representative date
                    if !is_service_active(service_id, repr_date, &service_dates, &service_days) {
                        continue;
                    }
                    
                    if let Some(stop_data) = stops_map.get_mut(target_id) {
                        stop_data.trip_count += 1;
                        stop_data.routes.insert(route_id.clone());

                        // Reliability: Add active days
                        if let Some(days) = service_days.get(service_id) {
                            for d in days { stop_data.active_days.insert(*d); }
                        }

                        // Store departure times (only once per unique trip)
                        if let Some(hour) = parse_time(&record.arrival_time) {
                            let is_weekday = weekday_services.contains(service_id);
                            let is_weekend = weekend_services.contains(service_id);

                            if is_weekday {
                                if (hour >= 7.0 && hour < 9.0) || (hour >= 16.0 && hour < 18.0) {
                                    // Only record if we haven't seen this trip before
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
        }
    }

    // Output Routes & Shapes
    if let Some(parent) = Path::new(routes_output_file).parent() { fs::create_dir_all(parent)?; }
    fs::write(routes_output_file, serde_json::to_string(&routes_map)?)?;
    
    let mut final_shapes: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    for (route_id, shape_counts) in route_shape_counts {
        if let Some((best_shape_id, _)) = shape_counts.iter().max_by_key(|(_, count)| *count) {
            if let Some(points) = all_shapes.get(best_shape_id) {
                final_shapes.insert(route_id, points.clone());
            }
        }
    }
    fs::write(shapes_output_file, serde_json::to_string(&final_shapes)?)?;

    // Scoring
    println!("Calculating scores...");
    let active_stops: Vec<String> = stops_map.iter()
        .filter(|(id, data)| (data.is_parent || !child_to_parent.contains_key(*id)) && data.trip_count > 0)
        .map(|(id, _)| id.clone())
        .collect();

    let grid_size = 0.004;
    let mut grid: HashMap<(i32, i32), Vec<String>> = HashMap::new();
    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let grid_x = (data.lon / grid_size).floor() as i32;
        let grid_y = (data.lat / grid_size).floor() as i32;
        grid.entry((grid_x, grid_y)).or_default().push(id.clone());
    }

    let mut max_freq = 0.0;
    let mut max_cov = 0.0;
    let mut raw_scores: HashMap<String, (f32, f32, f32, f32)> = HashMap::new(); // (freq_score, cov, rel, avg_wait)
    let mut nearby_stops_map: HashMap<String, Vec<NearbyStop>> = HashMap::new();

    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let grid_x = (data.lon / grid_size).floor() as i32;
        let grid_y = (data.lat / grid_size).floor() as i32;

        // Collect all departure times from nearby stops
        let mut cluster_peak_deps = Vec::new();
        let mut cluster_offpeak_deps = Vec::new();
        let mut cluster_weekend_deps = Vec::new();
        let mut cluster_routes = HashSet::new();
        let mut nearby = Vec::new();
        let mut max_days_active = data.active_days.len();

        for dx in -1..=1 {
            for dy in -1..=1 {
                if let Some(neighbors) = grid.get(&(grid_x + dx, grid_y + dy)) {
                    for neighbor_id in neighbors {
                        if let Some(neighbor) = stops_map.get(neighbor_id) {
                            // Only cluster stops of the SAME mode
                            if neighbor.mode_id != data.mode_id {
                                continue;
                            }
                            
                            let d_lat = data.lat - neighbor.lat;
                            let d_lon = data.lon - neighbor.lon;
                            let dist_sq = d_lat*d_lat + d_lon*d_lon;
                            
                            if dist_sq < grid_size*grid_size {
                                // Extend departure time vectors (cheap - just f32 values)
                                cluster_peak_deps.extend(&neighbor.weekday_peak_departures);
                                cluster_offpeak_deps.extend(&neighbor.weekday_offpeak_departures);
                                cluster_weekend_deps.extend(&neighbor.weekend_departures);
                                
                                for r in &neighbor.routes { 
                                    cluster_routes.insert(r.clone()); 
                                }
                                
                                if neighbor.active_days.len() > max_days_active {
                                    max_days_active = neighbor.active_days.len();
                                }

                                if neighbor_id != id {
                                    nearby.push(NearbyStop {
                                        id: neighbor_id.clone(),
                                        name: neighbor.name.clone(),
                                        mode_name: neighbor.mode_name.clone(),
                                        distance: dist_sq.sqrt() * 111000.0,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        nearby.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap());
        nearby_stops_map.insert(id.clone(), nearby);

        // Calculate TRUE average wait times from departure gaps
        let peak_wait = calculate_average_wait_time(cluster_peak_deps);
        let offpeak_wait = calculate_average_wait_time(cluster_offpeak_deps);
        let weekend_wait = calculate_average_wait_time(cluster_weekend_deps);

        // Convert wait times to scores
        let peak_score = wait_time_to_score(peak_wait);
        let offpeak_score = wait_time_to_score(offpeak_wait);
        let weekend_score = wait_time_to_score(weekend_wait);

        // Weighted frequency score
        let freq_score = (peak_score * 0.3) + (offpeak_score * 0.4) + (weekend_score * 0.3);
        
        // Overall average wait (for display)
        let avg_wait = (peak_wait * 0.3) + (offpeak_wait * 0.4) + (weekend_wait * 0.3);

        let cov_score = (cluster_routes.len() as f32 * 10.0).min(100.0);
        let rel_score = (max_days_active as f32 / 7.0) * 100.0;

        if freq_score > max_freq { max_freq = freq_score; }
        if cov_score > max_cov { max_cov = cov_score; }
        
        raw_scores.insert(id.clone(), (freq_score, cov_score, rel_score, avg_wait));
        
        // Debug: Print for specific stops
        if data.name.contains("Cobblebank") || data.name.contains("Astley") {
            println!("DEBUG {}: Peak wait={:.1}min, OffPeak wait={:.1}min, Weekend wait={:.1}min, Avg={:.1}min", 
                data.name, peak_wait, offpeak_wait, weekend_wait, avg_wait);
        }
    }

    let mut final_stops = Vec::new();
    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let (freq_score, cov_score, rel_score, avg_wait) = raw_scores.get(id).unwrap();
        
        // Three Keys Formula: Freq(40%) + Cov(35%) + Rel(25%)
        let connectivity = (freq_score * 0.4) + (cov_score * 0.35) + (rel_score * 0.25);
        
        let color = if connectivity < 40.0 { "#e74c3c".to_string() } 
                   else if connectivity < 70.0 { "#f1c40f".to_string() } 
                   else { "#2ecc71".to_string() };

        // Join patronage data (Metro Train only)
        let patronage_annual = if data.mode_id == 2 {
            // Extract stop_id from composite id (format: "2-19842")
            let stop_id_str = id.split('-').nth(1).unwrap_or("");
            patronage_map.get(stop_id_str).cloned()
        } else {
            None
        };

        final_stops.push(ProcessedStop {
            id: id.clone(),
            name: data.name.clone(),
            lat: data.lat,
            lon: data.lon,
            mode_id: data.mode_id,
            mode_name: data.mode_name.clone(),
            frequency_score: *freq_score,
            average_wait_time: *avg_wait,
            coverage_score: *cov_score,
            reliability_score: *rel_score,
            connectivity_score: connectivity,
            color,
            route_ids: data.routes.iter().cloned().collect(),
            nearby_stops: nearby_stops_map.remove(id).unwrap_or_default(),
            patronage_annual,
        });
    }

    // Write standard JSON format
    fs::write(output_file, serde_json::to_string(&final_stops)?)?;
    println!("Processed {} stops with Three Keys scoring.", final_stops.len());
    
    // Write enriched GeoJSON format - chunked by mode for performance
    write_geojson_chunked(&final_stops)?;
    
    Ok(())
}


// Write GeoJSON chunked by transport mode for better load performance
fn write_geojson_chunked(stops: &[ProcessedStop]) -> Result<(), Box<dyn Error>> {
    use geojson::{Feature, FeatureCollection, Geometry, Value};
    use std::collections::HashMap;
    
    // Group stops by mode
    let mut stops_by_mode: HashMap<u32, Vec<&ProcessedStop>> = HashMap::new();
    for stop in stops {
        stops_by_mode.entry(stop.mode_id).or_insert_with(Vec::new).push(stop);
    }
    
    // Mode names for file naming
    let mode_names: HashMap<u32, &str> = [
        (1, "regional_train"),
        (2, "metro_train"),
        (3, "metro_tram"),
        (4, "metro_bus"),
        (5, "regional_coach"),
        (6, "regional_bus"),
        (11, "skybus"),
    ].iter().cloned().collect();
    
    // Write a separate GeoJSON file for each mode
    for (mode_id, mode_stops) in stops_by_mode.iter() {
        let mode_name = mode_names.get(mode_id).unwrap_or(&"unknown");
        let filename = format!("frontend/src/data/stops_{}.geojson", mode_name);
        
        let features: Vec<Feature> = mode_stops.iter().map(|stop| {
            let geometry = Geometry::new(Value::Point(vec![stop.lon, stop.lat]));
            
            let mut properties = serde_json::Map::new();
            properties.insert("id".to_string(), serde_json::json!(stop.id));
            properties.insert("name".to_string(), serde_json::json!(stop.name));
            properties.insert("mode_id".to_string(), serde_json::json!(stop.mode_id));
            properties.insert("mode_name".to_string(), serde_json::json!(stop.mode_name));
            properties.insert("frequency_score".to_string(), serde_json::json!(stop.frequency_score));
            properties.insert("average_wait_time".to_string(), serde_json::json!(stop.average_wait_time));
            properties.insert("coverage_score".to_string(), serde_json::json!(stop.coverage_score));
            properties.insert("reliability_score".to_string(), serde_json::json!(stop.reliability_score));
            properties.insert("connectivity_score".to_string(), serde_json::json!(stop.connectivity_score));
            properties.insert("color".to_string(), serde_json::json!(stop.color));
            properties.insert("route_ids".to_string(), serde_json::json!(stop.route_ids));
            properties.insert("nearby_stops".to_string(), serde_json::json!(stop.nearby_stops));
            
            if let Some(patronage) = stop.patronage_annual {
                properties.insert("patronage_annual".to_string(), serde_json::json!(patronage));
            }
            
            Feature {
                bbox: None,
                geometry: Some(geometry),
                id: None,
                properties: Some(properties),
                foreign_members: None,
            }
        }).collect();
        
        let feature_collection = FeatureCollection {
            bbox: None,
            features,
            foreign_members: None,
        };
        
        let geojson_string = serde_json::to_string_pretty(&feature_collection)?;
        fs::write(&filename, geojson_string)?;
        
        println!("  Wrote {} {} stops to {}", mode_stops.len(), mode_name, filename);
    }
    
    Ok(())
}
