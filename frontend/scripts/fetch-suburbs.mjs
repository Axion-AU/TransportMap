import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, 'vic-suburbs.json');

async function main() {
    console.log('Fetching Australian postcodes/localities CSV...');
    const response = await fetch('https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv');
    if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const text = await response.text();
    const lines = text.split('\n');
    
    // Parse CSV line by line, handling quoted fields properly
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    const suburbs = [];
    const seen = new Set();

    // Skip header line
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const parts = parseCSVLine(line);
        if (parts.length < 6) continue;
        
        const locality = parts[2];
        const state = parts[3];
        const lon = parseFloat(parts[4]);
        const lat = parseFloat(parts[5]);
        
        if (state === 'VIC' && locality && !isNaN(lat) && !isNaN(lon)) {
            const key = locality.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                suburbs.push({
                    name: locality,
                    lat,
                    lon
                });
            }
        }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(suburbs, null, 2));
    console.log(`Successfully wrote ${suburbs.length} Victorian suburbs to ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
