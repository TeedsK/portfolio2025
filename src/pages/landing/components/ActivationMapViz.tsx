// src/pages/landing/components/ActivationMapViz.tsx
import React, { useRef, useEffect } from 'react';
import { ActivationData } from '../../../types';
import { log } from '../../../utils/logger';

interface Props {
    activations: ActivationData | null;
    layerName: string; // Which layer's activations to display
}

// Simple function to draw a 2D array as a grayscale heatmap
const drawHeatmap = (
    canvas: HTMLCanvasElement,
    data: number[][],
    scale: number = 4 // Factor to scale up pixels for visibility
) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !data || data.length === 0 || data[0].length === 0) return;

    const height = data.length;
    const width = data[0].length;
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Clamp value between 0 and 1 (activations might exceed this)
            const value = Math.max(0, Math.min(1, data[y][x]));
            const intensity = Math.floor(value * 255);
            ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
};

export const ActivationMapViz: React.FC<Props> = ({ activations, layerName }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const activationValue = activations ? activations[layerName] : null;

    useEffect(() => {
        if (!canvasRef.current || !activationValue) return;

        let mapData: number[][] | null = null;

        if (Array.isArray(activationValue) && activationValue.length > 0) {
            if (Array.isArray(activationValue[0]) && activationValue[0].length > 0 && Array.isArray((activationValue as any)[0][0]) && typeof (activationValue as any)[0][0][0] === 'number') {
                // Likely 3D [h, w, channels] -> take first channel [h, w]
                mapData = (activationValue as number[][][]).map(row => row.map(pixel => pixel[0]));
                log(`Visualizing first channel of 3D activation map for ${layerName}`);
            } else if (Array.isArray(activationValue[0]) && typeof (activationValue as any)[0][0] === 'number') {
                // Likely 2D [h, w]
                mapData = activationValue as number[][];
                log(`Visualizing 2D activation map for ${layerName}`);
            }
        }

        if (mapData) {
            drawHeatmap(canvasRef.current, mapData);
        } else {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                canvasRef.current.width = 100; canvasRef.current.height = 30;
                ctx.clearRect(0, 0, 100, 30);
                ctx.font = '10px sans-serif';
                ctx.fillStyle = '#888';
                ctx.fillText(`Data shape not 2D/3D`, 5, 20);
            }
            log(`Cannot draw heatmap for layer ${layerName}, data shape not suitable.`);
        }

    }, [activationValue, layerName]);

    if (!activationValue) {
        return <div style={{ color: '#888', fontSize: '0.9em' }}>Awaiting activation data for {layerName}...</div>;
    }

    return (
        <div>
            <h4 style={{ marginBottom: '5px', fontWeight: 'normal' }}>Layer: {layerName}</h4>
            <canvas ref={canvasRef} style={{ border: '1px solid #eee', background: '#f0f0f0' }}></canvas>
        </div>
    );
};
