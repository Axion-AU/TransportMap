/// Haversine-ish planar distance in metres, cosine-of-latitude corrected.
/// Accurate to well under 1% at Melbourne's latitude and city scale,
/// matching the same approximation used by the frontend (src/lib/scoring.ts).
pub fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    const M_PER_DEG_LAT: f64 = 111_320.0;
    let d_lat = (lat2 - lat1) * M_PER_DEG_LAT;
    let mid_lat_rad = (lat1 + lat2) / 2.0 * std::f64::consts::PI / 180.0;
    let d_lon = (lon2 - lon1) * M_PER_DEG_LAT * mid_lat_rad.cos();
    (d_lat * d_lat + d_lon * d_lon).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_degree_latitude_is_about_111km() {
        let d = haversine_m(-37.5, 145.0, -38.5, 145.0);
        assert!((d - 111_320.0).abs() < 200.0, "got {d}");
    }
}
