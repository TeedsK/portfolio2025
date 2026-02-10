// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// Noise-based animated ASCII orb with orbiting snake "rings" that detach on scroll
//
// The orb is a circular mask filled with simplex-noise-driven intensity.
// Radial falloff gives soft edges, noise advection makes it swirl internally.
// Beam impacts trigger expanding shockwave ripples inside the orb.
// Two ASCII snakes orbit the orb and smoothly transition to free-roam on scroll.

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { makeNoise2D } from 'open-simplex-noise';
import { ScanBeam, Point3D } from '../../../../types';
import {
  Snake,
  ImpactEffect,
  GridCell,
  COLOR_THEMES,
  ColorTheme,
} from './types';

// ============== CONSTANTS ==============

// Orb (noise-based animated sphere, replaces old 3D planet)
const PLANET_RADIUS = 90;  // kept for snake z-depth compatibility
const ORB_RADIUS = 55;     // grid units - visual radius of the orb (~2x original)
const ORB_NOISE_SCALE = 35; // larger = bigger, smoother noise blobs (scaled with size)
const ORB_GLYPHS = ' .:-=+*#%@';
const ORB_Y_ASPECT = 0.625; // = CHAR_WIDTH / CHAR_HEIGHT, compensate for tall characters

// Orb colors (black theme for contrast on white bg)
const ORB_PRIMARY_RGB = { r: 0, g: 0, b: 0 };        // pure black (dark regions)
const ORB_SECONDARY_RGB = { r: 50, g: 50, b: 50 };    // dark gray (bright regions)

// Shockwave tunables (triggered by beam impacts)
const SHOCKWAVE_DURATION_S = 0.55;  // seconds
const SHOCKWAVE_SPEED = 18;         // grid units per second
const SHOCKWAVE_WIDTH = 1.4;        // grid units thickness of the ring

// Snake orbits - scaled for larger orb
const ORBIT_RADIUS = 200;  // distance from planet center (tighter to orb)
const SNAKE_1_INCLINATION = Math.PI * 0.25;   // ~45 degrees
const SNAKE_2_INCLINATION = -Math.PI * 0.15;  // ~-27 degrees
const SNAKE_1_ORBIT_SPEED = 0.85;   // radians per second (faster to match free-roam pace)
const SNAKE_2_ORBIT_SPEED = 0.95;   // radians per second

// Snake body (longer for more dramatic orbiting)
const SNAKE_1_BODY_LENGTH = 75;
const SNAKE_2_BODY_LENGTH = 65;
const SNAKE_1_THICKNESS = 5;
const SNAKE_2_THICKNESS = 4;


// Character dimensions
const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 8;
// Aspect ratio correction - characters are taller than wide, so we need to compress Y
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;  // 0.625

// Frame timing
const FRAME_TIME = 33;  // ~30fps

// Depth-based character sets
const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

// Pre-computed light direction (normalized)
const LIGHT_X = -0.408;
const LIGHT_Y = -0.572;
const LIGHT_Z = 0.408;

// ============== HELPER FUNCTIONS ==============

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
};

type RippleHue = NonNullable<ImpactEffect['hue']>;
const RIPPLE_HUE_BY_KEY: Record<RippleHue, number> = {
  blue: 200,
  pink: 330,
};

const parseRgba = (value: string): { r: number; g: number; b: number; a: number } | null => {
  const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (!m) return null;
  return {
    r: Math.round(Math.max(0, Math.min(255, Number(m[1])))),
    g: Math.round(Math.max(0, Math.min(255, Number(m[2])))),
    b: Math.round(Math.max(0, Math.min(255, Number(m[3])))),
    a: clamp01(m[4] === undefined ? 1 : Number(m[4])),
  };
};

const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;

  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
};

