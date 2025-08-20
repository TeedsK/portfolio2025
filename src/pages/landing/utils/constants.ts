// src/pages/landing/utils/constants.ts
export const CHAR_BOX_CONTENT_WIDTH = 18;   // smaller characters
export const CHAR_BOX_CONTENT_HEIGHT = 18;  // smaller characters
export const CHAR_BOX_PADDING = 3;          // tighter box

// If your CharacterStreamViz uses these, lines will be thinner
export const STREAM_LINE_WIDTH = 1;         // was larger before
export const STREAM_GLOW_WIDTH = 1.5;       // subtle glow if used

export const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
export const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
export const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
export const FINAL_LAYER_NAME = 'dense_1';
export const TYPO_API_URL = 'http://localhost:5001/api/check_typos';

// ⬇️ Start OCR exactly 500 ms after the respective video starts
export const OCR_START_DELAY_MS = 500;

// How long to wait between characters
export const OCR_PROCESSING_DELAY_MS = 150;

// New Gradient Sets for specific OCR sources
export const TEXT_SCREENSHOT_GRADIENTS: string[][] = [
    ['#5a10b5', '#5a10b5'], // Original Set 1: Blue to Purple
    ['#227de6', '#227de6'], // Original Set 2: Pink to Cyan
    ['#12dea7', '#12dea7'], // Purple to Dark Purple
    ['#d40b8a', '#d40b8a']
];

export const HELLO_WELCOME_GRADIENTS: string[][] = [
    ['#7020e8', '#7020e8'], // Orange to Yellow
    ['#227de6', '#227de6'], // Original Set 2: Pink to Cyan
    ['#12dea7', '#12dea7'],  // Purple to Dark Purple
    ['#d40b8a', '#d40b8a']
];

// Fallback if needed, or can be removed if new ones cover all cases.
export const LINE_GRADIENT_SETS: string[][] = [
    ...TEXT_SCREENSHOT_GRADIENTS,
    ...HELLO_WELCOME_GRADIENTS
];

export const OCR_OVERLAY_FONT_SIZE = 30;
export const OCR_OVERLAY_TEXT_COLOR_NORMAL = 'rgba(50, 50, 50, 0.95)';
export const OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR = 'rgba(255, 255, 255, 0.0)';

export const STATUS_TEXTS = [
    'Writing text...', 
    'Predicting handwriting...',
    'Checking typos...'
];

export const getTagColorForProbability = (probability: number): string => {
    const percent = probability * 100;
    if (percent > 80) return 'green';
    if (percent > 60) return 'gold';
    if (percent > 40) return 'orange';
    if (percent > 20) return 'volcano';
    if (percent > 0) return 'red';
    return 'default';
};

/** ========= Media crop (visual + OCR) =========
 * Crop off 5px from the top and bottom of source images/videos to hide black lines.
 * This value is used both in CSS (visual) and in pixel-space OCR preprocessing.
 */
export const MEDIA_CROP_TOP_PX = 5;
export const MEDIA_CROP_BOTTOM_PX = 5;
