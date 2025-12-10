import json

def check_stop(filename, stop_name):
    with open(filename, 'r') as f:
        data = json.load(f)
        
    for feature in data['features']:
        props = feature['properties']
        if props['name'] == stop_name:
            print(f"--- {stop_name} ---")
            print(f"Bonus: {props.get('intermodal_bonus')}")
            print(f"Breakdown: {props.get('intermodal_breakdown')}")
            print(f"Coverage: {props.get('coverage_score')}")
            print(f"Connected Modes: {props.get('connected_modes')}")
            return

check_stop('frontend/public/data/stops_metro_train.geojson', 'Footscray Railway Station')
check_stop('frontend/public/data/stops_metro_train.geojson', 'Watergardens Railway Station')
check_stop('frontend/public/data/stops_metro_train.geojson', 'Richmond Railway Station')
