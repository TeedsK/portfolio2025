// src/components/visualizations/CharacterStreamViz.tsx
import React, { useEffect, useRef } from 'react';
import { StreamCharacter } from '../../types';
import gsap from 'gsap';
import { log } from '../../utils/logger';
import {
    CHAR_FADE_IN_DURATION,
    CHAR_LINE_DRAW_DURATION,
    CHAR_FADE_OUT_DELAY,
    CHAR_FADE_OUT_DURATION,
} from '../../config/animation';

interface CharacterStreamVizProps {
    characters: StreamCharacter[];
    containerSize: { width: number; height: number };
    onCharacterFinished: (id: string) => void;
}

const CharacterStreamViz: React.FC<CharacterStreamVizProps> = ({ characters, containerSize, onCharacterFinished }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameId = useRef<number>();
    const initiatedAnimations = useRef(new Set<string>());

    useEffect(() => {
        characters.forEach((character) => {
            if (initiatedAnimations.current.has(character.id)) {
                return;
            }

            initiatedAnimations.current.add(character.id);
            log(`[CharacterStreamViz] Initiating animation for character ID: ${character.id}`);

            const tl = gsap.timeline({
                onComplete: () => {
                    log(`[CharacterStreamViz] Animation complete for character ID: ${character.id}`);
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

            character.animationState = 'drawingLine';
            for (let i = 0; i < character.path.length - 1; i++) {
                const segmentEndPoint = character.path[i + 1];
                tl.to(character.lineEnd, {
                    x: segmentEndPoint.x,
                    y: segmentEndPoint.y,
                    duration: CHAR_LINE_DRAW_DURATION,
                    ease: 'linear',
                    onComplete: () => {
                        character.completedSegments = i + 1;
                    }
                });
            }

            tl.call(() => {
                log(`[CharacterStreamViz] Line drawn for ${character.id}, firing onFinished callback.`);
                character.onFinished();
                character.animationState = 'atCentralPoint';
            });
            
            tl.to(character, {
                alpha: 0,
                scale: 0,
                duration: CHAR_FADE_OUT_DURATION,
                ease: 'power1.in',
                delay: CHAR_FADE_OUT_DELAY,
                onStart: () => {
                    log(`[CharacterStreamViz] Fade-out started for ${character.id}`);
                    character.animationState = 'fading';
                },
            });

        });
    }, [characters, onCharacterFinished]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, containerSize.width, containerSize.height);

            characters.forEach((char) => {
                if (char.alpha < 0.01) return;
                
                // --- 1. Draw the connecting line (UNDERNEATH) ---
                ctx.save();
                ctx.globalAlpha = char.alpha;
                ctx.beginPath();
                
                const P0 = char.path[0]; // Start point
                const P1 = char.path[1]; // Corner point
                const P2 = char.path[2]; // End point
                const cornerRadius = 15; // The radius of the rounded corner

                // If we are animating the first segment (from P0 to P1)
                if (char.completedSegments === 0) {
                    ctx.moveTo(P0.x, P0.y);
                    ctx.lineTo(char.lineEnd.x, char.lineEnd.y);
                } else { // If we are past the first segment
                    // Draw the complete first segment and the rounded corner
                    ctx.moveTo(P0.x, P0.y);
                    ctx.arcTo(P1.x, P1.y, P2.x, P2.y, cornerRadius);

                    // Now continue the line to the current animated endpoint or the final point
                    if (char.animationState === 'drawingLine') {
                        // The "pen" is now at the end of the arc, so we just draw to the animated end point
                        ctx.lineTo(char.lineEnd.x, char.lineEnd.y);
                    } else {
                        // The animation is done, draw the full final segment
                        ctx.lineTo(P2.x, P2.y);
                    }
                }
                
                ctx.strokeStyle = char.color;
                ctx.lineWidth = 3; // A thicker line to make the curve more apparent
                ctx.lineCap = 'round'; // Still useful for the start of the line
                ctx.stroke();
                ctx.restore();

                // --- 2. Draw the character box and image (ON TOP) ---
                ctx.save();
                ctx.globalAlpha = char.alpha;

                const centerX = char.startX + char.charImage.width / 2;
                const centerY = char.startY + char.charImage.height / 2;
                ctx.translate(centerX, centerY);
                ctx.scale(char.scale, char.scale);
                ctx.translate(-centerX, -centerY);

                const padding = 8;
                const borderRadius = 10;
                const rectX = char.startX - padding;
                const rectY = char.startY - padding;
                const rectWidth = char.charImage.width + padding * 2;
                const rectHeight = char.charImage.height + padding * 2;
                
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.fill();
                
                ctx.strokeStyle = char.color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.stroke();
                
                ctx.putImageData(char.charImage, char.startX, char.startY);
                
                ctx.restore();
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