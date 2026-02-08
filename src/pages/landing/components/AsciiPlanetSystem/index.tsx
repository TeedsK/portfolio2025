// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// ASCII 3D Planet with orbiting snake "rings" that detach on scroll
//
// Key fixes in this version:
// 1) The RAF loop no longer restarts when scrollProgress changes (huge stutter fix).
// 2) Orbit → free-roam uses a smoothed influence ref + eased blend.
// 3) Snakes use a "freePos" follower that starts at orbital position, then drifts away.
//    This makes detachment look like a natural glide away from orbit (not a mode switch).
// 4) Impact effects do NOT replace ASCII; they tint the planet surface via an overlay mask.

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

// Planet - smaller to fit within canvas with margin
const PLANET_RADIUS = 90;
const PLANET_ROTATION_SPEED = 0.1;  // radians per second

// Snake orbits - tighter to stay within bounds
const ORBIT_RADIUS = 140;  // distance from planet center
const SNAKE_1_INCLINATION = Math.PI * 0.25;   // ~45 degrees
const SNAKE_2_INCLINATION = -Math.PI * 0.15;  // ~-27 degrees
const SNAKE_1_ORBIT_SPEED = 0.3;   // radians per second
const SNAKE_2_ORBIT_SPEED = 0.35;  // radians per second

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

// Planet base color (requested): rgb(0, 120, 255)
const PLANET_BASE_RGB = { r: 0, g: 120, b: 255 };

// ============== HELPER FUNCTIONS ==============

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
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

