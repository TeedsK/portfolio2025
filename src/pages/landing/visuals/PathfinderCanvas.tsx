// src/pages/landing/visuals/PathfinderCanvas.tsx
import React, { useEffect, useRef } from 'react';
import { PriorityQueue } from './structures/PriorityQueue';
import { Popover } from 'antd';

/**
 * === Visual Style (preserved) ===
 */
const SEARCHED_1 = '#bdb9fd';
const SEARCHED_2 = '#a6bbe9';
const SEARCHED_3 = '#c2e7f8';
const SEARCHED_4 = '#f9f8fc';
const SEARCH_SEQUENCE = [SEARCHED_1, SEARCHED_2, SEARCHED_3, SEARCHED_4] as const;

const START = '#69d885';
const END = '#d95353';
const EMPTY = '#ffffff';
const WALL = '#f2f0f9';
const BEST_PATH_1 = 'rgba(106, 236, 142, 1)';
const BEST_PATH_2 = '#b5f5c7';
const TO_SEARCH = '#ffffff';

/** Base timings (unscaled). We will scale by speedMultiplier per cycle */
const BASE = {
    DELAY_PER_ITERATION_MS: 10,
    PULSE_STEP_MS: 150,
    NEIGH_REVEAL_TO_WHITE_MS: 160,
    BEST_PATH_STEP_MS: 20,
    AFTER_PATH_PAUSE_MS: 1000,
    SCALE_IN_MS: 250,
    SCALE_OUT_MS: 250,
    REVEAL_BLOCK: 10,
    REVEAL_RING_DELAY_MS: 50,
    REVEAL_SECTION_DELAY_MS: 24,
    RESET_BAND_ROWS: 4,
    RESET_BAND_DELAY_MS: 60,
};

/** Utility + easing */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

/** Types */
type PaintEvent = { at: number; r: number; c: number; color: string; };
type ScaleEvent = { at: number; r: number; c: number; kind: 'in' | 'out'; };
type BlockEvent =
    | { at: number; r0: number; c0: number; rows: number; cols: number; kind: 'reveal'; setScaleInForWalls: boolean; }
    | { at: number; r0: number; c0: number; rows: number; cols: number; kind: 'fadeOut'; }
    | { at: number; r0: number; c0: number; rows: number; cols: number; kind: 'clear'; };

type GridCell = { wall: boolean; color: string; scaleInStart: number; scaleOutStart: number; };

type SizeItem = { label: string; sizePx: number };
type Mode = 'auto' | 'fixed' | 'custom';

type Props = {
    heightPx?: number;
    mode?: Mode;
    fixedCellSizePx?: number;
    autoSequence?: SizeItem[];
    initialAutoIndex?: number;
    onAutoSizeChange?: (label: string) => void;
    resetCounter?: number;
    customSignals?: { startCounter: number; resetCounter: number };
    speedMultiplier?: number;
    hintCounter?: number;
};

