// src/components/OcrOverlay.tsx
import React, { useEffect } from 'react';
import gsap from 'gsap';
import { ProcessableLine, BoundingBoxData } from '../types';

interface OcrDisplayLinePart {
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

export interface ActiveBoxInfo {
    activeItemIndex: { line: number; item: number } | null;
    processableLines: ProcessableLine[];
    imageDimensions: { width: number; height: number } | null;
    imageRef: React.RefObject<HTMLImageElement>;
    showMediaElement: boolean;
    mediaOffset: { top: number; left: number } | null;
}

export interface OcrOverlayProps {
    lines: OcrDisplayLine[];
    isShowingHighlights: boolean;
    lineRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
    activeBoxInfo: ActiveBoxInfo;
}

const OCR_OVERLAY_FONT_SIZE = 30;
const OCR_OVERLAY_TEXT_COLOR_NORMAL = 'rgba(50, 50, 50, 0.95)';
const OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR = 'rgba(255, 255, 255, 0.0)';
const TYPO_ANIMATION_DELAY_MS = 60;

const OcrOverlay: React.FC<OcrOverlayProps> = ({
    lines,
    isShowingHighlights,
    lineRefs,
    activeBoxInfo
}) => {
    const {
        activeItemIndex,
        processableLines,
        imageDimensions,
        imageRef,
        showMediaElement,
        mediaOffset
    } = activeBoxInfo;

    useEffect(() => {
        if (isShowingHighlights && lines.some(line => line.parts.length > 0)) {
            const wordSpans: HTMLElement[] = [];
            lines.forEach(line => {
                line.parts.forEach(part => {
                    if (!part.isWhitespace && part.ref?.current) {
                        wordSpans.push(part.ref.current);
                    }
                });
            });
            if (wordSpans.length > 0) {
                gsap.set(wordSpans, { opacity: 1, color: OCR_OVERLAY_TEXT_COLOR_NORMAL });
                const tl = gsap.timeline();
                wordSpans.forEach(span => {
                    const isIncorrect = span.classList.contains('typo-incorrect');
                    tl.to(
                        span,
                        {
                            color: isIncorrect ? '#dc3545' : '#28a745',
                            duration: 0.3,
                            ease: 'power1.inOut'
                        },
                        `-=${0.3 - TYPO_ANIMATION_DELAY_MS / 1000}`
                    );
                });
            }
        }
    }, [isShowingHighlights, lines]);

    if (!imageDimensions) return null;

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: mediaOffset ? `${mediaOffset.top + 4}px` : '0px',
        left: mediaOffset ? `${mediaOffset.left + 4}px` : '0px',
        width: imageDimensions.width - 8 + 'px',
        height: imageDimensions.height - 8 + 'px',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 3
    };

    const renderActiveBox = () => {
        if (!activeItemIndex || !showMediaElement) return null;
        if (!processableLines[activeItemIndex.line]) return null;
        const item = processableLines[activeItemIndex.line][activeItemIndex.item];
        if (item === null || !imageRef.current) return null;
        const box = item as BoundingBoxData;
        const scaleX = imageDimensions.width / (imageRef.current.naturalWidth || 1);
        const scaleY = imageDimensions.height / (imageRef.current.naturalHeight || 1);
        const [x, y, w, h] = box;
        return (
            <div
                style={{
                    position: 'absolute',
                    left: `${x * scaleX}px`,
                    top: `${y * scaleY}px`,
                    width: `${w * scaleX}px`,
                    height: `${h * scaleY}px`,
                    border: '2px solid rgba(255, 0, 0, 0.7)',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    boxSizing: 'border-box'
                }}
            />
        );
    };

    return (
        <div className="overlay-container" style={containerStyle}>
            {renderActiveBox()}
            {lines.map(line => (
                <div
                    key={line.id}
                    ref={el => { lineRefs.current.set(line.id, el); }}
                    className="ocr-overlay-line"
                    style={{
                        top: `${line.y}px`,
                        left: '0px',
                        fontSize: `${OCR_OVERLAY_FONT_SIZE}px`,
                        backgroundColor: isShowingHighlights ? 'transparent' : OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR
                    }}
                >
                    {isShowingHighlights && line.parts.length > 0 ? (
                        line.parts.map(part =>
                            part.isWhitespace ? (
                                <span key={part.id} style={{ whiteSpace: 'pre' }}>
                                    {part.text}
                                </span>
                            ) : (
                                <span
                                    key={part.id}
                                    ref={part.ref}
                                    className={`typo-highlight-word ${part.isFlagged ? 'typo-incorrect' : 'typo-correct'}`}
                                    style={{ color: OCR_OVERLAY_TEXT_COLOR_NORMAL }}
                                >
                                    {part.text}
                                </span>
                            )
                        )
                    ) : (
                        <span style={{ color: OCR_OVERLAY_TEXT_COLOR_NORMAL }}>{line.textDuringOcr}</span>
                    )}
                </div>
            ))}
        </div>
    );
};

export default OcrOverlay;
