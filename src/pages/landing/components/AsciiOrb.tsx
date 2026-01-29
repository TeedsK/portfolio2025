// src/pages/landing/components/AsciiOrb.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

type Props = {
  show: boolean;
  bodyLength?: number;
  speed?: number;
  baseThickness?: number;
  minZ?: number;  // Furthest (smallest)
  maxZ?: number;  // Closest (largest)
};

// Characters ordered by "elevation" - @ is highest/closest, . is lowest/deepest
const DEPTH_CHARS_CLOSE = ['@', '#', '#', '%', '%', '*', '+', '=', '-', ':'];
const DEPTH_CHARS_FAR = ['*', '+', '=', '-', '-', ':', ':', '.', '.', '.'];

// Get character based on surface depth and Z depth
const getDepthChar = (surfaceDepth: number, zDepth: number): string => {
  const charIdx = Math.floor((1 - surfaceDepth) * 9);
  const idx = Math.max(0, Math.min(charIdx, 9));

  // Blend between close and far character sets based on Z
  if (zDepth > 0.7) return DEPTH_CHARS_CLOSE[idx];
  if (zDepth < 0.3) return DEPTH_CHARS_FAR[idx];

  // Middle range - use close chars but simplified
  const midChars = ['#', '%', '*', '*', '+', '=', '-', ':', '.', '.'];
  return midChars[idx];
};

// Get color based on depth and Z position
const getDepthColor = (surfaceDepth: number, zDepth: number, fade: number = 1): string => {
  // Z affects overall intensity
  const zIntensity = 0.3 + zDepth * 0.7; // 0.3 when far, 1.0 when close

  const alpha = (0.15 + surfaceDepth * 0.6 + zDepth * 0.25) * fade * zIntensity;
  const lightness = 30 + surfaceDepth * 30 + zDepth * 15; // Brighter when close
  const saturation = 25 + surfaceDepth * 35 + zDepth * 25; // More saturated when close

  return `hsla(125, ${saturation}%, ${lightness}%, ${Math.min(1, alpha)})`;
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
    Math.sin(along * 8 + time * 3) * 0.12 +
    Math.sin(around * 4 + time * 2) * 0.08 +
    Math.sin(along * 3 - time * 1.5) * 0.08
  );
};

type BodySegment = {
  x: number;
  y: number;
  z: number; // 0 = far, 1 = close
  time: number;
};

const AsciiOrb: React.FC<Props> = ({
  show,
  bodyLength = 150,
  speed = 1,
  baseThickness = 7,
  minZ = 0.2,
  maxZ = 1.0,
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
    z: Math.random() * 100,
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

      // Calculate Z position (depth in 3D space)
      const noiseZ = noise1D(t * 0.25, seedRef.current.z);
      const currentZ = minZ + (maxZ - minZ) * (noiseZ * 0.5 + 0.5);

      // Margin adjusts based on Z (bigger snake needs more margin)
      const currentThickness = baseThickness * (0.5 + currentZ * 0.8);
      const margin = currentThickness * 3;

      // Snake head position - smooth slithering motion
      const noiseX = noise1D(t * 0.55, seedRef.current.x);
      const noiseY = noise1D(t * 0.45, seedRef.current.y);

      // Extra wiggle for snake-like movement
      const wiggleX = Math.sin(t * 2.5) * 0.06;
      const wiggleY = Math.cos(t * 2.2) * 0.05;

      const headX = margin + (width - margin * 2) * ((noiseX + wiggleX) * 0.5 + 0.5);
      const headY = margin + (height - margin * 2) * ((noiseY + wiggleY) * 0.5 + 0.5);

      // Add new head position with Z
      bodyRef.current.unshift({ x: headX, y: headY, z: currentZ, time: t });

      // Keep body at fixed length
      if (bodyRef.current.length > bodyLength) {
        bodyRef.current = bodyRef.current.slice(0, bodyLength);
      }

      // Create grid with Z-buffer for proper depth sorting
      const grid: { char: string; color: string; priority: number }[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          grid[y][x] = { char: ' ', color: 'transparent', priority: -1 };
        }
      }

      const body = bodyRef.current;
      if (body.length < 2) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      // Sort segments by Z for proper rendering (far to near)
      const sortedIndices = body.map((_, i) => i).sort((a, b) => body[a].z - body[b].z);

      // Render snake body (far to near so close parts overwrite)
      for (const i of sortedIndices) {
        const segment = body[i];
        const bodyPos = i / (body.length - 1); // 0 = head, 1 = tail

        // Body thickness based on Z and taper
        const taperFactor = 1 - bodyPos * 0.5;
        const zScale = 0.4 + segment.z * 0.9; // Far = 0.4x, Close = 1.3x
        const segmentThickness = baseThickness * taperFactor * zScale;

        // Fade factor for tail
        const fadeFactor = 1 - bodyPos * 0.8;

        // Z-based priority (for depth sorting within grid)
        const basePriority = segment.z * 100;

        // Render this segment as a 3D tube cross-section
        const radiusX = segmentThickness * 2;
        const radiusY = segmentThickness;

        for (let dy = -Math.ceil(radiusY); dy <= Math.ceil(radiusY); dy++) {
          for (let dx = -Math.ceil(radiusX); dx <= Math.ceil(radiusX); dx++) {
            const px = Math.round(segment.x) + dx;
            const py = Math.round(segment.y) + dy;

            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            // Check if inside ellipse
            const normalizedX = dx / radiusX;
            const normalizedY = dy / radiusY;
            const dist = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);

            if (dist <= 1) {
              // Calculate 3D surface depth on tube
              const tubeDepth = Math.sqrt(Math.max(0, 1 - dist * dist));

              // Add surface waves
              const alongBody = bodyPos;
              const aroundBody = Math.atan2(normalizedY, normalizedX) / Math.PI;
              const wave = surfaceWave(alongBody * 10, aroundBody, segment.time);

              let surfaceDepth = tubeDepth + wave;
              surfaceDepth = Math.max(0, Math.min(1, surfaceDepth));

              // Priority combines Z depth and surface depth
              const priority = basePriority + surfaceDepth * 10;

              // Only draw if higher priority than existing
              if (priority > grid[py][px].priority) {
                const char = getDepthChar(surfaceDepth, segment.z);
                const color = getDepthColor(surfaceDepth, segment.z, fadeFactor);

                grid[py][px] = { char, color, priority };
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
  }, [isVisible, dimensions, bodyLength, speed, baseThickness, minZ, maxZ]);

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
