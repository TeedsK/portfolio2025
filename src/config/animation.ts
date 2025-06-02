// src/config/animation.ts

/**
 * This file centralizes all animation timing configurations for the application,
 * making it easy to adjust the speed and feel of the visualizations.
 */

// --- CharacterStreamViz Timings (in seconds) ---
export const CHAR_FADE_IN_DURATION = 0.2;
// CHAR_SCALE_IN_DURATION is implicitly CHAR_FADE_IN_DURATION in CharacterStreamViz
export const CHAR_LINE_DRAW_DURATION = 0.2; 
export const CHAR_FADE_OUT_DELAY = 0.5;     
export const CHAR_FADE_OUT_DURATION = 0.3;
// CHAR_SCALE_OUT_DURATION is implicitly CHAR_FADE_OUT_DURATION

// --- CharacterStreamViz Box Sizing (in pixels) ---
export const CHAR_BOX_CONTENT_WIDTH = 28;   
export const CHAR_BOX_CONTENT_HEIGHT = 28;  
export const CHAR_BOX_PADDING = 8;          

// --- NetworkGraphViz Timings (in seconds) ---
// NET_WAVE_DURATION is not directly used, line animations have their own durations
export const NET_NODE_PULSE_DURATION = 0.15 * 0.8; // Example: 0.12s
export const NET_LAYER_ANIMATION_DELAY = 0.0;

// --- NetworkGraphViz Line Alphas ---
export const NET_ALPHA_PREDICTED_LINE = 1.0;          // Solid for lines to the predicted output
// For "the rest" (0-60% transparent means alpha 1.0 down to 0.4)
// Strongest "other" lines will be less transparent (closer to 1.0, but capped below NET_ALPHA_PREDICTED_LINE)
// Weakest "other" active lines will be more transparent (closer to 0.4)
export const NET_ALPHA_OTHER_ACTIVE_MIN = 0.2; // Min alpha for "other" active lines (70% transparent)
export const NET_ALPHA_OTHER_ACTIVE_MAX = 0.4; // Max alpha for "other" active lines (30% transparent) - ensures they don't hit 1.0

export const NET_ALPHA_INACTIVE_LINE = 0.2;          // Alpha for lines below activation threshold


// --- OcrOverlay Timings (in milliseconds) ---
export const TYPO_HIGHLIGHT_DELAY_MS = 50;