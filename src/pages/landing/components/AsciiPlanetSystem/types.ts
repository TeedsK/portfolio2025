// src/pages/landing/components/AsciiPlanetSystem/types.ts

import { Point3D } from '../../../../types';

export type ColorTheme = 'green' | 'pink' | 'blue';

export interface BodySegment {
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
}

export interface Snake {
  id: string;
  body: BodySegment[];
  colorTheme: ColorTheme;
  orbitalInclination: number;  // radians, tilt of orbital plane
  orbitalPhase: number;        // current position on orbit (0 to 2π)
  orbitSpeed: number;          // radians per second
  orbitDirection: 1 | -1;      // clockwise or counter-clockwise
  bodyLength: number;
  baseThickness: number;
  seed: { x: number; y: number; z: number };
}

export interface ImpactEffect {
  id: string;
  surfacePoint: Point3D;       // 3D position on planet surface
  currentRadius: number;       // expands from 0 to ~80px
  alpha: number;               // fades from 1.0 to 0.0
  impactTime: number;          // performance.now() when impact started
  hue?: 'blue' | 'pink';       // hue overlay key for the ripple
}

export interface GridCell {
  char: string;
  color: string;
  priority: number;  // z-depth for painter's algorithm
  source: 'planet' | 'snake' | 'impact' | null;
  // Numeric RGBA for fast per-pixel math (avoids string alloc/parsing in hot loop)
  cr: number;
  cg: number;
  cb: number;
  ca: number;
}

// Planet surface point for rendering
export interface PlanetPoint {
  x: number;       // screen x
  y: number;       // screen y
  z: number;       // depth (for sorting)
  char: string;    // ASCII character
  color: string;   // HSL color string
}

// Renderable item for unified depth sorting
export interface Renderable {
  type: 'planet' | 'snake' | 'impact';
  x: number;
  y: number;
  z: number;       // depth for sorting (higher = closer)
  char: string;
  color: string;
}

// Color theme configurations
export interface ThemeConfig {
  hueStart: number;
  hueEnd: number;
  glowColor: string;
}

export const COLOR_THEMES: Record<ColorTheme, ThemeConfig> = {
  green: { hueStart: 225, hueEnd: 215, glowColor: 'rgba(20, 100, 245,' },
  pink: { hueStart: 330, hueEnd: 300, glowColor: 'rgba(255, 100, 180,' },
  blue: { hueStart: 220, hueEnd: 200, glowColor: 'rgba(100, 180, 255,' },
};

// Planet color theme (blue) - keep saturation high to avoid white appearance
export const PLANET_THEME = {
  hueStart: 220,  // Deep blue (far)
  hueEnd: 200,    // Lighter blue (close)
  saturationMin: 70,   // Increased from 60 - keeps color from washing out
  saturationMax: 90,   // Increased from 85 - vivid color at close depths
  lightnessMin: 20,    // Slightly lower for better depth contrast
  lightnessMax: 55,    // Range for lighting variation
};
