// src/components/visualizations/NetworkGraphViz.tsx
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { ActivationData, ActivationDataValue } from '../../types';
import gsap from 'gsap';
const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

interface Props {
    activations: ActivationData | null;
    softmaxProbabilities: number[] | null;
    currentCharImageData: ImageData | null; // Receive ImageData
    // Layer names
    flattenLayerName: string;
    hiddenDenseLayerName: string;
    outputLayerName: string;
}

// --- Styling Constants ---
const COLOR_PRIMARY_BLUE = '#456cff';
const COLOR_LIGHT_BLUE = '#a0b4ff';
const COLOR_DEFAULT_LINE = '#6a6f76';
const COLOR_DEFAULT_NODE_OUTLINE = '#d0d4db'; // Slightly darker default outline
const COLOR_NODE_FILL = '#ffffff';
const COLOR_OUTPUT_TEXT = '#333333'; // Darker text
const COLOR_PREDICTED_TEXT = COLOR_PRIMARY_BLUE;
// const OUTPUT_NODE_FONT_SIZE = 17;

// --- Layout Constants ---
const MAX_NODES_TO_DRAW = 10;
const NODE_RADIUS = 7; // Slightly larger for text
const LAYER_GAP = 180;
const SVG_WIDTH = 700;
const SVG_HEIGHT = 500; // Increased height slightly more
const INPUT_IMG_SIZE = 56;
const ACTIVATION_THRESHOLD = 0.5; // Threshold for a line/node to be considered "active"
const ANIMATION_DURATION = 0.1; // Duration for color/opacity tweens
const STAGGER_DELAY = 0.0; // Delay between animating layers

// --- Helper Functions (getSampledActivations, calculateNodePositions - same as before) ---
const getSampledActivations = (data: ActivationDataValue | undefined | null, count: number): number[] => {
    if (!data || !Array.isArray(data)) return new Array(count).fill(0);
    const flatData = data.flat(Infinity).filter(n => typeof n === 'number');
    if (flatData.length === 0) return new Array(count).fill(0);
    if (flatData.length < count) return [...flatData, ...new Array(count - flatData.length).fill(0)];
    const step = Math.floor(flatData.length / count);
    const sampled: number[] = [];
    for (let i = 0; i < count; i++) sampled.push(flatData[i * step]);
    return sampled.map(val => Math.max(0, Math.min(1, val))); // Clamp 0-1
};

const calculateNodePositions = (count: number, x: number, totalHeight: number, nodeRadius: number): { x: number, y: number }[] => {
    const availableHeight = totalHeight - nodeRadius * 4;
    const yStep = count <= 1 ? availableHeight / 2 : availableHeight / (count - 1);
    const startY = nodeRadius * 2;
    return Array.from({ length: count }).map((_, i) => ({ x: x, y: startY + i * yStep }));
};