const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp01(s / 100);
  const ln = clamp01(l / 100);
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((hn / 60) % 2 - 1));
  const m = ln - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hn < 60) [r1, g1, b1] = [c, x, 0];
  else if (hn < 120) [r1, g1, b1] = [x, c, 0];
  else if (hn < 180) [r1, g1, b1] = [0, c, x];
  else if (hn < 240) [r1, g1, b1] = [0, x, c];
  else if (hn < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

const applyHueOverlay = (baseColor: string, targetHue: RippleHue, strength: number): string => {
  const parsed = parseRgba(baseColor);
  if (!parsed) return baseColor;

  const overlayStrength = clamp01(strength * 1.45 + 0.12);
  const { s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);
  const boostedSaturation = Math.min(98, Math.max(68, s + 40 + overlayStrength * 35));
  const boostedLightness = Math.min(78, Math.max(l + 8, 30 + overlayStrength * 26));
  const tintRgb = hslToRgb(RIPPLE_HUE_BY_KEY[targetHue], boostedSaturation, boostedLightness);
  const blend = clamp01(0.35 + overlayStrength * 0.45);
  const r = Math.round(parsed.r + (tintRgb.r - parsed.r) * blend);
  const g = Math.round(parsed.g + (tintRgb.g - parsed.g) * blend);
  const b = Math.round(parsed.b + (tintRgb.b - parsed.b) * blend);
  const a = Math.min(1, parsed.a + overlayStrength * 0.08);

  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
};

// Get ASCII character based on depth and lighting
const getChar = (zDepth: number, intensity: number): string => {
  const idx = Math.max(0, Math.min(4, ((1 - intensity) * 4) | 0));
  if (zDepth < 0.35) return DEPTH_CHARS.far[idx];
  if (zDepth < 0.55) return DEPTH_CHARS.mid[idx];
  if (zDepth < 0.8) return DEPTH_CHARS.close[Math.min(idx, 5)];
  return DEPTH_CHARS.closest[Math.min(idx, 5)];
};

// Generate color LUT for snake themes
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
  blue: generateColorLUT('blue'),
};

const getSnakeColor = (zDepth: number, lighting: number, theme: ColorTheme): string => {
  const zIdx = Math.min(19, Math.max(0, (zDepth * 20) | 0));
  const lIdx = Math.min(9, Math.max(0, (lighting * 10) | 0));
  return colorLUTs[theme][zIdx * 10 + lIdx];
};

// Orb color: interpolate between primary and secondary based on noise intensity
const getOrbColor = (v: number): string => {
  const t = clamp01(v);
  const r = Math.round(ORB_PRIMARY_RGB.r + (ORB_SECONDARY_RGB.r - ORB_PRIMARY_RGB.r) * t);
  const g = Math.round(ORB_PRIMARY_RGB.g + (ORB_SECONDARY_RGB.g - ORB_PRIMARY_RGB.g) * t);
  const b = Math.round(ORB_PRIMARY_RGB.b + (ORB_SECONDARY_RGB.b - ORB_PRIMARY_RGB.b) * t);
  // Higher base alpha for better visibility on white backgrounds
  const alpha = 0.78 + t * 0.22;
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
};

// Noise functions for organic movement
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

// 3D rotation functions
const rotateX = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
};

// Get orbital position for a snake head
const getOrbitalPosition = (
  phase: number,
  radius: number,
  inclination: number,
  centerX: number,
  centerY: number,
): { x: number; y: number; z: number } => {
  // Start with a circle in the XZ plane (horizontal)
  const x = Math.cos(phase) * radius;
  const z = Math.sin(phase) * radius;

  // Rotate around X axis to tilt the orbital plane
  const rotated = rotateX({ x, y: 0, z }, inclination);

  return {
    x: centerX + rotated.x,
    // Apply aspect ratio correction so orbit appears circular
    y: centerY + rotated.y * CHAR_ASPECT_RATIO,
    z: rotated.z,
  };
};

// ============== COMPONENT ==============

interface AsciiPlanetSystemProps {
  scrollProgress: number;  // 0 = orbital mode, >0.3 = free roaming
  activeBeams: ScanBeam[];
  onBeamImpact?: (surfacePoint: Point3D) => void;
  width: number;
  height: number;
  planetXOffset?: number;  // Horizontal offset (0-1, where 0.5 = center). Default positions planet in right area
  planetYOffset?: number;  // Vertical offset (0-1, where 0.5 = center). Default positions planet in upper area
}

type SnakeRuntime = Snake & {
  // A smoothed free-roam follower position so detachment feels like drifting away.
  freePos?: { x: number; y: number; z: number };
};

