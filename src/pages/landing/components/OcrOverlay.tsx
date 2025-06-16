// src/pages/landing/components/OcrOverlay.tsx
import React, { useEffect } from 'react';
import gsap from 'gsap';
import { ProcessableLine, BoundingBoxData, OcrDisplayLine as AppOcrDisplayLine } from '../../../types';
import { OCR_OVERLAY_TEXT_COLOR_NORMAL, OCR_OVERLAY_FONT_SIZE } from '../utils/constants';
import { TYPO_HIGHLIGHT_DELAY_MS } from '../utils/animation';

export { type AppOcrDisplayLine as OcrDisplayLine };

export interface ActiveBoxInfo {
    activeItemIndex: { line: number; item: number } | null;
    processableLines: ProcessableLine[];
    imageDimensions: { width: number; height: number } | null;
    imageRef: React.RefObject<HTMLImageElement>;
    showMediaElement: boolean;
}

export interface OcrOverlayProps {
    lines: AppOcrDisplayLine[];
    isShowingHighlights: boolean;
    lineRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
    activeBoxInfo: ActiveBoxInfo;
}

const OcrOverlay: React.FC<OcrOverlayProps> = ({
    lines,
    isShowingHighlights,
    lineRefs,
    activeBoxInfo,
}) => {
    const {
        activeItemIndex,
        processableLines,
        imageDimensions,
        imageRef,
        showMediaElement,
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
                            duration: 0.1,
                            ease: 'power1.inOut'
                        },
                        `-=${0.3 - TYPO_HIGHLIGHT_DELAY_MS / 1000}`
                    );
                });
            }
        }
    }, [isShowingHighlights, lines]);

    if (!imageDimensions || !imageRef.current || imageDimensions.width === 0 || imageDimensions.height === 0) {
        return null;
    }

    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${imageDimensions.width}px`,
        height: `${imageDimensions.height}px`,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 3,
        border: '1px dashed lime',
    };

    const naturalImgWidth = imageRef.current.naturalWidth;
    const naturalImgHeight = imageRef.current.naturalHeight;

    let displayedImgWidth = imageDimensions.width;
    let displayedImgHeight = imageDimensions.height;
    let offsetX = 0;
    let offsetY = 0;

    if (naturalImgWidth > 0 && naturalImgHeight > 0) {
        const containerAspectRatio = imageDimensions.width / imageDimensions.height;
        const naturalAspectRatio = naturalImgWidth / naturalImgHeight;

        if (naturalAspectRatio > containerAspectRatio) {
            displayedImgHeight = imageDimensions.width / naturalAspectRatio;
            offsetY = (imageDimensions.height - displayedImgHeight) / 2;
        } else {
            displayedImgWidth = imageDimensions.height * naturalAspectRatio;
            offsetX = (imageDimensions.width - displayedImgWidth) / 2;
        }
    }

    const scaleX = displayedImgWidth / naturalImgWidth;
    const scaleY = displayedImgHeight / naturalImgHeight;

    const renderActiveBox = () => {
        if (!activeItemIndex || !showMediaElement || !processableLines[activeItemIndex.line] || !(naturalImgWidth > 0 && naturalImgHeight > 0)) return null;
        const item = processableLines[activeItemIndex.line][activeItemIndex.item];
        if (item === null) return null;

        const box = item as BoundingBoxData;
        const [charX, charY, charW, charH] = box;

        return (
            <div
                style={{
                    position: 'absolute',
                    left: `${offsetX + (charX * scaleX)}px`,
                    top: `${offsetY + (charY * scaleY)}px`,
                    width: `${charW * scaleX}px`,
                    height: `${charH * scaleY}px`,
                    border: '2px solid rgba(255, 0, 0, 0.7)',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    boxSizing: 'border-box',
                }}
            />
        );
    };

    return (
        <div className="overlay-container" style={containerStyle}>
            {renderActiveBox()}
            {/* Text rendering removed from overlay */}
        </div>
    );
};

export default OcrOverlay;