// --- Component ---
export const NetworkGraphViz: React.FC<Props> = ({
    activations,
    softmaxProbabilities,
    currentCharImageData,
    flattenLayerName,
    hiddenDenseLayerName,
}) => {
    const inputCanvasRef = useRef<HTMLCanvasElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const gsapContext = useRef<gsap.Context | null>(null); // Store GSAP context for cleanup

    // Layer X positions - shifted right for input image
    const inputVisX = 35; // Center of input image viz
    const flattenX = inputVisX + LAYER_GAP;
    const hiddenDenseX = flattenX + LAYER_GAP;
    const outputX = hiddenDenseX + LAYER_GAP;

    // Get activations
    const flattenNodesActivation = getSampledActivations(activations ? activations[flattenLayerName] : null, MAX_NODES_TO_DRAW);
    const hiddenDenseNodesActivation = getSampledActivations(activations ? activations[hiddenDenseLayerName] : null, MAX_NODES_TO_DRAW);
    const outputNodesActivation = softmaxProbabilities || new Array(26).fill(0);
    const predictedIndex = outputNodesActivation.indexOf(Math.max(...outputNodesActivation));

    // Calculate node positions
    const flattenNodePositions = calculateNodePositions(MAX_NODES_TO_DRAW, flattenX, SVG_HEIGHT, NODE_RADIUS);
    const hiddenDenseNodePositions = calculateNodePositions(MAX_NODES_TO_DRAW, hiddenDenseX, SVG_HEIGHT, NODE_RADIUS);
    const outputNodePositions = calculateNodePositions(26, outputX, SVG_HEIGHT, NODE_RADIUS);

    // Effect to draw the input character image onto the canvas
    useEffect(() => {
        if (inputCanvasRef.current && currentCharImageData) {
            const canvas = inputCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Scale 28x28 ImageData up to INPUT_IMG_SIZE x INPUT_IMG_SIZE
                // Create temporary canvas to hold the ImageData
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = currentCharImageData.width; // Should be 28
                tempCanvas.height = currentCharImageData.height; // Should be 28
                const tempCtx = tempCanvas.getContext('2d');
                if (tempCtx) {
                    tempCtx.putImageData(currentCharImageData, 0, 0);
                    // Clear target canvas and draw scaled image with crisp edges
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = false; // Use nearest-neighbor scaling
                    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
                }
            }
        } else if (inputCanvasRef.current) {
            // Clear canvas if no image data
            const ctx = inputCanvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, inputCanvasRef.current.width, inputCanvasRef.current.height);
        }
    }, [currentCharImageData]);

    // --- Line Activation Styling ---
    // Color based on source node activation
    // const getLineStyle = (sourceActivation: number): React.CSSProperties => {
    //     const activation = Math.max(0, Math.min(1, sourceActivation)); // Clamp
    //     // Fade from light gray to bright green
    //     const greenIntensity = Math.floor(activation * 200); // Max green ~200
    //     const blueIntensity = Math.floor(activation * 50); // Add a hint of blue?
    //     const redIntensity = 0;
    //     const color = `rgb(${redIntensity}, ${greenIntensity}, ${blueIntensity})`;
    //     // Opacity based on activation (more visible if active)
    //     const opacity = 0.1 + activation * 0.8;
    //     return {
    //         stroke: color,
    //         strokeOpacity: opacity,
    //         transition: 'stroke 0.3s ease, stroke-opacity 0.3s ease' // Animate color change
    //     };
    // };

    // --- GSAP Animations for Nodes and Lines ---
    useLayoutEffect(() => {
        if (!svgRef.current) return;

        // Create GSAP context for proper cleanup
        gsapContext.current = gsap.context(() => {
            if (!activations) { // If activations are cleared, reset styles quickly
                gsap.to(".node-fl, .node-hd", { stroke: COLOR_DEFAULT_NODE_OUTLINE, duration: 0.1 });
                gsap.to(".line-fl-hd, .line-hd-out", { stroke: COLOR_DEFAULT_LINE, strokeOpacity: 0.2, duration: 0.1 });
                gsap.to(".node-out-txt", { fill: COLOR_OUTPUT_TEXT, duration: 0.1 });
                gsap.to(".node-out-circ", { stroke: 'none', strokeWidth: 0, duration: 0.1 });
                return;
            }

            const tl = gsap.timeline(); // Create a timeline for sequential animations

            // == Layer 1: Flatten ==
            // Animate Flatten nodes based on activation
            flattenNodePositions.forEach((_, i) => {
                const activation = flattenNodesActivation[i];
                const isActive = activation >= ACTIVATION_THRESHOLD;
                const strokeColor = isActive
                    ? gsap.utils.interpolate(COLOR_LIGHT_BLUE, COLOR_PRIMARY_BLUE, activation) // Interpolate 0..1 -> light..dark blue
                    : COLOR_DEFAULT_NODE_OUTLINE;
                tl.to(`.n-fl-${i}`, { stroke: strokeColor, duration: ANIMATION_DURATION, ease: 'power1.inOut' }, 0); // Animate at time 0
            });
            // Animate Flatten -> Hidden Dense lines based on *source* activation
            flattenNodePositions.forEach((_, i) => {
                 const activation = flattenNodesActivation[i];
                 const isActive = activation >= ACTIVATION_THRESHOLD;
                 tl.to(`.l-fl-hd-${i}`, { // Target lines originating from node i
                     stroke: isActive ? COLOR_PRIMARY_BLUE : COLOR_DEFAULT_LINE,
                     strokeOpacity: isActive ? 0.6 : 0.2,
                     duration: ANIMATION_DURATION,
                     ease: 'power1.inOut'
                 }, 0); // Animate lines at the same time as source nodes
             });

            // == Layer 2: Hidden Dense ==
            // Animate Hidden Dense nodes (staggered start)
            hiddenDenseNodePositions.forEach((_, i) => {
                const activation = hiddenDenseNodesActivation[i];
                const isActive = activation >= ACTIVATION_THRESHOLD;
                const strokeColor = isActive
                    ? gsap.utils.interpolate(COLOR_LIGHT_BLUE, COLOR_PRIMARY_BLUE, activation)
                    : COLOR_DEFAULT_NODE_OUTLINE;
                tl.to(`.n-hd-${i}`, { stroke: strokeColor, duration: ANIMATION_DURATION, ease: 'power1.inOut' }, STAGGER_DELAY); // Start after delay
            });
             // Animate Hidden Dense -> Output lines (staggered start)
             hiddenDenseNodePositions.forEach((_, i) => {
                 const activation = hiddenDenseNodesActivation[i];
                 const isActive = activation >= ACTIVATION_THRESHOLD;
                 tl.to(`.l-hd-out-${i}`, {
                     stroke: isActive ? COLOR_PRIMARY_BLUE : COLOR_DEFAULT_LINE,
                     strokeOpacity: isActive ? 0.6 : 0.2,
                     duration: ANIMATION_DURATION,
                     ease: 'power1.inOut'
                 }, STAGGER_DELAY); // Start lines with their source nodes
             });

             // == Layer 3: Output ==
             // Animate Output nodes (staggered start)
             outputNodePositions.forEach((_, i) => {
                 const isPredicted = i === predictedIndex;
                 // Animate text color
                 tl.to(`.n-out-txt-${i}`, {
                     fill: isPredicted ? COLOR_PREDICTED_TEXT : COLOR_OUTPUT_TEXT,
                     duration: ANIMATION_DURATION,
                     ease: 'power1.inOut'
                 }, STAGGER_DELAY * 2); // Start after second delay

                 // Animate circle stroke for predicted
                  tl.to(`.n-out-circ-${i}`, {
                      stroke: isPredicted ? COLOR_PREDICTED_TEXT : 'none',
                      strokeWidth: isPredicted ? 1.5 : 0,
                      duration: ANIMATION_DURATION,
                      ease: 'power1.inOut'
                  }, STAGGER_DELAY * 2);
             });

             // Add pulse effect to predicted output node *after* initial animation
             if (predictedIndex !== -1) {
                 tl.to(`.n-out-circ-${predictedIndex}`, {
                     scale: 1.4, // Pulse size
                     transformOrigin: "center center",
                     duration: ANIMATION_DURATION / 2,
                     ease: 'power1.inOut',
                     yoyo: true, // Go back to original size
                     repeat: 1 // Pulse once
                 }, STAGGER_DELAY * 2 + ANIMATION_DURATION / 2); // Start slightly after color change completes
             }


        }, svgRef); // Scope GSAP context to the SVG

        // Cleanup function
        return () => gsapContext.current?.revert();

    }, [activations, softmaxProbabilities, predictedIndex, flattenNodesActivation, hiddenDenseNodesActivation]); // Rerun GSAP effect when these change



    return (
        <div>
            <h4 style={{ marginBottom: '10px', fontWeight: 'normal' }}>Network Activation Flow (Sampled)</h4>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Input Character Canvas */}
                <div style={{ marginRight: `${LAYER_GAP / 2}px`, textAlign: 'center' }}>
                    <canvas ref={inputCanvasRef} width={INPUT_IMG_SIZE} height={INPUT_IMG_SIZE} style={{ border: '1px solid #ccc', background: '#f8f8f8', imageRendering: 'pixelated' }} />
                    <div style={{ fontSize: '11px', color: '#555', marginTop: '5px' }}>Input (28x28)</div>
                </div>

                {/* SVG Network Graph */}
                <svg ref={svgRef} width={SVG_WIDTH - inputVisX} height={SVG_HEIGHT} style={{ borderLeft: '1px solid #eee', fontFamily: 'sans-serif', overflow: 'visible' }}>
                    {/* Layer Labels */}
                    <text x={flattenX} y={15} textAnchor="middle" fontSize="11" fill="#555">Flatten</text>
                    <text x={hiddenDenseX} y={15} textAnchor="middle" fontSize="11" fill="#555">Dense</text>
                    <text x={outputX} y={15} textAnchor="middle" fontSize="11" fill="#555">Output</text>

                    {/* Connections (Static definition, GSAP targets classes) */}
                    <g className="connections">
                        {/* Input(Abstract) -> Flatten */}
                        {flattenNodePositions.map((flatPos, j) =>
                            <line key={`l-in-fl-${j}`} className={`l-in-fl-${j}`} x1={inputVisX + INPUT_IMG_SIZE / 2 + 10} y1={SVG_HEIGHT / 2} x2={flatPos.x} y2={flatPos.y} stroke={COLOR_DEFAULT_LINE} strokeWidth="0.5" strokeOpacity={0.2} />
                        )}
                        {/* Flatten -> Hidden Dense */}
                        {flattenNodePositions.map((flatPos, i) =>
                            hiddenDenseNodePositions.map((hdPos, j) =>
                                <line key={`l-fl-hd-${i}-${j}`} className={`l-fl-hd-${i}`} x1={flatPos.x} y1={flatPos.y} x2={hdPos.x} y2={hdPos.y} stroke={COLOR_DEFAULT_LINE} strokeWidth="0.5" strokeOpacity={0.2} />
                            )
                        )}
                         {/* Hidden Dense -> Output */}
                         {hiddenDenseNodePositions.map((hdPos, i) =>
                             outputNodePositions.map((outPos, j) =>
                                 <line key={`l-hd-out-${i}-${j}`} className={`l-hd-out-${i}`} x1={hdPos.x} y1={hdPos.y} x2={outPos.x} y2={outPos.y} stroke={COLOR_DEFAULT_LINE} strokeWidth="0.5" strokeOpacity={0.2} />
                             )
                         )}
                    </g>

                    {/* Nodes (Static definition, GSAP targets classes) */}
                    <g className="nodes">
                         {/* Flatten Layer Nodes */}
                         {flattenNodePositions.map((pos, i) => (
                             <circle key={`n-fl-${i}`} className={`n-fl-${i}`} cx={pos.x} cy={pos.y} r={NODE_RADIUS} fill={COLOR_NODE_FILL} stroke={COLOR_DEFAULT_NODE_OUTLINE} strokeWidth={1.5} />
                         ))}
                         {/* Hidden Dense Layer Nodes */}
                         {hiddenDenseNodePositions.map((pos, i) => (
                             <circle key={`n-hd-${i}`} className={`n-hd-${i}`} cx={pos.x} cy={pos.y} r={NODE_RADIUS} fill={COLOR_NODE_FILL} stroke={COLOR_DEFAULT_NODE_OUTLINE} strokeWidth={1.5} />
                         ))}
                         {/* Output Layer Nodes */}
                         {outputNodePositions.map((pos, i) => {
                             const char = EMNIST_CHARS[i] || '?';
                             return (
                                 <g key={`n-out-${i}`} transform={`translate(${pos.x}, ${pos.y})`}>
                                     <title>{`'${char}': ${(outputNodesActivation[i] * 100).toFixed(1)}%`}</title>
                                     <circle className={`n-out-circ-${i}`} r={NODE_RADIUS} fill={COLOR_NODE_FILL} stroke={'none'} strokeWidth={0} />
                                     <text className={`n-out-txt-${i}`} x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="500" fill={COLOR_OUTPUT_TEXT} style={{ pointerEvents:'none' }}>
                                         {char}
                                     </text>
                                 </g>
                             );
                         })}
                    </g>
                </svg>
            </div>
             {!activations && <div style={{ color: '#888', fontSize: '0.9em', marginTop: '5px' }}>Awaiting activation data...</div>}
        </div>
    );
};