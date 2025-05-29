// src/components/visualizations/CharacterStreamViz.tsx
import React, { useEffect, useRef } from 'react';
import { StreamCharacter } from '../../types';
import gsap from 'gsap';
import { log } from '../../utils/logger';
import {
    CHAR_FADE_IN_DURATION,
    CHAR_FADE_OUT_DELAY,
    CHAR_FADE_OUT_DURATION,
    CHAR_BOX_CONTENT_WIDTH,
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING,
    // PULSE_LENGTH_RATIO, // No longer needed
    // PULSE_ANIMATION_DURATION, // No longer needed
    // PULSE_COLOR, // No longer needed
} from '../../config/animation';
import { PathManager } from '../../utils/path'; 

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

    const GRAY_COLOR = '#AAAAAA'; 

    useEffect(() => {
        characters.forEach((character) => {
            if (initiatedAnimations.current.has(character.id)) {
                return;
            }

            initiatedAnimations.current.add(character.id);
            log(`[CharacterStreamViz] Initiating animation for character ID: ${character.id}`);
            
            character.animationState = 'traveling';
            character.isRetractingColorOverride = false; 
            
            const lineGrowDuration = 0.4; 
            const lineShrinkDuration = 0.4;
            const characterShrinkScale = 0.3; 

            const tl = gsap.timeline({
                onComplete: () => {
                    log(`[CharacterStreamViz] GSAP Timeline complete for character ID: ${character.id}`);
                    initiatedAnimations.current.delete(character.id);
                    onCharacterFinished(character.id);
                }
            });

            tl.to(character, {
                alpha: 1,
                scale: 1,
                duration: CHAR_FADE_IN_DURATION,
                ease: 'power1.out',
            });
            
            // Removed pulse animation for character.pulseProgress

            tl.to(character, {
                headProgress: 1,
                duration: lineGrowDuration,
                ease: 'linear',
                onComplete: () => {
                     character.onFinished(); 
                }
            }, CHAR_FADE_IN_DURATION); 

            const lineShrinkTl = gsap.timeline();
            lineShrinkTl.to(character, {
                tailProgress: 1,
                duration: lineShrinkDuration,
                ease: 'linear',
                onStart: () => {
                    character.isRetractingColorOverride = true; 
                },
            });
            lineShrinkTl.to(character, {
                // color: GRAY_COLOR, // Line color is now always gradient, box outline turns gray
                scale: characterShrinkScale,
                duration: lineShrinkDuration, 
                ease: 'power1.inOut'
            }, 0); 

            tl.add(lineShrinkTl, CHAR_FADE_IN_DURATION + lineGrowDuration); 

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
            ctx.clearRect(0, 0, containerSize.width, containerSize.height);

            characters.forEach((char) => {
                if (char.alpha < 0.01 && char.animationState === 'fading') return;

                const path = char.path;
                const snakeVisibleStartDist = char.tailProgress * path.totalLength;
                const snakeVisibleEndDist = char.headProgress * path.totalLength;
                
                // Create the gradient for the line
                let lineStrokeStyle: string | CanvasGradient = char.gradientSet[0]; // Fallback
                if (path.totalLength > 0) {
                    const p0 = path.getPointAt(0);
                    const p2 = path.getPointAt(path.totalLength);
                    const gradient = ctx.createLinearGradient(p0.x, p0.y, p2.x, p2.y);
                    char.gradientSet.forEach((color, index) => {
                        gradient.addColorStop(Math.min(1, index / (char.gradientSet.length -1 || 1)), color);
                    });
                    lineStrokeStyle = gradient;
                }
                // Line should NOT turn gray, always use its gradient.
                // if(char.isRetractingColorOverride) { 
                //     lineStrokeStyle = GRAY_COLOR; // This line is removed/commented
                // }

                if (char.alpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = char.alpha; 

                    // Draw the entire visible snake line with its gradient
                    if (snakeVisibleStartDist < snakeVisibleEndDist) {
                        drawPathSegment(ctx, path, snakeVisibleStartDist, snakeVisibleEndDist, lineStrokeStyle, 3);
                    }
                    ctx.restore(); 

                    // Draw character box and image
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
                    
                    let boxOutlineStyle: string | CanvasGradient = char.gradientSet[0]; // Fallback
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

                    if(char.isRetractingColorOverride) { // Box outline DOES turn gray
                        boxOutlineStyle = GRAY_COLOR;
                    }
                    
                    ctx.strokeStyle = boxOutlineStyle;
                    ctx.lineWidth = 2.5;
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
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, pointerEvents: 'none' }}
        />
    );
};

export default CharacterStreamViz;