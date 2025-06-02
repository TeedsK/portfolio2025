// src/constants.ts

export const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
export const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');

export const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
export const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
export const FINAL_LAYER_NAME = 'dense_1';
export const TYPO_API_URL = 'http://localhost:5001/api/check_typos';

// New Gradient Sets for Character Lines and Outlines
export const LINE_GRADIENT_SETS: string[][] = [
    ['#4568DC', '#B06AB3'],                          // Set 1: Blue to Purplech
    ['#ef32d9', '#89fffd']
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