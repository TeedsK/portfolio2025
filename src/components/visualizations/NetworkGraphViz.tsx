// src/components/visualizations/NetworkGraphViz.tsx
import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { ActivationDataValue, AnimationWave, Point } from '../../types';
import gsap from 'gsap';
import { 
    NET_NODE_PULSE_DURATION,
    NET_LAYER_ANIMATION_DELAY,
    NET_ALPHA_PREDICTED_LINE,
    NET_ALPHA_OTHER_ACTIVE_MIN,
    NET_ALPHA_OTHER_ACTIVE_MAX,
    NET_ALPHA_INACTIVE_LINE
} from '../../config/animation';
import { drawPathSegment } from '../../utils/canvasDrawing'; 

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

const COLOR_DEFAULT_LINE = '#DDDDDD'; 
const COLOR_NODE_FILL = '#ffffff';
const COLOR_OUTPUT_TEXT = '#333333';
const COLOR_LAYER_LABEL = '#555555';
const NODE_RADIUS = 7;
const LAYER_GAP = 180;
const CANVAS_HEIGHT = 500;
const ACTIVATION_THRESHOLD = 0.05; 
const MAX_NODES_TO_DRAW = 10;

const LINE_INACTIVE_STROKE_WIDTH = 0.7;
const LINE_ACTIVE_WIDTH = 2.5;

const NODE_INACTIVE_STROKE_COLOR = '#d0d4db';
export const FATTEN_LAYER_X = 550;

const NET_LINE_GROW_DURATION = 0.3;
const NET_LINE_SHRINK_DURATION = 0.3;

interface NetworkGraphVizProps {
    waves: AnimationWave[]; 
    onWaveFinished: (waveId: string) => void;
    flattenLayerName: string;
    hiddenDenseLayerName: string;
    outputLayerName: string;
    centralConnectionPoint?: Point;
}

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

const calculateNodePositions = (count: number, x: number, totalHeight: number, nodeRadiusValue: number): Point[] => {
    const availableHeight = totalHeight - nodeRadiusValue * 4;
    const yStep = count <= 1 ? availableHeight / 2 : availableHeight / (count - 1 || 1);
    const startY = nodeRadiusValue * 2;
    return Array.from({ length: count }).map((_el, i) => ({ x: x, y: startY + i * yStep }));
};

interface AnimatableLine { 
    id: string; 
    waveId: string;
    from: Point; 
    to: Point;
    totalLength: number;
    headProgress: number; 
    tailProgress: number; 
    gradientSet: string[];
    activationStrength: number; // Strength of the source node (or target for central-to-flatten)
    displayAlpha: number; 
    isToPredictedOutputNode?: boolean; 
}
interface AnimatableNode { 
    id: string; 
    waveId: string;
    x: number; y: number; label?: string;
    scale: number;
    strokeColor: string; 
    fillColor: string;
    textColor: string;
    alpha: number; 
    isPredicted?: boolean;
}


