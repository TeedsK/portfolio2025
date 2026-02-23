// src/pages/landing/components/OcrWordRevealOverlay.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import './OcrWordRevealOverlay.css';

import type { RecognizedCharResult, BoundingBoxData } from '../../../types';
import type { CorrectedTextPart } from '../utils/correctionData';

type BoxPx = { left: number; top: number; width: number; height: number };

type WordPlacement = {
    id: string;
    text: string;
    raw: string;
    box: BoxPx;
    fontSize: number;
};

export interface OcrWordRevealOverlayProps {
    imageRef: React.RefObject<HTMLImageElement>;
    containerDims: { width: number; height: number };
    recognizedChars: RecognizedCharResult[];
    correctedParts: CorrectedTextPart[];
    clipTopPx?: number;
    clipBottomPx?: number;
    onComplete?: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const unionBoxes = (boxes: BoundingBoxData[]): BoundingBoxData => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y, w, h] of boxes) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    }
    return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
};

const buildCorrectedString = (parts: CorrectedTextPart[]): string => {
    // Keep this centralized so any future correction shape changes are isolated.
    return parts.map((p) => String(p.corrected ?? '')).join('');
};

type CharItem = {
    char: string;
    box: BoundingBoxData;
    cx: number;
    cy: number;
};

type Line = { cy: number; items: CharItem[] };

const buildWordBoxesFromChars = (recognizedChars: RecognizedCharResult[]) => {
    const chars: CharItem[] = recognizedChars
        .filter((c) => c && c.box && c.box[2] > 0 && c.box[3] > 0)
        .map((c) => {
            const [x, y, w, h] = c.box;
            return { char: c.char, box: c.box, cx: x + w / 2, cy: y + h / 2 };
        });

    if (chars.length === 0) return [];

    // Sort top-to-bottom, left-to-right (rough)
    chars.sort((a, b) => (a.cy - b.cy) || (a.cx - b.cx));

    // Estimate thresholds
    const heights = chars.map(c => c.box[3]).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 20;
    const lineThresh = medianH * 0.65;

    const lines: Line[] = [];

    for (const item of chars) {
        let bestLine: Line | null = null;
        let bestDist = Infinity;

        for (const ln of lines) {
            const d = Math.abs(item.cy - ln.cy);
            if (d < bestDist) {
                bestDist = d;
                bestLine = ln;
            }
        }

        if (!bestLine || bestDist > lineThresh) {
            lines.push({ cy: item.cy, items: [item] });
        } else {
            bestLine.items.push(item);
            // update line center
            bestLine.cy = bestLine.items.reduce((s, it) => s + it.cy, 0) / bestLine.items.length;
        }
    }

    // Sort lines, then sort items in each line by x
    lines.sort((a, b) => a.cy - b.cy);
    for (const ln of lines) ln.items.sort((a, b) => a.box[0] - b.box[0]);

    const words: { raw: string; box: BoundingBoxData }[] = [];

    for (const ln of lines) {
        const items = ln.items;

        const widths = items.map(it => it.box[2]).sort((a, b) => a - b);
        const medianW = widths[Math.floor(widths.length / 2)] || 18;
        const gapThresh = medianW * 0.9;

        let currentChars: CharItem[] = [];

        const flush = () => {
            if (currentChars.length === 0) return;
            const raw = currentChars.map(c => c.char).join('');
            const box = unionBoxes(currentChars.map(c => c.box));
            words.push({ raw, box });
            currentChars = [];
        };

        for (let i = 0; i < items.length; i++) {
            const it = items[i];

            // If OCR ever emits explicit whitespace chars, treat them as separators.
            if (it.char === ' ' || it.char === '\n' || it.char === '\t') {
                flush();
                continue;
            }

            if (currentChars.length > 0) {
                const prev = currentChars[currentChars.length - 1];
                const prevRight = prev.box[0] + prev.box[2];
                const gap = it.box[0] - prevRight;
                if (gap > gapThresh) flush();
            }

            currentChars.push(it);
        }

        flush();
    }

    return words;
};

const mapBoxToDisplay = (
    box: BoundingBoxData,
    naturalW: number,
    naturalH: number,
    displayW: number,
    displayH: number,
    clipTopPx: number,
    clipBottomPx: number
): BoxPx => {
    const [x, y, w, h] = box;

    const safeNaturalW = Math.max(1, naturalW);
    const safeNaturalH = Math.max(1, naturalH);
    const safeDisplayW = Math.max(1, displayW);
    const safeDisplayH = Math.max(1, displayH);

    // Match OcrOverlay's letterbox mapping so reveal words sit exactly on scanned glyphs.
    const containerAspect = safeDisplayW / safeDisplayH;
    const naturalAspect = safeNaturalW / safeNaturalH;

    let displayedImgWidth = safeDisplayW;
    let displayedImgHeight = safeDisplayH;
    let offsetX = 0;
    let offsetY = 0;

    if (naturalAspect > containerAspect) {
        displayedImgHeight = safeDisplayW / naturalAspect;
        offsetY = (safeDisplayH - displayedImgHeight) / 2;
    } else {
        displayedImgWidth = safeDisplayH * naturalAspect;
        offsetX = (safeDisplayW - displayedImgWidth) / 2;
    }

    const sx = displayedImgWidth / safeNaturalW;
    const sy = displayedImgHeight / safeNaturalH;

    // OCR boxes are in cropped-image coordinates (crop already applied before segmentation).
    const contentTop = offsetY + Math.max(0, clipTopPx) * sy;
    const contentBottom = offsetY + displayedImgHeight - Math.max(0, clipBottomPx) * sy;

    const left = offsetX + x * sx;
    const topRaw = contentTop + y * sy;
    const width = w * sx;
    const maxHeight = Math.max(1, contentBottom - topRaw);
    const height = Math.max(1, Math.min(h * sy, maxHeight));
    const top = Math.max(contentTop, Math.min(topRaw, contentBottom - 1));

    return { left, top, width, height };
};

