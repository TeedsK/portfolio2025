// src/pages/landing/components/AsciiOrb.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import gsap from 'gsap';

type Props = {
  show: boolean;
  bodyLength?: number;
  speed?: number;
  baseThickness?: number;
  minZ?: number;
  maxZ?: number;
};

// Dense fill characters for solid appearance (brightest to darkest)
const SOLID_CHARS = ['█', '▓', '▒', '░'];
// Classic ASCII for detail and edge definition
const DETAIL_CHARS = ['@', '#', '%', '&', '*', '+', '=', '-', ':', '.'];

// Light direction (normalized) - top-left front lighting
const LIGHT_DIR = { x: -0.5, y: -0.7, z: 0.5 };
const lightMag = Math.sqrt(LIGHT_DIR.x ** 2 + LIGHT_DIR.y ** 2 + LIGHT_DIR.z ** 2);
const LIGHT_NORMALIZED = {
  x: LIGHT_DIR.x / lightMag,
  y: LIGHT_DIR.y / lightMag,
  z: LIGHT_DIR.z / lightMag,
};

// Lighting parameters
const AMBIENT = 0.15;
const DIFFUSE_STRENGTH = 0.6;
const SPECULAR_STRENGTH = 0.4;
const SHININESS = 32;

// Get character based on lighting intensity and z-depth
const getCharacter = (intensity: number, zDepth: number, isEdge: boolean): string => {
  // Clamp intensity
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  // Use solid chars for high intensity and middle areas, detail chars for edges/low intensity
  if (isEdge || clampedIntensity < 0.3) {
    const idx = Math.floor((1 - clampedIntensity) * (DETAIL_CHARS.length - 1));
    return DETAIL_CHARS[Math.max(0, Math.min(idx, DETAIL_CHARS.length - 1))];
  }

  // For solid areas, blend between solid and detail based on z and intensity
  if (clampedIntensity > 0.7 && zDepth > 0.5) {
    const solidIdx = Math.floor((1 - clampedIntensity) * (SOLID_CHARS.length - 1));
    return SOLID_CHARS[Math.max(0, Math.min(solidIdx, SOLID_CHARS.length - 1))];
  }

  // Medium intensity - use dense detail chars
  const detailIdx = Math.floor((1 - clampedIntensity) * 6);
  return DETAIL_CHARS[Math.max(0, Math.min(detailIdx, DETAIL_CHARS.length - 1))];
};

// Calculate Phong lighting
const calculateLighting = (
  normal: { x: number; y: number; z: number },
  viewDir: { x: number; y: number; z: number }
): { diffuse: number; specular: number; total: number } => {
  // Diffuse (Lambertian)
  const nDotL = Math.max(0,
    normal.x * LIGHT_NORMALIZED.x +
    normal.y * LIGHT_NORMALIZED.y +
    normal.z * LIGHT_NORMALIZED.z
  );
  const diffuse = nDotL * DIFFUSE_STRENGTH;

  // Specular (Blinn-Phong) - half vector
  const halfX = LIGHT_NORMALIZED.x + viewDir.x;
  const halfY = LIGHT_NORMALIZED.y + viewDir.y;
  const halfZ = LIGHT_NORMALIZED.z + viewDir.z;
  const halfMag = Math.sqrt(halfX ** 2 + halfY ** 2 + halfZ ** 2);

  let specular = 0;
  if (halfMag > 0) {
    const hx = halfX / halfMag;
    const hy = halfY / halfMag;
    const hz = halfZ / halfMag;
    const nDotH = Math.max(0, normal.x * hx + normal.y * hy + normal.z * hz);
    specular = Math.pow(nDotH, SHININESS) * SPECULAR_STRENGTH;
  }

  const total = AMBIENT + diffuse + specular;
  return { diffuse, specular, total: Math.min(1, total) };
};

