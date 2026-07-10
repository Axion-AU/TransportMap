import { useState } from 'react';

interface Node {
    id: string;
    label: string;
    x: number;
    y: number;
    color: string;
    score: number;
}

interface Edge {
    from: string;
    to: string;
    color: string;
    dash?: boolean;
}

const NODES: Node[] = [
    { id: 'cbd', label: 'CITY LOOP', x: 200, y: 200, color: 'var(--color-magenta)', score: 98 },
    { id: 'fcy', label: 'FOOTSCRAY', x: 80, y: 170, color: 'var(--color-violet)', score: 76 },
    { id: 'sth', label: 'SUNBURY', x: 40, y: 100, color: 'var(--color-band-poor)', score: 34 },
    { id: 'clh', label: 'CLIFTON HILL', x: 280, y: 120, color: 'var(--color-cyan)', score: 62 },
    { id: 'bgo', label: 'BELGRAVE', x: 360, y: 280, color: 'var(--color-teal)', score: 48 },
    { id: 'cld', label: 'CAULFIELD', x: 270, y: 270, color: 'var(--color-blue)', score: 81 },
    { id: 'dnd', label: 'DANDENONG', x: 340, y: 350, color: 'var(--color-band-poor)', score: 29 },
    { id: 'fkn', label: 'FRANKSTON', x: 240, y: 370, color: 'var(--color-band-stranded)', score: 18 },
];

const EDGES: Edge[] = [
    { from: 'cbd', to: 'fcy', color: 'var(--color-violet)' },
    { from: 'fcy', to: 'sth', color: 'var(--color-band-poor)', dash: true },
    { from: 'cbd', to: 'clh', color: 'var(--color-cyan)' },
    { from: 'cbd', to: 'cld', color: 'var(--color-blue)' },
    { from: 'cld', to: 'bgo', color: 'var(--color-teal)', dash: true },
    { from: 'cld', to: 'dnd', color: 'var(--color-band-poor)' },
    { from: 'dnd', to: 'fkn', color: 'var(--color-band-stranded)', dash: true },
];

export default function TransitMeshVisual() {
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    return (
        <div className="relative w-full aspect-square max-w-[400px] mx-auto bg-surface-raised/40 border border-border-subtle rounded-[4px] p-4 overflow-hidden group">
            {/* Background scanner line effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-magenta/5 to-transparent h-1/2 w-full animate-[pulse_3s_infinite] pointer-events-none" />

            <svg viewBox="0 0 400 400" className="w-full h-full select-none">
                <defs>
                    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--color-magenta)" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="var(--color-magenta)" stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Ambient glow in center */}
                <circle cx="200" cy="200" r="160" fill="url(#glow)" />

                {/* Connection lines */}
                {EDGES.map((edge, idx) => {
                    const fromNode = NODES.find(n => n.id === edge.from);
                    const toNode = NODES.find(n => n.id === edge.to);
                    if (!fromNode || !toNode) return null;

                    const isHighlighted = hoveredNode === edge.from || hoveredNode === edge.to;

                    return (
                        <g key={idx}>
                            {/* Outer shadow glow line when highlighted */}
                            {isHighlighted && (
                                <line
                                    x1={fromNode.x}
                                    y1={fromNode.y}
                                    x2={toNode.x}
                                    y2={toNode.y}
                                    stroke={edge.color}
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                    opacity="0.3"
                                    className="transition-all duration-300"
                                />
                            )}
                            <line
                                x1={fromNode.x}
                                y1={fromNode.y}
                                x2={toNode.x}
                                y2={toNode.y}
                                stroke={edge.color}
                                strokeWidth={isHighlighted ? '2.5' : '1.5'}
                                strokeDasharray={edge.dash ? '4 4' : undefined}
                                strokeLinecap="round"
                                opacity={hoveredNode ? (isHighlighted ? '1' : '0.2') : '0.65'}
                                className="transition-all duration-300"
                            />
                        </g>
                    );
                })}

                {/* Nodes */}
                {NODES.map(node => {
                    const isHovered = hoveredNode === node.id;
                    const isAnyHovered = hoveredNode !== null;

                    return (
                        <g
                            key={node.id}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                        >
                            {/* Hover trigger zone */}
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r="16"
                                fill="transparent"
                            />
                            {/* Outer halo */}
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={isHovered ? '9' : '5'}
                                fill="none"
                                stroke={node.color}
                                strokeWidth="1.5"
                                opacity={isAnyHovered ? (isHovered ? '1' : '0.15') : '0.5'}
                                className="transition-all duration-300"
                            />
                            {/* Core center dot */}
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r="3"
                                fill={node.color}
                                opacity={isAnyHovered ? (isHovered ? '1' : '0.3') : '0.9'}
                                className="transition-all duration-300"
                            />
                            {/* Node labels (mono) */}
                            <text
                                x={node.x}
                                y={node.y - 12}
                                textAnchor="middle"
                                fill="var(--color-ink)"
                                fontSize="9"
                                letterSpacing="0.05em"
                                className="type-data transition-all duration-300 font-bold"
                                opacity={isAnyHovered ? (isHovered ? '1' : '0.2') : '0.65'}
                            >
                                {node.label}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Score HUD indicator */}
            <div className="absolute bottom-3 left-3 right-3 bg-surface-raised border border-border-strong px-3 py-2 flex items-center justify-between transition-all duration-300">
                <span className="type-overline text-ink-soft">
                    {hoveredNode ? NODES.find(n => n.id === hoveredNode)?.label : 'NETWORK CONNECTIVITY'}
                </span>
                <span className="type-data text-magenta text-sm">
                    {hoveredNode ? `${NODES.find(n => n.id === hoveredNode)?.score}/100` : 'TIMETABLE METRICS'}
                </span>
            </div>
        </div>
    );
}
