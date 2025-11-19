// src/components/InlineWordToggle.tsx
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import './InlineWordToggle.css';

export type InlineWordToggleProps = {
    /** true => shows “fewer”; false => shows “all” */
    expanded: boolean;
    onToggle: () => void;
    className?: string;          // e.g. "view-all-tech spaced"
    prefix?: string;             // default: "View"
    suffix?: string;             // default: "frameworks"
};

/**
 * InlineWordToggle
 * ----------------
 * Seamless inline sentence:
 *   “View all frameworks”  ⇄  “View fewer frameworks”
 *
 * Strategy for buttery-smooth motion + perfect baseline:
 * - ONE in-flow <span> (the “live” word) owns the baseline.
 * - An absolutely positioned “ghost” word cross-fades & slides a short distance (in px),
 *   while the container’s width tweens with integer snapping to avoid sub‑pixel jitter.
 * - We keep transforms on the compositor (translate3d, opacity) for GPU acceleration.
 */
const InlineWordToggle: React.FC<InlineWordToggleProps> = ({
    expanded,
    onToggle,
    className,
    prefix = 'View',
    suffix = 'frameworks',
}) => {
    const wrapRef = useRef<HTMLSpanElement>(null);   // width-animated container (keeps baseline)
    const liveRef = useRef<HTMLSpanElement>(null);   // in-flow, baseline owner
    const ghostRef = useRef<HTMLSpanElement>(null);   // absolutely positioned clone
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    const getWord = () => (expanded ? 'fewer' : 'all');

    // Set initial content and width to the current word
    useLayoutEffect(() => {
        const wrap = wrapRef.current, live = liveRef.current;
        if (!wrap || !live) return;
        live.textContent = getWord();
        gsap.set(wrap, { width: Math.ceil(live.getBoundingClientRect().width) });
    }, []); // mount only

    // Animate when the state flips
    useEffect(() => {
        const wrap = wrapRef.current;
        const live = liveRef.current;
        const ghost = ghostRef.current;
        if (!wrap || !live || !ghost) return;

        const newWord = getWord();
        const oldWord = live.textContent || 'all';
        if (newWord === oldWord) return;

        // Kill any previous timeline to avoid choppiness on rapid taps
        if (tlRef.current) { tlRef.current.kill(); tlRef.current = null; }

        // Measure widths to tween spacing smoothly (snap to integers to avoid jitter)
        const oldW = Math.ceil(live.getBoundingClientRect().width);
        ghost.textContent = newWord;
        gsap.set(ghost, { position: 'absolute', left: 0, top: 0, display: 'inline-block' });
        const newW = Math.ceil(ghost.getBoundingClientRect().width);

        // Use a short pixel travel (≈60% of line-height) + crossfade for smoothness
        const h = wrap.getBoundingClientRect().height || 16;
        const dy = Math.round(h * 0.6);
        const up = -dy;
        const dn = dy;
        const dur = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 0.32;

        // Start states
        gsap.set(wrap, { width: oldW });
        gsap.set(live, { y: 0, opacity: 1, force3D: true });
        gsap.set(ghost, { y: expanded ? dn : up, opacity: 0, pointerEvents: 'none', force3D: true });

        const tl = gsap.timeline({
            defaults: { duration: dur, ease: 'power3.out' },
            onComplete: () => {
                // Commit the new word to the live span and clear transforms
                live.textContent = newWord;
                gsap.set([live, ghost], { clearProps: 'transform,opacity' });
                gsap.set(wrap, { width: newW }); // lock final width (integer)
                tlRef.current = null;
            }
        });
        tlRef.current = tl;

        tl.to(live, { y: expanded ? up : dn, opacity: 0.02 }, 0) // tiny opacity floor avoids harsh cut
            .to(ghost, { y: 0, opacity: 1 }, 0)
            .to(wrap, { width: newW, snap: { width: 1 }, ease: 'power2.inOut' }, 0);

        return () => { tl.kill(); };
    }, [expanded]);

    return (
        <button
            type="button"
            className={`inline-word-toggle ${className ?? ''}`}
            aria-pressed={expanded}
            aria-label={expanded ? 'View fewer frameworks' : 'View all frameworks'}
            onClick={onToggle}
        >
            <span className="iwt-prefix">{prefix}&nbsp;</span>

            {/* Baseline‑owning container whose width animates */}
            <span className="iwt-wordwrap" ref={wrapRef}>
                <span ref={liveRef} className="iwt-live" />
                <span ref={ghostRef} className="iwt-ghost" aria-hidden="true" />
            </span>

            <span className="iwt-suffix">&nbsp;{suffix}</span>
        </button>
    );
};

export default InlineWordToggle;