// Get color with enhanced model
const getColor = (
  lighting: { diffuse: number; specular: number; total: number },
  zDepth: number,
  bodyPos: number,
  aoFactor: number
): string => {
  // Base hue varies along body (blue-green to yellow-green)
  const hue = 115 + bodyPos * 30 + zDepth * 5;

  // Saturation: more saturated when close and lit
  const saturation = 50 + lighting.total * 30 + zDepth * 20;

  // Lightness: much brighter for highlights
  const baseLightness = 30 + lighting.diffuse * 25 + zDepth * 15;
  const specularBoost = lighting.specular * 25;
  const lightness = Math.min(75, baseLightness + specularBoost);

  // Apply ambient occlusion
  const aoLightness = lightness * aoFactor;

  // Alpha: more opaque overall for solid look
  const alpha = 0.5 + lighting.total * 0.35 + zDepth * 0.15;

  // Add specular highlight color (bright white-green)
  if (lighting.specular > 0.3) {
    const specHue = hue - 10;
    const specSat = Math.max(30, saturation - lighting.specular * 40);
    const specLight = Math.min(85, aoLightness + lighting.specular * 20);
    return `hsla(${specHue}, ${specSat}%, ${specLight}%, ${Math.min(1, alpha)})`;
  }

  return `hsla(${hue}, ${saturation}%, ${aoLightness}%, ${Math.min(1, alpha)})`;
};

// Enhanced noise with multiple octaves for organic movement
const noise1D = (t: number, seed: number): number => {
  return (
    Math.sin(t * 0.7 + seed) * 0.35 +
    Math.sin(t * 1.3 + seed * 1.7) * 0.25 +
    Math.sin(t * 2.1 + seed * 2.3) * 0.15 +
    Math.sin(t * 0.4 + seed * 0.5) * 0.25
  );
};

// Secondary noise for finer detail
const noise1DFine = (t: number, seed: number): number => {
  return (
    Math.sin(t * 3.1 + seed) * 0.1 +
    Math.sin(t * 4.7 + seed * 1.3) * 0.08 +
    Math.sin(t * 6.3 + seed * 2.1) * 0.05
  );
};

