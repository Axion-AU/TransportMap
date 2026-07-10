import { useState, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface SearchResult {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
}

const AddressSearch = () => {
    const map = useMap();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 3) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                // Bounding box for Victoria approx: 140.9, -39.2, 150.0, -33.9
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=140.9,-39.2,150.0,-33.9&bounded=1&limit=5`
                );
                const data = await response.json();
                setResults(data);
                setIsOpen(true);
            } catch (error) {
                console.error('Search failed:', error);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (result: SearchResult) => {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        map.flyTo([lat, lon], 15);
        setQuery(result.display_name.split(',')[0]); // Keep it short
        setIsOpen(false);

        // Simulate a click to trigger the pin drop
        // We need to dispatch a map click event manually or expose the handler
        map.fireEvent('click', {
            latlng: L.latLng(lat, lon),
            originalEvent: {} as MouseEvent
        });
    };

    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] w-[90%] max-w-md" ref={searchRef}>
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search address..."
                    className="w-full px-4 py-3 bg-surface-raised/90 backdrop-blur-md rounded-[4px] shadow-lg border border-border-strong text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-violet transition-all"
                />
                {loading && (
                    <div className="absolute right-3 top-3.5">
                        <div className="animate-spin h-5 w-5 border-2 border-cyan rounded-full border-t-transparent"></div>
                    </div>
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-surface-raised border border-border-strong rounded-[4px] shadow-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    {results.map((result) => (
                        <button
                            key={result.place_id}
                            onClick={() => handleSelect(result)}
                            className="w-full text-left px-4 py-3 hover:bg-purple-900/60 border-b border-border-subtle last:border-0 text-sm text-ink-soft hover:text-ink transition-colors"
                        >
                            {result.display_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AddressSearch;
