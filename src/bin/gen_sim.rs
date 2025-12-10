use transport_inequality::simulation;
use std::error::Error;
use std::fs;

fn main() -> Result<(), Box<dyn Error>> {
    println!("Running Bus Grid Simulation (Standalone)...");
    
    // Ensure output directory exists (it should, but good practice)
    fs::create_dir_all("frontend/public/data")?;

    let sim = simulation::generate_bus_grid("frontend/public/data/dtp_managed_roads.geojson")?;
    
    // Save output
    fs::write(
        "frontend/public/data/simulated_bus_grid.json", 
        serde_json::to_string(&sim)?
    )?;
    
    println!("Done! Output saved to frontend/public/data/simulated_bus_grid.json");
    Ok(())
}
