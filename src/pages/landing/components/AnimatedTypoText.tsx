// src/pages/landing/components/AnimatedTypoText.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import type { CorrectedTextPart } from '../utils/correctionData';

type AnimatedTypoTextProps = {
    parts: CorrectedTextPart[];
    onComplete?: () => void;

    /** Visual tuning (optional) */
    highlightColor?: string;
    highlightBorderColor?: string;
    wipeDuration?: number;        // seconds
    swapDuration?: number;        // seconds
    fadeOutDuration?: number;     // seconds
    /** Now used as the START stagger (100ms default), not a post-finish gap */
    betweenTyposDelay?: number;   // seconds
};

const AnimatedTypoText: React.FC<AnimatedTypoTextProps> = ({
    parts,
    onComplete,
    highlightColor = 'rgba(255, 77, 79, 0.25)',
    highlightBorderColor = 'rgba(255, 77, 79, 0.55)',
    wipeDuration = 0.35,
    swapDuration = 0.20,
    fadeOutDuration = 0.20,
    // interpret as start stagger between typo groups
    betweenTyposDelay = 0.10, // 100ms
}) => {
    // --- Refs for DOM nodes per token ---
    const wrapperRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const overlayRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const originalRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const correctedRefs = useRef<Record<string, HTMLSpanElement | null>>({});

    // --- GSAP timeline ref ---
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    // Latest onComplete callback (avoid effect dependency churn)
    const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Reduced-motion preference
    const isReducedMotion = useMemo(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }, []);

    // Stable signature of the incoming parts to decide whether to (re)build
    const partsSignature = useMemo(() => {
        // Only include fields that matter for visuals; exclude ids to avoid accidental churn
        // Keep id nonetheless to maintain per-span mapping if a new set arrives.
        return JSON.stringify(
            parts.map(p => ({
                id: p.id,
                o: p.original,
                c: p.corrected,
                ic: p.isCorrect,
                iw: p.isWhitespace,
            }))
        );
    }, [parts]);

    // Register function for refs
    const reg =
        <T extends HTMLElement>(store: React.MutableRefObject<Record<string, T | null>>, id: string) =>
            (el: T | null) => {
                store.current[id] = el;
            };

    // Measure and lock minWidth to avoid layout shifts when swapping text
    useEffect(() => {
        // Clear minWidth first for fresh measurement
        for (const p of parts) {
            if (p.isWhitespace) continue;
            const w = wrapperRefs.current[p.id];
            if (w) w.style.minWidth = '';
        }

        for (const p of parts) {
            if (p.isWhitespace) continue;
            const wrapper = wrapperRefs.current[p.id];
            const orig = originalRefs.current[p.id];
            const corr = correctedRefs.current[p.id];
            if (!wrapper || !orig || !corr) continue;

            const origW = orig.getBoundingClientRect().width;
            const corrW = corr.getBoundingClientRect().width;
            const maxW = Math.ceil(Math.max(origW, corrW));
            if (Number.isFinite(maxW) && maxW > 0) {
                wrapper.style.minWidth = `${maxW}px`;
            }
        }
    }, [partsSignature]);

    // Build the animation ONCE per partsSignature (and NOT on each parent re-render)
    useEffect(() => {
        // Clean up any existing timeline
        if (tlRef.current) {
            tlRef.current.kill();
            tlRef.current = null;
        }

        const typoTokens = parts.filter(p => !p.isWhitespace && !p.isCorrect);

        // Reduced motion: set corrected instantly + subtle static background
        if (isReducedMotion) {
            typoTokens.forEach(p => {
                const wrapper = wrapperRefs.current[p.id];
                const orig = originalRefs.current[p.id];
                if (!wrapper || !orig) return;
                orig.textContent = p.corrected;
                wrapper.style.background = 'rgba(255, 77, 79, 0.12)';
                wrapper.style.borderRadius = '4px';
            });
            onCompleteRef.current?.();
            return;
        }

        // If no typos, nothing to animate; ensure the text is the final corrected state
        if (typoTokens.length === 0) {
            // For correctness: if any part differs, just show original (already correct)
            onCompleteRef.current?.();
            return;
        }

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => {
                // Finalize DOM: inline node contains corrected text, is visible; overlays hidden.
                for (const p of typoTokens) {
                    const orig = originalRefs.current[p.id];
                    const corr = correctedRefs.current[p.id];
                    const overlay = overlayRefs.current[p.id];

                    if (orig) {
                        orig.textContent = p.corrected;
                        (orig.style as CSSStyleDeclaration).opacity = '1';
                        (orig.style as CSSStyleDeclaration).transform = 'none';
                    }
                    if (corr) {
                        (corr.style as CSSStyleDeclaration).opacity = '0';
                        (corr.style as CSSStyleDeclaration).transform = 'translateY(0)';
                    }
                    if (overlay) {
                        (overlay.style as CSSStyleDeclaration).opacity = '0';
                        (overlay.style as CSSStyleDeclaration).transform = 'scaleX(0)';
                    }
                }
                onCompleteRef.current?.();
            },
        });

        // Staggered overlapped starts: each token starts at t = i * betweenTyposDelay
        const CROSS_OVERLAP = 0.05; // seconds; begin swap just before wipe completes
        const FADE_PAD = 0.02;      // tiny pad before highlight fade-out

        typoTokens.forEach((p, i) => {
            const wrapper = wrapperRefs.current[p.id];
            const overlay = overlayRefs.current[p.id];
            const orig = originalRefs.current[p.id];
            const corr = correctedRefs.current[p.id];
            if (!wrapper || !overlay || !orig || !corr) return;

            // Reset states for this token
            gsap.set(overlay, {
                transformOrigin: 'left center',
                scaleX: 0,
                opacity: 1,
            });
            gsap.set(orig, {
                opacity: 1,
                y: 0,
            });
            gsap.set(corr, {
                position: 'absolute',
                left: 0,
                top: 0,
                opacity: 0,
                y: 6,
            });

            const start = Math.max(0, i * Math.max(0, betweenTyposDelay));
            const crossStart = start + Math.max(0, wipeDuration - CROSS_OVERLAP);
            const fadeStart = start + wipeDuration + swapDuration + FADE_PAD;

            // 1) Left→right wipe
            tl.to(
                overlay,
                { scaleX: 1, duration: wipeDuration },
                start
            );

            // 2) Cross-fade/slide original → corrected
            tl.to(
                orig,
                { opacity: 0, y: -4, duration: swapDuration, ease: 'power1.inOut' },
                crossStart
            );
            tl.to(
                corr,
                { opacity: 1, y: 0, duration: swapDuration, ease: 'power1.inOut' },
                crossStart
            );

            // 3) Fade highlight out
            tl.to(
                overlay,
                { opacity: 0, duration: fadeOutDuration },
                fadeStart
            );
        });

        tlRef.current = tl;

        return () => {
            if (tlRef.current) {
                tlRef.current.kill();
                tlRef.current = null;
            }
        };
        // NOTE: Intentionally *not* depending on onComplete; we read it from onCompleteRef.
        // Also we depend on partsSignature (stable across parent re-renders) not on parts object identity.
    }, [partsSignature, isReducedMotion, wipeDuration, swapDuration, fadeOutDuration, betweenTyposDelay]);

    // Render
    return (
        <div
            aria-live="polite"
            style={{
                whiteSpace: 'pre-wrap',
                fontFamily: `'Courier New', Courier, monospace`,
                fontSize: '1.1em',
                lineHeight: 1.4,
                color: '#333',
            }}
        >
            {parts.map((part) => {
                if (part.isWhitespace) {
                    return (
                        <span key={part.id} style={{ whiteSpace: 'pre-wrap' }}>
                            {part.original}
                        </span>
                    );
                }

                const isTypo = !part.isCorrect;

                return (
                    <span
                        key={part.id}
                        ref={reg(wrapperRefs, part.id)}
                        style={{
                            display: 'inline-block',
                            position: 'relative',
                            verticalAlign: 'baseline',
                            padding: '0 2px',
                            margin: '0 1px',
                        }}
                    >
                        {isTypo && (
                            <span
                                aria-hidden
                                ref={reg(overlayRefs, part.id)}
                                style={{
                                    position: 'absolute',
                                    inset: '-2px 0 -2px 0',
                                    background: highlightColor,
                                    border: `1px solid ${highlightBorderColor}`,
                                    borderRadius: 4,
                                    transform: 'scaleX(0)',
                                    transformOrigin: 'left center',
                                    zIndex: 0,
                                    pointerEvents: 'none',
                                }}
                            />
                        )}

                        {/* Original (inline flow) */}
                        <span
                            ref={reg(originalRefs, part.id)}
                            style={{ position: 'relative', zIndex: 1 }}
                        >
                            {part.original}
                        </span>

                        {/* Corrected (absolute overlay; also present for measuring when !isTypo) */}
                        <span
                            ref={reg(correctedRefs, part.id)}
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                zIndex: 2,
                                opacity: 0,
                                // keep visible for measurement; "opacity: 0" is OK
                                // when not typo, we still include it for width measurement
                            }}
                        >
                            {part.corrected}
                        </span>
                    </span>
                );
            })}
        </div>
    );
};

export default AnimatedTypoText;
