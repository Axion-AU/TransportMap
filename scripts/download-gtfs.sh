#!/bin/bash
set -e

echo "Downloading GTFS zip from Transport Victoria..."
mkdir -p temp_gtfs
curl -L -o temp_gtfs/gtfs.zip "https://opendata.transport.vic.gov.au/dataset/3f4e292e-7f8a-4ffe-831f-1953be0fe448/resource/fb152201-859f-4882-9206-b768060b50ad/download/gtfs.zip"

echo "Extracting main GTFS zip..."
unzip -q temp_gtfs/gtfs.zip -d temp_gtfs/extracted

mkdir -p gtfs

MODES=(1 2 3 4 5 6 11)
for mode in "${MODES[@]}"; do
    if [ -f "temp_gtfs/extracted/${mode}.zip" ]; then
        echo "Processing mode ${mode}..."
        mkdir -p "gtfs/${mode}"
        cp "temp_gtfs/extracted/${mode}.zip" "gtfs/${mode}/google_transit.zip"
        mkdir -p "gtfs/${mode}/google_transit"
        unzip -q -o "gtfs/${mode}/google_transit.zip" -d "gtfs/${mode}/google_transit"
    else
        echo "Warning: mode ${mode}.zip not found in feed."
    fi
done

echo "Cleaning up temporary files..."
rm -rf temp_gtfs

echo "GTFS data successfully downloaded and prepared!"
