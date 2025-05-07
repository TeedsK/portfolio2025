// src/components/visualizations/ConvolutionFiltersViz.tsx
import React from 'react';
import { ModelWeights, Conv2DWeights } from '../../types';

interface Props {
    weights: ModelWeights | null;
    layerName: string; // e.g., 'conv2d'
    // Add other props needed for animation later (image size, etc.)
}

export const ConvolutionFiltersViz: React.FC<Props> = ({ weights, layerName }) => {
    const layerWeights = weights ? weights[layerName] as Conv2DWeights : null;

    if (!layerWeights || !layerWeights.kernel) {
        return <div style={{ color: '#888', fontSize: '0.9em' }}>Awaiting kernel data for {layerName}...</div>;
    }

    const kernel = layerWeights.kernel;
    const h = kernel.length;
    const w = kernel[0]?.length ?? 0;
    const outChannels = kernel[0]?.[0]?.[0]?.length ?? 0;

    return (
        <div>
            <h4 style={{ marginBottom: '5px', fontWeight: 'normal' }}>Convolution Filters: {layerName}</h4>
            <div style={{ padding: '10px', border: '1px dashed #ccc', background: '#fafafa', fontSize: '0.9em', color: '#555' }}>
                <p>Kernel Shape: [{h}, {w}]</p>
                <p>Output Filters: {outChannels}</p>
                <p><i>(Animated filter visualization placeholder)</i></p>
                {/* GSAP animation would go here, drawing kernel outlines moving over an image representation */}
            </div>
        </div>
    );
};