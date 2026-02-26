// src/pages/landing/components/AsciiOrbitSnake/snakeRenderer.ts
// Pure rendering functions for standalone ASCII snake canvas.
// Extracted from AsciiPlanetSystem to avoid coupling / regression risk.

import { COLOR_THEMES, type ColorTheme, type GridCell } from '../AsciiPlanetSystem/types';

// Re-export for convenience
export type { GridCell, ColorTheme };

// ============== CONSTANTS ==============

export const CHAR_WIDTH = 5;
export const CHAR_HEIGHT = 8;
export const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;
export const FRAME_TIME = 33; // ~30 fps cap

export const PLANET_RADIUS = 90; // z-range reference

const DEPTH_CHARS = {
  far: ['.', ':', '\u00B7', '-', '~'],
  mid: ['*', '+', '=', 'o', 'x'],
  close: ['@', '#', '%', '&', '8', '0'],
  closest: ['@', '#', 'W', 'M', '8', 'B'],
};

const LIGHT_X = -0.408;
const LIGHT_Y = -0.572;
const LIGHT_Z = 0.408;

// ============== HELPERS ==============

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
};

export const noise1D = (t: number, seed: number): number =>
  Math.sin(t * 0.7 + seed) * 0.35 +
  Math.sin(t * 1.3 + seed * 1.7) * 0.25 +
  Math.sin(t * 2.1 + seed * 2.3) * 0.15 +
  Math.sin(t * 0.4 + seed * 0.5) * 0.25;

export const noise1DFine = (t: number, seed: number): number =>
  Math.sin(t * 3.1 + seed) * 0.1 +
  Math.sin(t * 4.7 + seed * 1.3) * 0.08;

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

const rgbaStr = (r: number, g: number, b: number, a: number): string =>
  `rgba(${r},${g},${b},${a < 1 ? (a * 1000 + 0.5 | 0) / 1000 : 1})`;

const getChar = (zDepth: number, intensity: number): string => {
  const idx = Math.max(0, Math.min(4, ((1 - intensity) * 4) | 0));
  if (zDepth < 0.35) return DEPTH_CHARS.far[idx];
  if (zDepth < 0.55) return DEPTH_CHARS.mid[idx];
  if (zDepth < 0.8) return DEPTH_CHARS.close[Math.min(idx, 5)];
  return DEPTH_CHARS.closest[Math.min(idx, 5)];
};

// ============== COLOR LUT ==============

type SnakeLUTEntry = { r: number; g: number; b: number; a: number };

export type SnakeColorTheme = ColorTheme | 'blueLight';

const generateNumericColorLUT = (theme: ColorTheme): SnakeLUTEntry[] => {
  const lut: SnakeLUTEntry[] = [];
  const { hueStart, hueEnd } = COLOR_THEMES[theme];
  const isSunset = theme === 'sunset';
  for (let z = 0; z < 20; z++) {
    for (let l = 0; l < 10; l++) {
      const normalizedZ = z / 20;
      const hue = hueStart - normalizedZ * (hueStart - hueEnd);
      const saturation = isSunset ? 75 + normalizedZ * 20 : 40 + normalizedZ * 50;
      const lightness = isSunset ? 50 + l * 3 : 45 + l * 4;
      const alpha = 0.5 + normalizedZ * 0.4;
      const [r, g, b] = hslToRgbFast(hue, saturation, lightness);
      lut.push({ r, g, b, a: alpha });
    }
  }
  return lut;
};

/** Blue variant tuned for light / white backgrounds */
const generateBlueLightLUT = (): SnakeLUTEntry[] => {
  const lut: SnakeLUTEntry[] = [];
  const hueStart = 220;
  const hueEnd = 200;
  for (let z = 0; z < 20; z++) {
    for (let l = 0; l < 10; l++) {
      const normalizedZ = z / 20;
      const hue = hueStart - normalizedZ * (hueStart - hueEnd);
      const saturation = 70 + normalizedZ * 25;
      const lightness = 32 + l * 3.5;
      const alpha = 0.65 + normalizedZ * 0.35;
      const [r, g, b] = hslToRgbFast(hue, saturation, lightness);
      lut.push({ r, g, b, a: alpha });
    }
  }
  return lut;
};

export const snakeColorLUTs: Record<SnakeColorTheme, SnakeLUTEntry[]> = {
  green: generateNumericColorLUT('green'),
  pink: generateNumericColorLUT('pink'),
  blue: generateNumericColorLUT('blue'),
  sunset: generateNumericColorLUT('sunset'),
  blueLight: generateBlueLightLUT(),
};

