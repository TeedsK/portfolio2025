// src/pages/landing/visuals/PathfinderCanvas.tsx
import React, { useEffect, useRef } from 'react';
import { PriorityQueue } from './structures/PriorityQueue';

/**
 * === Visual Style (preserved from your original) ===
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

/** Timings (matching the cadence of your legacy flow) */
const DELAY_PER_ITERATION_MS = 10;
const PULSE_STEP_MS = 150;
const NEIGH_REVEAL_TO_WHITE_MS = 160;
const BEST_PATH_STEP_MS = 20;
const AFTER_PATH_PAUSE_MS = 1000;

/** Child-like scale animations (mirror GSAP "size_animation") */
const SCALE_IN_MS = 250;
const SCALE_OUT_MS = 250;

/** Maze reveal block size and pacing */
const REVEAL_BLOCK = 10;
const REVEAL_RING_DELAY_MS = 50;
const REVEAL_SECTION_DELAY_MS = 24;  // inner per-section stagger (left→right or right→left)

/** Reset fade bands: multiple rows at once with a slight delay between bands */
const RESET_BAND_ROWS = 4;
const RESET_BAND_DELAY_MS = 60;

/** Utility + easing */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;

type PaintEvent = {
    at: number;
    r: number;
    c: number;
    color: string;
};

type ScaleEvent = {
    at: number;
    r: number;
    c: number;
    kind: 'in' | 'out';
};

type GridCell = {
    wall: boolean;
    color: string;           // last painted color
    scaleInStart: number;    // -1 if none
    scaleOutStart: number;   // -1 if none
};

type Props = {
    heightPx: number;
};

