// src/components/visualizations/WeightViz.tsx
import React, { useRef, useEffect } from 'react';
import { ModelWeights, Conv2DWeights } from '../../types';

interface Props {
    weights: ModelWeights | null;
    layerName: string; // e.g., 'conv2d'
}

// Draw a single kernel heatmap
const drawKernel = (
    canvas: HTMLCanvasElement,
    kernelData: number[][] // Expecting [h, w] slice
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !kernelData || kernelData.length === 0 || kernelData[0].length === 0) return;

    const height = kernelData.length;
    const width = kernelData[0].length;
    const scale = Math.max(1, Math.floor(30 / Math.max(width, height))); // Scale to roughly 30px
    canvas.width = width * scale;
    canvas.height = height * scale;

    // Find min/max for normalization within this kernel
    let minVal = Infinity, maxVal = -Infinity;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            minVal = Math.min(minVal, kernelData[y][x]);
            maxVal = Math.max(maxVal, kernelData[y][x]);
        }
    }
    const range = maxVal - minVal;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Normalize value 0-1 within this kernel's range
            const normValue = range === 0 ? 0.5 : (kernelData[y][x] - minVal) / range;
            const intensity = Math.floor(normValue * 255);
            ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
};


export const WeightViz: React.FC<Props> = ({ weights, layerName }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const layerWeights = weights ? weights[layerName] as Conv2DWeights : null; // Assume Conv2D for now

    // We only draw weights once or if they change (which they don't after load)
    useEffect(() => {
        if (!containerRef.current || !layerWeights || !layerWeights.kernel) return;

        const kernel = layerWeights.kernel; // Shape [h, w, in_ch, out_ch]
        const h = kernel.length;
        const w = kernel[0]?.length ?? 0;
        const inChannels = kernel[0]?.[0]?.length ?? 0;
        const outChannels = kernel[0]?.[0]?.[0]?.length ?? 0;

        if (h === 0 || w === 0 || inChannels === 0 || outChannels === 0) return;

        // Clear previous canvases
        containerRef.current.innerHTML = '';

        // Draw a heatmap for each filter (output channel)
        // Show only first input channel for simplicity
        const inputChannelIndex = 0;
        const maxFiltersToShow = 32; // Limit number shown for performance
        for (let out_ch = 0; out_ch < Math.min(outChannels, maxFiltersToShow); out_ch++) {
            const canvas = document.createElement('canvas');
            canvas.title = `Filter ${out_ch + 1}`;
            canvas.style.border = '1px solid #ccc';
            canvas.style.margin = '1px';
            containerRef.current.appendChild(canvas);

            // Extract the 2D kernel slice [h, w] for this filter/input channel
            const kernelSlice: number[][] = [];
            for (let y = 0; y < h; y++) {
                kernelSlice[y] = [];
                for (let x = 0; x < w; x++) {
                    kernelSlice[y][x] = kernel[y][x][inputChannelIndex][out_ch];
                }
            }
            drawKernel(canvas, kernelSlice);
        }

    }, [layerWeights]); // Depend on layerWeights

    if (!layerWeights || !layerWeights.kernel) {
        return <div style={{ color: '#888', fontSize: '0.9em' }}>Awaiting weight data for {layerName}...</div>;
    }

    return (
        <div>
            <h4 style={{ marginBottom: '5px', fontWeight: 'normal' }}>Weights: {layerName} (Kernels for Input Ch 0)</h4>
            <div ref={containerRef} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', maxHeight: '150px', overflowY: 'auto', background: '#f9f9f9', border: '1px solid #eee' }}>
                {/* Canvases will be appended here by useEffect */}
            </div>
        </div>
    );
};