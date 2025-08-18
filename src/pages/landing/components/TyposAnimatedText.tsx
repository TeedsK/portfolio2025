// src/pages/landing/components/TyposAnimatedText.tsx
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { CorrectedTextPart } from '../utils/correctionData';

interface TyposAnimatedTextProps {
    parts: CorrectedTextPart[];
    onComplete?: () => void;            // called after all animations finish
    highlightDurationMs?: number;       // red-bg expand duration
    pauseBeforeFlipMs?: number;         // delay before flip starts
    flipDurationMs?: number;            // total flip duration (front out + back in)
    widthTweenMs?: number;              // container width tween (reflow) duration
}

type RefTuple = {
    container: HTMLSpanElement | null;
    inner: HTMLSpanElement | null;
    front: HTMLSpanElement | null;
    back: HTMLSpanElement | null;
    highlight: HTMLSpanElement | null;
};

const defaultDurations = {
    highlightDurationMs: 400,
    pauseBeforeFlipMs: 1000,
    flipDurationMs: 600,
    widthTweenMs: 450,
};

const whitespaceSpan = (text: string, key: string) => (
    <span key={key} style={{ whiteSpace: 'pre' }}>{text}</span>
);

export const TyposAnimatedText: React.FC<TyposAnimatedTextProps> = ({
    parts,
    onComplete,
    highlightDurationMs = defaultDurations.highlightDurationMs,
    pauseBeforeFlipMs = defaultDurations.pauseBeforeFlipMs,
    flipDurationMs = defaultDurations.flipDurationMs,
    widthTweenMs = defaultDurations.widthTweenMs,
}) => {
    const refMap = useRef<RefTuple[]>([]);
    const flaggedIdxs = useMemo(
        () => parts.map((p, i) => (!p.isWhitespace && !p.isCorrect ? i : -1)).filter(i => i >= 0),
        [parts]
    );

    // Ensure ref array length
    if (refMap.current.length !== parts.length) {
        refMap.current = parts.map(() => ({ container: null, inner: null, front: null, back: null, highlight: null }));
    }

    useLayoutEffect(() => {
        if (flaggedIdxs.length === 0) {
            onComplete?.();
            return;
        }

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => onComplete?.()
        });

        // Set initial geometry & do the red expanding highlight for all flagged tokens
        flaggedIdxs.forEach(idx => {
            const refs = refMap.current[idx];
            if (!refs.container || !refs.inner || !refs.front || !refs.back || !refs.highlight) return;

            const frontBox = refs.front.getBoundingClientRect();
            const backBox = refs.back.getBoundingClientRect();

            const frontWidth = frontBox.width;
            const backWidth = backBox.width;
            const heightEm = frontBox.height; // good approximation for highlight height

            // Initialize layers
            gsap.set(refs.container, { display: 'inline-block', position: 'relative', width: frontWidth });
            gsap.set(refs.inner, { display: 'inline-block', position: 'relative', transformStyle: 'preserve-3d' });
            gsap.set(refs.front, { position: 'absolute', left: 0, top: 0, backfaceVisibility: 'hidden' });
            gsap.set(refs.back, { position: 'absolute', left: 0, top: 0, rotationY: 180, backfaceVisibility: 'hidden' });
            gsap.set(refs.highlight, {
                position: 'absolute',
                left: 0,
                top: '50%',
                yPercent: -50,
                height: heightEm,
                width: frontWidth,
                transformOrigin: 'left center',
                scaleX: 0,
                backgroundColor: 'rgba(220, 53, 69, 0.55)', // Bootstrap-ish "danger" at ~55% opacity
                borderRadius: 4,
                zIndex: 0
            });

            // Play the red expanding highlight behind the typo
            tl.to(refs.highlight, { scaleX: 1, duration: highlightDurationMs / 1000 }, 0);

            // Schedule flip
            const halfFlip = (flipDurationMs / 2) / 1000;
            const flipStart = (pauseBeforeFlipMs / 1000);

            // rotate front away (to 90), swap orientation to -90, rotate back in (to 0)
            tl.to(refs.inner, { rotationY: 90, duration: halfFlip, ease: 'power1.in' }, flipStart);
            tl.set(refs.inner, { rotationY: -90 }, flipStart + halfFlip + 0.001);
            tl.to(refs.inner, { rotationY: 0, duration: halfFlip, ease: 'power2.out' }, flipStart + halfFlip + 0.01);

            // tween width so surrounding text reflows smoothly to the corrected width
            tl.to(refs.container, { width: backWidth, duration: widthTweenMs / 1000, ease: 'power2.inOut' }, flipStart + halfFlip + 0.01);

            // fade the red highlight out as the correction appears
            tl.to(refs.highlight, { opacity: 0, duration: 0.2 }, flipStart + halfFlip + 0.01);
        });

        return () => { tl.kill(); };
    }, [flaggedIdxs, onComplete, highlightDurationMs, pauseBeforeFlipMs, flipDurationMs, widthTweenMs]);

    return (
        <p className="ocr-output-text" style={{ transformStyle: 'preserve-3d' }}>
            {parts.map((part, i) => {
                if (part.isWhitespace) return whitespaceSpan(part.original, part.id);

                if (part.isCorrect) {
                    return (
                        <span key={part.id} style={{ whiteSpace: 'pre' }}>{part.original}</span>
                    );
                }

                // Flagged token → layered flip
                return (
                    <span
                        key={part.id}
                        className="typo-token"
                        ref={(el) => (refMap.current[i].container = el)}
                        style={{ position: 'relative', display: 'inline-block', whiteSpace: 'pre' }}
                    >
                        <span
                            ref={(el) => (refMap.current[i].inner = el)}
                            style={{ display: 'inline-block', transformOrigin: 'center center', transformStyle: 'preserve-3d' }}
                        >
                            <span ref={(el) => (refMap.current[i].front = el)} className="front" style={{ whiteSpace: 'pre' }}>
                                {part.original}
                            </span>
                            <span ref={(el) => (refMap.current[i].back = el)} className="back" style={{ whiteSpace: 'pre' }}>
                                {part.corrected}
                            </span>
                        </span>
                        <span ref={(el) => (refMap.current[i].highlight = el)} />
                    </span>
                );
            })}
        </p>
    );
};

export default TyposAnimatedText;
