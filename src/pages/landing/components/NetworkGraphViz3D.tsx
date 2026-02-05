// src/pages/landing/components/NetworkGraphViz3D.tsx
import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimationWave, Point, StaticNode3D, StaticLine3D } from '../../../types';
import gsap from 'gsap';
import {
    NET_NODE_PULSE_DURATION,
    NET_LAYER_ANIMATION_DELAY,
    NET_ALPHA_PREDICTED_LINE,
    NET_ALPHA_OTHER_ACTIVE_MIN,
    NET_ALPHA_OTHER_ACTIVE_MAX,
    NET_ACTIVATION_THRESHOLD,
    NET_SKELETON_LINE_ALPHA,
} from '../utils/animation';
import { shouldRunLandingAnimations } from '../utils/landingAnimationGate';
import {
    rotateX,
    rotateY,
    projectPerspective,
    distance3D,
    depthToAlpha,
    ProjectedPoint,
} from '../utils/math3d';
import {
    fibonacciSphere,
    distributeOutputNodes,
    getInputNodePosition,
} from '../utils/sphereDistribution';

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Visual constants
const COLOR_DEFAULT_LINE = '#DDDDDD';
const COLOR_OUTPUT_TEXT = '#ffffff'; // White text for good contrast on colored nodes
const COLOR_NODE_DEFAULT = '#e9ecef'; // Default node color (light grey)

// Color manipulation helpers for 3D shading effect
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function lightenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r + (255 - rgb.r) * amount,
        rgb.g + (255 - rgb.g) * amount,
        rgb.b + (255 - rgb.b) * amount
    );
}

function darkenColor(hex: string, amount: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    return rgbToHex(
        rgb.r * (1 - amount),
        rgb.g * (1 - amount),
        rgb.b * (1 - amount)
    );
}

