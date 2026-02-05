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
export const CHAR_BOX_CONTENT_WIDTH = 18;   
export const CHAR_BOX_CONTENT_HEIGHT = 18;  
export const CHAR_BOX_PADDING = 3;          

// --- NetworkGraphViz Timings (in seconds) ---
// NET_WAVE_DURATION is not directly used, line animations have their own durations
export const NET_NODE_PULSE_DURATION = 0.15 * 0.8; // Example: 0.12s
export const NET_LAYER_ANIMATION_DELAY = 0.0;

// --- NetworkGraphViz Line Alphas ---
export const NET_ALPHA_PREDICTED_LINE = 1.0;          // Solid for lines to the predicted output
// For "the rest" (0-60% transparent means alpha 1.0 down to 0.4)
// Strongest "other" lines will be less transparent (closer to 1.0, but capped below NET_ALPHA_PREDICTED_LINE)
// Weakest "other" active lines will be more transparent (closer to 0.4)
export const NET_ALPHA_OTHER_ACTIVE_MIN = 0.0; // Min alpha for "other" active lines (70% transparent)
export const NET_ALPHA_OTHER_ACTIVE_MAX = 1.0; // Max alpha for "other" active lines (30% transparent) - ensures they don't hit 1.0

export const NET_ALPHA_INACTIVE_LINE = 1.0;          // Alpha for lines below activation threshold

// --- NetworkGraphViz3D Tunable Parameters ---
// Adjust these to control how busy/sparse the visualization looks

// Activation threshold: nodes with activation below this won't show animated connections
// Higher = fewer connections shown = less busy. Range: 0.0 to 1.0
export const NET_ACTIVATION_THRESHOLD = 0.9;

// Skeleton line alpha: opacity of the static grey connection lines
// Lower = more subtle/faint lines. Range: 0.0 to 1.0
export const NET_SKELETON_LINE_ALPHA = 0.00;


// --- OcrOverlay Timings (in milliseconds) ---
export const TYPO_HIGHLIGHT_DELAY_MS = 50;