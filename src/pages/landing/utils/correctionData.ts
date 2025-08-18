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

export const processOcrText = (
    rawText: string,
    sourceIndex: 0 | 1
): CorrectedTextPart[] => {
    const correctionMap = sourceIndex === 0 ? correctionsSource1 : correctionsSource2;
    const wordsAndSpaces = rawText.replace(/\n/g, ' ').split(/(\s+)/);
    let idCounter = 0;

    const parts: CorrectedTextPart[] = wordsAndSpaces.map((segment) => {
        const id = `part-${sourceIndex}-${idCounter++}`;
        if (segment.match(/^\s+$/)) {
            return {
                id,
                original: segment,
                corrected: segment,
                isCorrect: true,
                isWhitespace: true,
            };
        }

        const lowerSegment = segment.toLowerCase();
        const isCorrect = !correctionMap.hasOwnProperty(lowerSegment);

        return {
            id,
            original: segment,
            corrected: isCorrect ? segment : correctionMap[lowerSegment],
            isCorrect,
            isWhitespace: false,
        };
    });

    // Special handling for "m chine" -> "machine" etc.
    if (sourceIndex === 0) {
        const newParts: CorrectedTextPart[] = [];
        for (let i = 0; i < parts.length; i++) {
            const currentPart = parts[i];
            if (currentPart.original === 'm' && parts[i + 2]?.original === 'chine') {
                newParts.push({
                    id: currentPart.id,
                    original: "m chine",
                    corrected: "machine",
                    isCorrect: false,
                    isWhitespace: false,
                });
                i += 2; // Skip the space and "chine"
            } else if (currentPart.original === 'ful' && parts[i + 2]?.original === 'stak') {
                newParts.push({
                    id: currentPart.id,
                    original: "ful stak",
                    corrected: "full-stack",
                    isCorrect: false,
                    isWhitespace: false,
                });
                i += 2;
            }
            else {
                newParts.push(currentPart);
            }
        }
        return newParts;
    }


    return parts.filter(p => p.original);
};
