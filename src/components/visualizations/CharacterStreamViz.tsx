// src/components/visualizations/CharacterStreamViz.tsx
import React, { useEffect, useRef } from 'react';
import { StreamCharacter } from '../../types';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

interface CharacterStreamVizProps {
    character: StreamCharacter | null;
    containerSize: { width: number; height: number };
}

const CharacterStreamViz: React.FC<CharacterStreamVizProps> = ({ character, containerSize }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const charactersRef = useRef<StreamCharacter[]>([]);
    const animationFrameId = useRef<number>();

    useEffect(() => {
        if (character && !charactersRef.current.find(c => c.id === character.id)) {
            const newCharRef = {...character, alpha: 1}; // Ensure alpha is 1 for new char
            charactersRef.current.push(newCharRef); 

            const tl = gsap.timeline({
                onComplete: () => {
                    newCharRef.onFinished(); 
                    newCharRef.animationState = 'fading'; 
                    
                    gsap.to(newCharRef, { 
                        alpha: 0,
                        duration: 0.5, 
                        delay: 0.8, // Reduced delay slightly for responsiveness
                        ease: 'power1.out',
                        onComplete: () => {
                            charactersRef.current = charactersRef.current.filter(c => c.id !== newCharRef.id);
                        }
                    });
                }
            });

            tl.call(() => {
                newCharRef.animationState = 'drawingLine';
                newCharRef.completedSegments = 0;
            });

            // Animate line segments
            // The character image (newCharRef.startX, newCharRef.startY) remains static
            for (let i = 0; i < newCharRef.path.length - 1; i++) {
                const segmentEndPoint = newCharRef.path[i + 1];
                tl.to(newCharRef.lineEnd, {
                    x: segmentEndPoint.x,
                    y: segmentEndPoint.y,
                    duration: 0.4, 
                    ease: 'linear',
                    onComplete: () => {
                        newCharRef.completedSegments = i + 1;
                    }
                });
            }

            tl.call(() => {
                newCharRef.animationState = 'atCentralPoint';
            });
        }
    }, [character]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const render = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, containerSize.width, containerSize.height);

            charactersRef.current.forEach((char) => {
                if (char.alpha < 0.01 && char.animationState === 'fading') return;
                
                ctx.globalAlpha = char.alpha;

                const padding = 8;
                const borderRadius = 10;
                // Image is drawn at its static startX, startY
                const rectX = char.startX - padding;
                const rectY = char.startY - padding;
                const rectWidth = char.charImage.width + padding * 2;
                const rectHeight = char.charImage.height + padding * 2;
                
                ctx.fillStyle = 'rgba(255, 192, 203, 0.9)';
                ctx.beginPath();
                ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
                ctx.fill();
                
                ctx.putImageData(char.charImage, char.startX, char.startY);

                ctx.beginPath();
                for (let i = 0; i < char.completedSegments; i++) {
                    ctx.moveTo(char.path[i].x, char.path[i].y);
                    ctx.lineTo(char.path[i + 1].x, char.path[i + 1].y);
                }
                
                if (char.animationState === 'drawingLine' && char.path[char.completedSegments]) {
                     ctx.moveTo(char.path[char.completedSegments].x, char.path[char.completedSegments].y);
                     ctx.lineTo(char.lineEnd.x, char.lineEnd.y);
                } else if (char.animationState === 'atCentralPoint' || char.animationState === 'fading') {
                     for (let i = 0; i < char.path.length - 1; i++) {
                        ctx.moveTo(char.path[i].x, char.path[i].y);
                        ctx.lineTo(char.path[i + 1].x, char.path[i + 1].y);
                    }
                }
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.globalAlpha = 1; 
            });
            
            animationFrameId.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            gsap.killTweensOf(charactersRef.current.map(c => [c, c.lineEnd]));
        };
    }, [containerSize]);

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