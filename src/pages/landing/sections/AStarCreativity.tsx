// src/pages/landing/sections/AStarCreativity.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/AStarCreativity.css';
import PathfinderCanvas from '../visuals/PathfinderCanvas';
import gsap from 'gsap';
import { Select, Popover } from 'antd';

type SizeKey = 'XXL' | 'XL' | 'L' | 'M' | 'S';
type Mode = 'auto' | 'fixed' | 'custom';

const SIZE_SEQUENCE: { key: SizeKey; label: SizeKey; sizePx: number }[] = [
    { key: 'XXL', label: 'XXL', sizePx: 3 },
    { key: 'XL', label: 'XL', sizePx: 5 },
    { key: 'L', label: 'L', sizePx: 8 },
    { key: 'M', label: 'M', sizePx: 12 },
    { key: 'S', label: 'S', sizePx: 16 },
];

const sizeForKey = (k: SizeKey) => SIZE_SEQUENCE.find(s => s.key === k)!.sizePx;

type Props = {
    /** (Optional) initial height; defaults to 560px. */
    heightPx?: number;
};

const AStarCreativity: React.FC<Props> = ({ heightPx = 560 }) => {
    const sectionRef = useRef<HTMLElement | null>(null);

    // Panels for GSAP swap
    const controlsRowRef = useRef<HTMLDivElement | null>(null);
    const customPanelRef = useRef<HTMLDivElement | null>(null);

    // State
    const [mode, setMode] = useState<Mode>('auto');          // default: auto-rotate sizes
    const [activeSizeKey, setActiveSizeKey] = useState<SizeKey>('XXL');
    const [autoIndex, setAutoIndex] = useState<number>(0);

    // Speed control
    const SPEEDS = [
        { label: '0.5×', value: 0.5 },
        { label: '1×', value: 1 },
        { label: '1.5×', value: 1.5 },
        { label: '2×', value: 2 },
        { label: '5×', value: 5 },
        { label: '10×', value: 10 },
    ];
    const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

    // Remember where we were before custom
    const prevModeRef = useRef<Mode>('auto');
    const prevSizeKeyRef = useRef<SizeKey>('XXL');

    // Signals to canvas
    const [resetCounter, setResetCounter] = useState(0);
    const [customStartCounter, setCustomStartCounter] = useState(0);
    const [customResetCounter, setCustomResetCounter] = useState(0);
    const [hintCounter, setHintCounter] = useState(0);

    // Section height var (GSAP animates this once on mount)
    const sectionStyle = useMemo(
        () => ({ '--astar-height': `${heightPx}px` } as React.CSSProperties),
        [heightPx]
    );

    // Animate height on mount
    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;
        const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
        const vh = Math.max(600, window.innerHeight || 0);
        const minH = Math.max(420, Math.floor(vh * 0.45));
        const maxH = Math.min(920, Math.floor(vh * 0.9));
        const target = Math.floor(minH + Math.random() * (maxH - minH));
        if (prefersReduced) {
            el.style.setProperty('--astar-height', `${target}px`);
            return;
        }
        gsap.to(el, {
            duration: 1.1,
            ease: 'power3.out',
            css: { '--astar-height': `${target}px` },
        });
    }, []);

    // GSAP swapping: controls row <-> custom panel
    useEffect(() => {
        const row = controlsRowRef.current;
        const custom = customPanelRef.current;
        if (!row || !custom) return;

        const tl = gsap.timeline({ defaults: { duration: 0.35 } });

        if (mode === 'custom') {
            tl.to(row, { y: 12, opacity: 0, duration: 0.22, ease: 'power1.in' })
                .set(row, { display: 'none' })
                .set(custom, { display: 'flex', y: -12, opacity: 0 })
                .to(custom, { y: 0, opacity: 1, ease: 'power2.out' });
        } else {
            tl.to(custom, { y: 12, opacity: 0, duration: 0.22, ease: 'power1.in' })
                .set(custom, { display: 'none' })
                .set(row, { display: 'flex', y: -12, opacity: 0 })
                .to(row, { y: 0, opacity: 1, ease: 'power2.out' });
        }
    }, [mode]);

    // Handlers
    const handleChangeSize = (value: string) => {
        const key = value as SizeKey;
        setMode('fixed');
        setActiveSizeKey(key);
        setResetCounter(c => c + 1);
    };

    const handleClickBuildYourOwn = () => {
        prevModeRef.current = mode;
        prevSizeKeyRef.current = activeSizeKey;
        setMode('custom');
        setResetCounter(c => c + 1);
    };

    const handleCustomStart = () => setCustomStartCounter(c => c + 1);
    const handleCustomReset = () => setCustomResetCounter(c => c + 1);
    const handleCustomBack = () => {
        setMode(prevModeRef.current);
        setActiveSizeKey(prevSizeKeyRef.current);
        setResetCounter(c => c + 1);
    };

    // Auto-rotate callback keeps Select selection in sync
    const handleAutoSizeChange = (label: string) => {
        const match = SIZE_SEQUENCE.find(s => s.label === label);
        if (match) {
            setActiveSizeKey(match.key);
            setAutoIndex(i => (i + 1) % SIZE_SEQUENCE.length);
        }
    };

    const handleSpeedChange = (v: number) => {
        setSpeedMultiplier(v);
        setResetCounter(c => c + 1);
    };

    const handlePopoverOpenChange = (open: boolean) => {
        if (open) setHintCounter(h => h + 1);
    };

    // Size dropdown options with popovers on XXL & XL
    const sizeOptions = SIZE_SEQUENCE.map(({ key, label }) => {
        const needsPopover = key === 'XXL' || key === 'XL';
        const labelNode = needsPopover ? (
            <Popover
                placement="right"
                trigger={['hover', 'click']}
                onOpenChange={handlePopoverOpenChange}
                overlayInnerStyle={{ maxWidth: 260 }}
                content={
                    <div className="maze-popover">
                        <div className="legend-row">
                            <span className="legend-box start" /> <span>Start (green)</span>
                        </div>
                        <div className="legend-row">
                            <span className="legend-box end" /> <span>End (red)</span>
                        </div>
                        <div className="legend-note">The canvas highlights their locations briefly.</div>
                    </div>
                }
            >
                <span>{label}</span>
            </Popover>
        ) : (
            <span>{label}</span>
        );
        return { value: key, label: labelNode };
    });

    // Selected value for size Select (reflects current size in auto mode too)
    const sizeValue: string = activeSizeKey;

    return (
        <section
            ref={sectionRef}
            id="a-star-creativity"
            className="astar-section"
            style={sectionStyle}
            aria-labelledby="astar-title"
        >
            {/* Background canvas */}
            <div className="astar-canvas-wrap" aria-hidden>
                <PathfinderCanvas
                    mode={mode}
                    fixedCellSizePx={
                        mode === 'custom'
                            ? sizeForKey(activeSizeKey) // density for custom grid
                            : (mode === 'fixed' ? sizeForKey(activeSizeKey) : undefined)
                    }
                    autoSequence={SIZE_SEQUENCE.map(s => ({ label: s.label, sizePx: s.sizePx }))}
                    initialAutoIndex={autoIndex}
                    onAutoSizeChange={handleAutoSizeChange}
                    resetCounter={resetCounter}
                    customSignals={{ startCounter: customStartCounter, resetCounter: customResetCounter }}
                    speedMultiplier={speedMultiplier}
                    hintCounter={hintCounter}
                />
            </div>

            {/* Foreground copy */}
            <div className="astar-copy">
                <h2 id="astar-title" className="astar-title">
                    Project Building is my Expression for Creativity.
                </h2>
                <p className="astar-subtitle">
                    With coding as my tool and ___ as my canvas, I sift through the maze of requirements, data, and edge cases to turn an idea into a clean, human-centered product.
                </p>

                {/* === Controls row (dropdowns + "build your own") === */}
                <div className="maze-controls-row" ref={controlsRowRef}>
                    <div className="field">
                        <div className="rt-label show">maze</div>
                        <Select
                            className="maze-select"
                            value={sizeValue}
                            options={sizeOptions}
                            onChange={handleChangeSize}
                            popupMatchSelectWidth={false}
                            size="small"
                        />
                    </div>

                    <div className="field">
                        <div className="rt-label show">speed</div>
                        <Select
                            className="maze-select"
                            value={speedMultiplier}
                            options={SPEEDS}
                            onChange={handleSpeedChange}
                            popupMatchSelectWidth={false}
                            size="small"
                        />
                    </div>

                    {/* Wrap the button in a .field so it aligns with dropdowns */}
                    <div className="field field--button">
                        <button
                            className="build-btn"
                            onClick={handleClickBuildYourOwn}
                            aria-pressed={mode === 'custom'}
                        >
                            build your own
                        </button>
                    </div>
                </div>

                {/* Custom-mode panel */}
                <div className="maze-custom-buttons" ref={customPanelRef} style={{ display: 'none' }}>
                    <button className="maze-btn outline" onClick={handleCustomBack}>back</button>
                    <button className="maze-btn" onClick={handleCustomStart}>start</button>
                    <button className="maze-btn danger" onClick={handleCustomReset}>reset</button>
                </div>
            </div>
        </section>
    );
};

export default AStarCreativity;
