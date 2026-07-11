import { useState, useRef, useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent, TouchEvent as ReactTouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { ZoomIn, ZoomOut, RefreshCw, Download, X, Maximize2 } from 'lucide-react';
import trainMapPng from '../assets/victorian-train-network-map.png';
import trainMapPdf from '../assets/victorian-train-network-map.pdf';

export default function TrainMapVisual() {
    const [isOpen, setIsOpen] = useState(false);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    // Prevent body scrolling when the lightbox is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const handleOpen = () => {
        setIsOpen(true);
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    // Zoom Controls
    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    // Mouse Panning
    const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Touch Panning for mobile support
    const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            setIsDragging(true);
            setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
        }
    };

    const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
        if (!isDragging || e.touches.length !== 1) return;
        const touch = e.touches[0];
        setPosition({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y
        });
    };

    // Wheel Zooming
    const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const zoomFactor = 0.1;
        const direction = e.deltaY < 0 ? 1 : -1;
        setScale(prev => {
            const nextScale = prev + direction * zoomFactor;
            return Math.min(Math.max(nextScale, 0.5), 4);
        });
    };

    return (
        <>
            {/* Landing Page Preview Card */}
            <div
                onClick={handleOpen}
                className="relative w-full aspect-square max-w-[400px] mx-auto bg-surface-raised/45 border border-border-subtle rounded-[4px] overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl hover:border-magenta/50 transition-all duration-300"
            >
                {/* Background Grid Pattern & Map Preview */}
                <div className="absolute inset-0 bg-slate-950 flex items-center justify-center p-2">
                    <img
                        src={trainMapPng}
                        alt="Victorian Train Network Preview"
                        className="w-full h-full object-cover opacity-75 group-hover:opacity-90 group-hover:scale-105 transition-all duration-500 rounded-[2px]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />
                </div>

                {/* Info Overlay */}
                <div className="absolute bottom-3 left-3 right-3 bg-slate-900/90 backdrop-blur-sm border border-border-strong px-3 py-2.5 flex items-center justify-between transition-all duration-300 group-hover:bg-slate-900">
                    <div className="flex flex-col">
                        <span className="type-overline text-magenta font-semibold tracking-wider">OFFICIAL MAP</span>
                        <span className="text-xs text-ink-soft">Victorian Train Network</span>
                    </div>
                    <div className="flex items-center gap-1 bg-magenta hover:bg-magenta-hover text-white text-[11px] font-bold px-2 py-1 rounded-[3px] transition-colors">
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>VIEW MAP</span>
                    </div>
                </div>
            </div>

            {/* Lightbox Modal rendered via Portal */}
            {isOpen && createPortal(
                <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col" onKeyDown={(e) => e.key === 'Escape' && handleClose()} tabIndex={0}>
                    {/* Header Controls */}
                    <header className="flex items-center justify-between px-6 h-16 border-b border-border-subtle bg-slate-900/80 backdrop-blur-md shrink-0">
                        <div>
                            <h2 className="type-display text-lg md:text-xl text-ink">Victorian Train Network Map</h2>
                            <p className="text-xs text-ink-faint hidden sm:block">Scroll to zoom, drag to pan the high-resolution map</p>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Zoom controls */}
                            <div className="flex items-center bg-slate-800/80 border border-border-strong rounded-[4px] p-0.5">
                                <button
                                    onClick={handleZoomOut}
                                    className="p-1.5 hover:bg-slate-700/80 text-ink-soft hover:text-ink rounded-[3px] transition-all"
                                    title="Zoom Out"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <span className="px-2 text-xs font-mono text-ink-soft min-w-[3.5rem] text-center">
                                    {Math.round(scale * 100)}%
                                </span>
                                <button
                                    onClick={handleZoomIn}
                                    className="p-1.5 hover:bg-slate-700/80 text-ink-soft hover:text-ink rounded-[3px] transition-all"
                                    title="Zoom In"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <div className="w-px h-4 bg-border-subtle mx-1" />
                                <button
                                    onClick={handleReset}
                                    className="p-1.5 hover:bg-slate-700/80 text-ink-soft hover:text-ink rounded-[3px] transition-all"
                                    title="Reset view"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Download PDF */}
                            <a
                                href={trainMapPdf}
                                download="victorian-train-network-map.pdf"
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 bg-magenta hover:bg-magenta/90 text-white text-xs font-semibold rounded-[4px] transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                <span className="hidden md:inline">Download PDF</span>
                            </a>

                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-slate-800 text-ink-soft hover:text-ink rounded-[4px] transition-colors"
                                aria-label="Close lightbox"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </header>

                    {/* Map Workspace */}
                    <div
                        ref={containerRef}
                        className={`flex-1 overflow-hidden relative cursor-grab flex items-center justify-center ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleMouseUp}
                        onWheel={handleWheel}
                    >
                        <div
                            style={{
                                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                transformOrigin: 'center center',
                                transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                            }}
                            className="w-full h-full flex items-center justify-center select-none"
                        >
                            <img
                                ref={imageRef}
                                src={trainMapPng}
                                alt="Victorian Train Network Map"
                                className="pointer-events-none object-contain shadow-2xl rounded-[4px] border border-border-strong max-w-[95%] max-h-[90%]"
                                onLoad={handleReset}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