// Convert hex color to rgba string with alpha
function hexToRgba(hex: string, alpha: number): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return `rgba(128, 128, 128, ${alpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

const NODE_RADIUS = 6;
const LINE_INACTIVE_STROKE_WIDTH = 0.6;
const LINE_ACTIVE_WIDTH = 1.8;

// 3D Sphere constants
const SPHERE_RADIUS = 320;
const CAMERA_DISTANCE = 800;
const ROTATION_SPEED_X = 0.0005; // radians per millisecond for up/down tilt
const SWAY_SPEED_Y = 0.00025; // radians per millisecond for left/right sway
const SWAY_AMPLITUDE_Y = 0.12; // max sway angle in radians (~7 degrees)
const TILT_AMPLITUDE_X = 0.2; // max tilt angle in radians (~11 degrees)
const HIDDEN_NODE_COUNT = 50; // More nodes for a fuller look

// Individual node motion constants (creates organic floating effect)
const NODE_DRIFT_AMPLITUDE = 8; // max drift in pixels
const NODE_DRIFT_SPEED_BASE = 0.0008; // base speed for individual drift
const NODE_DRIFT_SPEED_VARIANCE = 0.0004; // variance in drift speed per node

// Generate a pseudo-random seed from node ID for consistent per-node variation
function nodeIdToSeed(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        const char = id.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Animation durations
const NET_LINE_GROW_DURATION = 0.3;
const NET_LINE_SHRINK_DURATION = 0.3;

interface NetworkGraphViz3DProps {
    waves: AnimationWave[];
    onWaveFinished: (waveId: string) => void;
    hiddenDenseLayerName: string;
    outputLayerName: string;
    width: number;
    height: number;
    inputConnectionPoint?: Point; // viewport point where beams arrive
}

// Overlay (animated) line for a wave
interface OverlayLine3D {
    id: string;
    waveId: string;
    nodeId0: string;
    nodeId1: string;
    head: number; // 0 to 1 progress
    tail: number; // 0 to 1 progress
    gradientSet: string[];
    alpha: number;
}

// Helpers
const getSampledActivations = (
    data: number | number[] | number[][] | number[][][] | number[][][][] | undefined | null,
    count: number,
): number[] => {
    if (!data || !Array.isArray(data)) return new Array(count).fill(0);
    const flatData = (data as number[]).flat(Infinity).filter((n: unknown) => typeof n === 'number') as number[];
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

export const NetworkGraphViz3D: React.FC<NetworkGraphViz3DProps> = ({
    waves,
    onWaveFinished,
    hiddenDenseLayerName,
    width,
    height,
    inputConnectionPoint,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Static graph data
    const staticNodesRef = useRef<StaticNode3D[]>([]);
    const staticLinesRef = useRef<{
        ih: StaticLine3D[]; // input → hidden
        ho: StaticLine3D[]; // hidden → output
    }>({ ih: [], ho: [] });

    // Node visual state (includes fillColor for colorful nodes)
    const nodeStateRef = useRef<Record<string, { scale: number; stroke: string; alpha: number; fillColor: string }>>({});

    // Overlay lines for wave animations
    const overlayLinesRef = useRef<OverlayLine3D[]>([]);

    // Animation start time for time-based oscillation
    const animStartTimeRef = useRef<number | null>(null);

    // Active timelines per wave
    const activeTimelines = useRef(new Map<string, gsap.core.Timeline>()).current;

    // Entrance animation
    const entranceTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const hasAnimatedEntranceRef = useRef(false);

    // Center of the canvas (where the sphere is positioned)
    const centerX = useMemo(() => width / 2, [width]);
    const centerY = useMemo(() => height / 2, [height]);

    // Input node 2D position (stationary, on the left)
    const inputNode2D = useMemo((): Point => {
        if (inputConnectionPoint) {
            return inputConnectionPoint;
        }
        // Default: left side of canvas
        return { x: Math.max(20, Math.floor(width * 0.12)), y: Math.floor(height / 2) };
    }, [inputConnectionPoint, width, height]);

    // Build static graph (nodes and lines) on geometry change
    useEffect(() => {
        // Kill running animations
        activeTimelines.forEach((tl) => tl.kill());
        activeTimelines.clear();
        overlayLinesRef.current = [];

        if (entranceTimelineRef.current) {
            entranceTimelineRef.current.kill();
            entranceTimelineRef.current = null;
        }
        hasAnimatedEntranceRef.current = false;

        // Reset animation start time for smooth time-based oscillation
        animStartTimeRef.current = null;

        // Build nodes
        const nodes: StaticNode3D[] = [];

        // Input node (single, stationary - stored in 3D but won't rotate)
        const inputPos = getInputNodePosition(SPHERE_RADIUS);
        nodes.push({ id: 'input-0', position: inputPos, layer: 'input' });

        // Hidden nodes (distributed on sphere)
        const hiddenPositions = fibonacciSphere(HIDDEN_NODE_COUNT, SPHERE_RADIUS);
        hiddenPositions.forEach((pos, i) => {
            nodes.push({ id: `hd-${i}`, position: pos, layer: 'hidden' });
        });

        // Output nodes (a-z on right hemisphere)
        const outputPositions = distributeOutputNodes(EMNIST_CHARS.length, SPHERE_RADIUS);
        outputPositions.forEach((pos, i) => {
            nodes.push({
                id: `out-${i}`,
                position: pos,
                label: EMNIST_CHARS[i],
                layer: 'output',
            });
        });

        staticNodesRef.current = nodes;

        // Initialize node state
        const st: Record<string, { scale: number; stroke: string; alpha: number; fillColor: string }> = {};
        nodes.forEach((n) => {
            st[n.id] = { scale: 0, stroke: '#d0d4db', alpha: 0, fillColor: COLOR_NODE_DEFAULT };
        });
        nodeStateRef.current = st;

        // Build lines
        const ih: StaticLine3D[] = []; // input → all hidden
        const ho: StaticLine3D[] = []; // all hidden → all output

        const inputNode = nodes.find(n => n.layer === 'input')!;
        const hiddenNodes = nodes.filter(n => n.layer === 'hidden');
        const outputNodes = nodes.filter(n => n.layer === 'output');

        // Input → Hidden lines
        hiddenNodes.forEach((hn) => {
            ih.push({
                p0: inputNode.position,
                p1: hn.position,
                totalLength: distance3D(inputNode.position, hn.position),
                nodeId0: inputNode.id,
                nodeId1: hn.id,
            });
        });

        // Hidden → Output lines
        hiddenNodes.forEach((hn) => {
            outputNodes.forEach((on) => {
                ho.push({
                    p0: hn.position,
                    p1: on.position,
                    totalLength: distance3D(hn.position, on.position),
                    nodeId0: hn.id,
                    nodeId1: on.id,
                });
            });
        });

        staticLinesRef.current = { ih, ho };

        // Entrance animation
        if (shouldRunLandingAnimations()) {
            const tl = gsap.timeline({
                onComplete: () => { hasAnimatedEntranceRef.current = true; }
            });
            entranceTimelineRef.current = tl;

            const animateLayer = (layerIds: string[], delay: number) => {
                layerIds.forEach((id, i) => {
                    const nodeSt = nodeStateRef.current[id];
                    if (nodeSt) {
                        tl.to(nodeSt, {
                            scale: 1,
                            alpha: 1,
                            duration: 0.4,
                            ease: 'back.out(1.7)',
                        }, delay + (i * 0.02));
                    }
                });
            };

            // 1. Input node
            const inputIds = nodes.filter(n => n.layer === 'input').map(n => n.id);
            animateLayer(inputIds, 0);

            // 2. Hidden layer
            const hiddenIds = nodes.filter(n => n.layer === 'hidden').map(n => n.id);
            animateLayer(hiddenIds, 0.3);

            // 3. Output layer
            const outputIds = nodes.filter(n => n.layer === 'output').map(n => n.id);
            animateLayer(outputIds, 0.7);
        } else {
            Object.values(st).forEach(s => { s.scale = 1; s.alpha = 1; });
            hasAnimatedEntranceRef.current = true;
        }
    }, [activeTimelines, width, height, inputNode2D]);

    // Drawing function
    const draw = useCallback(
        (ctx: CanvasRenderingContext2D) => {
            if (!shouldRunLandingAnimations()) {
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                return;
            }

            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // Initialize start time on first frame
            if (animStartTimeRef.current === null) {
                animStartTimeRef.current = performance.now();
            }

            // Calculate elapsed time in milliseconds for smooth, frame-rate-independent animation
            const elapsedTime = performance.now() - animStartTimeRef.current;

            // Calculate oscillating angles using time-based approach:
            // X-axis: up/down tilt (main motion)
            // Y-axis: subtle left/right sway
            const tiltAngleX = Math.sin(elapsedTime * ROTATION_SPEED_X) * TILT_AMPLITUDE_X;
            const swayAngleY = Math.sin(elapsedTime * SWAY_SPEED_Y) * SWAY_AMPLITUDE_Y;

            const nodes = staticNodesRef.current;
            const ns = nodeStateRef.current;
            const { ih, ho } = staticLinesRef.current;

            // Project all nodes to 2D
            const projectedNodes: Map<string, ProjectedPoint & { node: StaticNode3D }> = new Map();

            nodes.forEach((node, index) => {
                let pos3D = node.position;

                // Input node doesn't rotate/tilt or drift
                if (node.layer !== 'input') {
                    // Generate unique motion parameters for this node based on its ID
                    const seed = nodeIdToSeed(node.id);
                    const phaseX = (seed % 1000) / 1000 * Math.PI * 2; // 0 to 2π
                    const phaseY = ((seed * 7) % 1000) / 1000 * Math.PI * 2;
                    const phaseZ = ((seed * 13) % 1000) / 1000 * Math.PI * 2;

                    // Each node has slightly different drift speed
                    const speedMultiplier = 0.7 + ((seed % 100) / 100) * 0.6; // 0.7 to 1.3
                    const driftSpeed = NODE_DRIFT_SPEED_BASE + ((seed % 50) / 50) * NODE_DRIFT_SPEED_VARIANCE;

                    // Calculate individual drift offsets (in 3D space)
                    const driftX = Math.sin(elapsedTime * driftSpeed * speedMultiplier + phaseX) * NODE_DRIFT_AMPLITUDE;
                    const driftY = Math.sin(elapsedTime * driftSpeed * 0.8 * speedMultiplier + phaseY) * NODE_DRIFT_AMPLITUDE * 0.7;
                    const driftZ = Math.sin(elapsedTime * driftSpeed * 0.9 * speedMultiplier + phaseZ) * NODE_DRIFT_AMPLITUDE * 0.5;

                    // Apply individual drift to base position
                    pos3D = {
                        x: node.position.x + driftX,
                        y: node.position.y + driftY,
                        z: node.position.z + driftZ,
                    };

                    // Then apply global sphere rotation (X-axis tilt, then Y-axis sway)
                    pos3D = rotateX(pos3D, tiltAngleX);
                    pos3D = rotateY(pos3D, swayAngleY);
                }

                const projected = projectPerspective(pos3D, CAMERA_DISTANCE, centerX, centerY);
                projectedNodes.set(node.id, { ...projected, node });
            });

            // Sort nodes by depth (back to front) for painter's algorithm
            const sortedNodes = Array.from(projectedNodes.values()).sort((a, b) => a.depth - b.depth);

            // Check visibility for layers
            const inputVisible = (ns['input-0']?.alpha || 0) > 0.1;
            const hiddenVisible = (ns['hd-0']?.alpha || 0) > 0.1;
            const outputVisible = (ns['out-0']?.alpha || 0) > 0.1;

            // Helper to draw a 3D line with depth-based alpha (edge-to-edge, not center-to-center)
            const drawLine3D = (
                line: StaticLine3D,
                baseAlpha: number,
                strokeStyle: string | CanvasGradient = COLOR_DEFAULT_LINE,
                lineWidth: number = LINE_INACTIVE_STROKE_WIDTH
            ) => {
                const proj0 = projectedNodes.get(line.nodeId0);
                const proj1 = projectedNodes.get(line.nodeId1);
                if (!proj0 || !proj1) return;

                // Calculate the rendered radius of each node (for edge clipping)
                const st0 = ns[line.nodeId0] || { scale: 1, stroke: '#d0d4db', alpha: 1, fillColor: COLOR_NODE_DEFAULT };
                const st1 = ns[line.nodeId1] || { scale: 1, stroke: '#d0d4db', alpha: 1, fillColor: COLOR_NODE_DEFAULT };
                const radius0 = NODE_RADIUS * proj0.scale * st0.scale * 1.1;
                const radius1 = NODE_RADIUS * proj1.scale * st1.scale * 1.1;

                // Calculate line vector and length
                const dx = proj1.x - proj0.x;
                const dy = proj1.y - proj0.y;
                const lineLength = Math.hypot(dx, dy);

                if (lineLength < radius0 + radius1) return; // Skip if nodes overlap

                // Normalize direction
                const nx = dx / lineLength;
                const ny = dy / lineLength;

                // Calculate edge points (offset from centers by node radii)
                const edge0x = proj0.x + nx * radius0;
                const edge0y = proj0.y + ny * radius0;
                const edge1x = proj1.x - nx * radius1;
                const edge1y = proj1.y - ny * radius1;

                // Calculate depth-based alpha (average of both endpoints)
                const avgDepth = (proj0.depth + proj1.depth) / 2;
                const depthAlpha = depthToAlpha(avgDepth, SPHERE_RADIUS, 0.15, 1.0);

                ctx.globalAlpha = baseAlpha * depthAlpha;
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = lineWidth;
                ctx.beginPath();
                ctx.moveTo(edge0x, edge0y);
                ctx.lineTo(edge1x, edge1y);
                ctx.stroke();
            };

            // 1) Draw skeleton lines (static, faint)
            if (inputVisible && hiddenVisible) {
                ih.forEach((line) => drawLine3D(line, NET_SKELETON_LINE_ALPHA));
            }
            if (hiddenVisible && outputVisible) {
                ho.forEach((line) => drawLine3D(line, NET_SKELETON_LINE_ALPHA));
            }

            // 2) Draw overlay animated lines
            ctx.globalAlpha = 1;
            overlayLinesRef.current.forEach((ol) => {
                if (ol.alpha <= 0.01) return;
                if (ol.head <= ol.tail) return;

                const proj0 = projectedNodes.get(ol.nodeId0);
                const proj1 = projectedNodes.get(ol.nodeId1);
                if (!proj0 || !proj1) return;

                // Calculate the rendered radius of each node (for edge clipping)
                const st0 = ns[ol.nodeId0] || { scale: 1, stroke: '#d0d4db', alpha: 1, fillColor: COLOR_NODE_DEFAULT };
                const st1 = ns[ol.nodeId1] || { scale: 1, stroke: '#d0d4db', alpha: 1, fillColor: COLOR_NODE_DEFAULT };
                const radius0 = NODE_RADIUS * proj0.scale * st0.scale * 1.1;
                const radius1 = NODE_RADIUS * proj1.scale * st1.scale * 1.1;

                // Calculate line vector and length
                const dx = proj1.x - proj0.x;
                const dy = proj1.y - proj0.y;
                const lineLength = Math.hypot(dx, dy);

                if (lineLength < radius0 + radius1) return; // Skip if nodes overlap

                // Normalize direction
                const nx = dx / lineLength;
                const ny = dy / lineLength;

                // Calculate edge points (offset from centers by node radii)
                const edge0x = proj0.x + nx * radius0;
                const edge0y = proj0.y + ny * radius0;
                const edge1x = proj1.x - nx * radius1;
                const edge1y = proj1.y - ny * radius1;

                // Calculate the length of the edge-to-edge line
                const edgeLength = lineLength - radius0 - radius1;

                // Create gradient along the edge-to-edge line
                const grad = ctx.createLinearGradient(edge0x, edge0y, edge1x, edge1y);
                ol.gradientSet.forEach((c, i) => {
                    grad.addColorStop(Math.min(1, i / (ol.gradientSet.length - 1 || 1)), c);
                });

                // Calculate depth-based effects for enhanced 3D feel
                const avgDepth = (proj0.depth + proj1.depth) / 2;
                const depthAlpha = depthToAlpha(avgDepth, SPHERE_RADIUS, 0.15, 1.0);

                // Depth-based line width scaling
                const normalizedDepth = (avgDepth + SPHERE_RADIUS) / (2 * SPHERE_RADIUS);
                const depthWidthScale = 0.4 + normalizedDepth * 1.2;
                const scaledLineWidth = LINE_ACTIVE_WIDTH * depthWidthScale;

                // Draw animated segment (from edge to edge, not center to center)
                const startX = edge0x + (edge1x - edge0x) * ol.tail;
                const startY = edge0y + (edge1y - edge0y) * ol.tail;
                const endX = edge0x + (edge1x - edge0x) * ol.head;
                const endY = edge0y + (edge1y - edge0y) * ol.head;

                ctx.globalAlpha = ol.alpha * depthAlpha;
                ctx.strokeStyle = grad;
                ctx.lineWidth = scaledLineWidth;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            });

            // 3) Draw nodes (sorted back to front)
            sortedNodes.forEach(({ node, x, y, depth, scale: perspectiveScale }) => {
                const st = ns[node.id] || { scale: 1, stroke: '#d0d4db', alpha: 1, fillColor: COLOR_NODE_DEFAULT };
                if (st.alpha <= 0.01) return;

                // Depth-based alpha for the node - more pronounced for floating effect
                const depthAlpha = depthToAlpha(depth, SPHERE_RADIUS, 0.25, 1.0);
                const effectiveAlpha = st.alpha * depthAlpha;

                // Scale node radius based on perspective and animation state
                // Slightly larger scaling for better visibility at distance
                const scaledRadius = NODE_RADIUS * perspectiveScale * st.scale * 1.1;

                ctx.globalAlpha = effectiveAlpha;
                ctx.save();

                // Create 3D sphere effect using radial gradient with the node's fill color
                // Light source simulated from top-left, so highlight is offset towards top-left
                const highlightOffsetX = -scaledRadius * 0.35;
                const highlightOffsetY = -scaledRadius * 0.35;

                // Get the node's current fill color and create shading variants
                const baseColor = st.fillColor || COLOR_NODE_DEFAULT;
                const highlightColor = lightenColor(baseColor, 0.8);  // Much lighter for specular
                const lightColor = lightenColor(baseColor, 0.5);      // Lighter
                const darkColor = darkenColor(baseColor, 0.2);        // Slightly darker
                const shadowColor = darkenColor(baseColor, 0.4);      // Darker for edge

                // Create radial gradient for 3D sphere effect (fully opaque)
                const sphereGradient = ctx.createRadialGradient(
                    x + highlightOffsetX, y + highlightOffsetY, 0,  // Inner circle (highlight)
                    x, y, scaledRadius                              // Outer circle (edge)
                );

                // Gradient stops for solid 3D sphere look (no transparency)
                sphereGradient.addColorStop(0, highlightColor);     // Bright specular highlight
                sphereGradient.addColorStop(0.2, lightColor);       // Near highlight
                sphereGradient.addColorStop(0.5, baseColor);        // Base color (mid tone)
                sphereGradient.addColorStop(0.8, darkColor);        // Darker towards edge
                sphereGradient.addColorStop(1, shadowColor);        // Edge shadow

                // Draw node sphere with gradient fill (no border/stroke)
                ctx.beginPath();
                ctx.arc(x, y, scaledRadius, 0, Math.PI * 2);
                ctx.fillStyle = sphereGradient;
                ctx.fill();

                // Draw label for output nodes
                if (node.layer === 'output' && node.label) {
                    const fontSize = Math.max(7, Math.round(10 * perspectiveScale));
                    ctx.fillStyle = COLOR_OUTPUT_TEXT;
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(node.label.toUpperCase(), x, y);
                }

                ctx.restore();
            });

            ctx.globalAlpha = 1;
        },
        [centerX, centerY],
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

    // Node activation utility - transitions fill color to match the connecting line
    const pulseNodes = useCallback(
        (ids: string[], lineColor: string) => {
            ids.forEach((id) => {
                const st = nodeStateRef.current[id];
                if (!st) return;

                // Animate fill color to match the line color (stays until next line changes it)
                gsap.to(st, {
                    fillColor: lineColor,
                    duration: 0.3,
                    ease: 'power2.out',
                    overwrite: 'auto'
                });
            });
        },
        [],
    );

    // Handle new waves
    useEffect(() => {
        if (!shouldRunLandingAnimations()) return;

        const { ih, ho } = staticLinesRef.current;

        waves.forEach((wave) => {
            if (activeTimelines.has(wave.id)) return;

            const { activations, softmaxProbabilities, gradientSet, id: waveId } = wave;
            const hidAct = getSampledActivations(activations[hiddenDenseLayerName], HIDDEN_NODE_COUNT);
            const outAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
            const predIdx = outAct.indexOf(Math.max(...outAct));

            const overlays: OverlayLine3D[] = [];

            // Phase 1: Input → Hidden (to all active hidden nodes)
            hidAct.forEach((a, i) => {
                if (a > NET_ACTIVATION_THRESHOLD) {
                    const line = ih[i]; // input connects to all hidden nodes
                    if (line) {
                        overlays.push({
                            id: `ol-ih-${waveId}-${i}`,
                            waveId,
                            nodeId0: line.nodeId0,
                            nodeId1: line.nodeId1,
                            head: 0,
                            tail: 0,
                            gradientSet,
                            alpha: NET_ALPHA_PREDICTED_LINE,
                        });
                    }
                }
            });

            // Phase 2: Hidden → Output (only to predicted letter)
            hidAct.forEach((a, iH) => {
                if (a > NET_ACTIVATION_THRESHOLD) {
                    // Find the line from hidden[iH] to output[predIdx]
                    const idx = iH * EMNIST_CHARS.length + predIdx;
                    const line = ho[idx];
                    if (line) {
                        const norm = (a - NET_ACTIVATION_THRESHOLD) / (1.0 - NET_ACTIVATION_THRESHOLD || 1);
                        const alpha = NET_ALPHA_OTHER_ACTIVE_MIN + norm * (NET_ALPHA_OTHER_ACTIVE_MAX - NET_ALPHA_OTHER_ACTIVE_MIN);
                        overlays.push({
                            id: `ol-ho-${waveId}-${idx}`,
                            waveId,
                            nodeId0: line.nodeId0,
                            nodeId1: line.nodeId1,
                            head: 0,
                            tail: 0,
                            gradientSet,
                            alpha,
                        });
                    }
                }
            });

            overlayLinesRef.current.push(...overlays);

            // Node IDs for pulses
            const inputPulseIds = ['input-0'];
            const hiddenPulseIds = hidAct
                .map((a, i) => (a > NET_ACTIVATION_THRESHOLD ? `hd-${i}` : null))
                .filter(Boolean) as string[];
            const outPulseId = [`out-${predIdx}`];

            // Build GSAP timeline
            const tl = gsap.timeline({
                onComplete: () => {
                    overlayLinesRef.current = overlayLinesRef.current.filter((ol) => ol.waveId !== waveId);
                    activeTimelines.delete(waveId);
                    onWaveFinished(waveId);
                },
            });
            activeTimelines.set(waveId, tl);

            // Phase 1: Input → Hidden
            overlays
                .filter((o) => o.id.startsWith('ol-ih-'))
                .forEach((o) => {
                    tl.to(o, { head: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' }, 0);
                    tl.to(o, { tail: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' }, NET_LINE_GROW_DURATION);
                });

            // Pulse input node at start, hidden nodes midway
            tl.add(() => pulseNodes(inputPulseIds, gradientSet[0] || '#FF69B4'), 0);
            tl.add(() => pulseNodes(hiddenPulseIds, gradientSet[0] || '#FF69B4'), NET_LINE_GROW_DURATION * 0.5);

            // Phase 2: Hidden → Output
            const phase2Start = NET_LINE_GROW_DURATION + NET_LINE_SHRINK_DURATION + NET_LAYER_ANIMATION_DELAY;
            overlays
                .filter((o) => o.id.startsWith('ol-ho-'))
                .forEach((o) => {
                    tl.to(o, { head: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' }, phase2Start);
                    tl.to(o, { tail: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' }, phase2Start + NET_LINE_GROW_DURATION);
                });
            tl.add(() => pulseNodes(outPulseId, gradientSet[0] || '#FF69B4'), phase2Start + NET_LINE_GROW_DURATION * 0.5);
        });
    }, [
        waves,
        onWaveFinished,
        hiddenDenseLayerName,
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
