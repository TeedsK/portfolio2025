// src/config/animation.ts

/**
 * This file centralizes all animation timing configurations for the application,
 * making it easy to adjust the speed and feel of the visualizations.
 */

// --- CharacterStreamViz Timings (in seconds) ---
export const CHAR_FADE_IN_DURATION = 0.1;
export const CHAR_SCALE_IN_DURATION = 0.1;
export const CHAR_LINE_DRAW_DURATION = 0.1; // Duration per line segment
export const CHAR_FADE_OUT_DELAY = 0.5;     // Wait time after line is drawn before fading
export const CHAR_FADE_OUT_DURATION = 0.3;
export const CHAR_SCALE_OUT_DURATION = 0.3;

// --- NetworkGraphViz Timings (in seconds) ---
export const NET_WAVE_DURATION = 0.15;
export const NET_NODE_PULSE_DURATION = NET_WAVE_DURATION * 0.8;
export const NET_CENTRAL_LINE_DURATION = 0.25;
export const NET_LAYER_ANIMATION_DELAY = 0.07;

// --- OcrOverlay Timings (in milliseconds) ---
export const TYPO_HIGHLIGHT_DELAY_MS = 50;