export const AsciiPlanetSystem: React.FC<AsciiPlanetSystemProps> = ({
  scrollProgress,
  activeBeams,
  onBeamImpact,
  width,
  height,
  planetXOffset = 0.7,  // Default: closer to text, with right-side padding for snake orbits
  planetYOffset = 0.18,  // Default: vertically centered
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state refs
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const isPageVisibleRef = useRef(true);

  // Simplex noise for orb texture
  const noise2DRef = useRef(makeNoise2D(Date.now()));

  // Smooth scroll→orbit influence without restarting RAF loop
  const scrollProgressRef = useRef(scrollProgress);
  useEffect(() => { scrollProgressRef.current = scrollProgress; }, [scrollProgress]);

  // 1 = orbit, 0 = fully free; smoothed over time
  const orbitInfluenceRef = useRef(1);

  // Impact effects
  const impactsRef = useRef<ImpactEffect[]>([]);
  const impactedBeamIdsRef = useRef<Set<string>>(new Set());

  // Snakes
  const snakesRef = useRef<SnakeRuntime[]>([
    {
      id: 'snake-1',
      body: [],
      colorTheme: 'green',
      orbitalInclination: SNAKE_1_INCLINATION,
      orbitalPhase: 0,
      orbitSpeed: SNAKE_1_ORBIT_SPEED,
      orbitDirection: 1,
      bodyLength: SNAKE_1_BODY_LENGTH,
      baseThickness: SNAKE_1_THICKNESS,
      seed: { x: 42 + Math.random() * 50, y: 42 + Math.random() * 50, z: 42 + Math.random() * 50 },
    },
    {
      id: 'snake-2',
      body: [],
      colorTheme: 'pink',
      orbitalInclination: SNAKE_2_INCLINATION,
      orbitalPhase: Math.PI,  // Start on opposite side
      orbitSpeed: SNAKE_2_ORBIT_SPEED,
      orbitDirection: -1,
      bodyLength: SNAKE_2_BODY_LENGTH,
      baseThickness: SNAKE_2_THICKNESS,
      seed: { x: 137 + Math.random() * 50, y: 137 + Math.random() * 50, z: 137 + Math.random() * 50 },
    },
  ]);

  // Grid buffer for ASCII rendering
  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ width: 0, height: 0 });

  // Calculate grid dimensions in characters
  const gridWidth = useMemo(() => Math.max(40, Math.floor(width / CHAR_WIDTH)), [width]);
  const gridHeight = useMemo(() => Math.max(30, Math.floor(height / CHAR_HEIGHT)), [height]);

  // Planet center - positioned based on offsets (right area, upper area)
  const planetCenterX = useMemo(() => Math.floor(gridWidth * planetXOffset), [gridWidth, planetXOffset]);
  const planetCenterY = useMemo(() => Math.floor(gridHeight * planetYOffset), [gridHeight, planetYOffset]);

  // Snakes can roam the full canvas area (kept for reference)
  const centerX = useMemo(() => gridWidth / 2, [gridWidth]);
  const centerY = useMemo(() => gridHeight / 2, [gridHeight]);

  // Get or reset grid buffer
  const getGrid = useCallback((w: number, h: number): GridCell[][] => {
    if (!gridRef.current || gridDimsRef.current.width !== w || gridDimsRef.current.height !== h) {
      const grid: GridCell[][] = [];
      for (let y = 0; y < h; y++) {
        grid[y] = [];
        for (let x = 0; x < w; x++) {
          grid[y][x] = { char: '', color: '', priority: -1e9, source: null };
        }
      }
      gridRef.current = grid;
      gridDimsRef.current = { width: w, height: h };
    } else {
      const grid = gridRef.current;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          grid[y][x].char = '';
          grid[y][x].color = '';
          grid[y][x].priority = -1e9;
          grid[y][x].source = null;
        }
      }
    }
    return gridRef.current;
  }, []);

  // Page visibility handling
  useEffect(() => {
    const handleVisibility = () => {
      isPageVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Detect beam arrivals to spawn impacts (once per beam)
  useEffect(() => {
    const currentIds = new Set(activeBeams.map(b => b.id));

    activeBeams.forEach((beam) => {
      if (beam.headProgress < 0.95) return;

      if (!impactedBeamIdsRef.current.has(beam.id)) {
        impactedBeamIdsRef.current.add(beam.id);

        // Position impact at beam's offset within the orb
        const ox = beam.impactOffset?.x ?? 0;
        const oy = beam.impactOffset?.y ?? 0;
        const impactX = planetCenterX + ox * ORB_RADIUS * 0.7;
        const impactY = planetCenterY + oy * ORB_RADIUS * ORB_Y_ASPECT * 0.7;

        const impact: ImpactEffect = {
          id: `impact-${Date.now()}-${Math.random()}`,
          surfacePoint: { x: impactX, y: impactY, z: PLANET_RADIUS * 0.8 },
          currentRadius: 0,
          alpha: 1,
          impactTime: performance.now(),
          hue: beam.impactHue,
        };
        impactsRef.current.push(impact);
        onBeamImpact?.(impact.surfacePoint);
      }
    });

    // Cleanup impacted ids for beams that are gone
    impactedBeamIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) impactedBeamIdsRef.current.delete(id);
    });
  }, [activeBeams, planetCenterX, planetCenterY, onBeamImpact]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    ctx.font = `bold ${CHAR_HEIGHT - 1}px "SF Mono", Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

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
      timeRef.current += dt;
      const t = timeRef.current;

      // ================= ORBIT → FREE BLEND (SMOOTH) =================
      // Keep your original "0..0.3 detaches" behavior, but smooth it so it glides.
      const DETACH_END = 0.30;

      const p = clamp01(scrollProgressRef.current);
      const freeTarget = smoothstep(0, DETACH_END, p); // 0..1 (eased)
      const orbitTarget = 1 - freeTarget;

      // Exponential smoothing — low value for a graceful ~3 second transition
      const FOLLOW_SPEED = 1.5; // higher = more responsive, lower = floatier
      const follow = 1 - Math.exp(-FOLLOW_SPEED * dt);

      orbitInfluenceRef.current += (orbitTarget - orbitInfluenceRef.current) * follow;
      const orbitInfluence = clamp01(orbitInfluenceRef.current);

      // Additional easing so early detachment feels extremely gentle
      const freeBlend = smoothstep(0, 1, 1 - orbitInfluence);

      // Get grid buffer
      const grid = getGrid(gridWidth, gridHeight);
      const nowMs = performance.now();

      // Clean up expired impacts early so orb rendering can use the filtered list
      impactsRef.current = impactsRef.current.filter((impact) => {
        const elapsed = nowMs - impact.impactTime;
        return elapsed <= SHOCKWAVE_DURATION_S * 1000;
      });

      // ============== RENDER ORB (spherical globe with noise texture) ==============
      const noise2D = noise2DRef.current;

      // Bounding box in grid coordinates
      const orbYExtent = Math.ceil(ORB_RADIUS * ORB_Y_ASPECT);
      const minOrbX = Math.max(0, planetCenterX - ORB_RADIUS);
      const maxOrbX = Math.min(gridWidth - 1, planetCenterX + ORB_RADIUS);
      const minOrbY = Math.max(0, planetCenterY - orbYExtent);
      const maxOrbY = Math.min(gridHeight - 1, planetCenterY + orbYExtent);

      for (let y = minOrbY; y <= maxOrbY; y++) {
        for (let x = minOrbX; x <= maxOrbX; x++) {
          const dx = x - planetCenterX;
          const dy = (y - planetCenterY) / ORB_Y_ASPECT;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const norm = dist / ORB_RADIUS;
          if (norm >= 1) continue;

          // Normalized distance from edge (0 at edge, 1 at center)
          const distNorm = 1 - norm;

          // Density-boosted radial falloff (0.15 floor keeps interior more filled)
          const radial = 0.15 + distNorm * 0.85;

          // Simplex noise sampling with time advection (pattern drifts each frame)
          const n = noise2D(x / ORB_NOISE_SCALE, y / ORB_NOISE_SCALE + t);
          const nNorm = (n + 1) * 0.5; // normalize to 0..1

          const baseV = clamp01(nNorm * radial * 1.4);

          // Apply shockwaves as hue overlays on top of existing orb ASCII.
          let rippleStrength = 0;
          let rippleHue: RippleHue | null = null;
          for (const impact of impactsRef.current) {
            const elapsed = (nowMs - impact.impactTime) / 1000;
            if (elapsed < 0 || elapsed > SHOCKWAVE_DURATION_S) continue;

            const swDx = x - impact.surfacePoint.x;
            const swDy = (y - impact.surfacePoint.y) / ORB_Y_ASPECT;
            const swDist = Math.sqrt(swDx * swDx + swDy * swDy);
            const waveRadius = elapsed * SHOCKWAVE_SPEED;
            const distFromWave = Math.abs(swDist - waveRadius);

            if (distFromWave < SHOCKWAVE_WIDTH && norm < 0.95) {
              const waveFade = 1 - elapsed / SHOCKWAVE_DURATION_S;
              const waveIntensity = (1 - distFromWave / SHOCKWAVE_WIDTH) * waveFade;
              const edgeFade = 1 - Math.pow(norm, 3);
              const ringStrength = Math.min(1, waveIntensity * edgeFade * 1.35);
              if (impact.hue && ringStrength > rippleStrength) {
                rippleStrength = ringStrength;
                rippleHue = impact.hue;
              }
            }
          }

          // Glyph selection stays tied to base orb intensity only.
          const glyphIdx = Math.min(ORB_GLYPHS.length - 1, Math.floor(baseV * (ORB_GLYPHS.length - 1)));
          const glyph = ORB_GLYPHS[glyphIdx];
          if (glyph === ' ') continue; // skip empty cells

          // Color: preserve base orb color and apply a hue-only ripple overlay when needed.
          const baseColor = getOrbColor(baseV);
          const color = rippleHue ? applyHueOverlay(baseColor, rippleHue, rippleStrength) : baseColor;

          // Priority: center is closest to viewer, edges further away
          const priority = distNorm * PLANET_RADIUS;

          if (priority > grid[y][x].priority) {
            grid[y][x].char = glyph;
            grid[y][x].color = color;
            grid[y][x].priority = priority;
            grid[y][x].source = 'planet'; // keep 'planet' for impact tint compatibility
          }
        }
      }

      // ============== UPDATE AND RENDER SNAKES (SMOOTH DETACH) ==============
      snakesRef.current.forEach((snake) => {
        // Update orbital phase
        snake.orbitalPhase += snake.orbitSpeed * snake.orbitDirection * dt;

        // Orbital target (around planet)
        const orbitalPos = getOrbitalPosition(
          snake.orbitalPhase,
          ORBIT_RADIUS / 3, // scale for grid coordinates
          snake.orbitalInclination,
          planetCenterX,
          planetCenterY,
        );

        // Free-roam target (full canvas)
        const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
        const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
        const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

        const nx = clamp01(noiseX * 0.5 + 0.5);
        const ny = clamp01(noiseY * 0.5 + 0.5);
        const nz = clamp01(noiseZ * 0.5 + 0.5);

        const margin = snake.baseThickness * 4;
        const freeXTarget = margin + (gridWidth - margin * 2) * nx;
        const freeYTarget = margin + (gridHeight - margin * 2) * ny;
        const freeZTarget = -PLANET_RADIUS + (2 * PLANET_RADIUS) * nz;

        // Initialize freePos at orbital position so blend starts perfectly smooth
        if (!snake.freePos) {
          snake.freePos = { x: orbitalPos.x, y: orbitalPos.y, z: orbitalPos.z };
        }

        // While fully orbiting, keep freePos glued to orbit (prevents drift from a far noise target)
        // This has NO visible effect because freeBlend ~ 0 here; it just guarantees a clean transition.
        if (orbitInfluence > 0.985) {
          snake.freePos.x = orbitalPos.x;
          snake.freePos.y = orbitalPos.y;
          snake.freePos.z = orbitalPos.z;
        } else {
          // As it detaches, let freePos smoothly chase the noise target.
          // Speed increases with freeBlend, so it "loosens" gradually.
          const freeFollowSpeed = 0.4 + 2.0 * freeBlend; // 0.4..2.4 (gentle ramp)
          const sFree = 1 - Math.exp(-freeFollowSpeed * dt);

          snake.freePos.x += (freeXTarget - snake.freePos.x) * sFree;
          snake.freePos.y += (freeYTarget - snake.freePos.y) * sFree;
          snake.freePos.z += (freeZTarget - snake.freePos.z) * sFree;
        }

        // Final head position: smoothly blend orbital → freePos
        const headX = orbitalPos.x + (snake.freePos.x - orbitalPos.x) * freeBlend;
        const headY = orbitalPos.y + (snake.freePos.y - orbitalPos.y) * freeBlend;
        const headZ = orbitalPos.z + (snake.freePos.z - orbitalPos.z) * freeBlend;

        // Calculate tangent
        let tangentX = 1, tangentY = 0;
        if (snake.body.length > 0) {
          const prev = snake.body[0];
          const dx = headX - prev.x;
          const dy = headY - prev.y;
          const m = Math.sqrt(dx * dx + dy * dy);
          if (m > 0.001) {
            tangentX = dx / m;
            tangentY = dy / m;
          }
        }

        // Add head segment
        snake.body.unshift({ x: headX, y: headY, z: headZ, tangentX, tangentY });
        if (snake.body.length > snake.bodyLength) {
          snake.body.length = snake.bodyLength;
        }

        // Skip rendering if body too short
        if (snake.body.length < 2) return;

        // Sort segments by Z (far to near) for painter's algorithm
        const indices: number[] = [];
        for (let i = 0; i < snake.body.length; i++) indices.push(i);
        indices.sort((a, b) => snake.body[a].z - snake.body[b].z);

        // Render snake segments
        for (const i of indices) {
          const seg = snake.body[i];
          const bodyPos = i / (snake.body.length - 1);
          const taper = 1 - bodyPos * 0.6;

          // Normalize z for color/char selection
          const zNorm = (seg.z + PLANET_RADIUS) / (2 * PLANET_RADIUS);
          const zScale = 0.25 + zNorm * 1.25;
          const thick = snake.baseThickness * taper * zScale;

          const radiusX = thick * (1.6 + zNorm * 0.6);
          const radiusY = thick * (0.8 + zNorm * 0.25);
          const fade = 1 - bodyPos * 0.65;
          const basePri = seg.z;

          const ceilRX = Math.ceil(radiusX);
          const ceilRY = Math.ceil(radiusY);

          const perpX = -seg.tangentY;
          const perpY = seg.tangentX;

          for (let dy = -ceilRY; dy <= ceilRY; dy++) {
            const py = Math.round(seg.y + dy);
            if (py < 0 || py >= gridHeight) continue;
            const ny = dy / radiusY;
            const ny2 = ny * ny;

            for (let dx = -ceilRX; dx <= ceilRX; dx++) {
              const px = Math.round(seg.x + dx);
              if (px < 0 || px >= gridWidth) continue;

              const nx = dx / radiusX;
              const d2 = nx * nx + ny2;
              if (d2 > 1) continue;

              const tubeD = Math.sqrt(1 - d2);
              const mag = Math.sqrt(d2 + tubeD * tubeD);

              // Lighting calculation
              const normalX = (nx * perpX + ny * seg.tangentX) / mag;
              const normalY = (nx * perpY + ny * seg.tangentY) / mag;
              const normalZ = tubeD / mag;
              const light = Math.max(0.15, normalX * LIGHT_X + normalY * LIGHT_Y + normalZ * LIGHT_Z) * fade;

              const pri = basePri + tubeD * 10;
              if (pri > grid[py][px].priority) {
                grid[py][px].char = getChar(zNorm, light);
                grid[py][px].color = getSnakeColor(zNorm, light, snake.colorTheme);
                grid[py][px].priority = pri;
                grid[py][px].source = 'snake';
              }
            }
          }
        }
      });

      // ============== RENDER TO CANVAS ==============
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Base pass: draw all glyphs without shadow to keep colors stable.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const cell = grid[y][x];
          if (cell.char) {
            ctx.fillStyle = cell.color;
            ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
          }
        }
      }

      // Glow pass: snakes get glow so they pop against the orb.
      ctx.shadowColor = 'rgba(100, 180, 255, 0.10)';
      ctx.shadowBlur = 2;
      ctx.globalAlpha = 0.35;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const cell = grid[y][x];
          if (!cell.char || cell.source === 'planet') continue;
          ctx.fillStyle = cell.color;
          ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
        }
      }

      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);

    // IMPORTANT: scrollProgress is intentionally NOT in deps to prevent RAF teardown/restart.
  }, [width, height, gridWidth, gridHeight, centerX, centerY, planetCenterX, planetCenterY, getGrid, onBeamImpact]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        pointerEvents: 'none',
        display: 'block',
        imageRendering: 'pixelated',
      }}
    />
  );
};

export default AsciiPlanetSystem;
