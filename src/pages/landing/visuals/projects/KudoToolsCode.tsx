import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './KudoTools.css';

import {
    runInventoryPreview,
    runCaptchaPreview,
    runServersPreview,
    runConverterPreview,
    runSpoofPreview,
    SubvizRunHandle,
} from './kudoAnims';

type TileKey = 'inventory' | 'captcha' | 'servers' | 'converter' | 'spoof';

type TileDef = {
    key: TileKey;
    label: string;
    mono: string;
    className: string; // mapped to CSS grid placement
    img: string;
};

const TILES: TileDef[] = [
    { key: 'inventory', label: 'inventory', mono: 'I', className: 'tile-inventory', img: '/images/kudo/items/tool_inventory.png' },
    { key: 'captcha', label: 'CAPTCHA harvesters', mono: 'C', className: 'tile-captcha', img: '/images/kudo/items/tool_captcha.png' },
    { key: 'servers', label: 'server management', mono: 'S', className: 'tile-servers', img: '/images/kudo/items/tool_server.png' },
    { key: 'converter', label: 'profile converter', mono: 'P', className: 'tile-converter', img: '/images/kudo/items/tool_profile_converter.png' },
    { key: 'spoof', label: 'browser spoof', mono: 'B', className: 'tile-spoof', img: '/images/kudo/items/tool_proxy.png' },
];

// Randomize array order
function shuffled<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Helper to await GSAP timelines
function awaitGsap(tw: gsap.core.Tween | gsap.core.Timeline): Promise<void> {
    return new Promise((resolve) => tw.eventCallback('onComplete', () => resolve()));
}

// Factory to spawn the correct sub-animation
function runPreviewFor(
    key: TileKey,
    opts: { container: HTMLElement; center: { x: number; y: number } }
): SubvizRunHandle {
    switch (key) {
        case 'inventory': return runInventoryPreview(opts);
        case 'captcha': return runCaptchaPreview(opts);
        case 'servers': return runServersPreview(opts);
        case 'converter': return runConverterPreview(opts);
        case 'spoof': return runSpoofPreview(opts);
    }
}

