// src/pages/landing/components/AsciiOrb.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import gsap from 'gsap';

type Props = {
  show: boolean;
  size?: number;
  animationSpeed?: number;
  morphSpeed?: number;
  shapeDuration?: number;
};

// Character palette - more gradations for better detail at larger sizes
const CHARS = '  ..-::=+*#%@';

// Green color with intensity
const getGreenColor = (intensity: number): string => {
  const alpha = 0.25 + intensity * 0.75;
  const lightness = 75 - intensity * 40;
  const saturation = 35 + intensity * 50;
  return `hsla(125, ${saturation}%, ${lightness}%, ${alpha})`;
};

// 2D shape definitions - using polar coordinates for clearer shapes
// Returns radius at given angle (0 = center, 1 = edge of unit circle)
type Shape2D = (angle: number, time: number) => number;

const shapes: { name: string; fn: Shape2D; scale: number }[] = [
  // Circle/Sphere
  {
    name: 'circle',
    scale: 1.0,
    fn: () => 1.0,
  },
  // Star (5-pointed)
  {
    name: 'star',
    scale: 1.1,
    fn: (angle) => {
      const points = 5;
      const inner = 0.4;
      const outer = 1.0;
      const a = angle % (Math.PI * 2 / points);
      const mid = Math.PI / points;
      const t = Math.abs(a - mid) / mid;
      return inner + (outer - inner) * (1 - t);
    },
  },
  // Heart
  {
    name: 'heart',
    scale: 0.9,
    fn: (angle) => {
      const a = angle - Math.PI / 2;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      // Heart parametric formula
      return (2 - 2 * sin + sin * Math.sqrt(Math.abs(cos)) / (sin + 1.4)) / 3;
    },
  },
  // Question mark (approximated)
  {
    name: 'question',
    scale: 1.0,
    fn: (angle, time) => {
      const a = angle;
      // Create hook at top
      if (a > Math.PI * 0.2 && a < Math.PI * 1.3) {
        const hookT = (a - Math.PI * 0.2) / (Math.PI * 1.1);
        return 0.7 + Math.sin(hookT * Math.PI) * 0.35;
      }
      // Stem
      if (a >= Math.PI * 1.3 && a < Math.PI * 1.7) {
        return 0.3;
      }
      // Dot at bottom
      if (a >= Math.PI * 1.7 || a < Math.PI * 0.2) {
        const dotAngle = a >= Math.PI * 1.7 ? a - Math.PI * 1.85 : a + Math.PI * 0.15;
        return 0.2 + Math.cos(dotAngle * 5) * 0.15;
      }
      return 0.5;
    },
  },
  // Arrow pointing right
  {
    name: 'arrow',
    scale: 1.0,
    fn: (angle) => {
      const a = ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
      // Arrow head (right side)
      if (Math.abs(a) < Math.PI * 0.4) {
        return 1.0 - Math.abs(a) / (Math.PI * 0.4) * 0.7;
      }
      // Arrow shaft
      if (Math.abs(a) > Math.PI * 0.7) {
        return 0.25;
      }
      return 0.3;
    },
  },
  // Smiley face
  {
    name: 'smiley',
    scale: 1.0,
    fn: (angle) => {
      // Base circle
      let r = 1.0;
      const a = angle;

      // Left eye indent
      const eyeLA = Math.PI * 0.65;
      const eyeDist = Math.abs(a - eyeLA);
      if (eyeDist < 0.3) {
        r -= (0.3 - eyeDist) * 0.5;
      }

      // Right eye indent
      const eyeRA = Math.PI * 0.35;
      const eyeRDist = Math.abs(a - eyeRA);
      if (eyeRDist < 0.3) {
        r -= (0.3 - eyeRDist) * 0.5;
      }

      // Smile indent (bottom curve)
      if (a > Math.PI * 1.2 && a < Math.PI * 1.8) {
        const smileT = (a - Math.PI * 1.2) / (Math.PI * 0.6);
        r -= Math.sin(smileT * Math.PI) * 0.2;
      }

      return r;
    },
  },
  // Diamond
  {
    name: 'diamond',
    scale: 1.0,
    fn: (angle) => {
      const a = angle % (Math.PI / 2);
      const t = a / (Math.PI / 2);
      return 0.7 / (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    },
  },
  // Blob (organic shape)
  {
    name: 'blob',
    scale: 1.0,
    fn: (angle, time) => {
      return 0.8 +
        Math.sin(angle * 3 + time) * 0.15 +
        Math.cos(angle * 5 - time * 0.7) * 0.1 +
        Math.sin(angle * 2 + time * 1.3) * 0.12;
    },
  },
];

// Smooth interpolation
const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Organic noise for surface detail
const noise = (x: number, y: number, seed: number): number => {
  return (
    Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 + seed * 0.8) * 0.5 +
    Math.sin(x * 5.3 - seed * 0.5) * Math.cos(y * 4.1 + seed * 1.2) * 0.3 +
    Math.sin((x + y) * 2 + seed * 0.3) * 0.2
  ) * 0.15;
};