// Planet color: keep RGB constant, shade via alpha (so it never goes "dark blue").
// Brighter side is higher alpha, darker side is lower alpha.
const getPlanetColor = (zDepth: number, lighting: number): string => {
  const l = clamp01(lighting);

  // Tuning knobs (feel free to tweak):
  // - Raise minAlpha if the planet still feels too dark on white backgrounds.
  // - Lower gamma to keep more of the planet near maxAlpha.
  const minAlpha = 0.62;
  const maxAlpha = 1.0;
  const gamma = 0.65;

  const eased = Math.pow(l, gamma);

  // Slightly boost nearer-facing cells (small, helps depth without darkening RGB)
  const depthBoost = 0.90 + 0.10 * clamp01(zDepth);

  const a = clamp01((minAlpha + (maxAlpha - minAlpha) * eased) * depthBoost);
  return `rgba(${PLANET_BASE_RGB.r}, ${PLANET_BASE_RGB.g}, ${PLANET_BASE_RGB.b}, ${a.toFixed(3)})`;
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
  planetXOffset = 0.75,  // Default: planet in right area (3/4 across)
  planetYOffset = 0.18,  // Default: planet near top
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Animation state refs
  const timeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const planetRotationRef = useRef(0);
  const isPageVisibleRef = useRef(true);

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

        const impact: ImpactEffect = {
          id: `impact-${Date.now()}-${Math.random()}`,
          surfacePoint: { x: planetCenterX, y: planetCenterY, z: PLANET_RADIUS * 0.8 },
          currentRadius: 0,
          alpha: 1,
          impactTime: performance.now(),
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

    // NEW: Impact tint mask (alpha per cell). Lives for the duration of this effect instance.
    const impactTint = new Float32Array(gridWidth * gridHeight);

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

      // Update planet rotation
      planetRotationRef.current += PLANET_ROTATION_SPEED * dt;

      // ================= ORBIT → FREE BLEND (SMOOTH) =================
      // Keep your original "0..0.3 detaches" behavior, but smooth it so it glides.
      const DETACH_END = 0.30;

      const p = clamp01(scrollProgressRef.current);
      const freeTarget = smoothstep(0, DETACH_END, p); // 0..1 (eased)
      const orbitTarget = 1 - freeTarget;

      // Exponential smoothing to remove scroll-step jitter
      const FOLLOW_SPEED = 8.0; // higher = more responsive, lower = floatier
      const follow = 1 - Math.exp(-FOLLOW_SPEED * dt);

      orbitInfluenceRef.current += (orbitTarget - orbitInfluenceRef.current) * follow;
      const orbitInfluence = clamp01(orbitInfluenceRef.current);

      // Additional easing so early detachment feels extremely gentle
      const freeBlend = smoothstep(0, 1, 1 - orbitInfluence);

      // Get grid buffer
      const grid = getGrid(gridWidth, gridHeight);

      // Clear tint mask each frame
      impactTint.fill(0);

      // ============== RENDER PLANET ==============
      const planetRotation = planetRotationRef.current;

      // Pixel-to-grid scaling factor
      const pixelScale = 3;

      // Sample planet surface points - render at planet center position
      // NOTE: If you ever want fewer "holes", reduce step from 3 → 2 (costs more CPU).
      for (let py = -PLANET_RADIUS; py <= PLANET_RADIUS; py += 3) {
        for (let px = -PLANET_RADIUS; px <= PLANET_RADIUS; px += 3) {
          const d2 = px * px + py * py;
          if (d2 > PLANET_RADIUS * PLANET_RADIUS) continue;

          // Calculate z on sphere surface
          const pz = Math.sqrt(PLANET_RADIUS * PLANET_RADIUS - d2);

          // Apply planet rotation (around Y axis)
          const rotatedPx = px * Math.cos(planetRotation) + pz * Math.sin(planetRotation);
          const rotatedPz = -px * Math.sin(planetRotation) + pz * Math.cos(planetRotation);

          // Back-face culling
          if (rotatedPz < -PLANET_RADIUS * 0.1) continue;

          // Calculate normal for lighting
          const normalX = rotatedPx / PLANET_RADIUS;
          const normalY = py / PLANET_RADIUS;
          const normalZ = rotatedPz / PLANET_RADIUS;

          // Lambertian lighting with cap (we shade via alpha anyway)
          const rawLighting = Math.max(0.15, normalX * LIGHT_X + normalY * LIGHT_Y + normalZ * LIGHT_Z);

          // Fade edges a bit so it feels rounded
          const edgeFactor = Math.abs(rotatedPz) / PLANET_RADIUS;  // 0 at edge, 1 at center
          const edgeFade = 0.55 + edgeFactor * 0.45;               // 0.55..1.0

          const lighting = Math.min(0.90, rawLighting) * edgeFade;

          // Normalize depth (0 = far, 1 = close)
          const zDepth = (rotatedPz + PLANET_RADIUS) / (2 * PLANET_RADIUS);

          // Convert to grid coordinates - apply aspect ratio correction to Y for circular appearance
          const gridX = Math.round(planetCenterX + rotatedPx / pixelScale);
          const gridY = Math.round(planetCenterY + (py / pixelScale) * CHAR_ASPECT_RATIO);

          if (gridX < 0 || gridX >= gridWidth || gridY < 0 || gridY >= gridHeight) continue;

          const priority = rotatedPz;
          if (priority > grid[gridY][gridX].priority) {
            grid[gridY][gridX].char = getChar(zDepth, lighting);
            grid[gridY][gridX].color = getPlanetColor(zDepth, lighting);
            grid[gridY][gridX].priority = priority;
            grid[gridY][gridX].source = 'planet';
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
          const freeFollowSpeed = 0.7 + 5.0 * freeBlend; // 0.7..5.7
          const sFree = 1 - Math.exp(-freeFollowSpeed * dt);

          snake.freePos.x += (freeXTarget - snake.freePos.x) * sFree;
          snake.freePos.y += (freeYTarget - snake.freePos.y) * sFree;
          snake.freePos.z += (freeZTarget - snake.freePos.z) * sFree;
        }

        // Final head position: smoothly blend orbital → freePos
        let headX = orbitalPos.x + (snake.freePos.x - orbitalPos.x) * freeBlend;
        let headY = orbitalPos.y + (snake.freePos.y - orbitalPos.y) * freeBlend;
        let headZ = orbitalPos.z + (snake.freePos.z - orbitalPos.z) * freeBlend;

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

      // ============== UPDATE IMPACT EFFECTS (build tint mask, do NOT overwrite grid) ==============
      const nowMs = performance.now();

      impactsRef.current = impactsRef.current.filter((impact) => {
        const elapsed = nowMs - impact.impactTime;
        if (elapsed > IMPACT_DURATION_MS) return false;

        const progress = elapsed / IMPACT_DURATION_MS; // 0..1
        impact.currentRadius = IMPACT_MAX_RADIUS * progress;
        impact.alpha = 1 - progress;

        // Grid-space radii
        const maxR = IMPACT_MAX_RADIUS / 3;  // influence radius in grid units
        const ringR = maxR * progress;       // expanding ripple radius

        // Shape controls
        const coreSigma = 2.4;               // center glow size
        const ringSigma = 1.2;               // ripple thickness
        const ringOn = smoothstep(0.08, 0.28, progress); // ring ramps in after initial hit

        const cx = impact.surfacePoint.x;
        const cy = impact.surfacePoint.y;

        // Bounding box
        const pad = 2;
        const minX = Math.max(0, Math.floor(cx - maxR - pad));
        const maxX = Math.min(gridWidth - 1, Math.ceil(cx + maxR + pad));
        const minY = Math.max(0, Math.floor(cy - maxR - pad));
        const maxY = Math.min(gridHeight - 1, Math.ceil(cy + maxR + pad));

        for (let y = minY; y <= maxY; y++) {
          // Adjust for aspect correction so mask looks circular
          const dy = (y - cy) / CHAR_ASPECT_RATIO;

          for (let x = minX; x <= maxX; x++) {
            const dx = x - cx;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > maxR) continue;

            const core = Math.exp(-(d * d) / (2 * coreSigma * coreSigma));
            const dr = d - ringR;
            const ring = Math.exp(-(dr * dr) / (2 * ringSigma * ringSigma));

            const strength = Math.min(1, core * 0.85 + ring * ringOn * 0.80);
            const a = strength * impact.alpha;

            const idx = y * gridWidth + x;
            if (a > impactTint[idx]) impactTint[idx] = a;
          }
        }

        return true;
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

      // Impact tint pass: tint existing planet glyphs (no replacement).
      const IMPACT_TINT_MAX_ALPHA = 0.75; // cap so it feels like hue shift, not recolor
      const PINK = { r: 255, g: 70, b: 190 };

      ctx.save();
      ctx.shadowColor = 'rgba(255, 70, 190, 0.25)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = `rgb(${PINK.r}, ${PINK.g}, ${PINK.b})`;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const a = impactTint[y * gridWidth + x];
          if (a <= 0.001) continue;

          const cell = grid[y][x];
          if (!cell.char) continue;

          // Only tint the planet surface
          if (cell.source !== 'planet') continue;

          ctx.globalAlpha = Math.min(1, a * IMPACT_TINT_MAX_ALPHA);
          ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
        }
      }

      ctx.restore();
      ctx.globalAlpha = 1;

      // Glow pass: only snakes get glow so dense planet regions never wash out.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
