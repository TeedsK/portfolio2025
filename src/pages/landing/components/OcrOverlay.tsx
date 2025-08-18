// src/pages/landing/components/OcrOverlay.tsx
import React, { useMemo } from 'react';
import { ProcessableLine, BoundingBoxData, RecognizedCharResult } from '../../../types';
import AnimatedScanBox, { RectPx } from './AnimatedScanBox';

export interface ActiveBoxInfo {
    activeItemIndex: { line: number; item: number } | null;
    processableLines: ProcessableLine[];
    imageDimensions: { width: number; height: number } | null;
    imageRef: React.RefObject<HTMLImageElement>;
    showMediaElement: boolean;
}

export interface OcrOverlayProps {
    activeBoxInfo: ActiveBoxInfo;
    /** Accent color for the active scan box + labels */
    accentColor?: string;
    /** Already recognized characters (to render under their boxes) */
    recognizedChars?: RecognizedCharResult[];
}

/**
 * Overlay layered over the media container, mapping natural image coordinates
 * to displayed coordinates. Now delegates the scanning rectangle animation to
 * <AnimatedScanBox /> so the box smoothly morphs to fit each character.
 */
const OcrOverlay: React.FC<OcrOverlayProps> = ({
    activeBoxInfo,
    accentColor = 'rgba(255,0,0,0.8)',
    recognizedChars = [],
}) => {
    const {
        activeItemIndex,
        processableLines,
        imageDimensions,
        imageRef,
        showMediaElement,
    } = activeBoxInfo;

    if (
        !imageDimensions ||
        !imageRef.current ||
        imageDimensions.width === 0 ||
        imageDimensions.height === 0
    ) {
        return null;
    }

    // Container for overlay (exactly the size of the media box, respecting letterbox).
    const containerStyle: React.CSSProperties = {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${imageDimensions.width}px`,
        height: `${imageDimensions.height}px`,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 3,
    };

    // Compute how the natural image maps to the displayed region.
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
            // Image spans full width, letterbox vertically.
            displayedImgHeight = imageDimensions.width / naturalAspectRatio;
            offsetY = (imageDimensions.height - displayedImgHeight) / 2;
        } else {
            // Image spans full height, letterbox horizontally.
            displayedImgWidth = imageDimensions.height * naturalAspectRatio;
            offsetX = (imageDimensions.width - displayedImgWidth) / 2;
        }
    }

    const scaleX = displayedImgWidth / naturalImgWidth;
    const scaleY = displayedImgHeight / naturalImgHeight;

    /**
     * Compute the rectangle in *overlay pixel coordinates* for the current active character.
     * Add a small padding so the outline fully encapsulates the glyph even with minor
     * segmentation or antialiasing variances.
     */
    const activeRect: RectPx | null = useMemo(() => {
        if (
            !showMediaElement ||
            !activeItemIndex ||
            !processableLines[activeItemIndex.line] ||
            !(naturalImgWidth > 0 && naturalImgHeight > 0)
        ) {
            return null;
        }

        const item = processableLines[activeItemIndex.line][activeItemIndex.item];
        if (item === null) return null;

        const [charX, charY, charW, charH] = item as BoundingBoxData;

        // Padding in final on-screen pixels — small but ensures “fully encapsulate”.
        const PAD = 2; // px
        const left = offsetX + charX * scaleX - PAD;
        const top = offsetY + charY * scaleY - PAD;
        const width = charW * scaleX + PAD * 2;
        const height = charH * scaleY + PAD * 2;

        // Clamp within overlay bounds to avoid accidental spill due to rounding.
        const clamped: RectPx = {
            left: Math.max(0, Math.min(left, imageDimensions.width - 1)),
            top: Math.max(0, Math.min(top, imageDimensions.height - 1)),
            width: Math.max(1, Math.min(width, imageDimensions.width - left)),
            height: Math.max(1, Math.min(height, imageDimensions.height - top)),
        };

        return clamped;
    }, [
        activeItemIndex,
        processableLines,
        showMediaElement,
        offsetX,
        offsetY,
        scaleX,
        scaleY,
        imageDimensions.width,
        imageDimensions.height,
        naturalImgWidth,
        naturalImgHeight,
    ]);

    const renderRecognizedLabels = () => {
        if (!recognizedChars.length) return null;
        return recognizedChars.map((rc) => {
            const [x, y, w, h] = rc.box;
            const left = offsetX + x * scaleX + (w * scaleX) / 2;
            const top = offsetY + (y + h) * scaleY + 4; // below the box

            return (
                <div
                    key={rc.id}
                    style={{
                        position: 'absolute',
                        left: `${left}px`,
                        top: `${top}px`,
                        transform: 'translateX(-50%)',
                        fontFamily: 'Courier New, monospace',
                        fontSize: '12px',
                        color: '#222',
                        background: 'rgba(255,255,255,0.85)',
                        border: `1px dashed ${accentColor}`,
                        borderRadius: '4px',
                        padding: '2px 6px',
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                        zIndex: 3,
                    }}
                    aria-label={`recognized-${rc.char}`}
                >
                    {rc.char.toUpperCase()}
                </div>
            );
        });
    };

    return (
        <div className="overlay-container" style={containerStyle}>
            {/* Smoothly-animated scan outline that morphs between target rectangles */}
            <AnimatedScanBox
                target={activeRect}
                accentColor={accentColor}
                visible={Boolean(activeRect)}
            />

            {/* Stable recognized labels below the active box */}
            {renderRecognizedLabels()}
        </div>
    );
};

export default OcrOverlay;
