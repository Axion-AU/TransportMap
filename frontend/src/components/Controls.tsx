import { Target, Train } from 'lucide-react';

interface ControlsProps {
    viewMode: 'connectivity' | 'mode';
    setViewMode: (mode: 'connectivity' | 'mode') => void;
}

const Controls = ({ viewMode, setViewMode }: ControlsProps) => {
    return (
        <div className="absolute top-[76px] left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 z-[1000] flex flex-col gap-3 w-[90%] md:w-auto max-w-md md:max-w-none">
            {/* View Mode Switcher */}
            <div className="bg-surface-raised/95 backdrop-blur-md p-1 rounded-[4px] border border-border-strong shadow-2xl flex gap-1 w-full">
                <button
                    onClick={() => setViewMode('connectivity')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-[4px] text-xs font-bold type-overline transition-all flex items-center justify-center gap-2.5 pressable ${
                        viewMode === 'connectivity'
                            ? 'bg-violet text-ink border border-border-strong shadow-lg shadow-violet/20'
                            : 'text-ink-soft hover:text-ink hover:bg-purple-900/60'
                    }`}
                >
                    <Target className="w-4 h-4" />
                    <span>Connectivity</span>
                </button>
                <button
                    onClick={() => setViewMode('mode')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-[4px] text-xs font-bold type-overline transition-all flex items-center justify-center gap-2.5 pressable ${
                        viewMode === 'mode'
                            ? 'bg-violet text-ink border border-border-strong shadow-lg shadow-violet/20'
                            : 'text-ink-soft hover:text-ink hover:bg-purple-900/60'
                    }`}
                >
                    <Train className="w-4 h-4" />
                    <span>Transport Mode</span>
                </button>
            </div>

            {/* Instruction Card */}
            <div className="hidden md:block bg-surface-raised/95 backdrop-blur-md px-4 py-3.5 rounded-[4px] border border-border-subtle shadow-xl max-w-[300px]">
                <div className="text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5 type-overline">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan"></div>
                    Click anywhere on the map
                </div>
                <div className="text-xs text-ink-soft leading-relaxed">
                    Drop a pin to analyze transport access within an 800m walking radius.
                </div>
            </div>
        </div>
    );
};

export default Controls;

