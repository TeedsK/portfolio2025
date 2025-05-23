// src/hooks/useTypoCorrection.ts
import React, { useState } from 'react';
import { log, warn, error } from '../utils/logger';
import {
    DisplayTextPart,
    TypoCorrectionResponse,
    TokenTypoDetail,
    OcrDisplayLine,
    OcrDisplayLinePart,
} from '../types';

const TYPO_API_URL = 'http://localhost:5001/api/check_typos';

/** Options for the useTypoCorrection hook */
export interface UseTypoCorrectionOptions {
    setOcrDisplayLines: React.Dispatch<React.SetStateAction<OcrDisplayLine[]>>;
    setIsShowingTypoHighlights: React.Dispatch<React.SetStateAction<boolean>>;
    setCurrentAppPhase: React.Dispatch<React.SetStateAction<number>>;
    setErrorState: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Hook encapsulating the typo correction API logic and related state.
 */
export const useTypoCorrection = ({
    setOcrDisplayLines,
    setIsShowingTypoHighlights,
    setCurrentAppPhase,
    setErrorState,
}: UseTypoCorrectionOptions) => {
    const [interactiveOcrParts, setInteractiveOcrParts] = useState<DisplayTextPart[]>([]);
    const [backendCorrectedSentence, setBackendCorrectedSentence] = useState<string>('');
    const [isTypoCheckingAPILoading, setIsTypoCheckingAPILoading] = useState<boolean>(false);

    const resetTypoData = () => {
        setInteractiveOcrParts([]);
        setBackendCorrectedSentence('');
    };

    const triggerTypoCorrection = async (textToCorrect: string, ocrDisplayLines: OcrDisplayLine[]) => {
        if (!textToCorrect.trim()) return;

        log('Sending to typo correction API:', textToCorrect);
        setIsTypoCheckingAPILoading(true);
        setErrorState(null);
        setInteractiveOcrParts([]);
        setBackendCorrectedSentence('');

        try {
            const response = await fetch(TYPO_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sentence: textToCorrect, top_k: 3 }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ message: 'Unknown API error' }));
                throw new Error(`API Error (${response.status}): ${errData.error || errData.message}`);
            }

            const result = (await response.json()) as TypoCorrectionResponse;
            log('Typo API response:', result);
            setBackendCorrectedSentence(result.corrected_sentence);

            // Build parts for popovers
            const popoverInteractiveParts: DisplayTextPart[] = [];
            const originalWordsAndSpacesForPopover = result.original_sentence.split(/(\s+)/);
            let currentTokenDetailSearchIndex = 0;
            originalWordsAndSpacesForPopover.forEach((part) => {
                if (part.match(/^\s+$/) || part === '') {
                    popoverInteractiveParts.push({ text: part, isWhitespace: true, isFlagged: false });
                } else {
                    let detail: TokenTypoDetail | undefined;
                    for (let i = currentTokenDetailSearchIndex; i < result.token_details.length; i++) {
                        if (result.token_details[i].token === part) {
                            detail = result.token_details[i];
                            currentTokenDetailSearchIndex = i + 1;
                            break;
                        }
                    }
                    if (detail) {
                        popoverInteractiveParts.push({
                            text: part,
                            isWhitespace: false,
                            isFlagged: detail.pred_tag !== 'KEEP',
                            originalToken: part,
                            predictions: detail.top_probs,
                            predictedTag: detail.pred_tag,
                        });
                    } else {
                        warn(`Popover: Word "${part}" not found or already matched in token_details.`);
                        popoverInteractiveParts.push({ text: part, isWhitespace: false, isFlagged: false });
                    }
                }
            });
            setInteractiveOcrParts(popoverInteractiveParts);

            // Update overlay lines with highlighting info
            const linesFromApiSentence = result.original_sentence.split('\n');
            let globalTokenIndex = 0;

            const updatedOcrDisplayLines = ocrDisplayLines.map((existingLine, lineIdx) => {
                const lineTextFromApi = linesFromApiSentence[lineIdx] || '';
                const newParts: OcrDisplayLinePart[] = [];
                let partIdCounter = 0;
                const wordsAndSpacesOnLine = lineTextFromApi.split(/(\s+)/).filter((p) => p.length > 0);

                wordsAndSpacesOnLine.forEach((textSegment) => {
                    const partId = `${existingLine.id}-part-${partIdCounter++}`;
                    if (textSegment.match(/^\s+$/)) {
                        newParts.push({ id: partId, text: textSegment, isWhitespace: true, ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement> });
                    } else {
                        let isFlagged = false;
                        if (
                            globalTokenIndex < result.token_details.length &&
                            result.token_details[globalTokenIndex].token === textSegment
                        ) {
                            isFlagged = result.token_details[globalTokenIndex].pred_tag !== 'KEEP';
                            globalTokenIndex++;
                        } else {
                            warn(
                                `Highlighting token mismatch: OCR'd word "${textSegment}" vs API token "${result.token_details[globalTokenIndex]?.token}" on line ${lineIdx}. Defaulting to not flagged.`
                            );
                            const popoverMatch = popoverInteractiveParts.find(
                                (pip) => pip.text === textSegment && !pip.isWhitespace
                            );
                            if (popoverMatch) isFlagged = popoverMatch.isFlagged;
                        }
                        newParts.push({
                            id: partId,
                            text: textSegment,
                            isWhitespace: false,
                            isFlagged,
                            ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement>,
                        });
                    }
                });

                return { ...existingLine, parts: newParts, textDuringOcr: lineTextFromApi };
            });

            setOcrDisplayLines(updatedOcrDisplayLines);
            setIsShowingTypoHighlights(true);
        } catch (errApi) {
            error('Typo correction API call failed:', errApi);
            setErrorState(`Typo API Error: ${errApi instanceof Error ? errApi.message : String(errApi)}`);
            setOcrDisplayLines((prevLines) =>
                prevLines.map((line) => ({
                    ...line,
                    parts: line.textDuringOcr
                        .split(/(\s+)/)
                        .filter((p) => p.length > 0)
                        .map((p, idx) => ({
                            id: `${line.id}-part-${idx}`,
                            text: p,
                            isWhitespace: p.match(/^\s+$/) !== null,
                            isFlagged: false,
                            ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement>,
                        })),
                }))
            );
            setBackendCorrectedSentence(textToCorrect);
            setIsShowingTypoHighlights(true);
        } finally {
            setIsTypoCheckingAPILoading(false);
            setCurrentAppPhase(2);
        }
    };

    return {
        interactiveOcrParts,
        backendCorrectedSentence,
        isTypoCheckingAPILoading,
        resetTypoData,
        triggerTypoCorrection,
    } as const;
};

