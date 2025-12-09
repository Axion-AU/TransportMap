import { Target, Train } from 'lucide-react';

interface ControlsProps {
    viewMode: 'connectivity' | 'mode';
    setViewMode: (mode: 'connectivity' | 'mode') => void;
}

const Controls = ({ viewMode, setViewMode }: ControlsProps) => {
    return (
        <div className="absolute top-20 left-6 z-[1000] flex flex-col gap-3">
            {/* View Mode Switcher */}
            <div className="bg-white/98 backdrop-blur-xl p-1.5 rounded-2xl border border-gray-200/80 shadow-2xl flex">
                <button
                    onClick={() => setViewMode('connectivity')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2.5 ${viewMode === 'connectivity'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                >
                    <Target className="w-4 h-4" />
                    <span>Connectivity</span>
                </button>
                <button
                    onClick={() => setViewMode('mode')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2.5 ${viewMode === 'mode'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/30'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                >
                    <Train className="w-4 h-4" />
                    <span>Transport Mode</span>
                </button>
            </div>

            {/* Instruction Card */}
            <div className="bg-white/98 backdrop-blur-xl px-4 py-3.5 rounded-2xl border border-gray-200/80 shadow-xl max-w-[300px]">
                <div className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                    Click anywhere on the map
                </div>
                <div className="text-xs text-gray-600 leading-relaxed">
                    Drop a pin to analyze transport access within an 800m walking radius.
                </div>
            </div>
        </div>
    );
};

export default Controls;
