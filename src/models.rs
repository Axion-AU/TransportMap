use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub enum TransportKey {
    Frequency,   // Weight: 40%
    Coverage,    // Weight: 35%
    Reliability, // Weight: 25%
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StationMetrics {
    pub frequency_score: f32,
    pub coverage_score: f32,
    pub reliability_score: f32,
    pub daily_cost: f32,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone, Copy)]
pub enum AccessMode {
    WalkToPT,
    FeederBus,
    ParkAndRide,
    BikeToPT,
    ActiveOnly,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TransportOption {
    pub mode: AccessMode,
    pub raw_score: f32,
    pub is_viable: bool,
    pub time_sensitive: bool,
}