const GLOW_COLORS: Record<SnakeColorTheme, string> = {
  green: 'rgba(20,100,245,0.10)',
  pink: 'rgba(255,100,180,0.10)',
  blue: 'rgba(100,180,255,0.10)',
  sunset: 'rgba(244,157,77,0.10)',
  blueLight: 'rgba(30,80,200,0.12)',
};

// ============== GRID ==============

export const allocateGrid = (w: number, h: number): GridCell[][] => {
  const grid: GridCell[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      grid[y][x] = { char: '', color: '', priority: -1e9, source: null, cr: 0, cg: 0, cb: 0, ca: 0 };
    }
  }
  return grid;
};

export const resetGrid = (grid: GridCell[][], w: number, h: number): void => {
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const c = row[x];
      c.char = '';
      c.priority = -1e9;
      c.source = null;
    }
  }
};

// ============== SNAKE BODY TYPE ==============

export interface BodySegment {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
}

export interface SnakeState {
  body: BodySegment[];
  colorTheme: SnakeColorTheme;
  bodyLength: number;
  baseThickness: number;
  seed: { x: number; y: number; z: number };
  /** Free-wander smoothed position */
  freePos: { x: number; y: number; z: number };
  /** Orbit phase angle */
  orbitalPhase: number;
}

// ============== RENDER SNAKE TO GRID ==============

export const renderSnakeToGrid = (
  snake: SnakeState,
  grid: GridCell[][],
  gridW: number,
  gridH: number,
  snakeCells: { x: number; y: number }[],
  zRange: number,
): void => {
  const body = snake.body;
  const bodyLen = body.length;
  if (bodyLen < 2) return;

  // Sort segments by Z (back-to-front)
  const indices: number[] = [];
  for (let i = 0; i < bodyLen; i++) indices.push(i);
  indices.sort((a, b) => body[a].z - body[b].z);

  const invBodyLen = 1 / (bodyLen - 1);
  const invTwoPR = 1 / (2 * zRange);
  const lut = snakeColorLUTs[snake.colorTheme];

  for (let ii = 0; ii < indices.length; ii++) {
    const i = indices[ii];
    const seg = body[i];
    const bodyPos = i * invBodyLen;
    const taper = 1 - bodyPos * 0.6;

    const zNorm = (seg.z + zRange) * invTwoPR;
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
      if (py < 0 || py >= gridH) continue;
      const ny = dy * invRY;
      const ny2 = ny * ny;
      const gridRow = grid[py];

      for (let dx = -ceilRX; dx <= ceilRX; dx++) {
        const px = Math.round(seg.x + dx);
        if (px < 0 || px >= gridW) continue;

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
          cell.cr = entry.r;
          cell.cg = entry.g;
          cell.cb = entry.b;
          cell.ca = entry.a;
          cell.priority = pri;
          cell.source = 'snake';
          snakeCells.push({ x: px, y: py });
        }
      }
    }
  }
};

// ============== RENDER GRID TO CANVAS ==============

export const renderGridToCanvas = (
  ctx: CanvasRenderingContext2D,
  grid: GridCell[][],
  gridW: number,
  gridH: number,
  snakeCells: { x: number; y: number }[],
  colorTheme: SnakeColorTheme,
): void => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Main pass
  for (let y = 0; y < gridH; y++) {
    const row = grid[y];
    const py = y * CHAR_HEIGHT;
    for (let x = 0; x < gridW; x++) {
      const cell = row[x];
      if (!cell.char) continue;
      ctx.fillStyle = rgbaStr(cell.cr, cell.cg, cell.cb, cell.ca);
      ctx.fillText(cell.char, x * CHAR_WIDTH, py);
    }
  }

  // Glow pass (snake cells only)
  if (snakeCells.length > 0) {
    const glowColor = GLOW_COLORS[colorTheme] || GLOW_COLORS.blueLight;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 2;
    ctx.globalAlpha = 0.35;

    for (let i = 0; i < snakeCells.length; i++) {
      const { x, y } = snakeCells[i];
      const cell = grid[y][x];
      if (cell.source !== 'snake') continue;
      ctx.fillStyle = rgbaStr(cell.cr, cell.cg, cell.cb, cell.ca);
      ctx.fillText(cell.char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
};
