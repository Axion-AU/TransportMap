import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { BAND_COLORS, BAND_LABELS } from '../lib/scoring';

interface LegendProps {
    viewMode: 'connectivity' | 'mode';
    onInfoClick: () => void;
}

const transportModes = [
    { id: 1, name: 'Regional Train', color: '#8e44ad', icon: '/transport_pictograms/PICTO_MODE_RegionalTrain.svg' },
    { id: 2, name: 'Metro Train', color: '#2980b9', icon: '/transport_pictograms/PICTO_MODE_Train.svg' },
    { id: 3, name: 'Metro Tram', color: '#27ae60', icon: '/transport_pictograms/PICTO_MODE_Tram.svg' },
    { id: 4, name: 'Metro Bus', color: '#e67e22', icon: '/transport_pictograms/PICTO_MODE_Bus.svg' },
    { id: 5, name: 'Regional Coach', color: '#e67e22', icon: '/transport_pictograms/PICTO_MODE_Coach.svg' },
    { id: 6, name: 'Regional Bus', color: '#e67e22', icon: '/transport_pictograms/PICTO_MODE_Bus.svg' },
    { id: 11, name: 'SkyBus', color: '#e74c3c', icon: '/transport_pictograms/PICTO_MODE_SkyBus.svg' },
];

const Legend = ({ viewMode, onInfoClick }: LegendProps) => {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 768; // collapsed by default on mobile
        }
        return false;
    });

    return (
        <div className="absolute bottom-6 right-6 bg-surface-raised/95 backdrop-blur-md p-4 rounded-[4px] border border-border-strong shadow-2xl z-[5000] min-w-[200px] md:min-w-[260px] max-w-[calc(100vw-48px)] transition-all">
            {/* Header */}
            <div className={`flex items-center justify-between ${isCollapsed ? '' : 'mb-4 pb-3 border-b border-border-subtle'}`}>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="flex items-center gap-2 text-left font-semibold text-sm text-ink type-display tracking-wider uppercase focus:outline-none pressable"
                >
                    <span>{viewMode === 'connectivity' ? 'Score Legend' : 'Transport Modes'}</span>
                    {isCollapsed ? <ChevronUp className="w-4.5 h-4.5 text-ink-soft" /> : <ChevronDown className="w-4.5 h-4.5 text-ink-soft" />}
                </button>
                {!isCollapsed && (
                    <button
                        onClick={onInfoClick}
                        className="p-1.5 rounded-[4px] text-ink-soft hover:text-cyan hover:bg-purple-900/60 transition-all"
                        title="Learn more"
                    >
                        <Info className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Content */}
            {!isCollapsed && (
                <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                    {viewMode === 'connectivity' ? (
                        <>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: BAND_COLORS.good }}></div>
                                    <span className="text-xs font-semibold text-ink type-overline">{BAND_LABELS.good}</span>
                                </div>
                                <span className="text-xs text-ink-soft font-medium type-data">≥ 85</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: BAND_COLORS.decent }}></div>
                                    <span className="text-xs font-semibold text-ink type-overline">{BAND_LABELS.decent}</span>
                                </div>
                                <span className="text-xs text-ink-soft font-medium type-data">70 - 85</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: BAND_COLORS.patchy }}></div>
                                    <span className="text-xs font-semibold text-ink type-overline">{BAND_LABELS.patchy}</span>
                                </div>
                                <span className="text-xs text-ink-soft font-medium type-data">50 - 70</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: BAND_COLORS.poor }}></div>
                                    <span className="text-xs font-semibold text-ink type-overline">{BAND_LABELS.poor}</span>
                                </div>
                                <span className="text-xs text-ink-soft font-medium type-data">30 - 50</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-4 h-4 rounded-sm shadow-sm" style={{ backgroundColor: BAND_COLORS.stranded }}></div>
                                    <span className="text-xs font-semibold text-ink type-overline">{BAND_LABELS.stranded}</span>
                                </div>
                                <span className="text-xs text-ink-soft font-medium type-data">{'<'} 30</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {transportModes.map((mode) => (
                                <div key={mode.id} className="flex items-center gap-3">
                                    <div
                                        className="w-7 h-7 rounded-sm flex items-center justify-center shadow-sm border border-border-strong"
                                        style={{ backgroundColor: mode.color }}
                                    >
                                        <img
                                            src={mode.icon}
                                            alt={mode.name}
                                            className="w-4 h-4 filter invert"
                                        />
                                    </div>
                                    <span className="text-xs font-semibold text-ink type-overline">{mode.name}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default Legend;

