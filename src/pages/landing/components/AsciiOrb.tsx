// src/pages/landing/components/AsciiOrb.tsx
// High-performance ASCII snake animation using Canvas
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import gsap from 'gsap';

type ColorTheme = 'green' | 'pink' | 'cyan' | 'orange';

type Props = {
  show: boolean;
  bodyLength?: number;
  speed?: number;
  baseThickness?: number;
  minZ?: number;
  maxZ?: number;
  colorTheme?: ColorTheme;
  seed?: number; // Optional seed for different movement patterns
  followScroll?: boolean; // Enable scroll-following behavior
  scrollTargetY?: number; // Target Y position (0-1 normalized) based on scroll
  scrollInfluence?: number; // How strongly the scroll target influences movement (0-1, default 0.3)
};

// Depth-based character sets
const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

// Pre-computed light direction
const LIGHT_X = -0.408;
const LIGHT_Y = -0.572;
const LIGHT_Z = 0.408;

// Character dimensions
const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 8;

// Simplified character selection
const getChar = (zDepth: number, intensity: number): string => {
  const idx = Math.max(0, Math.min(4, (1 - intensity) * 4 | 0));
  if (zDepth < 0.35) return DEPTH_CHARS.far[idx];
  if (zDepth < 0.55) return DEPTH_CHARS.mid[idx];
  if (zDepth < 0.8) return DEPTH_CHARS.close[Math.min(idx, 5)];
  return DEPTH_CHARS.closest[Math.min(idx, 5)];
};

// Color theme configurations (hue ranges and glow colors)
const COLOR_THEMES: Record<ColorTheme, { hueStart: number; hueEnd: number; glowColor: string }> = {
  green: { hueStart: 190, hueEnd: 90, glowColor: 'rgba(100, 255, 100,' },
  pink: { hueStart: 330, hueEnd: 300, glowColor: 'rgba(255, 100, 180,' },
  cyan: { hueStart: 200, hueEnd: 180, glowColor: 'rgba(100, 220, 255,' },
  orange: { hueStart: 40, hueEnd: 20, glowColor: 'rgba(255, 180, 100,' },
};

// Generate color LUT for a specific theme
const generateColorLUT = (theme: ColorTheme): string[] => {
  const lut: string[] = [];
  const { hueStart, hueEnd } = COLOR_THEMES[theme];

  for (let z = 0; z < 20; z++) {
    for (let l = 0; l < 10; l++) {
      const normalizedZ = z / 20;
      const hue = hueStart - normalizedZ * (hueStart - hueEnd);
      const saturation = 40 + normalizedZ * 50;
      const lightness = 45 + l * 4;
      const alpha = 0.5 + normalizedZ * 0.4;
      lut.push(`hsla(${hue | 0}, ${saturation | 0}%, ${lightness | 0}%, ${alpha.toFixed(2)})`);
    }
  }
  return lut;
};

// Pre-generate LUTs for all themes
const colorLUTs: Record<ColorTheme, string[]> = {
  green: generateColorLUT('green'),
  pink: generateColorLUT('pink'),
  cyan: generateColorLUT('cyan'),
  orange: generateColorLUT('orange'),
};

const getColor = (zDepth: number, lighting: number, theme: ColorTheme): string => {
  const zIdx = Math.min(19, Math.max(0, (zDepth * 20) | 0));
  const lIdx = Math.min(9, Math.max(0, (lighting * 10) | 0));
  return colorLUTs[theme][zIdx * 10 + lIdx];
};

// Noise functions
const noise1D = (t: number, seed: number): number => (
  Math.sin(t * 0.7 + seed) * 0.35 +
  Math.sin(t * 1.3 + seed * 1.7) * 0.25 +
  Math.sin(t * 2.1 + seed * 2.3) * 0.15 +
  Math.sin(t * 0.4 + seed * 0.5) * 0.25
);

const noise1DFine = (t: number, seed: number): number => (
  Math.sin(t * 3.1 + seed) * 0.1 +
  Math.sin(t * 4.7 + seed * 1.3) * 0.08
);

type BodySegment = {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
};

// Simple grid cell - minimal memory
type GridCell = {
  char: string;
  color: string;
  priority: number;
};

