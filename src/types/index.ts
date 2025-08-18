// src/types/index.ts
import React from 'react';
import { PathManager } from '../pages/landing/utils/path';

export interface Point {
    x: number;
    y: number;
}

/**
 * Type for activation data extracted from tensors.
 * Allows for scalars (number) and nested arrays up to 4 dimensions.
 */
export type ActivationDataValue = number | number[] | number[][] | number[][][] | number[][][][];

/**
 * Structure for storing activation data, keyed by layer name.
 */
export type ActivationData = Record<string, ActivationDataValue>;

/**
 * Structure for storing extracted weights (example for Conv2D).
 */
export interface Conv2DWeights {
    kernel: number[][][][]; // [h, w, in_channels, out_channels]
    bias: number[];         // [out_channels]
}

/**
 * Represents the bounding box data for a detected character.
 */
export type BoundingBoxData = [number, number, number, number]; // x, y, w, h

/**
 * Represents an item detected by segmentation - either a character box or a space (null).
 */
export type ProcessableBox = BoundingBoxData | null;

/**
 * Represents a single line of detected items (characters and spaces).
 */
export type ProcessableLine = ProcessableBox[];

/**
 * Structure for storing all extracted model weights, keyed by layer name.
 */
export type ModelWeights = Record<string, Conv2DWeights>;

// --- New Types for Typo Correction Backend ---
export interface TagProbabilities {
    [tag: string]: number;
}

export interface TokenTypoDetail {
    token: string;
    pred_tag: string;
    top_probs: TagProbabilities;
}

export interface TypoCorrectionResponse {
    original_sentence: string;
    corrected_sentence: string;
    token_details: TokenTypoDetail[];
    model_name: string;
    processing_time_ms: number;
    corrections_made: boolean;
    message: string;
}

export interface DisplayTextPart {
    text: string;
    isWhitespace: boolean;
    isFlagged: boolean;
    originalToken?: string;
    predictions?: TagProbabilities;
    predictedTag?: string;
}

export interface OcrDisplayLinePart {
    id: string;
    text: string;
    isWhitespace: boolean;
    isFlagged?: boolean;
    ref: React.RefObject<HTMLSpanElement>;
}

export interface OcrDisplayLine {
    id: string;
    textDuringOcr: string;
    parts: OcrDisplayLinePart[];
    y: number;
}

/**
 * Represents a character being animated in the stream visualization.
 */
export interface StreamCharacter {
    id: string;
    charImage: ImageData;
    startX: number;
    startY: number;
    path: PathManager; 
    animationState: 'appearing' | 'traveling' | 'fading' | 'finished';
    alpha: number;
    scale: number;
    gradientSet: string[]; 
    
    headProgress: number; 
    tailProgress: number; 
    
    isRetractingColorOverride: boolean; 
    onFinished: () => void;
}

export interface AnimationWave {
    id: string;
    activations: ActivationData;
    softmaxProbabilities: number[];
    gradientSet: string[];
}

/**
 * NEW: A recognized character (for placing under the scanned bounding box).
 */
export interface RecognizedCharResult {
    id: string;
    box: BoundingBoxData;   // original image coords
    char: string;           // predicted letter
}
