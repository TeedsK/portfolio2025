import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './_CodeWindow.css';
import './HoloDataset.css';
import HoloDataset, { Phase, RunStats } from './HoloDataset';

type LineKind = 'cmd' | 'subcmd' | 'out';

type Step =
    | { kind: 'cmd'; text: string; topLevel?: boolean; delayAfterMs?: number }
    | { kind: 'subcmd'; text: string; delayAfterMs?: number }
    | { kind: 'output'; lines: string[]; delayAfterMs?: number } // terminal output (not typed)
    | { kind: 'phase'; to: Phase; delayAfterMs?: number };

type RenderLine = {
    id: string;
    kind: LineKind;
    text: string;
    block: number; // groups: 1 command (+ its subcmds/outputs)
    dim: boolean; // faded style for previous blocks
    vanishing?: boolean; // when being removed with collapse animation
    isTyping?: boolean; // caret + active color for current command typing
};

const MAX_VISIBLE = 5; // keep terminal to 5 logical lines
const MIN_VISIBLE_TO_TRIM = 2; // NEVER trim below this many lines
const COMMAND_CPS = 32; // characters per second when typing commands
const COLLAPSE_MS = 360; // collapse animation duration
const FIT_TOLERANCE_PX = 2; // tiny slack for rounding
const FIT_OVERFLOW_THRESHOLD = 16; // only trim if overflow bigger than this
const DEBUG_FIT = true; // leave on while validating; set to false to silence

const dlog = (...args: any[]) => {
    if (DEBUG_FIT) console.log('[HoloClean:fit]', ...args);
};

function rand(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Build the steps for a single run, using this run's stats for terminal output. */
function buildSteps(stats: RunStats): Step[] {
    const pPct = Math.round(stats.precision * 100);
    const rPct = Math.round(stats.recall * 100);
    const fPct = Math.round(stats.f1 * 100);

    const evalLines = [
        ' precision | recall |   F1   ',
        `  ${String(pPct).padStart(3)}%     |  ${String(rPct).padStart(3)}%   |  ${String(fPct).padStart(3)}%   `,
        '------------------------------',
    ];

    return [
        { kind: 'phase', to: 'idle', delayAfterMs: 120 },

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
            text: '(.venv) $ python run_inference.py --mode train_predict --learn_iteration 25 --learning_rate 0.005',
            topLevel: true,
            delayAfterMs: 200,
        },
        { kind: 'phase', to: 'inferred', delayAfterMs: 820 },

        {
            kind: 'cmd',
            text: '(.venv) $ python evaluate.py --truth_file hospital_100_clean.csv',
            topLevel: true,
            delayAfterMs: 320,
        },
        { kind: 'output', lines: evalLines, delayAfterMs: 700 },

        { kind: 'phase', to: 'evaluated', delayAfterMs: 400 },
    ];
}

