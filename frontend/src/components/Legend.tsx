import { Info } from 'lucide-react';

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
    return (
        <div className="absolute bottom-6 right-6 bg-white/98 backdrop-blur-xl p-4 rounded-2xl border border-gray-200/80 shadow-2xl z-[5000] min-w-[260px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <h3 className="font-semibold text-sm text-gray-900">
                    {viewMode === 'connectivity' ? 'Score Legend' : 'Transport Modes'}
                </h3>
                <button
                    onClick={onInfoClick}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                    title="Learn more"
                >
                    <Info className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className="space-y-3">
                {viewMode === 'connectivity' ? (
                    <>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-green-400 to-green-600 shadow-sm"></div>
                                <span className="text-sm text-gray-700 font-medium">Excellent</span>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{'>'}  85</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-500 shadow-sm"></div>
                                <span className="text-sm text-gray-700 font-medium">Good</span>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">70 - 85</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 shadow-sm"></div>
                                <span className="text-sm text-gray-700 font-medium">Fair</span>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">40 - 70</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-red-400 to-red-600 shadow-sm"></div>
                                <span className="text-sm text-gray-700 font-medium">Poor</span>
                            </div>
                            <span className="text-xs text-gray-500 font-medium">{'<'} 40</span>
                        </div>
                    </>
                ) : (
                    <>
                        {transportModes.map((mode) => (
                            <div key={mode.id} className="flex items-center gap-3">
                                <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
                                    style={{ backgroundColor: mode.color }}
                                >
                                    <img
                                        src={mode.icon}
                                        alt={mode.name}
                                        className="w-5 h-5"
                                    />
                                </div>
                                <span className="text-sm text-gray-700">{mode.name}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default Legend;
