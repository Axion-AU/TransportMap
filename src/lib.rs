mod models;
mod scoring;

use wasm_bindgen::prelude::*;
use crate::models::TransportOption;
use crate::scoring::{ConnectivityCalculator, calculate_parking_score as calc_parking, calculate_walk_score as calc_walk};

#[wasm_bindgen]
pub fn calculate_connectivity_score(options: JsValue) -> f32 {
    // Deserialize JsValue to Vec<TransportOption>
    // In a real app, we should handle errors more gracefully than unwrap
    let options: Vec<TransportOption> = match serde_wasm_bindgen::from_value(options) {
        Ok(opts) => opts,
        Err(_) => return 0.0, // Return 0 or handle error appropriately
    };
    ConnectivityCalculator::calculate_total_score(&options)
}

#[wasm_bindgen]
pub fn calculate_parking_score(drive_time: f32, arrival_time_mins: u32, fill_time_mins: u32) -> f32 {
    calc_parking(drive_time, arrival_time_mins, fill_time_mins)
}

#[wasm_bindgen]
pub fn calculate_walk_score(minutes: f32, freq_score: f32, coverage_score: f32) -> f32 {
    calc_walk(minutes, freq_score, coverage_score)
}
