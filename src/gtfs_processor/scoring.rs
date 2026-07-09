use super::models::*;
use chrono::{NaiveDate, Datelike, Weekday};
use std::collections::{HashMap, HashSet};

// Helpers
pub fn calculate_average_headway(mut departures: Vec<f32>) -> Option<f32> {
    if departures.len() < 2 { return None; }
    departures.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let mut headways = Vec::new();
    for i in 1..departures.len() {
        headways.push((departures[i] - departures[i - 1]) * 60.0);
    }
    let sum: f32 = headways.iter().sum();
    Some(sum / headways.len() as f32)
}

pub fn calculate_average_wait_time(departures: Vec<f32>) -> f32 {
    match calculate_average_headway(departures) {
        Some(avg_headway) => avg_headway / 2.0,
        None => 999.0,
    }
}

// 1. Headway Score (0-100)
// Maps "Average Wait Time" (Headway / 2) to a score.

#[derive(Debug, Clone)]
pub struct ModalConnections {
    pub has_train: bool,
    pub has_tram: bool,
    pub has_bus: bool,
    pub train_stops: Vec<ConnectedStopInfo>, // Detailed info
    pub tram_stops: Vec<ConnectedStopInfo>,
    pub bus_stops: Vec<ConnectedStopInfo>,
}

pub struct InterModalBonus {
    pub total: f32,
    pub breakdown: Vec<String>,
}

// Calculates "Intrinsic Quality" (0-100) based on Freq + Span only.
// Used for nearby stops to avoid circular dependencies.
pub fn calculate_intrinsic_stop_quality(stop: &StopData) -> f32 {
    // 1. Headway
    let peak = calculate_average_wait_time(stop.weekday_peak_departures.clone());
    let offpeak = calculate_average_wait_time(stop.weekday_offpeak_departures.clone());
    let weekend = calculate_average_wait_time(stop.weekend_departures.clone());
    
    let w_score = (calculate_headway_score(peak) * 0.6) 
                + (calculate_headway_score(offpeak) * 0.25) 
                + (calculate_headway_score(weekend) * 0.15);

    // 2. Span
    // Simplified span calculation (cached max_days would be better but expensive to recompute)
    // We'll use a rough proxy if max_days isn't easily available? 
    // Actually stop.active_days is available.
    let max_days = stop.active_days.len();
    
    // Flatten departures for span
    let mut all_deps = stop.weekday_peak_departures.clone();
    all_deps.extend(&stop.weekday_offpeak_departures);
    
    let span_score = calculate_service_span_score(&all_deps, max_days, false, 0.0);
    
    // Quality = (Freq * 0.6) + (Span * 0.4)
    (w_score * 0.6 + span_score * 0.4).min(100.0)
}


pub fn detect_nearby_modes(
    stop: &StopData,
    nearby_stops: &[NearbyStop],
    stops_map: &HashMap<String, StopData>,
) -> ModalConnections {
    let mut train_candidates = Vec::new();
    let mut tram_candidates = Vec::new();
    let mut bus_candidates = Vec::new();

    // 150m radius
    for n in nearby_stops {
        if n.distance > 150.0 { break; } 
        
        if let Some(neighbor) = stops_map.get(&n.id) {
            let quality = calculate_intrinsic_stop_quality(neighbor);
            let routes_str = neighbor.routes.iter().take(3).cloned().collect::<Vec<_>>().join(", "); // Simple summary
            
            let info = ConnectedStopInfo {
                name: neighbor.name.clone(),
                mode: neighbor.mode_name.clone(),
                score: quality,
                distance: n.distance as f32,
                route_summary: routes_str,
            };

            match neighbor.mode_id {
                1 | 2 => train_candidates.push(info),
                3 => tram_candidates.push(info),
                4 | 5 | 6 | 11 => bus_candidates.push(info),
                _ => {}
            }
        }
    }

    // Helper to deduplicate: Group by Name, Keep Highest Score
    let deduplicate = |candidates: Vec<ConnectedStopInfo>| -> Vec<ConnectedStopInfo> {
        let mut best_map: HashMap<String, ConnectedStopInfo> = HashMap::new();
        for c in candidates {
            // Trim bay numbers for grouping? "Footscray Station/Irving St" is consistent.
            // If names are identical, this works.
            let key = c.name.clone(); 
            if let Some(existing) = best_map.get(&key) {
                if c.score > existing.score {
                    best_map.insert(key, c);
                }
            } else {
                best_map.insert(key, c);
            }
        }
        let mut final_list: Vec<ConnectedStopInfo> = best_map.into_values().collect();
        final_list.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap()); // Best first
        final_list
    };

    let train_stops = deduplicate(train_candidates);
    let tram_stops = deduplicate(tram_candidates);
    let bus_stops = deduplicate(bus_candidates);

    ModalConnections {
        has_train: !train_stops.is_empty(),
        has_tram: !tram_stops.is_empty(),
        has_bus: !bus_stops.is_empty(),
        train_stops,
        tram_stops,
        bus_stops,
    }
}