const PathfinderCanvas: React.FC<Props> = ({
    heightPx,
    mode = 'auto',
    fixedCellSizePx,
    autoSequence = [
        { label: 'XXL', sizePx: 3 },
        { label: 'XL', sizePx: 5 },
        { label: 'L', sizePx: 8 },
        { label: 'M', sizePx: 12 },
        { label: 'S', sizePx: 16 },
    ],
    initialAutoIndex = 0,
    onAutoSizeChange,
    resetCounter = 0,
    customSignals = { startCounter: 0, resetCounter: 0 },
    speedMultiplier = 1,
    hintCounter = 0,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    const rafRef = useRef<number | null>(null);
    const cycleStartRef = useRef<number>(0);

    /** Event queues (block + per-cell), with cursors for O(1) amortized consumption */
    const paintEventsRef = useRef<PaintEvent[]>([]);
    const scaleEventsRef = useRef<ScaleEvent[]>([]);
    const blockEventsRef = useRef<BlockEvent[]>([]);
    const paintCursorRef = useRef(0);
    const scaleCursorRef = useRef(0);
    const blockCursorRef = useRef(0);

    const gridRef = useRef<GridCell[][]>([]);
    const dimsRef = useRef({ rows: 0, cols: 0, cell: 12, width: 0, height: 0 });

    const runningRef = useRef(false);
    const visibleRef = useRef(true);
    const modeRef = useRef<Mode>(mode);
    const speedRef = useRef<number>(speedMultiplier);

    /** Scaled timing cache per cycle */
    const TIME = useRef({
        DELAY_PER_ITERATION_MS: BASE.DELAY_PER_ITERATION_MS,
        PULSE_STEP_MS: BASE.PULSE_STEP_MS,
        NEIGH_REVEAL_TO_WHITE_MS: BASE.NEIGH_REVEAL_TO_WHITE_MS,
        BEST_PATH_STEP_MS: BASE.BEST_PATH_STEP_MS,
        AFTER_PATH_PAUSE_MS: BASE.AFTER_PATH_PAUSE_MS,
        SCALE_IN_MS: BASE.SCALE_IN_MS,
        SCALE_OUT_MS: BASE.SCALE_OUT_MS,
        REVEAL_RING_DELAY_MS: BASE.REVEAL_RING_DELAY_MS,
        REVEAL_SECTION_DELAY_MS: BASE.REVEAL_SECTION_DELAY_MS,
        RESET_BAND_ROWS: BASE.RESET_BAND_ROWS,
        RESET_BAND_DELAY_MS: BASE.RESET_BAND_DELAY_MS,
        REVEAL_BLOCK: BASE.REVEAL_BLOCK,
    });

    /** Active set for rendering-only pass */
    const activeCellsRef = useRef<Set<number>>(new Set());
    const addActive = (rows: number, cols: number, r: number, c: number) => {
        if (r < 0 || c < 0 || r >= rows || c >= cols) return;
        activeCellsRef.current.add(r * cols + c);
    };
    const removeActive = (rows: number, cols: number, r: number, c: number) => {
        if (r < 0 || c < 0 || r >= rows || c >= cols) return;
        activeCellsRef.current.delete(r * cols + c);
    };

    /** Start/End position tracking (for overlay + custom mode) */
    const startRef = useRef<{ r: number; c: number } | null>(null);
    const endRef = useRef<{ r: number; c: number } | null>(null);
    const customStartRef = useRef<{ r: number; c: number } | null>(null);
    const customEndRef = useRef<{ r: number; c: number } | null>(null);

    /** Drawing state for custom mode */
    const drawingWallsRef = useRef(false);
    const lastDrawIdxRef = useRef<number | null>(null);

    /** Auto rotation index */
    const autoIndexRef = useRef<number>(initialAutoIndex % autoSequence.length);

    /** Hint overlay lifetime (in timeline ms) */
    const hintUntilMsRef = useRef<number>(-1);

    /** === Overlay Popover markers (for XL/XXL) === */
    const startMarkerRef = useRef<HTMLDivElement | null>(null);
    const endMarkerRef = useRef<HTMLDivElement | null>(null);

    const updateMarkers = () => {
        const cell = dimsRef.current.cell;
        const rows = dimsRef.current.rows;
        const cols = dimsRef.current.cols;
        const showMarkers = (cell === 3 || cell === 5) && modeRef.current !== 'custom';

        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        // Helper to place a marker in viewport coords
        const place = (el: HTMLDivElement | null, pos: { r: number; c: number } | null) => {
            if (!el) return;
            if (!showMarkers || !pos || pos.r < 0 || pos.c < 0 || pos.r >= rows || pos.c >= cols) {
                el.style.display = 'none';
                return;
            }
            const left = rect.left + pos.c * cell + cell * 0.5;
            const top = rect.top + pos.r * cell + cell * 0.5;
            el.style.setProperty('--pf-cell', `${cell}px`);
            el.style.left = `${left}px`;
            el.style.top = `${top}px`;
            el.style.display = 'block';
        };

        place(startMarkerRef.current, startRef.current);
        place(endMarkerRef.current, endRef.current);
    };

    /** Helpers */
    const clearTimeline = () => {
        paintEventsRef.current = [];
        scaleEventsRef.current = [];
        blockEventsRef.current = [];
        paintCursorRef.current = 0;
        scaleCursorRef.current = 0;
        blockCursorRef.current = 0;
    };

    const sizeCanvas = (canvas: HTMLCanvasElement, wCss: number, hCss: number) => {
        const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        canvas.width = Math.max(1, Math.floor(wCss * dpr));
        canvas.height = Math.max(1, Math.floor(hCss * dpr));
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        (ctx as any).imageSmoothingEnabled = false;
        return ctx;
    };

    const computeGridDims = (wrapWidth: number, wrapHeight: number, cellPx: number) => {
        const cell = Math.max(1, Math.floor(cellPx));
        const cols = Math.max(10, Math.ceil(wrapWidth / cell));
        const rows = Math.max(10, Math.ceil(wrapHeight / cell));
        return { rows, cols, cell, width: wrapWidth, height: wrapHeight };
    };

    const initGrid = (rows: number, cols: number) => {
        const g: GridCell[][] = new Array(rows);
        for (let r = 0; r < rows; r++) {
            g[r] = new Array(cols);
            for (let c = 0; c < cols; c++) {
                g[r][c] = { wall: false, color: EMPTY, scaleInStart: -1, scaleOutStart: -1 };
            }
        }
        return g;
    };

    const ensureBottomRowOpenings = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const bottom = rows - 1;

        for (let c = 0; c < cols; c++) g[bottom][c].wall = true;

        const internal = Array.from({ length: cols - 2 }, (_, i) => i + 1);
        const corridorCols = internal.filter(c => !g[bottom - 1][c].wall);
        const fallback = internal.filter(c => (c & 1) === 1);
        const candidates = corridorCols.length ? corridorCols : (fallback.length ? fallback : internal);

        const K = clamp(Math.floor(cols / 10), 3, 8);
        const picks: number[] = [];
        if (candidates.length <= K) {
            picks.push(...candidates);
        } else {
            for (let i = 0; i < K; i++) {
                const idx = Math.round(((i + 1) / (K + 1)) * (candidates.length - 1));
                picks.push(candidates[idx]);
            }
        }

        const chosen = new Set<number>();
        for (const c of picks) {
            const cc = clamp(c, 1, cols - 2);
            chosen.add(cc);
            g[bottom][cc].wall = false;
            if (g[bottom - 1][cc].wall) g[bottom - 1][cc].wall = false;
        }

        if (chosen.size < 2 && cols >= 12) {
            const q1 = clamp(Math.floor(cols / 4), 1, cols - 2);
            const q3 = clamp(Math.floor((3 * cols) / 4), 1, cols - 2);
            chosen.add(q1); chosen.add(q3);
            g[bottom][q1].wall = false; if (g[bottom - 1][q1].wall) g[bottom - 1][q1].wall = false;
            g[bottom][q3].wall = false; if (g[bottom - 1][q3].wall) g[bottom - 1][q3].wall = false;
        }
    };

    const carveMazeBinary = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;

        for (let i = 0; i < rows - 2; i += 2) {
            for (let x = 0; x < cols - 2; x += 2) {
                const pts: [number, number][] = [
                    [i, x], [i + 2, x + 1], [i + 1, x + 2],
                    [i, x + 2], [i + 2, x], [i + 2, x + 2],
                ];
                for (const [r, c] of pts) {
                    if (r >= 0 && r < rows && c >= 0 && c < cols) g[r][c].wall = true;
                }
                const ran = Math.random();
                if (ran < 0.444) {
                    if (i + 1 < rows) g[i + 1][x].wall = false;
                } else if (ran < 0.85) {
                    if (x + 1 < cols) g[i][x + 1].wall = false;
                } else {
                    if (i + 1 < rows) g[i + 1][x].wall = false;
                    if (x + 1 < cols) g[i][x + 1].wall = false;
                }
            }
        }
        ensureBottomRowOpenings(g);
    };

    /** Scale (divide) a duration by current speed (2× speed => half duration) */
    const S = (ms: number) => ms / speedRef.current;

    /** Block-based reveal schedule (two waves + center gap + coverage stripes) */
    const scheduleMazeRevealNoOverlap = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const mid = Math.floor(rows / 2);

        let baseDelay = 0;
        let lastScheduledAt = 0;

        const scheduleBlockRect = (
            r0: number, c0: number, sizeCols: number, sizeRows: number, at: number, withScaleInForWalls: boolean
        ) => {
            const colsClamped = Math.max(0, Math.min(sizeCols, cols - c0));
            const rowsClamped = Math.max(0, Math.min(sizeRows, rows - r0));
            if (colsClamped <= 0 || rowsClamped <= 0) return;
            blockEventsRef.current.push({
                at, r0, c0, rows: rowsClamped, cols: colsClamped,
                kind: 'reveal', setScaleInForWalls: withScaleInForWalls,
            });
            if (at > lastScheduledAt) lastScheduledAt = at;
        };

        const scheduleRowBandDirectional = (
            rowStart: number, rowLimitExclusive: number, bandBaseAt: number, dir: 'ltr' | 'rtl'
        ) => {
            const rowsHigh = Math.min(BASE.REVEAL_BLOCK, rowLimitExclusive - rowStart);
            if (rowsHigh <= 0) return bandBaseAt;

            let at = bandBaseAt;
            if (dir === 'ltr') {
                for (let j = 0; j < cols; j += BASE.REVEAL_BLOCK) {
                    const sizeCols = Math.min(BASE.REVEAL_BLOCK, cols - j);
                    scheduleBlockRect(rowStart, j, sizeCols, rowsHigh, at, true);
                    at += TIME.current.REVEAL_SECTION_DELAY_MS;
                }
            } else {
                for (let j = cols - BASE.REVEAL_BLOCK; j >= 0; j -= BASE.REVEAL_BLOCK) {
                    const c0 = Math.max(0, j);
                    const sizeCols = Math.min(BASE.REVEAL_BLOCK, cols - c0);
                    scheduleBlockRect(rowStart, c0, sizeCols, rowsHigh, at, true);
                    at += TIME.current.REVEAL_SECTION_DELAY_MS;
                }
            }
            return at;
        };

        const topStarts: number[] = [];
        for (let i = 0; i < mid; i += BASE.REVEAL_BLOCK) topStarts.push(i);
        const bottomStarts: number[] = [];
        for (let i = rows - BASE.REVEAL_BLOCK; i >= mid; i -= BASE.REVEAL_BLOCK) bottomStarts.push(i);

        const maxRings = Math.max(topStarts.length, bottomStarts.length);

        for (let ring = 0; ring < maxRings; ring++) {
            if (ring < topStarts.length) scheduleRowBandDirectional(topStarts[ring], mid, baseDelay, 'ltr');
            if (ring < bottomStarts.length) scheduleRowBandDirectional(bottomStarts[ring], rows, baseDelay, 'rtl');
            baseDelay += TIME.current.REVEAL_RING_DELAY_MS;
        }

        // Center gap
        const topLastEnd = topStarts.length
            ? Math.min(mid - 1, topStarts[topStarts.length - 1] + BASE.REVEAL_BLOCK - 1)
            : -1;
        const bottomClosestStart = bottomStarts.length ? bottomStarts[bottomStarts.length - 1] : rows;
        const gapStart = topLastEnd + 1;
        const gapEnd = bottomClosestStart - 1;

        if (gapStart <= gapEnd) {
            let at = baseDelay;
            for (let r = gapStart; r <= gapEnd; r += BASE.REVEAL_BLOCK) {
                const rowsHigh = Math.min(BASE.REVEAL_BLOCK, gapEnd - r + 1);
                for (let j = 0; j < cols; j += BASE.REVEAL_BLOCK) {
                    const sizeCols = Math.min(BASE.REVEAL_BLOCK, cols - j);
                    scheduleBlockRect(r, j, sizeCols, rowsHigh, at, true);
                    at += TIME.current.REVEAL_SECTION_DELAY_MS;
                }
                baseDelay += TIME.current.REVEAL_RING_DELAY_MS;
            }
        }

        // Final coverage stripes (no scale-in)
        const coverageAt = Math.max(lastScheduledAt, baseDelay) + 10;
        const STRIPE_ROWS = Math.max(8, Math.floor(rows / 16));
        let covAt = coverageAt;
        for (let r0 = 0; r0 < rows; r0 += STRIPE_ROWS) {
            const h = Math.min(STRIPE_ROWS, rows - r0);
            blockEventsRef.current.push({
                at: covAt, r0, c0: 0, rows: h, cols, kind: 'reveal', setScaleInForWalls: false,
            });
            covAt += 8;
        }

        return covAt;
    };

    const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
        Math.abs(r1 - r2) + Math.abs(c1 - c2);

    const chooseStartEnd = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const randBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

        const startR = randBetween(2, Math.max(2, Math.floor((rows - 2) / 2)));
        const endR = randBetween(Math.floor((rows - 2) / 2), Math.max(3, rows - 10));
        const startC = clamp(randBetween(10, cols - 2), 1, cols - 2);
        const endC = clamp(randBetween(10, cols - 2), 1, cols - 2);

        const ensureEmpty = (r: number, c: number) => {
            if (!g[r][c].wall) return { r, c };
            const spiral = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
            for (const [dr, dc] of spiral) {
                const nr = clamp(r + dr, 1, rows - 2);
                const nc = clamp(c + dc, 1, cols - 2);
                if (!g[nr][nc].wall) return { r: nr, c: nc };
            }
            return { r, c };
        };

        const s = ensureEmpty(startR, startC);
        const e = ensureEmpty(endR, endC);
        return { s, e };
    };

    const scheduleNeighborReveal = (at: number, r: number, c: number) => {
        paintEventsRef.current.push({ at, r, c, color: SEARCHED_1 });
        scaleEventsRef.current.push({ at, r, c, kind: 'in' });
        paintEventsRef.current.push({ at: at + TIME.current.NEIGH_REVEAL_TO_WHITE_MS, r, c, color: TO_SEARCH });
    };

    const schedulePulse = (base: number, r: number, c: number) => {
        paintEventsRef.current.push({ at: base, r, c, color: SEARCHED_1 });
        scaleEventsRef.current.push({ at: base, r, c, kind: 'in' });
        SEARCH_SEQUENCE.slice(1).forEach((color, idx) => {
            paintEventsRef.current.push({ at: base + (idx + 1) * TIME.current.PULSE_STEP_MS, r, c, color });
        });
    };

    const scheduleBestPath = (startAt: number, path: { r: number; c: number }[]) => {
        let t = startAt;
        let lastPaintAt = startAt;
        for (const p of path) {
            const a1 = t;
            const a2 = t + 160 / speedRef.current;
            paintEventsRef.current.push({ at: a1, r: p.r, c: p.c, color: BEST_PATH_1 });
            scaleEventsRef.current.push({ at: a1, r: p.r, c: p.c, kind: 'in' });
            paintEventsRef.current.push({ at: a2, r: p.r, c: p.c, color: BEST_PATH_2 });
            lastPaintAt = Math.max(lastPaintAt, a2);
            t += TIME.current.BEST_PATH_STEP_MS;
        }
        return lastPaintAt;
    };

    const scheduleResetFadeBandsTopToBottom = (g: GridCell[][], startAt: number) => {
        const rows = g.length;
        const cols = g[0].length;

        let bandIndex = 0;
        let lastClearAt = startAt;
        for (let r0 = 0; r0 < rows; r0 += BASE.RESET_BAND_ROWS) {
            const at = startAt + bandIndex * TIME.current.RESET_BAND_DELAY_MS;
            const rEnd = Math.min(rows, r0 + BASE.RESET_BAND_ROWS);
            const rowsHigh = rEnd - r0;

            blockEventsRef.current.push({ at, r0, c0: 0, rows: rowsHigh, cols, kind: 'fadeOut' });
            blockEventsRef.current.push({ at: at + TIME.current.SCALE_OUT_MS, r0, c0: 0, rows: rowsHigh, cols, kind: 'clear' });

            lastClearAt = at + TIME.current.SCALE_OUT_MS;
            bandIndex++;
        }
        return lastClearAt;
    };

    const runAStarWithTimeline = (
        g: GridCell[][],
        s: { r: number; c: number },
        e: { r: number; c: number },
        startDelayMs: number
    ) => {
        const rows = g.length;
        const cols = g[0].length;

        const idx = (r: number, c: number) => r * cols + c;
        const fromIdx = (k: number) => ({ r: Math.floor(k / cols), c: k % cols });

        const N = rows * cols;
        const gScore = new Float32Array(N);
        const fScore = new Float32Array(N);
        const parent = new Int32Array(N);
        const inOpen = new Uint8Array(N);
        const visited = new Uint8Array(N);

        gScore.fill(Number.POSITIVE_INFINITY);
        fScore.fill(Number.POSITIVE_INFINITY);
        parent.fill(-1);
        inOpen.fill(0);

        const start = idx(s.r, s.c);
        const goal = idx(e.r, e.c);

        gScore[start] = 0;
        fScore[start] = manhattan(s.r, s.c, e.r, e.c);

        let tiebreak = 0;
        const pq = new PriorityQueue<[number, number, number]>((a, b) => {
            if (a[0] !== b[0]) return a[0] < b[0];
            return a[1] < b[1];
        });

        pq.push([fScore[start], tiebreak++, start]);
        inOpen[start] = 1;

        let searchingDelay = 0;

        const neighbors = (k: number) => {
            const { r, c } = fromIdx(k);
            const out: number[] = [];
            if (r > 0 && !g[r - 1][c].wall) out.push(idx(r - 1, c));
            if (r < rows - 1 && !g[r + 1][c].wall) out.push(idx(r + 1, c));
            if (c > 0 && !g[r][c - 1].wall) out.push(idx(r, c - 1));
            if (c < cols - 1 && !g[r][c + 1].wall) out.push(idx(r, c + 1));
            return out;
        };

        while (pq.size() > 0) {
            searchingDelay += TIME.current.DELAY_PER_ITERATION_MS;
            const curTuple = pq.pop()!;
            const current = curTuple[2];
            const { r: cr, c: cc } = fromIdx(current);

            if (current !== start) schedulePulse(startDelayMs + searchingDelay, cr, cc);

            if (current === goal) {
                const path: { r: number; c: number }[] = [];
                let cur = current;
                while (cur !== -1 && cur !== start) {
                    path.push(fromIdx(cur));
                    cur = parent[cur];
                }

                const lastPathPaintAt = scheduleBestPath(startDelayMs + searchingDelay + S(500), path.reverse());
                const endOnTopAt = lastPathPaintAt + 8;
                paintEventsRef.current.push({ at: endOnTopAt, r: e.r, c: e.c, color: END });
                scaleEventsRef.current.push({ at: endOnTopAt, r: e.r, c: e.c, kind: 'in' });

                return endOnTopAt;
            }

            visited[current] = 1;

            const curG = gScore[current];
            for (const nb of neighbors(current)) {
                if (visited[nb]) continue;
                const tentative = curG + 1;

                if (tentative < gScore[nb]) {
                    parent[nb] = current;
                    gScore[nb] = tentative;

                    const { r: nr, c: nc } = fromIdx(nb);
                    fScore[nb] = tentative + manhattan(nr, nc, e.r, e.c);

                    if (!inOpen[nb]) {
                        inOpen[nb] = 1;
                        pq.push([fScore[nb], tiebreak++, nb]);
                        scheduleNeighborReveal(startDelayMs + searchingDelay, nr, nc);
                    }
                }
            }
        }
        return startDelayMs + searchingDelay + S(400);
    };

    /** Rendering with active set; END overlay; optional hint markers for start/end */
    const render = (ctx: CanvasRenderingContext2D, g: GridCell[][], cell: number, elapsedMs: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dimsRef.current.width, dimsRef.current.height);

        const rows = g.length, cols = g[0].length;

        for (const k of activeCellsRef.current) {
            const r = Math.floor(k / cols);
            const c = k % cols;
            if (r < 0 || c < 0 || r >= rows || c >= cols) continue;

            const y = r * cell;
            const x = c * cell;
            const gc = g[r][c];
            const baseColor = gc.color;
            if (baseColor === EMPTY) continue;

            let scale = 1;
            const inStart = gc.scaleInStart;
            const outStart = gc.scaleOutStart;

            if (outStart >= 0 && (inStart < 0 || outStart >= inStart)) {
                const t = clamp((elapsedMs - outStart) / TIME.current.SCALE_OUT_MS, 0, 1);
                scale = clamp(1 - easeInCubic(t), 0, 1);
            } else if (inStart >= 0) {
                const t = clamp((elapsedMs - inStart) / TIME.current.SCALE_IN_MS, 0, 1);
                scale = clamp(easeOutCubic(t), 0, 1);
            }

            const w = cell * scale;
            const h = cell * scale;
            const cx = x + (cell - w) / 2;
            const cy = y + (cell - h) / 2;

            ctx.fillStyle = baseColor;
            ctx.fillRect(Math.round(cx), Math.round(cy), Math.ceil(w), Math.ceil(h));
        }

        // END overlay (painted always on top)
        if (endRef.current) {
            const { r: er, c: ec } = endRef.current;
            const gcEnd = g[er][ec];
            let endScale = 1;
            if (gcEnd.scaleOutStart >= 0 && (gcEnd.scaleInStart < 0 || gcEnd.scaleOutStart >= gcEnd.scaleInStart)) {
                const t = clamp((elapsedMs - gcEnd.scaleOutStart) / TIME.current.SCALE_OUT_MS, 0, 1);
                endScale = clamp(1 - easeInCubic(t), 0, 1);
            } else if (gcEnd.scaleInStart >= 0) {
                const t = clamp((elapsedMs - gcEnd.scaleInStart) / TIME.current.SCALE_IN_MS, 0, 1);
                endScale = clamp(easeOutCubic(t), 0, 1);
            }
            if (endScale > 0.001) {
                const x = ec * cell;
                const y = er * cell;
                const w = cell * endScale;
                const h = cell * endScale;
                const cx = x + (cell - w) / 2;
                const cy = y + (cell - h) / 2;
                ctx.fillStyle = END;
                ctx.fillRect(Math.round(cx), Math.round(cy), Math.ceil(w), Math.ceil(h));
            }
        }

        // Hint overlay (for ~2s after request)
        if (hintUntilMsRef.current >= 0 && elapsedMs <= hintUntilMsRef.current) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = Math.max(1, Math.floor(cell * 0.15));

            if (startRef.current) {
                const { r, c } = startRef.current;
                const x = c * cell; const y = r * cell;
                ctx.strokeStyle = START;
                ctx.strokeRect(Math.round(x + 1), Math.round(y + 1), Math.max(1, Math.floor(cell - 2)), Math.max(1, Math.floor(cell - 2)));
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.font = `${Math.max(10, Math.floor(cell * 0.9))}px system-ui, -apple-system, Segoe UI, Roboto`;
                ctx.fillText('Start', x + 2, y + Math.max(12, cell - 2));
            }
            if (endRef.current) {
                const { r, c } = endRef.current;
                const x = c * cell; const y = r * cell;
                ctx.strokeStyle = END;
                ctx.strokeRect(Math.round(x + 1), Math.round(y + 1), Math.max(1, Math.floor(cell - 2)), Math.max(1, Math.floor(cell - 2)));
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.font = `${Math.max(10, Math.floor(cell * 0.9))}px system-ui, -apple-system, Segoe UI, Roboto`;
                ctx.fillText('End', x + 2, y + Math.max(12, cell - 2));
            }
            ctx.restore();
        }

        // Update DOM markers (after we know positions/colors this frame)
        updateMarkers();
    };

    const applyDueEvents = (g: GridCell[][], elapsedMs: number) => {
        const rows = g.length;
        const cols = g[0].length;

        // Block events
        const be = blockEventsRef.current;
        let bi = blockCursorRef.current;
        while (bi < be.length && be[bi].at <= elapsedMs) {
            const ev = be[bi];
            const rMax = Math.min(ev.r0 + ev.rows, rows);
            const cMax = Math.min(ev.c0 + ev.cols, cols);

            if (ev.kind === 'reveal') {
                for (let r = ev.r0; r < rMax; r++) {
                    for (let c = ev.c0; c < cMax; c++) {
                        const cell = g[r][c];
                        if (cell.wall) {
                            cell.color = WALL;
                            if (ev.setScaleInForWalls) {
                                cell.scaleInStart = ev.at;
                                cell.scaleOutStart = -1;
                            }
                            addActive(rows, cols, r, c);
                        } else {
                            cell.color = EMPTY;
                            removeActive(rows, cols, r, c);
                        }
                    }
                }
            } else if (ev.kind === 'fadeOut') {
                for (let r = ev.r0; r < rMax; r++) {
                    for (let c = ev.c0; c < cMax; c++) {
                        g[r][c].scaleOutStart = ev.at;
                    }
                }
            } else if (ev.kind === 'clear') {
                for (let r = ev.r0; r < rMax; r++) {
                    for (let c = ev.c0; c < cMax; c++) {
                        const cell = g[r][c];
                        cell.color = EMPTY;
                        cell.scaleInStart = -1;
                        removeActive(rows, cols, r, c);
                    }
                }
            }
            bi++;
        }
        blockCursorRef.current = bi;

        // Paint events
        const pe = paintEventsRef.current;
        let i = paintCursorRef.current;
        while (i < pe.length && pe[i].at <= elapsedMs) {
            const ev = pe[i];
            g[ev.r][ev.c].color = ev.color;
            if (ev.color === EMPTY) {
                g[ev.r][ev.c].scaleInStart = -1;
                removeActive(rows, cols, ev.r, ev.c);
            } else {
                addActive(rows, cols, ev.r, ev.c);
            }
            i++;
        }
        paintCursorRef.current = i;

        // Scale events
        const se = scaleEventsRef.current;
        let j = scaleCursorRef.current;
        while (j < se.length && se[j].at <= elapsedMs) {
            const ev = se[j];
            if (ev.kind === 'in') {
                g[ev.r][ev.c].scaleInStart = ev.at;
                g[ev.r][ev.c].scaleOutStart = -1;
                addActive(rows, cols, ev.r, ev.c);
            } else {
                g[ev.r][ev.c].scaleOutStart = ev.at;
                addActive(rows, cols, ev.r, ev.c);
            }
            j++;
        }
        scaleCursorRef.current = j;
    };

    const finalizeSchedules = () => {
        blockEventsRef.current.sort((a, b) => a.at - b.at);
        paintEventsRef.current.sort((a, b) => a.at - b.at);
        scaleEventsRef.current.sort((a, b) => a.at - b.at);
        blockCursorRef.current = 0;
        paintCursorRef.current = 0;
        scaleCursorRef.current = 0;
    };

    /** Custom-mode helpers */
    const clearCustomGrid = () => {
        const { rows, cols } = dimsRef.current;
        const g = gridRef.current;
        activeCellsRef.current.clear();
        startRef.current = null;
        endRef.current = null;
        customStartRef.current = null;
        customEndRef.current = null;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                g[r][c].wall = false;
                g[r][c].color = EMPTY;
                g[r][c].scaleInStart = -1;
                g[r][c].scaleOutStart = -1;
            }
        }
        updateMarkers();
    };

    const toCellRC = (evt: PointerEvent) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        const { cell, rows, cols } = dimsRef.current;
        let c = Math.floor(x / cell);
        let r = Math.floor(y / cell);
        if (c < 0) c = 0; if (r < 0) r = 0;
        if (c >= cols) c = cols - 1;
        if (r >= rows) r = rows - 1;
        return { r, c, idx: r * cols + c };
    };

    const setCustomStart = (r: number, c: number) => {
        const g = gridRef.current;
        const { rows, cols } = dimsRef.current;
        const cell = g[r][c];
        cell.wall = false;
        cell.color = START;
        cell.scaleInStart = performance.now() - cycleStartRef.current;
        cell.scaleOutStart = -1;
        addActive(rows, cols, r, c);
        customStartRef.current = { r, c };
        startRef.current = { r, c };
        updateMarkers();
    };

    const setCustomEnd = (r: number, c: number) => {
        const g = gridRef.current;
        const { rows, cols } = dimsRef.current;
        const cell = g[r][c];
        cell.wall = false;
        cell.color = END;
        cell.scaleInStart = performance.now() - cycleStartRef.current;
        cell.scaleOutStart = -1;
        addActive(rows, cols, r, c);
        customEndRef.current = { r, c };
        endRef.current = { r, c };
        updateMarkers();
    };

    const drawWallAt = (r: number, c: number) => {
        const g = gridRef.current;
        const { rows, cols } = dimsRef.current;
        if (customStartRef.current && customStartRef.current.r === r && customStartRef.current.c === c) return;
        if (customEndRef.current && customEndRef.current.r === r && customEndRef.current.c === c) return;
        const cell = g[r][c];
        cell.wall = true;
        cell.color = WALL;
        cell.scaleInStart = performance.now() - cycleStartRef.current;
        cell.scaleOutStart = -1;
        addActive(rows, cols, r, c);
    };

    /** Start cycle with current mode, size, and speed */
    const startCycle = (ctx: CanvasRenderingContext2D) => {
        if (!visibleRef.current) return;
        runningRef.current = true;
        clearTimeline();
        activeCellsRef.current.clear();

        // Compute scaled timings
        TIME.current = {
            DELAY_PER_ITERATION_MS: BASE.DELAY_PER_ITERATION_MS / speedRef.current,
            PULSE_STEP_MS: BASE.PULSE_STEP_MS / speedRef.current,
            NEIGH_REVEAL_TO_WHITE_MS: BASE.NEIGH_REVEAL_TO_WHITE_MS / speedRef.current,
            BEST_PATH_STEP_MS: BASE.BEST_PATH_STEP_MS / speedRef.current,
            AFTER_PATH_PAUSE_MS: BASE.AFTER_PATH_PAUSE_MS / speedRef.current,
            SCALE_IN_MS: BASE.SCALE_IN_MS / speedRef.current,
            SCALE_OUT_MS: BASE.SCALE_OUT_MS / speedRef.current,
            REVEAL_RING_DELAY_MS: BASE.REVEAL_RING_DELAY_MS / speedRef.current,
            REVEAL_SECTION_DELAY_MS: BASE.REVEAL_SECTION_DELAY_MS / speedRef.current,
            RESET_BAND_ROWS: BASE.RESET_BAND_ROWS,
            RESET_BAND_DELAY_MS: BASE.RESET_BAND_DELAY_MS / speedRef.current,
            REVEAL_BLOCK: BASE.REVEAL_BLOCK,
        };

        // Resolve cell size per mode
        let cellPx: number = 12;
        if (modeRef.current === 'fixed') {
            cellPx = Math.max(1, Math.floor(fixedCellSizePx ?? 12));
        } else if (modeRef.current === 'auto') {
            const seq = autoSequence;
            const idx = autoIndexRef.current % seq.length;
            const item = seq[idx];
            cellPx = Math.max(1, Math.floor(item.sizePx));
            onAutoSizeChange?.(item.label);
            autoIndexRef.current = (idx + 1) % seq.length;
        } else if (modeRef.current === 'custom') {
            cellPx = Math.max(1, Math.floor(fixedCellSizePx ?? 12));
        }

        // Compute dims & init grid
        const container = containerRef.current!;
        const rect = container.getBoundingClientRect();
        dimsRef.current = computeGridDims(rect.width, rect.height, cellPx);
        const { rows, cols } = dimsRef.current;
        gridRef.current = initGrid(rows, cols);
        const g = gridRef.current;

        startRef.current = null; endRef.current = null;
        updateMarkers(); // hide until we set positions

        if (modeRef.current === 'custom') {
            cycleStartRef.current = performance.now();
            tick(ctx);
            return;
        }

        // Normal (auto/fixed): carve
        carveMazeBinary(g);

        // Reveal
        const lastRevealDelay = scheduleMazeRevealNoOverlap(g);

        const { s, e } = chooseStartEnd(g);
        startRef.current = s;
        endRef.current = e;
        updateMarkers();

        // Paint start/end with pulses
        paintEventsRef.current.push({ at: lastRevealDelay + 200 / speedRef.current, r: s.r, c: s.c, color: START });
        scaleEventsRef.current.push({ at: lastRevealDelay + 200 / speedRef.current, r: s.r, c: s.c, kind: 'in' });
        paintEventsRef.current.push({ at: lastRevealDelay + 200 / speedRef.current, r: e.r, c: e.c, color: END });
        scaleEventsRef.current.push({ at: lastRevealDelay + 200 / speedRef.current, r: e.r, c: e.c, kind: 'in' });

        const doneAt = runAStarWithTimeline(g, s, e, lastRevealDelay + 300 / speedRef.current);

        // Fade bands then sentinel
        const fadeDoneAt = scheduleResetFadeBandsTopToBottom(g, doneAt + TIME.current.AFTER_PATH_PAUSE_MS);
        paintEventsRef.current.push({ at: fadeDoneAt + 50 / speedRef.current, r: 0, c: 0, color: EMPTY });

        finalizeSchedules();
        cycleStartRef.current = performance.now();
        tick(ctx);
    };

    const stopCycle = () => {
        runningRef.current = false;
        clearTimeline();
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
    };

    const tick = (ctx: CanvasRenderingContext2D) => {
        if (!runningRef.current) return;

        const now = performance.now();
        const elapsed = now - cycleStartRef.current;

        applyDueEvents(gridRef.current, elapsed);
        render(ctx, gridRef.current, dimsRef.current.cell, elapsed);

        const blocksDone = blockCursorRef.current >= blockEventsRef.current.length;
        const paintsDone = paintCursorRef.current >= paintEventsRef.current.length;
        const scalesDone = scaleCursorRef.current >= scaleEventsRef.current.length;

        if (blocksDone && paintsDone && scalesDone) {
            if (modeRef.current !== 'custom') {
                setTimeout(() => { if (!ctxRef.current) return; startCycle(ctxRef.current); }, 0);
            } else {
                rafRef.current = requestAnimationFrame(() => tick(ctx));
            }
            return;
        }

        rafRef.current = requestAnimationFrame(() => tick(ctx));
    };

    /** Lifecycle mount */
    useEffect(() => {
        const container = containerRef.current!;
        const canvas = canvasRef.current!;

        const resize = () => {
            const rect = container.getBoundingClientRect();
            const ctx = sizeCanvas(canvas, rect.width, rect.height);
            ctxRef.current = ctx;
            updateMarkers(); // reposition to viewport
            return ctx;
        };

        let ctx = resize();

        const ro = new ResizeObserver(() => {
            ctx = resize();
            stopCycle();
            startCycle(ctx);
        });
        ro.observe(container);

        const io = new IntersectionObserver(
            (entries) => {
                const vis = entries[0]?.isIntersecting ?? true;
                visibleRef.current = vis;
                if (vis) {
                    ctx = resize();
                    stopCycle();
                    startCycle(ctx);
                } else {
                    stopCycle();
                }
            },
            { root: null, threshold: 0.05 }
        );
        io.observe(container);

        // Pointer interactions for custom mode
        const onPointerDown = (e: PointerEvent) => {
            if (modeRef.current !== 'custom') return;
            const { r, c, idx } = toCellRC(e);
            const g = gridRef.current;

            if (!customStartRef.current) {
                setCustomStart(r, c);
            } else if (!customEndRef.current) {
                setCustomEnd(r, c);
            } else {
                drawingWallsRef.current = true;
                drawWallAt(r, c);
                lastDrawIdxRef.current = idx;
            }
            if (ctxRef.current) render(ctxRef.current, g, dimsRef.current.cell, performance.now() - cycleStartRef.current);
            canvas.setPointerCapture(e.pointerId);
        };
        const onPointerMove = (e: PointerEvent) => {
            if (modeRef.current !== 'custom' || !drawingWallsRef.current) return;
            const { r, c, idx } = toCellRC(e);
            if (lastDrawIdxRef.current === idx) return;
            drawWallAt(r, c);
            lastDrawIdxRef.current = idx;
            if (ctxRef.current) render(ctxRef.current, gridRef.current, dimsRef.current.cell, performance.now() - cycleStartRef.current);
        };
        const onPointerUp = (e: PointerEvent) => {
            if (modeRef.current !== 'custom') return;
            drawingWallsRef.current = false;
            lastDrawIdxRef.current = null;
            try { canvas.releasePointerCapture(e.pointerId); } catch { }
        };
        const onPointerLeave = () => {
            drawingWallsRef.current = false;
            lastDrawIdxRef.current = null;
        };
        const onContextMenu = (e: MouseEvent) => {
            if (modeRef.current === 'custom') e.preventDefault();
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerLeave);
        canvas.addEventListener('contextmenu', onContextMenu);

        // initial start
        startCycle(ctx);

        return () => {
            ro.disconnect();
            io.disconnect();
            stopCycle();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('contextmenu', onContextMenu);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Respond to external prop changes */
    useEffect(() => {
        modeRef.current = mode;
        if (ctxRef.current) { stopCycle(); startCycle(ctxRef.current); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        speedRef.current = speedMultiplier || 1;
        if (ctxRef.current) { stopCycle(); startCycle(ctxRef.current); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speedMultiplier]);

    useEffect(() => {
        if (ctxRef.current && modeRef.current !== 'auto') {
            stopCycle();
            startCycle(ctxRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fixedCellSizePx]);

    useEffect(() => {
        if (!ctxRef.current) return;
        stopCycle();
        startCycle(ctxRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetCounter]);

    /** Custom control signals */
    const prevCustomStart = useRef(customSignals.startCounter);
    const prevCustomReset = useRef(customSignals.resetCounter);

    useEffect(() => {
        if (modeRef.current !== 'custom') { prevCustomStart.current = customSignals.startCounter; return; }
        if (customSignals.startCounter !== prevCustomStart.current) {
            prevCustomStart.current = customSignals.startCounter;

            if (customStartRef.current && customEndRef.current) {
                clearTimeline();
                const { rows, cols } = dimsRef.current;
                const g = gridRef.current;
                activeCellsRef.current.clear();
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cell = g[r][c];
                        if (customStartRef.current && r === customStartRef.current.r && c === customStartRef.current.c) {
                            cell.wall = false; cell.color = START; cell.scaleInStart = performance.now() - cycleStartRef.current;
                            addActive(rows, cols, r, c);
                            startRef.current = { r, c };
                            continue;
                        }
                        if (customEndRef.current && r === customEndRef.current.r && c === customEndRef.current.c) {
                            cell.wall = false; cell.color = END; cell.scaleInStart = performance.now() - cycleStartRef.current;
                            addActive(rows, cols, r, c);
                            endRef.current = { r, c };
                            continue;
                        }
                        if (cell.wall) { cell.color = WALL; addActive(rows, cols, r, c); }
                        else { cell.color = EMPTY; removeActive(rows, cols, r, c); }
                        cell.scaleOutStart = -1;
                    }
                }
                updateMarkers();

                runAStarWithTimeline(g, customStartRef.current, customEndRef.current, 0);
                finalizeSchedules();
                cycleStartRef.current = performance.now();
                if (ctxRef.current) tick(ctxRef.current);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customSignals.startCounter, mode]);

    useEffect(() => {
        if (modeRef.current !== 'custom') { prevCustomReset.current = customSignals.resetCounter; return; }
        if (customSignals.resetCounter !== prevCustomReset.current) {
            prevCustomReset.current = customSignals.resetCounter;
            clearTimeline();
            clearCustomGrid();
            if (ctxRef.current) { cycleStartRef.current = performance.now(); tick(ctxRef.current); }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customSignals.resetCounter, mode]);

    /** Hint overlay trigger */
    const prevHint = useRef(hintCounter);
    useEffect(() => {
        if (hintCounter !== prevHint.current) {
            prevHint.current = hintCounter;
            // show for ~2000ms in the canvas timeline
            const elapsed = performance.now() - cycleStartRef.current;
            hintUntilMsRef.current = elapsed + 2000;
        }
    }, [hintCounter]);

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: heightPx ? `${heightPx}px` : '100%', position: 'relative' }}
        >
            {/* Canvas */}
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block', cursor: mode === 'custom' ? 'crosshair' : 'default' }}
            />

            {/* Overlay markers (fixed, above everything; only visible on XL/XXL) */}
            <div className="pf-overlay" aria-hidden>
                <Popover content="Start" placement="top" trigger={['hover', 'click']}>
                    <div ref={startMarkerRef} className="pf-marker start" />
                </Popover>
                <Popover content="End" placement="top" trigger={['hover', 'click']}>
                    <div ref={endMarkerRef} className="pf-marker end" />
                </Popover>
            </div>
        </div>
    );
};

export default PathfinderCanvas;
