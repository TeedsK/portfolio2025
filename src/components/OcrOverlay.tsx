// src/components/OcrOverlay.tsx
import React, { useEffect } from 'react';
import gsap from 'gsap';
import { ProcessableLine, BoundingBoxData, OcrDisplayLine as AppOcrDisplayLine } from '../types';
import { OCR_OVERLAY_TEXT_COLOR_NORMAL, OCR_OVERLAY_FONT_SIZE } from '../constants';
import { TYPO_HIGHLIGHT_DELAY_MS } from '../config/animation';

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

const OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR = 'rgba(255, 255, 255, 0.0)';

const OcrOverlay: React.FC<OcrOverlayProps> = ({
    lines,
    isShowingHighlights,
    lineRefs,
    activeBoxInfo,
}) => {
    const {
        activeItemIndex,
        processableLines,
        imageDimensions, // These are the dimensions of the content area (mediaContainer - padding)
        imageRef,
        showMediaElement,
    } = activeBoxInfo;

    useEffect(() => {
        // GSAP animation for typo highlights (remains the same)
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
                        `-=${0.3 - TYPO_HIGHLIGHT_DELAY_MS / 1000}`
                    );
                });
            }
        }
    }, [isShowingHighlights, lines]);

    if (!imageDimensions || !imageRef.current || imageDimensions.width === 0 || imageDimensions.height === 0) {
        return null;
    }

    // Overlay container is positioned relative to its parent (.media-container)
    // It should fill the content area where the image is displayed.
    // The parent .media-container has 4px padding.
    // App.tsx now sets imageDimensions to be container.width - 8, container.height - 8.
    // So, OcrOverlay's width/height should be these imageDimensions directly.
    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: '4px',  // To account for parent's padding
        left: '4px', // To account for parent's padding
        width: `${imageDimensions.width}px`, // imageDimensions is already content area
        height: `${imageDimensions.height}px`,
        pointerEvents: 'none',
        overflow: 'hidden', // Important to clip content outside this box
        zIndex: 3,
        // border: '1px dashed lime', // For debugging layout
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

        if (naturalAspectRatio > containerAspectRatio) { // Image is wider than container aspect ratio, pillarboxed height
            displayedImgHeight = imageDimensions.width / naturalAspectRatio;
            offsetY = (imageDimensions.height - displayedImgHeight) / 2;
        } else { // Image is taller, letterboxed width
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
            {lines.map(line => (
                <div
                    key={line.id}
                    ref={el => { lineRefs.current.set(line.id, el); }}
                    className="ocr-overlay-line"
                    style={{
                        top: `${offsetY + line.y}px`, // Adjust line.y based on image's vertical offset
                        left: `${offsetX}px`, 
                        width: `${displayedImgWidth}px`, 
                        textAlign: 'center',
                        position: 'absolute',
                        fontSize: `${OCR_OVERLAY_FONT_SIZE}px`,
                        backgroundColor: isShowingHighlights ? 'transparent' : OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR,
                        color: OCR_OVERLAY_TEXT_COLOR_NORMAL, // Ensure text color is set
                        whiteSpace: 'pre', // Important for rendering spaces correctly
                    }}
                >
                    {isShowingHighlights && line.parts.length > 0 ? (
                        line.parts.map(part =>
                            part.isWhitespace ? (
                                <span key={part.id}>{part.text}</span>
                            ) : (
                                <span
                                    key={part.id}
                                    ref={part.ref}
                                    className={`typo-highlight-word ${part.isFlagged ? 'typo-incorrect' : 'typo-correct'}`}
                                >
                                    {part.text}
                                </span>
                            )
                        )
                    ) : (
                        <span>{line.textDuringOcr}</span>
                    )}
                </div>
            ))}
        </div>
    );
};

export default OcrOverlay;