pub fn calculate_intermodal_bonus(
    stop_mode_id: u32,
    connections: &ModalConnections,
) -> InterModalBonus {
    let mut bonus = 0.0;
    let mut bonus_breakdown = Vec::new();
    
    // Quality Multiplier Helper
    let get_multiplier = |score: f32| -> f32 {
        if score >= 70.0 { 1.0 }
        else if score >= 50.0 { 0.7 }
        else { 0.3 }
    };
    
    // Get Best Scores
    let best_train = connections.train_stops.first().map(|s| s.score).unwrap_or(0.0);
    let best_tram = connections.tram_stops.first().map(|s| s.score).unwrap_or(0.0);
    let best_bus = connections.bus_stops.first().map(|s| s.score).unwrap_or(0.0);
    
    let m_train = get_multiplier(best_train);
    let m_tram = get_multiplier(best_tram);
    let m_bus = get_multiplier(best_bus);

    match stop_mode_id {
        1 | 2 => { // Current is TRAIN
            if connections.has_tram && connections.has_bus {
                 let weighted_avg_mult = (m_tram + m_bus) / 2.0; 
                 // If both are present, we reward 20 * average quality
                 // Or better: 20 * min? Or 20 * weighted?
                 // Let's use simple sum logic or hierarchy logic
                 // If Triple Mode: 20 points.
                 // Scale by average quality of connections.
                 bonus = 20.0 * weighted_avg_mult;
                 bonus_breakdown.push(format!("Train+Tram({:.1})+Bus({:.1}): +{:.1}", m_tram, m_bus, bonus));
            } else if connections.has_tram {
                 bonus = 15.0 * m_tram;
                 bonus_breakdown.push(format!("Train+Tram(Q{:.0}): +{:.1}", best_tram, bonus));
            } else if connections.has_bus {
                 bonus = 12.0 * m_bus;
                 bonus_breakdown.push(format!("Train+Bus(Q{:.0}): +{:.1}", best_bus, bonus));
            }
        },
        3 => { // Current is TRAM
            if connections.has_train && connections.has_bus {
                 let weighted_avg_mult = (m_train + m_bus) / 2.0;
                 bonus = 20.0 * weighted_avg_mult;
                 bonus_breakdown.push(format!("Tram+Train+Bus: +{:.1}", bonus));
            } else if connections.has_train {
                 bonus = 15.0 * m_train;
                 bonus_breakdown.push(format!("Tram+Train(Q{:.0}): +{:.1}", best_train, bonus));
            } else if connections.has_bus {
                 bonus = 8.0 * m_bus;
                 bonus_breakdown.push(format!("Tram+Bus(Q{:.0}): +{:.1}", best_bus, bonus));
            }
        },
        4 | 5 | 6 | 11 => { // Current is BUS
            if connections.has_train && connections.has_tram {
                 let weighted_avg_mult = (m_train + m_tram) / 2.0;
                 bonus = 20.0 * weighted_avg_mult;
                 bonus_breakdown.push(format!("Bus+Train+Tram: +{:.1}", bonus));
            } else if connections.has_train {
                 bonus = 12.0 * m_train;
                 bonus_breakdown.push(format!("Bus+Train(Q{:.0}): +{:.1}", best_train, bonus));
            } else if connections.has_tram {
                 bonus = 8.0 * m_tram;
                 bonus_breakdown.push(format!("Bus+Tram(Q{:.0}): +{:.1}", best_tram, bonus));
            }
        },
        _ => {}
    }
    
    InterModalBonus {
        total: bonus,
        breakdown: bonus_breakdown,
    }
}
pub fn calculate_headway_score(avg_wait_minutes: f32) -> f32 {
    let w = avg_wait_minutes;
    if w <= 5.0 { 100.0 }       // < 10m Headway (Premium TUAG)
    else if w <= 10.0 { 95.0 }  // < 20m Headway (TUAG)
    else if w <= 15.0 { 80.0 }  // < 30m Headway (Good)
    else if w <= 20.0 { 65.0 }  // < 40m Headway (Frequent)
    else if w <= 30.0 { 45.0 }  // < 60m Headway (Moderate)
    else if w <= 40.0 { 30.0 }  // < 80m Headway (Poor - Sunbury case)
    else if w <= 60.0 { 15.0 }  // < 120m Headway (Very Poor)
    else { 5.0 }                // Catastrophic
}

// 2. Service Span Score (0-100)
// Measures hours of operation (70%) and days of service (30%)
// 2. Service Span Score (0-100)
// Measures hours of operation (70%) and days of service (30%)
pub fn calculate_service_span_score(
    departures: &[f32], 
    active_days: usize,
    has_night_network: bool,
    night_frequency: f32
) -> f32 {
    if departures.is_empty() { return 0.0; }
    
    // Hours Component (70%)
    let mut sorted = departures.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let first = sorted.first().unwrap();
    let last = sorted.last().unwrap();
    let span_hours = last - first;

    // Stricter thresholds ( User Feedback: 100/100 needs 23+ hours)
    let hours_score = if span_hours >= 23.0 { 100.0 }       // True 24/7 or close
    else if span_hours >= 20.0 { 90.0 }                     // Very long hours
    else if span_hours >= 18.0 { 80.0 }                     // Long hours (Current Melbourne Standard ~19h)
    else if span_hours >= 16.0 { 70.0 }                     // Good hours
    else if span_hours >= 14.0 { 60.0 }                     // Moderate
    else if span_hours >= 12.0 { 50.0 }                     // Limited
    else { 30.0 };                                          // Poor

    // Days Component (30%)
    let days_score = (active_days as f32 / 7.0) * 100.0;
    
    // Night Network Bonus (Add to final score)
    // Only if night service exists
    let night_bonus = if has_night_network {
        if night_frequency <= 20.0 { 10.0 }      // Frequent/Viable night service
        else if night_frequency <= 40.0 { 5.0 }  // Marginal
        else { 2.0 }                             // Nominal (Hourly)
    } else {
        0.0
    };

    let base_score = (hours_score * 0.7) + (days_score * 0.3);
    
    (base_score + night_bonus).min(100.0)
}

// 3. Reliability Score (0-100)
// Proxy: Is the schedule consistent across the week?
// We check if weekday/weekend patterns are stable.
// Simplified proxy: If runs 7 days = 100, if < 5 days = 50.
pub fn calculate_reliability_score(active_days: usize) -> f32 {
    // Ideally we'd check if M-F have same trips, but active_days is a good proxy for "consistent daily service"
    if active_days >= 7 { 100.0 }
    else if active_days >= 5 { 80.0 }
    else { 50.0 }
}

