// src/pages/landing/components/AsciiPlanetSystem/index.tsx
// ASCII 3D Planet with orbiting snake "rings" that detach on scroll

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { ScanBeam, Point3D } from '../../../../types';
import {
  Snake,
  ImpactEffect,
  GridCell,
  COLOR_THEMES,
  PLANET_THEME,
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

// ============== HELPER FUNCTIONS ==============

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

// Get planet surface color (blue theme) - similar approach to snake colors
const getPlanetColor = (zDepth: number, lighting: number): string => {
  const { hueStart, hueEnd, saturationMin, saturationMax, lightnessMin, lightnessMax } = PLANET_THEME;
  const hue = hueStart - zDepth * (hueStart - hueEnd);
  // Keep saturation high to maintain color (not white)
  const saturation = saturationMin + zDepth * (saturationMax - saturationMin);
  // Lightness varies with lighting but stays in a tighter range
  const lightness = lightnessMin + lighting * (lightnessMax - lightnessMin);
  // Alpha based on depth like snakes (0.5 to 0.85)
  const alpha = 0.5 + zDepth * 0.35;
  return `hsla(${hue | 0}, ${saturation | 0}%, ${lightness | 0}%, ${alpha.toFixed(2)})`;
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

// rotateY currently unused but keeping for future use
// const rotateY = (p: Point3D, angle: number): Point3D => {
//   const cos = Math.cos(angle);
//   const sin = Math.sin(angle);
//   return {
//     x: p.x * cos + p.z * sin,
//     y: p.y,
//     z: -p.x * sin + p.z * cos,
//   };
// };

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

  // Impact effects
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

  // Snakes can roam the full canvas area
  const centerX = useMemo(() => gridWidth / 2, [gridWidth]);
  const centerY = useMemo(() => gridHeight / 2, [gridHeight]);

  // Get or reset grid buffer
  const getGrid = useCallback((w: number, h: number): GridCell[][] => {
    if (!gridRef.current || gridDimsRef.current.width !== w || gridDimsRef.current.height !== h) {
      const grid: GridCell[][] = [];
      for (let y = 0; y < h; y++) {
        grid[y] = [];
        for (let x = 0; x < w; x++) {
          grid[y][x] = { char: '', color: '', priority: -1e9 };
        }
      }
      gridRef.current = grid;
      gridDimsRef.current = { width: w, height: h };
    } else {
      const grid = gridRef.current;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          grid[y][x].char = '';
          grid[y][x].priority = -1e9;
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

  // Detect new beam arrivals for impact effects
  useEffect(() => {
    const currentIds = new Set(activeBeams.map(b => b.id));
    const previousIds = lastBeamIdsRef.current;

    // Find beams that just completed (were in previous, not in current, or headProgress >= 1)
    activeBeams.forEach(beam => {
      if (beam.headProgress >= 0.95 && !previousIds.has(beam.id + '-impacted')) {
        // Create impact at planet center (the beam target)
        const impact: ImpactEffect = {
          id: `impact-${Date.now()}-${Math.random()}`,
          surfacePoint: { x: planetCenterX, y: planetCenterY, z: PLANET_RADIUS * 0.8 },
          currentRadius: 0,
          alpha: 1,
          impactTime: performance.now(),
        };
        impactsRef.current.push(impact);
        lastBeamIdsRef.current.add(beam.id + '-impacted');
        onBeamImpact?.(impact.surfacePoint);
      }
    });

    // Clean up old beam IDs
    previousIds.forEach(id => {
      if (!currentIds.has(id.replace('-impacted', ''))) {
        previousIds.delete(id);
      }
    });

    lastBeamIdsRef.current = currentIds;
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

      // Update planet rotation
      planetRotationRef.current += PLANET_ROTATION_SPEED * dt;

      // Calculate orbital vs free-roaming influence
      // scrollProgress 0-0.3 transitions from orbital to free
      const orbitInfluence = 1 - Math.min(1, scrollProgress / 0.3);

      // Get grid buffer
      const grid = getGrid(gridWidth, gridHeight);

      // ============== RENDER PLANET ==============
      const planetRotation = planetRotationRef.current;

      // Pixel-to-grid scaling factor
      const pixelScale = 3;

      // Sample planet surface points - render at planet center position
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

          // Lambertian lighting
          const lighting = Math.max(0.15, normalX * LIGHT_X + normalY * LIGHT_Y + normalZ * LIGHT_Z);

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
          }
        }
      }

      // ============== UPDATE AND RENDER SNAKES ==============
      snakesRef.current.forEach(snake => {
        // Update orbital phase
        snake.orbitalPhase += snake.orbitSpeed * snake.orbitDirection * dt;

        let headX: number, headY: number, headZ: number;

        if (orbitInfluence > 0.95) {
          // Pure orbital mode - orbit around planet center
          const pos = getOrbitalPosition(
            snake.orbitalPhase,
            ORBIT_RADIUS / 3,  // Scale for grid coordinates
            snake.orbitalInclination,
            planetCenterX,
            planetCenterY,
          );
          headX = pos.x;
          headY = pos.y;
          headZ = pos.z;
        } else if (orbitInfluence < 0.05) {
          // Pure free-roaming mode - roam full canvas
          const noiseX = noise1D(t * 0.45, snake.seed.x) + noise1DFine(t * 0.8, snake.seed.x);
          const noiseY = noise1D(t * 0.35, snake.seed.y) + noise1DFine(t * 0.7, snake.seed.y);
          const noiseZ = noise1D(t * 0.2, snake.seed.z) + noise1DFine(t * 0.4, snake.seed.z);

          const margin = snake.baseThickness * 4;
          headX = margin + (gridWidth - margin * 2) * ((noiseX) * 0.5 + 0.5);
          headY = margin + (gridHeight - margin * 2) * ((noiseY) * 0.5 + 0.5);
          headZ = -PLANET_RADIUS + (2 * PLANET_RADIUS) * ((noiseZ) * 0.5 + 0.5);
        } else {
          // Blended transition - orbit around planet, then roam full canvas
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
              }
            }
          }
        }
      });

      // ============== UPDATE AND RENDER IMPACT EFFECTS ==============
      const nowMs = performance.now();
      impactsRef.current = impactsRef.current.filter(impact => {
        const elapsed = nowMs - impact.impactTime;
        if (elapsed > IMPACT_DURATION_MS) return false;

        const progress = elapsed / IMPACT_DURATION_MS;
        impact.currentRadius = IMPACT_MAX_RADIUS * progress;
        impact.alpha = 1 - progress;

        // Render expanding ring on planet surface (at planet center)
        const ringRadius = impact.currentRadius / 3;  // Scale for grid
        const ringThickness = 2;

        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
          for (let r = ringRadius - ringThickness; r <= ringRadius + ringThickness; r++) {
            const rx = Math.cos(angle) * r;
            const ry = Math.sin(angle) * r;

            const gx = Math.round(planetCenterX + rx);
            // Apply aspect ratio correction for circular ring
            const gy = Math.round(planetCenterY + ry * CHAR_ASPECT_RATIO);

            if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) continue;

            // Impact renders on top of planet
            const pri = PLANET_RADIUS + 10;
            if (pri > grid[gy][gx].priority) {
              // Calculate intensity based on distance from ring center (like snake lighting)
              const intensity = 1 - Math.abs(r - ringRadius) / ringThickness;
              const fadeAlpha = impact.alpha * intensity;

              // Use depth-based character like snakes do (intensity as "lighting")
              const zDepth = 0.7 + intensity * 0.3;  // Closer = more intense
              const char = getChar(zDepth, intensity);

              // Pink color with proper alpha (like snake color approach)
              const hue = 330;  // Pink
              const saturation = 60 + intensity * 30;
              const lightness = 50 + intensity * 20;
              const color = `hsla(${hue}, ${saturation | 0}%, ${lightness | 0}%, ${fadeAlpha.toFixed(2)})`;

              grid[gy][gx].char = char;
              grid[gy][gx].color = color;
              grid[gy][gx].priority = pri;
            }
          }
        }

        return true;
      });

      // ============== RENDER TO CANVAS ==============
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set glow effect
      ctx.shadowColor = 'rgba(100, 180, 255, 0.2)';
      ctx.shadowBlur = 4;

      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          const cell = grid[y][x];
          if (cell.char) {
            ctx.fillStyle = cell.color;
            ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
          }
        }
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [width, height, gridWidth, gridHeight, centerX, centerY, planetCenterX, planetCenterY, scrollProgress, getGrid, onBeamImpact]);

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
