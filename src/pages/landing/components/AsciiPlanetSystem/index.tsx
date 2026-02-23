// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// Noise-based animated ASCII orb with one orbiting snake that detaches on scroll.
// Auto-morphs through random shapes continuously.
//
// PERFORMANCE: all per-pixel color math uses numeric RGBA (cr/cg/cb/ca).
// String colors are only produced at canvas-render time, eliminating thousands
// of string allocations + regex parses per frame.

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { makeNoise2D } from 'open-simplex-noise';
import { Point3D } from '../../../../types';
import {
  Snake,
  ImpactEffect,
  GridCell,
  COLOR_THEMES,
  ColorTheme,
} from './types';

// ============== CONSTANTS ==============

const PLANET_RADIUS = 90;
const ORB_RADIUS = 55;
const ORB_NOISE_SCALE = 35;
const ORB_GLYPHS = ' .:-=+*#%@';
const ORB_Y_ASPECT = 0.625;

const ORB_PRIMARY_R = 0, ORB_PRIMARY_G = 0, ORB_PRIMARY_B = 0;
const ORB_SECONDARY_R = 50, ORB_SECONDARY_G = 50, ORB_SECONDARY_B = 50;

const MORPH_IN_MS = 700;
const THINK_HOLD_MS = 2600;
const MORPH_OUT_MS = 700;

const SHOCKWAVE_DURATION_S = 0.55;
const SHOCKWAVE_SPEED = 18;
const SHOCKWAVE_WIDTH = 1.4;
const SHOCKWAVE_INV_WIDTH = 1 / SHOCKWAVE_WIDTH;
const SHOCKWAVE_INV_DURATION = 1 / SHOCKWAVE_DURATION_S;

const ORBIT_RADIUS = 200;
const SNAKE_INCLINATION = -Math.PI * 0.15;
const SNAKE_ORBIT_SPEED = 0.95;
const SNAKE_ORBIT_DIRECTION: 1 | -1 = -1;

const SNAKE_BODY_LENGTH = 65;
const SNAKE_THICKNESS = 4;

const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 8;
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;

const FRAME_TIME = 33;

const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

const LIGHT_X = -0.408;
const LIGHT_Y = -0.572;
const LIGHT_Z = 0.408;

const AUTO_MORPH_MIN_DELAY_MS = 2500;
const AUTO_MORPH_MAX_DELAY_MS = 5500;

const ORB_GLYPH_COUNT = ORB_GLYPHS.length;

// ============== PRE-COMPUTED LOOKUP TABLES ==============

// Orb color LUT: 256 entries mapping intensity [0..1] → {r,g,b,a}
const ORB_COLOR_LUT_R = new Uint8Array(256);
const ORB_COLOR_LUT_G = new Uint8Array(256);
const ORB_COLOR_LUT_B = new Uint8Array(256);
const ORB_COLOR_LUT_A = new Float32Array(256);

for (let i = 0; i < 256; i++) {
  const t = i / 255;
  ORB_COLOR_LUT_R[i] = Math.round(ORB_PRIMARY_R + (ORB_SECONDARY_R - ORB_PRIMARY_R) * t);
  ORB_COLOR_LUT_G[i] = Math.round(ORB_PRIMARY_G + (ORB_SECONDARY_G - ORB_PRIMARY_G) * t);
  ORB_COLOR_LUT_B[i] = Math.round(ORB_PRIMARY_B + (ORB_SECONDARY_B - ORB_PRIMARY_B) * t);
  ORB_COLOR_LUT_A[i] = 0.78 + t * 0.22;
}

// Thinking-wave hue LUT: for each wave value [0..255] → pre-computed tint {r,g,b}
// Hue sweeps 200..335 degrees
const THINK_TINT_R = new Uint8Array(256);
const THINK_TINT_G = new Uint8Array(256);
const THINK_TINT_B = new Uint8Array(256);

const hslToRgbFast = (h: number, s: number, l: number): [number, number, number] => {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(1, s / 100));
  const ln = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs((hn / 60) % 2 - 1));
  const m = ln - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (hn < 60) { r1 = c; g1 = x; }
  else if (hn < 120) { r1 = x; g1 = c; }
  else if (hn < 180) { g1 = c; b1 = x; }
  else if (hn < 240) { g1 = x; b1 = c; }
  else if (hn < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
};

// Pre-compute thinking wave tint colors across the hue range
for (let i = 0; i < 256; i++) {
  const wave = i / 255;
  const hue = 200 + 135 * wave;
  // Use high saturation and moderate lightness matching the overlay logic
  const [r, g, b] = hslToRgbFast(hue, 88, 56);
  THINK_TINT_R[i] = r;
  THINK_TINT_G[i] = g;
  THINK_TINT_B[i] = b;
}

// Shockwave ripple hue tint (pre-computed for blue and pink)
const RIPPLE_TINT: Record<string, [number, number, number]> = {
  blue: hslToRgbFast(200, 88, 56),
  pink: hslToRgbFast(330, 88, 56),
};