// --- PENALTY FUNCTIONS ---

pub fn calculate_frequency_penalty(headway_score: f32) -> f32 {
    if headway_score < 20.0 { 0.50 }      // Catastrophic (>60m wait)
    else if headway_score < 40.0 { 0.70 } // Severe (30-60m wait)
    else if headway_score < 60.0 { 0.85 } // Moderate (15-30m wait)
    else { 1.0 }                          // No penalty
}

pub fn calculate_catchment_penalty(local_coverage_score: f32) -> f32 {
    if local_coverage_score < 20.0 { 0.50 }      // Catastrophic
    else if local_coverage_score < 40.0 { 0.70 } // Severe
    else if local_coverage_score < 60.0 { 0.85 } // Moderate
    else { 1.0 }                                 // No penalty
}

pub fn parse_gtfs_date(date_str: &str) -> Option<NaiveDate> {
    if date_str.len() != 8 { return None; }
    let year: i32 = date_str[0..4].parse().ok()?;
    let month: u32 = date_str[4..6].parse().ok()?;
    let day: u32 = date_str[6..8].parse().ok()?;
    NaiveDate::from_ymd_opt(year, month, day)
}

pub fn find_nth_weekday(start_date: NaiveDate, target_weekday: Weekday, n: usize) -> NaiveDate {
    let mut date = start_date;
    let mut count = 0;
    loop {
        if date.weekday() == target_weekday {
            count += 1;
            if count == n { return date; }
        }
        date = date.succ_opt().unwrap();
    }
}

pub fn is_service_active(
    service_id: &str,
    date: NaiveDate,
    service_dates: &HashMap<String, (NaiveDate, NaiveDate)>,
    service_days: &HashMap<String, HashSet<u8>>
) -> bool {
    if let Some((start, end)) = service_dates.get(service_id) {
        if date < *start || date > *end { return false; }
    }
    if let Some(active_days) = service_days.get(service_id) {
        let weekday_num = match date.weekday() { 
            Weekday::Mon => 0, Weekday::Tue => 1, Weekday::Wed => 2,
            Weekday::Thu => 3, Weekday::Fri => 4, Weekday::Sat => 5, Weekday::Sun => 6,
        };
        return active_days.contains(&weekday_num);
    }
    false
}

pub fn parse_time(time_str: &str) -> Option<f32> {
    let parts: Vec<&str> = time_str.trim().split(':').collect();
    if parts.len() < 2 { return None; }
    let h: f32 = parts[0].parse().ok()?;
    let m: f32 = parts[1].parse().ok()?;
    let s: f32 = if parts.len() > 2 { parts[2].parse().ok()? } else { 0.0 };
    Some(h + m / 60.0 + s / 3600.0)
}

// Split Coverage Implementations

const SUPER_HUBS: &[&str] = &[
    "Southern Cross", "Flinders Street", "Melbourne Central"
];

const MAJOR_HUBS: &[&str] = &[
    "Parliament", "Flagstaff",
    "Footscray", "Sunshine", "Richmond", "Caulfield", "Box Hill", "Camberwell", "Glen Waverley"
];

const MELBOURNE_TOPOLOGY_PENALTY: f32 = 0.80;

fn calculate_hub_connectivity(stop: &StopData, routes_map: &HashMap<String, ProcessedRoute>) -> (f32, String) {

    let mut has_city_loop = false;
    let mut has_metro_tunnel = false;
    let mut has_major_interchange = false;
    let mut is_super_hub = false;

    let s_lower = stop.name.to_lowercase();
    
    // Check Super Hub status first
    if SUPER_HUBS.iter().any(|h| s_lower.contains(&h.to_lowercase())) {
        is_super_hub = true;
    }

    for rid in &stop.routes {
        if let Some(route) = routes_map.get(rid) {
            let lower = route.long_name.to_lowercase();
            
            // Check specific premium corridors
            if lower.contains("city") || lower.contains("flinders") { has_city_loop = true; }
            if lower.contains("sunbury") || lower.contains("pakenham") || lower.contains("cranbourne") {
                // Future Metro Tunnel lines
                has_metro_tunnel = true; 
            }
        }
    }

    // Check for Major Interchanges
    let is_hub = MAJOR_HUBS.iter().any(|h| s_lower.contains(&h.to_lowercase()));
    if is_hub { has_major_interchange = true; }

    // Connectivity Tier Logic
    let tier = if is_super_hub {
        ("Premium", 100.0) // 100/100 for Super Hubs
    } else if has_metro_tunnel && has_city_loop {
        ("Premium", 95.0) // 95/100
    } else if has_city_loop || is_hub {
        ("Excellent", 85.0) // 85/100
    } else if stop.routes.iter().any(|r| routes_map.get(r).map(|x| x.long_name.to_lowercase().contains("city")).unwrap_or(false)) {
        ("Good", 65.0) // 65/100
    } else {
        ("Moderate", 40.0) // 40/100
    };

    (tier.1, tier.0.to_string())
}

