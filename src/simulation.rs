use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fs;
use geojson::{GeoJson, Geometry, Value};
use crate::gtfs_processor::models::ProcessedStop; // Re-use nearby stop logic if possible, or define new
// We might need a simplified stop struct for the simulation output if it differs significantly

#[derive(Debug, Serialize, Clone)]
pub struct SimulatedStop {
    pub id: String,
    pub lat: f64,
    pub lon: f64,
    pub route_id: String,
    pub name: String,
    // Scores will be added later, or we can use a separate scoring struct
}

#[derive(Debug, Serialize, Clone)]
pub struct SimulatedRoute {
    pub id: String,
    pub name: String,
    pub frequency_peak: f32, // Minutes
    pub span_hours: f32,
    pub shape: Vec<(f64, f64)>, // Lat, Lon
    pub color: String,
}

#[derive(Debug, Serialize)]
pub struct BusGridSimulation {
    pub routes: Vec<SimulatedRoute>,
    pub stops: Vec<SimulatedStop>,
}

pub fn generate_bus_grid(roi_geojson_path: &str) -> Result<BusGridSimulation, Box<dyn Error>> {
    println!("Generating Bus Grid Simulation...");
    
    // 1. Load Arterial Roads
    let arterial_features = load_arterial_features(roi_geojson_path)?;
    println!("Found {} arterial road segments.", arterial_features.len());

    let mut routes = Vec::new();
    let mut stops = Vec::new();
    
    // Simple heuristic: 1 feature = 1 route segment for now. 
    // In reality, we might want to merge contiguous segments with same name.
    // For MVP, treating each major segment as a potential route part is a start, 
    // but better to group by name to form coherent long routes.
    
    let mut grouped_roads: HashMap<String, Vec<Vec<(f64, f64)>>> = HashMap::new();
    
    for (name, coords) in arterial_features {
        grouped_roads.entry(name).or_default().push(coords);
    }
    
    println!("Grouped into {} unique arterial route names.", grouped_roads.len());

    for (name, segments) in grouped_roads {
        // Flatten segments into a single route for visualization (this is a simplification)
        // A real route logic would follow the path. 
        // For visualization, disjoint segments with same name might look weird if connected, 
        // so maybe keep them separate or use a multiline string.
        // Let's create a route for the longest segment for now, or just add all segments as separate routes sharing a name?
        // Better: Create one simulated route entry, but the shape might be multi-part.
        // Frontend expects a list of points (LineString). 
        // Let's iterate segments and make them distinct routes for now to avoid jump artifacts.
        
        for (i, segment) in segments.iter().enumerate() {
            let route_id = format!("SIM-ART-{}-{}", name.replace(" ", "-"), i);
            
            // Generate stops along this segment
            let segment_stops = generate_stops_along_path(&segment, 400.0, &route_id, &name);
            stops.extend(segment_stops);
            
            routes.push(SimulatedRoute {
                id: route_id,
                name: name.clone(),
                frequency_peak: 15.0,
                span_hours: 19.0,
                shape: segment.clone(),
                color: "#00FF00".to_string(), // Green for "Go"
            });
        }
    }

    Ok(BusGridSimulation {
        routes,
        stops,
    })
}

fn load_arterial_features(path: &str) -> Result<Vec<(String, Vec<(f64, f64)>)>, Box<dyn Error>> {
    let contents = fs::read_to_string(path)?;
    let geojson = contents.parse::<GeoJson>()?;
    let mut features = Vec::new();

    if let GeoJson::FeatureCollection(collection) = geojson {
        for feature in collection.features {
            let mut is_arterial = false;
            let mut road_name = String::new();

            if let Some(props) = &feature.properties {
                // Check CLASSN
                if let Some(class_val) = props.get("CLASSN") {
                    if let Some(s) = class_val.as_str() {
                        if s == "HW" || s == "MR" {
                            is_arterial = true;
                        }
                    }
                }
                
                // Get Name
                if let Some(name_val) = props.get("RD_NAME") { // DEC_NAME is also good
                     if let Some(s) = name_val.as_str() {
                         road_name = s.to_string();
                     }
                } else if let Some(name_val) = props.get("DEC_NAME") {
                     if let Some(s) = name_val.as_str() {
                         road_name = s.to_string();
                     }
                }
            }

            if is_arterial && !road_name.is_empty() {
                if let Some(geometry) = feature.geometry {
                    if let Value::LineString(coords) = geometry.value {
                        // GeoJSON is [lon, lat]
                        let points: Vec<(f64, f64)> = coords.iter()
                            .map(|p| (p[1], p[0])) // Convert to (Lat, Lon) for our internal use
                            .collect();
                        if !points.is_empty() {
                            features.push((road_name, points));
                        }
                    }
                    // Handle MultiLineString if necessary?
                }
            }
        }
    }
    Ok(features)
}

fn generate_stops_along_path(path: &[(f64, f64)], spacing_meters: f64, route_id: &str, route_name: &str) -> Vec<SimulatedStop> {
    let mut stops = Vec::new();
    if path.len() < 2 { return stops; }
    
    // Add start stop
    stops.push(SimulatedStop {
        id: format!("{}-START", route_id),
        lat: path[0].0,
        lon: path[0].1,
        route_id: route_id.to_string(),
        name: format!("{} Start", route_name),
    });

    let mut path_iter = path.iter();
    let mut curr = *path_iter.next().unwrap();
    let mut accumulated_dist = 0.0;
    let mut last_stop_dist = 0.0;
    
    while let Some(&next) = path_iter.next() {
        let seg_len = haversine_distance(curr.0, curr.1, next.0, next.1);
        let dist_at_seg_end = accumulated_dist + seg_len;
        
        let mut target_dist = last_stop_dist + spacing_meters;
        
        while target_dist <= dist_at_seg_end {
            // We can place a stop on this segment
            let dist_into_seg = target_dist - accumulated_dist;
            
            // Handle zero-length segments to avoid NaN
            let fraction = if seg_len > 1e-6 { dist_into_seg / seg_len } else { 0.0 };
            
            let lat = curr.0 + (next.0 - curr.0) * fraction;
            let lon = curr.1 + (next.1 - curr.1) * fraction;
            
            stops.push(SimulatedStop {
                id: format!("{}-{}", route_id, stops.len()),
                lat,
                lon,
                route_id: route_id.to_string(),
                name: format!("{} Stop", route_name),
            });
            
            last_stop_dist = target_dist;
            target_dist += spacing_meters;
        }
        
        accumulated_dist += seg_len;
        curr = next;
    }

    stops
}

fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6371000.0; // meters
    let phi1 = lat1.to_radians();
    let phi2 = lat2.to_radians();
    let delta_phi = (lat2 - lat1).to_radians();
    let delta_lambda = (lon2 - lon1).to_radians();

    let a = (delta_phi / 2.0).sin().powi(2)
        + phi1.cos() * phi2.cos() * (delta_lambda / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    r * c
}
