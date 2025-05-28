// src/components/visualizations/NetworkGraphViz.tsx
import React, { useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { ActivationDataValue, AnimationWave } from '../../types';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import {
    NET_WAVE_DURATION,
    NET_NODE_PULSE_DURATION,
    NET_CENTRAL_LINE_DURATION,
    NET_LAYER_ANIMATION_DELAY,
} from '../../config/animation';


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

const LINE_ACTIVE_STROKE_WIDTH = 2.5;
const LINE_INACTIVE_STROKE_WIDTH = 0.7;
const LINE_ACTIVE_ALPHA = 0.9;
const LINE_INACTIVE_ALPHA = 0.15;
const NODE_INACTIVE_STROKE_COLOR = '#d0d4db';

export const FATTEN_LAYER_X = 550;

export interface NetworkGraphVizProps {
    waves: AnimationWave[];
    onWaveFinished: (waveId: string) => void;
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

interface AnimatableElement {
    alpha: number;
    waveId: string;
}

interface AnimatableLine extends AnimatableElement {
    id: string; fromX: number; fromY: number; toX: number; toY: number;
    activationProgress: number;
    color: string;
    strokeWidth: number;
}
interface AnimatableNode extends AnimatableElement {
    id: string; x: number; y: number; label?: string;
    scale: number;
    strokeColor: string;
    fillColor: string;
    textColor: string;
    isPredicted?: boolean;
}
interface CentralInputLine extends AnimatableElement {
    id: string;
    toX: number; toY: number;
    progress: number;
    color: string;
}

export const NetworkGraphViz: React.FC<NetworkGraphVizProps> = ({
    waves, onWaveFinished,
    flattenLayerName, hiddenDenseLayerName, outputLayerName,
    centralConnectionPoint
}) => {
    const networkCanvasRef = useRef<HTMLCanvasElement>(null);
    const animatablesRef = useRef<{
        lines: AnimatableLine[];
        nodes: AnimatableNode[];
        centralInputLines: CentralInputLine[];
    }>({ lines: [], nodes: [], centralInputLines: [] });

    const flattenNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X, CANVAS_HEIGHT, NODE_RADIUS), []);
    const hiddenDenseNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X + LAYER_GAP, CANVAS_HEIGHT, NODE_RADIUS), []);
    const outputNodePositions = useMemo(() => calculateNodePositions(EMNIST_CHARS.length, FATTEN_LAYER_X + LAYER_GAP * 2, CANVAS_HEIGHT, NODE_RADIUS), []);

    const canvasWidth = useMemo(() => {
        if (outputNodePositions.length > 0) {
            return outputNodePositions[0].x + NODE_RADIUS * 2 + 30;
        }
        return FATTEN_LAYER_X + (LAYER_GAP * 2) + NODE_RADIUS * 4 + 60;
    }, [outputNodePositions]);

    const drawNetwork = useCallback(() => {
        const canvas = networkCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const { lines, nodes, centralInputLines } = animatablesRef.current;

        if (centralConnectionPoint) {
            centralInputLines.forEach(line => {
                if (line.alpha > 0.01 && line.progress > 0.01) {
                    ctx.beginPath();
                    ctx.moveTo(centralConnectionPoint.x, centralConnectionPoint.y);
                    const currentX = centralConnectionPoint.x + (line.toX - centralConnectionPoint.x) * line.progress;
                    const currentY = centralConnectionPoint.y + (line.toY - centralConnectionPoint.y) * line.progress;
                    ctx.lineTo(currentX, currentY);
                    ctx.strokeStyle = line.color;
                    ctx.lineWidth = LINE_ACTIVE_STROKE_WIDTH * 0.9;
                    ctx.globalAlpha = line.alpha;
                    ctx.stroke();
                }
            });
        }

        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR_LAYER_LABEL;
        if (flattenNodePositions.length > 0) ctx.fillText('Flatten', flattenNodePositions[0].x, 15);
        if (hiddenDenseNodePositions.length > 0) ctx.fillText('Dense', hiddenDenseNodePositions[0].x, 15);
        if (outputNodePositions.length > 0) ctx.fillText('Output', outputNodePositions[0].x, 15);

        lines.forEach(line => {
            if (line.alpha > 0) {
                ctx.beginPath();
                ctx.moveTo(line.fromX, line.fromY);
                ctx.lineTo(line.toX, line.toY);
                ctx.strokeStyle = line.color;
                ctx.lineWidth = line.strokeWidth;
                ctx.globalAlpha = line.alpha;
                ctx.stroke();
            }
        });

        nodes.forEach(node => {
            if (node.alpha > 0) {
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
            }
        });
        ctx.globalAlpha = 1;

    }, [flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, centralConnectionPoint]);

    useEffect(() => {
        gsap.ticker.add(drawNetwork);
        return () => gsap.ticker.remove(drawNetwork);
    }, [drawNetwork]);

    useEffect(() => {
        waves.forEach(wave => {
            const existingAnimatables = animatablesRef.current.centralInputLines.some(l => l.waveId === wave.id);
            if (existingAnimatables) return;

            const { activations, softmaxProbabilities, color: currentAnimBaseColor, id: waveId } = wave;
            const currentFlattenAct = getSampledActivations(activations[flattenLayerName], MAX_NODES_TO_DRAW);
            const currentHiddenAct = getSampledActivations(activations[hiddenDenseLayerName], MAX_NODES_TO_DRAW);
            const currentOutputAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
            const predictedOutputIndex = currentOutputAct.indexOf(Math.max(...currentOutputAct));

            const newCentralLines: CentralInputLine[] = [];
            if (centralConnectionPoint) {
                flattenNodePositions.forEach((nodePos, index) => {
                    newCentralLines.push({
                        id: `cil-${waveId}-${index}`, waveId,
                        toX: nodePos.x, toY: nodePos.y,
                        progress: 0, alpha: 0, color: currentAnimBaseColor
                    });
                });
            }

            const newLines: AnimatableLine[] = [];
            let lineIdCounter = 0;
            flattenNodePositions.forEach(fromPos => {
                hiddenDenseNodePositions.forEach(toPos => {
                    newLines.push({
                        id: `l-fl-hd-${waveId}-${lineIdCounter++}`, waveId,
                        fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y,
                        activationProgress: 0, color: COLOR_DEFAULT_LINE, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH
                    });
                });
            });
            hiddenDenseNodePositions.forEach(fromPos => {
                outputNodePositions.forEach(toPos => {
                    newLines.push({
                        id: `l-hd-out-${waveId}-${lineIdCounter++}`, waveId,
                        fromX: fromPos.x, fromY: fromPos.y, toX: toPos.x, toY: toPos.y,
                        activationProgress: 0, color: COLOR_DEFAULT_LINE, alpha: LINE_INACTIVE_ALPHA, strokeWidth: LINE_INACTIVE_STROKE_WIDTH
                    });
                });
            });

            const newNodes: AnimatableNode[] = [];
            let nodeIdCounter = 0;
            flattenNodePositions.forEach((pos) => {
                newNodes.push({
                    id: `n-fl-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y,
                    scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1,
                });
            });
            hiddenDenseNodePositions.forEach(pos => {
                newNodes.push({
                    id: `n-hd-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y,
                    scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1,
                });
            });
            outputNodePositions.forEach((pos, i) => {
                newNodes.push({
                    id: `n-out-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y, label: EMNIST_CHARS[i],
                    scale: 1, strokeColor: NODE_INACTIVE_STROKE_COLOR, fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, isPredicted: false,
                });
            });

            animatablesRef.current.centralInputLines.push(...newCentralLines);
            animatablesRef.current.lines.push(...newLines);
            animatablesRef.current.nodes.push(...newNodes);

            const tl = gsap.timeline({
                onComplete: () => {
                    onWaveFinished(waveId);
                    animatablesRef.current.centralInputLines = animatablesRef.current.centralInputLines.filter(l => l.waveId !== waveId);
                    animatablesRef.current.lines = animatablesRef.current.lines.filter(l => l.waveId !== waveId);
                    animatablesRef.current.nodes = animatablesRef.current.nodes.filter(n => n.waveId !== waveId);
                }
            });

            let timeOffset = 0;
            const NODE_PULSE_SCALE_FACTOR = 1.5;

            if (centralConnectionPoint) {
                newCentralLines.forEach((line, index) => {
                    const isActiveNode = currentFlattenAct[index] >= ACTIVATION_THRESHOLD;
                    tl.to(line, {
                        progress: 1,
                        alpha: isActiveNode ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA,
                        duration: NET_CENTRAL_LINE_DURATION,
                        delay: index * 0.03
                    }, timeOffset);
                });
            }

            const flattenNodeActivationTime = timeOffset + NET_CENTRAL_LINE_DURATION * 0.4;
            newNodes.slice(0, MAX_NODES_TO_DRAW).forEach((node, i) => {
                const isActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
                if (isActive) {
                    tl.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.out' }, flattenNodeActivationTime)
                      .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.in' });
                }
            });
            timeOffset = flattenNodeActivationTime + NET_NODE_PULSE_DURATION + NET_LAYER_ANIMATION_DELAY;

            let lineCursor = 0;
            for (let i = 0; i < MAX_NODES_TO_DRAW; i++) {
                const fromNodeActive = currentFlattenAct[i] >= ACTIVATION_THRESHOLD;
                for (let j = 0; j < MAX_NODES_TO_DRAW; j++, lineCursor++) {
                    const line = newLines[lineCursor];
                    const targetNodeActive = currentHiddenAct[j] >= ACTIVATION_THRESHOLD;
                    const isLineActive = fromNodeActive;
                    tl.to(line, {
                        activationProgress: 1, color: isLineActive ? (targetNodeActive ? currentAnimBaseColor : getSlightlyLighterShade(currentAnimBaseColor, 60)) : COLOR_DEFAULT_LINE,
                        alpha: isLineActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isLineActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                        duration: NET_WAVE_DURATION,
                    }, timeOffset);
                }
            }

            const hiddenNodeActivationTime = timeOffset + NET_WAVE_DURATION * 0.3;
            newNodes.slice(MAX_NODES_TO_DRAW, MAX_NODES_TO_DRAW * 2).forEach((node, i) => {
                const isActive = currentHiddenAct[i] >= ACTIVATION_THRESHOLD;
                if (isActive) {
                    tl.to(node, { scale: NODE_PULSE_SCALE_FACTOR, strokeColor: currentAnimBaseColor, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.out' }, hiddenNodeActivationTime)
                      .to(node, { scale: 1, strokeColor: currentAnimBaseColor, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.in' });
                }
            });
            timeOffset = hiddenNodeActivationTime + NET_NODE_PULSE_DURATION + NET_LAYER_ANIMATION_DELAY;

            for (let i = 0; i < MAX_NODES_TO_DRAW; i++) {
                const fromNodeActive = currentHiddenAct[i] >= ACTIVATION_THRESHOLD;
                for (let j = 0; j < EMNIST_CHARS.length; j++, lineCursor++) {
                    const line = newLines[lineCursor];
                    const isTargetPredicted = j === predictedOutputIndex;
                    const targetNodeSlightlyActive = currentOutputAct[j] > 0.05;
                    const isLineActive = fromNodeActive;
                    tl.to(line, {
                        activationProgress: 1, color: isLineActive ? (isTargetPredicted ? currentAnimBaseColor : (targetNodeSlightlyActive ? currentAnimBaseColor : getSlightlyLighterShade(currentAnimBaseColor, 70))) : COLOR_DEFAULT_LINE,
                        alpha: isLineActive ? LINE_ACTIVE_ALPHA : LINE_INACTIVE_ALPHA, strokeWidth: isLineActive ? LINE_ACTIVE_STROKE_WIDTH : LINE_INACTIVE_STROKE_WIDTH,
                        duration: NET_WAVE_DURATION,
                    }, timeOffset);
                }
            }

            const outputNodeActivationTime = timeOffset + NET_WAVE_DURATION * 0.3;
            newNodes.slice(MAX_NODES_TO_DRAW * 2).forEach((node, i) => {
                const isPredicted = i === predictedOutputIndex;
                const isSlightlyActive = currentOutputAct[i] > 0.05;
                if (isPredicted || isSlightlyActive) {
                    tl.to(node, {
                        scale: isPredicted ? NODE_PULSE_SCALE_FACTOR * 1.1 : NODE_PULSE_SCALE_FACTOR,
                        strokeColor: isPredicted ? currentAnimBaseColor : currentAnimBaseColor,
                        textColor: isPredicted ? currentAnimBaseColor : COLOR_OUTPUT_TEXT,
                        duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.out'
                    }, outputNodeActivationTime)
                    .to(node, { scale: 1, duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.in' });
                }
            });

        });
    }, [waves, flattenLayerName, hiddenDenseLayerName, outputLayerName, onWaveFinished,
        flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, centralConnectionPoint]);

    return (
        <div>
            <canvas ref={networkCanvasRef} width={canvasWidth} height={CANVAS_HEIGHT} />
            {waves.length === 0 &&
                <div style={{ color: COLOR_LAYER_LABEL, fontSize: '0.9em', marginTop: '10px', paddingLeft: `${FATTEN_LAYER_X - 200}px`, position: 'absolute', top: CANVAS_HEIGHT / 2 - 10, left: FATTEN_LAYER_X - 300, width: '200px', textAlign: 'center' }}>
                    Awaiting activation data...
                </div>
            }
        </div>
    );
};