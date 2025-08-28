// src/pages/landing/sections/AStarCreativity.tsx
import React, { useMemo } from 'react';
import '../styles/AStarCreativity.css';
import PathfinderCanvas from '../visuals/PathfinderCanvas';
import { Button } from 'antd';

type Props = {
    /** Height of the section in pixels. Defaults to 560. */
    heightPx?: number;
};

const AStarCreativity: React.FC<Props> = ({ heightPx = 560 }) => {
    // Provide a stable inline style so the canvas can size itself correctly.
    const sectionStyle = useMemo(() => ({ '--astar-height': `${heightPx}px` } as React.CSSProperties), [heightPx]);

    return (
        <section id="a-star-creativity" className="astar-section" style={sectionStyle} aria-labelledby="astar-title">
            {/* The animated background */}
            <div className="astar-canvas-wrap" aria-hidden>
                <PathfinderCanvas heightPx={heightPx} />
            </div>

            {/* Foreground copy that “floats left” over the maze */}
            <div className="astar-copy">
                <h2 id="astar-title" className="astar-title">
                    Project Building is my Expression for Creativity.
                </h2>
                <p className="astar-subtitle">
                    With coding as my tool and ___ as my canvas, I sift through the maze of requirements, data, and edge cases to turn an idea into a clean, human-centered product.
                </p>
            </div>
        </section>
    );
};

export default AStarCreativity;
