interface ControlsProps {
    viewMode: 'connectivity' | 'mode';
    setViewMode: (mode: 'connectivity' | 'mode') => void;
}

const Controls = ({ viewMode, setViewMode }: ControlsProps) => {
    return (
        <div className="absolute top-24 left-8 z-[1000] flex flex-col gap-4">
            <div className="bg-slate-900/80 backdrop-blur-md p-1.5 rounded-lg border border-slate-700/50 shadow-xl flex">
                <button
                    onClick={() => setViewMode('connectivity')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${viewMode === 'connectivity'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Connectivity
                </button>
                <button
                    onClick={() => setViewMode('mode')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${viewMode === 'mode'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Transport Mode
                </button>
            </div>
        </div>
    );
};

export default Controls;