// 4. Network Coverage (35%)
// Measures "Where can you go?".
fn calculate_network_coverage(
    stop: &StopData, 
    routes_map: &HashMap<String, ProcessedRoute>,
    unique_routes_count: usize,
    nearby_has_tram: bool,
    nearby_has_bus: bool,
    topology_tier: &str // "Grid", "Orbital", "Feeder", "Radial"
) -> (f32, f32, f32, f32, String) {
    
    // 1. Hub Connectivity (50%)
    let (hub_raw, tier_name) = calculate_hub_connectivity(stop, routes_map);
    
    // 2. Directness / Orbital (30%)
    let mut orbital_score: f32 = 20.0; // Default Bus Only / Poor
    
    // A. Analyze Modes
    let mut has_train = false;
    let mut has_tram = false;
    let mut has_bus = false;
    let mut train_route_count = 0;
    
    for rid in &stop.routes {
        if let Some(r) = routes_map.get(rid) {
            match r.mode_id {
                1 | 2 => { 
                    has_train = true; 
                    train_route_count += 1;
                },
                3 => has_tram = true,
                4 | 5 | 6 | 11 => has_bus = true,
                _ => {}
            }
        }
    }
    
    // Merge with Nearby Context
    has_tram = has_tram || nearby_has_tram;
    has_bus = has_bus || nearby_has_bus;

    // C. Apply Hierarchy with TOPOLOGY
    if has_train {
        if train_route_count >= 2 {
            orbital_score = 90.0; // Rail Interchange (Best)
        } else {
            orbital_score = 40.0; // Single Rail
        }

        if has_tram && (topology_tier == "Grid" || topology_tier == "Orbital") {
             orbital_score = orbital_score.max(85.0); // Rail + Grid Tram
        }
    } else if has_tram {
        if topology_tier == "Grid" {
            // Base 70 + Hub Bonus + Freq Bonus logic
            let hub_bonus = if hub_raw > 80.0 { 10.0 } else { 0.0 };
            orbital_score = 70.0 + hub_bonus;
        } else {
            // Feeder Tram
            orbital_score = 45.0 + (if hub_raw > 80.0 { 10.0 } else { 0.0 });
            // SE tram heuristic is largely superseded by Grid check, but still useful if Grid misses?
            // User: SE Trams are mostly Grid. North Trams are mostly Grid INNER, Feeder OUTER.
            // Topology Check handles this.
        }
    } else {
        // Bus Only
        match topology_tier {
            "Orbital" | "SmartBus" => {
                orbital_score = 75.0 + (if hub_raw > 80.0 { 10.0 } else { 0.0 });
            },
            "Arterial" | "Grid" => {
                // Heuristic: Cross connection bonus check is complex here.
                // We use Hub Connectivity as proxy for Cross-connection potential + Base.
                orbital_score = 60.0 + (if hub_raw > 60.0 { 15.0 } else { 0.0 });
            },
            "Feeder" => {
                orbital_score = 30.0 + (if hub_raw > 80.0 { 10.0 } else { 0.0 });
            },
            _ => { // Local
                orbital_score = 45.0; 
            }
        }
    }
    
    let s_lower = stop.name.to_lowercase();
    
    // Check Super Hubs (Implicitly perfect orbital)
    let is_super_hub = SUPER_HUBS.iter().any(|h| s_lower.contains(&h.to_lowercase()));
    let is_major = MAJOR_HUBS.iter().any(|h| s_lower.contains(&h.to_lowercase()));
    
    if is_super_hub {
        orbital_score = 100.0; 
    } else if is_major {
        orbital_score += 10.0;
    }
    
    if orbital_score > 100.0 { orbital_score = 100.0; }

    // 3. CBD Access (20%)
    let connects_to_cbd = stop.routes.iter().any(|r| {
        routes_map.get(r).map(|route| {
            let lower = route.long_name.to_lowercase();
            lower.contains("city") || lower.contains("flinders") || lower.contains("melbourne")
        }).unwrap_or(false)
    });
    let cbd_score = if is_super_hub || connects_to_cbd { 100.0 } else { 0.0 };

    // Weighted Combination
    let raw_network_score = (hub_raw * 0.5) + (orbital_score * 0.3) + (cbd_score * 0.2);
    
    let final_network_score = raw_network_score; 
    // We REMOVED the Topology Penalty (0.80) because we now score accurately via Topology Tier.
    
    (final_network_score, hub_raw, cbd_score, orbital_score, tier_name)
}

// 5. Local Coverage (15%)
// Measures "How can you get here?". Walk (50%) + Feeder (30%) + Active (20%).
fn calculate_local_coverage(
    stops_within_400m: usize,
    feeder_modes_different: usize,
    best_feeder_headway: f32
) -> f32 {
    // 1. Walking catchment (50% of local coverage)
    // 3+ stops within 400m = Dense network.
    let walk_score = match stops_within_400m {
        n if n >= 3 => 100.0,
        2 => 70.0,
        1 => 40.0, // Just itself?
        _ => 10.0, // Isolated
    };
    
    // 2. Feeder connections (30% of local coverage)
    // Based on best feeder frequency.
    let feeder_score = if feeder_modes_different > 0 {
        calculate_headway_score(best_feeder_headway / 2.0) // Headway to Wait calc
    } else {
        0.0 
    };
    
    // 3. Active transport (20% of local coverage)
    // Proxy: If in dense stop area (>5 stops nearby) assume urban/active friendly.
    let active_transport_score = if stops_within_400m > 5 { 100.0 } 
    else if stops_within_400m > 2 { 70.0 }
    else { 30.0 };
    
    (walk_score * 0.5) + (feeder_score * 0.3) + (active_transport_score * 0.2)
}

