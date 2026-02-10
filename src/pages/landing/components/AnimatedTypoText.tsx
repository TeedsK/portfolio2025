// src/pages/landing/components/AnimatedTypoText.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import type { CorrectedTextPart } from '../utils/correctionData';

gsap.registerPlugin(Flip);

type AnimatedTypoTextProps = {
  parts: CorrectedTextPart[];
  onComplete?: () => void;

  /** NEW: render wrapper exactly like the live text */
  className?: string;                 // e.g. "ocr-output-text"
  as?: keyof JSX.IntrinsicElements;   // e.g. "p" (default "div")
  startDelayMs?: number;              // small delay so height-lock settles

  // Visual tuning (unchanged)
  highlightColor?: string;
  highlightBorderColor?: string;
  confirmHighlightColor?: string;
  confirmBorderColor?: string;
  wipeDuration?: number;
  swapDuration?: number;
  confirmDuration?: number;
  fadeOutDuration?: number;
  betweenTyposDelay?: number;
};

const AnimatedTypoText: React.FC<AnimatedTypoTextProps> = ({
  parts,
  onComplete,
  className,
  as = 'div',
  startDelayMs = 120,

  highlightColor = 'rgba(255, 77, 79, 0.25)',
  highlightBorderColor = 'rgba(255, 77, 79, 0.55)',
  confirmHighlightColor = 'rgba(82, 196, 26, 0.25)',
  confirmBorderColor = 'rgba(82, 196, 26, 0.55)',
  wipeDuration = 0.35,
  swapDuration = 0.20,
  confirmDuration = 0.20,
  fadeOutDuration = 0.20,
  betweenTyposDelay = 0.10,
}) => {
  const containerRef = useRef<HTMLElement | null>(null);

  const wrapperRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const textRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const overlayRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const onCompleteRef = useRef<(() => void) | undefined>(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const isReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const partsSignature = useMemo(() => {
    return JSON.stringify(
      parts.map(p => ({
        id: p.id, o: p.original, c: p.corrected, ic: p.isCorrect, iw: p.isWhitespace
      }))
    );
  }, [parts]);

  const reg =
    <T extends HTMLElement>(store: React.MutableRefObject<Record<string, T | null>>, id: string) =>
      (el: T | null) => { store.current[id] = el; };

  useEffect(() => {
    if (tlRef.current) { tlRef.current.kill(); tlRef.current = null; }

    const typos = parts.filter(p => !p.isWhitespace && !p.isCorrect);

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

    if (typos.length === 0) { onCompleteRef.current?.(); return; }

    const tl = gsap.timeline({
      paused: startDelayMs > 0,        // NEW: wait a tick to let height-lock finish
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        typos.forEach(p => {
          const t = textRefs.current[p.id];
          const overlay = overlayRefs.current[p.id];
          if (t) { t.textContent = p.corrected; (t.style as CSSStyleDeclaration).opacity = '1'; (t.style as CSSStyleDeclaration).transform = 'none'; }
          if (overlay) { (overlay.style as CSSStyleDeclaration).opacity = '0'; (overlay.style as CSSStyleDeclaration).transform = 'scaleX(0)'; }
        });
        onCompleteRef.current?.();
      },
    });

    typos.forEach((p, index) => {
      const start = index * Math.max(0, betweenTyposDelay);
      const overlay = overlayRefs.current[p.id];
      const t = textRefs.current[p.id];
      if (!overlay || !t) return;

      gsap.set(overlay, {
        transformOrigin: 'left center',
        scaleX: 0, opacity: 1,
        backgroundColor: highlightColor,
        borderColor: highlightBorderColor,
      });

      tl.to(overlay, { scaleX: 1, duration: wipeDuration }, start);

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
        Flip.from(state, { duration: swapDuration, ease: 'power2.out', absolute: false, prune: true, nested: true });
      }, crossStart);

      const confirmStart = crossStart + swapDuration;
      tl.to(overlay, {
        backgroundColor: confirmHighlightColor,
        borderColor: confirmBorderColor,
        duration: confirmDuration, ease: 'power1.inOut'
      }, confirmStart);

      const fadeStart = confirmStart + confirmDuration + 0.02;
      tl.to(overlay, { opacity: 0, duration: fadeOutDuration }, fadeStart);
    });

    tlRef.current = tl;
    if (startDelayMs > 0) {
      gsap.delayedCall(startDelayMs / 1000, () => tl.play());
    }

    return () => { if (tlRef.current) { tlRef.current.kill(); tlRef.current = null; } };
  }, [
    partsSignature, isReducedMotion,
    startDelayMs, wipeDuration, swapDuration, confirmDuration, fadeOutDuration, betweenTyposDelay,
    parts, highlightColor, highlightBorderColor, confirmHighlightColor, confirmBorderColor,
  ]);

  const Tag = as as any;

  return (
    <Tag
      ref={containerRef as any}
      className={['ocr-typography', 'ocr-output-text', className].filter(Boolean).join(' ')}
      style={{ position: 'relative', whiteSpace: 'pre-wrap' }}
    >
      {parts.map((part) => {
        if (part.isWhitespace) {
          return <span key={part.id} style={{ whiteSpace: 'pre-wrap' }}>{part.original}</span>;
        }
        return (
          <span
            key={part.id}
            ref={reg(wrapperRefs, part.id)}
            style={{ display: 'inline', position: 'relative', verticalAlign: 'baseline', padding: 0, margin: 0 }}
          >
            <span
              aria-hidden
              ref={reg(overlayRefs, part.id)}
              style={{
                position: 'absolute', top: -2, bottom: -2, left: -2, right: -2,
                backgroundColor: highlightColor, borderWidth: 1, borderStyle: 'solid',
                borderColor: highlightBorderColor, borderRadius: 4,
                transform: 'scaleX(0)', transformOrigin: 'left center',
                zIndex: 0, pointerEvents: 'none',
              }}
            />
            <span ref={reg(textRefs, part.id)} style={{ position: 'relative', zIndex: 1 }}>
              {part.original}
            </span>
          </span>
        );
      })}
    </Tag>
  );
};

export default AnimatedTypoText;