export const NetworkGraphViz: React.FC<NetworkGraphVizProps> = ({
    waves, onWaveFinished,
    flattenLayerName, hiddenDenseLayerName, outputLayerName,
    centralConnectionPoint
}) => {
    const networkCanvasRef = useRef<HTMLCanvasElement>(null);
    const allLinesRef = useRef<AnimatableLine[]>([]);
    const allNodesRef = useRef<AnimatableNode[]>([]);
    const activeTimelines = useRef(new Map<string, gsap.core.Timeline>()).current;

    const flattenNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X, CANVAS_HEIGHT, NODE_RADIUS), []);
    const hiddenDenseNodePositions = useMemo(() => calculateNodePositions(MAX_NODES_TO_DRAW, FATTEN_LAYER_X + LAYER_GAP, CANVAS_HEIGHT, NODE_RADIUS), []);
    const outputNodePositions = useMemo(() => calculateNodePositions(EMNIST_CHARS.length, FATTEN_LAYER_X + LAYER_GAP * 2, CANVAS_HEIGHT, NODE_RADIUS), []);

    const canvasWidth = useMemo(() => {
        if (outputNodePositions.length > 0) {
            return outputNodePositions[0].x + NODE_RADIUS * 2 + 30;
        }
        return FATTEN_LAYER_X + (LAYER_GAP * 2) + NODE_RADIUS * 4 + 60;
    }, [outputNodePositions]);

    const getLineLength = (p0: Point, p1: Point) => Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));

    const drawNetwork = useCallback((ctx: CanvasRenderingContext2D) => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLOR_LAYER_LABEL;
        if (flattenNodePositions.length > 0) ctx.fillText('Flatten', flattenNodePositions[0].x, 15);
        if (hiddenDenseNodePositions.length > 0) ctx.fillText('Dense', hiddenDenseNodePositions[0].x, 15);
        if (outputNodePositions.length > 0) ctx.fillText('Output', outputNodePositions[0].x, 15);

        allLinesRef.current.forEach(line => {
            if (line.displayAlpha < 0.01) return;

            ctx.globalAlpha = line.displayAlpha;
            let strokeStyle: string | CanvasGradient = COLOR_DEFAULT_LINE;
            
            const isActiveLineForGradient = line.activationStrength > ACTIVATION_THRESHOLD;

            if (isActiveLineForGradient && line.gradientSet.length > 0) {
                const gradient = ctx.createLinearGradient(line.from.x, line.from.y, line.to.x, line.to.y);
                line.gradientSet.forEach((color, index) => {
                    gradient.addColorStop(Math.min(1, index / (line.gradientSet.length - 1 || 1)), color);
                });
                strokeStyle = gradient;
            } else { 
                 strokeStyle = COLOR_DEFAULT_LINE; 
            }

            if (isActiveLineForGradient && (line.headProgress > line.tailProgress || (line.headProgress === 1 && line.tailProgress < 1))) {
                 drawPathSegment(
                    ctx,
                    { p0: line.from, p1: line.to, totalLength: line.totalLength },
                    line.tailProgress * line.totalLength,
                    line.headProgress * line.totalLength,
                    strokeStyle,
                    LINE_ACTIVE_WIDTH
                );
            } else if (!isActiveLineForGradient && line.displayAlpha >= NET_ALPHA_INACTIVE_LINE) { 
                ctx.beginPath();
                ctx.moveTo(line.from.x, line.from.y);
                ctx.lineTo(line.to.x, line.to.y);
                ctx.strokeStyle = strokeStyle; 
                ctx.lineWidth = LINE_INACTIVE_STROKE_WIDTH;
                ctx.stroke();
            }
        });
        
        ctx.globalAlpha = 1; 

        allNodesRef.current.forEach(node => {
            if (node.alpha <= 0.01) return;
            ctx.save();
            ctx.globalAlpha = node.alpha;
            ctx.translate(node.x, node.y);
            ctx.scale(node.scale, node.scale);
            ctx.beginPath();
            ctx.arc(0, 0, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = node.fillColor;
            ctx.fill();
            ctx.strokeStyle = node.strokeColor;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            if (node.label) {
                ctx.fillStyle = node.isPredicted ? node.strokeColor : node.textColor; 
                ctx.font = `bold 9px sans-serif`; 
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(node.label.toUpperCase(), 0, 0);
            }
            ctx.restore();
        });

    }, [flattenNodePositions, hiddenDenseNodePositions, outputNodePositions]);

    useEffect(() => {
        const canvas = networkCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const renderLoop = () => {
            drawNetwork(ctx);
            requestAnimationFrame(renderLoop);
        };
        const animFrameId = requestAnimationFrame(renderLoop);
        return () => {
            cancelAnimationFrame(animFrameId);
            activeTimelines.forEach(timeline => timeline.kill());
            activeTimelines.clear();
        };
    }, [drawNetwork, activeTimelines]);

    useEffect(() => {
        waves.forEach(wave => {
            if (activeTimelines.has(wave.id)) return;

            const { activations, softmaxProbabilities, gradientSet, id: waveId } = wave;
            const nodePulseColor = gradientSet[0] || '#FF69B4'; 

            const currentFlattenAct = getSampledActivations(activations[flattenLayerName], MAX_NODES_TO_DRAW);
            const currentHiddenAct = getSampledActivations(activations[hiddenDenseLayerName], MAX_NODES_TO_DRAW);
            const currentOutputAct = softmaxProbabilities || new Array(EMNIST_CHARS.length).fill(0);
            const predictedOutputIndex = currentOutputAct.indexOf(Math.max(...currentOutputAct));

            const waveLines: AnimatableLine[] = [];
            const waveNodes: AnimatableNode[] = [];
            let lineIdCounter = 0;
            let nodeIdCounter = 0;

            // UPDATED getDisplayAlpha function
            const getDisplayAlpha = (
                sourceStrength: number,
                targetStrength: number,
                isLineToOverallPredictedOutputNode: boolean
            ) => {
                const isSourceActive = sourceStrength > ACTIVATION_THRESHOLD;
                const isTargetActive = targetStrength > ACTIVATION_THRESHOLD;

                // Condition 1: Both source and target nodes for THIS line segment are active.
                if (isSourceActive && isTargetActive) {
                    return NET_ALPHA_PREDICTED_LINE; // Solid
                }

                // Condition 2: Line is part of the path to the *overall predicted character* AND the source of THIS line segment is active.
                if (isLineToOverallPredictedOutputNode && isSourceActive) {
                    return NET_ALPHA_PREDICTED_LINE; // Solid
                }

                // Condition 3: Source is active, but target is not (and not covered by Condition 1 or 2).
                if (isSourceActive) {
                    const normalizedStrength = Math.max(0, Math.min(1, (sourceStrength - ACTIVATION_THRESHOLD) / (1.0 - ACTIVATION_THRESHOLD || 1)));
                    return NET_ALPHA_OTHER_ACTIVE_MIN + normalizedStrength * (NET_ALPHA_OTHER_ACTIVE_MAX - NET_ALPHA_OTHER_ACTIVE_MIN);
                }

                // Condition 4: Source is not active.
                return NET_ALPHA_INACTIVE_LINE;
            };
            
            if (centralConnectionPoint) {
                const sourceStrengthForCentral = 1.0; // Conceptual strength for the wave origin
                flattenNodePositions.forEach((nodePos, index) => {
                    const targetStrength = currentFlattenAct[index];
                    waveLines.push({
                        id: `l-cen-fl-${waveId}-${lineIdCounter++}`, waveId,
                        from: centralConnectionPoint, to: nodePos,
                        totalLength: getLineLength(centralConnectionPoint, nodePos),
                        headProgress: 0, tailProgress: 0, gradientSet,
                        activationStrength: targetStrength, // Line's own animation driven by target's activation
                        displayAlpha: getDisplayAlpha(sourceStrengthForCentral, targetStrength, false) 
                    });
                });
            }
            
            flattenNodePositions.forEach((fromPos, i) => {
                const sourceStrength = currentFlattenAct[i];
                hiddenDenseNodePositions.forEach((toPos, j_idx) => {
                    const targetStrength = currentHiddenAct[j_idx];
                    waveLines.push({
                        id: `l-fl-hd-${waveId}-${lineIdCounter++}`, waveId,
                        from: fromPos, to: toPos,
                        totalLength: getLineLength(fromPos, toPos),
                        headProgress: 0, tailProgress: 0, gradientSet,
                        activationStrength: sourceStrength,
                        displayAlpha: getDisplayAlpha(sourceStrength, targetStrength, false)
                    });
                });
            });
            
            hiddenDenseNodePositions.forEach((fromPos, i) => {
                const sourceStrength = currentHiddenAct[i];
                outputNodePositions.forEach((toPos, j) => {
                    const targetStrength = currentOutputAct[j];
                    const isLineToPredictedNode = (j === predictedOutputIndex);
                    waveLines.push({
                        id: `l-hd-out-${waveId}-${lineIdCounter++}`, waveId,
                        from: fromPos, to: toPos,
                        totalLength: getLineLength(fromPos, toPos),
                        headProgress: 0, tailProgress: 0, gradientSet,
                        activationStrength: sourceStrength,
                        displayAlpha: getDisplayAlpha(sourceStrength, targetStrength, isLineToPredictedNode),
                        isToPredictedOutputNode: isLineToPredictedNode
                    });
                });
            });
            
            flattenNodePositions.forEach((pos, i) => { // Added index i for currentFlattenAct
                 waveNodes.push({
                    id: `n-fl-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y,
                    scale: 1, strokeColor: currentFlattenAct[i] > ACTIVATION_THRESHOLD ? nodePulseColor : NODE_INACTIVE_STROKE_COLOR, 
                    fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1,
                });
            });
            hiddenDenseNodePositions.forEach((pos, i) => { // Added index i for currentHiddenAct
                 waveNodes.push({
                    id: `n-hd-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y,
                    scale: 1, strokeColor: currentHiddenAct[i] > ACTIVATION_THRESHOLD ? nodePulseColor : NODE_INACTIVE_STROKE_COLOR, 
                    fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1,
                });
            });
            outputNodePositions.forEach((pos, i) => {
                const isPredictedAndActive = (i === predictedOutputIndex && currentOutputAct[i] > ACTIVATION_THRESHOLD);
                waveNodes.push({
                    id: `n-out-${waveId}-${nodeIdCounter++}`, waveId, x: pos.x, y: pos.y, label: EMNIST_CHARS[i],
                    scale: 1, 
                    strokeColor: isPredictedAndActive ? nodePulseColor : (currentOutputAct[i] > ACTIVATION_THRESHOLD ? nodePulseColor : NODE_INACTIVE_STROKE_COLOR),
                    fillColor: COLOR_NODE_FILL, textColor: COLOR_OUTPUT_TEXT, alpha: 1, 
                    isPredicted: (i === predictedOutputIndex),
                });
            });

            allLinesRef.current.push(...waveLines);
            allNodesRef.current.push(...waveNodes);
            
            const tl = gsap.timeline({
                onComplete: () => {
                    activeTimelines.delete(waveId);
                    onWaveFinished(waveId);
                    allLinesRef.current = allLinesRef.current.filter(l => l.waveId !== waveId);
                    allNodesRef.current = allNodesRef.current.filter(n => n.waveId !== waveId);
                }
            });
            activeTimelines.set(waveId, tl);

            let currentTime = 0;

            const animateLayerConnections = (
                linesForLayer: AnimatableLine[], 
                nodesForLayer: AnimatableNode[], 
                nodeActivations: number[], // Activations for the TARGET nodes of these lines generally
                isOutputLayerPass: boolean = false 
            ) => {
                linesForLayer.forEach(line => {
                    // Line animation (snake) is driven by its own activationStrength (source node's strength)
                    if (line.activationStrength > ACTIVATION_THRESHOLD) { 
                        tl.to(line, { headProgress: 1, duration: NET_LINE_GROW_DURATION, ease: 'linear' }, currentTime);
                        tl.to(line, { tailProgress: 1, duration: NET_LINE_SHRINK_DURATION, ease: 'linear' }, currentTime + NET_LINE_GROW_DURATION);
                    }
                });
                
                const nodePulseStartTime = currentTime + NET_LINE_GROW_DURATION * 0.5; // Start node pulse slightly before line finishes arriving
                nodesForLayer.forEach((node, i) => {
                    // Node activation check based on its own activation value from the correct layer's activation array
                    const actualNodeActivation = 
                        node.id.startsWith('n-fl-') ? currentFlattenAct[i] :
                        node.id.startsWith('n-hd-') ? currentHiddenAct[i] :
                        node.id.startsWith('n-out-') ? currentOutputAct[i] : 0;

                    if (actualNodeActivation >= ACTIVATION_THRESHOLD) {
                        let specificNodePulseColor = nodePulseColor;
                        let specificNodeTextColor = COLOR_OUTPUT_TEXT; // Default text color
                        
                        if(node.id.startsWith('n-out-') && node.isPredicted){
                            specificNodePulseColor = gradientSet[0] || nodePulseColor; 
                            // Text color for predicted output node should be its pulse color for emphasis
                            specificNodeTextColor = specificNodePulseColor; 
                        } else if (node.id.startsWith('n-out-')) {
                            // Other output nodes that are active but not predicted
                            specificNodeTextColor = nodePulseColor; // color text to match pulse
                        }


                        tl.to(node, { 
                            scale: (node.id.startsWith('n-out-') && node.isPredicted) ? 1.6 : 1.5, 
                            strokeColor: specificNodePulseColor, 
                            textColor: specificNodeTextColor, // Apply potentially updated text color
                            duration: NET_NODE_PULSE_DURATION / 2, 
                            ease: 'power1.out' 
                        }, nodePulseStartTime)
                          .to(node, { 
                              scale: 1, 
                              strokeColor: node.id.startsWith('n-out-') && node.isPredicted ? specificNodePulseColor : (actualNodeActivation > ACTIVATION_THRESHOLD ? nodePulseColor : NODE_INACTIVE_STROKE_COLOR), // Keep predicted output highlighted
                              textColor: node.id.startsWith('n-out-') && node.isPredicted ? specificNodeTextColor : COLOR_OUTPUT_TEXT, // Revert non-predicted text color
                           duration: NET_NODE_PULSE_DURATION / 2, ease: 'power1.in' 
                          });
                    }
                });
                return nodePulseStartTime + NET_NODE_PULSE_DURATION + NET_LAYER_ANIMATION_DELAY;
            };
            
            // For animateLayerConnections, nodeActivations should correspond to the layer the *nodes* belong to
            currentTime = animateLayerConnections(waveLines.filter(l => l.id.startsWith('l-cen-fl')), waveNodes.filter(n => n.id.startsWith('n-fl-')), currentFlattenAct);
            currentTime = animateLayerConnections(waveLines.filter(l => l.id.startsWith('l-fl-hd')), waveNodes.filter(n => n.id.startsWith('n-hd-')), currentHiddenAct);
            currentTime = animateLayerConnections(waveLines.filter(l => l.id.startsWith('l-hd-out')), waveNodes.filter(n => n.id.startsWith('n-out-')), currentOutputAct, true);

        });
    }, [waves, onWaveFinished, flattenLayerName, hiddenDenseLayerName, outputLayerName, 
        centralConnectionPoint, flattenNodePositions, hiddenDenseNodePositions, outputNodePositions, activeTimelines, drawNetwork]);

    return (
        <div>
            <canvas ref={networkCanvasRef} width={canvasWidth} height={CANVAS_HEIGHT} />
            {waves.length === 0 && allLinesRef.current.length === 0 &&
                <div style={{ color: COLOR_LAYER_LABEL, fontSize: '0.9em', marginTop: '10px', paddingLeft: `${FATTEN_LAYER_X - 200}px`, position: 'absolute', top: CANVAS_HEIGHT / 2 - 10, left: FATTEN_LAYER_X - 300, width: '200px', textAlign: 'center' }}>
                    Awaiting activation data...
                </div>
            }
        </div>
    );
};