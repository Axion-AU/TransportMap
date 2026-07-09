/**
 * Last-resort fallback for network_plan.json.
 *
 * The real plan is computed by the Rust binary `design_network` (see
 * src/network_design/), which needs a Rust toolchain. Most environments
 * that build this frontend (this dev session included) do have Rust, and
 * ensure-data.mjs tries `cargo run --bin design_network` first. This
 * fallback only fires when cargo genuinely isn't available (e.g. a
 * JS-only CI runner), so /the-plan still builds instead of the whole
 * site failing. Output is unmistakably illustrative: fixture: true,
 * flagged as a stub in every number's context.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../public/data');

export function generateNetworkPlanFixture() {
    const anchorsPath = path.resolve(__dirname, '../src/config/anchors.json');
    const anchors = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
    const costPerKm = anchors.anchors.busOperatingCostPerKm.value;

    const plan = {
        fixture: true,
        stub: true,
        generated_at: new Date().toISOString(),
        high_quality_threshold: 70,
        baseline_pct_within_400: 20,
        baseline_pct_within_800: 34,
        proposed_pct_within_400: 36,
        proposed_pct_within_800: 53,
        targets_met: false,
        total_population: 5000000,
        proposed_routes: [],
        redundant_routes: [],
        new_network_annual_cost: 0,
        decommission_annual_savings: 0,
        net_annual_cost: 0,
        current_total_network_annual_cost: 0,
        cost_per_km: costPerKm,
        cost_source: anchors.anchors.busOperatingCostPerKm.source,
        assumptions: {
            peak_headway_min: 15,
            offpeak_headway_min: 30,
            span_start_hour: 7,
            span_end_hour: 21,
            trips_per_day: 72,
            stop_spacing_m: 400,
            anchor_radius_m: 1500,
        },
    };

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, 'network_plan.json'), JSON.stringify(plan));
    console.log('[gen-network-plan-fixture] wrote a STUB network_plan.json (no Rust toolchain available). Run cargo run --bin design_network for the real numbers.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    generateNetworkPlanFixture();
}
