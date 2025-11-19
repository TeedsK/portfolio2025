// src/pages/landing/components/CharacterStreamViz.tsx
import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import {
    CHAR_FADE_IN_DURATION,
    CHAR_FADE_OUT_DELAY,
    CHAR_FADE_OUT_DURATION,
    CHAR_LINE_DRAW_DURATION,
    CHAR_BOX_CONTENT_WIDTH,
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING,
} from '../utils/animation';

import { STREAM_LINE_WIDTH } from '../utils/constants';

import { PathManager } from '../utils/path';
import { StreamCharacter } from '../../../types';
import { shouldRunLandingAnimations } from '../utils/landingAnimationGate';

interface CharacterStreamVizProps {
    characters: StreamCharacter[];
    containerSize: { width: number; height: number };
    onCharacterFinished: (id: string) => void;
}

const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

// Helper function to draw a segment of the path
function drawPathSegment(
    ctx: CanvasRenderingContext2D,
    path: PathManager,
    startDist: number,
    endDist: number,
    strokeStyle: string | CanvasGradient,
    lineWidth: number
) {
    if (startDist >= endDist || path.totalLength === 0) return;

    const clampedStartDist = Math.max(0, Math.min(startDist, path.totalLength));
    const clampedEndDist = Math.max(0, Math.min(endDist, path.totalLength));

    if (clampedStartDist >= clampedEndDist) return;

    ctx.beginPath();
    const segments = 30;
    const segmentActualLength = clampedEndDist - clampedStartDist;
    const step = segmentActualLength / segments;

    let firstPoint = true;
    for (let i = 0; i <= segments; i++) {
        const dist = clampedStartDist + i * step;
        const point = path.getPointAt(dist);
        if (firstPoint) {
            ctx.moveTo(point.x, point.y);
            firstPoint = false;
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}

const CharacterStreamViz: React.FC<CharacterStreamVizProps> = ({ characters, containerSize, onCharacterFinished }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameId = useRef<number>();
    const initiatedAnimations = useRef(new Set<string>());

    const GRAY_COLOR = '#D0D5DD';
    const HEAD_COLOR_RATIO = 0.10;

    useEffect(() => {
        if (!shouldRunLandingAnimations()) {
            // If we aren't active, don't start new animations for incoming characters.
            return;
        }

        characters.forEach((character) => {
            if (initiatedAnimations.current.has(character.id)) {
                return;
            }

            initiatedAnimations.current.add(character.id);

            character.animationState = 'traveling';
            character.isRetractingColorOverride = false;

            gsap.set(character, { alpha: 0, scale: 0 });

            const tl = gsap.timeline({
                onComplete: () => {
                    initiatedAnimations.current.delete(character.id);
                    onCharacterFinished(character.id);
                }
            });

            tl.to(character, {
                alpha: 1,
                scale: 1,
                duration: CHAR_FADE_IN_DURATION,
                ease: 'power2.out',
                overwrite: 'auto',
            });

            tl.to(character, {
                headProgress: 1,
                duration: CHAR_LINE_DRAW_DURATION,
                ease: 'linear',
                onComplete: () => {
                    character.onFinished();
                }
            }, CHAR_FADE_IN_DURATION);

            // Retract the line (no scale changes here; keep at 1 until the end)
            tl.to(character, {
                tailProgress: 1,
                duration: CHAR_LINE_DRAW_DURATION,
                ease: 'linear',
                onStart: () => {
                    character.isRetractingColorOverride = true;
                },
            }, CHAR_FADE_IN_DURATION + CHAR_LINE_DRAW_DURATION);

            tl.to(character, {
                alpha: 0,
                scale: 0,
                duration: CHAR_FADE_OUT_DURATION,
                ease: 'power1.in',
                delay: CHAR_FADE_OUT_DELAY,
                onStart: () => {
                    character.animationState = 'fading';
                    character.isRetractingColorOverride = true;
                },
                overwrite: 'auto',
            });

        });
    }, [characters, onCharacterFinished]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx || !offscreenCtx) return;

        const render = () => {
            if (!ctx || !offscreenCtx) return;

            // Gate: if animations are not active, just clear and keep checking.
            if (!shouldRunLandingAnimations()) {
                ctx.clearRect(0, 0, containerSize.width, containerSize.height);
                animationFrameId.current = requestAnimationFrame(render);
                return;
            }

            ctx.clearRect(0, 0, containerSize.width, containerSize.height);

            characters.forEach((char) => {
                if (char.alpha < 0.01 && char.animationState === 'fading') return;

                const path = char.path;
                const snakeVisibleStartDist = char.tailProgress * path.totalLength;
                const snakeVisibleEndDist = char.headProgress * path.totalLength;

                let lineStrokeStyle: string | CanvasGradient = GRAY_COLOR;
                if (path.totalLength > 0) {
                    // Grey for the first 90%, then blend into the letter color(s) for the final 10%.
                    const p0 = path.getPointAt(0);
                    const p2 = path.getPointAt(path.totalLength);
                    const gradient = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
                    const split = 1 - HEAD_COLOR_RATIO; // 0.90
                    gradient.addColorStop(0, GRAY_COLOR);
                    gradient.addColorStop(split, GRAY_COLOR);
                    // Spread char.gradientSet over the last 10%
                    const n = Math.max(2, char.gradientSet.length);
                    for (let i = 0; i < n; i++) {
                        const t = i / (n - 1);
                        gradient.addColorStop(
                            split + t * HEAD_COLOR_RATIO,
                            char.gradientSet[Math.min(i, char.gradientSet.length - 1)]
                        );
                    }
                    lineStrokeStyle = gradient;
                }

                if (char.alpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = char.alpha;

                    if (snakeVisibleStartDist < snakeVisibleEndDist) {
                        drawPathSegment(ctx, path, snakeVisibleStartDist, snakeVisibleEndDist, lineStrokeStyle, STREAM_LINE_WIDTH);
                    }
                    ctx.restore();

                    ctx.save();
                    ctx.globalAlpha = char.alpha;
                    const totalBoxVisualWidth = CHAR_BOX_CONTENT_WIDTH + CHAR_BOX_PADDING * 2;
                    const totalBoxVisualHeight = CHAR_BOX_CONTENT_HEIGHT + CHAR_BOX_PADDING * 2;
                    const boxCenterX = char.startX + totalBoxVisualWidth / 2;
                    const boxCenterY = char.startY + totalBoxVisualHeight / 2;

                    ctx.translate(boxCenterX, boxCenterY);
                    ctx.scale(char.scale, char.scale);
                    ctx.translate(-boxCenterX, -boxCenterY);

                    const borderRadius = 10;

                    ctx.fillStyle = '#FFFFFF';
                    ctx.beginPath();
                    ctx.roundRect(char.startX, char.startY, totalBoxVisualWidth, totalBoxVisualHeight, borderRadius);
                    ctx.fill();

                    let boxOutlineStyle: string | CanvasGradient = char.gradientSet[0];
                    const boxGradient = ctx.createLinearGradient(
                        char.startX,
                        char.startY,
                        char.startX + totalBoxVisualWidth,
                        char.startY + totalBoxVisualHeight
                    );
                    char.gradientSet.forEach((color, index) => {
                        boxGradient.addColorStop(Math.min(1, index / (char.gradientSet.length - 1 || 1)), color);
                    });
                    boxOutlineStyle = boxGradient;

                    if (char.isRetractingColorOverride) {
                        boxOutlineStyle = GRAY_COLOR;
                    }

                    ctx.strokeStyle = boxOutlineStyle;
                    ctx.lineWidth = STREAM_LINE_WIDTH;
                    ctx.beginPath();
                    ctx.roundRect(char.startX, char.startY, totalBoxVisualWidth, totalBoxVisualHeight, borderRadius);
                    ctx.stroke();

                    const charImg = char.charImage;
                    if (charImg.width > 0 && charImg.height > 0 && offscreenCtx) {
                        offscreenCanvas.width = charImg.width;
                        offscreenCanvas.height = charImg.height;
                        offscreenCtx.putImageData(charImg, 0, 0);

                        let drawnImgWidth = charImg.width;
                        let drawnImgHeight = charImg.height;

                        if (charImg.width > CHAR_BOX_CONTENT_WIDTH || charImg.height > CHAR_BOX_CONTENT_HEIGHT) {
                            const widthScaleRatio = CHAR_BOX_CONTENT_WIDTH / charImg.width;
                            const heightScaleRatio = CHAR_BOX_CONTENT_HEIGHT / charImg.height;
                            const fitScale = Math.min(widthScaleRatio, heightScaleRatio);
                            drawnImgWidth = charImg.width * fitScale;
                            drawnImgHeight = charImg.height * fitScale;
                        }

                        const imgDrawX = char.startX + CHAR_BOX_PADDING + (CHAR_BOX_CONTENT_WIDTH - drawnImgWidth) / 2;
                        const imgDrawY = char.startY + CHAR_BOX_PADDING + (CHAR_BOX_CONTENT_HEIGHT - drawnImgHeight) / 2;

                        ctx.drawImage(offscreenCanvas, 0, 0, charImg.width, charImg.height, imgDrawX, imgDrawY, drawnImgWidth, drawnImgHeight);
                    }
                    ctx.restore();
                }
            });

            animationFrameId.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [containerSize, characters]);

    return (
        <canvas
            ref={canvasRef}
            width={containerSize.width}
            height={containerSize.height}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }}
        />
    );
};

export default CharacterStreamViz;
