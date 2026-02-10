// src/pages/landing/components/RecognizedCharLabel.tsx
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface RecognizedCharLabelProps {
    /** Unique id for this ephemeral label (used to notify removal) */
    id: string;
    /** Character to display (uppercased for visual consistency) */
    char: string;
    /** Absolute left position within the overlay container (px, center-aligned) */
    left: number;
    /** Absolute top position within the overlay container (px, baseline under the glyph) */
    top: number;
    /** Accent color for emphasis (e.g., matches the scan box accent) */
    accentColor: string;
    /** Called when the exit animation completes so the parent can unmount this label */
    onDone: (id: string) => void;

    /** Animation timings in milliseconds (optional) */
    appearDurationMs?: number;     // default 200
    holdDurationMs?: number;       // default 1000
    disappearDurationMs?: number;  // default 220
}

const RecognizedCharLabel: React.FC<RecognizedCharLabelProps> = ({
    id,
    char,
    left,
    top,
    accentColor,
    onDone,
    appearDurationMs = 200,
    holdDurationMs = 100,
    disappearDurationMs = 220,
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const animRef = useRef<HTMLDivElement | null>(null);
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    useEffect(() => {
        if (!animRef.current) return;

        // Kill any prior timeline just in case
        if (tlRef.current) {
            tlRef.current.kill();
            tlRef.current = null;
        }

        gsap.set(animRef.current, { transformOrigin: '50% 0%', scale: 0, opacity: 0 });

        const tl = gsap.timeline({ defaults: { ease: 'power1.out' } });
        tl.to(animRef.current, {
            scale: 1,
            opacity: 1,
            duration: appearDurationMs / 1000,
            ease: 'back.out(1.7)',
        })
            .to(
                animRef.current,
                {
                    scale: 0,
                    opacity: 0,
                    duration: disappearDurationMs / 1000,
                    ease: 'power1.in',
                    onComplete: () => onDone(id),
                },
                `+=${holdDurationMs / 1000}`
            );

        tlRef.current = tl;

        return () => {
            if (tlRef.current) {
                tlRef.current.kill();
                tlRef.current = null;
            }
        };
    }, [id, onDone, appearDurationMs, holdDurationMs, disappearDurationMs]);

    // Outer container: only positioning and centering (no animated properties here)
    const outerStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)', // static translate for horizontal centering
        pointerEvents: 'none',
        zIndex: 3,
    };

    // Inner bubble: visually clean pill (no dotted borders)
    const bubbleStyle: React.CSSProperties = {
        fontFamily: 'Courier New, monospace',
        fontSize: 12,
        lineHeight: 1,
        fontWeight: 700,
        color: accentColor, // subtle accent via text color
        background: 'rgba(255, 255, 255, 0.95)',
        border: 0,
        borderRadius: 8,
        padding: '4px 8px',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        willChange: 'transform, opacity',
    };

    return (
        <div ref={containerRef} style={outerStyle} aria-label={`recognized-character-${char}`}>
            <div ref={animRef} style={bubbleStyle}>
                {char.toUpperCase()}
            </div>
        </div>
    );
};

export default RecognizedCharLabel;
