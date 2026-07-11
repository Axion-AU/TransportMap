import { useState } from 'react';
import Map from '../components/Map';
import Legend from '../components/Legend';
import Controls from '../components/Controls';
import AddressSearch from '../components/AddressSearch';
import { usePageMeta } from '../lib/meta';

/**
 * The stop-by-stop explorer, kept as a secondary deep-dive page. Loaded
 * lazily and client-only so Leaflet never touches the funnel pages.
 */
const MapPage = () => {
    usePageMeta('Map explorer | Transport Score');
    const [viewMode, setViewMode] = useState<'connectivity' | 'mode'>('connectivity');
    const [showShapes, setShowShapes] = useState(false);

    return (
        <div className="relative h-full w-full">
            <Map viewMode={viewMode} showShapes={showShapes}>
                <AddressSearch />
            </Map>
            <Controls viewMode={viewMode} setViewMode={setViewMode} />
            <div className="absolute bottom-4 left-4 z-[2000] max-w-[calc(100vw-32px)]">
                <label className="flex items-center gap-2 bg-surface-raised border border-border-strong rounded-[4px] px-3 py-2 text-xs md:text-sm cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={showShapes}
                        onChange={(e) => setShowShapes(e.target.checked)}
                    />
                    <span className="hidden md:inline">Show route lines for the selected stop</span>
                    <span className="inline md:hidden">Show route lines</span>
                </label>
            </div>
            <Legend viewMode={viewMode} onInfoClick={() => { }} />
        </div>
    );
};

export default MapPage;
