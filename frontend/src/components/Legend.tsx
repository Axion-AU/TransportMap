interface LegendProps {
    viewMode: 'connectivity' | 'mode';
    onInfoClick: () => void;
}

const Legend = ({ viewMode, onInfoClick }: LegendProps) => {
    return (
        <div className="absolute bottom-6 right-4 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-gray-200 shadow-lg z-[5000] min-w-[220px]">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
                <h3 className="font-bold text-sm text-gray-900">
                    {viewMode === 'connectivity' ? '🎯 Connectivity Score' : '🚇 Transport Mode'}
                </h3>
                <button
                    onClick={onInfoClick}
                    className="text-gray-400 hover:text-gray-700 transition-colors"
                    title="How is this calculated?"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </button>
            </div>

            <div className="space-y-2.5">
                {viewMode === 'connectivity' ? (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#2ecc71] shadow-sm"></div>
                            <span className="text-sm text-gray-700 font-medium">Excellent ({'>'}85)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#f1c40f] shadow-sm"></div>
                            <span className="text-sm text-gray-700 font-medium">Good (70-85)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#e67e22] shadow-sm"></div>
                            <span className="text-sm text-gray-700 font-medium">Fair (40-70)</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#e74c3c] shadow-sm"></div>
                            <span className="text-sm text-gray-700 font-medium">Poor ({'<'}40)</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#2980b9]"></div>
                            <span className="text-sm text-gray-700">Metro Train</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#27ae60]"></div>
                            <span className="text-sm text-gray-700">Tram</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#8e44ad]"></div>
                            <span className="text-sm text-gray-700">Regional Train</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-[#e67e22]"></div>
                            <span className="text-sm text-gray-700">Bus / Coach</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Legend;
