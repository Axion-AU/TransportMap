use transport_inequality::gtfs_processor::driver;
use transport_inequality::gtfs_processor::extractor;
use transport_inequality::simulation;
use std::error::Error;
use std::fs;
use std::path::Path;

fn main() -> Result<(), Box<dyn Error>> {
    let zip_path = Path::new("gtfs.zip");
    extractor::download_gtfs_if_needed(zip_path)?;

    if zip_path.exists() {
        extractor::extract_gtfs_zip(zip_path, Path::new("gtfs"))?;
    }

    driver::run_processing("gtfs")?;
    
    // Run Simulation Generation
    println!("Running Bus Grid Simulation...");
    let sim = simulation::generate_bus_grid("frontend/public/data/dtp_managed_roads.geojson")?;
    
    // Save output
    fs::write(
        "frontend/public/data/simulated_bus_grid.json", 
        serde_json::to_string(&sim)?
    )?;
    
    Ok(())
}
