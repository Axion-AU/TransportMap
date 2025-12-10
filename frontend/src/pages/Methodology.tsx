import { Link } from 'react-router-dom';

const Methodology = () => {
    return (
        <div className="h-full overflow-y-auto bg-slate-900 p-4 md:p-8 text-slate-300 font-sans">
            <div className="max-w-4xl mx-auto space-y-12 pb-20">
                {/* Header */}
                <header className="relative">
                    <Link to="/" className="absolute top-0 left-0 text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
                        ← Back to Map
                    </Link>
                    <div className="text-center space-y-6 pt-8">
                        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                            The Transport Inequality Engine
                        </h1>
                        <div className="max-w-2xl mx-auto text-lg md:text-xl leading-relaxed">
                            <p className="mb-4">
                                We do not measure whether public transport <em>exists</em>; we measure whether it is a <strong>viable alternative to driving</strong>.
                            </p>
                        </div>
                    </div>
                </header>

                {/* Core Philosophy */}
                <section className="bg-slate-800 rounded-2xl p-6 md:p-8 border border-slate-700 shadow-lg">
                    <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-700 pb-4">Core Philosophy</h2>
                    <div className="prose prose-invert max-w-none text-slate-300">
                        <p className="mb-6">
                            Most transport metrics count "stops per suburb". This is misleading. A bus stop served once every 60 minutes offers "fake access"—it appears on a map, but imposes a "planning tax" so high that owning a car becomes structurally mandatory.
                        </p>
                        <p className="mb-8">
                            We score every stop on a strict 0–100 scale of <strong>Car-Competitiveness</strong>.
                        </p>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                        <div className="bg-slate-900/50 p-6 rounded-xl border-l-4 border-emerald-500">
                            <div className="text-3xl font-black text-emerald-400 mb-2">85–100</div>
                            <div className="font-bold text-white text-lg mb-2">Car-Competitive</div>
                            <div className="text-sm text-slate-400 leading-relaxed">
                                Spontaneous travel is easy. You might prefer this over driving.
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-6 rounded-xl border-l-4 border-yellow-500">
                            <div className="text-3xl font-black text-yellow-500 mb-2">50–85</div>
                            <div className="font-bold text-white text-lg mb-2">Usable</div>
                            <div className="text-sm text-slate-400 leading-relaxed">
                                Viable for some trips, but driving is usually faster or more convenient.
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-6 rounded-xl border-l-4 border-red-500">
                            <div className="text-3xl font-black text-red-500 mb-2">0–50</div>
                            <div className="font-bold text-white text-lg mb-2">Non-Viable</div>
                            <div className="text-sm text-slate-400 leading-relaxed">
                                Structurally forced car ownership. Service is a safety net, not a utility.
                            </div>
                        </div>
                    </div>
                </section>

                {/* KEY 1: FREQUENCY */}
                <section className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-2xl font-bold border border-blue-500/50">1</div>
                        <h2 className="text-3xl font-black text-white">Frequency (50%)</h2>
                    </div>
                    <p className="text-lg text-slate-400 pl-16">
                        <strong>"When can I use it?"</strong> Frequency is the single most important factor. If you have to plan your life around a timetable, the system has failed as a utility.
                    </p>

                    <div className="grid lg:grid-cols-2 gap-8">
                        {/* Headway Deep Dive */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <span>⏱️</span> Headway Score (30%)
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">
                                We use the <strong>Turn Up And Go (TUAG)</strong> principle. Non-linear scoring severely penalizes waits over 20 minutes.
                            </p>
                            <div className="overflow-hidden rounded-lg border border-slate-700">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-500 uppercase bg-slate-900/80">
                                        <tr>
                                            <th className="px-4 py-2">Avg Wait (Headway/2)</th>
                                            <th className="px-4 py-2">Score</th>
                                            <th className="px-4 py-2">Verdict</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700 bg-slate-900/30">
                                        <tr><td className="px-4 py-2 font-medium text-emerald-400">0–5 min</td><td className="px-4 py-2 font-bold text-emerald-400">100</td><td className="px-4 py-2 text-slate-300">Premium TUAG</td></tr>
                                        <tr><td className="px-4 py-2 text-emerald-300">5–10 min</td><td className="px-4 py-2 font-bold text-emerald-300">95</td><td className="px-4 py-2 text-slate-300">Standard TUAG</td></tr>
                                        <tr><td className="px-4 py-2 text-teal-300">10–15 min</td><td className="px-4 py-2 font-bold text-teal-300">80</td><td className="px-4 py-2 text-slate-300">Good</td></tr>
                                        <tr><td className="px-4 py-2 text-yellow-400">15–20 min</td><td className="px-4 py-2 font-bold text-yellow-400">65</td><td className="px-4 py-2 text-slate-300">Frequent</td></tr>
                                        <tr><td className="px-4 py-2 text-orange-400">20–30 min</td><td className="px-4 py-2 font-bold text-orange-400">45</td><td className="px-4 py-2 text-slate-300">Moderate</td></tr>
                                        <tr><td className="px-4 py-2 text-red-400">30–40 min</td><td className="px-4 py-2 font-bold text-red-400">30</td><td className="px-4 py-2 text-slate-300">Poor</td></tr>
                                        <tr><td className="px-4 py-2 text-red-500">&gt; 60 min</td><td className="px-4 py-2 font-bold text-red-500">5</td><td className="px-4 py-2 text-slate-300">Catastrophic</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Service Span Deep Dive */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <span>📅</span> Service Span (15%)
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">
                                Temporal coverage. A service running every 10 mins is useless if it stops at 7 PM.
                            </p>
                            <div className="space-y-4 text-sm">
                                <div className="bg-black/30 p-3 rounded-lg border border-slate-700">
                                    <strong className="block text-slate-200 mb-1">Calculation Formula</strong>
                                    <code className="block font-mono text-xs text-blue-300">
                                        Score = (Hours_Score × 0.7) + (Days_Score × 0.3)
                                    </code>
                                </div>
                                <div className="bg-slate-900/30 p-4 rounded-lg border border-slate-700">
                                    <strong className="block text-slate-200 mb-2">Hours of Operation thresholds:</strong>
                                    <ul className="space-y-2 text-xs text-slate-400">
                                        <li className="flex justify-between border-b border-slate-700 pb-1"><span>23+ hours</span> <span className="font-bold text-emerald-400">100 pts</span></li>
                                        <li className="flex justify-between border-b border-slate-700 pb-1"><span>20+ hours</span> <span className="font-bold text-emerald-500">90 pts</span></li>
                                        <li className="flex justify-between border-b border-slate-700 pb-1"><span>18+ hours</span> <span className="font-bold text-teal-400">80 pts</span></li>
                                        <li className="flex justify-between border-b border-slate-700 pb-1"><span>16+ hours</span> <span className="font-bold text-yellow-400">70 pts</span></li>
                                        <li className="flex justify-between border-b border-slate-700 pb-1"><span>&lt;12 hours</span> <span className="font-bold text-red-400">30 pts</span></li>
                                    </ul>
                                </div>
                                <div className="text-xs text-slate-500 italic">
                                    * Reliability (5%) is calculated based on 7-day consistency (Weekends must match Weekdays).
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* KEY 2: COVERAGE */}
                <section className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-2xl font-bold border border-purple-500/50">2</div>
                        <h2 className="text-3xl font-black text-white">Coverage (50%)</h2>
                    </div>
                    <p className="text-lg text-slate-400 pl-16">
                        <strong>"Where can I use it?"</strong> Measures the reach of the network and local accessibility. Excellent frequency is useless if the train doesn't go where you need to go.
                    </p>

                    <div className="grid lg:grid-cols-2 gap-8">
                        {/* Network Coverage Deep Dive */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <span>🌐</span> Network Coverage (35%)
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">
                                We break "Network Reach" into three weighted components.
                            </p>

                            <div className="space-y-4">
                                <div className="border-l-4 border-purple-500 pl-4 bg-slate-900/30 p-2 rounded-r-lg">
                                    <div className="font-bold text-white text-sm">1. Hub Reachability (50%)</div>
                                    <p className="text-xs text-slate-400 mb-2">Can you get to a major interchange?</p>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                        <div className="flex justify-between"><span className="font-semibold text-slate-300">Super Hub</span> <span className="font-mono text-purple-300">100 pts</span></div>
                                        <div className="flex justify-between"><span className="font-semibold text-slate-300">Premium</span> <span className="font-mono text-purple-300">95 pts</span></div>
                                        <div className="flex justify-between"><span className="font-semibold text-slate-300">Major Hub</span> <span className="font-mono text-purple-300">85 pts</span></div>
                                        <div className="flex justify-between"><span className="font-semibold text-slate-300">Local</span> <span className="font-mono text-slate-500">40 pts</span></div>
                                    </div>
                                </div>

                                <div className="border-l-4 border-blue-500 pl-4 bg-slate-900/30 p-2 rounded-r-lg">
                                    <div className="font-bold text-white text-sm">2. Orbital Directness (30%)</div>
                                    <p className="text-xs text-slate-400">Can you travel suburb-to-suburb without going via the CBD?</p>
                                    <ul className="text-xs text-slate-300 mt-1 list-disc list-inside">
                                        <li><strong>Rail Interchange:</strong> <span className="text-blue-300">90 pts</span> (Best)</li>
                                        <li><strong>SmartBus / Grid:</strong> <span className="text-blue-300">70–85 pts</span></li>
                                        <li><strong>Feeder Bus:</strong> <span className="text-red-300">30 pts</span> (Penalized)</li>
                                    </ul>
                                </div>

                                <div className="border-l-4 border-slate-500 pl-4 bg-slate-900/30 p-2 rounded-r-lg">
                                    <div className="font-bold text-white text-sm">3. CBD Access (20%)</div>
                                    <p className="text-xs text-slate-400">Binary bonus (100 or 0) for direct city access.</p>
                                </div>
                            </div>
                        </div>

                        {/* Local Coverage Deep Dive */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <span>🚶</span> Local Coverage (15%)
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">
                                The "Last Mile" problem. Can you actually get to the stop?
                            </p>
                            <div className="bg-black/30 p-3 rounded-lg border border-slate-700 mb-4">
                                <code className="block font-mono text-xs text-blue-300">
                                    Score = (Walk × 0.5) + (Feeder × 0.3) + (Active × 0.2)
                                </code>
                            </div>

                            <ul className="space-y-3 text-sm text-slate-300">
                                <li className="flex gap-3 items-start p-2 bg-slate-900/30 rounded">
                                    <span className="font-bold min-w-[60px] text-white">Walk</span>
                                    <span className="text-slate-400">Based on density of stops within 400m. 3+ stops = 100pts (Dense). Optimized for walkable urban environments.</span>
                                </li>
                                <li className="flex gap-3 items-start p-2 bg-slate-900/30 rounded">
                                    <span className="font-bold min-w-[60px] text-white">Feeder</span>
                                    <span className="text-slate-400">Scored based on the frequency of the best connecting mode (Bus/Tram) at the same location.</span>
                                </li>
                                <li className="flex gap-3 items-start p-2 bg-slate-900/30 rounded">
                                    <span className="font-bold min-w-[60px] text-white">Active</span>
                                    <span className="text-slate-400">Proxy for bike/scooter viability based on transport density.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* MODIFIERS: BONUS & PENALTIES */}
                <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 border border-slate-700 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-9xl text-white">⚖️</div>
                    <div className="relative z-10">
                        <h2 className="text-3xl font-black text-white mb-2">The Multipliers</h2>
                        <p className="text-slate-400 text-lg mb-8 max-w-2xl">
                            Raw scores are adjusted by <strong>Resilience Bonuses</strong> and <strong>Failure Penalties</strong> to reflect real-world user experience.
                        </p>

                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Penalties */}
                            <div className="bg-red-950/30 border border-red-500/20 p-6 rounded-2xl">
                                <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Catastrophic Failure Logic</h3>
                                <p className="text-sm text-red-200/70 mb-4">
                                    Transport is a chain. If one link breaks (hourly bus), the entire trip fails.
                                </p>
                                <ul className="space-y-4">
                                    <li className="flex items-center justify-between border-b border-red-500/20 pb-2">
                                        <span className="text-sm text-red-200">Frequency &lt; 20pts (&gt;60m wait)</span>
                                        <span className="font-mono font-bold text-red-400">0.5x</span>
                                    </li>
                                    <li className="flex items-center justify-between border-b border-red-500/20 pb-2">
                                        <span className="text-sm text-red-200">Frequency &lt; 40pts (30-60m wait)</span>
                                        <span className="font-mono font-bold text-orange-400">0.7x</span>
                                    </li>
                                    <li className="flex items-center justify-between border-b border-red-500/20 pb-2">
                                        <span className="text-sm text-red-200">Local Access &lt; 20pts (Inaccessible)</span>
                                        <span className="font-mono font-bold text-red-400">0.5x</span>
                                    </li>
                                </ul>
                            </div>

                            {/* Bonuses */}
                            <div className="bg-emerald-950/30 border border-emerald-500/20 p-6 rounded-2xl">
                                <h3 className="text-xl font-bold text-emerald-400 mb-4">✨ Inter-Modality Bonus</h3>
                                <p className="text-sm text-emerald-200/70 mb-4">
                                    Points awarded for network resilience. Redundancy means alternatives.
                                </p>
                                <div className="space-y-4 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-emerald-100">Triple Mode (Train+Tram+Bus)</span>
                                        <span className="font-bold text-emerald-400">+20 pts</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-emerald-100">Dual Mode (Train+Tram)</span>
                                        <span className="font-bold text-emerald-400">+15 pts</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-emerald-100">Dual Mode (Train+Bus)</span>
                                        <span className="font-bold text-emerald-400">+12 pts</span>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-emerald-500/30">
                                        <div className="text-xs font-bold text-emerald-500 uppercase mb-2">Quality Weighting</div>
                                        <p className="text-xs text-emerald-200/60 leading-relaxed mb-3">
                                            A connection to a hourly bus (Score 30) receives a massive penalty.
                                        </p>
                                        <div className="grid grid-cols-2 gap-2 font-mono text-xs text-emerald-300">
                                            <div>Neighbor Score &ge; 70</div><div className="text-right">100% Bonus</div>
                                            <div>Neighbor Score &ge; 50</div><div className="text-right text-emerald-400/80">70% Bonus</div>
                                            <div>Neighbor Score &lt; 50</div><div className="text-right text-emerald-600">30% Bonus</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Exclusions */}
                <section className="space-y-6 pt-8 border-t border-slate-800">
                    <h2 className="text-2xl font-bold text-white">What We Do Not Score</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                            <h3 className="font-bold text-white mb-2">1. Cost</h3>
                            <p className="text-sm text-slate-400">
                                Cost affects <em>adoption</em>, not <em>viability</em>. If a bus runs every 60 minutes, it is unusable for commuting even if it's free.
                            </p>
                        </div>
                        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                            <h3 className="font-bold text-white mb-2">2. Timetable Coordination</h3>
                            <p className="text-sm text-slate-400">
                                Coordination is a band-aid for poor frequency. If service is frequent (TUAG), coordination is automatic.
                            </p>
                        </div>
                        <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                            <h3 className="font-bold text-white mb-2">3. Speed</h3>
                            <p className="text-sm text-slate-400">
                                We prioritize <strong>Predictability over Speed</strong>. Users prefer a consistent 55min trip over a drive varying between 22–72min.
                            </p>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};

export default Methodology;
