
Department of Transport and Planning GTFS Release Notes
December 2025



Contents
Overview	2
General Information	2
GTFS Specification Compliance	2
Publication Schedule	2
GTFS Currency	2
Data Scope	2
Geographic Data Accuracy	2
Identifiers	3
Value Quoting	3
Feed Size	3
GTFS Release	3



Overview
This documentation provides some general information regarding Department of Transport and Planning (DTP) GTFS data.

This DTP GTFS contains timetable and geographic data for:
	•	All metropolitan and regional trains
	•	All metropolitan and regional bus (including coach)
	•	All metropolitan trams


General Information
GTFS Specification Compliance
The data is compliant with the GTFS specification.

Reference: https://developers.google.com/transit/gtfs/reference

Publication Schedule
The data is scheduled to be published on a weekly or as needed basis.  There may be periods where publication is delayed due to scheduled maintenance or unforeseen circumstances.
GTFS Currency
As DTP regularly receives timetable amendments, it is recommended that participants regularly update their data with the latest available DTP GTFS data.

Data Scope
Geographic Coverage:
The data is a representation of the public transport data currently available via data.vic.gov.au and will cover the same geographic extent.
Validity Period: 
DTP GTFS will contain a rolling 90 days of data from the date of export.
Some route information may not be complete for this entire period due to service information not yet being made available.  As this information becomes available to DTP, it will be made available in subsequent data publications.

Geographic Data Accuracy
The path information provided is generated based on a mix of automatic algorithm and manual pathing. There may be inaccuracies with the paths and hence the paths may not always match on road operations.
Identifiers
Many of the identifiers used within the feed will include characters such as:
	•	plus (+),
	•	underscore (_),
	•	hyphen (-)
	•	full stop (.)
Care may need to be taken to consider this when using the data or
developing applications. Identifiers may not be consistent across datasets. 
Value Quoting
All values within the files are enclosed in double-quotes (e.g. ”X”). 
Feed Size
The feed size will vary depending on the volume of data held by DTP at the time of export.
DTP typically utilises more data during special events, timetable changes or holidays periods - hence the data volume will typically increase around these events. This may alter the feed size considerably.

GTFS Release
The DTP GTFS data has been exported by operational branches listed in the folder numbers below: 

1 - Regional Train
2 - Metropolitan Train
3 - Metropolitan Tram
4 - myki Bus (Metro Bus and Regional Town Bus)
5 - Regional Coach
6 - Regional Bus
10 - Interstate Train
11 - SkyBus

The GTFS data provided for each of the eight operational branches is in the form of eight files and is described in the following table:

GTFS File
Fields
agency.txt
agency_id, agency_name, agency_url, agency_timezone, agency_lang, agency_fare_url
calendar.txt
service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date
calendar_dates.txt
service_id, date, exception_type
levels.txt
level_id, level_index, level_name
pathways.txt
pathway_id, from_stop_id, to_stop_id, pathway_mode, is_bidirectional, traversal_time
routes.txt
route_id, agency_id, route_short_name, route_long_name, route_type, route_color,route_text_color
shapes.txt
shape_id, shape_pt_lat, shape_pt_lon, shape_pt_sequence, shape_dist_traveled
stops.txt
stop_id, stop_code, stop_name, stop_lat, stop_lon, stop_url, location_type, parent_station, wheelchair_boarding, level_id, platform_code
stop_times.txt
trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type, shape_dist_traveled
transfers.txt
from_stop_id, to_stop_id, from_route_id, to_route_id, from_trip_id, to_trip_id, transfer_type, min_transfer_time
trips.txt
route_id, service_id, trip_id, shape_id, trip_headsign, direction_id, block_id, wheelchair_accessible, bikes_allowed

