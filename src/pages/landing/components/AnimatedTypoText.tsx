// src/pages/landing/components/AnimatedTypoText.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CorrectedTextPart } from '../utils/correctionData';

/**
 * Smooth, in-place typo replacement animation:
 * - For incorrect tokens, we measure original vs corrected widths.
 * - Lock container width to the max of both, then cross-fade texts.
 * - This prevents layout shifts and keeps alignment perfect.
 */

interface AnimatedTypoTextProps {
    parts: CorrectedTextPart[];
    /** Called once after all replacements have animated in. */
    onComplete?: () => void;
    /** Per token stagger (ms). */
    staggerMs?: number;
    /** Fade duration (ms). */
    durationMs?: number;
}

const AnimatedTypoText: React.FC<AnimatedTypoTextProps> = ({
    parts,
    onComplete,
    staggerMs = 80,
    durationMs = 220
}) => {
    // Determine indices that need animation
    const incorrectIndices = useMemo(
        () => parts.map((p, i) => (!p.isWhitespace && !p.isCorrect ? i : -1)).filter(i => i >= 0),
        [parts]
    );

    const [swapped, setSwapped] = useState<boolean[]>(
        () => parts.map(() => false)
    );

    useEffect(() => {
        let cancelled = false;
        const timers: number[] = [];

        incorrectIndices.forEach((idx, order) => {
            const t = window.setTimeout(() => {
                if (!cancelled) {
                    setSwapped(prev => {
                        const next = [...prev];
                        next[idx] = true;
                        return next;
                    });
                }
            }, order * staggerMs);
            timers.push(t);
        });

        // Schedule onComplete slightly after the last fade
        const lastDelay = (incorrectIndices.length - 1) * staggerMs + durationMs + 30;
        const endTimer = window.setTimeout(() => {
            if (!cancelled && onComplete) onComplete();
        }, Math.max(0, lastDelay));
        timers.push(endTimer);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    }, [incorrectIndices, staggerMs, durationMs, onComplete]);

    return (
        <p className="ocr-output-text">
            {parts.map((p, i) => {
                if (p.isWhitespace) return <span key={p.id}>{p.original}</span>;
                if (p.isCorrect) return <span key={p.id}>{p.original}</span>;
                return (
                    <TokenSwap
                        key={p.id}
                        original={p.original}
                        corrected={p.corrected}
                        swapped={swapped[i]}
                        durationMs={durationMs}
                    />
                );
            })}
        </p>
    );
};

export default AnimatedTypoText;

// ----------------------

interface TokenSwapProps {
    original: string;
    corrected: string;
    swapped: boolean;
    durationMs: number;
}

const TokenSwap: React.FC<TokenSwapProps> = ({ original, corrected, swapped, durationMs }) => {
    const wrapRef = useRef<HTMLSpanElement>(null);
    const origRef = useRef<HTMLSpanElement>(null);
    const corrRef = useRef<HTMLSpanElement>(null);
    const [widthPx, setWidthPx] = useState<number | undefined>(undefined);

    // Measure both texts and lock width to prevent layout shift
    useEffect(() => {
        const measure = () => {
            const w1 = origRef.current?.offsetWidth ?? 0;
            const w2 = corrRef.current?.offsetWidth ?? 0;
            setWidthPx(Math.max(w1, w2));
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [original, corrected]);

    return (
        <span
            ref={wrapRef}
            className="typo-token"
            style={{
                display: 'inline-block',
                position: 'relative',
                width: widthPx ? `${widthPx}px` : 'auto',
                verticalAlign: 'baseline',
                marginRight: 0 // no extra spacing
            }}
        >
            {/* original text (fades out) */}
            <span
                ref={origRef}
                className="typo-original"
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: swapped ? 0 : 1,
                    transition: `opacity ${durationMs}ms ease`,
                    color: '#a61d24'
                }}
            >
                {original}
            </span>

            {/* corrected text (fades in) */}
            <span
                ref={corrRef}
                className="typo-corrected"
                style={{
                    position: 'relative',
                    opacity: swapped ? 1 : 0,
                    transition: `opacity ${durationMs}ms ease`,
                    color: '#333'
                }}
            >
                {corrected}
            </span>
        </span>
    );
};