// Helper for Topology Classification
pub fn classify_route_topology(
    route: &ProcessedRoute, 
    arterial_roads: &HashSet<String>
) -> String {
    if route.mode_id == 3 { // TRAM
        // Default Grid for inner/most trams
        return "Grid".to_string();
    } 
    
    if route.mode_id == 4 || route.mode_id == 6 { // BUS
        // 1. SmartBus
        // Robust header check for 900-series
        // Remove non-numeric chars for parsing (e.g. "903a")? 
        // Or just trim. most GTFS short_names are clean "903".
        let clean_short = route.short_name.trim();
        let r_num = clean_short.parse::<u32>().unwrap_or_else(|_| {
            // Fallback: try to extract leading digits? 
            // Often just return 0 if fails.
            // But let's check if it starts with 9 and length is 3?
            if clean_short.len() == 3 && clean_short.starts_with('9') && clean_short.chars().all(char::is_numeric) {
                 clean_short.parse().unwrap_or(0)
            } else {
                 0
            }
        });

        if r_num >= 900 && r_num <= 999 {
            return "SmartBus".to_string();
        } 
        
        // 2. Arterial check
        let mut is_arterial = false;
        let r_name_upper = route.long_name.to_uppercase();
        
        for road in arterial_roads {
             if r_name_upper.contains(road) {
                 is_arterial = true; 
                 break;
             }
        }
        

        
        if is_arterial {
            return "Arterial".to_string();
        } 
        
        if r_name_upper.contains("STATION") { 
            return "Feeder".to_string();
        }
        
        return "Local".to_string();
    } 
    
    if route.mode_id == 1 || route.mode_id == 2 {
        return "Radial".to_string();
    }
    
    "Local".to_string()
}

