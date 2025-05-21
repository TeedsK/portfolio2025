// src/types/index.ts

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
export type ModelWeights = Record<string, Conv2DWeights /* | DenseWeights | ... */ >;

// --- New Types for Typo Correction Backend ---

/**
 * Represents the probability distribution for a single token's predicted tags.
 * Key is the tag name (e.g., "KEEP", "DELETE", "REPLACE_word"), value is the probability.
 */
export interface TagProbabilities {
    [tag: string]: number;
}

/**
 * Represents the detailed information for a single token from the typo correction backend.
 */
export interface TokenTypoDetail {
    token: string;         // The original token
    pred_tag: string;      // The predicted tag (e.g., "KEEP", "DELETE", "REPLACE_correctedword")
    top_probs: TagProbabilities; // Top-k predicted tags and their probabilities
}

/**
 * Represents the overall response from the typo correction backend.
 */
export interface TypoCorrectionResponse {
    original_sentence: string;
    corrected_sentence: string;
    token_details: TokenTypoDetail[];
    model_name: string;
    processing_time_ms: number;
    corrections_made: boolean;
    message: string;
}

/**
 * Represents a part of the text to be displayed, including correction info for popovers.
 * This will be used to render the sentence with popovers on flagged words.
 */
export interface DisplayTextPart {
    text: string;          // The word or whitespace to display
    isWhitespace: boolean;
    isFlagged: boolean;    // True if the original token was changed or flagged by the model
    originalToken?: string; // The original token if different from displayed text or if flagged
    predictions?: TagProbabilities; // Predictions to show in the popover
    predictedTag?: string; // The primary predicted tag for this token
}