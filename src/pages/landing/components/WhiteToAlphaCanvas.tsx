// src/pages/landing/components/WhiteToAlphaCanvas.tsx
import React, { useEffect, useRef } from 'react';
import { shouldRunLandingAnimations } from '../utils/landingAnimationGate';

type WhiteToAlphaCanvasProps = {
    /** Ref to the source element we draw from */
    sourceRef: React.RefObject<HTMLImageElement | HTMLVideoElement>;
    /** 'image' or 'video' – changes how we listen/loop */
    kind: 'image' | 'video';
    /** Pixel size of the container we should cover (same as your overlay) */
    width: number;
    height: number;
    /** Whether this canvas should be visible/active */
    show?: boolean;
    /** Stacking order to sit above/below other layers */
    zIndex?: number;

    /** Separate top/bottom trims in DISPLAY pixels */
    clipTopPx?: number;
    clipBottomPx?: number;

    /**
     * Luminance thresholds:
     *  - pixels >= high are fully transparent
     *  - pixels <= low are fully opaque
     * values are 0..255 (defaults tuned for “black on white” scans)
     */
    whiteLow?: number;   // start fading (default 230)
    whiteHigh?: number;  // fully transparent (default 250)

    /** Pause processing for performance if not on screen, etc. */
    paused?: boolean;
    /** Optional className for positioning tweaks */
    className?: string;
};