// ============== HELPER FUNCTIONS ==============

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
};

type RippleHue = NonNullable<ImpactEffect['hue']>;

const getChar = (zDepth: number, intensity: number): string => {
  const idx = Math.max(0, Math.min(4, ((1 - intensity) * 4) | 0));
  if (zDepth < 0.35) return DEPTH_CHARS.far[idx];
  if (zDepth < 0.55) return DEPTH_CHARS.mid[idx];
  if (zDepth < 0.8) return DEPTH_CHARS.close[Math.min(idx, 5)];
  return DEPTH_CHARS.closest[Math.min(idx, 5)];
};

// Snake color LUT (pre-generate as before but with numeric RGBA)
type SnakeLUTEntry = { r: number; g: number; b: number; a: number };

const generateNumericColorLUT = (theme: ColorTheme): SnakeLUTEntry[] => {
  const lut: SnakeLUTEntry[] = [];
  const { hueStart, hueEnd } = COLOR_THEMES[theme];
  for (let z = 0; z < 20; z++) {
    for (let l = 0; l < 10; l++) {
      const normalizedZ = z / 20;
      const hue = hueStart - normalizedZ * (hueStart - hueEnd);
      const saturation = 40 + normalizedZ * 50;
      const lightness = 45 + l * 4;
      const alpha = 0.5 + normalizedZ * 0.4;
      const [r, g, b] = hslToRgbFast(hue, saturation, lightness);
      lut.push({ r, g, b, a: alpha });
    }
  }
  return lut;
};

const snakeColorLUTs: Record<ColorTheme, SnakeLUTEntry[]> = {
  green: generateNumericColorLUT('green'),
  pink: generateNumericColorLUT('pink'),
  blue: generateNumericColorLUT('blue'),
};

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

const rotateX = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
};

const getOrbitalPosition = (
  phase: number,
  radius: number,
  inclination: number,
  centerX: number,
  centerY: number,
): { x: number; y: number; z: number } => {
  const x = Math.cos(phase) * radius;
  const z = Math.sin(phase) * radius;
  const rotated = rotateX({ x, y: 0, z }, inclination);
  return {
    x: centerX + rotated.x,
    y: centerY + rotated.y * CHAR_ASPECT_RATIO,
    z: rotated.z,
  };
};

// ============== BRAIN EVENT TYPES ==============

export type BrainEventHue = 'blue' | 'pink';

export interface BrainEvent {
  id: string;
  question: string;
  hue?: BrainEventHue;
}

// ============== MORPH SHAPES ==============

type OrbShapeStyle = 'spiky' | 'branchy' | 'splatter' | 'ring' | 'blob';
type OrbSatellite = { x: number; y: number; r: number };

type OrbShapeParams = {
  style: OrbShapeStyle;
  seed: number;
  wobble: number;
  spikeCount?: number;
  spikeAmplitude?: number;
  spikeSharpness?: number;
  spikePhase?: number;
  bumpAngles?: number[];
  bumpAmplitudes?: number[];
  bumpWidths?: number[];
  ringInnerFactor?: number;
  ringWaveAmp?: number;
  ringWaveFreq?: number;
  blobLobeCount?: number;
  blobAmplitude?: number;
  blobPhase?: number;
  satellites?: OrbSatellite[];
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

const wrapAngle = (a: number) => {
  const twoPi = Math.PI * 2;
  let x = a % twoPi;
  if (x < -Math.PI) x += twoPi;
  if (x > Math.PI) x -= twoPi;
  return x;
};

const angleDist = (a: number, b: number) => Math.abs(wrapAngle(a - b));

const gaussian = (d: number, width: number) => {
  const w = Math.max(1e-3, width);
  const t = d / w;
  return Math.exp(-0.5 * t * t);
};

const makeShapeParams = (): OrbShapeParams => {
  const styles: OrbShapeStyle[] = ['spiky', 'branchy', 'splatter', 'ring', 'blob'];
  const style = styles[randInt(0, styles.length - 1)];
  const seed = Math.random() * 1000;
  const wobble = rand(0.03, 0.085);

  if (style === 'spiky') {
    return { style, seed, wobble, spikeCount: randInt(18, 34), spikeAmplitude: rand(0.40, 0.78), spikeSharpness: rand(2.2, 4.8), spikePhase: rand(0, Math.PI * 2) };
  }
  if (style === 'ring') {
    return { style, seed, wobble, ringInnerFactor: rand(0.55, 0.72), ringWaveAmp: rand(0.08, 0.17), ringWaveFreq: rand(3.4, 6.7) };
  }
  if (style === 'blob') {
    return { style, seed, wobble, blobLobeCount: randInt(3, 5), blobAmplitude: rand(0.22, 0.42), blobPhase: rand(0, Math.PI * 2) };
  }
  if (style === 'branchy') {
    const main = randInt(6, 9);
    const bumpAngles: number[] = [];
    const bumpAmplitudes: number[] = [];
    const bumpWidths: number[] = [];
    for (let i = 0; i < main; i++) {
      const a = rand(-Math.PI, Math.PI);
      const amp = rand(0.35, 0.70);
      const w = rand(0.20, 0.38);
      bumpAngles.push(a); bumpAmplitudes.push(amp); bumpWidths.push(w);
      const branches = randInt(1, 3);
      for (let b = 0; b < branches; b++) {
        bumpAngles.push(a + rand(-0.28, 0.28));
        bumpAmplitudes.push(amp * rand(0.28, 0.55));
        bumpWidths.push(w * rand(0.45, 0.70));
      }
    }
    return { style, seed, wobble, bumpAngles, bumpAmplitudes, bumpWidths };
  }
  // splatter
  const lobes = randInt(4, 7);
  const bumpAngles: number[] = [];
  const bumpAmplitudes: number[] = [];
  const bumpWidths: number[] = [];
  for (let i = 0; i < lobes; i++) {
    bumpAngles.push(rand(-Math.PI, Math.PI));
    bumpAmplitudes.push(rand(0.25, 0.55));
    bumpWidths.push(rand(0.30, 0.56));
  }
  const sats: OrbSatellite[] = [];
  const satCount = randInt(8, 14);
  for (let i = 0; i < satCount; i++) {
    const a = rand(-Math.PI, Math.PI);
    const dist = rand(1.15, 1.75) * ORB_RADIUS;
    sats.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist * ORB_Y_ASPECT, r: rand(2.6, 6.8) });
  }
  return { style: 'splatter', seed, wobble, bumpAngles, bumpAmplitudes, bumpWidths, satellites: sats };
};

