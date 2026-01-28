// src/pages/landing/components/NetworkGraphViz.tsx
import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { ActivationDataValue, AnimationWave, Point } from '../../../types';
import gsap from 'gsap';
import {
    NET_NODE_PULSE_DURATION,
    NET_LAYER_ANIMATION_DELAY,
    NET_ALPHA_PREDICTED_LINE,
    NET_ALPHA_OTHER_ACTIVE_MIN,
    NET_ALPHA_OTHER_ACTIVE_MAX,
    NET_ALPHA_INACTIVE_LINE,
} from '../utils/animation';
import { drawPathSegment } from '../utils/canvasDrawing';
import { shouldRunLandingAnimations } from '../utils/landingAnimationGate';

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const COLOR_DEFAULT_LINE = '#DDDDDD';
const COLOR_NODE_FILL = '#ffffff';
const COLOR_OUTPUT_TEXT = '#333333';

// Smaller, smoother styling (already thinned in your last step)
const NODE_RADIUS = 5;
const LINE_INACTIVE_STROKE_WIDTH = 0.5;
const LINE_ACTIVE_WIDTH = 1.4;

// How much of the skeleton to show (alpha)
const STATIC_LINE_ALPHA = 0.18;

const ACTIVATION_THRESHOLD = 0.5;
const MAX_NODES_TO_DRAW = 10;

const NET_LINE_GROW_DURATION = 0.3;
const NET_LINE_SHRINK_DURATION = 0.3;

interface NetworkGraphVizProps {
    waves: AnimationWave[];
    onWaveFinished: (waveId: string) => void;
    flattenLayerName: string;
    hiddenDenseLayerName: string;
    outputLayerName: string;
    width: number;
    height: number;
    centralConnectionPoint?: Point;
}

// ---- helpers (unchanged semantics) ----
const getSampledActivations = (
    data: ActivationDataValue | undefined | null,
    count: number,
): number[] => {
    if (!data || !Array.isArray(data)) return new Array(count).fill(0);
    const flatData = (data as any).flat(Infinity).filter((n: any) => typeof n === 'number') as number[];
    if (flatData.length === 0) return new Array(count).fill(0);
    const result: number[] = [];
    if (flatData.length <= count) {
        for (let i = 0; i < flatData.length; i++) result.push(Math.max(0, Math.min(1, flatData[i])));
        while (result.length < count) result.push(0);
    } else {
        const step = Math.floor(flatData.length / count);
        for (let i = 0; i < count; i++) result.push(Math.max(0, Math.min(1, flatData[i * step])));
    }
    return result;
};

const calculateNodePositions = (count: number, x: number, totalHeight: number, r: number): Point[] => {
    const available = totalHeight - r * 4;
    const yStep = count <= 1 ? available / 2 : available / (count - 1 || 1);
    const startY = r * 2;
    return Array.from({ length: count }).map((_el, i) => ({ x, y: startY + i * yStep }));
};

const dist = (p0: Point, p1: Point) => Math.hypot(p1.x - p0.x, p1.y - p0.y);

// ---- Static graph types ----
type StaticLine = { p0: Point; p1: Point; totalLength: number };
type StaticNode = { id: string; x: number; y: number; label?: string; layer: 'flatten' | 'hidden' | 'output' };

// ---- Overlay (animated) line for a wave ----
interface OverlayLine extends StaticLine {
    id: string;
    waveId: string;
    head: number;
    tail: number;
    gradientSet: string[];
    alpha: number; // display alpha for this overlay
}

