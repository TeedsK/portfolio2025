// src/pages/landing/utils/correctionData.ts

export interface CorrectedTextPart {
    id: string;
    original: string;
    corrected: string;
    isCorrect: boolean;
    isWhitespace: boolean;
}

const correctionsSource1: Record<string, string> = {
    "m chine": "machine",
    lurning: "learning",
    ful: "full",
    stak: "-stack",
    engyneir: "engineer",
    huilding: "building",
    touls: "tools",
    appls: "apps",
    deliverr: "deliver",
    measvruble: "measurable",
    impaj: "impact", // This will be handled as a special case to combine with the previous word
};

const correctionsSource2: Record<string, string> = {
    helo: "hello",
    wellcomm: "welcome,",
    amm: "am,",
};

/**
 * Tokenize while preserving both spaces and explicit newlines, so pre- and post-typo
 * line breaks remain identical in the UI.
 */
function tokenizePreservingNewlines(rawText: string): string[] {
    const out: string[] = [];
    const lines = rawText.split('\n');
    lines.forEach((line, idx) => {
        // Split spaces but keep them as separate tokens
        const pieces = line.split(/(\s+)/).filter(p => p.length > 0);
        out.push(...pieces);
        if (idx < lines.length - 1) out.push('\n'); // explicit newline token
    });
    return out;
}

export const processOcrText = (
    rawText: string,
    sourceIndex: 0 | 1
): CorrectedTextPart[] => {
    const correctionMap = sourceIndex === 0 ? correctionsSource1 : correctionsSource2;

    // Keep spaces and newlines as tokens so layout stays consistent across phases
    const tokens = tokenizePreservingNewlines(rawText);
    let idCounter = 0;

    const parts: CorrectedTextPart[] = tokens.map((segment) => {
        const id = `part-${sourceIndex}-${idCounter++}`;

        // treat any whitespace (including '\n') as whitespace tokens
        if (segment.match(/^\s+$/) || segment === '\n') {
            return {
                id,
                original: segment,
                corrected: segment,
                isCorrect: true,
                isWhitespace: true,
            };
        }

        const lowerSegment = segment.toLowerCase();
        const isCorrect = !Object.prototype.hasOwnProperty.call(correctionMap, lowerSegment);

        return {
            id,
            original: segment,
            corrected: isCorrect ? segment : correctionMap[lowerSegment],
            isCorrect,
            isWhitespace: false,
        };
    });

    // Special handling for "m chine" -> "machine" and "ful stak" -> "full-stack"
    if (sourceIndex === 0) {
        const newParts: CorrectedTextPart[] = [];
        for (let i = 0; i < parts.length; i++) {
            const currentPart = parts[i];

            // Helper: is a pure SPACE (not newline) whitespace token
            const isSpaceOnly = (p?: CorrectedTextPart) =>
                !!p && p.isWhitespace && p.original.trim() === '' && !p.original.includes('\n');

            if (
                currentPart.original === 'm' &&
                isSpaceOnly(parts[i + 1]) &&
                parts[i + 2]?.original === 'chine'
            ) {
                newParts.push({
                    id: currentPart.id,
                    original: "m chine",
                    corrected: "machine",
                    isCorrect: false,
                    isWhitespace: false,
                });
                i += 2; // Skip the space and "chine"
            } else if (
                currentPart.original === 'ful' &&
                isSpaceOnly(parts[i + 1]) &&
                parts[i + 2]?.original === 'stak'
            ) {
                newParts.push({
                    id: currentPart.id,
                    original: "ful stak",
                    corrected: "full-stack",
                    isCorrect: false,
                    isWhitespace: false,
                });
                i += 2; // Skip the space and "stak"
            } else {
                newParts.push(currentPart);
            }
        }
        return newParts;
    }

    return parts;
};

