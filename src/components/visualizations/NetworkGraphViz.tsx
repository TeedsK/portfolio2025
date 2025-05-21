// src/components/visualizations/NetworkGraphViz.tsx
import React, { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { ActivationData, ActivationDataValue } from '../../types';
import gsap from 'gsap';

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Styling & Layout Constants (mostly unchanged)
const COLOR_DEFAULT_LINE = '#6a6f76';
const COLOR_NODE_FILL = '#ffffff';
const COLOR_OUTPUT_TEXT = '#333333';
const COLOR_LAYER_LABEL = '#555555';
const NODE_RADIUS = 7;
const LAYER_GAP = 180;
const CANVAS_HEIGHT = 500; // Renamed from SVG_HEIGHT
const INPUT_IMG_SIZE = 56;
const ACTIVATION_THRESHOLD = 0.1;

const MAX_NODES_TO_DRAW = 10;
const ANIMATION_WAVE_DURATION = 0.1; // Duration for one full wave (activation OR deactivation) of a layer
const NODE_PULSE_DURATION = ANIMATION_WAVE_DURATION * 0.8;
const NODE_PULSE_SCALE_FACTOR = 1.5;

const LINE_ACTIVE_STROKE_WIDTH = 2.5;
const LINE_INACTIVE_STROKE_WIDTH = 0.7;
const LINE_ACTIVE_ALPHA = 0.9;
const LINE_INACTIVE_ALPHA = 0.15;
const NODE_INACTIVE_STROKE_COLOR = '#d0d4db';

export interface NetworkGraphVizProps {
    activations: ActivationData | null; // Current character's activations
    softmaxProbabilities: number[] | null;
    currentCharImageData: ImageData | null;
    animationBaseColor: string;
    flattenLayerName: string;
    hiddenDenseLayerName: string;
    outputLayerName: string; // Used to determine output node count via EMNIST_CHARS.length
}

// Helper function (unchanged)
const getSlightlyLighterShade = (hexColor: string, percent: number = 30): string => {
    try {
        if (!hexColor || hexColor.charAt(0) !== '#' || (hexColor.length !== 4 && hexColor.length !== 7)) { return hexColor; }
        let rStr, gStr, bStr;
        if (hexColor.length === 4) { rStr = hexColor.slice(1, 2).repeat(2); gStr = hexColor.slice(2, 3).repeat(2); bStr = hexColor.slice(3, 4).repeat(2); }
        else { rStr = hexColor.slice(1, 3); gStr = hexColor.slice(3, 5); bStr = hexColor.slice(5, 7); }
        let r = parseInt(rStr, 16), g = parseInt(gStr, 16), b = parseInt(bStr, 16);
        r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
        g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
        b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
        const toHex = (c: number) => ("0" + c.toString(16)).slice(-2);
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } catch (e) { console.error("Error lightening color:", hexColor, e); return hexColor; }
};

const getSampledActivations = (data: ActivationDataValue | undefined | null, count: number): number[] => {
    if (!data || !Array.isArray(data)) return new Array(count).fill(0);
    const flatData = data.flat(Infinity).filter(n => typeof n === 'number') as number[];
    if (flatData.length === 0) return new Array(count).fill(0);
    const result: number[] = [];
    if (flatData.length <= count) {
        for (let i = 0; i < flatData.length; i++) { result.push(Math.max(0, Math.min(1, flatData[i]))); }
        while (result.length < count) { result.push(0); }
    } else {
        const step = Math.floor(flatData.length / count);
        for (let i = 0; i < count; i++) { result.push(Math.max(0, Math.min(1, flatData[i * step]))); }
    }
    return result;
};

const calculateNodePositions = (count: number, x: number, totalHeight: number, nodeRadiusValue: number): { x: number, y: number }[] => {
    const availableHeight = totalHeight - nodeRadiusValue * 4;
    const yStep = count <= 1 ? availableHeight / 2 : availableHeight / (count - 1 || 1);
    const startY = nodeRadiusValue * 2;
    return Array.from({ length: count }).map((_el, i) => ({ x: x, y: startY + i * yStep }));
};

interface AnimatableLine {
    id: string; fromX: number; fromY: number; toX: number; toY: number;
    activationProgress: number; // 0 to 1, for current wave
    deactivationProgress: number; // 0 to 1, for current wave (wipes active color)
    color: string; // Current drawn color
    alpha: number;
    strokeWidth: number;
    isActivating: boolean; // Flag if this line is part of the newest activation wave
    waveKey: number; // To differentiate waves if needed, or use isActivating
}
interface AnimatableNode {
    id: string; x: number; y: number; label?: string;
    scale: number;
    strokeColor: string;
    fillColor: string; // Not really used, nodes are white fill
    textColor: string;
    alpha: number;
    isActivating: boolean;
    isPredicted?: boolean;
    waveKey: number;
}

// Unique key for each processing wave to manage overlapping animations
let waveCounter = 0;

export const NetworkGraphViz: React.FC<NetworkGraphVizProps> = ({
    activations, softmaxProbabilities, currentCharImageData, animationBaseColor,
    flattenLayerName, hiddenDenseLayerName,
}) => {
    const inputCanvasRef = useRef<HTMLCanvasElement>(null);
    const networkCanvasRef = useRef<HTMLCanvasElement>(null);

    // Store all lines and nodes that might be animated.
    const animatablesRef = useRef<{
        lines: AnimatableLine[];
        nodes: AnimatableNode[];
        timeline?: gsap.core.Timeline;
        lastWaveKey: number;
    }>({ lines: [], nodes: [], lastWaveKey: -1 });

    const inputVisX = 35;
    const firstLayerX = inputVisX + INPUT_IMG_SIZE + LAYER_GAP / 2 + 20;

    const flattenNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, firstLayerX, CANVAS_HEIGHT, NODE_RADIUS), [firstLayerX]);
    const hiddenDenseNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, firstLayerX + LAYER_GAP, CANVAS_HEIGHT, NODE_RADIUS), [firstLayerX]);
    const outputNodePositions = useMemo(() => calculateNodePositions(EMNIST_CHARS.length, firstLayerX + LAYER_GAP * 2, CANVAS_HEIGHT, NODE_RADIUS), [firstLayerX]);
    const canvasWidth = useMemo(() => outputNodePositions.length > 0 ? outputNodePositions[0].x + NODE_RADIUS * 2 + 30 : 700, [outputNodePositions]);

    // Initialize animatable objects once
    useEffect(() => {
        const lines: AnimatableLine[] = [];
        const nodes: AnimatableNode[] = [];
        let lineIdCounter = 0;
        let nodeIdCounter = 0;

        // Input to Flatten
        flattenNodePositions.forEach((toPos) => {
            lines.push({
                id: `l-in-fl-${lineIdCounter++}`, waveKey: -1,
                fromX: inputVisX + INPUT_IMG_SIZE - NODE_RADIUS, fromY: CANVAS_HEIGHT / 2, toX: toPos.x, toY: toPos.y,
                activationProgress: 0, deactivationProgress: 0, color: COLOR_DEFAULT_LINE, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH, isActivating: false,
            });
        });
        flattenNodePositions.forEach((pos) => {
            nodes.push({
                id: `n-fl-${nodeIdCounter++}`, waveKey: -1, x: pos.x, y: pos.y,
                scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, isActivating: false,
            });
        });

        // Flatten to Hidden
        flattenNodePositions.forEach(fromPos => {
            hiddenDenseNodePositions.forEach(toPos => {
                lines.push({
                    id: `l-fl-hd-${lineIdCounter++}`, waveKey: -1,
                    fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y,
                    activationProgress: 0, deactivationProgress: 0, color: COLOR_DEFAULT_LINE, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH, isActivating: false,
                });
            });
        });
        hiddenDenseNodePositions.forEach(pos => {
            nodes.push({
                id: `n-hd-${nodeIdCounter++}`, waveKey: -1, x: pos.x, y: pos.y,
                scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, isActivating: false,
            });
        });

        // Hidden to Output
        hiddenDenseNodePositions.forEach(fromPos => {
            outputNodePositions.forEach(toPos => {
                lines.push({
                    id: `l-hd-out-${lineIdCounter++}`, waveKey: -1,
                    fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y,
                    activationProgress: 0, deactivationProgress: 0, color: COLOR_DEFAULT_LINE, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH, isActivating: false,
                });
            });
        });
        outputNodePositions.forEach((pos, i) => {
            nodes.push({
                id: `n-out-${nodeIdCounter++}`, waveKey: -1, x: pos.x, y: pos.y, label: EMNIST_CHARS[i],
                scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, isActivating: false, isPredicted: false,
            });
        });
        animatablesRef.current.lines = lines;
        animatablesRef.current.nodes = nodes;
    }, [flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, inputVisX]);


    const drawNetwork = () => {
        const canvas = networkCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { lines, nodes } = animatablesRef.current;
        const currentAnimBaseColor = animationBaseColor || '#456cff';


        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR_LAYER_LABEL;
        if (flattenNodePositions.length > 0) ctx.fillText('Flatten', flattenNodePositions[0].x, 15);
        if (hiddenDenseNodePositions.length > 0) ctx.fillText('Dense', hiddenDenseNodePositions[0].x, 15);
        if (outputNodePositions.length > 0) ctx.fillText('Output', outputNodePositions[0].x, 15);

        lines.forEach(line => {
            ctx.beginPath();
            const startX = line.fromX + (line.toX - line.fromX) * line.deactivationProgress;
            const startY = line.fromY + (line.toY - line.fromY) * line.deactivationProgress;
            const endX = line.fromX + (line.toX - line.fromX) * line.activationProgress;
            const endY = line.fromY + (line.toY - line.fromY) * line.activationProgress;

            // Draw base inactive line underneath if partially active/fading
            if (line.activationProgress > 0 || line.alpha > LINE_INACTIVE_ALPHA) { // Only if it's somewhat visible
                 ctx.moveTo(line.fromX, line.fromY);
                 ctx.lineTo(line.toX, line.toY);
                 ctx.strokeStyle = COLOR_DEFAULT_LINE;
                 ctx.lineWidth = LINE_INACTIVE_STROKE_WIDTH;
                 ctx.globalAlpha = LINE_INACTIVE_ALPHA;
                 ctx.stroke();
            }


            // Draw the active segment
            if (line.activationProgress > line.deactivationProgress) { // Only draw if there's a segment to show
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.strokeStyle = line.color;
                ctx.lineWidth = line.strokeWidth;
                ctx.globalAlpha = line.alpha;
                ctx.stroke();
            }
        });

        nodes.forEach(node => {
            ctx.save();
            ctx.translate(node.x, node.y);
            ctx.scale(node.scale, node.scale);
            ctx.beginPath();
            ctx.arc(0, 0, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_NODE_FILL; // node.fillColor;
            ctx.globalAlpha = node.alpha;
            ctx.fill();
            ctx.strokeStyle = node.strokeColor;
            ctx.lineWidth = 1.5; // standard stroke for nodes unless overridden by animation
            ctx.stroke();

            if (node.label) {
                ctx.fillStyle = node.textColor;
                ctx.font = `9px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.label.toUpperCase(), 0, 0);
            }
            ctx.restore();
        });
        ctx.globalAlpha = 1;
    };

    useEffect(() => {
        if (inputCanvasRef.current && currentCharImageData) {
            const ctx = inputCanvasRef.current.getContext('2d');
            if (ctx) {
                const tempCanvas = document.createElement('canvas'); // Use a temporary canvas for correct sizing
                tempCanvas.width = currentCharImageData.width;
                tempCanvas.height = currentCharImageData.height;
                const tempCtx = tempCanvas.getContext('2d');
                if(tempCtx){
                    tempCtx.putImageData(currentCharImageData, 0, 0);
                    ctx.clearRect(0, 0, inputCanvasRef.current.width, inputCanvasRef.current.height);
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(tempCanvas, 0, 0, inputCanvasRef.current.width, inputCanvasRef.current.height);
                }
            }
        } else if (inputCanvasRef.current) {
            inputCanvasRef.current.getContext('2d')?.clearRect(0, 0, inputCanvasRef.current.width, inputCanvasRef.current.height);
        }
    }, [currentCharImageData]);

    useLayoutEffect(() => {
        const animatables = animatablesRef.current;
        if (!activations) { // Initial state or no data, draw static default
            animatables.lines.forEach(l => {
                l.activationProgress = 0; l.deactivationProgress = 0; l.color = COLOR_DEFAULT_LINE; l.alpha = LINE_INACTIVE_ALPHA; l.strokeWidth = LINE_INACTIVE_STROKE_WIDTH; l.isActivating = false;
            });
            animatables.nodes.forEach(n => {
                n.scale = 1; n.strokeColor = NODE_INACTIVE_STROKE_COLOR; n.textColor = COLOR_OUTPUT_TEXT; n.alpha = 1; n.isActivating = false; n.isPredicted = false;
            });
            drawNetwork();
            return;
        }

        const currentWave = waveCounter++;
        animatables.lastWaveKey = currentWave;

        const currentAnimBaseColor = animationBaseColor || '#456cff';

        const currentFlattenAct = getSampledActivations(activations[flattenLayerName], MAX_NODES_TO_DRAW);
        const currentHiddenAct = getSampledActivations(activations[hiddenDenseLayerName], MAX_NODES_TO_DRAW);
        const currentOutputAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
        const predictedOutputIndex = currentOutputAct.indexOf(Math.max(...currentOutputAct));

        if (animatables.timeline) {
            // Don't kill, let previous wave's deactivation continue if it's still running.
            // New timeline will add to animations.
        }
        // Each character wave gets its own timeline for its specific elements
        // This is tricky; for true pipelining, we need the previous wave to fade *while* new one activates.
        // So, the previous timeline *should not be killed*. Instead, we update properties on existing elements.

        const newTimeline = gsap.timeline();
        animatables.timeline = newTimeline; // This replaces old one, which isn't ideal for overlap.
                                          // A better model would be to have GSAP animate objects directly and not manage one master timeline per character.
                                          // For now, let's proceed with this simpler timeline-per-char, it won't overlap perfectly as requested yet.

        // --- DEACTIVATION of elements from PREVIOUS wave ---
        // This part needs to target elements animated by the *previous* call to this effect.
        // The current model with one `animatablesRef` makes this hard without tagging elements by wave.
        // For now, we will simply reset all to ensure the new wave starts clean.
        // Proper deactivation of a *previous distinct wave* requires more state.
        animatables.lines.forEach(l => {
            if (l.isActivating) { // If it was part of the last *full* activation
                newTimeline.to(l, {
                    deactivationProgress: 1, // Wipe it
                    activationProgress: 1, // Ensure it was fully drawn before wipe starts
                    // color: COLOR_DEFAULT_LINE, // Color change handled by wipe
                    alpha: LINE_INACTIVE_ALPHA,
                    strokeWidth: LINE_INACTIVE_STROKE_WIDTH,
                    duration: ANIMATION_WAVE_DURATION,
                    delay: 0.1, // Small delay before old wave starts fading
                }, "<"); // Start deactivation slightly after or at same time as new activation
            }
            l.isActivating = false; // Reset for the next wave
            l.waveKey = currentWave; // Tag with current wave
        });
        animatables.nodes.forEach(n => {
            if (n.isActivating) {
                newTimeline.to(n, {
                    scale: 1,
                    strokeColor: NODE_INACTIVE_STROKE_COLOR,
                    textColor: COLOR_OUTPUT_TEXT,
                    alpha: 1, // Or fade out if desired
                    duration: NODE_PULSE_DURATION,
                     delay: 0.1,
                }, "<");
            }
            n.isActivating = false;
            n.isPredicted = false;
            n.waveKey = currentWave;
        });


        // --- ACTIVATION of elements for CURRENT wave ---
        let timeOffset = 0; // Relative to the start of this new character's animation
        const layerAnimStagger = ANIMATION_WAVE_DURATION * 0.4; // How much to delay start of next layer animation

        // Input to Flatten
        let lineCursor = 0;
        let nodeCursor = 0;
        for (let i = 0; i < flattenNodePositions.length; i++, lineCursor++, nodeCursor++) {
            const line = animatables.lines[lineCursor];
            const node = animatables.nodes[nodeCursor];
            const isActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
            
            line.isActivating = true; line.waveKey = currentWave;
            line.deactivationProgress = 0; // Reset for new activation
            newTimeline.to(line, {
                activationProgress: 1, color: isActive ? currentAnimBaseColor : COLOR_DEFAULT_LINE,
                alpha: isActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                duration: ANIMATION_WAVE_DURATION,
            }, timeOffset);

            node.isActivating = true; node.waveKey = currentWave;
            if (isActive) {
                newTimeline.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.out' }, timeOffset + ANIMATION_WAVE_DURATION * 0.3)
                         .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
            } else {
                newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, duration: NODE_PULSE_DURATION}, timeOffset + ANIMATION_WAVE_DURATION * 0.3);
            }
        }
        timeOffset += layerAnimStagger;

        // Flatten to Hidden
        for (let i = 0; i < MAX_NODES_TO_DRAW; i++) {
            const fromNodeActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
            for (let j = 0; j < MAX_NODES_TO_DRAW; j++, lineCursor++) {
                const line = animatables.lines[lineCursor];
                const targetNodeActive = currentHiddenAct[j] >= ACTIVATION_THRESHOLD;
                const isLineActive = fromNodeActive;

                line.isActivating = true; line.waveKey = currentWave;
                line.deactivationProgress = 0;
                newTimeline.to(line, {
                    activationProgress: 1, color: isLineActive ? (targetNodeActive ? currentAnimBaseColor : getSlightlyLighterShade(currentAnimBaseColor, 60)) : COLOR_DEFAULT_LINE,
                    alpha: isLineActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isLineActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                    duration: ANIMATION_WAVE_DURATION,
                }, timeOffset);
            }
        }
        for (let i = 0; i < MAX_NODES_TO_DRAW; i++, nodeCursor++) {
            const node = animatables.nodes[nodeCursor];
            const isActive = currentHiddenAct[i] >= ACTIVATION_THRESHOLD;
            node.isActivating = true; node.waveKey = currentWave;
            if (isActive) {
                newTimeline.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.out' }, timeOffset + ANIMATION_WAVE_DURATION * 0.3)
                         .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
            } else {
                 newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, duration: NODE_PULSE_DURATION}, timeOffset + ANIMATION_WAVE_DURATION * 0.3);
            }
        }
        timeOffset += layerAnimStagger;

        // Hidden to Output
        for (let i = 0; i < MAX_NODES_TO_DRAW; i++) {
            const fromNodeActive = currentHiddenAct[i] >= ACTIVATION_THRESHOLD;
            for (let j = 0; j < EMNIST_CHARS.length; j++, lineCursor++) {
                const line = animatables.lines[lineCursor];
                const isTargetPredicted = j === predictedOutputIndex;
                const targetNodeSlightlyActive = currentOutputAct[j] > 0.05;
                const isLineActive = fromNodeActive;

                line.isActivating = true; line.waveKey = currentWave;
                line.deactivationProgress = 0;
                newTimeline.to(line, {
                    activationProgress: 1, color: isLineActive ? (isTargetPredicted ? currentAnimBaseColor : (targetNodeSlightlyActive ? currentAnimBaseColor : getSlightlyLighterShade(currentAnimBaseColor, 70))) : COLOR_DEFAULT_LINE,
                    alpha: isLineActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isLineActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                    duration: ANIMATION_WAVE_DURATION,
                }, timeOffset);
            }
        }
        for (let i = 0; i < EMNIST_CHARS.length; i++, nodeCursor++) {
            const node = animatables.nodes[nodeCursor];
            const isPredicted = i === predictedOutputIndex;
            const isSlightlyActive = currentOutputAct[i] > 0.05;
            
            node.isActivating = true; node.waveKey = currentWave;
            node.isPredicted = isPredicted;

            if (isPredicted || isSlightlyActive) {
                newTimeline.to(node, {
                    scale: isPredicted ? NODE_PULSE_SCALE_FACTOR * 1.1 : NODE_PULSE_SCALE_FACTOR,
                    strokeColor: isPredicted ? currentAnimBaseColor : currentAnimBaseColor, // Use base for slightly active too
                    textColor: isPredicted ? currentAnimBaseColor : COLOR_OUTPUT_TEXT,
                    duration: NODE_PULSE_DURATION / 2, ease: 'power1.out'
                }, timeOffset + ANIMATION_WAVE_DURATION * 0.3)
                .to(node, { scale: 1, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
            } else {
                 newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, textColor: COLOR_OUTPUT_TEXT, duration: NODE_PULSE_DURATION}, timeOffset + ANIMATION_WAVE_DURATION * 0.3);
            }
        }

        gsap.ticker.add(drawNetwork);
        newTimeline.eventCallback("onComplete", () => {
            gsap.ticker.remove(drawNetwork);
            // Mark this wave's elements as no longer actively animating for the *next* new wave
             animatables.lines.forEach(l => { if(l.waveKey === currentWave) l.isActivating = false;});
             animatables.nodes.forEach(n => { if(n.waveKey === currentWave) n.isActivating = false;});
            drawNetwork(); // Final draw
        });
        newTimeline.eventCallback("onInterrupt", () => gsap.ticker.remove(drawNetwork) );

        return () => { // Cleanup for this effect instance
            gsap.ticker.remove(drawNetwork);
            newTimeline.kill(); // Kill this specific timeline
            // Note: This cleanup might be too aggressive if we want previous character's fade-out to fully complete
            // even if this component re-renders or props change rapidly for other reasons.
            // The current model assumes this effect runs per character, and its timeline manages that character.
        };

    }, [activations, softmaxProbabilities, animationBaseColor, flattenLayerName, hiddenDenseLayerName,
        animatablesRef, // dep on ref itself
        flattenNodePositions, hiddenDenseNodePositions, outputNodePositions ]); // Geometric dependencies

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                <div style={{ marginRight: `${LAYER_GAP / 2}px`, textAlign: 'center', flexShrink: 0 }}>
                    <canvas ref={inputCanvasRef} width={INPUT_IMG_SIZE} height={INPUT_IMG_SIZE} style={{ imageRendering: 'pixelated' }} />
                    <div style={{ fontSize: '11px', color: COLOR_LAYER_LABEL, marginTop: '5px' }}>Input ({currentCharImageData?.width}x{currentCharImageData?.height})</div>
                </div>
                <canvas ref={networkCanvasRef} width={canvasWidth} height={CANVAS_HEIGHT} />
            </div>
            {!activations && animatablesRef.current.lines.length > 0 && <div style={{ color: COLOR_LAYER_LABEL, fontSize: '0.9em', marginTop: '10px', paddingLeft: `${firstLayerX}px` }}>Awaiting activation data...</div>}
        </div>
    );
};