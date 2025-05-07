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