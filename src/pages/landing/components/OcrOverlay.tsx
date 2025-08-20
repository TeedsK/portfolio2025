// src/pages/landing/components/OcrOverlay.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProcessableLine, BoundingBoxData, RecognizedCharResult } from '../../../types';
import AnimatedScanBox, { RectPx } from './AnimatedScanBox';
import RecognizedCharLabel from './RecognizedCharLabel';
import { MEDIA_CROP_TOP_PX, MEDIA_CROP_BOTTOM_PX } from '../utils/constants';

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
 * to displayed coordinates. Delegates the scanning rectangle animation to
 * <AnimatedScanBox />, and uses ephemeral, animated labels for characters.
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

    // Respect the **visual** crop applied to the media (top & bottom by 5px)
    const cropTop = Math.max(0, MEDIA_CROP_TOP_PX);
    const cropBottom = Math.max(0, MEDIA_CROP_BOTTOM_PX);

    // The visible content band inside the media element (in overlay px)
    const contentTopInOverlay = offsetY + cropTop * scaleY;
    const contentBottomInOverlay = offsetY + displayedImgHeight - cropBottom * scaleY;

    /**
     * Compute the rectangle in *overlay pixel coordinates* for the current active character.
     * Add a small padding so the outline fully encapsulates the glyph even with minor
     * segmentation or antialiasing variances.
     *
     * NOTE: The segmentation pipeline consumes a *cropped* image (top/bottom removed),
     * so all y-coordinates from segmentation are relative to the cropped origin. To align
     * with the visually cropped media, we add cropTop * scaleY to the overlay mapping.
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

        // Padding in on-screen pixels — small but ensures “fully encapsulate”.
        const PAD = 2; // px

        const left = offsetX + charX * scaleX - PAD;
        // y from segmentation is relative to cropped top → add cropTop * scaleY
        const topRaw = contentTopInOverlay + charY * scaleY - PAD;
        const widthRaw = charW * scaleX + PAD * 2;
        const heightRaw = charH * scaleY + PAD * 2;

        // Clamp within the **visible content band** to avoid spill due to rounding.
        const leftClamped = Math.max(0, Math.min(left, imageDimensions.width - 1));
        const topClamped = Math.max(contentTopInOverlay, Math.min(topRaw, contentBottomInOverlay - 1));
        const maxHeight = Math.max(1, contentBottomInOverlay - topClamped);
        const heightClamped = Math.max(1, Math.min(heightRaw, maxHeight));

        const clamped: RectPx = {
            left: leftClamped,
            top: topClamped,
            width: Math.max(1, Math.min(widthRaw, imageDimensions.width - leftClamped)),
            height: heightClamped,
        };

        return clamped;
    }, [
        activeItemIndex,
        processableLines,
        showMediaElement,
        offsetX,
        scaleX,
        scaleY,
        imageDimensions.width,
        imageDimensions.height,
        naturalImgWidth,
        naturalImgHeight,
        contentTopInOverlay,
        contentBottomInOverlay,
    ]);

    // --- Ephemeral, animated labels for recognized characters ---
    // Only show *new* recognized items briefly; they auto-remove after their out-animation.
    const [visibleLabels, setVisibleLabels] = useState<RecognizedCharResult[]>([]);
    const seenIdsRef = useRef<Set<string>>(new Set());

    // Add only unseen items to the visible list
    useEffect(() => {
        if (!recognizedChars || recognizedChars.length === 0) return;
        const newlyAdded: RecognizedCharResult[] = [];
        for (const rc of recognizedChars) {
            if (!seenIdsRef.current.has(rc.id)) {
                seenIdsRef.current.add(rc.id);
                newlyAdded.push(rc);
            }
        }
        if (newlyAdded.length) {
            setVisibleLabels(prev => [...prev, ...newlyAdded]);
        }
    }, [recognizedChars]);

    // Stable callback so child effects do NOT restart on each render
    const handleLabelDone = useCallback((id: string) => {
        setVisibleLabels(prev => prev.filter(rc => rc.id !== id));
    }, []);

    // Precompute positioned labels (in overlay pixel coordinates), anchored beneath each box
    const positionedLabels = useMemo(() => {
        return visibleLabels.map(rc => {
            const [x, y, w, h] = rc.box;
            const left = offsetX + x * scaleX + (w * scaleX) / 2;
            // y from segmentation relative to cropped origin → add cropTop * scaleY
            const top = contentTopInOverlay + (y + h) * scaleY + 4; // 4px below the box
            return { id: rc.id, char: rc.char, left, top };
        });
    }, [visibleLabels, offsetX, scaleX, scaleY, contentTopInOverlay]);

    return (
        <div className="overlay-container" style={containerStyle}>
            {/* Smoothly-animated scan outline that morphs between target rectangles */}
            <AnimatedScanBox
                target={activeRect}
                accentColor={accentColor}
                visible={Boolean(activeRect)}
            />

            {/* Ephemeral animated labels for recently recognized characters */}
            {/* {positionedLabels.map(lbl => (
                <RecognizedCharLabel
                    key={lbl.id}
                    id={lbl.id}
                    char={lbl.char}
                    left={lbl.left}
                    top={lbl.top}
                    accentColor={accentColor}
                    onDone={handleLabelDone}
                    appearDurationMs={220}
                    holdDurationMs={500}
                    disappearDurationMs={220}
                />
            ))} */}
        </div>
    );
};

export default OcrOverlay;
