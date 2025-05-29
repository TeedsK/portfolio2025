// src/config/animation.ts

/**
 * This file centralizes all animation timing configurations for the application,
 * making it easy to adjust the speed and feel of the visualizations.
 */

// --- CharacterStreamViz Timings (in seconds) ---
export const CHAR_FADE_IN_DURATION = 0.2;
export const CHAR_SCALE_IN_DURATION = 0.2; // Note: CHAR_FADE_IN_DURATION is used for scale in GSAP
export const CHAR_LINE_DRAW_DURATION = 0.2; // Duration per line segment
export const CHAR_FADE_OUT_DELAY = 0.5;     // Wait time after line is drawn before fading
export const CHAR_FADE_OUT_DURATION = 0.3;
export const CHAR_SCALE_OUT_DURATION = 0.3; // Note: CHAR_FADE_OUT_DURATION is used for scale out GSAP

// --- CharacterStreamViz Box Sizing (in pixels) ---
export const CHAR_BOX_CONTENT_WIDTH = 28;   // Standard width for the character image area
export const CHAR_BOX_CONTENT_HEIGHT = 28;  // Standard height for the character image area
export const CHAR_BOX_PADDING = 8;          // Padding around the content area

// --- NetworkGraphViz Timings (in seconds) ---
export const NET_WAVE_DURATION = 0.9;
export const NET_NODE_PULSE_DURATION = NET_WAVE_DURATION * 0.8;
export const NET_CENTRAL_LINE_DURATION = 0.25;
export const NET_LAYER_ANIMATION_DELAY = 0.07;

// --- OcrOverlay Timings (in milliseconds) ---
export const TYPO_HIGHLIGHT_DELAY_MS = 50;