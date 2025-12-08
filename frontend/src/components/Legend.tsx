interface LegendProps {
    viewMode: 'connectivity' | 'mode';
    onInfoClick: () => void;
}

const Legend = ({ viewMode, onInfoClick }: LegendProps) => {
    return (
        <div className="absolute bottom-8 right-8 bg-slate-900/80 backdrop-blur-md p-4 rounded-xl border border-slate-700/50 text-white shadow-xl z-[5000] min-w-[200px]">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">
                    {viewMode === 'connectivity' ? 'Connectivity Score' : 'Transport Mode'}
                </h3>
                <button onClick={onInfoClick} className="text-slate-400 hover:text-white" title="How is this calculated?">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
            </div>

            <div className="space-y-2">
                {viewMode === 'connectivity' ? (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#2ecc71] shadow-[0_0_8px_rgba(46,204,113,0.5)]"></div>
                            <span className="text-sm">High ({'>'}70)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#f1c40f] shadow-[0_0_8px_rgba(241,196,15,0.5)]"></div>
                            <span className="text-sm">Medium (40-70)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#e74c3c] shadow-[0_0_8px_rgba(231,76,60,0.5)]"></div>
                            <span className="text-sm">Low ({'<'}40)</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#2980b9]"></div>
                            <span className="text-sm">Metro Train</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#27ae60]"></div>
                            <span className="text-sm">Tram</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#8e44ad]"></div>
                            <span className="text-sm">Regional Train</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-[#e67e22]"></div>
                            <span className="text-sm">Bus / Coach</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Legend;
