// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// ASCII 3D Planet with orbiting snake "rings" that detach on scroll

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { ScanBeam, Point3D } from '../../../../types';
import {
  Snake,
  ImpactEffect,
  GridCell,
  COLOR_THEMES,
  ColorTheme,
} from './types';

// ============== CONSTANTS ==============

// Planet
const PLANET_RADIUS = 90;
const PLANET_ROTATION_SPEED = 0.1;  // radians per second

// Snake orbits
const ORBIT_RADIUS = 140;
const SNAKE_1_INCLINATION = Math.PI * 0.25;
const SNAKE_2_INCLINATION = -Math.PI * 0.15;
const SNAKE_1_ORBIT_SPEED = 0.3;
const SNAKE_2_ORBIT_SPEED = 0.35;

// Snake body
const SNAKE_1_BODY_LENGTH = 45;
const SNAKE_2_BODY_LENGTH = 40;
const SNAKE_1_THICKNESS = 5;
const SNAKE_2_THICKNESS = 4;

// Impact effects
const IMPACT_MAX_RADIUS = 40;
const IMPACT_DURATION_MS = 800;

// Character dimensions
const CHAR_WIDTH = 5;
const CHAR_HEIGHT = 8;
// Characters are taller than wide, so compress Y to keep circles circular
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT; // 0.625

// Frame timing
const FRAME_TIME = 33; // ~30fps

// Depth-based character sets (used for snakes + impacts)
const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

// Light direction (kept as-is so snakes behave exactly the same)
const LIGHT_X = -0.408;
const LIGHT_Y = -0.572;
const LIGHT_Z = 0.408;

// Precompute length so we can normalize dot products for the *planet* shading
const LIGHT_LEN = Math.max(1e-6, Math.sqrt(LIGHT_X * LIGHT_X + LIGHT_Y * LIGHT_Y + LIGHT_Z * LIGHT_Z));

// ============== PLANET (NEW) SETTINGS ==============

// You asked for main sphere color = RGB(0, 120, 255)
const PLANET_BASE_RGB = { r: 0, g: 120, b: 255 };

// Planet char ramp (no spaces; “lightest” is still visible on white bg)
const PLANET_CHAR_RAMP = ['·', '-', '=', '+', '*', 'o', 'O', '0', '#', '@'];

// Controls how dense/visible the bright side stays.
// Increase MIN_DENSITY_BIAS to reduce “washed” look on white background.
const PLANET_MIN_DENSITY_BIAS = 0.14; // 0..1

// Mapping between planet-space (px units) and grid-space (char cells).
// This should match your previous planet scale so the size stays the same.
const PLANET_PIXEL_SCALE = 3;

// ============== HELPERS ==============

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const rotateX = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos };
};

const rotateY = (p: Point3D, angle: number): Point3D => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos };
};

// Snakes/impacts character selection (unchanged)
const getChar = (zDepth: number, intensity: number): string => {
  const idx = Math.max(0, Math.min(4, ((1 - intensity) * 4) | 0));
  if (zDepth < 0.35) return DEPTH_CHARS.far[idx];
  if (zDepth < 0.55) return DEPTH_CHARS.mid[idx];
  if (zDepth < 0.8) return DEPTH_CHARS.close[Math.min(idx, 5)];
  return DEPTH_CHARS.closest[Math.min(idx, 5)];
};

// Color LUT for snakes (unchanged)
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

// Planet color (NEW): pure RGB shading so it never turns white
const getPlanetColor = (zDepth: number, lighting: number): string => {
  // lighting: 0..1
  // Use an ambient + diffuse model, then slightly bias center brighter than edge.
  const ambient = 0.28;
  const diffuse = 0.72;

  // Keep within [0,1]
  let i = clamp01(ambient + diffuse * lighting);

  // Gentle depth bias: edge a bit darker, center a bit brighter
  const depthBoost = 0.86 + 0.14 * zDepth; // zDepth 0(edge)..1(center-ish)
  i = clamp01(i * depthBoost);

  const r = Math.round(PLANET_BASE_RGB.r * i);
  const g = Math.round(PLANET_BASE_RGB.g * i);
  const b = Math.round(PLANET_BASE_RGB.b * i);

  return `rgba(${r}, ${g}, ${b}, 1)`;
};