const HoloCleanCode: React.FC<{ play: boolean }> = ({ play }) => {
    // ----- lock the terminal row height (40% of the split), recompute on resize -----
    const splitRef = useRef<HTMLDivElement>(null);
    const updateTermRowHeight = () => {
        const root = splitRef.current;
        if (!root) return;
        const h = root.clientHeight;
        if (!h) return;
        const termPx = Math.max(160, Math.round(h * 0.4)); // floor at 160px for safety
        root.style.setProperty('--holo-term-h', `${termPx}px`);
        dlog('set --holo-term-h', { containerH: h, termPx });
    };

    useLayoutEffect(() => {
        updateTermRowHeight();
        const ro = new ResizeObserver(() => updateTermRowHeight());
        if (splitRef.current) ro.observe(splitRef.current);
        const onWin = () => updateTermRowHeight();
        window.addEventListener('resize', onWin, { passive: true });
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', onWin);
        };
    }, []);

    // ---------- Terminal state ----------
    const [lines, setLines] = useState<RenderLine[]>([]);
    const linesRef = useRef<RenderLine[]>([]);
    useEffect(() => {
        linesRef.current = lines;
    }, [lines]);

    // DOM refs for collapse animation per line + terminal body
    const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const bodyRef = useRef<HTMLDivElement>(null);

    const playTokenRef = useRef(0);
    const timeouts = useRef<number[]>([]);
    const trimmingRef = useRef(false); // prevent concurrent trims

    // fit scheduling rafs
    const fitRaf = useRef<number | null>(null);
    const resizeRaf = useRef<number | null>(null);

    // ---------- Dataset phase + run stats ----------
    const [phase, setPhase] = useState<Phase>('idle');

    const [stats, setStats] = useState<RunStats>({
        rowsTotal: 1001,
        flaggedTotal: 324,
        precision: 0.93,
        recall: 0.91,
        f1: 0.92,
        fixedTotal: Math.round(0.93 * 324),
    });

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
        return id; // NOTE: no fit here (we fit after command finishes typing or after outputs)
    };

    const updateLine = (id: string, patch: Partial<RenderLine>) => {
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
        // no per-keystroke fit — avoids wrap races
    };

    // Collapse a specific oldest visible line (animated)
    const collapseOldest = () => {
        if (trimmingRef.current) {
            dlog('skip: already trimming');
            return false;
        }
        const visible = linesRef.current.filter((l) => !l.vanishing);
        if (!visible.length) {
            dlog('skip: no visible lines');
            return false;
        }
        if (visible.length <= MIN_VISIBLE_TO_TRIM) {
            dlog('skip: at or below min visible lines', { visible: visible.length });
            return false;
        }

        const oldest = visible[0];
        const el = lineRefs.current.get(oldest.id);
        if (!el) {
            dlog('remove oldest (no ref)', { id: oldest.id });
            setLines((prev) => prev.filter((l) => l.id !== oldest.id));
            return true;
        }

        trimmingRef.current = true;
        setLines((prev) => prev.map((l) => (l.id === oldest.id ? { ...l, vanishing: true } : l)));

        const startH = el.getBoundingClientRect().height;
        el.style.height = `${startH}px`;
        el.style.opacity = '1';
        requestAnimationFrame(() => {
            el.style.height = '0px';
            el.style.opacity = '0';
        });

        window.setTimeout(() => {
            dlog('collapsed', { id: oldest.id });
            setLines((prev) => prev.filter((l) => l.id !== oldest.id));
            el.style.height = '';
            el.style.opacity = '';
            trimmingRef.current = false;
            scheduleFit(); // chain if still needed
        }, COLLAPSE_MS);

        return true;
    };

    // Logical cap: > MAX_VISIBLE lines
    const trimIfNeeded = () => {
        const visible = linesRef.current.filter((l) => !l.vanishing);
        if (visible.length > MAX_VISIBLE) {
            dlog('logical trim triggered', { visible: visible.length, max: MAX_VISIBLE });
            collapseOldest();
        }
    };

    // Pixel cap: if wrapping caused overflow, collapse until it fits
    const ensureFitsByPixels = () => {
        const body = bodyRef.current;
        if (!body || trimmingRef.current) return;

        const clientH = body.clientHeight;
        const scrollH = body.scrollHeight;

        if (clientH <= 0) {
            dlog('defer fit: clientHeight <= 0', { clientH, scrollH });
            if (fitRaf.current != null) cancelAnimationFrame(fitRaf.current);
            fitRaf.current = requestAnimationFrame(() => {
                fitRaf.current = null;
                ensureFitsByPixels();
            });
            return;
        }

        // Logical cap first
        trimIfNeeded();

        const overflow = scrollH - clientH;
        dlog('measure', { clientH, scrollH, overflow });

        if (overflow <= FIT_TOLERANCE_PX) {
            dlog('no trim: within tolerance');
            return;
        }

        if (overflow < FIT_OVERFLOW_THRESHOLD) {
            dlog('no trim: micro-overflow', { overflow, threshold: FIT_OVERFLOW_THRESHOLD });
            return;
        }

        let guard = 0;
        while (body.scrollHeight - body.clientHeight > FIT_OVERFLOW_THRESHOLD && guard < 8) {
            const did = collapseOldest();
            if (!did) break;
            guard++;
        }
    };

    const scheduleFit = () => {
        if (fitRaf.current != null) cancelAnimationFrame(fitRaf.current);
        fitRaf.current = requestAnimationFrame(() => {
            fitRaf.current = null;
            ensureFitsByPixels();
        });
    };

    // Keep fit stable on window resizes (debounced by RAF)
    useEffect(() => {
        const onResize = () => {
            if (resizeRaf.current != null) cancelAnimationFrame(resizeRaf.current);
            resizeRaf.current = requestAnimationFrame(() => {
                resizeRaf.current = null;
                dlog('resize -> scheduleFit');
                updateTermRowHeight(); // <- keep the row pixel-locked on resize
                scheduleFit();
            });
        };
        window.addEventListener('resize', onResize, { passive: true });
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const runSteps = async () => {
        const myToken = ++playTokenRef.current;

        // New stats for this run (randomized)
        const rowsTotal = rand(901, 1500);
        const flaggedTotal = rand(
            Math.max(120, Math.floor(rowsTotal * 0.12)),
            Math.max(180, Math.floor(rowsTotal * 0.36)),
        );
        const precisionPct = rand(85, 96);
        const recallPct = rand(84, 95);
        const precision = precisionPct / 100;
        const recall = recallPct / 100;
        const f1 = +(2 * (precision * recall) / (precision + recall)).toFixed(2);
        const fixedTotal = Math.round((precisionPct / 100) * flaggedTotal);

        const nextStats: RunStats = {
            rowsTotal,
            flaggedTotal,
            precision,
            recall,
            f1,
            fixedTotal,
        };
        setStats(nextStats);

        const steps = buildSteps(nextStats);

        // Keep dataset in sync with this run
        setPhase('idle');
        await wait(50);

        let currentBlock = 0;

        for (let i = 0; i < steps.length; i++) {
            if (playTokenRef.current !== myToken) return; // cancelled
            const step = steps[i];

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
                    isTyping: true,
                });

                // Type out the command
                const full = `${step.text}`;
                for (let c = 0; c <= full.length; c++) {
                    if (playTokenRef.current !== myToken) return;
                    updateLine(lineId, { text: full.slice(0, c) });
                    await wait(1000 / COMMAND_CPS);
                }
                updateLine(lineId, { isTyping: false });

                dlog('command finished -> scheduleFit', { text: step.text });
                scheduleFit();

                await wait(step.delayAfterMs ?? 140);
            }

            if (step.kind === 'subcmd') {
                const lineId = pushLine({
                    kind: 'subcmd',
                    text: '',
                    block: currentBlock,
                    dim: false,
                    isTyping: true,
                });

                const full = step.text;
                for (let c = 0; c <= full.length; c++) {
                    if (playTokenRef.current !== myToken) return;
                    updateLine(lineId, { text: full.slice(0, c) });
                    await wait(1000 / COMMAND_CPS);
                }
                updateLine(lineId, { isTyping: false });

                dlog('subcmd finished -> scheduleFit', { text: step.text });
                scheduleFit();

                await wait(step.delayAfterMs ?? 120);
            }

            if (step.kind === 'output') {
                // Print all lines at once (no typing)
                step.lines.forEach((t) => {
                    pushLine({
                        kind: 'out',
                        text: t,
                        block: currentBlock,
                        dim: false,
                        isTyping: false,
                    });
                });
                dlog('output block -> scheduleFit', { lines: step.lines.length });
                scheduleFit();
                await wait(step.delayAfterMs ?? 320);
            }

            if (step.kind === 'phase') {
                setPhase(step.to);
                await wait(step.delayAfterMs ?? 320);
            }
        }

        // Short pause, then run again (new randomized dataset)
        await wait(1000);
        if (playTokenRef.current === myToken) runSteps();
    };

    useEffect(() => {
        if (!play) {
            clearTimers();
            ++playTokenRef.current; // cancel loop
            return;
        }
        clearTimers();
        runSteps();

        return () => {
            clearTimers();
            ++playTokenRef.current; // cancel
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [play]);

    return (
        <div ref={splitRef} className="holo-root-split unbounded">
            {/* Terminal */}
            <div className="codewin codewin--terminal" role="img" aria-label="HoloClean terminal setup and run">
                <div className="codewin-head">
                    <span className="codewin-dot" />
                    <span className="codewin-dot" />
                    <span className="codewin-dot" />
                    <span className="codewin-title">holoclean.py</span>
                </div>

                <div ref={bodyRef} className="codewin-body">
                    {lines.map((ln) => {
                        const classes = [
                            'type-line',
                            ln.dim ? 'dim' : '',
                            ln.kind === 'cmd' ? 'cmd' : '',
                            ln.kind === 'subcmd' ? 'cmd cmd--sub' : '',
                            ln.kind === 'out' ? 'out' : '',
                            ln.vanishing ? 'vanish' : '',
                            ln.isTyping ? 'active' : '',
                        ]
                            .filter(Boolean)
                            .join(' ');

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
                    <div style={{ height: 8 }} />
                </div>
            </div>

            {/* Dataset */}
            <HoloDataset phase={phase} stats={stats} />
        </div>
    );
};

export default HoloCleanCode;
