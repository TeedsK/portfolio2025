// src/constants.ts

export const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
export const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
export const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
export const FINAL_LAYER_NAME = 'dense_1';
export const TYPO_API_URL = 'http://localhost:5001/api/check_typos';

export const ANIMATION_COLOR_PALETTE = ['#456cff', '#34D399', '#F59E0B', '#EC4899', '#8B5CF6']; // For Network Graph Waves

// New Gradient Sets for Character Lines and Outlines
export const LINE_GRADIENT_SETS: string[][] = [
    ['#4568DC', '#B06AB3'],                          // Set 1: Blue to Purple
    ['#9CECFB', '#65C7F7', '#0052D4'],              // Set 2: Light Blue to Dark Blue
    ['#3494E6', '#EC6EAD'],                          // Set 3: Blue to Pink
    ['#A770EF', '#CF8BF3', '#FDB99B'],              // Set 4: Purple to Pink to Orange
    ['#38ef7d', '#11998e'],                          // Set 5: Green to Teal (Example)
    ['#FFD700', '#FF8C00', '#FF0000'],              // Set 6: Gold to Orange to Red (Example)
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