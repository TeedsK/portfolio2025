// src/pages/landing/components/AnimatedScanBox.tsx
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';

export interface RectPx {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface AnimatedScanBoxProps {
    /** The rectangle in overlay pixel coords to animate to. */
    target: RectPx | null;
    /** Accent color for the outline and glow. */
    accentColor: string;
    /** Whether the scan box should be visible. */
    visible: boolean;
    /** Optional z-index to layer above the media. Default: 4 */
    zIndex?: number;
    /** Border width (px). Default: 2 */
    borderWidth?: number;
    /** Animation duration in seconds. Default: 0.18 */
    durationSec?: number;
}

/**
 * Absolutely-positioned outline that smoothly animates its x/y/width/height
 * between OCR characters using GSAP.
 */
const AnimatedScanBox: React.FC<AnimatedScanBoxProps> = ({
    target,
    accentColor,
    visible,
    zIndex = 4,
    borderWidth = 2,
    durationSec = 0.18,
}) => {
    const boxRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // Animate geometry + visibility whenever target/visible changes.
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;

        if (!visible || !target) {
            // Smooth fade out when no active character is present.
            gsap.to(el, { opacity: 0, duration: 0.15, ease: 'power1.inOut' });
            return;
        }

        // Ensure the element exists with basic style and is measurable.
        if (!initializedRef.current) {
            gsap.set(el, {
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                opacity: 1,
            });
            initializedRef.current = true;
        } else {
            // Animate between sizes/positions for a seamless morph.
            gsap.to(el, {
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                opacity: 1,
                duration: durationSec,
                ease: 'power2.out',
            });
        }
    }, [target, visible, durationSec]);

    // Visual style (kept static; geometry is animated).
    return (
        <div
            ref={boxRef}
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                pointerEvents: 'none',
                border: `${borderWidth}px solid ${accentColor}`,
                boxSizing: 'border-box',
                borderRadius: 3,
                // Subtle glow; a bit softer than the original for clarity when resizing.
                boxShadow: `0 0 8px ${accentColor}66, 0 0 2px ${accentColor}80 inset`,
                zIndex,
                // Keep your existing pulsing feel from CSS keyframes if desired:
                animation: 'scanPulse 1s ease-in-out infinite',
                // Hint the browser what we animate frequently:
                willChange: 'left, top, width, height, opacity',
            }}
            aria-label="ocr-scan-box"
        />
    );
};

export default AnimatedScanBox;
