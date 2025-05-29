// src/config/animation.ts

/**
 * This file centralizes all animation timing configurations for the application,
 * making it easy to adjust the speed and feel of the visualizations.
 */

// --- CharacterStreamViz Timings (in seconds) ---
export const CHAR_FADE_IN_DURATION = 0.2;
export const CHAR_SCALE_IN_DURATION = 0.2; 
export const CHAR_LINE_DRAW_DURATION = 0.2; 
export const CHAR_FADE_OUT_DELAY = 0.5;     
export const CHAR_FADE_OUT_DURATION = 0.3;
export const CHAR_SCALE_OUT_DURATION = 0.3; 

// --- CharacterStreamViz Box Sizing (in pixels) ---
export const CHAR_BOX_CONTENT_WIDTH = 28;   
export const CHAR_BOX_CONTENT_HEIGHT = 28;  
export const CHAR_BOX_PADDING = 8;          

// --- CharacterStreamViz Pulse Animation (REMOVED) ---
// export const PULSE_LENGTH_RATIO = 0.25; 
// export const PULSE_ANIMATION_DURATION = 1.0; 
// export const PULSE_COLOR = 'rgba(255, 255, 255, 0.5)'; 

// --- NetworkGraphViz Timings (in seconds) ---
export const NET_WAVE_DURATION = 0.15;
export const NET_NODE_PULSE_DURATION = NET_WAVE_DURATION * 0.8;
export const NET_CENTRAL_LINE_DURATION = 0.25;
export const NET_LAYER_ANIMATION_DELAY = 0.07;

// --- OcrOverlay Timings (in milliseconds) ---
export const TYPO_HIGHLIGHT_DELAY_MS = 50;