const AsciiOrb: React.FC<Props> = ({
  show,
  bodyLength = 30,
  speed = 1,
  baseThickness = 7,
  minZ = 0.2,
  maxZ = 1.0,
  colorTheme = 'green',
  seed: seedProp,
  followScroll = false,
  scrollTargetY = 0.5,
  scrollInfluence = 0.3,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 160, height: 60 });

  const timeRef = useRef(0);
  const bodyRef = useRef<BodySegment[]>([]);
  const seedRef = useRef({
    x: (seedProp ?? Math.random() * 100) + Math.random() * 50,
    y: (seedProp ?? Math.random() * 100) + Math.random() * 50,
    z: (seedProp ?? Math.random() * 100) + Math.random() * 50,
  });
  const avgZRef = useRef(0.5);
  const isPageVisibleRef = useRef(true);

  // Scroll-following refs (use refs to avoid re-creating animation loop on every scroll)
  const scrollTargetYRef = useRef(scrollTargetY);
  const scrollInfluenceRef = useRef(scrollInfluence);
  const followScrollRef = useRef(followScroll);

  // Reusable grid
  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ width: 0, height: 0 });

  // Frame timing
  const lastFrameRef = useRef(0);
  const FRAME_TIME = 33; // ~30fps

  // Get or reset grid buffer
  const getGrid = useCallback((width: number, height: number): GridCell[][] => {
    if (!gridRef.current || gridDimsRef.current.width !== width || gridDimsRef.current.height !== height) {
      const grid: GridCell[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          grid[y][x] = { char: '', color: '', priority: -1e9 };
        }
      }
      gridRef.current = grid;
      gridDimsRef.current = { width, height };
    } else {
      const grid = gridRef.current;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          grid[y][x].char = '';
          grid[y][x].priority = -1e9;
        }
      }
    }
    return gridRef.current;
  }, []);

  // Keep scroll refs in sync with props (avoids re-creating animation loop)
  useEffect(() => {
    scrollTargetYRef.current = scrollTargetY;
  }, [scrollTargetY]);
  useEffect(() => {
    scrollInfluenceRef.current = scrollInfluence;
  }, [scrollInfluence]);
  useEffect(() => {
    followScrollRef.current = followScroll;
  }, [followScroll]);

  // Page visibility - pause when hidden
  useEffect(() => {
    const handleVisibility = () => {
      isPageVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Measure container
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(100, Math.floor(rect.width / CHAR_WIDTH)),
          height: Math.max(40, Math.floor(rect.height / CHAR_HEIGHT)),
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isVisible]);

  // Main animation loop
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    canvas.width = dimensions.width * CHAR_WIDTH;
    canvas.height = dimensions.height * CHAR_HEIGHT;

    ctx.font = `bold ${CHAR_HEIGHT - 1}px "SF Mono", Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    const themeConfig = COLOR_THEMES[colorTheme];

    let animId: number;
    let prevTime = performance.now();

    const animate = (now: number) => {
      // Skip if page hidden or throttled
      if (!isPageVisibleRef.current || now - lastFrameRef.current < FRAME_TIME) {
        animId = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now;

      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      timeRef.current += dt * speed;
      const t = timeRef.current;

      const { width, height } = dimensions;
      const seed = seedRef.current;

      // Z position
      const noiseZ = noise1D(t * 0.2, seed.z) + noise1DFine(t * 0.4, seed.z);
      const currentZ = minZ + (maxZ - minZ) * (noiseZ * 0.5 + 0.5);
      const margin = baseThickness * (0.5 + currentZ * 0.8) * 4;

      // Head position with wiggle
      const noiseX = noise1D(t * 0.45, seed.x) + noise1DFine(t * 0.8, seed.x);
      const noiseY = noise1D(t * 0.35, seed.y) + noise1DFine(t * 0.7, seed.y);
      const wiggleX = Math.sin(t * 2.2) * 0.08 + Math.sin(t * 3.7) * 0.04;
      const wiggleY = Math.cos(t * 1.9) * 0.06 + Math.cos(t * 3.3) * 0.03;

      const headX = margin + (width - margin * 2) * ((noiseX + wiggleX) * 0.5 + 0.5);

      // Calculate natural Y position from noise
      const naturalYNorm = (noiseY + wiggleY) * 0.5 + 0.5;

      // If following scroll, blend natural movement with scroll target
      // The scroll target acts as an "attractor" - the snake prefers to be near it
      // but still maintains its organic noise-based movement
      let finalYNorm = naturalYNorm;
      if (followScrollRef.current) {
        // Smoothly blend toward scroll target - more influence = more following
        // Use a soft blending that allows natural movement within a region around the target
        const attractorStrength = scrollInfluenceRef.current;
        const targetY = scrollTargetYRef.current;
        const delta = targetY - naturalYNorm;
        // Apply a soft curve so the snake isn't rigidly following
        // Allow more freedom when close to target, pull more when far
        const distance = Math.abs(delta);
        const pullFactor = distance * attractorStrength * 1.5; // Stronger pull when far
        finalYNorm = naturalYNorm + delta * Math.min(pullFactor, attractorStrength);
        // Clamp to valid range
        finalYNorm = Math.max(0, Math.min(1, finalYNorm));
      }

      const headY = margin + (height - margin * 2) * finalYNorm;

      // Tangent
      let tangentX = 1, tangentY = 0;
      const body = bodyRef.current;
      if (body.length > 0) {
        const p = body[0];
        const dx = headX - p.x, dy = headY - p.y;
        const m = Math.sqrt(dx * dx + dy * dy);
        if (m > 0.001) { tangentX = dx / m; tangentY = dy / m; }
      }

      // Add head
      body.unshift({ x: headX, y: headY, z: currentZ, tangentX, tangentY });
      if (body.length > bodyLength) body.length = bodyLength;

      // Average Z for glow
      let sumZ = 0;
      for (let i = 0; i < body.length; i++) sumZ += body[i].z;
      avgZRef.current = sumZ / body.length;

      if (body.length < 2) {
        animId = requestAnimationFrame(animate);
        return;
      }

      const grid = getGrid(width, height);

      // Sort by Z (far to near)
      const indices: number[] = [];
      for (let i = 0; i < body.length; i++) indices.push(i);
      indices.sort((a, b) => body[a].z - body[b].z);

      // Render segments
      for (const i of indices) {
        const seg = body[i];
        const bodyPos = i / (body.length - 1);
        const taper = 1 - bodyPos * 0.6;
        const zScale = 0.25 + seg.z * 1.25;
        const thick = baseThickness * taper * zScale;

        const radiusX = thick * (1.6 + seg.z * 0.6);
        const radiusY = thick * (0.8 + seg.z * 0.25);
        const fade = 1 - bodyPos * 0.65;
        const basePri = seg.z * 1000;

        const ceilRX = Math.ceil(radiusX);
        const ceilRY = Math.ceil(radiusY);

        const perpX = -seg.tangentY;
        const perpY = seg.tangentX;

        for (let dy = -ceilRY; dy <= ceilRY; dy++) {
          const py = (seg.y + dy + 0.5) | 0;
          if (py < 0 || py >= height) continue;
          const ny = dy / radiusY;
          const ny2 = ny * ny;

          for (let dx = -ceilRX; dx <= ceilRX; dx++) {
            const px = (seg.x + dx + 0.5) | 0;
            if (px < 0 || px >= width) continue;

            const nx = dx / radiusX;
            const d2 = nx * nx + ny2;
            if (d2 > 1) continue;

            const tubeD = Math.sqrt(1 - d2);
            const mag = Math.sqrt(d2 + tubeD * tubeD);

            // Simple lighting - dot product with light direction
            const normalX = (nx * perpX + ny * seg.tangentX) / mag;
            const normalY = (nx * perpY + ny * seg.tangentY) / mag;
            const normalZ = tubeD / mag;
            const light = Math.max(0.15, normalX * LIGHT_X + normalY * LIGHT_Y + normalZ * LIGHT_Z) * fade;

            const pri = basePri + tubeD * 10;
            if (pri > grid[py][px].priority) {
              grid[py][px].char = getChar(seg.z, light);
              grid[py][px].color = getColor(seg.z, light, colorTheme);
              grid[py][px].priority = pri;
            }
          }
        }
      }

      // Render to canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Glow with theme color
      const glow = 0.1 + avgZRef.current * 0.15;
      ctx.shadowColor = `${themeConfig.glowColor} ${glow})`;
      ctx.shadowBlur = 3 + avgZRef.current * 3;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const c = grid[y][x];
          if (c.char) {
            ctx.fillStyle = c.color;
            ctx.fillText(c.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [isVisible, dimensions, bodyLength, speed, baseThickness, minZ, maxZ, colorTheme, getGrid]);

  // GSAP visibility
  useEffect(() => {
    if (!containerRef.current) return;

    if (show) {
      setIsVisible(true);
      bodyRef.current = [];
      gsap.fromTo(containerRef.current, { opacity: 0 }, { opacity: 1, duration: 1.5, ease: 'power2.out', delay: 0.3 });
    } else {
      gsap.to(containerRef.current, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => setIsVisible(false) });
    }
  }, [show]);

  const containerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    opacity: 0,
    pointerEvents: 'none',
    zIndex: 1,
    overflow: 'hidden',
  }), []);

  const canvasStyle: React.CSSProperties = useMemo(() => ({
    imageRendering: 'pixelated',
  }), []);

  if (!show && !isVisible) return null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden="true">
      <canvas ref={canvasRef} style={canvasStyle} />
    </div>
  );
};

export default AsciiOrb;
