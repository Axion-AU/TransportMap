use super::models::*;
use geojson::{Feature, FeatureCollection, Geometry, Value};
use std::collections::HashMap;
use std::error::Error;
use std::fs;
use serde_json::json;

// Write GeoJSON chunked by transport mode for better load performance
pub fn write_geojson_chunked(stops: &[ProcessedStop]) -> Result<(), Box<dyn Error>> {
    
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
        let filename = format!("frontend/public/data/stops_{}.geojson", mode_name);
        
        let features: Vec<Feature> = mode_stops.iter().map(|stop| {
            let geometry = Geometry::new(Value::Point(vec![stop.lon, stop.lat]));
            
            let mut properties = serde_json::Map::new();
            properties.insert("id".to_string(), serde_json::json!(stop.id));
            properties.insert("name".to_string(), serde_json::json!(stop.name));
            properties.insert("mode_id".to_string(), serde_json::json!(stop.mode_id));
            properties.insert("mode_name".to_string(), serde_json::json!(stop.mode_name));
            properties.insert("frequency_score".to_string(), serde_json::json!(stop.frequency_score));
            properties.insert("headway_score".to_string(), serde_json::json!(stop.headway_score));
            properties.insert("service_span_score".to_string(), serde_json::json!(stop.service_span_score));
            properties.insert("reliability_score".to_string(), serde_json::json!(stop.reliability_score));
            
            properties.insert("coverage_score".to_string(), serde_json::json!(stop.coverage_score));
            properties.insert("network_coverage_score".to_string(), serde_json::json!(stop.network_coverage_score));
            properties.insert("hub_reachability_score".to_string(), serde_json::json!(stop.hub_reachability_score));
            properties.insert("cbd_direct_score".to_string(), serde_json::json!(stop.cbd_direct_score));
            properties.insert("orbital_directness_score".to_string(), serde_json::json!(stop.orbital_directness_score));
            properties.insert("connectivity_tier".to_string(), serde_json::json!(stop.connectivity_tier));
            properties.insert("best_topology".to_string(), serde_json::json!(stop.best_topology));
            properties.insert("local_coverage_score".to_string(), serde_json::json!(stop.local_coverage_score));
            
            properties.insert("base_score".to_string(), serde_json::json!(stop.base_score));
            properties.insert("final_score".to_string(), serde_json::json!(stop.final_score));
            properties.insert("connectivity_score".to_string(), serde_json::json!(stop.final_score)); // Compat
            
            properties.insert("freq_penalty_multiplier".to_string(), serde_json::json!(stop.freq_penalty_multiplier));
            properties.insert("catch_penalty_multiplier".to_string(), serde_json::json!(stop.catch_penalty_multiplier));
            
            properties.insert("average_wait_time".to_string(), serde_json::json!(stop.average_wait_time));
            properties.insert("color".to_string(), serde_json::json!(stop.color));
            properties.insert("route_ids".to_string(), serde_json::json!(stop.route_ids));
            properties.insert("shape_ids".to_string(), serde_json::json!(stop.shape_ids)); 
            properties.insert("nearby_stops".to_string(), serde_json::json!(stop.nearby_stops));
            
            if let Some(patronage) = stop.patronage_annual {
                properties.insert("patronage_annual".to_string(), serde_json::json!(patronage));
            }

            // Inter-Modality Bonus
            properties.insert("intermodal_bonus".to_string(), serde_json::json!(stop.intermodal_bonus));
            properties.insert("intermodal_breakdown".to_string(), serde_json::json!(stop.intermodal_breakdown));
            properties.insert("connected_modes".to_string(), serde_json::json!(stop.connected_modes));
            properties.insert("train_stops_nearby".to_string(), serde_json::json!(stop.train_stops_nearby));
            properties.insert("tram_stops_nearby".to_string(), serde_json::json!(stop.tram_stops_nearby));
            properties.insert("bus_stops_nearby".to_string(), serde_json::json!(stop.bus_stops_nearby));
            
            Feature {
                bbox: None,
                geometry: Some(geometry),
                id: None,
                properties: Some(properties),
                foreign_members: None,
            }
        }).collect();
        
        // Metadata as Foreign Members
        let mut foreign_members = serde_json::Map::new();
        foreign_members.insert("version".to_string(), json!(env!("CARGO_PKG_VERSION")));
        foreign_members.insert("generated_at".to_string(), json!(chrono::Utc::now().to_rfc3339()));
        foreign_members.insert("methodology_version".to_string(), json!("2026.07"));

        let feature_collection = FeatureCollection {
            bbox: None,
            features,
            foreign_members: Some(foreign_members),
        };
        
        let geojson_string = serde_json::to_string_pretty(&feature_collection)?;
        fs::write(&filename, geojson_string)?;
        
        // println!("  Wrote {} {} stops to {}", mode_stops.len(), mode_name, filename);
    }
    
    Ok(())
}