export const WhiteToAlphaCanvas: React.FC<WhiteToAlphaCanvasProps> = ({
    sourceRef,
    kind,
    width,
    height,
    show = true,
    zIndex = 1,
    clipTopPx = 0,
    clipBottomPx = 0,
    whiteLow = 230,
    whiteHigh = 250,
    paused = false,
    className,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    // Compute letterboxed destination and equivalent source crop
    const getRects = (srcW: number, srcH: number) => {
        const containerW = width;
        const containerH = height;

        if (containerW <= 0 || containerH <= 0 || srcW <= 0 || srcH <= 0) {
            return { dx: 0, dy: 0, dw: 0, dh: 0, sx: 0, sy: 0, sw: 0, sh: 0 };
        }

        const srcAR = srcW / srcH;
        const dstAR = containerW / containerH;

        // First, letterbox-fit the full source (no crop)
        let dw0: number, dh0: number, dx0: number, dy0: number;
        if (srcAR > dstAR) {
            // fit to width
            dw0 = containerW;
            dh0 = containerW / srcAR;
            dx0 = 0;
            dy0 = (containerH - dh0) / 2;
        } else {
            // fit to height
            dh0 = containerH;
            dw0 = containerH * srcAR;
            dy0 = 0;
            dx0 = (containerW - dw0) / 2;
        }

        const topCut = Math.max(0, clipTopPx || 0);
        const bottomCut = Math.max(0, clipBottomPx || 0);

        // Destination rect after trimming in DISPLAY space
        const dx = dx0;
        const dy = dy0 + topCut;
        const dw = dw0;
        const dh = Math.max(0, dh0 - topCut - bottomCut);

        // Convert the display-space trims back into SOURCE pixels, so we crop
        // without changing the scale of the visible content.
        const scaleY = dh0 > 0 ? dh0 / srcH : 1; // display px per source px (pre-trim)
        const sy = Math.max(0, topCut / (scaleY || 1));
        const sh = Math.max(1, srcH - sy - Math.max(0, bottomCut / (scaleY || 1)));
        const sx = 0;
        const sw = srcW;

        return { dx, dy, dw, dh, sx, sy, sw, sh };
    };

    const processFrame = () => {
        const canvas = canvasRef.current;
        const srcEl = sourceRef.current;
        if (!canvas || !srcEl) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Hard gate: do no work if we're not on the landing page (or not visible/paused)
        if (!show || paused || !shouldRunLandingAnimations()) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const srcW = srcEl instanceof HTMLVideoElement ? srcEl.videoWidth : (srcEl as HTMLImageElement).naturalWidth;
        const srcH = srcEl instanceof HTMLVideoElement ? srcEl.videoHeight : (srcEl as HTMLImageElement).naturalHeight;
        if (!srcW || !srcH) return;

        // Prepare canvases
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        if (!tmpCanvasRef.current) tmpCanvasRef.current = document.createElement('canvas');

        const { dx, dy, dw, dh, sx, sy, sw, sh } = getRects(srcW, srcH);

        // Avoid work when dimensions are not ready
        if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        const tmp = tmpCanvasRef.current!;
        tmp.width = Math.max(1, Math.round(dw));
        tmp.height = Math.max(1, Math.round(dh));
        const tctx = tmp.getContext('2d');
        if (!tctx) return;

        tctx.clearRect(0, 0, tmp.width, tmp.height);

        // Draw with source crop matching the top/bottom display trims
        tctx.drawImage(srcEl, sx, sy, sw, sh, 0, 0, dw, dh);

        // Pull pixels, convert near-white to transparent with soft edges
        const img = tctx.getImageData(0, 0, tmp.width, tmp.height);
        const data = img.data;

        // Precompute thresholds (0..1)
        const lo = Math.max(0, Math.min(254, whiteLow)) / 255;
        const hi = Math.max(lo + 0.001, Math.min(255, whiteHigh)) / 255;

        // Smoothstep helper for soft transition
        const smoothstep = (x: number, edge0: number, edge1: number) => {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        };

        for (let i = 0; i < data.length; i += 4) {
            // sRGB relative luminance
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // alpha: opaque for dark; fully transparent for very bright
            const fadeT = smoothstep(luma, lo, hi);
            const alpha = 1 - fadeT;

            data[i + 3] = Math.round(alpha * 255);
        }

        tctx.putImageData(img, 0, 0);

        // Blit onto the visible canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tmp, dx, dy);
    };

    // Animation / update loop
    useEffect(() => {
        if (!show || paused) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        const tick = () => {
            processFrame();
            if (kind === 'video') {
                rafRef.current = requestAnimationFrame(tick);
            }
        };

        // Kick once now (and loop if video)
        tick();

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, paused, kind, width, height, clipTopPx, clipBottomPx, whiteLow, whiteHigh, sourceRef]);

    // Also redraw when the image loads or the video metadata becomes ready
    useEffect(() => {
        const el = sourceRef.current;
        if (!el) return;

        const handleReady = () => { processFrame(); };

        if (kind === 'image') {
            const img = el as HTMLImageElement;
            if (img.complete) handleReady();
            else img.addEventListener('load', handleReady);
            return () => img.removeEventListener('load', handleReady);
        }

        if (kind === 'video') {
            const v = el as HTMLVideoElement;
            v.addEventListener('loadedmetadata', handleReady);
            return () => v.removeEventListener('loadedmetadata', handleReady);
        }
    }, [kind, sourceRef]); // eslint-disable-line react-hooks/exhaustive-deps

    // NEW: Watch for the first time the landing video actually plays, and broadcast it.
    useEffect(() => {
        if (kind !== 'video') return;
        const el = sourceRef.current as HTMLVideoElement | null;
        if (!el) return;

        let fired = false;
        const fireOnce = () => {
            if (fired) return;
            fired = true;
            if (typeof window !== 'undefined') {
                window.__LANDING_VIDEO_PLAYING__ = true;
                window.dispatchEvent(new CustomEvent('landing:video-playing'));
            }
        };

        const onPlaying = () => fireOnce();
        const onTimeUpdate = () => {
            if (!el) return;
            if (!el.paused && !el.ended && el.currentTime > 0 && el.readyState >= 2) {
                fireOnce();
            }
        };

        // If it's already playing, fire immediately
        if (!el.paused && el.currentTime > 0 && el.readyState >= 2) {
            fireOnce();
        }

        el.addEventListener('playing', onPlaying);
        el.addEventListener('timeupdate', onTimeUpdate);

        return () => {
            el.removeEventListener('playing', onPlaying);
            el.removeEventListener('timeupdate', onTimeUpdate);
        };
    }, [kind, sourceRef]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{
                position: 'absolute',
                inset: 0,
                width: `${width}px`,
                height: `${height}px`,
                zIndex,
                pointerEvents: 'none',
                opacity: show ? 1 : 0,
                transition: 'opacity 180ms linear',
            }}
            aria-hidden
        />
    );
};
