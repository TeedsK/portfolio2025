// src/components/visualizations/CharacterStreamViz.tsx
import React, { useEffect, useRef } from 'react';
import { StreamCharacter } from '../../types';
import gsap from 'gsap';
import { log } from '../../utils/logger';
import {
    CHAR_FADE_IN_DURATION,
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

    const GRAY_COLOR = '#AAAAAA'; // Define gray color for retraction phase

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
            const characterShrinkScale = 0.3; // Scale to shrink to during retraction

            const tl = gsap.timeline({
                onComplete: () => {
                    log(`[CharacterStreamViz] GSAP Timeline complete for character ID: ${character.id}`);
                    initiatedAnimations.current.delete(character.id);
                    onCharacterFinished(character.id);
                }
            });

            // 1. Fade in character box and scale it up
            tl.to(character, {
                alpha: 1,
                scale: 1,
                duration: CHAR_FADE_IN_DURATION,
                ease: 'power1.out',
                onStart: () => log(`[CharacterStreamViz] Fade-in started for ${character.id}`),
            });
            
            // 2. Line Growth Phase: Animate headProgress from 0 to 1.
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

            // 3. Line Shrink Phase & Character Graying/Shrinking: Animate tailProgress.
            // This starts immediately after the head has finished growing.
            const lineShrinkTl = gsap.timeline();
            lineShrinkTl.to(character, {
                tailProgress: 1,
                duration: lineShrinkDuration,
                ease: 'linear',
                onStart: () => log(`[CharacterStreamViz] Line shrink (tail moving) started for ${character.id}`),
                onComplete: () => log(`[CharacterStreamViz] Line shrink complete for ${character.id}`),
            });
            // Parallel animation for graying and shrinking the character box
            lineShrinkTl.to(character, {
                color: GRAY_COLOR,
                scale: characterShrinkScale,
                duration: lineShrinkDuration, // Match line shrink duration
                ease: 'power1.inOut'
            }, 0); // Start at the same time as tailProgress animation

            tl.add(lineShrinkTl, ">"); // Add this sub-timeline after headProgress finishes

            // 4. Final Fade out character box and scale it down (if not already at 0 scale)
            tl.to(character, {
                alpha: 0,
                scale: 0, // Ensure it scales completely out
                duration: CHAR_FADE_OUT_DURATION,
                ease: 'power1.in',
                delay: CHAR_FADE_OUT_DELAY, 
                onStart: () => {
                    log(`[CharacterStreamViz] Character box final fade-out started for ${character.id}`);
                    character.animationState = 'fading';
                    if(character.color !== GRAY_COLOR) character.color = GRAY_COLOR; // Ensure gray on fade if somehow missed
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