import React, { useEffect, useRef } from 'react';

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
    /** Cut 5px from top and bottom as requested */
    clipTopBottomPx?: number;
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
    clipTopBottomPx = 5,
    whiteLow = 230,
    whiteHigh = 250,
    paused = false,
    className,
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const tmpCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    // Compute letterbox fit of source into our container
    const getDestRect = (srcW: number, srcH: number) => {
        const containerW = width;
        const containerH = height;

        if (containerW <= 0 || containerH <= 0 || srcW <= 0 || srcH <= 0) {
            return { dx: 0, dy: 0, dw: 0, dh: 0 };
        }

        const srcAR = srcW / srcH;
        const dstAR = containerW / containerH;

        let dw: number, dh: number, dx: number, dy: number;

        if (srcAR > dstAR) {
            // fit to width
            dw = containerW;
            dh = containerW / srcAR;
            dx = 0;
            dy = (containerH - dh) / 2;
        } else {
            // fit to height
            dh = containerH;
            dw = containerH * srcAR;
            dy = 0;
            dx = (containerW - dw) / 2;
        }

        // Trim 5px top & bottom in destination space
        const clip = clipTopBottomPx ?? 0;
        dy += clip;
        dh = Math.max(0, dh - clip * 2);

        return { dx, dy, dw, dh };
    };

    const processFrame = () => {
        const canvas = canvasRef.current;
        const srcEl = sourceRef.current;

        if (!canvas || !srcEl) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const srcW =
            srcEl instanceof HTMLVideoElement ? srcEl.videoWidth : srcEl.naturalWidth;
        const srcH =
            srcEl instanceof HTMLVideoElement ? srcEl.videoHeight : srcEl.naturalHeight;

        if (!srcW || !srcH) return;

        // Prepare canvases
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        if (!tmpCanvasRef.current) {
            tmpCanvasRef.current = document.createElement('canvas');
        }

        const tmp = tmpCanvasRef.current;
        const { dx, dy, dw, dh } = getDestRect(srcW, srcH);

        // Avoid work when dimensions are not ready
        if (dw <= 0 || dh <= 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Draw the source scaled into the temp canvas (exactly the area we’ll show)
        tmp.width = Math.max(1, Math.round(dw));
        tmp.height = Math.max(1, Math.round(dh));
        const tctx = tmp.getContext('2d');
        if (!tctx) return;

        tctx.clearRect(0, 0, tmp.width, tmp.height);
        // Draw full source into the scaled dest frame
        tctx.drawImage(srcEl, 0, 0, srcW, srcH, 0, 0, dw, dh);

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
            // For video we do it each frame, for image we can still refresh in case size changes
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
    }, [show, paused, kind, width, height, clipTopBottomPx, whiteLow, whiteHigh, sourceRef]);

    // Also redraw when the image loads or the video metadata becomes ready
    useEffect(() => {
        const el = sourceRef.current;
        if (!el) return;

        const handleReady = () => {
            if (kind === 'image') processFrame();
        };

        if (kind === 'image') {
            if ((el as HTMLImageElement).complete) {
                handleReady();
            } else {
                el.addEventListener('load', handleReady);
            }
            return () => el.removeEventListener('load', handleReady);
        }

        if (kind === 'video') {
            const v = el as HTMLVideoElement;
            const onMeta = () => processFrame();
            v.addEventListener('loadedmetadata', onMeta);
            return () => v.removeEventListener('loadedmetadata', onMeta);
        }
    }, [kind, sourceRef]); // eslint-disable-line react-hooks/exhaustive-deps

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