type BodySegment = {
  x: number;
  y: number;
  z: number;
  time: number;
  tangentX: number;
  tangentY: number;
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
  const [dimensions, setDimensions] = useState({ width: 280, height: 110 });

  const timeRef = useRef(0);
  const bodyRef = useRef<BodySegment[]>([]);
  const seedRef = useRef({
    x: Math.random() * 100,
    y: Math.random() * 100,
    z: Math.random() * 100,
  });

  // Measure container with denser grid
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Smaller characters = denser grid (6px font, ~3.5x5 char size)
        const charWidth = 3.5;
        const charHeight = 5;
        setDimensions({
          width: Math.max(160, Math.floor(rect.width / charWidth)),
          height: Math.max(70, Math.floor(rect.height / charHeight)),
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

      // Calculate Z position with multiple frequencies
      const noiseZ = noise1D(t * 0.2, seedRef.current.z) + noise1DFine(t * 0.4, seedRef.current.z);
      const currentZ = minZ + (maxZ - minZ) * (noiseZ * 0.5 + 0.5);

      // Dynamic margin based on current Z
      const currentThickness = baseThickness * (0.5 + currentZ * 0.8);
      const margin = currentThickness * 4;

      // Snake head position with organic slithering
      const noiseX = noise1D(t * 0.45, seedRef.current.x) + noise1DFine(t * 0.8, seedRef.current.x);
      const noiseY = noise1D(t * 0.35, seedRef.current.y) + noise1DFine(t * 0.7, seedRef.current.y);

      // Extra wiggle for snake-like S-curve movement
      const wiggleX = Math.sin(t * 2.2) * 0.08 + Math.sin(t * 3.7) * 0.04;
      const wiggleY = Math.cos(t * 1.9) * 0.06 + Math.cos(t * 3.3) * 0.03;

      const headX = margin + (width - margin * 2) * ((noiseX + wiggleX) * 0.5 + 0.5);
      const headY = margin + (height - margin * 2) * ((noiseY + wiggleY) * 0.5 + 0.5);

      // Calculate tangent from previous position
      let tangentX = 1, tangentY = 0;
      if (bodyRef.current.length > 0) {
        const prev = bodyRef.current[0];
        const dx = headX - prev.x;
        const dy = headY - prev.y;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 0.001) {
          tangentX = dx / mag;
          tangentY = dy / mag;
        }
      }

      // Add new head segment
      bodyRef.current.unshift({
        x: headX,
        y: headY,
        z: currentZ,
        time: t,
        tangentX,
        tangentY,
      });

      // Trim to body length
      if (bodyRef.current.length > bodyLength) {
        bodyRef.current = bodyRef.current.slice(0, bodyLength);
      }

      // Create grid with Z-buffer
      const grid: { char: string; color: string; priority: number }[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          grid[y][x] = { char: ' ', color: 'transparent', priority: -Infinity };
        }
      }

      const body = bodyRef.current;
      if (body.length < 2) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      // Sort segments by Z for proper rendering (far to near)
      const sortedIndices = body.map((_, i) => i).sort((a, b) => body[a].z - body[b].z);

      // View direction (looking at screen)
      const viewDir = { x: 0, y: 0, z: 1 };

      // Render snake body
      for (const i of sortedIndices) {
        const segment = body[i];
        const bodyPos = i / (body.length - 1); // 0 = head, 1 = tail

        // Body thickness with taper and Z scaling
        const taperFactor = 1 - bodyPos * 0.6;
        const zScale = 0.4 + segment.z * 0.9;
        const segmentThickness = baseThickness * taperFactor * zScale;

        // Fade factor for tail
        const fadeFactor = 1 - bodyPos * 0.7;

        // Base priority from Z
        const basePriority = segment.z * 1000;

        // Elliptical cross-section (wider horizontally)
        const radiusX = segmentThickness * 2.5;
        const radiusY = segmentThickness * 1.2;

        // Perpendicular to tangent (for normal transformation)
        const perpX = -segment.tangentY;
        const perpY = segment.tangentX;

        // Render tube cross-section
        for (let dy = -Math.ceil(radiusY) - 1; dy <= Math.ceil(radiusY) + 1; dy++) {
          for (let dx = -Math.ceil(radiusX) - 1; dx <= Math.ceil(radiusX) + 1; dx++) {
            const px = Math.round(segment.x) + dx;
            const py = Math.round(segment.y) + dy;

            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            // Normalized position in ellipse
            const normalizedX = dx / radiusX;
            const normalizedY = dy / radiusY;
            const dist = Math.sqrt(normalizedX ** 2 + normalizedY ** 2);

            if (dist <= 1) {
              // Calculate tube surface depth (3D bulge)
              const tubeDepth = Math.sqrt(Math.max(0, 1 - dist * dist));

              // Surface normal for tube cross-section (pointing outward)
              // Base normal in tube's local space
              const localNormalX = normalizedX;
              const localNormalY = normalizedY;
              const localNormalZ = tubeDepth;

              // Transform normal based on body tangent direction
              const normalMag = Math.sqrt(localNormalX ** 2 + localNormalY ** 2 + localNormalZ ** 2);
              const normal = {
                x: (localNormalX * perpX + localNormalY * segment.tangentX) / normalMag,
                y: (localNormalX * perpY + localNormalY * segment.tangentY) / normalMag,
                z: localNormalZ / normalMag,
              };

              // Calculate lighting
              const lighting = calculateLighting(normal, viewDir);

              // Ambient occlusion factors
              // 1. Edge darkening (tube curvature)
              const edgeAO = 0.7 + tubeDepth * 0.3;

              // 2. Joint darkening (periodic along body)
              const jointFreq = bodyPos * 20;
              const jointAO = 0.85 + Math.sin(jointFreq * Math.PI * 2) * 0.15;

              // 3. Z proximity darkening (segments close together)
              let proximityAO = 1;
              for (let j = 0; j < body.length; j++) {
                if (Math.abs(i - j) < 3) continue;
                const other = body[j];
                const distToOther = Math.sqrt(
                  (segment.x - other.x) ** 2 +
                  (segment.y - other.y) ** 2
                );
                const combinedRadius = segmentThickness * 2;
                if (distToOther < combinedRadius && other.z > segment.z) {
                  proximityAO *= 0.7 + 0.3 * (distToOther / combinedRadius);
                }
              }

              const aoFactor = edgeAO * jointAO * proximityAO * fadeFactor;

              // Is this an edge pixel?
              const isEdge = dist > 0.85;

              // Get character and color
              const intensity = lighting.total * aoFactor;
              const char = getCharacter(intensity, segment.z, isEdge);
              const color = getColor(lighting, segment.z, bodyPos, aoFactor);

              // Priority combines Z depth and surface depth
              const priority = basePriority + tubeDepth * 10;

              // Only draw if higher priority than existing
              if (priority > grid[py][px].priority) {
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

  // Show/hide with GSAP
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
    fontSize: '6px',
    lineHeight: 1.0,
    letterSpacing: '-0.03em',
    margin: 0,
    padding: 0,
    whiteSpace: 'pre',
    userSelect: 'none',
    filter: 'drop-shadow(0 0 8px rgba(100, 255, 100, 0.3))',
    textShadow: '0 0 4px rgba(100, 255, 100, 0.2)',
  }), []);

  if (!show && !isVisible) return null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden="true">
      <pre ref={canvasRef} style={preStyle} />
    </div>
  );
};

export default AsciiOrb;
