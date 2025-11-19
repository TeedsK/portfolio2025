// src/components/header/useDropdownSwap.ts
import { useRef } from 'react';
import gsap from 'gsap';

/**
 * Scroll-like swap animation between outgoing and incoming item grids.
 * - out: items move up, fade out, scale down slightly
 * - in:  items rise from below, fade in, scale to 1
 */
export default function useDropdownSwap() {
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    const play = (
        outItems: HTMLElement[] | NodeListOf<HTMLElement> | null,
        inItems: HTMLElement[] | NodeListOf<HTMLElement> | null,
        onDone?: () => void
    ) => {
        tlRef.current?.kill();
        const outArr = outItems ? Array.from(outItems) : [];
        const inArr = inItems ? Array.from(inItems) : [];

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => onDone?.(),
        });

        if (outArr.length) {
            tl.to(
                outArr,
                {
                    y: -14,
                    autoAlpha: 0,
                    scale: 0.96,
                    duration: 0.22,
                    stagger: 0.02,
                },
                0
            );
        }

        if (inArr.length) {
            tl.fromTo(
                inArr,
                { y: 18, autoAlpha: 0, scale: 0.98 },
                { y: 0, autoAlpha: 1, scale: 1, duration: 0.26, stagger: 0.02 },
                0.04
            );
        }

        tlRef.current = tl;
        return tl;
    };

    const kill = () => {
        tlRef.current?.kill();
        tlRef.current = null;
    };

    return { play, kill };
}
