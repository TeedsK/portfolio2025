// src/types/index.ts
import React from 'react';
import { PathManager } from '../pages/landing/utils/path';

export interface Point {
    x: number;
    y: number;
}

export type ActivationDataValue = number | number[] | number[][] | number[][][] | number[][][][];
export type ActivationData = Record<string, ActivationDataValue>;

export interface Conv2DWeights {
    kernel: number[][][][]; // [h, w, in_channels, out_channels]
    bias: number[];         // [out_channels]
}

export type BoundingBoxData = [number, number, number, number]; // x, y, w, h
export type ProcessableBox = BoundingBoxData | null;
export type ProcessableLine = ProcessableBox[];

export type ModelWeights = Record<string, Conv2DWeights>;

export interface TagProbabilities { [tag: string]: number; }
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

/** Legacy stream character (not used in new flow, kept for compatibility) */
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

/** Beam used by ScanBeamViz in viewport pixels */
// ...
export interface ScanBeam {
    id: string;
    path: PathManager;
    gradientSet: string[];
    headProgress: number;
    tailProgress: number;
    alpha: number;
    onFinished?: () => void;

    /** NEW: document-anchored points so we can rebuild a scroll-safe path each frame */
    docOrigin?: Point;
    docElbow?: Point;
    docTarget?: Point;
    /** NEW: rounded corner radius for this path */
    arcRadius?: number;
}


/** A recognized character (for placing under the scanned bounding box). */
export interface RecognizedCharResult {
    id: string;
    box: BoundingBoxData;   // original image coords
    char: string;           // predicted letter
}

