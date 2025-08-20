// src/pages/landing/components/AnimatedTypoText.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import type { CorrectedTextPart } from '../utils/correctionData';

gsap.registerPlugin(Flip);

type AnimatedTypoTextProps = {
    parts: CorrectedTextPart[];
    onComplete?: () => void;

    // Visual tuning (optional)
    highlightColor?: string;           // initial "error" background (red)
    highlightBorderColor?: string;     // initial border (red)
    confirmHighlightColor?: string;    // turns to this green before fade-out
    confirmBorderColor?: string;       // green border before fade-out
    wipeDuration?: number;             // seconds (background sweep)
    swapDuration?: number;             // seconds (text swap + FLIP duration)
    confirmDuration?: number;          // seconds (red -> green)
    fadeOutDuration?: number;          // seconds (highlight fade)
    betweenTyposDelay?: number;        // seconds (start stagger between typo groups)
};

const AnimatedTypoText: React.FC<AnimatedTypoTextProps> = ({
    parts,
    onComplete,
    // Ant‑ish red 5
    highlightColor = 'rgba(255, 77, 79, 0.25)',
    highlightBorderColor = 'rgba(255, 77, 79, 0.55)',
    // Ant‑ish green 6
    confirmHighlightColor = 'rgba(82, 196, 26, 0.25)',
    confirmBorderColor = 'rgba(82, 196, 26, 0.55)',
    wipeDuration = 0.35,
    swapDuration = 0.20,
    confirmDuration = 0.20,
    fadeOutDuration = 0.20,
    betweenTyposDelay = 0.10, // 100ms stagger between starts
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Per-token refs
    const wrapperRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const textRefs = useRef<Record<string, HTMLSpanElement | null>>({});
    const overlayRefs = useRef<Record<string, HTMLSpanElement | null>>({});

    // GSAP timeline ref
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    // Keep onComplete stable without retriggering effects
    const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    // Reduced motion
    const isReducedMotion = useMemo(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }, []);

    // Build a stable signature to only rebuild the timeline when the payload truly changes
    const partsSignature = useMemo(() => {
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

    // Ref registration helper
    const reg =
        <T extends HTMLElement>(store: React.MutableRefObject<Record<string, T | null>>, id: string) =>
            (el: T | null) => {
                store.current[id] = el;
            };

    // Core animation
    useEffect(() => {
        // Clean any previous timeline
        if (tlRef.current) {
            tlRef.current.kill();
            tlRef.current = null;
        }

        const typos = parts.filter(p => !p.isWhitespace && !p.isCorrect);

        // Reduced motion → direct set + subtle static background
        if (isReducedMotion) {
            typos.forEach(p => {
                const t = textRefs.current[p.id];
                const w = wrapperRefs.current[p.id];
                if (t) t.textContent = p.corrected;
                if (w) {
                    w.style.backgroundColor = 'rgba(255, 77, 79, 0.12)';
                    w.style.borderRadius = '4px';
                }
            });
            onCompleteRef.current?.();
            return;
        }

        if (typos.length === 0) {
            onCompleteRef.current?.();
            return;
        }

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => {
                // Ensure final DOM state is corrected and visible; overlay hidden.
                typos.forEach(p => {
                    const t = textRefs.current[p.id];
                    const overlay = overlayRefs.current[p.id];
                    if (t) {
                        t.textContent = p.corrected;
                        (t.style as CSSStyleDeclaration).opacity = '1';
                        (t.style as CSSStyleDeclaration).transform = 'none';
                    }
                    if (overlay) {
                        (overlay.style as CSSStyleDeclaration).opacity = '0';
                        (overlay.style as CSSStyleDeclaration).transform = 'scaleX(0)';
                    }
                });
                onCompleteRef.current?.();
            },
        });

        typos.forEach((p, index) => {
            const start = index * Math.max(0, betweenTyposDelay);
            const overlay = overlayRefs.current[p.id];
            const t = textRefs.current[p.id];

            if (!overlay || !t) return;

            // Reset overlay state each time (including colors so subsequent runs are correct)
            gsap.set(overlay, {
                transformOrigin: 'left center',
                scaleX: 0,
                opacity: 1,
                backgroundColor: highlightColor,
                borderColor: highlightBorderColor,
            });

            // 1) Sweep highlight left→right (red)
            tl.to(overlay, { scaleX: 1, duration: wipeDuration }, start);

            // 2) Near sweep end: swap text to corrected + FLIP all tokens to animate layout change
            const crossStart = start + Math.max(0, wipeDuration - 0.05);
            tl.add(() => {
                const nodes: HTMLElement[] = [];
                for (const part of parts) {
                    if (part.isWhitespace) continue;
                    const w = wrapperRefs.current[part.id];
                    if (w) nodes.push(w);
                }
                const state = Flip.getState(nodes, { simple: true });

                const textNode = textRefs.current[p.id];
                if (textNode) textNode.textContent = p.corrected;

                Flip.from(state, {
                    duration: swapDuration,
                    ease: 'power2.out',
                    absolute: false,
                    prune: true,
                    nested: true,
                });
            }, crossStart);

            // 3) Confirmation: animate overlay color from red → green to indicate "fixed"
            const confirmStart = crossStart + swapDuration;
            tl.to(
                overlay,
                {
                    backgroundColor: confirmHighlightColor,
                    borderColor: confirmBorderColor,
                    duration: confirmDuration,
                    ease: 'power1.inOut',
                },
                confirmStart
            );

            // 4) Fade the (now-green) overlay away
            const fadeStart = confirmStart + confirmDuration + 0.02;
            tl.to(overlay, { opacity: 0, duration: fadeOutDuration }, fadeStart);
        });

        tlRef.current = tl;

        return () => {
            if (tlRef.current) {
                tlRef.current.kill();
                tlRef.current = null;
            }
        };
    }, [
        partsSignature,
        isReducedMotion,
        wipeDuration,
        swapDuration,
        confirmDuration,
        fadeOutDuration,
        betweenTyposDelay,
        parts,
        highlightColor,
        highlightBorderColor,
        confirmHighlightColor,
        confirmBorderColor,
    ]);

    return (
        <div
            ref={containerRef}
            aria-live="polite"
            style={{
                position: 'relative',
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
                            whiteSpace: 'nowrap', // keep token intact
                        }}
                    >
                        {/* Highlight overlay (wiped left→right; red → green → fade) */}
                        <span
                            aria-hidden
                            ref={reg(overlayRefs, part.id)}
                            style={{
                                position: 'absolute',
                                top: -2,
                                bottom: -2,
                                left: 0,
                                right: 0,
                                backgroundColor: highlightColor,
                                borderWidth: 1,
                                borderStyle: 'solid',
                                borderColor: highlightBorderColor,
                                borderRadius: 4,
                                transform: 'scaleX(0)',
                                transformOrigin: 'left center',
                                zIndex: 0,
                                pointerEvents: 'none',
                            }}
                        />

                        {/* Inline text node (we swap its content at crossStart) */}
                        <span
                            ref={reg(textRefs, part.id)}
                            style={{ position: 'relative', zIndex: 1 }}
                        >
                            {part.original}
                        </span>
                    </span>
                );
            })}
        </div>
    );
};

export default AnimatedTypoText;