const KudoToolsCode: React.FC<{ play: boolean }> = ({ play }) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);

    const tileRefs = useRef<Record<TileKey, HTMLDivElement | null>>({
        inventory: null, captcha: null, servers: null, converter: null, spoof: null,
    });
    const setTileRef = (k: TileKey) => (el: HTMLDivElement | null) => { tileRefs.current[k] = el; };

    const runTokenRef = useRef(0);
    const activePreviewRef = useRef<SubvizRunHandle | null>(null);

    const introTlRef = useRef<gsap.core.Timeline | null>(null);
    const focusTlRef = useRef<gsap.core.Timeline | null>(null);

    // Timer management
    const pauseIdsRef = useRef<number[]>([]);
    const pause = (ms: number) =>
        new Promise<void>((resolve) => {
            const token = runTokenRef.current;
            const id = window.setTimeout(() => { if (runTokenRef.current === token) resolve(); }, ms);
            pauseIdsRef.current.push(id);
        });

    // Reset to initial invisible state
    const setBaseState = () => {
        const tiles = Object.values(tileRefs.current).filter(Boolean) as HTMLDivElement[];
        tiles.forEach((el) => {
            gsap.set(el, { clearProps: 'all' });
            gsap.set(el, { opacity: 0, scale: 0, transformOrigin: '50% 50%' });
            el.classList.remove('is-active');
        });
        if (overlayRef.current) overlayRef.current.innerHTML = '';
    };

    // Phase 1: Intro
    const runIntro = async () => {
        const tiles = (TILES.map((t) => tileRefs.current[t.key]).filter(Boolean) as HTMLDivElement[]);
        if (!tiles.length) return;

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        introTlRef.current = tl;

        tiles.forEach((el) => {
            const y = gsap.utils.random(-10, 12);
            const r = gsap.utils.random(-1.5, 1.5);
            gsap.set(el, { y, rotate: r });
        });

        tl.to(tiles, {
            opacity: 1,
            scale: 1,
            y: 0,
            rotate: 0,
            duration: 0.55,
            stagger: { amount: 0.3, grid: 'auto', from: 'random' },
        });

        await awaitGsap(tl);
    };

    // Phase 2: Loop with Center-Move and Scale-Out
    const runFocusCycle = async () => {
        const myToken = ++runTokenRef.current;
        const order = shuffled(TILES).map((t) => t.key);
        const map = tileRefs.current;

        for (const key of order) {
            if (runTokenRef.current !== myToken) return;

            const active = map[key];
            const root = rootRef.current;
            if (!active || !root) continue;

            // Identify "other" tiles to hide
            const others = (Object.entries(map) as [TileKey, HTMLDivElement | null][])
                .filter(([k, el]) => k !== key && el)
                .map(([_, el]) => el!) as HTMLDivElement[];

            // --- Calculate Center Delta ---
            const rootRect = root.getBoundingClientRect();
            const tileRect = active.getBoundingClientRect();

            const rootCenterX = rootRect.width / 2;
            const rootCenterY = rootRect.height / 2;

            // Current tile center relative to root
            const tileCenterX = (tileRect.left - rootRect.left) + (tileRect.width / 2);
            const tileCenterY = (tileRect.top - rootRect.top) + (tileRect.height / 2);

            const dx = rootCenterX - tileCenterX;
            const dy = rootCenterY - tileCenterY;

            active.classList.add('is-active');

            // --- Timeline IN: Move Center -> Scale to 0 ---
            const tlIn = gsap.timeline();
            focusTlRef.current = tlIn;

            // 1. Hide others
            tlIn.to(others, { scale: 0, opacity: 0, duration: 0.4, stagger: 0.02, ease: 'power2.in' }, 0);

            // 2. Move active to center (while scaling up slightly for impact)
            tlIn.to(active, {
                x: dx,
                y: dy,
                scale: 1.1,
                zIndex: 50, // Above others, but below overlay (CSS handles overlay z-index)
                duration: 0.5,
                ease: 'power3.inOut',
                boxShadow: '0 30px 80px rgba(0,0,0,0.2)'
            }, 0);

            // 3. Scale active to 0 (Poof!) to reveal animation behind/above it
            tlIn.to(active, {
                scale: 0,
                opacity: 0,
                duration: 0.25,
                ease: 'back.in(1.5)'
            }, 0.5);

            await awaitGsap(tlIn);
            if (runTokenRef.current !== myToken) return;

            // --- Run Animation (Phase 3) ---
            if (overlayRef.current) {
                // Animation spawns exactly at the center of container
                const center = { x: rootCenterX, y: rootCenterY };
                const handle = runPreviewFor(key, { container: overlayRef.current, center });
                activePreviewRef.current = handle;
                try {
                    await handle.promise;
                } finally {
                    handle.cancel?.();
                    activePreviewRef.current = null;
                }
            }

            // Short pause
            await pause(300);
            if (runTokenRef.current !== myToken) return;

            // --- Timeline OUT: Scale up at center -> Move back ---
            const tlOut = gsap.timeline();

            // 1. Pop active back into existence at center
            tlOut.to(active, {
                scale: 1.1,
                opacity: 1,
                duration: 0.35,
                ease: 'back.out(1.5)'
            }, 0);

            // 2. Move back to grid origin (0,0)
            tlOut.to(active, {
                x: 0,
                y: 0,
                scale: 1,
                zIndex: 1,
                duration: 0.5,
                ease: 'power3.inOut',
                boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
            }, 0.35);

            // 3. Bring back others
            tlOut.to(others, { scale: 1, opacity: 1, duration: 0.4, stagger: 0.03, ease: 'power2.out' }, 0.5);

            await awaitGsap(tlOut);
            active.classList.remove('is-active');

            // Pause before next tile
            await pause(600);
        }

        if (runTokenRef.current === myToken) runFocusCycle();
    };

    useEffect(() => {
        const killAll = () => {
            ++runTokenRef.current;
            introTlRef.current?.kill(); introTlRef.current = null;
            focusTlRef.current?.kill(); focusTlRef.current = null;
            activePreviewRef.current?.cancel?.(); activePreviewRef.current = null;
            pauseIdsRef.current.forEach((id) => clearTimeout(id));
            pauseIdsRef.current = [];
        };

        if (!play) {
            killAll();
            setBaseState();
            return;
        }

        let cancelled = false;
        (async () => {
            setBaseState();
            await new Promise(r => setTimeout(r, 100));
            if (cancelled) return;
            await runIntro();
            if (cancelled) return;
            await runFocusCycle();
        })();

        return () => { cancelled = true; killAll(); };
    }, [play]);

    return (
        <div ref={rootRef} className="kudo-root" role="group" aria-label="Kudo Tools preview">
            <div ref={gridRef} className="kudo-grid">
                {TILES.map((t) => (
                    <div
                        key={t.key}
                        ref={setTileRef(t.key)}
                        data-key={t.key}
                        className={`kudo-tile ${t.className}`}
                        aria-label={`${t.label} tile`}
                    >
                        <div className="kudo-tile__badge" aria-hidden><span className="mono">{t.mono}</span></div>
                        <img className="kudo-tile__img" src={t.img} alt={t.label} draggable={false} />
                        <div className="kudo-tile__label">{t.label}</div>
                    </div>
                ))}
            </div>
            <div ref={overlayRef} className="kudo-overlay" aria-hidden />
        </div>
    );
};

export default KudoToolsCode;