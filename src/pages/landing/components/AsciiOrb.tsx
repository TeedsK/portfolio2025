// src/pages/landing/components/AsciiOrb.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

type Props = {
  show: boolean;
  bodyLength?: number;
  speed?: number;
  thickness?: number;
};

// Characters ordered by "elevation" - @ is highest/closest, . is lowest/deepest
const DEPTH_CHARS = ['@', '#', '%', '*', '+', '=', '-', ':', '.'];

// Get color based on depth (0 = deepest/far, 1 = highest/close)
const getDepthColor = (depth: number, fade: number = 1): string => {
  const alpha = (0.2 + depth * 0.8) * fade;
  const lightness = 35 + depth * 35;
  const saturation = 35 + depth * 45;
  return `hsla(125, ${saturation}%, ${lightness}%, ${alpha})`;
};

// Smooth noise for movement
const noise1D = (t: number, seed: number): number => {
  return (
    Math.sin(t * 0.9 + seed) * 0.4 +
    Math.sin(t * 1.7 + seed * 2.1) * 0.35 +
    Math.sin(t * 0.5 + seed * 0.7) * 0.25
  );
};

// Surface waves for 3D effect on the body
const surfaceWave = (along: number, around: number, time: number): number => {
  return (
    Math.sin(along * 8 + time * 3) * 0.15 +
    Math.sin(around * 4 + time * 2) * 0.1 +
    Math.sin(along * 3 - time * 1.5) * 0.1
  );
};

type BodySegment = {
  x: number;
  y: number;
  time: number;
};

const AsciiOrb: React.FC<Props> = ({
  show,
  bodyLength = 120,
  speed = 1,
  thickness = 8,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLPreElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 140, height: 55 });

  const timeRef = useRef(0);
  const bodyRef = useRef<BodySegment[]>([]);
  const seedRef = useRef({
    x: Math.random() * 100,
    y: Math.random() * 100,
  });

  // Measure container
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const charWidth = 7;
        const charHeight = 13;
        setDimensions({
          width: Math.max(80, Math.floor(rect.width / charWidth)),
          height: Math.max(35, Math.floor(rect.height / charHeight)),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isVisible]);

  // Animation loop
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    let animationId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      timeRef.current += deltaTime * speed;
      const t = timeRef.current;

      const { width, height } = dimensions;
      const margin = thickness * 3;

      // Snake head position - smooth slithering motion
      const noiseX = noise1D(t * 0.6, seedRef.current.x);
      const noiseY = noise1D(t * 0.5, seedRef.current.y);

      // Add extra wiggle for snake-like movement
      const wiggleX = Math.sin(t * 2.5) * 0.08;
      const wiggleY = Math.cos(t * 2.2) * 0.06;

      const headX = margin + (width - margin * 2) * ((noiseX + wiggleX) * 0.5 + 0.5);
      const headY = margin + (height - margin * 2) * ((noiseY + wiggleY) * 0.5 + 0.5);

      // Add new head position
      bodyRef.current.unshift({ x: headX, y: headY, time: t });

      // Keep body at fixed length
      if (bodyRef.current.length > bodyLength) {
        bodyRef.current = bodyRef.current.slice(0, bodyLength);
      }

      // Create grid
      const grid: { char: string; color: string; depth: number }[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          grid[y][x] = { char: ' ', color: 'transparent', depth: -1 };
        }
      }

      const body = bodyRef.current;
      if (body.length < 2) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      // Render snake body (tail to head so head overwrites)
      for (let i = body.length - 1; i >= 0; i--) {
        const segment = body[i];
        const bodyPos = i / (body.length - 1); // 0 = head, 1 = tail

        // Body thickness tapers toward tail
        const taperFactor = 1 - bodyPos * 0.6;
        const segmentThickness = thickness * taperFactor;

        // Fade factor for tail
        const fadeFactor = 1 - bodyPos * 0.85;

        // Render this segment as a 3D tube cross-section
        const radiusX = segmentThickness * 2; // Wider for char aspect ratio
        const radiusY = segmentThickness;

        for (let dy = -Math.ceil(radiusY); dy <= Math.ceil(radiusY); dy++) {
          for (let dx = -Math.ceil(radiusX); dx <= Math.ceil(radiusX); dx++) {
            const px = Math.round(segment.x) + dx;
            const py = Math.round(segment.y) + dy;

            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            // Check if inside ellipse (snake body cross-section)
            const normalizedX = dx / radiusX;
            const normalizedY = dy / radiusY;
            const dist = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);

            if (dist <= 1) {
              // Calculate 3D depth - tube/cylinder shape
              // Center of tube is highest, edges curve away
              const tubeDepth = Math.sqrt(Math.max(0, 1 - dist * dist));

              // Add surface waves for organic movement
              const alongBody = bodyPos; // Position along snake
              const aroundBody = Math.atan2(normalizedY, normalizedX) / Math.PI; // -1 to 1
              const wave = surfaceWave(alongBody * 10, aroundBody, segment.time);

              let depth = tubeDepth + wave;
              depth = Math.max(0, Math.min(1, depth));

              // Apply fade for tail sections
              const effectiveDepth = depth * fadeFactor;

              // Only draw if higher than existing
              if (effectiveDepth > grid[py][px].depth) {
                const charIdx = Math.floor((1 - depth) * (DEPTH_CHARS.length - 0.5));
                const char = DEPTH_CHARS[Math.max(0, Math.min(charIdx, DEPTH_CHARS.length - 1))];

                grid[py][px] = {
                  char,
                  color: getDepthColor(depth, fadeFactor),
                  depth: effectiveDepth,
                };
              }
            }
          }
        }
      }

      // Render to canvas
      if (canvasRef.current) {
        const lines: string[] = [];
        for (let y = 0; y < height; y++) {
          const lineChars = grid[y].map((cell) => {
            if (cell.char === ' ') return ' ';
            return `<span style="color:${cell.color}">${cell.char}</span>`;
          });
          lines.push(lineChars.join(''));
        }
        canvasRef.current.innerHTML = lines.join('\n');
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isVisible, dimensions, bodyLength, speed, thickness]);

  // Show/hide
  useEffect(() => {
    if (!containerRef.current) return;

    if (show) {
      setIsVisible(true);
      bodyRef.current = [];
      gsap.fromTo(
        containerRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 1.5, ease: 'power2.out', delay: 0.3 }
      );
    } else {
      gsap.to(containerRef.current, {
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => setIsVisible(false),
      });
    }
  }, [show]);

  const containerStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    opacity: 0,
    pointerEvents: 'none',
    zIndex: 1,
    overflow: 'hidden',
  }), []);

  const preStyle: React.CSSProperties = useMemo(() => ({
    fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    fontSize: '12px',
    lineHeight: '1.1',
    letterSpacing: '0.02em',
    margin: 0,
    padding: 0,
    whiteSpace: 'pre',
    userSelect: 'none',
  }), []);

  if (!show && !isVisible) return null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden="true">
      <pre ref={canvasRef} style={preStyle} />
    </div>
  );
};

export default AsciiOrb;
