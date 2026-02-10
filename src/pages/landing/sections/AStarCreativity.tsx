// src/pages/landing/sections/AStarCreativity.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/AStarCreativity.css';
import PathfinderCanvas, { CustomStep } from '../visuals/PathfinderCanvas';
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
    heightPx?: number;
};

const AStarCreativity: React.FC<Props> = ({ heightPx = 560 }) => {
    const sectionRef = useRef<HTMLElement | null>(null);

    // Panel refs for GSAP transitions
    const defaultPanelRef = useRef<HTMLDivElement | null>(null);
    const interactivePanelRef = useRef<HTMLDivElement | null>(null);
    const controlsRowRef = useRef<HTMLDivElement | null>(null);
    const customPanelRef = useRef<HTMLDivElement | null>(null);
    const instructionsRef = useRef<HTMLDivElement | null>(null);
    const instructionsContentRef = useRef<HTMLDivElement | null>(null);
    const contentInnerRef = useRef<HTMLDivElement | null>(null);
    const prevCustomStepRef = useRef<CustomStep>('idle');

    // State
    const [isInteractive, setIsInteractive] = useState<boolean>(false);
    const [mode, setMode] = useState<Mode>('fixed');
    const [activeSizeKey, setActiveSizeKey] = useState<SizeKey>('M');
    const [autoIndex, setAutoIndex] = useState<number>(0);
    const [customStep, setCustomStep] = useState<CustomStep>('idle');

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
    const prevModeRef = useRef<Mode>('fixed');
    const prevSizeKeyRef = useRef<SizeKey>('M');

    // Signals to canvas
    const [resetCounter, setResetCounter] = useState(0);
    const [customStartCounter, setCustomStartCounter] = useState(0);
    const [customResetCounter, setCustomResetCounter] = useState(0);
    const [hintCounter, setHintCounter] = useState(0);

    // Track if we're currently animating to prevent conflicts
    const isAnimatingRef = useRef(false);

    // Animate instruction content changes
    useEffect(() => {
        const instructionsContent = instructionsContentRef.current;
        const contentInner = contentInnerRef.current;
        const instructions = instructionsRef.current;

        if (!instructionsContent || !contentInner || !instructions || mode !== 'custom') {
            prevCustomStepRef.current = customStep;
            return;
        }

        // Skip animation on first render or same step
        if (prevCustomStepRef.current === customStep) {
            return;
        }

        const prevStep = prevCustomStepRef.current;
        prevCustomStepRef.current = customStep;

        // Skip if coming from idle (initial enter handled by mode change effect)
        if (prevStep === 'idle') {
            return;
        }

        // Get current height before content change
        const currentHeight = instructionsContent.offsetHeight;

        // Lock the current height
        gsap.set(instructionsContent, { height: currentHeight });

        // Fade out inner content only
        gsap.to(contentInner, {
            opacity: 0,
            duration: 0.15,
            ease: 'power2.in',
            onComplete: () => {
                // After React updates content, measure new height
                requestAnimationFrame(() => {
                    // Temporarily set height to auto to measure
                    gsap.set(instructionsContent, { height: 'auto' });
                    const newHeight = instructionsContent.offsetHeight;
                    // Set back to current height for animation
                    gsap.set(instructionsContent, { height: currentHeight });

                    // Animate height change
                    gsap.to(instructionsContent, {
                        height: newHeight,
                        duration: 0.25,
                        ease: 'power2.out',
                        onComplete: () => {
                            // Clear inline height after animation
                            gsap.set(instructionsContent, { height: 'auto' });
                        }
                    });

                    // Fade in inner content
                    gsap.to(contentInner, {
                        opacity: 1,
                        duration: 0.2,
                        ease: 'power2.out',
                        delay: 0.1
                    });
                });
            }
        });

    }, [customStep, mode]);

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

    // GSAP transitions for interactive mode toggle (default <-> interactive)
    useEffect(() => {
        const defaultPanel = defaultPanelRef.current;
        const interactivePanel = interactivePanelRef.current;
        const controls = controlsRowRef.current;
        const custom = customPanelRef.current;

        if (!defaultPanel || !interactivePanel || !controls || !custom) return;
        if (isAnimatingRef.current) return;

        isAnimatingRef.current = true;

        const tl = gsap.timeline({
            defaults: { duration: 0.35 },
            onComplete: () => { isAnimatingRef.current = false; }
        });

        if (isInteractive) {
            tl.to(defaultPanel, {
                y: 20,
                opacity: 0,
                scale: 0.95,
                duration: 0.3,
                ease: 'power2.in'
            })
                .set(defaultPanel, { display: 'none' })
                .set(interactivePanel, { display: 'block' })
                .set(controls, { display: 'flex', y: -15, opacity: 0 })
                .to(controls, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
        } else {
            const activePanel = mode === 'custom' ? custom : controls;

            tl.to(activePanel, { y: 15, opacity: 0, duration: 0.25, ease: 'power2.in' })
                .set(controls, { display: 'none' })
                .set(custom, { display: 'none' })
                .set(interactivePanel, { display: 'none' })
                .set(defaultPanel, { display: 'block', y: -20, opacity: 0, scale: 0.95 })
                .to(defaultPanel, { y: 0, opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
        }
    }, [isInteractive]);

    // GSAP swapping between controls row and custom panel (only when interactive)
    useEffect(() => {
        if (!isInteractive) return;

        const controls = controlsRowRef.current;
        const custom = customPanelRef.current;
        const instructions = instructionsRef.current;
        if (!controls || !custom) return;

        const tl = gsap.timeline({ defaults: { duration: 0.35 } });

        if (mode === 'custom') {
            tl.to(controls, { y: 15, opacity: 0, duration: 0.25, ease: 'power2.in' })
                .set(controls, { display: 'none' })
                .set(custom, { display: 'flex', y: -15, opacity: 0 })
                .to(custom, { y: 0, opacity: 1, ease: 'power2.out' });

            // Show instructions with animation
            if (instructions) {
                tl.set(instructions, { display: 'block', opacity: 0, x: 0, scale: 1 }, '<')
                    .to(instructions, { opacity: 1, duration: 0.4, ease: 'power2.out' }, '<0.2');
            }
        } else {
            // Hide instructions
            if (instructions) {
                tl.to(instructions, { opacity: 0, duration: 0.2, ease: 'power2.in' })
                    .set(instructions, { display: 'none' });
            }

            tl.to(custom, { y: 15, opacity: 0, duration: 0.25, ease: 'power2.in' }, '<')
                .set(custom, { display: 'none' })
                .set(controls, { display: 'flex', y: -15, opacity: 0 })
                .to(controls, { y: 0, opacity: 1, ease: 'power2.out' });
        }
    }, [mode, isInteractive]);



    // Handlers
    const handleClickToPlay = () => {
        setIsInteractive(true);
    };

    const handleBackToDefault = () => {
        setMode('fixed');
        setActiveSizeKey('M');
        setSpeedMultiplier(1);
        setIsInteractive(false);
        setResetCounter(c => c + 1);
    };

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
    const handleCustomReset = () => {
        setCustomResetCounter(c => c + 1);
    };
    const handleCustomBack = () => {
        setMode(prevModeRef.current);
        setActiveSizeKey(prevSizeKeyRef.current);
        setResetCounter(c => c + 1);
    };

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

    const handleCustomStepChange = (step: CustomStep) => {
        setCustomStep(step);
    };

    // Get current instruction text based on step
    const getInstructionContent = () => {
        switch (customStep) {
            case 'place-start':
                return {
                    title: 'Build Your Own Maze',
                    subtitle: 'Create a custom puzzle for the A* pathfinding algorithm',
                    steps: [
                        { num: 1, text: 'Click to place the start point', active: true, icon: '🟢' },
                        { num: 2, text: 'Click to place the end point', active: false, icon: '🔴' },
                        { num: 3, text: 'Click & drag to draw walls', active: false, icon: '⬜' },
                        { num: 4, text: 'Press Start when ready', active: false, icon: '▶️' },
                    ]
                };
            case 'place-end':
                return {
                    title: 'Place End Point',
                    subtitle: 'Click anywhere to set the destination',
                    steps: [
                        { num: 1, text: 'Start point placed', active: false, done: true, icon: '✓' },
                        { num: 2, text: 'Click to place the end point', active: true, icon: '🔴' },
                        { num: 3, text: 'Click & drag to draw walls', active: false, icon: '⬜' },
                        { num: 4, text: 'Press Start when ready', active: false, icon: '▶️' },
                    ]
                };
            case 'draw-walls':
                return {
                    title: 'Draw Walls',
                    subtitle: 'Click & drag to create obstacles',
                    steps: [
                        { num: 1, text: 'Start point placed', active: false, done: true, icon: '✓' },
                        { num: 2, text: 'End point placed', active: false, done: true, icon: '✓' },
                        { num: 3, text: 'Click & drag to draw walls', active: true, icon: '⬜' },
                        { num: 4, text: 'Press Start when ready', active: true, icon: '▶️' },
                    ]
                };
            case 'running':
                return {
                    title: 'Finding Path...',
                    subtitle: 'A* algorithm is searching',
                    steps: []
                };
            case 'complete':
                return {
                    title: 'Path Found!',
                    subtitle: 'Press Reset to try again',
                    steps: []
                };
            default:
                return {
                    title: 'Build Your Own Maze',
                    subtitle: 'Create a custom puzzle',
                    steps: []
                };
        }
    };

    const instruction = getInstructionContent();

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

    const sizeValue: string = activeSizeKey;

    // Check if start button should be enabled
    const canStart = customStep === 'draw-walls';

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
                            ? sizeForKey(activeSizeKey)
                            : (mode === 'fixed' ? sizeForKey(activeSizeKey) : undefined)
                    }
                    autoSequence={SIZE_SEQUENCE.map(s => ({ label: s.label, sizePx: s.sizePx }))}
                    initialAutoIndex={autoIndex}
                    onAutoSizeChange={handleAutoSizeChange}
                    resetCounter={resetCounter}
                    customSignals={{ startCounter: customStartCounter, resetCounter: customResetCounter }}
                    speedMultiplier={speedMultiplier}
                    hintCounter={hintCounter}
                    onCustomStepChange={handleCustomStepChange}
                />
            </div>

            {/* Foreground content */}
            <div className="astar-copy">
                {/* === DEFAULT PANEL: Title, subtitle, play button === */}
                <div className="astar-default-panel" ref={defaultPanelRef}>
                    <h2 id="astar-title" className="astar-title">
                        Project Building is my Expression for Creativity.
                    </h2>
                    <p className="astar-subtitle">
                        With coding as my tool and ___ as my canvas, I sift through the maze of requirements, data, and edge cases to turn an idea into a clean, human-centered product.
                    </p>
                    <div className="play-button-wrap">
                        <button
                            className="play-maze-btn"
                            onClick={handleClickToPlay}
                        >
                            click to play with the maze
                        </button>
                    </div>
                </div>

                {/* === INTERACTIVE PANEL: Controls at top === */}
                <div className="astar-interactive-panel" ref={interactivePanelRef} style={{ display: 'none' }}>
                    {/* Controls row with back button */}
                    <div className="maze-controls-row" ref={controlsRowRef} style={{ display: 'none' }}>
                        <div className="controls-container">
                            <button
                                className="back-btn"
                                onClick={handleBackToDefault}
                                aria-label="Back to default view"
                            >
                                ← back
                            </button>

                            <div className="controls-divider" />

                            <div className="controls-group">
                                <div className="field">
                                    <div className="rt-label show">maze</div>
                                    <Select
                                        className="maze-select"
                                        value={sizeValue}
                                        options={sizeOptions}
                                        onChange={handleChangeSize}
                                        popupMatchSelectWidth={false}
                                        size="middle"
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
                                        size="middle"
                                    />
                                </div>

                                <button
                                    className="play-maze-btn build-own-btn"
                                    onClick={handleClickBuildYourOwn}
                                    aria-pressed={mode === 'custom'}
                                >
                                    build your own
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Custom-mode panel */}
                    <div className="maze-custom-buttons" ref={customPanelRef} style={{ display: 'none' }}>
                        <div className="controls-container">
                            <button
                                className="back-btn"
                                onClick={handleCustomBack}
                                aria-label="Back to controls"
                            >
                                ← back
                            </button>

                            <div className="controls-divider" />

                            <div className="controls-group">
                                <button
                                    className={`maze-btn ${!canStart ? 'disabled' : ''}`}
                                    onClick={handleCustomStart}
                                    disabled={!canStart}
                                >
                                    start
                                </button>
                                <button className="maze-btn danger" onClick={handleCustomReset}>reset</button>
                            </div>
                        </div>
                    </div>

                    {/* Instructions overlay for custom mode */}
                    <div
                        className="custom-instructions"
                        ref={instructionsRef}
                        style={{ display: 'none' }}
                    >
                        <div className="instructions-content" ref={instructionsContentRef}>
                            <div className="instructions-inner" ref={contentInnerRef}>
                                <h3 className="instructions-title">{instruction.title}</h3>
                                <p className="instructions-subtitle">{instruction.subtitle}</p>

                                {instruction.steps.length > 0 && (
                                    <ul className="instructions-steps">
                                        {instruction.steps.map((step) => (
                                            <li
                                                key={step.num}
                                                className={`step ${step.active ? 'active' : ''} ${step.done ? 'done' : ''}`}
                                            >
                                                <span className="step-icon">{step.icon}</span>
                                                <span className="step-text">{step.text}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AStarCreativity;