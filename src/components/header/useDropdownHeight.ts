// src/components/header/useDropdownHeight.ts
import { MutableRefObject, useRef } from 'react';

/**
 * Height controller for the dropdown panel.
 *
 * Key change:
 *  - We allow a dedicated *measurement element* (the incoming grid)
 *    so the container height always matches the new content, even
 *    when the outgoing overlay is taller.
 *
 * How it works:
 *  - Container (.dropdownContent) has `transition: height ...`.
 *  - We measure the measurementEl.scrollHeight (or fallback to ddRef).
 *  - We set container.style.height in pixels; the browser animates height
 *    smoothly in both directions.
 *  - ResizeObserver + image load listeners on the *measurement element*
 *    keep background perfectly in sync with content.
 */
export default function useDropdownHeight(
    ddRef: MutableRefObject<HTMLDivElement | null>
) {
    const measureElRef = useRef<HTMLElement | null>(null);
    const roRef = useRef<ResizeObserver | null>(null);
    const imgCleanupRef = useRef<(() => void) | null>(null);
    const padYRef = useRef<number>(0);

    const computePadY = () => {
        const wrap = ddRef.current;
        if (!wrap) return 0;
        const cs = getComputedStyle(wrap);
        const py =
            parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
        padYRef.current = isNaN(py) ? 0 : py;
        return padYRef.current;
    };

    const measure = () => {
        const el = measureElRef.current || ddRef.current;
        if (!el) return 0;
        const innerH = el.scrollHeight; // height of the measurement element
        return Math.max(0, Math.round(innerH + padYRef.current));
    };

    const setHeightInstant = (px: number) => {
        const wrap = ddRef.current;
        if (!wrap) return;
        const prev = wrap.style.transition;
        wrap.style.transition = 'none';
        wrap.style.height = `${px}px`;
        // force reflow to commit the style without animating
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        wrap.offsetHeight;
        wrap.style.transition = prev;
    };

    const animateToContent = () => {
        const wrap = ddRef.current;
        if (!wrap) return;
        const target = measure();
        wrap.style.height = `${target}px`; // CSS handles the transition both ways
    };

    const detachWatchers = () => {
        roRef.current?.disconnect();
        roRef.current = null;
        imgCleanupRef.current?.();
        imgCleanupRef.current = null;
    };

    const attachImageRecalc = (el: HTMLElement | null) => {
        if (!el) return;

        const imgs = Array.from(el.querySelectorAll('img'));
        const offs: Array<() => void> = [];

        const onImg = () => {
            computePadY();
            animateToContent();
        };

        imgs.forEach((img) => {
            const handler = () => onImg();
            img.addEventListener('load', handler);
            img.addEventListener('error', handler);
            offs.push(() => {
                img.removeEventListener('load', handler);
                img.removeEventListener('error', handler);
            });
            if ((img as HTMLImageElement).complete) handler();
        });

        imgCleanupRef.current = () => offs.forEach((fn) => fn());
    };

    /**
     * Set which element to measure (typically the *incoming grid*).
     * Re-installs ResizeObserver and image listeners on this element.
     */
    const setMeasureEl = (el: HTMLElement | null) => {
        measureElRef.current = el;

        // Rebuild ResizeObserver on the new measurement element
        roRef.current?.disconnect();
        roRef.current = null;
        if (el) {
            const ro = new ResizeObserver(() => {
                computePadY();
                animateToContent();
            });
            ro.observe(el);
            roRef.current = ro;
        }

        // Rebuild image listeners for the new measurement element
        imgCleanupRef.current?.();
        imgCleanupRef.current = null;
        attachImageRecalc(el);
    };

    const openFromHidden = () => {
        computePadY();
        setHeightInstant(0);   // collapsed -> animate to content
        animateToContent();
    };

    const closeToZero = () => {
        computePadY();
        const current = measure();
        setHeightInstant(current);   // ensure starting from current
        const wrap = ddRef.current;
        if (wrap) wrap.style.height = '0px';
        detachWatchers();            // stop observing while closed
    };

    return {
        setMeasureEl,
        computePadY,
        setHeightInstant,
        animateToContent,
        openFromHidden,
        closeToZero,
        detachWatchers,
    };
}
