// src/utils/logger.ts

/* eslint-disable no-console */

const LOG_PREFIX = '[Portfolio2025]';

/**
 * Logs a standard message to the console.
 * @param message - The primary message to log.
 * @param optionalParams - Additional data to log.
 */
export const log = (message: string, ...optionalParams: unknown[]): void => {
    console.log(`${LOG_PREFIX} INFO: ${message}`, ...optionalParams);
};

/**
 * Logs a warning message to the console.
 * @param message - The warning message.
 * @param optionalParams - Additional data to log.
 */
export const warn = (message: string, ...optionalParams: unknown[]): void => {
    console.warn(`${LOG_PREFIX} WARN: ${message}`, ...optionalParams);
};

/**
 * Logs an error message and optionally an error object to the console.
 * Includes context and stack trace if available.
 * @param message - The error description.
 * @param errorContext - An Error object or any contextual data.
 */
export const error = (message: string, errorContext?: unknown): void => {
    console.error(`${LOG_PREFIX} ERROR: ${message}`);
    if (errorContext) {
        if (errorContext instanceof Error) {
            console.error('  Context:', errorContext.message);
            if (errorContext.stack) {
                console.error('  Stack:', errorContext.stack);
            }
        } else {
            console.error('  Context:', errorContext);
        }
    }
};

/* eslint-enable no-console */

// TODO: Enhance logger later if needed (e.g., different levels, conditional logging based on environment)