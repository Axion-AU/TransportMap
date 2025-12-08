interface ScoringInfoProps {
    onClose: () => void;
}

const ScoringInfo = ({ onClose }: ScoringInfoProps) => {
    return (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">How We Measure Transport Inequality</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-6 text-slate-300">
                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">🚰</span>
                            <h3 className="text-lg font-semibold text-white">1. Frequency (40%) - "The Tap"</h3>
                        </div>
                        <p className="mb-2 text-sm">
                            Like turning on a tap, transport should be available when you need it.
                            If you have to check a timetable, the "tap" is broken.
                        </p>
                        <div className="bg-slate-800 p-3 rounded font-mono text-xs text-blue-400">
                            Score = (Peak×0.3 + OffPeak×0.4 + Weekend×0.3)
                        </div>
                    </section>

                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">🔧</span>
                            <h3 className="text-lg font-semibold text-white">2. Coverage (35%) - "The Pipes"</h3>
                        </div>
                        <p className="mb-2 text-sm">
                            Water is only useful if it's piped to your house.
                            Coverage measures if the network actually goes where you need to go.
                        </p>
                    </section>

                    <section>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">💧</span>
                            <h3 className="text-lg font-semibold text-white">3. Reliability (25%) - "The Flow"</h3>
                        </div>
                        <p className="mb-2 text-sm">
                            Reliability is the consistent flow of water.
                            We measure if the service runs 7 days a week or just "when it rains" (weekdays only).
                        </p>
                    </section>

                    <section className="border-t border-slate-700 pt-4">
                        <h3 className="text-lg font-semibold text-white mb-2">📍 Connectivity Score (Pin Drop)</h3>
                        <p className="mb-2 text-sm">
                            This measures <strong>Resilience</strong>.
                            If your main "pipe" bursts (train line down), do you have a backup?
                        </p>
                        <div className="bg-slate-800 p-3 rounded font-mono text-xs text-emerald-400">
                            Score = (Viable Options × 20) + (Best Score × 0.4)
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ScoringInfo;
