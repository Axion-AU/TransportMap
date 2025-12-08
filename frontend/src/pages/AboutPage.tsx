const AboutPage = () => {
    return (
        <div className="h-full overflow-y-auto bg-slate-900 p-4 md:p-8 text-slate-300">
            <div className="max-w-4xl mx-auto space-y-12 pb-20">

                {/* Header */}
                <header className="text-center space-y-6">
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                        How We Measure Transport Inequality
                    </h1>
                    <div className="max-w-2xl mx-auto text-lg md:text-xl leading-relaxed">
                        <p className="mb-4">
                            Transport is like a <strong>water utility</strong>.
                        </p>
                        <ul className="text-left space-y-2 bg-slate-800/50 p-6 rounded-xl border border-slate-700 inline-block">
                            <li>🚰 It should be <strong>available</strong> when you need it (The Tap)</li>
                            <li>🔧 It should <strong>reach</strong> your house (The Pipes)</li>
                            <li>💧 It should <strong>flow</strong> consistently (The Flow)</li>
                        </ul>
                    </div>
                </header>

                {/* The Three Keys */}
                <div className="grid gap-8 md:grid-cols-3">

                    {/* Frequency */}
                    <section className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-4xl">🚰</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">1. Frequency</h2>
                                <div className="text-sm font-mono text-blue-400">"The Tap" (40%)</div>
                            </div>
                        </div>
                        <p className="mb-4 text-sm flex-grow">
                            Like turning on a tap, transport should be available when you need it.
                            If you have to check a timetable, the "tap" is broken.
                        </p>
                        <div className="bg-slate-900/50 p-3 rounded-lg text-xs space-y-2 mb-4">
                            <div className="flex justify-between">
                                <span className="text-emerald-400">✓ Good</span>
                                <span>Every 6 mins (Just show up)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-red-400">✗ Bad</span>
                                <span>Every 60 mins (Must plan)</span>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-2 rounded font-mono text-[10px] text-slate-400 text-center">
                            Measured by: Average Wait Time (Weighted)
                        </div>
                    </section>

                    {/* Coverage */}
                    <section className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-4xl">🔧</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">2. Coverage</h2>
                                <div className="text-sm font-mono text-blue-400">"The Pipes" (35%)</div>
                            </div>
                        </div>
                        <p className="mb-4 text-sm flex-grow">
                            Water is only useful if it's piped to your house.
                            Coverage measures if the network actually goes where you need to go.
                        </p>
                        <div className="bg-slate-900/50 p-3 rounded-lg text-xs space-y-2 mb-4">
                            <div className="flex justify-between">
                                <span className="text-emerald-400">✓ Good</span>
                                <span>80+ destinations</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-red-400">✗ Bad</span>
                                <span>12 destinations</span>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-2 rounded font-mono text-[10px] text-slate-400 text-center">
                            Measured by: Unique Routes & Destinations
                        </div>
                    </section>

                    {/* Reliability */}
                    <section className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-lg flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-4xl">💧</span>
                            <div>
                                <h2 className="text-xl font-bold text-white">3. Reliability</h2>
                                <div className="text-sm font-mono text-blue-400">"The Flow" (25%)</div>
                            </div>
                        </div>
                        <p className="mb-4 text-sm flex-grow">
                            Reliability is the consistent flow of water.
                            We measure if the service runs 7 days a week or just <strong>"when it rains"</strong> (weekdays only).
                        </p>
                        <div className="bg-slate-900/50 p-3 rounded-lg text-xs space-y-2 mb-4">
                            <div className="flex justify-between">
                                <span className="text-emerald-400">✓ Good</span>
                                <span>7 days, 95% on-time</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-red-400">✗ Bad</span>
                                <span>Weekdays only</span>
                            </div>
                        </div>
                        <div className="bg-slate-900 p-2 rounded font-mono text-[10px] text-slate-400 text-center">
                            Measured by: 7-Day Service Consistency
                        </div>
                    </section>
                </div>

                {/* Connectivity Score */}
                <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 text-9xl">📍</div>
                    <div className="relative z-10">
                        <h2 className="text-3xl font-black text-white mb-4 flex items-center gap-3">
                            <span>📍</span> Connectivity Score
                        </h2>
                        <p className="text-lg mb-6 max-w-2xl">
                            This measures <strong>Resilience</strong>. If your main "pipe" bursts (train line down), do you have a backup?
                        </p>

                        <div className="grid md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="font-bold text-white mb-2">What is a "Viable Option"?</h3>
                                <ul className="space-y-2 text-sm mb-6">
                                    <li className="flex gap-2"><span className="text-emerald-400">✓</span> Walk to frequent train (Score &gt; 50)</li>
                                    <li className="flex gap-2"><span className="text-emerald-400">✓</span> Bike to station with lanes (Score &gt; 50)</li>
                                    <li className="flex gap-2"><span className="text-emerald-400">✓</span> Frequent feeder bus (Score &gt; 50)</li>
                                </ul>
                                <div className="bg-black/30 p-4 rounded-xl font-mono text-emerald-400 text-sm border border-emerald-500/20">
                                    Score = (Viable Options × 20) + (Best Score × 0.4)
                                </div>
                            </div>

                            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700/50">
                                <h3 className="font-bold text-white mb-4">Real World Examples</h3>
                                <div className="space-y-4 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span>Inner City (Footscray)</span>
                                        <span className="font-bold text-emerald-400">95/100</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mb-2">4 viable options (Train, Tram, Bus, Bike)</div>

                                    <div className="h-px bg-slate-700/50"></div>

                                    <div className="flex justify-between items-center">
                                        <span>Outer Suburb (Mill Park)</span>
                                        <span className="font-bold text-red-400">17/100</span>
                                    </div>
                                    <div className="text-xs text-slate-500">0 viable options (6 stops but all score &lt; 50)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Why These Weights & Scenario */}
                <div className="grid md:grid-cols-2 gap-8">
                    <section className="space-y-4">
                        <h2 className="text-2xl font-bold text-white">❓ Why These Weights?</h2>
                        <div className="space-y-4 text-sm">
                            <div className="p-4 bg-slate-800 rounded-xl border-l-4 border-blue-500">
                                <div className="font-bold text-white mb-1">Frequency (40%)</div>
                                <p>Determines spontaneity. Can you "just go"? Poor frequency makes everything else irrelevant.</p>
                            </div>
                            <div className="p-4 bg-slate-800 rounded-xl border-l-4 border-amber-500">
                                <div className="font-bold text-white mb-1">Coverage (35%)</div>
                                <p>Determines utility. Does it go where you need? Without coverage, high frequency is useless.</p>
                            </div>
                            <div className="p-4 bg-slate-800 rounded-xl border-l-4 border-purple-500">
                                <div className="font-bold text-white mb-1">Reliability (25%)</div>
                                <p>Determines planning. Can you depend on it? Critical for work and daily life.</p>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <h2 className="text-2xl font-bold text-white">💡 Real-World Scenario</h2>
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700">
                            <h3 className="font-bold text-white mb-4">Trip to work at 9am</h3>

                            <div className="space-y-6">
                                <div>
                                    <div className="font-bold text-emerald-400 mb-1">Option A: Inner Melbourne</div>
                                    <ul className="text-sm space-y-1 text-slate-400">
                                        <li>🚰 5 min freq → Just leave when ready</li>
                                        <li>🔧 Direct tram to work</li>
                                        <li>💧 7 days/week</li>
                                        <li className="text-white pt-1">Result: Easy, stress-free commute</li>
                                    </ul>
                                </div>

                                <div className="h-px bg-slate-700"></div>

                                <div>
                                    <div className="font-bold text-red-400 mb-1">Option B: Outer Suburbs</div>
                                    <ul className="text-sm space-y-1 text-slate-400">
                                        <li>🚰 60 min freq → Must leave at 8:17am exactly</li>
                                        <li>🔧 Bus + train + walk</li>
                                        <li>💧 Weekday only, if bus late miss train</li>
                                        <li className="text-white pt-1">Result: High stress, must drive instead</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* FAQ */}
                <section className="space-y-6 pt-8 border-t border-slate-800">
                    <h2 className="text-2xl font-bold text-white">Common Questions</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="font-bold text-white mb-2">Why isn't cost included?</h3>
                            <p className="text-sm text-slate-400">
                                Cost matters only when transport is already viable. If frequency, coverage, and reliability are poor, even free transport is unusable.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-bold text-white mb-2">Why isn't speed included?</h3>
                            <p className="text-sm text-slate-400">
                                Speed is an output of the three keys. Good frequency reduces wait time. Good coverage means direct routes.
                            </p>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
};

export default AboutPage;
