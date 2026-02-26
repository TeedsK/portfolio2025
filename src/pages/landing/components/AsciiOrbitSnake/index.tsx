// src/pages/landing/components/AsciiOrbitSnake/index.tsx
// Standalone ASCII snake that wanders in Education and orbits the ellipse in About Me.

import React, { useEffect, useRef, useCallback } from 'react';
import {
  CHAR_WIDTH,
  CHAR_HEIGHT,
  FRAME_TIME,
  PLANET_RADIUS,
  clamp01,
  smoothstep,
  noise1D,
  noise1DFine,
  allocateGrid,
  resetGrid,
  renderSnakeToGrid,
  renderGridToCanvas,
  type GridCell,
  type SnakeState,
} from './snakeRenderer';

// ============== PROPS ==============

export interface AsciiOrbitSnakeProps {
  educationRef: React.RefObject<HTMLDivElement | null>;
  aboutMeRef: React.RefObject<HTMLDivElement | null>;
}

// ============== COMPONENT ==============

const AsciiOrbitSnake: React.FC<AsciiOrbitSnakeProps> = ({ educationRef, aboutMeRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isVisibleRef = useRef(false);
  const isPageVisibleRef = useRef(true);

  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);

  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ w: 0, h: 0 });
  const snakeCellsRef = useRef<{ x: number; y: number }[]>([]);

  const dimsRef = useRef({ width: 0, height: 0 });

  const snakeRef = useRef<SnakeState>({
    body: [],
    colorTheme: 'blueLight',
    bodyLength: 60,
    baseThickness: 3.5,
    seed: { x: 42 + Math.random() * 100, y: 77 + Math.random() * 100, z: 13 + Math.random() * 100 },
    freePos: { x: 0, y: 0, z: 0 },
    orbitalPhase: Math.random() * Math.PI * 2,
  });

  // ---- Grid management ----
  const getGrid = useCallback((w: number, h: number): GridCell[][] => {
    if (!gridRef.current || gridDimsRef.current.w !== w || gridDimsRef.current.h !== h) {
      gridRef.current = allocateGrid(w, h);
      gridDimsRef.current = { w, h };
    } else {
      resetGrid(gridRef.current, w, h);
    }
    return gridRef.current;
  }, []);

  useEffect(() => {
    // Skip entirely if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // ---- Visibility gating ----
    const io = new IntersectionObserver(
      ([entry]) => { isVisibleRef.current = entry.isIntersecting; },
      { threshold: 0.01, rootMargin: '200px' },
    );
    io.observe(wrapper);

    const onVisChange = () => { isPageVisibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', onVisChange);

    // ---- Resize ----
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        dimsRef.current = { width: Math.floor(width), height: Math.floor(height) };
      }
    });
    ro.observe(wrapper);

    // ---- Initialize dims ----
    const rect = wrapper.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      dimsRef.current = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
    }

    // ---- RAF loop ----
    let animId: number;
    let prevTime = performance.now();

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);

      if (!isVisibleRef.current || !isPageVisibleRef.current) return;
      if (now - lastFrameRef.current < FRAME_TIME) return;
      lastFrameRef.current = now;

      const { width, height } = dimsRef.current;
      if (width <= 0 || height <= 0) return;

      // Resize canvas if needed
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        ctx.font = `bold ${CHAR_HEIGHT - 1}px "SF Mono", Monaco, Consolas, monospace`;
        ctx.textBaseline = 'top';
      }

      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      const gridW = Math.max(10, Math.floor(width / CHAR_WIDTH));
      const gridH = Math.max(10, Math.floor(height / CHAR_HEIGHT));

      // ---- Scroll blend: 0 = Education (free), 1 = About Me (orbit) ----
      let blend = 0;
      const isNarrow = width <= 1199;

      if (!isNarrow && aboutMeRef.current) {
        const aboutRect = aboutMeRef.current.getBoundingClientRect();
        const vh = window.innerHeight;
        blend = clamp01((vh * 0.8 - aboutRect.top) / (vh * 0.5));
      }
      // On narrow viewports, force free-wander mode (orbit hidden in CSS)
      if (isNarrow) blend = 0;

      const snake = snakeRef.current;

      // ---- Orbit center (About Me ellipse center in grid coords) ----
      let orbitCenterGX = gridW * 0.5;
      let orbitCenterGY = gridH * 0.5;

      if (aboutMeRef.current && wrapperRef.current) {
        const wrapRect = wrapperRef.current.getBoundingClientRect();
        const aboutRect = aboutMeRef.current.getBoundingClientRect();
        // About Me web-canvas center relative to wrapper
        const aboutCenterPx = (aboutRect.top - wrapRect.top) + aboutRect.height * 0.5;
        const aboutCenterXPx = (aboutRect.left - wrapRect.left) + aboutRect.width * 0.5;
        orbitCenterGX = aboutCenterXPx / CHAR_WIDTH;
        orbitCenterGY = aboutCenterPx / CHAR_HEIGHT;
      }

      // Ellipse semi-axes in grid units (match CSS 920x720 orbit)
      const semiMajorG = 460 / CHAR_WIDTH;    // 92 grid units
      const semiMinorG = 360 / CHAR_HEIGHT;   // 45 grid units

      // ---- Orbit position ----
      snake.orbitalPhase += 0.4 * dt;
      const orbitX = orbitCenterGX + semiMajorG * Math.cos(snake.orbitalPhase);
      const orbitY = orbitCenterGY + semiMinorG * Math.sin(snake.orbitalPhase);
      const orbitZ = Math.sin(snake.orbitalPhase) * 50;

      // ---- Free wander position ----
      // Constrain to education portion when blend is low, full area otherwise
      const eduFraction = educationRef.current && wrapperRef.current
        ? (() => {
            const wrapRect = wrapperRef.current!.getBoundingClientRect();
            const eduRect = educationRef.current!.getBoundingClientRect();
            const eduBottom = eduRect.bottom - wrapRect.top;
            return clamp01(eduBottom / height);
          })()
        : 0.5;

      const freeAreaMaxY = blend < 0.1 ? gridH * eduFraction : gridH;
      const margin = snake.baseThickness * 4;

      const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
      const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
      const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

      const freeXTarget = margin + (gridW - margin * 2) * clamp01(noiseX * 0.5 + 0.5);
      const freeYTarget = margin + (freeAreaMaxY - margin * 2) * clamp01(noiseY * 0.5 + 0.5);
      const freeZTarget = -PLANET_RADIUS + (2 * PLANET_RADIUS) * clamp01(noiseZ * 0.5 + 0.5);

      // Initialize free position to something sensible on first frame
      if (snake.body.length === 0) {
        snake.freePos.x = freeXTarget;
        snake.freePos.y = freeYTarget;
        snake.freePos.z = freeZTarget;
      }

      // Smooth follow
      const sFree = 1 - Math.exp(-1.8 * dt);
      snake.freePos.x += (freeXTarget - snake.freePos.x) * sFree;
      snake.freePos.y += (freeYTarget - snake.freePos.y) * sFree;
      snake.freePos.z += (freeZTarget - snake.freePos.z) * sFree;

      // ---- Blended head position ----
      const blendS = smoothstep(0, 1, blend);
      const headX = snake.freePos.x + (orbitX - snake.freePos.x) * blendS;
      const headY = snake.freePos.y + (orbitY - snake.freePos.y) * blendS;
      const headZ = snake.freePos.z + (orbitZ - snake.freePos.z) * blendS;

      // ---- Tangent ----
      let tangentX = 1, tangentY = 0;
      if (snake.body.length > 0) {
        const prev = snake.body[0];
        const dx = headX - prev.x;
        const dy = headY - prev.y;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m > 0.001) { tangentX = dx / m; tangentY = dy / m; }
      }

      snake.body.unshift({ x: headX, y: headY, z: headZ, tangentX, tangentY });
      if (snake.body.length > snake.bodyLength) snake.body.length = snake.bodyLength;

      // ---- Render ----
      const grid = getGrid(gridW, gridH);
      const snakeCells = snakeCellsRef.current;
      snakeCells.length = 0;

      renderSnakeToGrid(snake, grid, gridW, gridH, snakeCells, PLANET_RADIUS);
      renderGridToCanvas(ctx, grid, gridW, gridH, snakeCells, snake.colorTheme);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [educationRef, aboutMeRef, getGrid]);

  // Skip rendering if user prefers reduced motion
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};

export default AsciiOrbitSnake;