const shapeRadiusScale = (
  params: OrbShapeParams,
  angle: number,
  t: number,
  noise2D: (x: number, y: number) => number,
): number => {
  const wobbleBase = params.wobble * Math.sin(angle * 2.0 + t * 1.25 + params.seed);
  const wobbleNoise = params.wobble * 0.85 * noise2D(Math.cos(angle) * 1.4 + params.seed, Math.sin(angle) * 1.4 + t * 0.65);
  let scale = 1 + wobbleBase + wobbleNoise;

  switch (params.style) {
    case 'spiky': {
      const n = params.spikeCount ?? 24;
      const amp = params.spikeAmplitude ?? 0.55;
      const sharp = params.spikeSharpness ?? 3.2;
      const phase = params.spikePhase ?? 0;
      const raw = Math.cos(n * angle + phase + t * 0.55);
      const spike = Math.pow(Math.max(0, raw), sharp);
      const fine = 0.32 * Math.pow(Math.max(0, Math.cos((n * 0.5) * angle + phase * 0.7 - t * 0.35)), sharp * 0.85);
      scale += amp * (spike + fine);
      break;
    }
    case 'branchy':
    case 'splatter': {
      const angles = params.bumpAngles ?? [];
      const amps = params.bumpAmplitudes ?? [];
      const widths = params.bumpWidths ?? [];
      let bumpSum = 0;
      for (let i = 0; i < angles.length; i++) {
        const d = angleDist(angle, angles[i]);
        bumpSum += (amps[i] ?? 0.3) * gaussian(d, widths[i] ?? 0.35) * (0.86 + 0.14 * Math.sin(t * 1.1 + i * 2.2 + params.seed));
      }
      const baseBoost = params.style === 'splatter' ? 0.18 : 0.10;
      scale += baseBoost + bumpSum * (params.style === 'splatter' ? 0.85 : 0.75);
      break;
    }
    case 'ring': {
      scale += 0.18 + (params.ringWaveAmp ?? 0.12) * Math.sin((params.ringWaveFreq ?? 5.0) * angle + t * 1.6 + params.seed);
      break;
    }
    case 'blob': {
      const lobes = params.blobLobeCount ?? 4;
      const amp = params.blobAmplitude ?? 0.30;
      const phase = params.blobPhase ?? 0;
      scale += 0.16 + amp * Math.sin(lobes * angle + phase + t * 0.75) + 0.10 * Math.sin(t * 0.6 + params.seed);
      break;
    }
  }
  return scale > 0.62 ? scale : 0.62;
};

// ============== COMPONENT ==============

interface AsciiPlanetSystemProps {
  scrollProgress: number;
  brainEvent?: BrainEvent | null;
  width: number;
  height: number;
  planetXOffset?: number;
  planetYOffset?: number;
  planetYPixelOffset?: number;
}

type SnakeRuntime = Snake & {
  freePos?: { x: number; y: number; z: number };
};

type BrainMorphState = {
  eventId: string | null;
  startTimeMs: number;
  hue: RippleHue;
  shape: OrbShapeParams | null;
};

// Reusable rgba string builder (avoids template literal alloc in tight loop)
// We build strings in the render pass only.
const rgbaStr = (r: number, g: number, b: number, a: number): string =>
  `rgba(${r},${g},${b},${a < 1 ? (a * 1000 + 0.5 | 0) / 1000 : 1})`;

