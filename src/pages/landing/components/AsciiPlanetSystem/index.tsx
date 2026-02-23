// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// Noise-based animated ASCII orb with one orbiting snake that detaches on scroll
//
// NEW:
// - Single snake (keeps the old "pink snake" orbital behavior, but now BLUE)
// - Question events trigger:
//    1) a dramatic ferrofluid-like shape morph
//    2) "thinking" hue waves (gradient colors sweeping through glyphs)
//    3) a shockwave ripple at the impact point

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

// Orb (noise-based animated sphere)
const PLANET_RADIUS = 90;
const ORB_RADIUS = 55;          // grid units
const ORB_NOISE_SCALE = 35;
const ORB_GLYPHS = ' .:-=+*#%@';
const ORB_Y_ASPECT = 0.625;     // CHAR_WIDTH / CHAR_HEIGHT

// Orb colors (black theme for contrast on white bg)
const ORB_PRIMARY_RGB = { r: 0, g: 0, b: 0 };
const ORB_SECONDARY_RGB = { r: 50, g: 50, b: 50 };

// Brain morph timing (ms)
const MORPH_IN_MS = 700;
const THINK_HOLD_MS = 2600;
const MORPH_OUT_MS = 700;

// Shockwave tunables
const SHOCKWAVE_DURATION_S = 0.55;
const SHOCKWAVE_SPEED = 18;
const SHOCKWAVE_WIDTH = 1.4;

// Snake orbit
const ORBIT_RADIUS = 200;
const SNAKE_INCLINATION = -Math.PI * 0.15;
const SNAKE_ORBIT_SPEED = 0.95;
const SNAKE_ORBIT_DIRECTION: 1 | -1 = -1;

// Snake body
const SNAKE_BODY_LENGTH = 65;
const SNAKE_THICKNESS = 4;

// Character dimensions
const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 8;
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;

// Frame timing
const FRAME_TIME = 33;

// Depth-based character sets
const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

// Light direction (normalized)
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
  else[r1, g1, b1] = [c, 0, x];

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

// NEW: thinking-wave overlay uses an arbitrary hue value (degrees)
const applyHueOverlayDegrees = (baseColor: string, hueDeg: number, strength: number): string => {
  const parsed = parseRgba(baseColor);
  if (!parsed) return baseColor;

  const overlayStrength = clamp01(strength);
  const { s, l } = rgbToHsl(parsed.r, parsed.g, parsed.b);

  const boostedSaturation = Math.min(98, Math.max(70, s + 38 + overlayStrength * 36));
  const boostedLightness = Math.min(82, Math.max(28, l + 10 + overlayStrength * 30));
  const tintRgb = hslToRgb(hueDeg, boostedSaturation, boostedLightness);

  const blend = clamp01(0.18 + overlayStrength * 0.55);
  const r = Math.round(parsed.r + (tintRgb.r - parsed.r) * blend);
  const g = Math.round(parsed.g + (tintRgb.g - parsed.g) * blend);
  const b = Math.round(parsed.b + (tintRgb.b - parsed.b) * blend);
  const a = Math.min(1, parsed.a + overlayStrength * 0.12);

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

// 3D rotation
const rotateX = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
};