const PathfinderCanvas: React.FC<Props> = ({ heightPx }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const rafRef = useRef<number | null>(null);
    const cycleStartRef = useRef<number>(0);
    const paintEventsRef = useRef<PaintEvent[]>([]);
    const scaleEventsRef = useRef<ScaleEvent[]>([]);
    const gridRef = useRef<GridCell[][]>([]);
    const dimsRef = useRef({ rows: 0, cols: 0, cell: 14, width: 0, height: 0 });

    const runningRef = useRef(false);
    const visibleRef = useRef(true);

    /** Keep END position for overlay (always on top) */
    const endRef = useRef<{ r: number; c: number } | null>(null);

    /** Clear event queues */
    const clearTimeline = () => {
        paintEventsRef.current = [];
        scaleEventsRef.current = [];
    };

    /** DPR-aware canvas sizing */
    const sizeCanvas = (canvas: HTMLCanvasElement, wCss: number, hCss: number) => {
        const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        canvas.width = Math.max(1, Math.floor(wCss * dpr));
        canvas.height = Math.max(1, Math.floor(hCss * dpr));
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        (ctx as any).imageSmoothingEnabled = false;
        return ctx;
    };

    /** Compute grid geometry from container size */
    const computeGridDims = (wrapWidth: number, wrapHeight: number) => {
        const desktop = window.matchMedia('(min-width: 1200px)').matches;
        const tilePx = desktop ? window.innerWidth * 0.009 : window.innerWidth * 0.02; // ~0.9vw / 2vw
        const cell = clamp(Math.floor(tilePx), 8, 20);
        const cols = Math.max(20, Math.ceil(wrapWidth / cell));
        const rows = Math.max(20, Math.ceil(wrapHeight / cell));
        return { rows, cols, cell, width: wrapWidth, height: wrapHeight };
    };

    /** Init grid cells */
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

    /**
     * Force **multiple, well-distributed openings on the very bottom row**:
     *  - corners are always walled (no stray bottom-left square),
     *  - prefer openings where the cell above is already a corridor,
     *  - otherwise, place openings uniformly across internal columns,
     *  - ensure at least a small number of exits for visual balance.
     */
    const ensureBottomRowOpenings = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const bottom = rows - 1;

        // Seal the full bottom row first (including corners)…
        for (let c = 0; c < cols; c++) g[bottom][c].wall = true;

        // Candidate columns (internal only)
        const internal = Array.from({ length: cols - 2 }, (_, i) => i + 1);

        // Prefer columns that line up with corridors above
        const corridorCols = internal.filter(c => !g[bottom - 1][c].wall);

        // If none, prefer odd columns to match grid rhythm
        const fallback = internal.filter(c => (c & 1) === 1);
        const candidates = corridorCols.length ? corridorCols : (fallback.length ? fallback : internal);

        // Target K uniformly spaced openings
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

        // Apply and (optionally) punch the cell above to guarantee connectivity
        const chosen = new Set<number>();
        for (const c of picks) {
            const cc = clamp(c, 1, cols - 2);
            chosen.add(cc);
            g[bottom][cc].wall = false;
            if (g[bottom - 1][cc].wall) g[bottom - 1][cc].wall = false;
        }

        // Safety: ensure at least two exits at quartiles if the set is too small
        if (chosen.size < 2 && cols >= 12) {
            const q1 = clamp(Math.floor(cols / 4), 1, cols - 2);
            const q3 = clamp(Math.floor((3 * cols) / 4), 1, cols - 2);
            chosen.add(q1);
            chosen.add(q3);
            g[bottom][q1].wall = false; if (g[bottom - 1][q1].wall) g[bottom - 1][q1].wall = false;
            g[bottom][q3].wall = false; if (g[bottom - 1][q3].wall) g[bottom - 1][q3].wall = false;
        }
    };

    /** Build a binary-tree-ish maze, then fix the bottom row openings. */
    const carveMazeBinary = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;

        for (let i = 0; i < rows - 2; i += 2) {
            for (let x = 0; x < cols - 2; x += 2) {
                const pts: [number, number][] = [
                    [i, x],
                    [i + 2, x + 1],
                    [i + 1, x + 2],
                    [i, x + 2],
                    [i + 2, x],
                    [i + 2, x + 2],
                ];
                for (const [r, c] of pts) {
                    if (r >= 0 && r < rows && c >= 0 && c < cols) {
                        g[r][c].wall = true;
                    }
                }

                const ran = Math.random();
                if (ran < 0.444) {
                    // West opening
                    if (i + 1 < rows && x >= 0) g[i + 1][x].wall = false;
                } else if (ran < 0.85) {
                    // North opening
                    if (i >= 0 && x + 1 < cols) g[i][x + 1].wall = false;
                } else {
                    if (i + 1 < rows && x >= 0) g[i + 1][x].wall = false;
                    if (i >= 0 && x + 1 < cols) g[i][x + 1].wall = false;
                }
            }
        }

        // Make sure the very bottom row is not a solid wall (and no corner hole).
        ensureBottomRowOpenings(g);
    };

    /**
     * Maze reveal: two waves (top→mid and bottom→mid), no overlap.
     * Each wave progresses section-by-section within its band:
     *  - TOP wave reveals left→right
     *  - BOTTOM wave reveals right→left
     * A center gap (if present) is filled once, left→right.
     * Finally, a **coverage pass** ensures every tile has been painted at least once
     * (prevents any “missing chunk” like the bottom-left artifact).
     */
    const scheduleMazeRevealNoOverlap = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const mid = Math.floor(rows / 2);

        let baseDelay = 0;
        let lastScheduledAt = 0;

        const scheduleBlockClamped = (
            r0: number, c0: number, sizeCols: number, sizeRows: number, at: number
        ) => {
            for (let dr = 0; dr < sizeRows; dr++) {
                const r = r0 + dr;
                if (r < 0 || r >= rows) break;
                for (let dc = 0; dc < sizeCols; dc++) {
                    const c = c0 + dc;
                    if (c < 0 || c >= cols) break;
                    if (g[r][c].wall) {
                        paintEventsRef.current.push({ at, r, c, color: WALL });
                        scaleEventsRef.current.push({ at, r, c, kind: 'in' });
                    } else {
                        paintEventsRef.current.push({ at, r, c, color: EMPTY });
                    }
                    if (at > lastScheduledAt) lastScheduledAt = at;
                }
            }
        };

        const scheduleRowBandDirectional = (
            rowStart: number,
            rowLimitExclusive: number,
            bandBaseAt: number,
            dir: 'ltr' | 'rtl'
        ) => {
            const rowsHigh = Math.min(REVEAL_BLOCK, rowLimitExclusive - rowStart);
            if (rowsHigh <= 0) return bandBaseAt;

            let at = bandBaseAt;
            if (dir === 'ltr') {
                for (let j = 0; j < cols; j += REVEAL_BLOCK) {
                    scheduleBlockClamped(rowStart, j, REVEAL_BLOCK, rowsHigh, at);
                    at += REVEAL_SECTION_DELAY_MS;
                }
            } else {
                for (let j = cols - REVEAL_BLOCK; j >= 0; j -= REVEAL_BLOCK) {
                    scheduleBlockClamped(rowStart, j, REVEAL_BLOCK, rowsHigh, at);
                    at += REVEAL_SECTION_DELAY_MS;
                }
            }
            return at;
        };

        // Build arrays of band starts
        const topStarts: number[] = [];
        for (let i = 0; i < mid; i += REVEAL_BLOCK) topStarts.push(i);
        const bottomStarts: number[] = [];
        for (let i = rows - REVEAL_BLOCK; i >= mid; i -= REVEAL_BLOCK) bottomStarts.push(i);

        const maxRings = Math.max(topStarts.length, bottomStarts.length);

        for (let ring = 0; ring < maxRings; ring++) {
            if (ring < topStarts.length) {
                scheduleRowBandDirectional(topStarts[ring], mid, baseDelay, 'ltr');
            }
            if (ring < bottomStarts.length) {
                scheduleRowBandDirectional(bottomStarts[ring], rows, baseDelay, 'rtl');
            }
            baseDelay += REVEAL_RING_DELAY_MS;
        }

        // Center gap fill (if any), left→right, once
        const topLastEnd = topStarts.length
            ? Math.min(mid - 1, topStarts[topStarts.length - 1] + REVEAL_BLOCK - 1)
            : -1;
        const bottomClosestStart = bottomStarts.length
            ? bottomStarts[bottomStarts.length - 1]
            : rows;

        const gapStart = topLastEnd + 1;
        const gapEnd = bottomClosestStart - 1;

        if (gapStart <= gapEnd) {
            let at = baseDelay;
            for (let r = gapStart; r <= gapEnd; r += REVEAL_BLOCK) {
                const rowsHigh = Math.min(REVEAL_BLOCK, gapEnd - r + 1);
                for (let j = 0; j < cols; j += REVEAL_BLOCK) {
                    scheduleBlockClamped(r, j, REVEAL_BLOCK, rowsHigh, at);
                    at += REVEAL_SECTION_DELAY_MS;
                }
                baseDelay += REVEAL_RING_DELAY_MS;
            }
        }

        // Final coverage pass (very small extra cost, removes the rare “missing band” artifact)
        const coverageAt = Math.max(lastScheduledAt, baseDelay) + 10;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                paintEventsRef.current.push({
                    at: coverageAt,
                    r, c,
                    color: g[r][c].wall ? WALL : EMPTY
                });
            }
        }

        return coverageAt;
    };

    const manhattan = (r1: number, c1: number, r2: number, c2: number) =>
        Math.abs(r1 - r2) + Math.abs(c1 - c2);

    /** Place start/end similar to your original logic */
    const chooseStartEnd = (g: GridCell[][]) => {
        const rows = g.length;
        const cols = g[0].length;
        const randBetween = (min: number, max: number) =>
            Math.floor(Math.random() * (max - min + 1)) + min;

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

    /** Neighbor reveal: brief color then back to white, with a small pulse on reveal */
    const scheduleNeighborReveal = (at: number, r: number, c: number) => {
        paintEventsRef.current.push({ at, r, c, color: SEARCHED_1 });
        scaleEventsRef.current.push({ at, r, c, kind: 'in' });
        paintEventsRef.current.push({ at: at + NEIGH_REVEAL_TO_WHITE_MS, r, c, color: TO_SEARCH });
    };

    /** Visited pulse sequence */
    const schedulePulse = (base: number, r: number, c: number) => {
        paintEventsRef.current.push({ at: base, r, c, color: SEARCHED_1 });
        scaleEventsRef.current.push({ at: base, r, c, kind: 'in' });
        SEARCH_SEQUENCE.slice(1).forEach((color, idx) => {
            paintEventsRef.current.push({ at: base + (idx + 1) * PULSE_STEP_MS, r, c, color });
        });
    };

    /** Path glow; return the true last paint time */
    const scheduleBestPath = (startAt: number, path: { r: number; c: number }[]) => {
        let t = startAt;
        let lastPaintAt = startAt;
        for (const p of path) {
            const a1 = t;
            const a2 = t + 160;
            paintEventsRef.current.push({ at: a1, r: p.r, c: p.c, color: BEST_PATH_1 });
            scaleEventsRef.current.push({ at: a1, r: p.r, c: p.c, kind: 'in' });
            paintEventsRef.current.push({ at: a2, r: p.r, c: p.c, color: BEST_PATH_2 });
            lastPaintAt = Math.max(lastPaintAt, a2);
            t += BEST_PATH_STEP_MS;
        }
        return lastPaintAt;
    };

    /** Reset fade: multiple-row bands from top to bottom, overlapping in time */
    const scheduleResetFadeBandsTopToBottom = (g: GridCell[][], startAt: number) => {
        const rows = g.length;
        const cols = g[0].length;

        let bandIndex = 0;
        for (let r0 = 0; r0 < rows; r0 += RESET_BAND_ROWS) {
            const at = startAt + bandIndex * RESET_BAND_DELAY_MS;
            const rEnd = Math.min(rows, r0 + RESET_BAND_ROWS);
            for (let r = r0; r < rEnd; r++) {
                for (let c = 0; c < cols; c++) {
                    scaleEventsRef.current.push({ at, r, c, kind: 'out' });
                    paintEventsRef.current.push({ at: at + SCALE_OUT_MS, r, c, color: EMPTY });
                }
            }
            bandIndex++;
        }
        return startAt + (Math.max(0, Math.ceil(rows / RESET_BAND_ROWS) - 1)) * RESET_BAND_DELAY_MS + SCALE_OUT_MS;
    };

    /** A* with scheduled animation events */
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
            searchingDelay += DELAY_PER_ITERATION_MS;
            const curTuple = pq.pop()!;
            const current = curTuple[2];
            const { r: cr, c: cc } = fromIdx(current);

            if (current !== start) schedulePulse(startDelayMs + searchingDelay, cr, cc);

            if (current === goal) {
                // Reconstruct best path
                const path: { r: number; c: number }[] = [];
                let cur = current;
                while (cur !== -1 && cur !== start) {
                    path.push(fromIdx(cur));
                    cur = parent[cur];
                }

                // Path glow and END repaint-on-top
                const lastPathPaintAt = scheduleBestPath(startDelayMs + searchingDelay + 500, path.reverse());
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

        // No path
        return startDelayMs + searchingDelay + 400;
    };

    /** === Rendering with no gutters & scale pulses; END drawn last as overlay === */
    const render = (ctx: CanvasRenderingContext2D, g: GridCell[][], cell: number, elapsedMs: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, dimsRef.current.width, dimsRef.current.height);

        const rows = g.length, cols = g[0].length;

        for (let r = 0; r < rows; r++) {
            const y = r * cell;
            for (let c = 0; c < cols; c++) {
                const x = c * cell;
                const gc = g[r][c];
                const baseColor = gc.color;

                if (baseColor === EMPTY) continue;

                let scale = 1;
                const inStart = gc.scaleInStart;
                const outStart = gc.scaleOutStart;

                if (outStart >= 0 && (inStart < 0 || outStart >= inStart)) {
                    const t = clamp((elapsedMs - outStart) / SCALE_OUT_MS, 0, 1);
                    scale = clamp(1 - easeInCubic(t), 0, 1);
                } else if (inStart >= 0) {
                    const t = clamp((elapsedMs - inStart) / SCALE_IN_MS, 0, 1);
                    scale = clamp(easeOutCubic(t), 0, 1);
                }

                const w = cell * scale;
                const h = cell * scale;
                const cx = x + (cell - w) / 2;
                const cy = y + (cell - h) / 2;

                ctx.fillStyle = baseColor;
                ctx.fillRect(Math.round(cx), Math.round(cy), Math.ceil(w), Math.ceil(h));
            }
        }

        // END overlay — always on top
        if (endRef.current) {
            const { r: er, c: ec } = endRef.current;
            if (er >= 0 && er < rows && ec >= 0 && ec < cols) {
                const gcEnd = g[er][ec];
                let endScale = 1;
                if (gcEnd.scaleOutStart >= 0 && (gcEnd.scaleInStart < 0 || gcEnd.scaleOutStart >= gcEnd.scaleInStart)) {
                    const t = clamp((elapsedMs - gcEnd.scaleOutStart) / SCALE_OUT_MS, 0, 1);
                    endScale = clamp(1 - easeInCubic(t), 0, 1);
                } else if (gcEnd.scaleInStart >= 0) {
                    const t = clamp((elapsedMs - gcEnd.scaleInStart) / SCALE_IN_MS, 0, 1);
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
        }
    };

    /** Apply paint and scale events that are due */
    const applyDueEvents = (g: GridCell[][], elapsedMs: number) => {
        const pe = paintEventsRef.current;
        let i = 0;
        while (i < pe.length) {
            const ev = pe[i];
            if (ev.at <= elapsedMs) {
                g[ev.r][ev.c].color = ev.color;
                if (ev.color === EMPTY) g[ev.r][ev.c].scaleInStart = -1;
                pe.splice(i, 1);
            } else i++;
        }

        const se = scaleEventsRef.current;
        let j = 0;
        while (j < se.length) {
            const ev = se[j];
            if (ev.at <= elapsedMs) {
                if (ev.kind === 'in') {
                    g[ev.r][ev.c].scaleInStart = ev.at;
                    g[ev.r][ev.c].scaleOutStart = -1;
                } else {
                    g[ev.r][ev.c].scaleOutStart = ev.at;
                }
                se.splice(j, 1);
            } else j++;
        }
    };

    /** Begin one full cycle: reveal -> A* -> pause -> reset fade -> restart */
    const startCycle = (ctx: CanvasRenderingContext2D) => {
        if (!visibleRef.current) return;
        runningRef.current = true;
        clearTimeline();

        const { rows, cols } = dimsRef.current;
        gridRef.current = initGrid(rows, cols);
        const g = gridRef.current;

        carveMazeBinary(g);

        const lastRevealDelay = scheduleMazeRevealNoOverlap(g);

        const { s, e } = chooseStartEnd(g);
        endRef.current = e; // overlay needs this

        // Paint start/end and pulse them in
        paintEventsRef.current.push({ at: lastRevealDelay + 200, r: s.r, c: s.c, color: START });
        scaleEventsRef.current.push({ at: lastRevealDelay + 200, r: s.r, c: s.c, kind: 'in' });
        paintEventsRef.current.push({ at: lastRevealDelay + 200, r: e.r, c: e.c, color: END });
        scaleEventsRef.current.push({ at: lastRevealDelay + 200, r: e.r, c: e.c, kind: 'in' });

        const doneAt = runAStarWithTimeline(g, s, e, lastRevealDelay + 300);

        // After a short pause, fade out in multi-row bands, then restart
        const fadeDoneAt = scheduleResetFadeBandsTopToBottom(g, doneAt + AFTER_PATH_PAUSE_MS);

        // Sentinel to restart after fade completes
        paintEventsRef.current.push({ at: fadeDoneAt + 50, r: 0, c: 0, color: EMPTY });

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

        if (paintEventsRef.current.length === 0 && scaleEventsRef.current.length === 0) {
            startCycle(ctx);
            return;
        }

        rafRef.current = requestAnimationFrame(() => tick(ctx));
    };

    /** Lifecycle */
    useEffect(() => {
        const container = containerRef.current!;
        const canvas = canvasRef.current!;

        const resize = () => {
            const rect = container.getBoundingClientRect();
            const ctx = sizeCanvas(canvas, rect.width, rect.height);
            dimsRef.current = computeGridDims(rect.width, rect.height);
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

        // initial start
        startCycle(ctx);

        return () => {
            ro.disconnect();
            io.disconnect();
            stopCycle();
        };
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: `${heightPx}px` }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
    );
};

export default PathfinderCanvas;