// Planet char (NEW): choose from a ramp that stays visible on white background
const getPlanetChar = (zDepth: number, lighting: number): string => {
  // darker => heavier
  const darkness = 1 - clamp01(lighting);

  // Bias bright side away from ultra-light glyphs
  // (prevents “looks empty” on white background)
  const t = clamp01(PLANET_MIN_DENSITY_BIAS + darkness * (1 - PLANET_MIN_DENSITY_BIAS));

  // Slight extra lightening near edge for a rounder look (optional, subtle)
  const edge = 1 - zDepth; // 0 center, 1 edge
  const t2 = clamp01(t + edge * 0.06);

  const idx = Math.min(PLANET_CHAR_RAMP.length - 1, Math.max(0, Math.round(t2 * (PLANET_CHAR_RAMP.length - 1))));
  return PLANET_CHAR_RAMP[idx];
};

// Orbital position helper (unchanged)
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

// Organic noise (unchanged)
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

// ============== COMPONENT ==============

interface AsciiPlanetSystemProps {
  scrollProgress: number;
  activeBeams: ScanBeam[];
  onBeamImpact?: (surfacePoint: Point3D) => void;
  width: number;
  height: number;
  planetXOffset?: number;
  planetYOffset?: number;
}

export const AsciiPlanetSystem: React.FC<AsciiPlanetSystemProps> = ({
  scrollProgress,
  activeBeams,
  onBeamImpact,
  width,
  height,
  planetXOffset = 0.75,
  planetYOffset = 0.18,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const planetRotationRef = useRef(0);
  const isPageVisibleRef = useRef(true);

  // Impacts
  const impactsRef = useRef<ImpactEffect[]>([]);
  const lastBeamIdsRef = useRef<Set<string>>(new Set());

  // Snakes
  const snakesRef = useRef<Snake[]>([
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
      orbitalPhase: Math.PI,
      orbitSpeed: SNAKE_2_ORBIT_SPEED,
      orbitDirection: -1,
      bodyLength: SNAKE_2_BODY_LENGTH,
      baseThickness: SNAKE_2_THICKNESS,
      seed: { x: 137 + Math.random() * 50, y: 137 + Math.random() * 50, z: 137 + Math.random() * 50 },
    },
  ]);

  // Grid buffer
  const gridRef = useRef<GridCell[][] | null>(null);
  const gridDimsRef = useRef({ width: 0, height: 0 });

  const gridWidth = useMemo(() => Math.max(40, Math.floor(width / CHAR_WIDTH)), [width]);
  const gridHeight = useMemo(() => Math.max(30, Math.floor(height / CHAR_HEIGHT)), [height]);

  // Planet center in grid cells
  const planetCenterX = useMemo(() => Math.floor(gridWidth * planetXOffset), [gridWidth, planetXOffset]);
  const planetCenterY = useMemo(() => Math.floor(gridHeight * planetYOffset), [gridHeight, planetYOffset]);

  // Free-roam center
  const centerX = useMemo(() => gridWidth / 2, [gridWidth]);
  const centerY = useMemo(() => gridHeight / 2, [gridHeight]);

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
    return gridRef.current!;
  }, []);

  // Page visibility
  useEffect(() => {
    const handleVisibility = () => { isPageVisibleRef.current = document.visibilityState === 'visible'; };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Beam impacts -> planet center
  useEffect(() => {
    const currentIds = new Set(activeBeams.map(b => b.id));
    const previousIds = lastBeamIdsRef.current;

    activeBeams.forEach(beam => {
      if (beam.headProgress >= 0.95 && !previousIds.has(beam.id + '-impacted')) {
        const impact: ImpactEffect = {
          id: `impact-${Date.now()}-${Math.random()}`,
          surfacePoint: { x: planetCenterX, y: planetCenterY, z: PLANET_RADIUS * 0.8 },
          currentRadius: 0,
          alpha: 1,
          impactTime: performance.now(),
        };
        impactsRef.current.push(impact);
        previousIds.add(beam.id + '-impacted');
        onBeamImpact?.(impact.surfacePoint);
      }
    });

    // cleanup
    previousIds.forEach(id => {
      const base = id.replace('-impacted', '');
      if (!currentIds.has(base)) previousIds.delete(id);
    });

    lastBeamIdsRef.current = previousIds;
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
      if (!isPageVisibleRef.current || now - lastFrameRef.current < FRAME_TIME) {
        animId = requestAnimationFrame(animate);
        return;
      }
      lastFrameRef.current = now;

      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      timeRef.current += dt;
      const t = timeRef.current;

      // Update "rotation" (used for subtle surface variation)
      planetRotationRef.current += PLANET_ROTATION_SPEED * dt;
      const planetRotation = planetRotationRef.current;

      // Orbit influence 0..1
      const orbitInfluence = 1 - Math.min(1, scrollProgress / 0.3);

      const grid = getGrid(gridWidth, gridHeight);

      // ============== RENDER PLANET (RECODED: HOLE-FREE) ==============
      // Instead of scattering samples and rounding into grid cells (which causes gaps),
      // we rasterize by iterating every grid cell in the planet bounding box and solving
      // the sphere surface point for that cell.
      const rX = Math.ceil(PLANET_RADIUS / PLANET_PIXEL_SCALE);
      const rY = Math.ceil((PLANET_RADIUS / PLANET_PIXEL_SCALE) * CHAR_ASPECT_RATIO);

      for (let gy = planetCenterY - rY; gy <= planetCenterY + rY; gy++) {
        if (gy < 0 || gy >= gridHeight) continue;

        // Undo aspect compression to get planet-space Y
        const y = (gy - planetCenterY) * (PLANET_PIXEL_SCALE / CHAR_ASPECT_RATIO);

        for (let gx = planetCenterX - rX; gx <= planetCenterX + rX; gx++) {
          if (gx < 0 || gx >= gridWidth) continue;

          const x = (gx - planetCenterX) * PLANET_PIXEL_SCALE;

          const d2 = x * x + y * y;
          const R2 = PLANET_RADIUS * PLANET_RADIUS;
          if (d2 > R2) continue;

          // Visible hemisphere: z >= 0
          const z = Math.sqrt(R2 - d2);

          // Normal in camera space (unit sphere)
          const nx = x / PLANET_RADIUS;
          const ny = y / PLANET_RADIUS;
          const nz = z / PLANET_RADIUS;

          // Diffuse lighting; normalize light length so result is in [0,1]
          const ndotlRaw = nx * LIGHT_X + ny * LIGHT_Y + nz * LIGHT_Z;
          const ndotl = clamp01(Math.max(0, ndotlRaw) / LIGHT_LEN);

          // Rim/edge shaping: darker near edge (nz low), brighter near center (nz high)
          const zDepth = clamp01(nz); // 0 edge .. 1 center-ish
          const rim = 0.55 + zDepth * 0.45;

          // Base lighting
          let lighting = clamp01(ndotl * rim);

          // Subtle rotating surface variation so the planet actually "moves"
          // even though a perfect sphere has no visible rotation without texture.
          const obj = rotateY({ x, y, z }, -planetRotation);
          const lon = Math.atan2(obj.z, obj.x);           // [-π, π]
          const lat = Math.asin(obj.y / PLANET_RADIUS);   // [-π/2, π/2]
          const tex = 0.06 * Math.sin(lon * 5 + lat * 3); // small amplitude
          lighting = clamp01(lighting + tex);

          const priority = z; // closer points win
          if (priority > grid[gy][gx].priority) {
            grid[gy][gx].char = getPlanetChar(zDepth, lighting);
            grid[gy][gx].color = getPlanetColor(zDepth, lighting);
            grid[gy][gx].priority = priority;
            grid[gy][gx].source = 'planet';
          }
        }
      }

      // ============== UPDATE AND RENDER SNAKES (UNCHANGED) ==============
      snakesRef.current.forEach(snake => {
        snake.orbitalPhase += snake.orbitSpeed * snake.orbitDirection * dt;

        let headX: number, headY: number, headZ: number;

        if (orbitInfluence > 0.95) {
          const pos = getOrbitalPosition(
            snake.orbitalPhase,
            ORBIT_RADIUS / 3,
            snake.orbitalInclination,
            planetCenterX,
            planetCenterY,
          );
          headX = pos.x;
          headY = pos.y;
          headZ = pos.z;
        } else if (orbitInfluence < 0.05) {
          const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
          const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
          const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

          const margin = snake.baseThickness * 4;
          headX = margin + (gridWidth - margin * 2) * ((noiseX) * 0.5 + 0.5);
          headY = margin + (gridHeight - margin * 2) * ((noiseY) * 0.5 + 0.5);
          headZ = -PLANET_RADIUS + (2 * PLANET_RADIUS) * ((noiseZ) * 0.5 + 0.5);
        } else {
          const orbitalPos = getOrbitalPosition(
            snake.orbitalPhase,
            ORBIT_RADIUS / 3,
            snake.orbitalInclination,
            planetCenterX,
            planetCenterY,
          );

          const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
          const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
          const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

          const margin = snake.baseThickness * 4;
          const freeX = margin + (gridWidth - margin * 2) * ((noiseX) * 0.5 + 0.5);
          const freeY = margin + (gridHeight - margin * 2) * ((noiseY) * 0.5 + 0.5);
          const freeZ = -PLANET_RADIUS + (2 * PLANET_RADIUS) * ((noiseZ) * 0.5 + 0.5);

          headX = orbitalPos.x * orbitInfluence + freeX * (1 - orbitInfluence);
          headY = orbitalPos.y * orbitInfluence + freeY * (1 - orbitInfluence);
          headZ = orbitalPos.z * orbitInfluence + freeZ * (1 - orbitInfluence);
        }

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

        snake.body.unshift({ x: headX, y: headY, z: headZ, tangentX, tangentY });
        if (snake.body.length > snake.bodyLength) snake.body.length = snake.bodyLength;
        if (snake.body.length < 2) return;

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
              const normalY = (nx * perpY + ny * seg.tangentX) / mag;
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

      // ============== UPDATE AND RENDER IMPACT EFFECTS (UNCHANGED) ==============
      const nowMs = performance.now();
      impactsRef.current = impactsRef.current.filter(impact => {
        const elapsed = nowMs - impact.impactTime;
        if (elapsed > IMPACT_DURATION_MS) return false;

        const progress = elapsed / IMPACT_DURATION_MS;
        impact.currentRadius = IMPACT_MAX_RADIUS * progress;
        impact.alpha = 1 - progress;

        const ringRadius = impact.currentRadius / 3;
        const ringThickness = 2;

        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
          for (let r = ringRadius - ringThickness; r <= ringRadius + ringThickness; r++) {
            const rx = Math.cos(angle) * r;
            const ry = Math.sin(angle) * r;

            const gx = Math.round(planetCenterX + rx);
            const gy = Math.round(planetCenterY + ry * CHAR_ASPECT_RATIO);

            if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) continue;

            const pri = PLANET_RADIUS + 10;
            if (pri > grid[gy][gx].priority) {
              const intensity = 1 - Math.abs(r - ringRadius) / ringThickness;
              const fadeAlpha = impact.alpha * intensity;

              const zDepth = 0.7 + intensity * 0.3;
              const char = getChar(zDepth, intensity);

              const hue = 330;
              const saturation = 60 + intensity * 30;
              const lightness = 50 + intensity * 20;
              const color = `hsla(${hue}, ${saturation | 0}%, ${lightness | 0}%, ${fadeAlpha.toFixed(2)})`;

              grid[gy][gx].char = char;
              grid[gy][gx].color = color;
              grid[gy][gx].priority = pri;
              grid[gy][gx].source = 'impact';
            }
          }
        }

        return true;
      });

      // ============== RENDER TO CANVAS ==============
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Base pass (no shadow): keeps planet colors stable and avoids white washout
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const cell = grid[y][x];
          if (!cell.char) continue;
          ctx.fillStyle = cell.color;
          ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
        }
      }

      // Glow pass: only snakes/impacts get glow
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
  }, [
    width,
    height,
    gridWidth,
    gridHeight,
    centerX,
    centerY,
    planetCenterX,
    planetCenterY,
    scrollProgress,
    getGrid,
    onBeamImpact,
  ]);

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