// MAIN SCORING LOGIC - TWO KEY FRAMEWORK
pub fn calculate_scores(
    stops_map: &HashMap<String, StopData>,
    child_to_parent: &HashMap<String, String>,
    patronage_map: &HashMap<String, u32>,
    routes_map: &HashMap<String, ProcessedRoute>,
    arterial_roads: &HashSet<String>
) -> Vec<ProcessedStop> {
    println!("Calculating scores (Two-Key Framework)...");
    
    // PRE-CALCULATE ROUTE TOPOLOGIES
    let mut route_topologies: HashMap<String, String> = HashMap::new();
    
    for (rid, route) in routes_map {
        let topology = classify_route_topology(route, arterial_roads);
        route_topologies.insert(rid.clone(), topology);
    }
    
    // Refine Topologies (e.g. Route 82)
    if let Some(r82) = routes_map.values().find(|r| r.short_name == "82" && r.mode_id == 3) {
        route_topologies.insert(r82.id.clone(), "Feeder".to_string());
    }

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

    // Key: id, Value: (headway, span, rel, net, loc, wait, freq, cov, f_mult, c_mult, hub, cbd, orb, tier, intermodal, connections)
    let mut scores_map: HashMap<String, (f32, f32, f32, f32, f32, f32, f32, f32, f32, f32, f32, f32, f32, String, InterModalBonus, ModalConnections, String)> = HashMap::new();
    let mut nearby_stops_map: HashMap<String, Vec<NearbyStop>> = HashMap::new();

    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let grid_x = (data.lon / grid_size).floor() as i32;
        let grid_y = (data.lat / grid_size).floor() as i32;

        let mut cluster_peak = Vec::new();
        let mut cluster_offpeak = Vec::new();
        let mut cluster_weekend = Vec::new();
        let mut all_departures_for_span = Vec::new(); // Use all departures for span calculation
        
        let mut cluster_routes = HashSet::new();
        let mut nearby = Vec::new();
        let mut max_days = data.active_days.len();
        
        let mut stops_within_400m = 0;
        let mut feeder_modes = HashSet::new();

        for dx in -1..=1 {
            for dy in -1..=1 {
                if let Some(neighbors) = grid.get(&(grid_x + dx, grid_y + dy)) {
                    for nid in neighbors {
                        if let Some(neighbor) = stops_map.get(nid) {
                            
                            let dist_sq = (data.lat - neighbor.lat).powi(2) + (data.lon - neighbor.lon).powi(2);
                            let dist_m = dist_sq.sqrt() * 111000.0;
                            
                            if dist_sq < grid_size*grid_size {
                                if nid == id {
                                    cluster_peak.extend(&neighbor.weekday_peak_departures);
                                    cluster_offpeak.extend(&neighbor.weekday_offpeak_departures);
                                    cluster_weekend.extend(&neighbor.weekend_departures);
                                    
                                    all_departures_for_span.extend(&neighbor.weekday_peak_departures);
                                    all_departures_for_span.extend(&neighbor.weekday_offpeak_departures);
                                    
                                    for r in &neighbor.routes { cluster_routes.insert(r.clone()); }
                                    if neighbor.active_days.len() > max_days { max_days = neighbor.active_days.len(); }
                                }

                                if nid != id && neighbor.mode_id == data.mode_id && dist_m < 800.0 {
                                   // Nearby
                                } else if dist_m < 800.0 && neighbor.mode_id != data.mode_id {
                                    feeder_modes.insert(neighbor.mode_id);
                                }
                                
                                if dist_m < 400.0 {
                                    stops_within_400m += 1;
                                }

                                if nid != id {
                                    nearby.push(NearbyStop {
                                        id: nid.clone(),
                                        name: neighbor.name.clone(),
                                        mode_name: neighbor.mode_name.clone(),
                                        distance: dist_m,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        nearby.sort_by(|a, b| a.distance.partial_cmp(&b.distance).unwrap());


        // nearby is sorted by distance.
        // We need 'best_feeder_headway' and count of VIABLE feeders (Frequency Score > 50) for local coverage.
        
        // Identify VIABLE feeder modes
        let mut best_feeder_headway = 999.0;
        let mut viable_feeder_count = 0;
        let mut counted_feeder_modes = HashSet::new();

        // Let's filter `nearby` (neighbors within valid distance)
        let mut nearby_has_tram = false;
        let mut nearby_has_bus = false;

        for neighbor_item in &nearby {
             if let Some(neighbor) = stops_map.get(&neighbor_item.id) {
                 
                 // Basic mode check for Orbital context
                 if neighbor.mode_id == 3 { nearby_has_tram = true; }
                 if neighbor.mode_id == 4 || neighbor.mode_id == 6 { nearby_has_bus = true; }

                 // Must be DIFFERENT mode to be a feeder
                 if neighbor.mode_id != data.mode_id {
                     // Check viability
                     let n_peak = calculate_average_wait_time(neighbor.weekday_peak_departures.clone());
                     let n_score = calculate_headway_score(n_peak);
                     
                     if n_score > 50.0 {
                         // It's a viable feeder
                         if !counted_feeder_modes.contains(&neighbor.mode_id) {
                            viable_feeder_count += 1;
                            counted_feeder_modes.insert(neighbor.mode_id);
                         }
                         if n_peak < best_feeder_headway {
                             best_feeder_headway = n_peak;
                         }
                     }
                 }
             }
        }
        
        // Deduplicate nearby stops by name (keep closest)
        let mut unique_nearby = Vec::new();
        let mut seen_names = HashSet::new();
        for n in &nearby {
            if !seen_names.contains(&n.name) {
                seen_names.insert(n.name.clone());
                unique_nearby.push(n.clone());
            }
        }
        
        nearby_stops_map.insert(id.clone(), unique_nearby.clone());


        // --- KEY 1: FREQUENCY (50%) ---
        // 1. Headway (30% of total)
        let peak_wait = calculate_average_wait_time(cluster_peak);
        let offpeak_wait = calculate_average_wait_time(cluster_offpeak);
        let weekend_wait = calculate_average_wait_time(cluster_weekend.clone());
        
        let avg_wait_for_display = if peak_wait < 999.0 { peak_wait } else { offpeak_wait };

        let headway_score_val = (calculate_headway_score(peak_wait) * 0.6) 
                              + (calculate_headway_score(offpeak_wait) * 0.25)
                              + (calculate_headway_score(weekend_wait) * 0.15);

        // 2. Service Span (15% of total)
        // Check for Night Network (Weekend 1am-4am)
        let night_departures: Vec<f32> = cluster_weekend.iter()
            .filter(|&&t| (t >= 1.0 && t <= 4.5) || (t >= 25.0 && t <= 28.5))
            .cloned()
            .collect();
            
        let has_night_network = !night_departures.is_empty();
        let night_frequency = if has_night_network {
            calculate_average_wait_time(night_departures)
        } else {
            0.0
        };

        let span_score_val = calculate_service_span_score(
            &all_departures_for_span, 
            max_days,
            has_night_network,
            night_frequency
        );

        // 3. Reliability (5% of total)
        let rel_score_val = calculate_reliability_score(max_days);

        // Frequency Key Score (0-100)
        let frequency_total = (headway_score_val * 0.60) + (span_score_val * 0.30) + (rel_score_val * 0.10);

        // --- KEY 2: COVERAGE (50%) ---
        
        // DETERMINE BEST TOPOLOGY FOR STOP
        // A stop serves multiple routes. We take the "Best" topology.
        // Hierarchy: SmartBus/Orbital > Grid/Arterial > Radial/Feeder
        let mut best_topology = "Local";
        let mut topo_score = 0; // Local = 0
        
        for rid in &data.routes {
             if let Some(t) = route_topologies.get(rid) {
                 let s = match t.as_str() {
                     "SmartBus" | "Orbital" => 4,
                     "Grid" => 3,
                     "Arterial" => 2,
                     "Radial" | "SpokeHub" => 1,
                     _ => 0
                 };
                 if s > topo_score {
                     topo_score = s;
                     best_topology = t.as_str();
                 }
             }
        }
        
        // 1. Network Coverage (35% of total)
        let (net_score_val, hub_reach, cbd_dir, orb_dir, tier) = calculate_network_coverage(
            data, 
            routes_map, 
            cluster_routes.len(),
            nearby_has_tram,
            nearby_has_bus,
            best_topology
        );

        // 2. Local Coverage (15% of total)
        let mut loc_score_val = calculate_local_coverage(stops_within_400m, viable_feeder_count, best_feeder_headway);
        
        // Super Hub Override: CBD density assumption
        let s_lower_local = data.name.to_lowercase();
        if SUPER_HUBS.iter().any(|h| s_lower_local.contains(&h.to_lowercase())) {
            loc_score_val = 100.0;
        }

        // --- INTER-MODALITY BONUS ---
        let modal_connections = detect_nearby_modes(data, &nearby, stops_map);
        let intermodal = calculate_intermodal_bonus(data.mode_id, &modal_connections);

        // Coverage Key Score (0-100)
        let base_coverage = (net_score_val * 0.70) + (loc_score_val * 0.30);
        let coverage_total = (base_coverage + intermodal.total).min(100.0);

        // --- PENALTIES ---
        let freq_mult = calculate_frequency_penalty(headway_score_val);
        let catch_mult = calculate_catchment_penalty(loc_score_val);
        
        scores_map.insert(id.clone(), (
            headway_score_val, span_score_val, rel_score_val, 
            net_score_val, loc_score_val, 
            avg_wait_for_display, 
            frequency_total, coverage_total,
            freq_mult, catch_mult,
            hub_reach, cbd_dir, orb_dir, tier,
            intermodal, modal_connections, // Add new structs to map
            best_topology.to_string()
        ));
    }

    let mut final_stops = Vec::new();
    for id in &active_stops {
        let data = stops_map.get(id).unwrap();
        let (head, span, rel, net, loc, avg_wait, freq_key, cov_key, f_mult, c_mult, hub, cbd, orb, tier_n, intermodal, connections, best_topology_n) = scores_map.get(id).unwrap();
        
        // Base Score = (Frequency Key * 0.5) + (Coverage Key * 0.5)
        let base_score = (freq_key * 0.5) + (cov_key * 0.5);
        
        let final_score = base_score * f_mult * c_mult;
        
        let mut color = "#7f8c8d".to_string();
        if let Some(rid) = data.routes.iter().next() {
            if let Some(r) = routes_map.get(rid) { color = r.color.clone(); }
        }

        let patronage = if data.mode_id == 2 {
            let norm = data.name.to_lowercase().replace(" railway station", "").trim().to_string();
            patronage_map.get(&norm).cloned()
        } else { None };

        final_stops.push(ProcessedStop {
            id: id.clone(),
            name: data.name.clone(),
            lat: data.lat,
            lon: data.lon,
            mode_id: data.mode_id,
            mode_name: data.mode_name.clone(),
            
            frequency_score: *freq_key,
            headway_score: *head,
            service_span_score: *span,
            reliability_score: *rel,
            average_wait_time: *avg_wait,
            
            coverage_score: *cov_key,
            network_coverage_score: *net,
            local_coverage_score: *loc,
            
            base_score,
            final_score,
            connectivity_score: final_score, 
            
            freq_penalty_multiplier: *f_mult,
            catch_penalty_multiplier: *c_mult,
            
            color,
            route_ids: data.routes.iter().cloned().collect(),
            shape_ids: data.shapes.iter().cloned().collect(),
            nearby_stops: nearby_stops_map.remove(id).unwrap_or_default(),
            patronage_annual: patronage,

            // New fields
            hub_reachability_score: *hub,
            cbd_direct_score: *cbd,
            orbital_directness_score: *orb,
            connectivity_tier: tier_n.clone(),
            best_topology: best_topology_n.clone(),

            intermodal_bonus: intermodal.total,
            intermodal_breakdown: intermodal.breakdown.clone(),
            connected_modes: {
                let mut modes = Vec::new();
                if connections.has_train { modes.push("Train".to_string()); }
                if connections.has_tram { modes.push("Tram".to_string()); }
                if connections.has_bus { modes.push("Bus".to_string()); }
                modes
            },
            train_stops_nearby: connections.train_stops.clone(),
            tram_stops_nearby: connections.tram_stops.clone(),
            bus_stops_nearby: connections.bus_stops.clone(),
        });
    }
    final_stops
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_headway_score() {
        assert_eq!(calculate_headway_score(4.0), 100.0); // 4m wait (<5)
        assert_eq!(calculate_headway_score(9.0), 95.0);  // 9m wait (<10)
        assert_eq!(calculate_headway_score(40.0), 30.0); // 40m wait (Sunbury case)
        assert_eq!(calculate_headway_score(70.0), 5.0);  // 70m wait (Catastrophic)
    }

    #[test]
    fn test_calculate_service_span_score() {
        let deps_18h = vec![5.0, 23.0]; // 18 hours span
        // Hours Score for 18h = 80.0. Days Score = 100.0.
        // Final = (80 * 0.7) + (100 * 0.3) = 56 + 30 = 86.0.
        assert_eq!(calculate_service_span_score(&deps_18h, 7, false, 0.0), 86.0);

        let deps_12h = vec![7.0, 19.0];
        // Score = (50 * 0.7) + (100 * 0.3) = 35 + 30 = 65
        assert_eq!(calculate_service_span_score(&deps_12h, 7, false, 0.0), 65.0);
    }

    #[test]
    fn test_calculate_frequency_penalty() {
        assert_eq!(calculate_frequency_penalty(15.0), 0.50); // < 20
        assert_eq!(calculate_frequency_penalty(30.0), 0.70); // < 40
        assert_eq!(calculate_frequency_penalty(50.0), 0.85); // < 60
        assert_eq!(calculate_frequency_penalty(70.0), 1.0);  // >= 60
    }
    
    #[test]
    fn test_scenario_sunbury() {
        // Sunbury: ~40m wait (Score 30).
        let headway_score = 30.0; 
        
        // Freq Key components (assuming good span/reliability for train)
        let span_score = 100.0;
        let rel_score = 100.0;
        let freq_key = (headway_score * 0.6) + (span_score * 0.3) + (rel_score * 0.1);
        // = 18 + 30 + 10 = 58.0
        
        // Coverage (assuming decent network, poor local for the 'House' scenario, but we score stops)
        // Let's assume the stop itself is decent coverage, but the *penalty* is the prediction key.
        // User says "Sunbury house scored 70.5 base".
        // Let's assume Cov Key = 83 (since (58+83)/2 = 70.5)
        let cov_key = 83.0;
        let base_score = (freq_key * 0.5) + (cov_key * 0.5); // 70.5
        
        // Penalty
        // Headway Score 30.0 -> < 40.0 -> 0.70 multiplier.
        let penalty = calculate_frequency_penalty(headway_score);
        assert_eq!(penalty, 0.70);
        
        let final_score = base_score * penalty;
        // 70.5 * 0.7 = 49.35. Matches user expectation exactly.
        assert!((final_score - 49.35).abs() < 0.1);
    }
    
    #[test]
    fn test_scenario_arden() {
        // Arden: Good Freq (Headway 5m wait -> 95).
        let headway_score = 95.0;
        let freq_key = (95.0 * 0.6) + (100.0 * 0.3) + (100.0 * 0.1); // = 57 + 30 + 10 = 97.
        
        // Poor Local (Isolated). Local Score 10.
        // Net Coverage (New station, maybe limited routes yet? Say 40).
        let loc_score = 10.0;
        let net_score = 40.0;
        let cov_key = (net_score * 0.7) + (loc_score * 0.3); // = 28 + 3 = 31.
        
        let base_score = (freq_key * 0.5) + (cov_key * 0.5); // (97 + 31)/2 = 64.
        
        // Penalty: Local Coverage < 20 -> 0.50 multiplier.
        let c_penalty = calculate_catchment_penalty(loc_score);
        assert_eq!(c_penalty, 0.50);
        
        let final_score = base_score * c_penalty; // 64 * 0.5 = 32.
        assert!(final_score < 45.0);
    }

    #[test]
    fn test_scenario_watergardens_refined() {
        // Mock Watergardens Data
        let mut stop = StopData::new(
            "Watergardens Railway Station".to_string(), 
            -37.7, 144.7, 
            2, "Metro Train".to_string()
        );
        stop.routes.insert("sunbury_line".to_string());
        
        let mut routes_map = HashMap::new();
        routes_map.insert("sunbury_line".to_string(), ProcessedRoute {
            id: "sunbury_line".to_string(),
            short_name: "Sunbury".to_string(),
            long_name: "Sunbury Line (City Loop)".to_string(), // Has "City"
            color: "yellow".to_string(),
            mode_id: 2,
            shape_ids: vec![],
        });
        
        // Calculate Network Coverage
        // Hubs: Yes (Premium/Excellent due to City Loop) -> 85.0
        // CBD: Yes -> 100.0
        // Orbital: Poor (40.0) -> No bonus
        // Unique Routes: 1
        
        // Pass "Radial" topology for train
        let (net_final, hub, cbd, orb, tier) = calculate_network_coverage(&stop, &routes_map, 1, false, false, "Radial");
        
        // Hub Score: "Premium" (95.0) because has City Loop AND Metro Tunnel (Sunbury)
        assert_eq!(tier, "Premium");
        assert_eq!(hub, 95.0);
        
        // CBD Score: 100.0
        assert_eq!(cbd, 100.0);
        
        // Orbital Score: 40.0 (Base)
        assert_eq!(orb, 40.0);
        
        // Raw Net = (95 * 0.5) + (40 * 0.3) + (100 * 0.2)
        //         = 47.5 + 12.0 + 20.0 = 79.5
        
        // Final Net = 79.5 * 0.80 (Topology Penalty) = 63.6
        // We REMOVED penalty -> 79.5 using correct orbital logic.
        assert!((net_final - 79.5).abs() < 0.1);
        
        // Total Score Simulation
        // Freq Key: 74.0 (as per user input)
        // Cov Key: (59.6 * 0.7) + (Local 70.0 * 0.3)
        //        = 41.72 + 21.0 = 62.72
        
        // Base Score = (74 + 62.72) / 2 = 68.36
        // This is close to user expectation (70-72).
        // If we assumed "Premium" (95.0) it would be higher?
        // Let's check "Premium" condition: "Metro Tunnel" + "City Loop"
        // Ours only has "City Loop" in mock name.
    }

    #[test]
    fn test_scenario_sunshine() {
        // Mock Sunshine Data
        let mut stop = StopData::new(
            "Sunshine Railway Station".to_string(), 
            -37.7, 144.8, 
            2, "Metro Train".to_string()
        );
        stop.routes.insert("sunbury_line".to_string());
        stop.routes.insert("geelong_line".to_string());
        stop.routes.insert("ballarat_line".to_string());
             
        let mut routes_map = HashMap::new();
        routes_map.insert("sunbury_line".to_string(), ProcessedRoute {
            id: "sunbury_line".to_string(), short_name: "Sunbury".to_string(),
            long_name: "Sunbury Line".to_string(), color: "y".to_string(), mode_id: 2, shape_ids: vec![],
        });
        routes_map.insert("geelong_line".to_string(), ProcessedRoute {
            id: "geelong_line".to_string(), short_name: "Geelong".to_string(),
            long_name: "Geelong Line".to_string(), color: "p".to_string(), mode_id: 2, shape_ids: vec![],
        });

             
        // Calculate Network Coverage
        // Hubs: It IS a major hub (Sunshine).
        // Plus 3 routes.
        
        // Pass "Radial" for train
        let (net_final, hub, cbd, orb, tier) = calculate_network_coverage(&stop, &routes_map, 3, false, true, "Radial");
        
        assert_eq!(tier, "Excellent");
        assert_eq!(hub, 85.0);
        assert_eq!(orb, 100.0);
        assert_eq!(cbd, 0.0);
        
        // Raw Net = (85 * 0.5) + (100 * 0.3) + (0 * 0.2) = 72.5
        assert!((net_final - 72.5).abs() < 0.1);
    }

    #[test]
    fn test_arterial_classification() {
        let mut arterial_set = HashSet::new();
        arterial_set.insert("SUNSHINE RD".to_string());
        
        // 1. Clean Arterial
        let r1 = ProcessedRoute {
            id: "216".to_string(), short_name: "216".to_string(), 
            long_name: "Sunshine - City via Sunshine Rd".to_string(), 
            color: "".to_string(), mode_id: 4, shape_ids: vec![]
        };
        assert_eq!(classify_route_topology(&r1, &arterial_set), "Arterial");
        
        // 2. Clean SmartBus
        let r2 = ProcessedRoute {
             id: "901".to_string(), short_name: "901".to_string(),
             long_name: "Frankston - Airport".to_string(),
             color: "".to_string(), mode_id: 4, shape_ids: vec![]
        };
        assert_eq!(classify_route_topology(&r2, &arterial_set), "SmartBus");

        // 3. Dirty SmartBus (Regression Test)
        let r2_dirty = ProcessedRoute {
             id: "903".to_string(), short_name: " 903 ".to_string(), // Whitespace
             long_name: "Alton - Mordialloc via Sunshine Station".to_string(), // Has 'Station', would be Feeder if fails check
             color: "".to_string(), mode_id: 4, shape_ids: vec![]
        };
        assert_eq!(classify_route_topology(&r2_dirty, &arterial_set), "SmartBus");
        
        // 4. Feeder
        let r3 = ProcessedRoute {
            id: "456".to_string(), short_name: "456".to_string(),
            long_name: "Melton Station - Sunshine Station".to_string(),
            color: "".to_string(), mode_id: 4, shape_ids: vec![]
        };
        assert_eq!(classify_route_topology(&r3, &arterial_set), "Feeder");
    }
}