export const NetworkGraphViz: React.FC<NetworkGraphVizProps> = ({
    waves,
    onWaveFinished,
    flattenLayerName,
    hiddenDenseLayerName,
    outputLayerName,
    width,
    height,
    centralConnectionPoint,
}) => {
    // Canvas
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Static graph (single source of truth)
    const staticLinesRef = useRef<{ cf: StaticLine[]; fh: StaticLine[]; ho: StaticLine[] }>({
        cf: [],
        fh: [],
        ho: [],
    });
    const staticNodesRef = useRef<StaticNode[]>([]);

    // Node visual state (shared, pulses update these values)
    const nodeStateRef = useRef<Record<string, { scale: number; stroke: string; alpha: number }>>({});

    // Active wave overlay lines
    const overlayLinesRef = useRef<OverlayLine[]>([]);

    // Manage active timelines per wave
    const activeTimelines = useRef(new Map<string, gsap.core.Timeline>()).current;

    // Manage entrance animation
    const entranceTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const hasAnimatedEntranceRef = useRef(false);

    // Central connector
    const centralPoint: Point = useMemo(() => {
        return (
            centralConnectionPoint ?? {
                x: Math.max(20, Math.floor(width * 0.15)),
                y: Math.floor(height / 2),
            }
        );
    }, [centralConnectionPoint, width, height]);

    // Layer X positions (responsive)
    const { flattenX, hiddenX, outputX } = useMemo(() => {
        const marginRight = Math.max(16, Math.floor(width * 0.04));
        const fx = Math.max(centralPoint.x + 50, 20);
        const remaining = Math.max(width - marginRight - fx, 100);
        const gap = remaining / 2;
        return {
            flattenX: fx,
            hiddenX: fx + gap,
            outputX: fx + 2 * gap,
        };
    }, [width, centralPoint.x]);

    // Node positions
    const flattenNodePositions = useMemo(
        () => calculateNodePositions(MAX_NODES_TO_DRAW, flattenX, height, NODE_RADIUS),
        [flattenX, height],
    );
    const hiddenNodePositions = useMemo(
        () => calculateNodePositions(MAX_NODES_TO_DRAW, hiddenX, height, NODE_RADIUS),
        [hiddenX, height],
    );
    const outputNodePositions = useMemo(
        () => calculateNodePositions(EMNIST_CHARS.length, outputX, height, NODE_RADIUS),
        [outputX, height],
    );

    // Build static graph once per geometry change
    useEffect(() => {
        // Kill any running wave animations – geometry changed
        activeTimelines.forEach((tl) => tl.kill());
        activeTimelines.clear();
        overlayLinesRef.current = [];

        // Kill entrance timeline if running
        if (entranceTimelineRef.current) {
            entranceTimelineRef.current.kill();
            entranceTimelineRef.current = null;
        }
        hasAnimatedEntranceRef.current = false;

        // Nodes
        const nodes: StaticNode[] = [];
        flattenNodePositions.forEach((p, i) => nodes.push({ id: `fl-${i}`, x: p.x, y: p.y, layer: 'flatten' }));
        hiddenNodePositions.forEach((p, i) => nodes.push({ id: `hd-${i}`, x: p.x, y: p.y, layer: 'hidden' }));
        outputNodePositions.forEach((p, i) =>
            nodes.push({ id: `out-${i}`, x: p.x, y: p.y, label: EMNIST_CHARS[i], layer: 'output' }),
        );
        staticNodesRef.current = nodes;

        // Node state defaults - start invisible for entrance animation
        const st: Record<string, { scale: number; stroke: string; alpha: number }> = {};
        nodes.forEach((n) => {
            st[n.id] = { scale: 0, stroke: '#d0d4db', alpha: 0 };
        });
        nodeStateRef.current = st;

        // Lines (center→flatten, flatten→hidden, hidden→output)
        const cf: StaticLine[] = flattenNodePositions.map((p) => ({
            p0: centralPoint,
            p1: p,
            totalLength: dist(centralPoint, p),
        }));

        const fh: StaticLine[] = [];
        flattenNodePositions.forEach((fp) => {
            hiddenNodePositions.forEach((hp) => {
                fh.push({ p0: fp, p1: hp, totalLength: dist(fp, hp) });
            });
        });

        const ho: StaticLine[] = [];
        hiddenNodePositions.forEach((hp) => {
            outputNodePositions.forEach((op) => {
                ho.push({ p0: hp, p1: op, totalLength: dist(hp, op) });
            });
        });

        staticLinesRef.current = { cf, fh, ho };

        // --- NEW: Trigger sequential build animation ---
        if (shouldRunLandingAnimations()) {
            const tl = gsap.timeline({
                onComplete: () => { hasAnimatedEntranceRef.current = true; }
            });
            entranceTimelineRef.current = tl;

            // Helper to animate a group of nodes
            const animateLayer = (layerIds: string[], delay: number) => {
                layerIds.forEach((id, i) => {
                    const nodeSt = nodeStateRef.current[id];
                    if (nodeSt) {
                        tl.to(nodeSt, {
                            scale: 1,
                            alpha: 1,
                            duration: 0.4,
                            ease: 'back.out(1.7)',
                        }, delay + (i * 0.03)); // Stagger within layer
                    }
                });
            };

            // 1. Flatten Layer (Input)
            const flatIds = nodes.filter(n => n.layer === 'flatten').map(n => n.id);
            animateLayer(flatIds, 0);

            // 2. Hidden Layer
            const hiddenIds = nodes.filter(n => n.layer === 'hidden').map(n => n.id);
            animateLayer(hiddenIds, 0.4);

            // 3. Output Layer
            const outputIds = nodes.filter(n => n.layer === 'output').map(n => n.id);
            animateLayer(outputIds, 0.8);
        } else {
            // If animations disabled/hidden, just set visible immediately
            Object.values(st).forEach(s => { s.scale = 1; s.alpha = 1; });
            hasAnimatedEntranceRef.current = true;
        }

    }, [
        activeTimelines,
        centralPoint.x,
        centralPoint.y,
        flattenNodePositions,
        hiddenNodePositions,
        outputNodePositions,
    ]);

    // Drawing
    const draw = useCallback(
        (ctx: CanvasRenderingContext2D) => {
            // Gate: if animations are not active, just clear and skip the draw
            if (!shouldRunLandingAnimations()) {
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                return;
            }

            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // 1) Static skeleton lines (thin, faint)
            // Use global alpha for skeleton lines based on average node visibility per layer to sync with node fade-in
            // Simply put: draw lines only if connected nodes are visible enough.
            // For simplicity/performance, we just draw them at fixed alpha, but we could gate them.
            // Let's stick to drawing them always but maybe modulated by a global "entrance" factor if we had one.
            // Since nodes scale up from 0, lines connecting to scale=0 nodes look weird if we draw them fully?
            // Actually, static lines are background. Let's draw them at STATIC_LINE_ALPHA.
            // To make it look "building", we can check if nodes have alpha > 0.

            ctx.globalAlpha = STATIC_LINE_ALPHA;
            ctx.lineWidth = LINE_INACTIVE_STROKE_WIDTH;
            ctx.strokeStyle = COLOR_DEFAULT_LINE;

            const { cf, fh, ho } = staticLinesRef.current;
            const ns = nodeStateRef.current;

            // Only draw lines if we have animated past the entrance or if nodes are visible
            // Heuristic: check alpha of first node in relevant layers
            const flatVisible = (ns['fl-0']?.alpha || 0) > 0.1;
            const hiddenVisible = (ns['hd-0']?.alpha || 0) > 0.1;
            const outputVisible = (ns['out-0']?.alpha || 0) > 0.1;

            const drawStaticList = (list: StaticLine[], condition: boolean) => {
                if (!condition) return;
                list.forEach((ln) => {
                    ctx.beginPath();
                    ctx.moveTo(ln.p0.x, ln.p0.y);
                    ctx.lineTo(ln.p1.x, ln.p1.y);
                    ctx.stroke();
                });
            };

            // cf lines connect center -> flatten. Draw when flatten is visible.
            drawStaticList(cf, flatVisible);
            // fh lines connect flatten -> hidden. Draw when hidden is visible.
            drawStaticList(fh, hiddenVisible);
            // ho lines connect hidden -> output. Draw when output is visible.
            drawStaticList(ho, outputVisible);

            // 2) Overlay animated segments (gradient + active width)
            ctx.globalAlpha = 1;
            overlayLinesRef.current.forEach((ln) => {
                if (ln.alpha <= 0.01) return;
                if (ln.head <= ln.tail) return;

                let stroke: string | CanvasGradient = ln.gradientSet[0] ?? '#888';
                const grad = ctx.createLinearGradient(ln.p0.x, ln.p0.y, ln.p1.x, ln.p1.y);
                ln.gradientSet.forEach((c, i) => {
                    grad.addColorStop(Math.min(1, i / (ln.gradientSet.length - 1 || 1)), c);
                });
                stroke = grad;

                drawPathSegment(
                    ctx,
                    { p0: ln.p0, p1: ln.p1, totalLength: ln.totalLength },
                    ln.tail * ln.totalLength,
                    ln.head * ln.totalLength,
                    stroke,
                    LINE_ACTIVE_WIDTH,
                );
            });

            // 3) Nodes (single set, re-used; scale from nodeState)
            staticNodesRef.current.forEach((n) => {
                const st = nodeStateRef.current[n.id] || { scale: 1, stroke: '#d0d4db', alpha: 1 };
                if (st.alpha <= 0.01) return;

                ctx.save();
                ctx.translate(n.x, n.y);
                ctx.scale(st.scale, st.scale);
                ctx.translate(-n.x, -n.y);

                // circle
                ctx.beginPath();
                ctx.arc(n.x, n.y, NODE_RADIUS, 0, Math.PI * 2);
                ctx.fillStyle = COLOR_NODE_FILL;
                ctx.fill();

                ctx.lineWidth = 1.5;
                ctx.strokeStyle = st.stroke;
                ctx.stroke();

                // label for output nodes
                if (n.layer === 'output' && n.label) {
                    ctx.fillStyle = COLOR_OUTPUT_TEXT;
                    ctx.font = `bold 8px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(n.label.toUpperCase(), n.x, n.y);
                }
                ctx.restore();
            });
        },
        [],
    );

    // Render loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let rafId = 0;
        const loop = () => {
            draw(ctx);
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);

        // React to global active toggles by clearing overlays/timelines when deactivated
        const onActiveChange = (e: Event) => {
            const detail = (e as CustomEvent).detail as { active?: boolean } | undefined;
            if (detail && detail.active === false) {
                activeTimelines.forEach((tl) => tl.kill());
                activeTimelines.clear();
                overlayLinesRef.current = [];
            }
        };
        window.addEventListener('landing:anim-active-changed', onActiveChange as EventListener);

        return () => {
            cancelAnimationFrame(rafId);
            activeTimelines.forEach((tl) => tl.kill());
            activeTimelines.clear();
            overlayLinesRef.current = [];
            if (entranceTimelineRef.current) entranceTimelineRef.current.kill();
            window.removeEventListener('landing:anim-active-changed', onActiveChange as EventListener);
        };
    }, [draw, activeTimelines]);

    // Utility for node pulses (shared nodes, not per-wave duplicates)
    const pulseNodes = useCallback(
        (ids: string[], strokeColor: string) => {
            ids.forEach((id) => {
                const st = nodeStateRef.current[id];
                if (!st) return;

                // create a small TL to pulse scale and temporarily tint stroke
                const tl = gsap.timeline();
                tl.to(st, { scale: 1.5, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.out' })
                    .to(st, { scale: 1, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.in' }, '>-0.02');

                // stroke tint (soft)
                gsap.to(st, { stroke: strokeColor, duration: 0.12, overwrite: 'auto' });
                gsap.to(st, { stroke: '#d0d4db', duration: 0.25, delay: 0.25, overwrite: 'auto' });
            });
        },
        [],
    );

    // New waves → attach overlays to the persistent graph
    useEffect(() => {
        // Don't start any new animations if landing animations are gated off
        if (!shouldRunLandingAnimations()) return;

        const { cf, fh, ho } = staticLinesRef.current;

        waves.forEach((wave) => {
            if (activeTimelines.has(wave.id)) return; // already animating this wave

            const { activations, softmaxProbabilities, gradientSet, id: waveId } = wave;
            const flatAct = getSampledActivations(activations[flattenLayerName], MAX_NODES_TO_DRAW);
            const hidAct = getSampledActivations(activations[hiddenDenseLayerName], MAX_NODES_TO_DRAW);
            const outAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
            const predIdx = outAct.indexOf(Math.max(...outAct));

            // Decide which overlay segments to draw (only active)
            const overlays: OverlayLine[] = [];

            // Center → Flatten: only for active flatten nodes
            flatAct.forEach((a, i) => {
                if (a > ACTIVATION_THRESHOLD) {
                    const base = cf[i]; // one-to-one
                    overlays.push({
                        id: `ol-cf-${waveId}-${i}`,
                        waveId,
                        p0: base.p0,
                        p1: base.p1,
                        totalLength: base.totalLength,
                        head: 0,
                        tail: 0,
                        gradientSet,
                        alpha: NET_ALPHA_PREDICTED_LINE,
                    });
                }
            });

            // Flatten → Hidden: only active→active pairs
            flatAct.forEach((aF, iF) => {
                if (aF <= ACTIVATION_THRESHOLD) return;
                hidAct.forEach((aH, iH) => {
                    if (aH <= ACTIVATION_THRESHOLD) return;
                    const idx = iF * MAX_NODES_TO_DRAW + iH;
                    const base = fh[idx];
                    // alpha scales with source activation strength
                    const norm =
                        (aF - ACTIVATION_THRESHOLD) / (1.0 - ACTIVATION_THRESHOLD || 1);
                    const alpha =
                        NET_ALPHA_OTHER_ACTIVE_MIN +
                        norm * (NET_ALPHA_OTHER_ACTIVE_MAX - NET_ALPHA_OTHER_ACTIVE_MIN);
                    overlays.push({
                        id: `ol-fh-${waveId}-${idx}`,
                        waveId,
                        p0: base.p0,
                        p1: base.p1,
                        totalLength: base.totalLength,
                        head: 0,
                        tail: 0,
                        gradientSet,
                        alpha,
                    });
                });
            });

            // Hidden → Output: only to the predicted output node for smoothness
            hidAct.forEach((aH, iH) => {
                if (aH <= ACTIVATION_THRESHOLD) return;
                const idx = iH * EMNIST_CHARS.length + predIdx;
                const base = ho[idx];
                overlays.push({
                    id: `ol-ho-${waveId}-${idx}`,
                    waveId,
                    p0: base.p0,
                    p1: base.p1,
                    totalLength: base.totalLength,
                    head: 0,
                    tail: 0,
                    gradientSet,
                    alpha: NET_ALPHA_PREDICTED_LINE,
                });
            });

            // Attach overlays
            overlayLinesRef.current.push(...overlays);

            // Node pulses (shared nodes)
            const flattenPulseIds = flatAct
                .map((a, i) => (a > ACTIVATION_THRESHOLD ? `fl-${i}` : null))
                .filter(Boolean) as string[];
            const hiddenPulseIds = hidAct
                .map((a, i) => (a > ACTIVATION_THRESHOLD ? `hd-${i}` : null))
                .filter(Boolean) as string[];
            const outPulseId = [`out-${predIdx}`];

            // build GSAP TL for the wave
            const tl = gsap.timeline({
                onComplete: () => {
                    // remove this wave's overlays
                    overlayLinesRef.current = overlayLinesRef.current.filter((ol) => ol.waveId !== waveId);
                    activeTimelines.delete(waveId);
                    onWaveFinished(waveId);
                },
            });
            activeTimelines.set(waveId, tl);

            // phase 1: center→flatten
            overlays
                .filter((o) => o.id.startsWith('ol-cf-'))
                .forEach((o) => {
                    tl.to(
                        o,
                        { head: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' },
                        0,
                    );
                    tl.to(
                        o,
                        { tail: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' },
                        NET_LINE_GROW_DURATION,
                    );
                });
            // pulse flatten nodes midway
            tl.add(() => pulseNodes(flattenPulseIds, gradientSet[0] || '#FF69B4'), NET_LINE_GROW_DURATION * 0.5);

            // phase 2: flatten→hidden
            const phase2Start =
                NET_LINE_GROW_DURATION + NET_LINE_SHRINK_DURATION + NET_LAYER_ANIMATION_DELAY;
            overlays
                .filter((o) => o.id.startsWith('ol-fh-'))
                .forEach((o) => {
                    tl.to(
                        o,
                        { head: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' },
                        phase2Start,
                    );
                    tl.to(
                        o,
                        { tail: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' },
                        phase2Start + NET_LINE_GROW_DURATION,
                    );
                });
            tl.add(() => pulseNodes(hiddenPulseIds, gradientSet[0] || '#FF69B4'), phase2Start + NET_LINE_GROW_DURATION * 0.5);

            // phase 3: hidden→output (predicted only)
            const phase3Start =
                phase2Start + NET_LINE_GROW_DURATION + NET_LINE_SHRINK_DURATION + NET_LAYER_ANIMATION_DELAY;
            overlays
                .filter((o) => o.id.startsWith('ol-ho-'))
                .forEach((o) => {
                    tl.to(
                        o,
                        { head: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' },
                        phase3Start,
                    );
                    tl.to(
                        o,
                        { tail: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' },
                        phase3Start + NET_LINE_GROW_DURATION,
                    );
                });
            tl.add(() => pulseNodes(outPulseId, gradientSet[0] || '#FF69B4'), phase3Start + NET_LINE_GROW_DURATION * 0.5);
        });
    }, [
        waves,
        onWaveFinished,
        flattenLayerName,
        hiddenDenseLayerName,
        outputLayerName,
        activeTimelines,
        pulseNodes,
    ]);

    return (
        <div>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ pointerEvents: 'none', display: 'block' }}
            />
        </div>
    );
};