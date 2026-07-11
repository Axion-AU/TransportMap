"""
Computes a many-to-many public-transport travel-time matrix using r5py
(https://r5py.readthedocs.io/), for the Stage 2 methodology-refactor work
(docs/methodology_refactor.md items 2 & 7: cumulative accessibility + car
competitiveness).

Run inside the Docker image built from this directory's Dockerfile, not
directly on the host (r5py needs a JVM; see frontend/scripts/
compute-travel-time-matrix.mjs, which builds/runs this container). Reads
three inputs mounted at /data:
  - osm.pbf            -- the (possibly clipped) OSM extract
  - gtfs.zip            -- the same GTFS zip the Rust pipeline scores against
  - origins.csv          -- suburb centroids: id,lat,lon
and writes /data/pt-matrix.json: a flat list of
  {"from": id, "to": id, "travelTimeMinutes": float | null}
(null where r5py found no route within the time window, e.g. two suburbs
with no connecting service inside the search window).

Departure date/window: passed via env vars REPR_DATE (YYYY-MM-DD) and
DEPARTURE_TIME (HH:MM), not hardcoded here -- see compute-travel-time-matrix.mjs
for how the date is chosen (deliberately NOT the raw metro_train median from
representative_dates.json this run -- see docs/methodology_refactor.md
Stage 2 progress log for why).

Wait time convention: r5py's TravelTimeMatrixComputer already models
departure-time-window-based waiting (it samples multiple departures across
the window and reports percentile travel times), which is a more direct
model of wait than catchmentScore's "half headway" heuristic elsewhere in
this codebase -- this script uses r5py's own modelling rather than
reimplementing half-headway, and that difference is noted in the
methodology page copy, not hidden.
"""

import csv
import glob
import json
import os
import sys
import datetime

from r5py import TransportNetwork, TravelTimeMatrix, TransportMode
import geopandas as gpd
import shapely.geometry


def main():
    data_dir = "/data"
    osm_path = os.path.join(data_dir, "osm.pbf")
    # One flat (non-nested) GTFS zip per mode -- r5py's TransportNetwork needs
    # standard root-level stops.txt/trips.txt/etc per feed, but the Rust
    # pipeline's own gtfs.zip is nested per-mode (gtfs/<mode_id>/google_transit/),
    # so compute-travel-time-matrix.mjs re-zips each already-extracted mode
    # directory flat into /data/gtfs/mode_<id>.zip before this runs.
    gtfs_paths = sorted(glob.glob(os.path.join(data_dir, "gtfs", "*.zip")))
    origins_path = os.path.join(data_dir, "origins.csv")
    output_path = os.path.join(data_dir, "pt-matrix.json")
    if not gtfs_paths:
        print(f"No GTFS zips found under {data_dir}/gtfs/*.zip", file=sys.stderr)
        sys.exit(1)
    print(f"Using {len(gtfs_paths)} GTFS feeds: {[os.path.basename(p) for p in gtfs_paths]}")

    repr_date = os.environ.get("REPR_DATE")
    departure_time = os.environ.get("DEPARTURE_TIME", "08:00")
    if not repr_date:
        print("REPR_DATE env var is required (YYYY-MM-DD)", file=sys.stderr)
        sys.exit(1)

    print(f"Loading origins from {origins_path}...")
    rows = []
    with open(origins_path, newline="") as f:
        for row in csv.DictReader(f):
            rows.append({"id": row["id"], "lat": float(row["lat"]), "lon": float(row["lon"])})
    print(f"  {len(rows)} suburb centroids.")

    points = gpd.GeoDataFrame(
        {"id": [r["id"] for r in rows]},
        geometry=[shapely.geometry.Point(r["lon"], r["lat"]) for r in rows],
        crs="EPSG:4326",
    )

    print(f"Building transport network from {osm_path} + {len(gtfs_paths)} GTFS feeds...")
    network = TransportNetwork(osm_path, gtfs_paths)

    year, month, day = (int(x) for x in repr_date.split("-"))
    hour, minute = (int(x) for x in departure_time.split(":"))
    departure = datetime.datetime(year, month, day, hour, minute)

    print(f"Computing travel-time matrix for {len(rows)}x{len(rows)} suburb pairs, departure {departure}...")
    matrix = TravelTimeMatrix(
        network,
        origins=points,
        destinations=points,
        departure=departure,
        transport_modes=[TransportMode.TRANSIT],
        access_modes=[TransportMode.WALK],
    )

    print(f"Writing {output_path}...")
    out = []
    for _, row in matrix.iterrows():
        tt = row["travel_time"]
        out.append({
            "from": str(row["from_id"]),
            "to": str(row["to_id"]),
            "travelTimeMinutes": None if tt is None or (isinstance(tt, float) and tt != tt) else float(tt),
        })
    with open(output_path, "w") as f:
        json.dump(out, f)
    print(f"Wrote {len(out)} origin-destination pairs.")


if __name__ == "__main__":
    main()
