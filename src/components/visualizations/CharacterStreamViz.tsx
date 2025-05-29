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
} from '../../config/animation';

interface CharacterStreamVizProps {
    characters: StreamCharacter[];
    containerSize: { width: number; height: number };
    onCharacterFinished: (id: string) => void;
}

const offscreenCanvas = document.createElement('canvas');
const offscreenCtx = offscreenCanvas.getContext('2d');

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
                onStart: () => log(`[CharacterStreamViz] Fade-in started for ${character.id}`),
            });
            
            tl.to(character, {
                headProgress: 1,
                duration: lineGrowDuration,
                ease: 'linear',
                onStart: () => log(`[CharacterStreamViz] Line growth (head moving) started for ${character.id}`),
                onComplete: () => {
                     log(`[CharacterStreamViz] Line growth complete (head reached end) for ${character.id}. Firing onFinished for network graph.`);
                     character.onFinished(); 
                }
            }, ">"); 

            const lineShrinkTl = gsap.timeline();
            lineShrinkTl.to(character, {
                tailProgress: 1,
                duration: lineShrinkDuration,
                ease: 'linear',
                onStart: () => log(`[CharacterStreamViz] Line shrink (tail moving) started for ${character.id}`),
                onComplete: () => log(`[CharacterStreamViz] Line shrink complete for ${character.id}`),
            });
            lineShrinkTl.to(character, {
                color: GRAY_COLOR,
                scale: characterShrinkScale,
                duration: lineShrinkDuration, 
                ease: 'power1.inOut'
            }, 0); 

            tl.add(lineShrinkTl, ">"); 

            tl.to(character, {
                alpha: 0,
                scale: 0, 
                duration: CHAR_FADE_OUT_DURATION,
                ease: 'power1.in',
                delay: CHAR_FADE_OUT_DELAY, 
                onStart: () => {
                    log(`[CharacterStreamViz] Character box final fade-out started for ${character.id}`);
                    character.animationState = 'fading';
                    if(character.color !== GRAY_COLOR) character.color = GRAY_COLOR; 
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
                const shouldDrawLine = char.headProgress > char.tailProgress || (char.headProgress === 1 && char.tailProgress < 1);

                if (char.alpha < 0.01 && char.animationState === 'fading') return;

                if (shouldDrawLine && char.alpha > 0) {
                    ctx.save();
                    ctx.globalAlpha = char.alpha; 
                    ctx.beginPath();
                    
                    const path = char.path;
                    const segments = 30; 
                    const startDistance = char.tailProgress * path.totalLength;
                    const endDistance = char.headProgress * path.totalLength;
                    
                    if (endDistance > startDistance && path.totalLength > 0) {
                        const step = (endDistance - startDistance) / segments;
                        let firstPoint = true;
                        for (let i = 0; i <= segments; i++) {
                            const dist = startDistance + i * step;
                            const point = path.getPointAt(dist);
                            if (firstPoint) {
                                ctx.moveTo(point.x, point.y);
                                firstPoint = false;
                            } else {
                                ctx.lineTo(point.x, point.y);
                            }
                        }
                        ctx.strokeStyle = char.color; 
                        ctx.lineWidth = 3;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round'; 
                        ctx.stroke();
                    }
                    ctx.restore();
                }

                if (char.alpha > 0) { 
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
                    
                    ctx.strokeStyle = char.color; 
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
                        let fitScale = 1;

                        if (charImg.width > CHAR_BOX_CONTENT_WIDTH || charImg.height > CHAR_BOX_CONTENT_HEIGHT) {
                            const widthScaleRatio = CHAR_BOX_CONTENT_WIDTH / charImg.width;
                            const heightScaleRatio = CHAR_BOX_CONTENT_HEIGHT / charImg.height;
                            fitScale = Math.min(widthScaleRatio, heightScaleRatio);
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