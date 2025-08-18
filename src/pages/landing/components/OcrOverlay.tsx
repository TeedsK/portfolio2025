// src/pages/landing/components/OcrOverlay.tsx
import React from 'react';
import { ProcessableLine, BoundingBoxData, RecognizedCharResult } from '../../../types';

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

const OcrOverlay: React.FC<OcrOverlayProps> = ({ activeBoxInfo, accentColor = 'rgba(255,0,0,0.8)', recognizedChars = [] }) => {
    const {
        activeItemIndex,
        processableLines,
        imageDimensions,
        imageRef,
        showMediaElement,
    } = activeBoxInfo;

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
                    border: `2px solid ${accentColor}`,
                    boxSizing: 'border-box',
                    borderRadius: '2px',
                    boxShadow: `0 0 8px ${accentColor}66`,
                    animation: 'scanPulse 1s ease-in-out infinite',
                }}
            />
        );
    };

    const renderRecognizedLabels = () => {
        if (!recognizedChars.length) return null;
        return recognizedChars.map((rc) => {
            const [x, y, w, h] = rc.box;
            const left = offsetX + x * scaleX + (w * scaleX) / 2;
            const top = offsetY + (y + h) * scaleY + 4; // 4px below the box

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
            {renderActiveBox()}
            {renderRecognizedLabels()}
        </div>
    );
};

export default OcrOverlay;
