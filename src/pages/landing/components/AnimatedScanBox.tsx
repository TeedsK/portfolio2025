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

    /** Called every frame with the viewport rect of the box, or null when hidden. */
    onBoxRectChange?: (rect: DOMRect | null) => void;
    /** NEW: Fired once when the box has fully reached its target for the current character. */
    onSettled?: () => void;
}

/**
 * Absolutely-positioned outline that smoothly animates its x/y/width/height
 * between OCR characters using GSAP. We also surface the *live* viewport
 * rectangle every frame so external visualizations can lock onto it precisely.
 */
const AnimatedScanBox: React.FC<AnimatedScanBoxProps> = ({
    target,
    accentColor,
    visible,
    zIndex = 4,
    borderWidth = 2,
    durationSec = 0.18,
    onBoxRectChange,
    onSettled,
}) => {
    const boxRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);
    const rafRef = useRef<number | null>(null);

    // Animate geometry + visibility whenever target/visible changes.
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;

        if (!visible || !target) {
            gsap.to(el, { opacity: 0, duration: 0.15, ease: 'power1.inOut' });
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            onBoxRectChange?.(null);
            return;
        }

        if (!initializedRef.current) {
            // First appearance: snap to position and mark as settled on next frame
            gsap.set(el, {
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                opacity: 1,
            });
            initializedRef.current = true;
            requestAnimationFrame(() => onSettled?.());
        } else {
            // Animate to the new target; when complete, declare "settled"
            gsap.to(el, {
                left: target.left,
                top: target.top,
                width: target.width,
                height: target.height,
                opacity: 1,
                duration: durationSec,
                ease: 'power2.out',
                onComplete: () => onSettled?.(),
            });
        }

        // Sample the *live* box rect every frame while visible
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const tick = () => {
            if (boxRef.current) {
                onBoxRectChange?.(boxRef.current.getBoundingClientRect());
                rafRef.current = requestAnimationFrame(tick);
            }
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [target, visible, durationSec, onBoxRectChange, onSettled]);

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
                boxShadow: `0 0 8px ${accentColor}66, 0 0 2px ${accentColor}80 inset`,
                zIndex,
                animation: 'scanPulse 1s ease-in-out infinite',
                willChange: 'left, top, width, height, opacity',
            }}
            aria-label="ocr-scan-box"
        />
    );
};

export default AnimatedScanBox;

