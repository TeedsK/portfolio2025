// src/ml/processing/preprocess.ts
import * as tf from '@tensorflow/tfjs';
import { log, error } from '../../utils/logger'; // Assuming logger is in utils

// Match model input dimensions
const MODEL_INPUT_WIDTH = 28;
const MODEL_INPUT_HEIGHT = 28;

/**
 * Preprocesses a character tensor (from cropped ImageData) for the EMNIST model.
 * Assumes input tensor is from tf.browser.fromPixels (0-255).
 * Output is inverted (white-on-black), resized, normalized (0-1), and batched.
 * @param charTensor Input tensor, typically [h, w, 1/3/4].
 * @returns Preprocessed tensor [1, 28, 28, 1] or null on error.
 */
export function preprocessCharacterTensor(charTensor: tf.Tensor): tf.Tensor | null {
    log('Preprocessing character tensor (INVERTED white-on-black)...');
    if (!charTensor) {
        error('Preprocessing failed: Input tensor is null.');
        return null;
    }

    try {
        return tf.tidy(() => {
            let processed = charTensor;
            // Grayscale
            if (processed.shape.length === 3 && processed.shape[2] === 3) { // RGB
                processed = processed.mean(2, true);
            } else if (processed.shape.length === 3 && processed.shape[2] === 4) { // RGBA
                processed = processed.slice([0, 0, 0], [-1, -1, 3]).mean(2, true);
            } else if (!(processed.shape.length === 3 && processed.shape[2] === 1) && !(processed.shape.length === 2)) { // Grayscale or already 2D
                // Allow 2D input case (e.g., if fromPixels was called with 1 channel)
                if (processed.shape.length !== 2) {
                    error(`Unexpected shape for grayscale conversion: ${processed.shape}`);
                    throw new Error('Input tensor must be 2D, or 3D with 1, 3 or 4 channels');
                } else {
                    // Reshape 2D [h, w] to 3D [h, w, 1] if needed by later steps
                    processed = processed.expandDims(2);
                }
            }

            // Ensure it's float for division
            processed = processed.toFloat();

            // Normalize 0-255 -> 0-1
            processed = processed.div(tf.scalar(255));

            // Invert (white character, black background)
            processed = tf.scalar(1.0).sub(processed);

            // Resize
            const resizedTensor = tf.image.resizeBilinear(processed as tf.Tensor3D, [MODEL_INPUT_HEIGHT, MODEL_INPUT_WIDTH]);

            // Add batch dimension: [H, W, C] -> [1, H, W, C]
            const batchedTensor = resizedTensor.expandDims(0);

            log('Character preprocessing complete (Inverted). Output shape:', batchedTensor.shape);
            return batchedTensor;
        });
    } catch (err) {
        error('Error during character preprocessing:', err);
        // Consider re-throwing or returning null based on desired handling in caller
        // setErrorState('Failed to preprocess character.'); // Cannot set state from here
        return null;
    }
}