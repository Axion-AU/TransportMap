use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fs;
use std::path::Path;
use std::io;

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
    
    // Metrics - Use HashSets to avoid double counting
    weekday_peak_trips: HashSet<String>,    // trip_ids
    weekday_offpeak_trips: HashSet<String>, // trip_ids
    weekend_trips: HashSet<String>,         // trip_ids
    active_days: HashSet<u8>, // 0=Mon, 6=Sun
}

fn parse_time(time_str: &str) -> Option<f32> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() < 2 { return None; }
    let h: f32 = parts[0].parse().ok()?;
    let m: f32 = parts[1].parse().ok()?;
    Some(h + m / 60.0)
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

        // 0. Load Calendar (Service IDs -> Active Days)
        let mut service_days: HashMap<String, HashSet<u8>> = HashMap::new();
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
                service_days.insert(record.service_id.clone(), days);
            }
        }

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
                    weekday_peak_trips: HashSet::new(),
                    weekday_offpeak_trips: HashSet::new(),
                    weekend_trips: HashSet::new(),
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
                    if let Some(stop_data) = stops_map.get_mut(target_id) {
                        stop_data.trip_count += 1;
                        stop_data.routes.insert(route_id.clone());

                        // Reliability: Add active days
                        if let Some(days) = service_days.get(service_id) {
                            for d in days { stop_data.active_days.insert(*d); }
                        }

                        if let Some(hour) = parse_time(&record.arrival_time) {
                            let is_weekday = weekday_services.contains(service_id);
                            let is_weekend = weekend_services.contains(service_id);

                            if is_weekday {
                                if (hour >= 7.0 && hour < 9.0) || (hour >= 16.0 && hour < 18.0) {
                                    stop_data.weekday_peak_trips.insert(record.trip_id.clone());
                                } else if (hour >= 9.0 && hour < 16.0) || (hour >= 18.0 && hour < 22.0) {
                                    stop_data.weekday_offpeak_trips.insert(record.trip_id.clone());
                                }
                            }
                            if is_weekend {
                                if hour >= 7.0 && hour < 22.0 {
                                    stop_data.weekday_offpeak_trips.insert(record.trip_id.clone());
                                    stop_data.weekend_trips.insert(record.trip_id.clone());
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
    let mut raw_scores: HashMap<String, (f32, f32, f32)> = HashMap::new(); // (freq, cov, rel)
    let mut nearby_stops_map: HashMap<String, Vec<NearbyStop>> = HashMap::new();

    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let grid_x = (data.lon / grid_size).floor() as i32;
        let grid_y = (data.lat / grid_size).floor() as i32;

        let mut cluster_peak_trips: HashSet<String> = HashSet::new();
        let mut cluster_offpeak_trips: HashSet<String> = HashSet::new();
        let mut cluster_weekend_trips: HashSet<String> = HashSet::new();
        let mut cluster_routes = HashSet::new();
        let mut nearby = Vec::new();
        let mut max_days_active = data.active_days.len();

        for dx in -1..=1 {
            for dy in -1..=1 {
                if let Some(neighbors) = grid.get(&(grid_x + dx, grid_y + dy)) {
                    for neighbor_id in neighbors {
                        if let Some(neighbor) = stops_map.get(neighbor_id) {
                            // Only cluster stops of the SAME mode (don't mix trains and buses!)
                            if neighbor.mode_id != data.mode_id {
                                continue;
                            }
                            
                            let d_lat = data.lat - neighbor.lat;
                            let d_lon = data.lon - neighbor.lon;
                            let dist_sq = d_lat*d_lat + d_lon*d_lon;
                            
                            if dist_sq < grid_size*grid_size {
                                // Merge HashSets to avoid double-counting
                                for trip_id in &neighbor.weekday_peak_trips {
                                    cluster_peak_trips.insert(trip_id.clone());
                                }
                                for trip_id in &neighbor.weekday_offpeak_trips {
                                    cluster_offpeak_trips.insert(trip_id.clone());
                                }
                                for trip_id in &neighbor.weekend_trips {
                                    cluster_weekend_trips.insert(trip_id.clone());
                                }
                                for r in &neighbor.routes { cluster_routes.insert(r.clone()); }
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

        // Calculate trips per hour from unique trip counts
        // Important: Trip IDs are unique per day, so we need to divide by service days
        // Weekday services run 5 days (Mon-Fri), weekend services run 2 days (Sat-Sun)
        let daily_peak_trips = cluster_peak_trips.len() as f32 / 5.0;        // Divide by 5 weekdays
        let daily_offpeak_trips = cluster_offpeak_trips.len() as f32 / 5.0;  // Divide by 5 weekdays  
        let daily_weekend_trips = cluster_weekend_trips.len() as f32 / 2.0;  // Divide by 2 weekend days
        
        let peak_per_hr = daily_peak_trips / 4.0;      // 4 hrs of peak (7-9am + 4-6pm)
        let offpeak_per_hr = daily_offpeak_trips / 11.0; // 11 hrs of off-peak
        let weekend_per_hr = daily_weekend_trips / 30.0; // 30 hrs over weekend

        let weighted_freq = (peak_per_hr * 0.3) + (offpeak_per_hr * 0.4) + (weekend_per_hr * 0.3);

        let cov = cluster_routes.len() as f32;
        let rel = (max_days_active as f32 / 7.0) * 100.0;

        if weighted_freq > max_freq { max_freq = weighted_freq; }
        if cov > max_cov { max_cov = cov; }
        
        raw_scores.insert(id.clone(), (weighted_freq, cov, rel));
        
        // Debug: Print for specific stops
        if data.name.contains("Cobblebank") {
            println!("DEBUG {}: Peak trips={}, OffPeak={}, Weekend={}, Weighted Freq={:.2}/hr", 
                data.name, cluster_peak_trips.len(), cluster_offpeak_trips.len(), 
                cluster_weekend_trips.len(), weighted_freq);
        }
    }

    let mut final_stops = Vec::new();
    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let (raw_freq, raw_cov, rel_score) = raw_scores.get(id).unwrap();
        
        let freq_score = (raw_freq.ln() / max_freq.ln()) * 100.0;
        // Wait Time = Headway / 2 = (60 / trips_per_hour) / 2 = 30 / trips_per_hour
        let avg_wait = if *raw_freq > 0.0 { 30.0 / raw_freq } else { 999.0 };

        let cov_score_capped = (*raw_cov * 10.0).min(100.0);
        
        // Three Keys Formula: Freq(40%) + Cov(35%) + Rel(25%)
        let connectivity = (freq_score * 0.4) + (cov_score_capped * 0.35) + (rel_score * 0.25);
        
        let color = if connectivity < 40.0 { "#e74c3c".to_string() } 
                   else if connectivity < 70.0 { "#f1c40f".to_string() } 
                   else { "#2ecc71".to_string() };

        final_stops.push(ProcessedStop {
            id: id.clone(),
            name: data.name.clone(),
            lat: data.lat,
            lon: data.lon,
            mode_id: data.mode_id,
            mode_name: data.mode_name.clone(),
            frequency_score: freq_score,
            average_wait_time: avg_wait,
            coverage_score: cov_score_capped,
            reliability_score: *rel_score,
            connectivity_score: connectivity,
            color,
            route_ids: data.routes.iter().cloned().collect(),
            nearby_stops: nearby_stops_map.remove(id).unwrap_or_default(),
        });
    }

    fs::write(output_file, serde_json::to_string(&final_stops)?)?;
    println!("Processed {} stops with Three Keys scoring.", final_stops.len());
    Ok(())
}
