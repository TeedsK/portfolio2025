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
    accentColor?: string;
    recognizedChars?: RecognizedCharResult[];
    /** Viewport rect of the live scan box every frame, or null when hidden */
    onScanBoxAnchorChange?: (rect: DOMRect | null) => void;
    /** NEW: fired once when the scan box fully settles on the current character */
    onFocusSettled?: (line: number, item: number) => void;
}

const OcrOverlay: React.FC<OcrOverlayProps> = ({
    activeBoxInfo,
    accentColor = 'rgba(255,0,0,0.8)',
    recognizedChars = [],
    onScanBoxAnchorChange,
    onFocusSettled,
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

    // Mapping from natural image → displayed region (letterbox aware)
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

    const cropTop = Math.max(0, MEDIA_CROP_TOP_PX);
    const cropBottom = Math.max(0, MEDIA_CROP_BOTTOM_PX);

    const contentTopInOverlay = offsetY + cropTop * scaleY;
    const contentBottomInOverlay = offsetY + displayedImgHeight - cropBottom * scaleY;

    /** Active scan rectangle in *overlay* pixels (for drawing) */
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

        const PAD = 2; // visual pad for the outline
        const left = offsetX + charX * scaleX - PAD;
        const topRaw = contentTopInOverlay + charY * scaleY - PAD;
        const widthRaw = charW * scaleX + PAD * 2;
        const heightRaw = charH * scaleY + PAD * 2;

        const leftClamped = Math.max(0, Math.min(left, imageDimensions.width - 1));
        const topClamped = Math.max(contentTopInOverlay, Math.min(topRaw, contentBottomInOverlay - 1));
        const maxHeight = Math.max(1, contentBottomInOverlay - topClamped);
        const heightClamped = Math.max(1, Math.min(heightRaw, maxHeight));

        return {
            left: leftClamped,
            top: topClamped,
            width: Math.max(1, Math.min(widthRaw, imageDimensions.width - leftClamped)),
            height: heightClamped,
        };
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

    // --- (Optional) ephemeral labels ---
    const [visibleLabels, setVisibleLabels] = useState<RecognizedCharResult[]>([]);
    const seenIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!recognizedChars || recognizedChars.length === 0) return;
        const newlyAdded: RecognizedCharResult[] = [];
        for (const rc of recognizedChars) {
            if (!seenIdsRef.current.has(rc.id)) {
                seenIdsRef.current.add(rc.id);
                newlyAdded.push(rc);
            }
        }
        if (newlyAdded.length) setVisibleLabels(prev => [...prev, ...newlyAdded]);
    }, [recognizedChars]);

    const handleLabelDone = useCallback((id: string) => {
        setVisibleLabels(prev => prev.filter(rc => rc.id !== id));
    }, []);

    // Convert the live box rect (viewport coords) → notify parent each frame
    const handleBoxRectChange = useCallback(
        (rect: DOMRect | null) => {
            onScanBoxAnchorChange?.(rect);
        },
        [onScanBoxAnchorChange],
    );

    // Fired once when the box has fully animated onto the current character
    const handleBoxSettled = useCallback(() => {
        if (activeItemIndex) {
            onFocusSettled?.(activeItemIndex.line, activeItemIndex.item);
        }
    }, [activeItemIndex, onFocusSettled]);

    const positionedLabels = useMemo(() => {
        return visibleLabels.map(rc => {
            const [x, y, w, h] = rc.box;
            const left = offsetX + x * scaleX + (w * scaleX) / 2;
            const top = contentTopInOverlay + (y + h) * scaleY + 4;
            return { id: rc.id, char: rc.char, left, top };
        });
    }, [visibleLabels, offsetX, scaleX, scaleY, contentTopInOverlay]);

    return (
        <div className="overlay-container" style={containerStyle}>
            <AnimatedScanBox
                target={activeRect}
                accentColor={accentColor}
                visible={Boolean(activeRect)}
                onBoxRectChange={handleBoxRectChange}
                onSettled={handleBoxSettled}
            />

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