const OcrWordRevealOverlay: React.FC<OcrWordRevealOverlayProps> = ({
    imageRef,
    containerDims,
    recognizedChars,
    correctedParts,
    clipTopPx = 0,
    clipBottomPx = 0,
    onComplete,
}) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const ranRef = useRef(false);
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const words = useMemo<WordPlacement[]>(() => {
        const img = imageRef.current;
        const naturalW = img?.naturalWidth || 1920;
        const naturalH = img?.naturalHeight || 1080;

        const baseWordBoxes = buildWordBoxesFromChars(recognizedChars);
        const corrected = buildCorrectedString(correctedParts)
            .replace(/\s+/g, ' ')
            .trim();

        const correctedWords = corrected.length ? corrected.split(' ') : [];

        const placements: WordPlacement[] = [];
        if (baseWordBoxes.length === 0) return placements;

        for (let i = 0; i < baseWordBoxes.length; i++) {
            const wb = baseWordBoxes[i];
            const mapped = mapBoxToDisplay(
                wb.box,
                naturalW,
                naturalH,
                containerDims.width,
                containerDims.height,
                clipTopPx,
                clipBottomPx
            );

            const text = correctedWords[i] ?? wb.raw;

            // Pad & cover the original word area
            const padX = 4;
            const padY = 2;

            const box = {
                left: Math.max(0, mapped.left - padX),
                top: Math.max(0, mapped.top - padY),
                width: Math.max(6, mapped.width + padX * 2),
                height: Math.max(8, mapped.height + padY * 2),
            };

            const fontSize = clamp(box.height * 0.78, 12, 28);

            placements.push({
                id: `w-${i}-${Math.random().toString(16).slice(2)}`,
                text,
                raw: wb.raw,
                box,
                fontSize,
            });
        }

        return placements;
    }, [clipBottomPx, clipTopPx, containerDims.height, containerDims.width, correctedParts, imageRef, recognizedChars]);

    useLayoutEffect(() => {
        // If we don’t have word placements, just complete quickly so the app doesn’t stall.
        if (!rootRef.current || words.length === 0) {
            const t = window.setTimeout(() => {
                if (ranRef.current) return;
                ranRef.current = true;
                onCompleteRef.current?.();
            }, 200);
            return () => window.clearTimeout(t);
        }

        if (ranRef.current) return;
        ranRef.current = true;

        const root = rootRef.current;
        const wordEls = Array.from(root.querySelectorAll<HTMLElement>('.ocr-word-reveal'));
        const charEls = Array.from(root.querySelectorAll<HTMLElement>('.ocr-word-reveal__ch'));

        gsap.set(wordEls, { opacity: 0, scale: 0.99 });
        gsap.set(charEls, { opacity: 0 });

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => onCompleteRef.current?.(),
        });

        let cursor = 0;

        // Slight stagger per character; small gap between words.
        const perCharDelay = 0.022;
        const perWordGap = 0.05;
        const firstCharOffset = 0.05;

        for (const wordEl of wordEls) {
            const chars = Array.from(wordEl.querySelectorAll<HTMLElement>('.ocr-word-reveal__ch'));

            tl.to(wordEl, { opacity: 1, scale: 1, duration: 0.16 }, cursor);

            chars.forEach((chEl, idx) => {
                tl.to(chEl, { opacity: 1, duration: 0.10, ease: 'power1.out' }, cursor + firstCharOffset + idx * perCharDelay);
            });

            cursor += firstCharOffset + chars.length * perCharDelay + perWordGap;
        }

        return () => {
            tl.kill();
        };
    }, [words.length]);

    return (
        <div ref={rootRef} className="ocr-word-reveal-overlay" aria-hidden>
            {words.map((w) => (
                <div
                    key={w.id}
                    className="ocr-word-reveal"
                    style={{
                        left: `${w.box.left}px`,
                        top: `${w.box.top}px`,
                        minWidth: `${w.box.width}px`,
                        minHeight: `${w.box.height}px`,
                        fontSize: `${w.fontSize}px`,
                    }}
                    title={w.raw}
                >
                    <span className="ocr-word-reveal__text">
                        {w.text.split('').map((ch, idx) => (
                            <span key={`${w.id}-c-${idx}`} className="ocr-word-reveal__ch">
                                {ch}
                            </span>
                        ))}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default OcrWordRevealOverlay;