const AsciiOrb: React.FC<Props> = ({
  show,
  size = 70,
  animationSpeed = 1,
  morphSpeed = 1,
  shapeDuration = 5,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLPreElement>(null);
  const timeRef = useRef(0);
  const lightAngleRef = useRef(0);
  const [isVisible, setIsVisible] = useState(false);
  const shapeIndexRef = useRef(0);
  const transitionProgressRef = useRef(0);

  const radius = size / 2 - 2;
  const centerX = size / 2;
  const centerY = size / 2;

  const generateFrame = useCallback((
    time: number,
    lightAngle: number,
    currentShapeIdx: number,
    transitionProgress: number
  ): { char: string; color: string }[][] => {
    const grid: { char: string; color: string }[][] = [];

    // Initialize grid
    for (let y = 0; y < size; y++) {
      grid[y] = [];
      for (let x = 0; x < size; x++) {
        grid[y][x] = { char: ' ', color: 'transparent' };
      }
    }

    const nextShapeIdx = (currentShapeIdx + 1) % shapes.length;
    const currentShape = shapes[currentShapeIdx];
    const nextShape = shapes[nextShapeIdx];
    const t = smoothstep(transitionProgress);

    // Light direction
    const lightX = Math.cos(lightAngle);
    const lightY = Math.sin(lightAngle);

    // Render each pixel
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        // Convert to centered coordinates
        const x = (px - centerX) / radius;
        const y = (py - centerY) / (radius * 0.55); // Adjust for char aspect ratio

        // Distance from center
        const dist = Math.sqrt(x * x + y * y);

        // Angle from center
        const angle = Math.atan2(y, x) + Math.PI;

        // Get shape radius at this angle
        const r1 = currentShape.fn(angle, time) * currentShape.scale;
        const r2 = nextShape.fn(angle, time) * nextShape.scale;
        const shapeR = lerp(r1, r2, t);

        // Add organic noise
        const noiseVal = noise(x * 2, y * 2, time);
        const finalR = shapeR + noiseVal;

        // Check if point is inside shape
        if (dist < finalR) {
          // Calculate "depth" for 3D effect (sphere-like)
          const normalizedDist = dist / finalR;
          const depth = Math.sqrt(Math.max(0, 1 - normalizedDist * normalizedDist));

          // Surface normal for lighting
          const nx = x / (dist || 1);
          const ny = y / (dist || 1);

          // Lighting calculation
          const lightDot = nx * lightX + ny * lightY;
          const lightIntensity = Math.max(0, lightDot * 0.5 + 0.5);

          // Edge darkening
          const edgeFade = Math.pow(1 - normalizedDist, 0.3);

          // Combined intensity
          const intensity = depth * edgeFade * (0.4 + lightIntensity * 0.6);

          // Map to character
          const charIdx = Math.min(
            CHARS.length - 1,
            Math.max(0, Math.floor(intensity * CHARS.length))
          );

          if (CHARS[charIdx] !== ' ') {
            grid[py][px] = {
              char: CHARS[charIdx],
              color: getGreenColor(intensity),
            };
          }
        }
      }
    }

    return grid;
  }, [size, radius, centerX, centerY]);

  // Animation loop
  useEffect(() => {
    if (!isVisible || !canvasRef.current) return;

    let animationId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Update time
      timeRef.current += deltaTime * morphSpeed;
      lightAngleRef.current += deltaTime * animationSpeed * 0.8;

      // Update shape transition
      transitionProgressRef.current += deltaTime / shapeDuration;
      if (transitionProgressRef.current >= 1) {
        transitionProgressRef.current = 0;
        shapeIndexRef.current = (shapeIndexRef.current + 1) % shapes.length;
      }

      const frame = generateFrame(
        timeRef.current,
        lightAngleRef.current,
        shapeIndexRef.current,
        transitionProgressRef.current
      );

      // Render
      if (canvasRef.current) {
        const lines: string[] = [];
        frame.forEach((row) => {
          const lineChars = row.map((cell) => {
            if (cell.char === ' ') return ' ';
            return `<span style="color:${cell.color}">${cell.char}</span>`;
          });
          lines.push(lineChars.join(''));
        });
        canvasRef.current.innerHTML = lines.join('\n');
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isVisible, generateFrame, animationSpeed, morphSpeed, shapeDuration]);

  // Show/hide animation
  useEffect(() => {
    if (!containerRef.current) return;

    if (show) {
      setIsVisible(true);
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 1.2, ease: 'power2.out', delay: 0.2 }
      );
    } else {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 0.5,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => setIsVisible(false),
      });
    }
  }, [show]);

  const containerStyle: React.CSSProperties = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
  }), []);

  const preStyle: React.CSSProperties = useMemo(() => ({
    fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
    fontSize: '12px',
    lineHeight: '1.15',
    letterSpacing: '0.05em',
    margin: 0,
    padding: 0,
    whiteSpace: 'pre',
    userSelect: 'none',
    textShadow: '0 0 10px rgba(50, 205, 50, 0.4)',
  }), []);

  if (!show && !isVisible) return null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden="true">
      <pre ref={canvasRef} style={preStyle} />
    </div>
  );
};

export default AsciiOrb;
