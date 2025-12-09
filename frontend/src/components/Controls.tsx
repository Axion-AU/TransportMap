interface ControlsProps {
    viewMode: 'connectivity' | 'mode';
    setViewMode: (mode: 'connectivity' | 'mode') => void;
}

const Controls = ({ viewMode, setViewMode }: ControlsProps) => {
    return (
        <div className="absolute top-20 left-4 z-[1000] flex flex-col gap-3">
            {/* View Mode Switcher */}
            <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-gray-200 shadow-lg flex">
                <button
                    onClick={() => setViewMode('connectivity')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'connectivity'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                >
                    <span className="text-lg">🎯</span>
                    <span>Connectivity</span>
                </button>
                <button
                    onClick={() => setViewMode('mode')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${viewMode === 'mode'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                >
                    <span className="text-lg">🚇</span>
                    <span>Transport Mode</span>
                </button>
            </div>

            {/* Instruction Card */}
            <div className="bg-white/95 backdrop-blur-md px-4 py-3 rounded-xl border border-gray-200 shadow-lg max-w-[280px]">
                <div className="text-xs font-semibold text-gray-900 mb-1">📍 Click anywhere</div>
                <div className="text-xs text-gray-600">Drop a pin to analyze transport access at any location within 800m radius.</div>
            </div>
        </div>
    );
};

export default Controls;
