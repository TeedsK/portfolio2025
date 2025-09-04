import React, { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './_CodeWindow.css';
import './HoloDataset.css';
import HoloDataset, { Phase } from './HoloDataset';

type LineKind = 'cmd' | 'subcmd';

type Step =
    | { kind: 'cmd'; text: string; topLevel?: boolean; delayAfterMs?: number }
    | { kind: 'subcmd'; text: string; delayAfterMs?: number }
    | { kind: 'phase'; to: Phase; delayAfterMs?: number };

type RenderLine = {
    id: string;
    kind: LineKind;
    text: string;
    block: number;       // groups: 1 command (+ its subcmds)
    dim: boolean;        // faded style for previous blocks
    vanishing?: boolean; // style flag while being removed
    isTyping?: boolean;  // caret + green highlight for current typing
};

const MAX_VISIBLE = 4;            // keep terminal to 4 logical lines
const COMMAND_CPS = 32;           // characters per second when typing commands
const SCROLL_COLLAPSE_MS = 320;   // translate “virtual scroll” duration

const HoloCleanCode: React.FC<{ play: boolean }> = ({ play }) => {
    // ---------- Script ----------
    const STEPS: Step[] = useMemo(() => {
        return [
            { kind: 'cmd', text: '(.venv) $ python ingest.py', topLevel: true, delayAfterMs: 200 },
            { kind: 'phase', to: 'ingested', delayAfterMs: 520 },

            { kind: 'cmd', text: '(.venv) $ python run_detectors.py', topLevel: true, delayAfterMs: 200 },
            { kind: 'phase', to: 'detected', delayAfterMs: 520 },

            { kind: 'cmd', text: '(.venv) $ python run_pruning.py', topLevel: true, delayAfterMs: 200 },
            { kind: 'phase', to: 'pruned', delayAfterMs: 560 },

            { kind: 'cmd', text: '(.venv) $ python run_compiler.py', topLevel: true, delayAfterMs: 200 },
            { kind: 'phase', to: 'compiled', delayAfterMs: 520 },

            {
                kind: 'cmd',
                text:
                    '(.venv) $ python run_inference.py --mode train_predict --learniter 25 --save_model_path trained_model_100.pth --save_builder_path builder_state_100.pkl --pred_output_file marginals_100_rows.pkl --lr 0.005',
                topLevel: true,
                delayAfterMs: 200,
            },
            { kind: 'phase', to: 'inferred', delayAfterMs: 900 },

            {
                kind: 'cmd',
                text:
                    '(.venv) $ python evaluate.py --pred_file marginals_100_rows.pkl --truth_file hospital_100_clean.csv',
                topLevel: true,
                delayAfterMs: 420
            },
            { kind: 'phase', to: 'evaluated', delayAfterMs: 700 },
        ];
    }, []);

    // ---------- Terminal state ----------
    const [lines, setLines] = useState<RenderLine[]>([]);
    const linesRef = useRef<RenderLine[]>([]);
    useEffect(() => { linesRef.current = lines; }, [lines]);

    // DOM refs
    const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // per-line wrapper
    const bodyRef = useRef<HTMLDivElement>(null);                    // viewport (fixed height)
    const listRef = useRef<HTMLDivElement>(null);                    // inner list we translate

    const playTokenRef = useRef(0);
    const timeouts = useRef<number[]>([]);
    const trimmingRef = useRef(false); // prevent concurrent trims

    // ---------- Dataset phase ----------
    const [phase, setPhase] = useState<Phase>('idle');

    // Helpers
    const clearTimers = () => {
        timeouts.current.forEach((id) => clearTimeout(id));
        timeouts.current = [];
    };
    const wait = (ms: number) =>
        new Promise<void>((resolve) => {
            const id = window.setTimeout(resolve, ms);
            timeouts.current.push(id);
        });

    const dimPreviousBlocks = () => {
        setLines((prev) => prev.map((l) => ({ ...l, dim: true })));
    };

    const pushLine = (line: Omit<RenderLine, 'id'>) => {
        const id = `ln-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const entry: RenderLine = { id, ...line };
        setLines((prev) => [...prev, entry]);

        // After paint, enforce capacity (by COUNT only)
        requestAnimationFrame(() => {
            trimIfNeeded();
        });
        return id;
    };

    const updateLine = (id: string, patch: Partial<RenderLine>) => {
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    };

    /**
     * “Virtual scroll” removal:
     *  - Measure the oldest line’s height H.
     *  - Animate: fade oldest line’s opacity to 0, and translate the entire list up by -H (composited transform).
     *  - On complete: remove the oldest line and reset list translate to 0.
     *  This avoids any container height mutation (no layout thrash).
     */
    const collapseOldest = () => {
        if (trimmingRef.current) return false;
        const visible = linesRef.current.filter((l) => !l.vanishing);
        if (visible.length <= MAX_VISIBLE) return false;
        const oldest = visible[0];
        const el = lineRefs.current.get(oldest.id);
        const listEl = listRef.current;
        if (!el || !listEl) {
            // Fallback: remove immediately
            setLines((prev) => prev.filter((l) => l.id !== oldest.id));
            return true;
        }

        trimmingRef.current = true;
        setLines((prev) => prev.map((l) => (l.id === oldest.id ? { ...l, vanishing: true } : l)));

        // Measure height (including wraps)
        const H = el.getBoundingClientRect().height;

        // Stabilize initial state
        gsap.set(listEl, { y: 0, force3D: true });

        // Build timeline (pure transform + opacity)
        const tl = gsap.timeline({
            defaults: { ease: 'power2.inOut', duration: SCROLL_COLLAPSE_MS / 1000 },
            onComplete: () => {
                // Remove oldest
                setLines((prev) => prev.filter((l) => l.id !== oldest.id));
                // Reset transforms
                gsap.set(listEl, { y: 0, force3D: true });
                trimmingRef.current = false;

                // If somehow we still have > MAX_VISIBLE, chain another trim
                requestAnimationFrame(() => trimIfNeeded());
            }
        });

        tl.to(el, { opacity: 0 }, 0);
        tl.to(listEl, { y: -H, force3D: true }, 0);

        return true;
    };

    // Logical cap: > MAX_VISIBLE lines (count-only)
    const trimIfNeeded = () => {
        const visible = linesRef.current.filter((l) => !l.vanishing);
        if (visible.length > MAX_VISIBLE) collapseOldest();
    };

    const runSteps = async () => {
        const myToken = ++playTokenRef.current;

        // Reset state
        setLines([]);
        setPhase('idle');
        await wait(50);

        let currentBlock = 0;

        for (let i = 0; i < STEPS.length; i++) {
            if (playTokenRef.current !== myToken) return; // cancelled
            const step = STEPS[i];

            if (step.kind === 'cmd') {
                // New top-level command → dim previous blocks and advance block index
                if (step.topLevel !== false) {
                    dimPreviousBlocks();
                    currentBlock += 1;
                }
                const lineId = pushLine({
                    kind: 'cmd',
                    text: '',
                    block: currentBlock,
                    dim: false,
                    isTyping: true,   // mark active (green)
                });

                // Type out the command
                const full = `${step.text}`;
                for (let c = 0; c <= full.length; c++) {
                    if (playTokenRef.current !== myToken) return;
                    updateLine(lineId, { text: full.slice(0, c) });
                    await wait(1000 / COMMAND_CPS);
                }
                updateLine(lineId, { isTyping: false }); // turn off active highlight

                await wait(step.delayAfterMs ?? 140);
            }

            if (step.kind === 'subcmd') {
                const lineId = pushLine({
                    kind: 'subcmd',
                    text: '',
                    block: currentBlock,
                    dim: false,
                    isTyping: true, // active
                });

                const full = step.text;
                for (let c = 0; c <= full.length; c++) {
                    if (playTokenRef.current !== myToken) return;
                    updateLine(lineId, { text: full.slice(0, c) });
                    await wait(1000 / COMMAND_CPS);
                }
                updateLine(lineId, { isTyping: false });

                await wait(step.delayAfterMs ?? 120);
            }

            if (step.kind === 'phase') {
                setPhase(step.to);
                await wait(step.delayAfterMs ?? 320);
            }
        }

        // Loop the whole sequence after a short pause
        await wait(1400);
        if (playTokenRef.current === myToken) runSteps();
    };

    useEffect(() => {
        if (!play) {
            // pause / stop
            clearTimers();
            ++playTokenRef.current; // cancel any running loop
            return;
        }
        // start
        clearTimers();
        runSteps();

        return () => {
            clearTimers();
            ++playTokenRef.current; // cancel
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [play]);

    return (
        /* No outer code-panel wrapper — render split directly; overflow allowed */
        <div className="holo-root-split unbounded">
            {/* Terminal (≈40%) — fixed viewport; old lines fade while list translates up */}
            <div className="codewin codewin--terminal" role="img" aria-label="HoloClean terminal setup and run">
                <div className="codewin-head">
                    <span className="codewin-dot" />
                    <span className="codewin-dot" />
                    <span className="codewin-dot" />
                    <span className="codewin-title">holoclean.py</span>
                </div>

                <div ref={bodyRef} className="codewin-body">
                    <div ref={listRef} className="term-list">
                        {lines.map((ln) => {
                            const classes = [
                                'type-line',
                                ln.dim ? 'dim' : '',
                                ln.isTyping ? 'active' : '',    // green while typing
                                ln.kind === 'cmd' ? 'cmd' : '',
                                ln.kind === 'subcmd' ? 'cmd cmd--sub' : '',
                                ln.vanishing ? 'vanish' : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <div
                                    key={ln.id}
                                    className="term-line"
                                    ref={(el) => {
                                        const map = lineRefs.current;
                                        if (el) map.set(ln.id, el);
                                        else map.delete(ln.id);
                                    }}
                                >
                                    <div className={classes}>
                                        {ln.text}
                                        {ln.isTyping && <span className="caret" />}
                                    </div>
                                </div>
                            );
                        })}
                        {/* Fixed gutter space at bottom; no scroll */}
                        <div style={{ height: 8 }} />
                    </div>
                </div>
            </div>

            {/* Dataset (≈60%) */}
            <HoloDataset phase={phase} />
        </div>
    );
};

export default HoloCleanCode;
