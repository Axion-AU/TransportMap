use transport_inequality::network_design;
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    let data_dir = "frontend/public/data";
    let anchors_path = "frontend/src/config/anchors.json";

    println!("Designing feeder network from {data_dir}...");
    let plan = network_design::run(data_dir, anchors_path)?;

    println!(
        "Baseline: {:.1}% within 400m, {:.1}% within 800m",
        plan.baseline_pct_within_400, plan.baseline_pct_within_800
    );
    println!(
        "Proposed: {:.1}% within 400m, {:.1}% within 800m (targets {})",
        plan.proposed_pct_within_400,
        plan.proposed_pct_within_800,
        if plan.targets_met { "met" } else { "NOT met" }
    );
    println!(
        "{} proposed routes, {} redundant routes flagged",
        plan.proposed_routes.len(),
        plan.redundant_routes.len()
    );
    println!(
        "Net annual cost: ${:.0} (new ${:.0} minus decommission savings ${:.0})",
        plan.net_annual_cost, plan.new_network_annual_cost, plan.decommission_annual_savings
    );

    let out_path = format!("{data_dir}/network_plan.json");
    network_design::write_plan(&plan, &out_path)?;
    println!("Wrote {out_path}");

    Ok(())
}
