// src/pages/landing/components/ScanBeamViz.tsx
import React, { useEffect, useRef } from 'react';
import { ScanBeam, Point } from '../../../types';
import { PathManager } from '../utils/path';
import { drawPathSegment } from '../utils/canvasDrawing';
import { STREAM_LINE_WIDTH } from '../utils/constants';

/**
 * Canvas renderer for OCR→Network beams.
 * Uses document-anchored points (when provided) to rebuild the
 * path every frame into viewport coordinates, so scrolling never breaks alignment.
 *
 * Phases:
 *  1) Travel: head advances toward the target while tail lags.
 *  2) Tail‑chase: once head reaches target (and onFinished fires), the tail
 *     continues advancing until it reaches the target as well.
 * Cleanup occurs when tail reaches the end (plus a small fade during the last stretch).
 */
interface Props {
    beams: ScanBeam[];
    containerSize: { width: number; height: number };
    onBeamFinished?: (id: string) => void;
}

// Entirely colored; how much of the *visible* segment (tail→head) is drawn.
const COLORED_PORTION_RATIO = 0.5; // 50% of the visible segment

const ScanBeamViz: React.FC<Props> = ({ beams, containerSize, onBeamFinished }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const beamsRef = useRef<ScanBeam[]>([]);
    const rafRef = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);

    // Track "head reached target" and timestamp for a tiny fallback timeout
    const reachedRef = useRef<Set<string>>(new Set());
    const reachedAtRef = useRef<Map<string, number>>(new Map());

    useEffect(() => { beamsRef.current = beams; }, [beams]);

    // HiDPI handling
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(containerSize.width * dpr));
        canvas.height = Math.max(1, Math.floor(containerSize.height * dpr));
        canvas.style.width = `${containerSize.width}px`;
        canvas.style.height = `${containerSize.height}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }, [containerSize.width, containerSize.height]);

    // Rebuild scroll‑safe path from document points → viewport coordinates (if provided)
    const rebuildPath = (b: ScanBeam): PathManager | null => {
        const bb = b as any; // allow optional doc points without TS changes
        if (bb.docOrigin && bb.docElbow && bb.docTarget) {
            const sx = window.scrollX || 0;
            const sy = window.scrollY || 0;
            const p0: Point = { x: bb.docOrigin.x - sx, y: bb.docOrigin.y - sy };
            const p1: Point = { x: bb.docElbow.x - sx, y: bb.docElbow.y - sy };
            const p2: Point = { x: bb.docTarget.x - sx, y: bb.docTarget.y - sy };
            return new PathManager(p0, p1, p2, bb.arcRadius ?? 56);
        }
        return b.path ?? null;
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Motion params
        const HEAD_SPEED_PX = 900;                // px/sec
        const TAIL_LAG_PX = 300;                  // visible trail during travel
        const TAIL_CHASE_SPEED_PX = 1050;         // px/sec after head reached target
        const FAILSAFE_REMOVE_MS = 1800;          // fallback removal after connect

        const loop = (ts: number) => {
            const last = lastTsRef.current ?? ts;
            const dt = Math.min(64, ts - last);
            lastTsRef.current = ts;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const toRemove: string[] = [];

            for (const b of beamsRef.current) {
                const path = rebuildPath(b);
                if (!path || path.totalLength <= 0) continue;

                const total = path.totalLength;
                const headPxPrev = b.headProgress * total;
                const tailPxPrev = b.tailProgress * total;

                // --- advance head
                let headPx = headPxPrev + (HEAD_SPEED_PX * dt) / 1000;
                if (headPx >= total) {
                    headPx = total;
                    if (!reachedRef.current.has(b.id)) {
                        reachedRef.current.add(b.id);
                        reachedAtRef.current.set(b.id, ts);
                        // Fire the network wave now
                        b.onFinished?.();
                    }
                }

                // --- advance tail
                let tailPx: number;
                if (!reachedRef.current.has(b.id)) {
                    // Phase 1: maintain a trailing segment behind the moving head
                    const desiredTailPx = Math.max(0, headPx - TAIL_LAG_PX);
                    tailPx = Math.max(tailPxPrev, desiredTailPx);
                } else {
                    // Phase 2: chase to the end at its own speed until fully gone
                    tailPx = Math.min(total, tailPxPrev + (TAIL_CHASE_SPEED_PX * dt) / 1000);
                    // Soft fade in the final stretch
                    const fadeStart = total * 0.85;
                    if (tailPx >= fadeStart) {
                        const t = (tailPx - fadeStart) / (total - fadeStart || 1);
                        b.alpha = 1 - Math.min(1, t);
                    }
                }

                // Persist normalized progress
                b.headProgress = total ? headPx / total : 1;
                b.tailProgress = total ? tailPx / total : 1;

                // --- draw ONLY the colored front portion (50%) of the visible segment
                const segStart = b.tailProgress * total;
                const segEnd = b.headProgress * total;
                if (segEnd > segStart) {
                    const visibleLen = segEnd - segStart;
                    const coloredLen = visibleLen * COLORED_PORTION_RATIO; // 50%
                    const coloredStart = Math.max(segStart, segEnd - coloredLen);

                    const pStart = path.getPointAt(coloredStart);
                    const pEnd = path.getPointAt(segEnd);

                    // Pure gradient (no grey anywhere)
                    const grad = ctx.createLinearGradient(pStart.x, pStart.y, pEnd.x, pEnd.y);
                    const colors = b.gradientSet;
                    const n = Math.max(2, colors.length);
                    for (let i = 0; i < n; i++) {
                        const t = i / (n - 1);
                        grad.addColorStop(t, colors[Math.min(i, colors.length - 1)]);
                    }

                    ctx.save();
                    ctx.globalAlpha = Math.max(0, Math.min(1, b.alpha ?? 1));
                    drawPathSegment(ctx, path, coloredStart, segEnd, grad, STREAM_LINE_WIDTH);
                    ctx.restore();
                }

                // --- removal rules
                if (b.tailProgress >= 1) {
                    toRemove.push(b.id);
                } else if (reachedRef.current.has(b.id)) {
                    const at = reachedAtRef.current.get(b.id) ?? ts;
                    if (ts - at > FAILSAFE_REMOVE_MS) {
                        toRemove.push(b.id);
                    }
                }
            }

            // Clean up & notify
            if (toRemove.length && onBeamFinished) {
                toRemove.forEach((id) => {
                    reachedRef.current.delete(id);
                    reachedAtRef.current.delete(id);
                    onBeamFinished(id);
                });
            }

            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            lastTsRef.current = null;
            reachedRef.current.clear();
            reachedAtRef.current.clear();
        };
    }, [onBeamFinished]);

    return (
        <canvas
            ref={canvasRef}
            className="character-stream-canvas"
            width={containerSize.width}
            height={containerSize.height}
            aria-hidden
        />
    );
};

export default ScanBeamViz;
