// src/pages/landing/components/FallingProjectShowcase.tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import '../styles/FallingProjectShowcase.css';

type ShowcaseItem = { id: string; src: string; alt: string; };
type ScaleOverrides = Partial<Record<string, number>>;

type Props = {
  heroAnimationsDone: boolean;
  startDelayMs?: number;
  items?: ShowcaseItem[];
  finalScales?: ScaleOverrides;
  baseLongSidePx?: number;
  waitHeightPx?: number;
};

const FallingProjectShowcase: React.FC<Props> = ({
  heroAnimationsDone,
  startDelayMs = 1000,
  items: itemsProp,
  finalScales,
  baseLongSidePx,
  waitHeightPx = 90,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const wrappersRef = useRef<Record<string, HTMLDivElement | null>>({});
  const imagesRef = useRef<Record<string, HTMLImageElement | null>>({});

  const registerWrapper = (id: string) => (el: HTMLDivElement | null) => { wrappersRef.current[id] = el; };
  const registerImage  = (id: string) => (el: HTMLImageElement | null) => { imagesRef.current[id] = el; };

  // Fixed slot order:
  // 0 smartlinked (red)
  // 1 kudo (green)
  // 2 holoclean (yellow)
  const items: ShowcaseItem[] = useMemo(
    () => itemsProp ?? [
      { id: 'smartlinked', src: '/smartlinked_hero.png', alt: 'SmartLinked hero' },
      { id: 'kudo',        src: '/kudo_tools_hero.png',  alt: 'Kudo Tools hero' },
      { id: 'holoclean',   src: '/holoclean_hero.png',   alt: 'HoloClean hero' },
    ],
    [itemsProp]
  );

  const scaleById: ScaleOverrides = useMemo(() => {
    const base: ScaleOverrides = {}; items.forEach(it => { base[it.id] = 1; });
    return { ...base, ...(finalScales ?? {}) };
  }, [items, finalScales]);

  const isReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const getContainerSize = () => {
    const el = overlayRef.current;
    return { w: el?.clientWidth ?? 1200, h: el?.clientHeight ?? 700 };
  };

  // ---------- Layout constants ----------
  const GAP_FINAL = 30;    // exact gap in the final formation
  const WAIT_Y = 20;       // aligned top edge during the drop line
  const WAIT_GAP = 12;
  const RIGHT_MARGIN = 24; // wait-state right margin only

  // Helpers
  const getAspectRatio = useCallback((id: string): number => {
    const img = imagesRef.current[id];
    return (img && img.naturalWidth > 0 && img.naturalHeight > 0)
      ? img.naturalWidth / img.naturalHeight
      : 1;
  }, []);

  const computeBaseLongSide = useCallback(() => {
    if (baseLongSidePx) return baseLongSidePx;
    const { w } = getContainerSize();
    return Math.max(220, Math.min(360, Math.round(w * 0.18)));
  }, [baseLongSidePx]);

  // ---------- WAIT (drop line) ----------
  const computeWaitingPositions = useCallback(() => {
    const { w } = getContainerSize();
    const widths = items.map(it => Math.round(waitHeightPx * (getAspectRatio(it.id) || 1)));
    const rightEdge = w - RIGHT_MARGIN;

    let cursorX = rightEdge;
    return widths.map((ww) => {
      const x = cursorX - ww;
      cursorX = x - WAIT_GAP;
      return { x, y: WAIT_Y, w: ww, h: waitHeightPx };
    });
  }, [items, waitHeightPx, getAspectRatio]);

  useEffect(() => {
    const overlay = overlayRef.current;
    overlay?.classList.add('is-wait'); overlay?.classList.remove('is-final');
    if (isReducedMotion) return;

    const waiting = computeWaitingPositions();
    items.forEach((it, idx) => {
      const el = wrappersRef.current[it.id]; if (!el) return;
      gsap.set(el, {
        position: 'absolute', x: waiting[idx].x, y: -260,
        width: waiting[idx].w, height: waiting[idx].h, opacity: 0, zIndex: 9,
      });
      gsap.to(el, {
        y: waiting[idx].y, opacity: 1, duration: 0.85, ease: 'power2.out',
        delay: (startDelayMs / 1000) + idx * 0.5,
      });
    });

    const onResize = () => {
      if (heroAnimationsDone) return;
      const newWaiting = computeWaitingPositions();
      items.forEach((it, idx) => {
        const el = wrappersRef.current[it.id]; if (!el) return;
        gsap.to(el, {
          x: newWaiting[idx].x, width: newWaiting[idx].w, height: newWaiting[idx].h,
          duration: 0.25, ease: 'power1.out',
        });
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, startDelayMs, isReducedMotion, waitHeightPx]);

  useEffect(() => {
    const handlers: Array<{ img: HTMLImageElement; fn: () => void } | null> = items.map((it) => {
      const img = imagesRef.current[it.id]; if (!img) return null;
      const fn = () => {
        if (!heroAnimationsDone) {
          const newWaiting = computeWaitingPositions();
          const el = wrappersRef.current[it.id];
          const myIdx = items.findIndex(x => x.id === it.id);
          if (el && newWaiting[myIdx]) {
            gsap.to(el, {
              x: newWaiting[myIdx].x, width: newWaiting[myIdx].w, height: newWaiting[myIdx].h,
              duration: 0.25, ease: 'power1.out',
            });
          }
        }
      };
      img.addEventListener('load', fn); return { img, fn };
    });
    return () => { handlers.forEach(h => h?.img.removeEventListener('load', h.fn)); };
  }, [items, heroAnimationsDone, computeWaitingPositions]);

  // ---------- FINAL 2×2 LAYOUT ----------
  const applyFinalLayout = useCallback((animate: boolean) => {
    const { w, h } = getContainerSize();
    const longSide = computeBaseLongSide();

    const sizes = items.map((it) => {
      const r = getAspectRatio(it.id);
      const s = scaleById[it.id] ?? 1;
      let baseW: number, baseH: number;
      if (r >= 1) { baseW = longSide; baseH = Math.round(longSide / (r || 1)); }
      else        { baseW = Math.round(longSide * r); baseH = longSide; }
      return { w: Math.round(baseW * s), h: Math.round(baseH * s) };
    });

    // ============================================================
    // GROUP POSITION DIALS (tweak these to move the WHOLE formation)
    // Negative Y moves UP toward the header; positive moves DOWN.
    const FINAL_GROUP_OFFSET_Y_PX = -40; // ⬅️ your requested +30px upward shift
    // Positive value increases right margin (pushes the group LEFT).
    const FINAL_GROUP_EXTRA_RIGHT_MARGIN_PX = 15; // ⬅️ your requested +15px farther from right
    // ============================================================

    const baseTop    = Math.max(100, Math.round(h * 0.15));
    const baseRight  = Math.max(16, Math.round(w * 0.04));

    const topMargin   = Math.max(0, baseTop   + FINAL_GROUP_OFFSET_Y_PX);
    const rightMargin = Math.max(0, baseRight + FINAL_GROUP_EXTRA_RIGHT_MARGIN_PX);

    const rightEdge = w - rightMargin;

    // Layout for 3 items: smartlinked (top), kudo & holoclean (bottom row)
    const A = { x: rightEdge - sizes[0].w,  y: topMargin,               w: sizes[0].w, h: sizes[0].h }; // smartlinked
    const rowWidth = sizes[1].w + GAP_FINAL + sizes[2].w;
    const row1X = rightEdge - rowWidth;
    const B = { x: row1X,                    y: A.y + A.h + GAP_FINAL,   w: sizes[1].w, h: sizes[1].h }; // kudo
    const C = { x: B.x + B.w + GAP_FINAL,    y: A.y + A.h + GAP_FINAL,   w: sizes[2].w, h: sizes[2].h }; // holoclean

    const targetsById: Record<string, {x:number;y:number;w:number;h:number}> = {
      smartlinked: A, kudo: B, holoclean: C,
    };

    overlayRef.current?.classList.remove('is-wait');
    overlayRef.current?.classList.add('is-final');

    items.forEach((it, idx) => {
      const el = wrappersRef.current[it.id]; if (!el) return;
      const t = targetsById[it.id];
      if (animate && !isReducedMotion) {
        gsap.to(el, {
          x: t.x, y: t.y, width: t.w, height: t.h,
          duration: 1.15, ease: 'power3.inOut', delay: idx * 0.06,
        });
      } else {
        gsap.set(el, { x: t.x, y: t.y, width: t.w, height: t.h, opacity: 1 });
      }
    });
  }, [items, getAspectRatio, isReducedMotion, scaleById, computeBaseLongSide]);

  useEffect(() => { if (heroAnimationsDone) applyFinalLayout(true); }, [heroAnimationsDone, applyFinalLayout]);

  useEffect(() => {
    const onResizeFinal = () => { if (heroAnimationsDone) applyFinalLayout(false); };
    window.addEventListener('resize', onResizeFinal);
    return () => window.removeEventListener('resize', onResizeFinal);
  }, [heroAnimationsDone, applyFinalLayout]);

  useEffect(() => {
    if (!isReducedMotion) return;
    overlayRef.current?.classList.remove('is-wait');
    overlayRef.current?.classList.add('is-final');
    items.forEach((it) => {
      const el = wrappersRef.current[it.id]; if (!el) return;
      gsap.set(el, { position: 'absolute', opacity: 1, height: waitHeightPx });
    });
    applyFinalLayout(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReducedMotion, items]);

  return (
    <div ref={overlayRef} className="fps-overlay" aria-hidden>
      {items.map((it) => (
        <div key={it.id} ref={registerWrapper(it.id)} className="fps-item">
          <img
            ref={registerImage(it.id)}
            src={it.src}
            alt={it.alt}
            className="fps-img"
            draggable={false}
            decoding="async"
            loading="eager"
          />
        </div>
      ))}
    </div>
  );
};

export default FallingProjectShowcase;
