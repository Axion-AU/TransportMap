
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_headway_score() {
        // 10m Headway = 5m wait. Should be >= 90.
        assert_eq!(calculate_headway_score(4.9), 95.0);
        
        // 20m Headway = 10m wait. Should be around 75.
        // wait_time < 10.0 -> 75.0
        assert_eq!(calculate_headway_score(9.9), 75.0);
        
        // 60m Headway = 30m wait. Should be low.
        // wait_time < 30.0 -> 25.0
        assert_eq!(calculate_headway_score(29.0), 25.0);
        
        // > 60m Headway = > 30m wait.
        assert_eq!(calculate_headway_score(35.0), 10.0);
    }
    
    #[test]
    fn test_calculate_service_span_score() {
        // 18 hours (e.g. 5am to 11pm = 18h).
        let deps_good = vec![5.0, 23.0]; 
        assert_eq!(calculate_service_span_score(&deps_good), 100.0);
        
        // 12 hours (7am to 7pm).
        let deps_ok = vec![7.0, 19.0];
        assert_eq!(calculate_service_span_score(&deps_ok), 60.0);
        
        // 8 hours
        let deps_bad = vec![9.0, 17.0];
        assert_eq!(calculate_service_span_score(&deps_bad), 20.0);
    }
    
    #[test]
    fn test_penalty_logic_mock() {
        // This is a logic test, mirroring the logic in calculate_scores
        // If Headway Score < 20, multiplier 0.5.
        
        let headway_score = 10.0; // > 60m Headway
        let coverage_score = 80.0; 
        
        // Freq Key = Head * 0.6 + Span * 0.3 + Rel * 0.1
        // Assume Span=100, Rel=100
        let freq_key = (10.0 * 0.6) + (100.0 * 0.3) + (100.0 * 0.1); 
        // = 6 + 30 + 10 = 46.
        
        let base_score = (freq_key * 0.5) + (coverage_score * 0.5);
        // = (23) + (40) = 63.
        
        let multiplier = if headway_score < 20.0 { 0.5 } else { 1.0 };
        let final_score = base_score * multiplier;
        // = 63 * 0.5 = 31.5.
        
        assert!(final_score < 50.0); // Should be Non-Viable
    }
}
