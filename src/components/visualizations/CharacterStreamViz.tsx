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
                for (let i = 0; i < char.completedSegments; i++) {
                    ctx.moveTo(char.path[i].x, char.path[i].y);
                    ctx.lineTo(char.path[i + 1].x, char.path[i + 1].y);
                }
                if (char.animationState === 'drawingLine' && char.path[char.completedSegments]) {
                     ctx.moveTo(char.path[char.completedSegments].x, char.path[char.completedSegments].y);
                     ctx.lineTo(char.lineEnd.x, char.lineEnd.y);
                }
                ctx.strokeStyle = char.color; // Use the character's specific color
                ctx.lineWidth = 2;
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
                
                // White background
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.fill();
                
                // Colored outline
                ctx.strokeStyle = char.color; // Use the character's specific color
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.stroke();
                
                // Character image
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