// src/components/visualizations/NetworkGraphViz.tsx
import React, { useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { ActivationData, ActivationDataValue } from '../../types';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const COLOR_DEFAULT_LINE = '#6a6f76';
const COLOR_NODE_FILL = '#ffffff';
const COLOR_OUTPUT_TEXT = '#333333';
const COLOR_LAYER_LABEL = '#555555';
const NODE_RADIUS = 7;
const LAYER_GAP = 180; 
const CANVAS_HEIGHT = 500;
const ACTIVATION_THRESHOLD = 0.1;

const MAX_NODES_TO_DRAW = 10;
const ANIMATION_WAVE_DURATION = 0.2; 
const NODE_PULSE_DURATION = ANIMATION_WAVE_DURATION * 0.8;
const NODE_PULSE_SCALE_FACTOR = 1.5;

const LINE_ACTIVE_STROKE_WIDTH = 2.5;
const LINE_INACTIVE_STROKE_WIDTH = 0.7;
const LINE_ACTIVE_ALPHA = 0.9;
const LINE_INACTIVE_ALPHA = 0.15;
const NODE_INACTIVE_STROKE_COLOR = '#d0d4db';

export const FATTEN_LAYER_X = 550; 

export interface NetworkGraphVizProps {
    activations: ActivationData | null; 
    softmaxProbabilities: number[] | null;
    currentCharImageData: ImageData | null; 
    animationBaseColor: string;
    flattenLayerName: string;
    hiddenDenseLayerName: string;
    outputLayerName: string; 
    centralConnectionPoint?: { x: number, y: number }; 
}

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
    activationProgress: number; 
    deactivationProgress: number; 
    color: string;
    alpha: number;
    strokeWidth: number;
    isActivating: boolean; 
    waveKey: number;
}
interface AnimatableNode { 
    id: string; x: number; y: number; label?: string;
    scale: number;
    strokeColor: string;
    fillColor: string;
    textColor: string;
    alpha: number;
    isActivating: boolean;
    isPredicted?: boolean;
    waveKey: number;
}
interface CentralInputLine {
    id: string;
    toX: number; toY: number;
    progress: number; 
    alpha: number;
}

let waveCounter = 0;

