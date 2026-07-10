import { Target, Train } from 'lucide-react';

interface ControlsProps {
    viewMode: 'connectivity' | 'mode';
    setViewMode: (mode: 'connectivity' | 'mode') => void;
}

const Controls = ({ viewMode, setViewMode }: ControlsProps) => {
    return (
        <div className="absolute top-20 left-6 z-[1000] flex flex-col gap-3">
            {/* View Mode Switcher */}
            <div className="bg-surface-raised/95 backdrop-blur-md p-1 rounded-[4px] border border-border-strong shadow-2xl flex gap-1">
                <button
                    onClick={() => setViewMode('connectivity')}
                    className={`px-4 py-2 rounded-[4px] text-xs font-bold type-overline transition-all flex items-center gap-2.5 pressable ${
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
                    className={`px-4 py-2 rounded-[4px] text-xs font-bold type-overline transition-all flex items-center gap-2.5 pressable ${
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
            <div className="bg-surface-raised/95 backdrop-blur-md px-4 py-3.5 rounded-[4px] border border-border-subtle shadow-xl max-w-[300px]">
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