export const AsciiPlanetSystem: React.FC<AsciiPlanetSystemProps> = ({
  scrollProgress,
  brainEvent,
  width,
  height,
  planetXOffset = 0.7,
  planetYOffset = 0.18,
  planetYPixelOffset = 0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const isPageVisibleRef = useRef(true);

  const noise2DRef = useRef(makeNoise2D(Date.now()));

  const scrollProgressRef = useRef(scrollProgress);
  useEffect(() => { scrollProgressRef.current = scrollProgress; }, [scrollProgress]);

  const orbitInfluenceRef = useRef(1);
  const impactsRef = useRef<ImpactEffect[]>([]);

  const brainMorphRef = useRef<BrainMorphState>({
    eventId: null, startTimeMs: 0, hue: 'blue', shape: null,
  });
  const processedBrainIdsRef = useRef<Set<string>>(new Set());

  const nextAutoMorphRef = useRef<number>(
    performance.now() + AUTO_MORPH_MIN_DELAY_MS + Math.random() * (AUTO_MORPH_MAX_DELAY_MS - AUTO_MORPH_MIN_DELAY_MS),
  );

  const snakesRef = useRef<SnakeRuntime[]>([{
    id: 'snake-blue',
    body: [],
    colorTheme: 'blue',
    orbitalInclination: SNAKE_INCLINATION,
    orbitalPhase: Math.PI,
    orbitSpeed: SNAKE_ORBIT_SPEED,
    orbitDirection: SNAKE_ORBIT_DIRECTION,
    bodyLength: SNAKE_BODY_LENGTH,
    baseThickness: SNAKE_THICKNESS,
    seed: { x: 137 + Math.random() * 50, y: 137 + Math.random() * 50, z: 137 + Math.random() * 50 },
  }]);

  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ width: 0, height: 0 });

  // Track snake cells for glow pass (avoids second full-grid scan)
  const snakeCellsRef = useRef<{ x: number; y: number }[]>([]);

  const gridWidth = useMemo(() => Math.max(40, Math.floor(width / CHAR_WIDTH)), [width]);
  const gridHeight = useMemo(() => Math.max(30, Math.floor(height / CHAR_HEIGHT)), [height]);

  const planetCenterX = useMemo(() => Math.floor(gridWidth * planetXOffset), [gridWidth, planetXOffset]);
  const planetCenterY = useMemo(
    () => Math.floor(gridHeight * planetYOffset + planetYPixelOffset / CHAR_HEIGHT),
    [gridHeight, planetYOffset, planetYPixelOffset],
  );

  const getGrid = useCallback((w: number, h: number): GridCell[][] => {
    if (!gridRef.current || gridDimsRef.current.width !== w || gridDimsRef.current.height !== h) {
      const grid: GridCell[][] = [];
      for (let y = 0; y < h; y++) {
        grid[y] = [];
        for (let x = 0; x < w; x++) {
          grid[y][x] = { char: '', color: '', priority: -1e9, source: null, cr: 0, cg: 0, cb: 0, ca: 0 };
        }
      }
      gridRef.current = grid;
      gridDimsRef.current = { width: w, height: h };
    } else {
      const grid = gridRef.current;
      for (let y = 0; y < h; y++) {
        const row = grid[y];
        for (let x = 0; x < w; x++) {
          const c = row[x];
          c.char = '';
          c.priority = -1e9;
          c.source = null;
        }
      }
    }
    return gridRef.current;
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      isPageVisibleRef.current = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Brain event → start morph + spawn an impact shockwave
  useEffect(() => {
    if (!brainEvent) return;
    if (processedBrainIdsRef.current.has(brainEvent.id)) return;

    processedBrainIdsRef.current.add(brainEvent.id);
    if (processedBrainIdsRef.current.size > 60) {
      processedBrainIdsRef.current = new Set(Array.from(processedBrainIdsRef.current).slice(-30));
    }

    const nowMs = performance.now();
    const shape = makeShapeParams();
    const hue: RippleHue = brainEvent.hue === 'pink' ? 'pink' : 'blue';

    brainMorphRef.current = { eventId: brainEvent.id, startTimeMs: nowMs, hue, shape };

    const impactAngle = Math.random() * Math.PI * 2;
    const impactR = Math.sqrt(Math.random()) * 0.55;
    impactsRef.current.push({
      id: `impact-${Date.now()}-${Math.random()}`,
      surfacePoint: {
        x: planetCenterX + Math.cos(impactAngle) * impactR * ORB_RADIUS,
        y: planetCenterY + Math.sin(impactAngle) * impactR * ORB_RADIUS * ORB_Y_ASPECT,
        z: PLANET_RADIUS * 0.8,
      },
      currentRadius: 0, alpha: 1, impactTime: nowMs, hue,
    });
  }, [brainEvent, planetCenterX, planetCenterY]);

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
      if (!isPageVisibleRef.current || now - lastFrameRef.current < FRAME_TIME) {
        animId = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now;

      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      // Orbit → free blend
      const DETACH_END = 0.30;
      const p = clamp01(scrollProgressRef.current);
      const freeTarget = smoothstep(0, DETACH_END, p);
      const orbitTarget = 1 - freeTarget;
      const follow = 1 - Math.exp(-1.5 * dt);
      orbitInfluenceRef.current += (orbitTarget - orbitInfluenceRef.current) * follow;
      const orbitInfluence = clamp01(orbitInfluenceRef.current);
      const freeBlend = smoothstep(0, 1, 1 - orbitInfluence);

      // ===== Brain morph timeline =====
      const brain = brainMorphRef.current;
      const elapsedMs = brain.eventId ? (now - brain.startTimeMs) : 0;

      let morphMix = 0;
      let thinkingStrength = 0;
      let activeShape: OrbShapeParams | null = null;
      let activeHue: RippleHue = 'blue';

      if (brain.eventId && brain.shape) {
        activeShape = brain.shape;
        activeHue = brain.hue;

        if (elapsedMs < MORPH_IN_MS) {
          const k = smoothstep(0, 1, elapsedMs / MORPH_IN_MS);
          morphMix = k;
          thinkingStrength = k;
        } else if (elapsedMs < MORPH_IN_MS + THINK_HOLD_MS) {
          morphMix = 1;
          thinkingStrength = 1;
        } else if (elapsedMs < MORPH_IN_MS + THINK_HOLD_MS + MORPH_OUT_MS) {
          const k = smoothstep(0, 1, (elapsedMs - MORPH_IN_MS - THINK_HOLD_MS) / MORPH_OUT_MS);
          morphMix = 1 - k;
          thinkingStrength = morphMix;
        } else {
          brainMorphRef.current.eventId = null;
          brainMorphRef.current.shape = null;
          activeShape = null;
          nextAutoMorphRef.current = now + AUTO_MORPH_MIN_DELAY_MS + Math.random() * (AUTO_MORPH_MAX_DELAY_MS - AUTO_MORPH_MIN_DELAY_MS);
        }
      }

      // Auto-morph
      if (!brain.eventId && now >= nextAutoMorphRef.current) {
        const id = `auto-${now}-${Math.random()}`;
        const shape = makeShapeParams();
        const hues: RippleHue[] = ['blue', 'pink'];
        const hue = hues[Math.floor(Math.random() * hues.length)];

        brainMorphRef.current = { eventId: id, startTimeMs: now, hue, shape };

        const impactAngle = Math.random() * Math.PI * 2;
        const impactR = Math.sqrt(Math.random()) * 0.55;
        impactsRef.current.push({
          id: `impact-${now}-${Math.random()}`,
          surfacePoint: {
            x: planetCenterX + Math.cos(impactAngle) * impactR * ORB_RADIUS,
            y: planetCenterY + Math.sin(impactAngle) * impactR * ORB_RADIUS * ORB_Y_ASPECT,
            z: PLANET_RADIUS * 0.8,
          },
          currentRadius: 0, alpha: 1, impactTime: now, hue,
        });
      }

      // Get grid buffer
      const grid = getGrid(gridWidth, gridHeight);
      const nowMs = now; // reuse RAF timestamp instead of extra performance.now()

      // Reset snake cell tracker
      const snakeCells = snakeCellsRef.current;
      snakeCells.length = 0;

      // Clean up expired impacts
      const impacts = impactsRef.current;
      let impactWriteIdx = 0;
      for (let i = 0; i < impacts.length; i++) {
        if ((nowMs - impacts[i].impactTime) <= SHOCKWAVE_DURATION_S * 1000) {
          impacts[impactWriteIdx++] = impacts[i];
        }
      }
      impacts.length = impactWriteIdx;
      const impactCount = impacts.length;

      // ============== RENDER ORB ==============
      const noise2D = noise2DRef.current;
      const INV_ORB_NOISE_SCALE = 1 / ORB_NOISE_SCALE;

      const ORB_RENDER_RADIUS = ORB_RADIUS * 1.75;
      const orbYExtent = Math.ceil(ORB_RENDER_RADIUS * ORB_Y_ASPECT);
      const INV_ORB_Y_ASPECT = 1 / ORB_Y_ASPECT;

      const minOrbX = Math.max(0, Math.floor(planetCenterX - ORB_RENDER_RADIUS));
      const maxOrbX = Math.min(gridWidth - 1, Math.ceil(planetCenterX + ORB_RENDER_RADIUS));
      const minOrbY = Math.max(0, Math.floor(planetCenterY - orbYExtent));
      const maxOrbY = Math.min(gridHeight - 1, Math.ceil(planetCenterY + orbYExtent));

      const isMorphing = activeShape !== null;
      const hasThinking = thinkingStrength > 0.01;
      const thinkPinkOffset = activeHue === 'pink' ? 1.2 : 0;
      const isRing = isMorphing && activeShape!.style === 'ring' && morphMix > 0.001;
      const ringInnerFactor = isRing ? (activeShape!.ringInnerFactor ?? 0.62) : 0;

      for (let y = minOrbY; y <= maxOrbY; y++) {
        const gridRow = grid[y];
        const dy_raw = y - planetCenterY;
        const dy = dy_raw * INV_ORB_Y_ASPECT;
        const dy2 = dy * dy;

        for (let x = minOrbX; x <= maxOrbX; x++) {
          const dx = x - planetCenterX;
          const dist = Math.sqrt(dx * dx + dy2);

          let effectiveRadius: number;
          if (isMorphing) {
            const angle = Math.atan2(dy, dx);
            const targetScale = shapeRadiusScale(activeShape!, angle, t, noise2D);
            effectiveRadius = ORB_RADIUS + (ORB_RADIUS * targetScale - ORB_RADIUS) * morphMix;
          } else {
            effectiveRadius = ORB_RADIUS;
          }

          // Ring hole
          if (isRing) {
            const innerR = effectiveRadius * ringInnerFactor * morphMix;
            if (dist < innerR) continue;
          }

          const norm = dist / (effectiveRadius > 0.001 ? effectiveRadius : 0.001);
          if (norm >= 1) continue;

          const distNorm = 1 - norm;
          const radial = 0.15 + distNorm * 0.85;

          const n = noise2D(x * INV_ORB_NOISE_SCALE, y * INV_ORB_NOISE_SCALE + t);
          const nNorm = (n + 1) * 0.5;
          const baseV = nNorm * radial * 1.4;
          const clampedV = baseV > 1 ? 1 : baseV < 0 ? 0 : baseV;

          const glyphIdx = Math.min(ORB_GLYPH_COUNT - 1, (clampedV * (ORB_GLYPH_COUNT - 1)) | 0);
          if (glyphIdx === 0) continue; // space glyph

          // Numeric orb color from LUT
          const lutIdx = (clampedV * 255 + 0.5) | 0;
          let cr = ORB_COLOR_LUT_R[lutIdx];
          let cg = ORB_COLOR_LUT_G[lutIdx];
          let cb = ORB_COLOR_LUT_B[lutIdx];
          let ca = ORB_COLOR_LUT_A[lutIdx];

          // Shockwave ripple overlay (numeric)
          if (impactCount > 0) {
            let bestRipple = 0;
            let bestHue: RippleHue | null = null;
            for (let ii = 0; ii < impactCount; ii++) {
              const impact = impacts[ii];
              const elapsed = (nowMs - impact.impactTime) * 0.001;
              if (elapsed < 0 || elapsed > SHOCKWAVE_DURATION_S) continue;

              const swDx = x - impact.surfacePoint.x;
              const swDy = (y - impact.surfacePoint.y) * INV_ORB_Y_ASPECT;
              const swDist = Math.sqrt(swDx * swDx + swDy * swDy);
              const distFromWave = Math.abs(swDist - elapsed * SHOCKWAVE_SPEED);

              if (distFromWave < SHOCKWAVE_WIDTH && norm < 0.95) {
                const waveFade = 1 - elapsed * SHOCKWAVE_INV_DURATION;
                const waveIntensity = (1 - distFromWave * SHOCKWAVE_INV_WIDTH) * waveFade;
                const edgeFade = 1 - norm * norm * norm;
                const ringStrength = waveIntensity * edgeFade * 1.35;
                const rs = ringStrength > 1 ? 1 : ringStrength;
                if (impact.hue && rs > bestRipple) {
                  bestRipple = rs;
                  bestHue = impact.hue;
                }
              }
            }
            if (bestHue) {
              const tint = RIPPLE_TINT[bestHue];
              const blend = clamp01(0.35 + (bestRipple * 1.45 + 0.12) * 0.45);
              cr = (cr + (tint[0] - cr) * blend + 0.5) | 0;
              cg = (cg + (tint[1] - cg) * blend + 0.5) | 0;
              cb = (cb + (tint[2] - cb) * blend + 0.5) | 0;
              ca = Math.min(1, ca + bestRipple * 0.08);
            }
          }

          // Thinking wave overlay (numeric with LUT)
          if (hasThinking) {
            const wave = 0.5 + 0.5 * Math.sin(t * 5.5 + x * 0.14 + y * 0.11 + thinkPinkOffset);
            const strength = thinkingStrength * (0.18 + 0.82 * wave);
            const blend = clamp01(0.18 + strength * 0.55);
            const waveIdx = (wave * 255 + 0.5) | 0;
            cr = (cr + (THINK_TINT_R[waveIdx] - cr) * blend + 0.5) | 0;
            cg = (cg + (THINK_TINT_G[waveIdx] - cg) * blend + 0.5) | 0;
            cb = (cb + (THINK_TINT_B[waveIdx] - cb) * blend + 0.5) | 0;
            ca = Math.min(1, ca + strength * 0.12);
          }

          const priority = distNorm * PLANET_RADIUS;
          const cell = gridRow[x];
          if (priority > cell.priority) {
            cell.char = ORB_GLYPHS[glyphIdx];
            cell.cr = cr; cell.cg = cg; cell.cb = cb; cell.ca = ca;
            cell.priority = priority;
            cell.source = 'planet';
          }
        }
      }

      // ============== SPLATTER SATELLITES ==============
      if (activeShape?.style === 'splatter' && activeShape.satellites && morphMix > 0.05) {
        const satMix = smoothstep(0.10, 1.0, morphMix);
        const seedOffset = activeShape.seed * 2;

        for (const sat of activeShape.satellites) {
          const r = sat.r * satMix;
          if (r < 0.8) continue;

          const cx = planetCenterX + sat.x;
          const cy = planetCenterY + sat.y;
          const invR = 1 / (r > 0.001 ? r : 0.001);

          const yExt = Math.ceil(r * ORB_Y_ASPECT);
          const sMinX = Math.max(0, Math.floor(cx - r - 2));
          const sMaxX = Math.min(gridWidth - 1, Math.ceil(cx + r + 2));
          const sMinY = Math.max(0, Math.floor(cy - yExt - 2));
          const sMaxY = Math.min(gridHeight - 1, Math.ceil(cy + yExt + 2));

          for (let y = sMinY; y <= sMaxY; y++) {
            const gridRow = grid[y];
            for (let x = sMinX; x <= sMaxX; x++) {
              const dx = x - cx;
              const dy = (y - cy) * INV_ORB_Y_ASPECT;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const norm = dist * invR;
              if (norm >= 1) continue;

              const distNorm = 1 - norm;
              const radial = 0.18 + distNorm * 0.82;
              const n = noise2D((x + seedOffset) * INV_ORB_NOISE_SCALE, (y + seedOffset) * INV_ORB_NOISE_SCALE + t);
              const baseV = clamp01((n + 1) * 0.5 * radial * 1.25);

              const glyphIdx = Math.min(ORB_GLYPH_COUNT - 1, (baseV * (ORB_GLYPH_COUNT - 1)) | 0);
              if (glyphIdx === 0) continue;

              const lutIdx = (baseV * 255 + 0.5) | 0;
              let cr = ORB_COLOR_LUT_R[lutIdx];
              let cg = ORB_COLOR_LUT_G[lutIdx];
              let cb = ORB_COLOR_LUT_B[lutIdx];
              let ca = ORB_COLOR_LUT_A[lutIdx];

              if (hasThinking) {
                const wave = 0.5 + 0.5 * Math.sin(t * 5.5 + x * 0.14 + y * 0.11);
                const strength = thinkingStrength * (0.10 + 0.70 * wave);
                const blend = clamp01(0.18 + strength * 0.55);
                const waveIdx = (wave * 255 + 0.5) | 0;
                cr = (cr + (THINK_TINT_R[waveIdx] - cr) * blend + 0.5) | 0;
                cg = (cg + (THINK_TINT_G[waveIdx] - cg) * blend + 0.5) | 0;
                cb = (cb + (THINK_TINT_B[waveIdx] - cb) * blend + 0.5) | 0;
                ca = Math.min(1, ca + strength * 0.12);
              }

              const priority = distNorm * PLANET_RADIUS * 0.62;
              const cell = gridRow[x];
              if (priority > cell.priority) {
                cell.char = ORB_GLYPHS[glyphIdx];
                cell.cr = cr; cell.cg = cg; cell.cb = cb; cell.ca = ca;
                cell.priority = priority;
                cell.source = 'planet';
              }
            }
          }
        }
      }

      // ============== SNAKE ==============
      const snakes = snakesRef.current;
      for (let si = 0; si < snakes.length; si++) {
        const snake = snakes[si];
        snake.orbitalPhase += snake.orbitSpeed * snake.orbitDirection * dt;

        const orbitalPos = getOrbitalPosition(
          snake.orbitalPhase, ORBIT_RADIUS / 3,
          snake.orbitalInclination, planetCenterX, planetCenterY,
        );

        const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
        const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
        const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

        const margin = snake.baseThickness * 4;
        const freeXTarget = margin + (gridWidth - margin * 2) * clamp01(noiseX * 0.5 + 0.5);
        const freeYTarget = margin + (gridHeight - margin * 2) * clamp01(noiseY * 0.5 + 0.5);
        const freeZTarget = -PLANET_RADIUS + (2 * PLANET_RADIUS) * clamp01(noiseZ * 0.5 + 0.5);

        if (!snake.freePos) {
          snake.freePos = { x: orbitalPos.x, y: orbitalPos.y, z: orbitalPos.z };
        }

        if (orbitInfluence > 0.985) {
          snake.freePos.x = orbitalPos.x;
          snake.freePos.y = orbitalPos.y;
          snake.freePos.z = orbitalPos.z;
        } else {
          const sFree = 1 - Math.exp(-(0.4 + 2.0 * freeBlend) * dt);
          snake.freePos.x += (freeXTarget - snake.freePos.x) * sFree;
          snake.freePos.y += (freeYTarget - snake.freePos.y) * sFree;
          snake.freePos.z += (freeZTarget - snake.freePos.z) * sFree;
        }

        const headX = orbitalPos.x + (snake.freePos.x - orbitalPos.x) * freeBlend;
        const headY = orbitalPos.y + (snake.freePos.y - orbitalPos.y) * freeBlend;
        const headZ = orbitalPos.z + (snake.freePos.z - orbitalPos.z) * freeBlend;

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
        if (snake.body.length < 2) continue;

        // Sort segments by Z (reuse array)
        const body = snake.body;
        const bodyLen = body.length;
        const indices: number[] = [];
        for (let i = 0; i < bodyLen; i++) indices.push(i);
        indices.sort((a, b) => body[a].z - body[b].z);

        const invBodyLen = 1 / (bodyLen - 1);
        const invTwoPR = 1 / (2 * PLANET_RADIUS);
        const lut = snakeColorLUTs[snake.colorTheme];

        for (let ii = 0; ii < indices.length; ii++) {
          const i = indices[ii];
          const seg = body[i];
          const bodyPos = i * invBodyLen;
          const taper = 1 - bodyPos * 0.6;

          const zNorm = (seg.z + PLANET_RADIUS) * invTwoPR;
          const zScale = 0.25 + zNorm * 1.25;
          const thick = snake.baseThickness * taper * zScale;

          const radiusX = thick * (1.6 + zNorm * 0.6);
          const radiusY = thick * (0.8 + zNorm * 0.25);
          if (radiusX < 0.5 || radiusY < 0.5) continue;

          const fade = 1 - bodyPos * 0.65;
          const basePri = seg.z;

          const ceilRX = Math.ceil(radiusX);
          const ceilRY = Math.ceil(radiusY);
          const invRX = 1 / radiusX;
          const invRY = 1 / radiusY;

          const perpX = -seg.tangentY;
          const perpY = seg.tangentX;

          const zIdx = Math.min(19, Math.max(0, (zNorm * 20) | 0));
          const zBase = zIdx * 10;

          for (let dy = -ceilRY; dy <= ceilRY; dy++) {
            const py = Math.round(seg.y + dy);
            if (py < 0 || py >= gridHeight) continue;
            const ny = dy * invRY;
            const ny2 = ny * ny;
            const gridRow = grid[py];

            for (let dx = -ceilRX; dx <= ceilRX; dx++) {
              const px = Math.round(seg.x + dx);
              if (px < 0 || px >= gridWidth) continue;

              const nx = dx * invRX;
              const d2 = nx * nx + ny2;
              if (d2 > 1) continue;

              const tubeD = Math.sqrt(1 - d2);
              const mag = Math.sqrt(d2 + tubeD * tubeD);
              const invMag = 1 / mag;

              const normalX = (nx * perpX + ny * seg.tangentX) * invMag;
              const normalY = (nx * perpY + ny * seg.tangentY) * invMag;
              const normalZ = tubeD * invMag;
              const light = Math.max(0.15, normalX * LIGHT_X + normalY * LIGHT_Y + normalZ * LIGHT_Z) * fade;

              const pri = basePri + tubeD * 10;
              const cell = gridRow[px];
              if (pri > cell.priority) {
                cell.char = getChar(zNorm, light);
                const lIdx = Math.min(9, Math.max(0, (light * 10) | 0));
                const entry = lut[zBase + lIdx];
                cell.cr = entry.r; cell.cg = entry.g; cell.cb = entry.b; cell.ca = entry.a;
                cell.priority = pri;
                cell.source = 'snake';
                snakeCells.push({ x: px, y: py });
              }
            }
          }
        }
      }

      // ============== RENDER TO CANVAS ==============
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Single pass: render all cells, build string only for visible cells
      for (let y = 0; y < gridHeight; y++) {
        const row = grid[y];
        const py = y * CHAR_HEIGHT;
        for (let x = 0; x < gridWidth; x++) {
          const cell = row[x];
          if (!cell.char) continue;
          ctx.fillStyle = rgbaStr(cell.cr, cell.cg, cell.cb, cell.ca);
          ctx.fillText(cell.char, x * CHAR_WIDTH, py);
        }
      }

      // Glow pass: only snake cells (tracked, not full grid scan)
      if (snakeCells.length > 0) {
        ctx.shadowColor = 'rgba(100,180,255,0.10)';
        ctx.shadowBlur = 2;
        ctx.globalAlpha = 0.35;

        for (let i = 0; i < snakeCells.length; i++) {
          const { x, y } = snakeCells[i];
          const cell = grid[y][x];
          if (cell.source !== 'snake') continue; // may have been overwritten
          ctx.fillStyle = rgbaStr(cell.cr, cell.cg, cell.cb, cell.ca);
          ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
        }

        ctx.globalAlpha = 1;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [width, height, gridWidth, gridHeight, planetCenterX, planetCenterY, getGrid]);

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