// Orbital position for snake head
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

  // Spiky
  spikeCount?: number;
  spikeAmplitude?: number;
  spikeSharpness?: number;
  spikePhase?: number;

  // Branchy / splatter: gaussian bumps on radius
  bumpAngles?: number[];
  bumpAmplitudes?: number[];
  bumpWidths?: number[];

  // Ring
  ringInnerFactor?: number;
  ringWaveAmp?: number;
  ringWaveFreq?: number;

  // Blob
  blobLobeCount?: number;
  blobAmplitude?: number;
  blobPhase?: number;

  // Splatter satellites
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
    return {
      style,
      seed,
      wobble,
      spikeCount: randInt(18, 34),
      spikeAmplitude: rand(0.40, 0.78),
      spikeSharpness: rand(2.2, 4.8),
      spikePhase: rand(0, Math.PI * 2),
    };
  }

  if (style === 'ring') {
    return {
      style,
      seed,
      wobble,
      ringInnerFactor: rand(0.55, 0.72),
      ringWaveAmp: rand(0.08, 0.17),
      ringWaveFreq: rand(3.4, 6.7),
    };
  }

  if (style === 'blob') {
    return {
      style,
      seed,
      wobble,
      blobLobeCount: randInt(3, 5),
      blobAmplitude: rand(0.22, 0.42),
      blobPhase: rand(0, Math.PI * 2),
    };
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
      bumpAngles.push(a);
      bumpAmplitudes.push(amp);
      bumpWidths.push(w);

      const branches = randInt(1, 3);
      for (let b = 0; b < branches; b++) {
        bumpAngles.push(a + rand(-0.28, 0.28));
        bumpAmplitudes.push(amp * rand(0.28, 0.55));
        bumpWidths.push(w * rand(0.45, 0.70));
      }
    }

    return {
      style,
      seed,
      wobble,
      bumpAngles,
      bumpAmplitudes,
      bumpWidths,
    };
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
    const r = rand(2.6, 6.8);
    sats.push({
      x: Math.cos(a) * dist,
      y: Math.sin(a) * dist * ORB_Y_ASPECT,
      r,
    });
  }

  return {
    style: 'splatter',
    seed,
    wobble,
    bumpAngles,
    bumpAmplitudes,
    bumpWidths,
    satellites: sats,
  };
};

const shapeRadiusScale = (
  params: OrbShapeParams,
  angle: number,
  t: number,
  noise2D: (x: number, y: number) => number
): number => {
  // subtle boundary "breathing" + micro-wobble (keeps it ferrofluid-like)
  const wobbleBase = params.wobble * Math.sin(angle * 2.0 + t * 1.25 + params.seed);
  const wobbleNoise = params.wobble * 0.85 * noise2D(Math.cos(angle) * 1.4 + params.seed, Math.sin(angle) * 1.4 + t * 0.65);
  let scale = 1 + wobbleBase + wobbleNoise;

  switch (params.style) {
    case 'spiky': {
      const n = params.spikeCount ?? 24;
      const amp = params.spikeAmplitude ?? 0.55;
      const sharp = params.spikeSharpness ?? 3.2;
      const phase = params.spikePhase ?? 0;

      // Primary spikes (sea-urchin edge)
      const raw = Math.cos(n * angle + phase + t * 0.55);
      const spike = Math.pow(Math.max(0, raw), sharp);

      // Secondary "fine" jaggies so silhouette isn't too uniform
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
        const g = gaussian(d, widths[i] ?? 0.35);
        const anim = 0.86 + 0.14 * Math.sin(t * 1.1 + i * 2.2 + params.seed);
        bumpSum += (amps[i] ?? 0.3) * g * anim;
      }

      // splatter: chunkier protrusions; branchy: more filament-like
      const baseBoost = params.style === 'splatter' ? 0.18 : 0.10;
      scale += baseBoost + bumpSum * (params.style === 'splatter' ? 0.85 : 0.75);
      break;
    }

    case 'ring': {
      const amp = params.ringWaveAmp ?? 0.12;
      const freq = params.ringWaveFreq ?? 5.0;
      const wave = amp * Math.sin(freq * angle + t * 1.6 + params.seed);
      scale += 0.18 + wave;
      break;
    }

    case 'blob': {
      const lobes = params.blobLobeCount ?? 4;
      const amp = params.blobAmplitude ?? 0.30;
      const phase = params.blobPhase ?? 0;
      const lobe = amp * Math.sin(lobes * angle + phase + t * 0.75);
      // extra vertical breathing bias so it "rises/falls"
      const breath = 0.10 * Math.sin(t * 0.6 + params.seed);
      scale += 0.16 + lobe + breath;
      break;
    }
  }

  // prevent collapsing too much
  return Math.max(0.62, scale);
};

