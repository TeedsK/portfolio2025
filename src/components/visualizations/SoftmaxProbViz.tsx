// src/components/visualizations/SoftmaxProbViz.tsx
import React from 'react';

interface Props {
    probabilities: number[] | null;
    mapping: string[]; // e.g., EMNIST_CHARS
}

export const SoftmaxProbViz: React.FC<Props> = ({ probabilities, mapping }) => {
    if (!probabilities || probabilities.length === 0) {
        return <div style={{ color: '#888', fontSize: '0.9em' }}>Awaiting softmax probabilities...</div>;
    }

    const maxProb = Math.max(...probabilities);
    const predictedIndex = probabilities.indexOf(maxProb);

    return (
        <div>
            <h4 style={{ marginBottom: '5px', fontWeight: 'normal' }}>Softmax Output</h4>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '100px', border: '1px solid #eee', padding: '5px', gap: '2px', overflowX: 'auto' }}>
                {probabilities.map((prob, index) => {
                    const height = `${Math.max(1, prob * 100)}%`; // Ensure min height for visibility
                    const isPredicted = index === predictedIndex;
                    const char = mapping[index] || '?';

                    return (
                        <div key={index} style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', textAlign: 'center' }}>
                            <div
                                title={`'${char}': ${(prob * 100).toFixed(1)}%`}
                                style={{
                                    width: '90%',
                                    height: height,
                                    backgroundColor: isPredicted ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 0, 255, 0.5)',
                                    transition: 'height 0.3s ease-out',
                                }}
                            ></div>
                            <span style={{ fontSize: '10px', marginTop: '2px', color: isPredicted ? 'red' : '#555' }}>
                                {char}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};