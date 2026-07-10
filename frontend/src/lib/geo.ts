/**
 * Geohash tiling for stop lookups.
 *
 * Stops are sharded at build time into public/data/tiles/<geohash5>.json
 * (precision 5 cells are roughly 4.9km x 4.9km), so an address lookup
 * fetches at most 4 small tiles instead of the full stop dataset.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const TILE_PRECISION = 5;

export function geohashEncode(lat: number, lon: number, precision: number = TILE_PRECISION): string {
    let latMin = -90, latMax = 90;
    let lonMin = -180, lonMax = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let evenBit = true;

    while (hash.length < precision) {
        if (evenBit) {
            const mid = (lonMin + lonMax) / 2;
            if (lon >= mid) { ch = (ch << 1) | 1; lonMin = mid; }
            else { ch = ch << 1; lonMax = mid; }
        } else {
            const mid = (latMin + latMax) / 2;
            if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; }
            else { ch = ch << 1; latMax = mid; }
        }
        evenBit = !evenBit;
        bit += 1;
        if (bit === 5) {
            hash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return hash;
}

const METERS_PER_DEGREE_LAT = 111320;

/**
 * Grid cell size for suburb-level population aggregation (methodology
 * refactor item 1) and its map display -- shared by build-data.mjs (which
 * computes cell centers) and SuburbMap.tsx (which draws each cell's
 * bounds from its center), so the two can never drift apart.
 */
export const GRID_STEP_DEG = 250 / METERS_PER_DEGREE_LAT;

/**
 * Tile keys covering a circle of radiusM around a point: the tiles of the
 * four corners of the bounding box, deduplicated (1 to 4 keys).
 */
export function tilesFor(lat: number, lon: number, radiusM: number): string[] {
    const dLat = radiusM / METERS_PER_DEGREE_LAT;
    const dLon = radiusM / (METERS_PER_DEGREE_LAT * Math.cos(lat * (Math.PI / 180)));
    const keys = new Set<string>();
    for (const la of [lat - dLat, lat + dLat]) {
        for (const lo of [lon - dLon, lon + dLon]) {
            keys.add(geohashEncode(la, lo));
        }
    }
    return [...keys];
}