// ============== COMPONENT ==============

// Auto-morph timing
const AUTO_MORPH_MIN_DELAY_MS = 2500;  // min pause between morphs
const AUTO_MORPH_MAX_DELAY_MS = 5500;  // max pause between morphs

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

  // Animation state
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const isPageVisibleRef = useRef(true);

  // Simplex noise for orb texture
  const noise2DRef = useRef(makeNoise2D(Date.now()));

  // Smooth scroll influence without restarting RAF loop
  const scrollProgressRef = useRef(scrollProgress);
  useEffect(() => { scrollProgressRef.current = scrollProgress; }, [scrollProgress]);

  // 1 = orbit, 0 = free; smoothed
  const orbitInfluenceRef = useRef(1);

  // Impact effects (shockwaves)
  const impactsRef = useRef<ImpactEffect[]>([]);

  // Brain morph state
  const brainMorphRef = useRef<BrainMorphState>({
    eventId: null,
    startTimeMs: 0,
    hue: 'blue',
    shape: null,
  });
  const processedBrainIdsRef = useRef<Set<string>>(new Set());

  // Auto-morph: schedule next morph time
  const nextAutoMorphRef = useRef<number>(
    performance.now() + AUTO_MORPH_MIN_DELAY_MS + Math.random() * (AUTO_MORPH_MAX_DELAY_MS - AUTO_MORPH_MIN_DELAY_MS),
  );

  // Single snake: same orbital behavior as your old "pink snake", but blue theme
  const snakesRef = useRef<SnakeRuntime[]>([
    {
      id: 'snake-blue',
      body: [],
      colorTheme: 'blue',
      orbitalInclination: SNAKE_INCLINATION,
      orbitalPhase: Math.PI, // start opposite side (keeps the old "pink snake" feel)
      orbitSpeed: SNAKE_ORBIT_SPEED,
      orbitDirection: SNAKE_ORBIT_DIRECTION,
      bodyLength: SNAKE_BODY_LENGTH,
      baseThickness: SNAKE_THICKNESS,
      seed: { x: 137 + Math.random() * 50, y: 137 + Math.random() * 50, z: 137 + Math.random() * 50 },
    },
  ]);

  // Grid buffer for ASCII rendering
  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ width: 0, height: 0 });

  // Calculate grid dimensions
  const gridWidth = useMemo(() => Math.max(40, Math.floor(width / CHAR_WIDTH)), [width]);
  const gridHeight = useMemo(() => Math.max(30, Math.floor(height / CHAR_HEIGHT)), [height]);

  // Planet center based on offsets (+ optional pixel offset converted to grid units)
  const planetCenterX = useMemo(() => Math.floor(gridWidth * planetXOffset), [gridWidth, planetXOffset]);
  const planetCenterY = useMemo(
    () => Math.floor(gridHeight * planetYOffset + planetYPixelOffset / CHAR_HEIGHT),
    [gridHeight, planetYOffset, planetYPixelOffset],
  );

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

  // NEW: Brain event → start morph + spawn an impact shockwave
  useEffect(() => {
    if (!brainEvent) return;
    if (processedBrainIdsRef.current.has(brainEvent.id)) return;

    processedBrainIdsRef.current.add(brainEvent.id);
    if (processedBrainIdsRef.current.size > 60) {
      // keep bounded
      processedBrainIdsRef.current = new Set(Array.from(processedBrainIdsRef.current).slice(-30));
    }

    const nowMs = performance.now();
    const shape = makeShapeParams();
    const hue: RippleHue = brainEvent.hue === 'pink' ? 'pink' : 'blue';

    brainMorphRef.current = {
      eventId: brainEvent.id,
      startTimeMs: nowMs,
      hue,
      shape,
    };

    // Spawn a shockwave impact inside the orb (random spot)
    const impactAngle = Math.random() * Math.PI * 2;
    const impactR = Math.sqrt(Math.random()) * 0.55; // stay inside ~55% radius
    const ox = Math.cos(impactAngle) * impactR;
    const oy = Math.sin(impactAngle) * impactR;

    const impact: ImpactEffect = {
      id: `impact-${Date.now()}-${Math.random()}`,
      surfacePoint: {
        x: planetCenterX + ox * ORB_RADIUS,
        y: planetCenterY + oy * ORB_RADIUS * ORB_Y_ASPECT,
        z: PLANET_RADIUS * 0.8,
      },
      currentRadius: 0,
      alpha: 1,
      impactTime: nowMs,
      hue,
    };

    impactsRef.current.push(impact);
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

      // Orbit → free blend (smooth)
      const DETACH_END = 0.30;

      const p = clamp01(scrollProgressRef.current);
      const freeTarget = smoothstep(0, DETACH_END, p); // 0..1
      const orbitTarget = 1 - freeTarget;

      const FOLLOW_SPEED = 1.5;
      const follow = 1 - Math.exp(-FOLLOW_SPEED * dt);

      orbitInfluenceRef.current += (orbitTarget - orbitInfluenceRef.current) * follow;
      const orbitInfluence = clamp01(orbitInfluenceRef.current);

      const freeBlend = smoothstep(0, 1, 1 - orbitInfluence);

      // ===== Brain morph timeline =====
      const brain = brainMorphRef.current;
      const elapsedMs = brain.eventId ? (now - brain.startTimeMs) : 0;

      let morphMix = 0;       // 0 circle → 1 morphed
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
          const outT = (elapsedMs - MORPH_IN_MS - THINK_HOLD_MS) / MORPH_OUT_MS;
          const k = smoothstep(0, 1, outT);
          morphMix = 1 - k;
          thinkingStrength = morphMix;
        } else {
          // Done — schedule next auto-morph
          brainMorphRef.current.eventId = null;
          brainMorphRef.current.shape = null;
          morphMix = 0;
          thinkingStrength = 0;
          activeShape = null;
          nextAutoMorphRef.current = now + AUTO_MORPH_MIN_DELAY_MS + Math.random() * (AUTO_MORPH_MAX_DELAY_MS - AUTO_MORPH_MIN_DELAY_MS);
        }
      }

      // Auto-morph: trigger a new random morph when idle
      if (!brain.eventId && now >= nextAutoMorphRef.current) {
        const id = `auto-${now}-${Math.random()}`;
        const shape = makeShapeParams();
        const hues: RippleHue[] = ['blue', 'pink'];
        const hue = hues[Math.floor(Math.random() * hues.length)];

        brainMorphRef.current = {
          eventId: id,
          startTimeMs: now,
          hue,
          shape,
        };

        // Spawn a shockwave impact
        const impactAngle = Math.random() * Math.PI * 2;
        const impactR = Math.sqrt(Math.random()) * 0.55;
        const ox = Math.cos(impactAngle) * impactR;
        const oy = Math.sin(impactAngle) * impactR;

        impactsRef.current.push({
          id: `impact-${now}-${Math.random()}`,
          surfacePoint: {
            x: planetCenterX + ox * ORB_RADIUS,
            y: planetCenterY + oy * ORB_RADIUS * ORB_Y_ASPECT,
            z: PLANET_RADIUS * 0.8,
          },
          currentRadius: 0,
          alpha: 1,
          impactTime: now,
          hue,
        });
      }

      // Get grid buffer
      const grid = getGrid(gridWidth, gridHeight);
      const nowMs = performance.now();

      // Clean up expired impacts
      impactsRef.current = impactsRef.current.filter((impact) => {
        const elapsed = nowMs - impact.impactTime;
        return elapsed <= SHOCKWAVE_DURATION_S * 1000;
      });

      // ============== RENDER ORB (morphable silhouette) ==============
      const noise2D = noise2DRef.current;

      // render radius expands so spikes/satellites don't clip
      const ORB_RENDER_RADIUS = ORB_RADIUS * 1.75;
      const orbYExtent = Math.ceil(ORB_RENDER_RADIUS * ORB_Y_ASPECT);

      const minOrbX = Math.max(0, Math.floor(planetCenterX - ORB_RENDER_RADIUS));
      const maxOrbX = Math.min(gridWidth - 1, Math.ceil(planetCenterX + ORB_RENDER_RADIUS));
      const minOrbY = Math.max(0, Math.floor(planetCenterY - orbYExtent));
      const maxOrbY = Math.min(gridHeight - 1, Math.ceil(planetCenterY + orbYExtent));

      for (let y = minOrbY; y <= maxOrbY; y++) {
        for (let x = minOrbX; x <= maxOrbX; x++) {
          const dx = x - planetCenterX;
          const dy = (y - planetCenterY) / ORB_Y_ASPECT;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // angle in the morph-space (aspect-corrected)
          const angle = Math.atan2(dy, dx);

          const targetScale = activeShape ? shapeRadiusScale(activeShape, angle, t, noise2D) : 1;
          const targetRadius = ORB_RADIUS * targetScale;
          const effectiveRadius = ORB_RADIUS + (targetRadius - ORB_RADIUS) * morphMix;

          // ring hole (only when ring style + morphMix > 0)
          if (activeShape?.style === 'ring' && morphMix > 0.001) {
            const innerFactor = activeShape.ringInnerFactor ?? 0.62;
            const innerR = effectiveRadius * innerFactor * morphMix;
            if (dist < innerR) continue;
          }

          const norm = dist / Math.max(1e-3, effectiveRadius);
          if (norm >= 1) continue;

          const distNorm = 1 - norm;
          const radial = 0.15 + distNorm * 0.85;

          // Simplex noise sampling (internal texture)
          const n = noise2D(x / ORB_NOISE_SCALE, y / ORB_NOISE_SCALE + t);
          const nNorm = (n + 1) * 0.5;

          const baseV = clamp01(nNorm * radial * 1.4);

          // Shockwaves as hue overlays
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

          const glyphIdx = Math.min(ORB_GLYPHS.length - 1, Math.floor(baseV * (ORB_GLYPHS.length - 1)));
          const glyph = ORB_GLYPHS[glyphIdx];
          if (glyph === ' ') continue;

          const baseColor = getOrbColor(baseV);
          let color = rippleHue ? applyHueOverlay(baseColor, rippleHue, rippleStrength) : baseColor;

          // NEW: thinking wave overlay (gradient hue sweep)
          if (thinkingStrength > 0.01) {
            // Wave travels across the orb with a slight positional delay (x/y contribute phase)
            const wave =
              0.5 +
              0.5 * Math.sin(t * 5.5 + x * 0.14 + y * 0.11 + (activeHue === 'pink' ? 1.2 : 0));

            // Hue sweeps blue→purple→pink and back
            const hue = 200 + 135 * wave; // ~200..335
            const strength = thinkingStrength * (0.18 + 0.82 * wave);
            color = applyHueOverlayDegrees(color, hue, strength);
          }

          const priority = distNorm * PLANET_RADIUS;

          if (priority > grid[y][x].priority) {
            grid[y][x].char = glyph;
            grid[y][x].color = color;
            grid[y][x].priority = priority;
            grid[y][x].source = 'planet';
          }
        }
      }

      // NEW: Splatter satellites (droplets around the blob)
      if (activeShape?.style === 'splatter' && activeShape.satellites && morphMix > 0.05) {
        const satMix = smoothstep(0.10, 1.0, morphMix);

        for (const sat of activeShape.satellites) {
          const r = sat.r * satMix;
          if (r < 0.8) continue;

          const cx = planetCenterX + sat.x;
          const cy = planetCenterY + sat.y;

          const yExt = Math.ceil(r * ORB_Y_ASPECT);
          const minX = Math.max(0, Math.floor(cx - r - 2));
          const maxX = Math.min(gridWidth - 1, Math.ceil(cx + r + 2));
          const minY = Math.max(0, Math.floor(cy - yExt - 2));
          const maxY = Math.min(gridHeight - 1, Math.ceil(cy + yExt + 2));

          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const dx = x - cx;
              const dy = (y - cy) / ORB_Y_ASPECT;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const norm = dist / Math.max(1e-3, r);
              if (norm >= 1) continue;

              const distNorm = 1 - norm;
              const radial = 0.18 + distNorm * 0.82;

              const n = noise2D((x + activeShape.seed * 2) / ORB_NOISE_SCALE, (y + activeShape.seed * 2) / ORB_NOISE_SCALE + t);
              const nNorm = (n + 1) * 0.5;

              const baseV = clamp01(nNorm * radial * 1.25);
              const glyphIdx = Math.min(ORB_GLYPHS.length - 1, Math.floor(baseV * (ORB_GLYPHS.length - 1)));
              const glyph = ORB_GLYPHS[glyphIdx];
              if (glyph === ' ') continue;

              let color = getOrbColor(baseV);
              if (thinkingStrength > 0.01) {
                const wave = 0.5 + 0.5 * Math.sin(t * 5.5 + x * 0.14 + y * 0.11);
                const hue = 200 + 135 * wave;
                color = applyHueOverlayDegrees(color, hue, thinkingStrength * (0.10 + 0.70 * wave));
              }

              // Keep satellites behind main orb slightly (lower priority)
              const priority = distNorm * PLANET_RADIUS * 0.62;

              if (priority > grid[y][x].priority) {
                grid[y][x].char = glyph;
                grid[y][x].color = color;
                grid[y][x].priority = priority;
                grid[y][x].source = 'planet';
              }
            }
          }
        }
      }

      // ============== UPDATE AND RENDER SNAKE (SMOOTH DETACH) ==============
      snakesRef.current.forEach((snake) => {
        // Update orbital phase
        snake.orbitalPhase += snake.orbitSpeed * snake.orbitDirection * dt;

        // Orbital target
        const orbitalPos = getOrbitalPosition(
          snake.orbitalPhase,
          ORBIT_RADIUS / 3,
          snake.orbitalInclination,
          planetCenterX,
          planetCenterY,
        );

        // Free-roam target
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

        if (!snake.freePos) {
          snake.freePos = { x: orbitalPos.x, y: orbitalPos.y, z: orbitalPos.z };
        }

        if (orbitInfluence > 0.985) {
          snake.freePos.x = orbitalPos.x;
          snake.freePos.y = orbitalPos.y;
          snake.freePos.z = orbitalPos.z;
        } else {
          const freeFollowSpeed = 0.4 + 2.0 * freeBlend;
          const sFree = 1 - Math.exp(-freeFollowSpeed * dt);

          snake.freePos.x += (freeXTarget - snake.freePos.x) * sFree;
          snake.freePos.y += (freeYTarget - snake.freePos.y) * sFree;
          snake.freePos.z += (freeZTarget - snake.freePos.z) * sFree;
        }

        const headX = orbitalPos.x + (snake.freePos.x - orbitalPos.x) * freeBlend;
        const headY = orbitalPos.y + (snake.freePos.y - orbitalPos.y) * freeBlend;
        const headZ = orbitalPos.z + (snake.freePos.z - orbitalPos.z) * freeBlend;

        // Tangent
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

        if (snake.body.length < 2) return;

        // Sort segments by Z
        const indices: number[] = [];
        for (let i = 0; i < snake.body.length; i++) indices.push(i);
        indices.sort((a, b) => snake.body[a].z - snake.body[b].z);

        for (const i of indices) {
          const seg = snake.body[i];
          const bodyPos = i / (snake.body.length - 1);
          const taper = 1 - bodyPos * 0.6;

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

      // Base pass: draw all glyphs without shadow
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

      // Glow pass: snake glow for pop
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