export const NetworkGraphViz: React.FC<NetworkGraphVizProps> = ({
    activations, softmaxProbabilities, animationBaseColor,
    flattenLayerName, hiddenDenseLayerName,
    centralConnectionPoint 
}) => {
    const networkCanvasRef = useRef<HTMLCanvasElement>(null);
    const animatablesRef = useRef<{
        lines: AnimatableLine[];
        nodes: AnimatableNode[];
        centralInputLines: CentralInputLine[];
        timeline?: gsap.core.Timeline;
        lastWaveKey: number;
    }>({ lines: [], nodes: [], centralInputLines: [], lastWaveKey: -1 });

    const flattenNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X, CANVAS_HEIGHT, NODE_RADIUS), []);
    const hiddenDenseNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X + LAYER_GAP, CANVAS_HEIGHT, NODE_RADIUS), []);
    const outputNodePositions = useMemo(() => calculateNodePositions(EMNIST_CHARS.length, FATTEN_LAYER_X + LAYER_GAP * 2, CANVAS_HEIGHT, NODE_RADIUS), []);
    
    const canvasWidth = useMemo(() => {
        if (outputNodePositions.length > 0) {
            return outputNodePositions[0].x + NODE_RADIUS * 2 + 30;
        }
        return FATTEN_LAYER_X + (LAYER_GAP * 2) + NODE_RADIUS * 4 + 60; 
    }, [outputNodePositions]);

    useLayoutEffect(() => {
        const lines: AnimatableLine[] = [];
        const nodes: AnimatableNode[] = [];
        let lineIdCounter = 0;
        let nodeIdCounter = 0;
        
        flattenNodePositions.forEach((pos) => {
            nodes.push({
                id: `n-fl-${nodeIdCounter++}`, waveKey: -1, x: pos.x, y: pos.y,
                scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, isActivating: false,
            });
        });
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
        
        const newCentralInputLines: CentralInputLine[] = [];
        if (centralConnectionPoint) {
            flattenNodePositions.forEach((nodePos, index) => {
                newCentralInputLines.push({
                    id: `cil-${index}`,
                    toX: nodePos.x,
                    toY: nodePos.y,
                    progress: 0,
                    alpha: 0 
                });
            });
        }
        animatablesRef.current.centralInputLines = newCentralInputLines;

    }, [flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, centralConnectionPoint]);

    const drawNetwork = useCallback(() => {
        const canvas = networkCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { lines, nodes, centralInputLines } = animatablesRef.current;
        const currentAnimColor = animationBaseColor || '#FF69B4'; 

        if (centralConnectionPoint) {
            centralInputLines.forEach(line => {
                if (line.alpha > 0.01 && line.progress > 0.01) {
                    ctx.beginPath();
                    ctx.moveTo(centralConnectionPoint.x, centralConnectionPoint.y);
                    const currentX = centralConnectionPoint.x + (line.toX - centralConnectionPoint.x) * line.progress;
                    const currentY = centralConnectionPoint.y + (line.toY - centralConnectionPoint.y) * line.progress;
                    ctx.lineTo(currentX, currentY);
                    ctx.strokeStyle = currentAnimColor; 
                    ctx.lineWidth = LINE_ACTIVE_STROKE_WIDTH * 0.9; 
                    ctx.globalAlpha = line.alpha;
                    ctx.stroke();
                }
            });
            ctx.globalAlpha = 1;
        }
        
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
            if (line.activationProgress > 0 || line.alpha > LINE_INACTIVE_ALPHA) {
                 ctx.moveTo(line.fromX, line.fromY);
                 ctx.lineTo(line.toX, line.toY);
                 ctx.strokeStyle = COLOR_DEFAULT_LINE;
                 ctx.lineWidth = LINE_INACTIVE_STROKE_WIDTH;
                 ctx.globalAlpha = LINE_INACTIVE_ALPHA;
                 ctx.stroke();
            }
            if (line.activationProgress > line.deactivationProgress) { 
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
            ctx.fillStyle = COLOR_NODE_FILL;
            ctx.globalAlpha = node.alpha;
            ctx.fill();
            ctx.strokeStyle = node.strokeColor;
            ctx.lineWidth = 1.5;
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

    }, [flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, centralConnectionPoint, animationBaseColor]);

    useLayoutEffect(() => {
        const animatables = animatablesRef.current;
        if (animatables.nodes.length === 0) return;
        
        if (!activations) { 
            animatables.centralInputLines.forEach(l => { l.progress = 0; l.alpha = 0; });
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
        const currentAnimBaseColor = animationBaseColor || '#FF69B4';

        const currentFlattenAct = getSampledActivations(activations[flattenLayerName], MAX_NODES_TO_DRAW);
        const currentHiddenAct = getSampledActivations(activations[hiddenDenseLayerName], MAX_NODES_TO_DRAW);
        const currentOutputAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
        const predictedOutputIndex = currentOutputAct.indexOf(Math.max(...currentOutputAct));
        
        const newTimeline = gsap.timeline();
        animatables.timeline = newTimeline; 

        // Deactivate old internal lines and nodes
        animatables.lines.forEach(l => { 
             if (l.isActivating) { 
                newTimeline.to(l, {
                    deactivationProgress: 1, activationProgress: 1, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH,
                    duration: ANIMATION_WAVE_DURATION * 0.5, delay: 0.1, 
                }, "<");
            }
            l.isActivating = false; l.waveKey = currentWave;
        });
        animatables.nodes.forEach(n => { 
             if (n.isActivating) {
                newTimeline.to(n, {
                    scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, textColor: COLOR_OUTPUT_TEXT, alpha: 1,
                    duration: NODE_PULSE_DURATION * 0.5, delay: 0.1,
                }, "<");
            }
            n.isActivating = false; n.isPredicted = false; n.waveKey = currentWave;
        });
        
        animatables.centralInputLines.forEach(line => {
            if (line.alpha > 0) { // If it was visible from a previous wave
                newTimeline.to(line, { progress: 0, alpha: 0, duration: ANIMATION_WAVE_DURATION * 0.3, ease: 'power1.in' }, "<");
            }
        });

        let timeOffset = 0;
        const centralLinesDuration = 0.35; 
        const layerAnimationDelay = 0.1; // Delay before starting next layer's animation

        // 1. Animate lines from Central Point to Flatten Layer Nodes
        if (centralConnectionPoint) {
            animatables.centralInputLines.forEach((line, index) => {
                const isActiveNode = currentFlattenAct[index] >= ACTIVATION_THRESHOLD;
                newTimeline.to(line, {
                    progress: 1,
                    alpha: isActiveNode ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, 
                    duration: centralLinesDuration,
                    delay: index * 0.03 
                }, timeOffset);
            });
        }
        
        // 2. Animate Flatten Layer Nodes
        let nodeCursor = 0; // For flatten nodes
        const flattenNodeActivationTime = timeOffset + centralLinesDuration * 0.4; // Start activating after lines begin drawing

        for (let i = 0; i < MAX_NODES_TO_DRAW; i++, nodeCursor++) {
             const node = animatables.nodes[nodeCursor]; 
             const isActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
             node.isActivating = true; node.waveKey = currentWave;
             if (isActive) {
                 newTimeline.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.out' }, flattenNodeActivationTime)
                          .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
             } else {
                 newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, duration: NODE_PULSE_DURATION}, flattenNodeActivationTime);
             }
        }
        timeOffset = flattenNodeActivationTime + NODE_PULSE_DURATION + layerAnimationDelay;
        
        // 3. Animate Flatten to Hidden Layer
        let lineCursor = 0; // For lines between flatten and hidden
        for (let i = 0; i < MAX_NODES_TO_DRAW; i++) {
            const fromNodeActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
            for (let j = 0; j < MAX_NODES_TO_DRAW; j++, lineCursor++) {
                 const line = animatables.lines[lineCursor];
                 const targetNodeActive = currentHiddenAct[j] >= ACTIVATION_THRESHOLD;
                 const isLineActive = fromNodeActive; // Line active if source node is active

                 line.isActivating = true; line.waveKey = currentWave;
                 line.deactivationProgress = 0;
                 newTimeline.to(line, {
                    activationProgress: 1, color: isLineActive ? (targetNodeActive ? currentAnimBaseColor : getSlightlyLighterShade(currentAnimBaseColor, 60)) : COLOR_DEFAULT_LINE,
                    alpha: isLineActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isLineActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                    duration: ANIMATION_WAVE_DURATION,
                }, timeOffset);
            }
        }
        // Hidden Layer Nodes (nodeCursor continues from flatten layer)
        const hiddenNodeActivationTime = timeOffset + ANIMATION_WAVE_DURATION * 0.3;
        for (let i = 0; i < MAX_NODES_TO_DRAW; i++, nodeCursor++) {
            const node = animatables.nodes[nodeCursor];
            const isActive = currentHiddenAct[i] >= ACTIVATION_THRESHOLD;
            node.isActivating = true; node.waveKey = currentWave;
            if (isActive) {
                newTimeline.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.out' }, hiddenNodeActivationTime)
                         .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
            } else {
                 newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, duration: NODE_PULSE_DURATION}, hiddenNodeActivationTime);
            }
        }
        timeOffset = hiddenNodeActivationTime + NODE_PULSE_DURATION + layerAnimationDelay;

        // 4. Animate Hidden to Output Layer
        // lineCursor continues
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
        // Output Layer Nodes (nodeCursor continues)
        const outputNodeActivationTime = timeOffset + ANIMATION_WAVE_DURATION * 0.3;
        for (let i = 0; i < EMNIST_CHARS.length; i++, nodeCursor++) {
            const node = animatables.nodes[nodeCursor];
            const isPredicted = i === predictedOutputIndex;
            const isSlightlyActive = currentOutputAct[i] > 0.05;
            
            node.isActivating = true; node.waveKey = currentWave;
            node.isPredicted = isPredicted;

            if (isPredicted || isSlightlyActive) {
                newTimeline.to(node, {
                    scale: isPredicted ? NODE_PULSE_SCALE_FACTOR * 1.1 : NODE_PULSE_SCALE_FACTOR,
                    strokeColor: isPredicted ? currentAnimBaseColor : currentAnimBaseColor, 
                    textColor: isPredicted ? currentAnimBaseColor : COLOR_OUTPUT_TEXT,
                    duration: NODE_PULSE_DURATION / 2, ease: 'power1.out'
                }, outputNodeActivationTime)
                .to(node, { scale: 1, duration: NODE_PULSE_DURATION / 2, ease: 'power1.in' });
            } else {
                 newTimeline.to(node, {scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, textColor: COLOR_OUTPUT_TEXT, duration: NODE_PULSE_DURATION}, outputNodeActivationTime);
            }
        }

        gsap.ticker.add(drawNetwork);
        newTimeline.eventCallback("onComplete", () => {
            gsap.ticker.remove(drawNetwork);
             animatables.lines.forEach(l => { if(l.waveKey === currentWave) l.isActivating = false;});
             animatables.nodes.forEach(n => { if(n.waveKey === currentWave) n.isActivating = false;});
             // Central lines will be reset by deactivation on the next wave
            drawNetwork(); 
        });
        newTimeline.eventCallback("onInterrupt", () => gsap.ticker.remove(drawNetwork) );
        return () => {
            gsap.ticker.remove(drawNetwork);
            if(newTimeline) newTimeline.kill();
        };

    }, [activations, softmaxProbabilities, animationBaseColor, flattenLayerName, hiddenDenseLayerName,
        animatablesRef, centralConnectionPoint,
        flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, drawNetwork ]); 

    return (
        <div>
            <canvas ref={networkCanvasRef} width={canvasWidth} height={CANVAS_HEIGHT} />
            {!activations && animatablesRef.current.centralInputLines.every(l => l.alpha === 0) && 
                <div style={{ color: COLOR_LAYER_LABEL, fontSize: '0.9em', marginTop: '10px', paddingLeft: `${FATTEN_LAYER_X - 200}px`, position: 'absolute', top: CANVAS_HEIGHT / 2 - 10, left: FATTEN_LAYER_X - 300, width: '200px', textAlign: 'center' }}>
                    Awaiting activation data...
                </div>
            }
        </div>
    );
};