use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Deserialize)]
pub struct GtfsStop {
    pub stop_id: String,
    pub stop_name: String,
    pub stop_lat: f64,
    pub stop_lon: f64,
    pub location_type: Option<u8>,
    pub parent_station: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GtfsRoute {
    pub route_id: String,
    pub route_short_name: String,
    pub route_long_name: String,
    pub route_color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GtfsTrip {
    pub route_id: String,
    pub trip_id: String,
    pub service_id: String,
    pub shape_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GtfsStopTime {
    pub trip_id: String,
    pub stop_id: String,
    pub arrival_time: String,
}

#[derive(Debug, Deserialize)]
pub struct GtfsShape {
    pub shape_id: String,
    pub shape_pt_lat: f64,
    pub shape_pt_lon: f64,
    pub shape_pt_sequence: u32,
}

#[derive(Debug, Deserialize)]
pub struct GtfsCalendar {
    pub service_id: String,
    pub monday: u8,
    pub tuesday: u8,
    pub wednesday: u8,
    pub thursday: u8,
    pub friday: u8,
    pub saturday: u8,
    pub sunday: u8,
    pub start_date: String,  // YYYYMMDD format
    pub end_date: String,    // YYYYMMDD format
}

#[derive(Debug, Serialize, Clone)]
pub struct NearbyStop {
    pub id: String,
    pub name: String,
    pub mode_name: String,
    pub distance: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessedStop {
    pub id: String,
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub mode_id: u32,
    pub mode_name: String,
    pub frequency_score: f32, // Final Frequency Key (0-100)
    pub headway_score: f32,   // Component of Frequency (30% of total)
    pub service_span_score: f32, // Component of Frequency (15% of total)
    pub reliability_score: f32, // Component of Frequency (5% of total)
    
    pub coverage_score: f32, // Final Coverage Key (0-100)
    pub network_coverage_score: f32, // Component of Coverage (35% of total)
    pub local_coverage_score: f32, // Component of Coverage (15% of total)
    
    pub base_score: f32, // (Freq + Cov) / 2
    pub final_score: f32, // Base * Multipliers
    
    pub freq_penalty_multiplier: f32, // e.g. 0.5, 0.7, 1.0
    pub catch_penalty_multiplier: f32, // e.g. 0.5, 0.7, 1.0
    
    pub average_wait_time: f32, // Minutes
    pub connectivity_score: f32, // Same as final_score (kept for compat)
    
    pub color: String,
    pub route_ids: Vec<String>,
    pub shape_ids: Vec<String>, 
    pub nearby_stops: Vec<NearbyStop>,
    pub patronage_annual: Option<u32>,

    // New Network Coverage Components
    pub hub_reachability_score: f32, // Component of Network (50%)
    pub cbd_direct_score: f32,       // Component of Network (20%)
    pub orbital_directness_score: f32, // Component of Network (30%)
    pub connectivity_tier: String,   // "Premium", "Excellent", "Good", etc.

    // Inter-Modality Bonus Fields
    // Inter-Modality Bonus Fields
    pub intermodal_bonus: f32,
    pub intermodal_breakdown: Vec<String>,
    pub connected_modes: Vec<String>,
    pub train_stops_nearby: Vec<ConnectedStopInfo>,
    pub tram_stops_nearby: Vec<ConnectedStopInfo>,
    pub bus_stops_nearby: Vec<ConnectedStopInfo>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ConnectedStopInfo {
    pub name: String,
    pub mode: String,
    pub score: f32, // Intrinsic Quality Score (Freq + Span)
    pub distance: f32,
    pub route_summary: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcessedRoute {
    pub id: String,
    pub short_name: String,
    pub long_name: String,
    pub color: String,
    pub mode_id: u32,
    pub shape_ids: Vec<String>, // All shapes used by this route
}

pub struct StopData {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub mode_id: u32,
    pub mode_name: String,
    pub trip_count: u32,
    pub routes: HashSet<String>,
    pub shapes: HashSet<String>, // Track which specific shapes serve this stop
    pub is_parent: bool,
    
    // Store actual departure times (hours since midnight)
    pub weekday_peak_departures: Vec<f32>,
    pub weekday_offpeak_departures: Vec<f32>,
    pub weekend_departures: Vec<f32>,
    
    // Track which trips we've already recorded (to avoid duplicates across days)
    pub recorded_peak_trips: HashSet<String>,
    pub recorded_offpeak_trips: HashSet<String>,
    pub recorded_weekend_trips: HashSet<String>,
    
    pub active_days: HashSet<u8>,
}

impl StopData {
    pub fn new(name: String, lat: f64, lon: f64, mode_id: u32, mode_name: String) -> Self {
        Self {
            name,
            lat,
            lon,
            mode_id,
            mode_name,
            trip_count: 0,
            routes: HashSet::new(),
            shapes: HashSet::new(),
            is_parent: false,
            weekday_peak_departures: Vec::new(),
            weekday_offpeak_departures: Vec::new(),
            weekend_departures: Vec::new(),
            recorded_peak_trips: HashSet::new(),
            recorded_offpeak_trips: HashSet::new(),
            recorded_weekend_trips: HashSet::new(),
            active_days: HashSet::new(),
        }
    }
}
