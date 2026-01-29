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

// Depth-based character sets for dramatic visual separation
const DEPTH_CHARS = {
  far: ['.', ':', '·', '-', '~'],           // Sparse, light (z < 0.35)
  mid: ['*', '+', '=', 'o', 'x'],           // Medium (0.35 <= z < 0.55)
  close: ['@', '#', '%', '&', '8', '0'],    // Dense (0.55 <= z < 0.8)
  closest: ['@', '#', 'W', 'M', '8', 'B'],  // Heaviest ASCII chars (z >= 0.8) - no unicode blocks
};

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

// Get character based on Z-depth with distinct character zones
const getDepthCharacter = (zDepth: number, intensity: number, isEdge: boolean): string => {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  let charSet: string[];

  // Select character set based on Z-depth zones
  if (zDepth < 0.35) {
    charSet = DEPTH_CHARS.far;
  } else if (zDepth < 0.55) {
    charSet = DEPTH_CHARS.mid;
  } else if (zDepth < 0.8) {
    charSet = DEPTH_CHARS.close;
  } else {
    charSet = DEPTH_CHARS.closest;
  }

  // Edge characters should be lighter/sparser
  if (isEdge && zDepth < 0.8) {
    const edgeChars = DEPTH_CHARS.far;
    const idx = Math.floor((1 - clampedIntensity) * (edgeChars.length - 1));
    return edgeChars[Math.max(0, Math.min(idx, edgeChars.length - 1))];
  }

  // Select character within set based on intensity
  const idx = Math.floor((1 - clampedIntensity) * (charSet.length - 1));
  return charSet[Math.max(0, Math.min(idx, charSet.length - 1))];
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

// Atmospheric perspective color system - DRAMATIC depth-based color changes
const getAtmosphericColor = (
  zDepth: number,
  lighting: { diffuse: number; specular: number; total: number },
  aoFactor: number,
  isOccluded: boolean,
  occlusionStrength: number,
  isRimLit: boolean
): string => {
  // Normalize Z to 0-1 range (assuming minZ=0.2, maxZ=1.0)
  const normalizedZ = Math.max(0, Math.min(1, (zDepth - 0.2) / 0.8));

  // ATMOSPHERIC PERSPECTIVE: Far = cool teal, Close = warm yellow-green
  // Far (z ~ 0.2): Hue 180-200 (teal/cyan)
  // Close (z ~ 1.0): Hue 85-110 (yellow-green)
  let hue = 190 - normalizedZ * 100; // 190 (far) -> 90 (close)

  // Saturation: Far = washed out, Close = VERY vivid
  // Far: 30-40%, Close: 85-95% (boosted for closest)
  let saturation = 35 + normalizedZ * 55; // 35% (far) -> 90% (close)

  // Lightness: Far = washed out/foggy, Close = rich and bold
  // Far: 60-70%, Close: 30-45%
  let lightness = 65 - normalizedZ * 30; // 65% (far) -> 35% (close)

  // CLOSEST BOOST: Extra saturation and contrast for z > 0.8
  if (zDepth > 0.8) {
    const closestBoost = (zDepth - 0.8) / 0.2; // 0-1 for z 0.8-1.0
    saturation = Math.min(100, saturation + closestBoost * 15);
    lightness = Math.max(25, lightness - closestBoost * 8);
    hue = hue - closestBoost * 10; // Shift even more toward vibrant green
  }

  // Apply lighting
  lightness = lightness + lighting.diffuse * 15 + lighting.specular * 20;

  // Apply AO
  lightness *= aoFactor;

  // Alpha: Far = transparent, Close = FULLY opaque
  // Far: 0.4-0.5, Close: 0.95-1.0
  let alpha = 0.4 + normalizedZ * 0.55; // 0.4 (far) -> 0.95 (close)

  // Closest segments get full opacity
  if (zDepth > 0.8) {
    alpha = Math.min(1.0, alpha + 0.1);
  }

  alpha *= (0.75 + lighting.total * 0.25);

  // OCCLUSION SHADOW SYSTEM - darken and shift to blue when behind another segment
  if (isOccluded) {
    // Shift hue toward blue (-20 to -40)
    hue = hue - 30 * occlusionStrength;
    // Reduce saturation dramatically
    saturation *= (1 - occlusionStrength * 0.5);
    // Darken significantly (up to 60% darker)
    lightness *= (1 - occlusionStrength * 0.6);
    // Reduce alpha slightly
    alpha *= (1 - occlusionStrength * 0.2);
  }

  // RIM LIGHTING for close segments at edges
  if (isRimLit && zDepth > 0.7) {
    // Increase lightness by 20-25%
    lightness = Math.min(85, lightness * 1.22);
    // Slightly desaturate
    saturation *= 0.85;
  }

  // Specular highlight override
  if (lighting.specular > 0.3 && !isOccluded) {
    const specLight = Math.min(90, lightness + lighting.specular * 25);
    const specSat = Math.max(25, saturation - lighting.specular * 30);
    return `hsla(${Math.round(hue)}, ${Math.round(specSat)}%, ${Math.round(specLight)}%, ${Math.min(1, alpha).toFixed(2)})`;
  }

  return `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(Math.min(85, lightness))}%, ${Math.min(1, alpha).toFixed(2)})`;
};

// Calculate occlusion - check if this segment is behind another
const calculateOcclusion = (
  segmentIndex: number,
  body: BodySegment[],
  px: number,
  py: number,
  currentZ: number,
  segmentThickness: number
): { isOccluded: boolean; occlusionStrength: number } => {
  let maxOcclusion = 0;

  for (let j = 0; j < body.length; j++) {
    if (Math.abs(segmentIndex - j) < 5) continue; // Skip nearby segments

    const other = body[j];

    // Only check segments that are in FRONT (higher Z)
    if (other.z <= currentZ) continue;

    // Calculate 2D distance
    const dx = px - other.x;
    const dy = py - other.y;
    const dist2D = Math.sqrt(dx * dx + dy * dy);

    // Other segment's effective radius
    const otherBodyPos = j / (body.length - 1);
    const otherTaper = 1 - otherBodyPos * 0.6;
    const otherZScale = 0.25 + other.z * 1.25;
    const otherRadius = segmentThickness * otherTaper * otherZScale * 2.5;

    // Check if we're under the other segment's projection
    if (dist2D < otherRadius * 1.2) {
      // Occlusion strength based on how much overlap and Z difference
      const overlapFactor = 1 - (dist2D / (otherRadius * 1.2));
      const zDiff = other.z - currentZ;
      const occlusionAmount = overlapFactor * Math.min(1, zDiff * 3);
      maxOcclusion = Math.max(maxOcclusion, occlusionAmount);
    }
  }

  return {
    isOccluded: maxOcclusion > 0.1,
    occlusionStrength: maxOcclusion,
  };
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

type GridCell = {
  char: string;
  color: string;
  priority: number;
  isShadow?: boolean;
};

const AsciiOrb: React.FC<Props> = ({
  show,
  bodyLength = 45, // Much shorter snake
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

  // Track average Z for dynamic glow
  const avgZRef = useRef(0.5);

  // Measure container with denser grid
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
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

      // Calculate average Z for glow intensity
      const body = bodyRef.current;
      if (body.length > 0) {
        const sumZ = body.reduce((acc, seg) => acc + seg.z, 0);
        avgZRef.current = sumZ / body.length;
      }

      // Create grid with Z-buffer
      const grid: GridCell[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          grid[y][x] = { char: ' ', color: 'transparent', priority: -Infinity };
        }
      }

      if (body.length < 2) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      // CAST SHADOW LAYER - render shadows first (lowest priority)
      for (let i = 0; i < body.length; i++) {
        const segment = body[i];
        const bodyPos = i / (body.length - 1);

        // Shadow offset increases with Z (closer = bigger shadow offset)
        const normalizedZ = (segment.z - minZ) / (maxZ - minZ);
        const shadowOffsetY = Math.round(2 + normalizedZ * 3); // 2-5 chars down
        const shadowOffsetX = Math.round(normalizedZ * 1.5); // Slight X offset

        // Shadow size scales with segment
        const taperFactor = 1 - bodyPos * 0.6;
        const zScale = 0.25 + segment.z * 1.25;
        const segmentThickness = baseThickness * taperFactor * zScale;
        const shadowRadiusX = segmentThickness * 2.0;
        const shadowRadiusY = segmentThickness * 0.8;

        // Shadow alpha based on Z (closer = darker shadow)
        const shadowAlpha = 0.08 + normalizedZ * 0.12; // 0.08-0.20

        for (let dy = -Math.ceil(shadowRadiusY); dy <= Math.ceil(shadowRadiusY); dy++) {
          for (let dx = -Math.ceil(shadowRadiusX); dx <= Math.ceil(shadowRadiusX); dx++) {
            const px = Math.round(segment.x) + dx + shadowOffsetX;
            const py = Math.round(segment.y) + dy + shadowOffsetY;

            if (px < 0 || px >= width || py < 0 || py >= height) continue;

            const normalizedX = dx / shadowRadiusX;
            const normalizedY = dy / shadowRadiusY;
            const dist = Math.sqrt(normalizedX ** 2 + normalizedY ** 2);

            if (dist <= 1) {
              // Shadow fades at edges
              const edgeFade = 1 - dist;
              const shadowColor = `hsla(220, 10%, 20%, ${(shadowAlpha * edgeFade).toFixed(2)})`;

              // Only place shadow if nothing else is there (priority -500)
              if (grid[py][px].priority < -100) {
                grid[py][px] = {
                  char: '.',
                  color: shadowColor,
                  priority: -500,
                  isShadow: true,
                };
              }
            }
          }
        }
      }

      // Sort segments by Z for proper rendering (far to near)
      const sortedIndices = body.map((_, i) => i).sort((a, b) => body[a].z - body[b].z);

      // View direction (looking at screen)
      const viewDir = { x: 0, y: 0, z: 1 };

      // Render snake body
      for (const i of sortedIndices) {
        const segment = body[i];
        const bodyPos = i / (body.length - 1); // 0 = head, 1 = tail

        // DRAMATIC SIZE VARIATION - 6x size difference
        // zScale range: 0.25x to 1.5x (6x difference)
        const taperFactor = 1 - bodyPos * 0.6;
        const zScale = 0.25 + segment.z * 1.25; // 0.25 at z=0 to 1.5 at z=1
        const segmentThickness = baseThickness * taperFactor * zScale;

        // Fade factor for tail
        const fadeFactor = 1 - bodyPos * 0.7;

        // Base priority from Z
        const basePriority = segment.z * 1000;

        // Elliptical cross-section - also scale radii more with Z
        const radiusX = segmentThickness * (2.0 + segment.z * 1.0); // 2.0-3.0 multiplier
        const radiusY = segmentThickness * (1.0 + segment.z * 0.4); // 1.0-1.4 multiplier

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

              // Surface normal for tube cross-section
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
              const edgeAO = 0.7 + tubeDepth * 0.3;
              const jointFreq = bodyPos * 20;
              const jointAO = 0.85 + Math.sin(jointFreq * Math.PI * 2) * 0.15;
              const aoFactor = edgeAO * jointAO * fadeFactor;

              // Is this an edge pixel? (for rim lighting detection)
              const isEdge = dist > 0.85;

              // RIM LIGHTING for close segments at edges
              const isRimLit = isEdge && segment.z > 0.7;

              // OCCLUSION detection
              const occlusion = calculateOcclusion(i, body, px, py, segment.z, baseThickness);

              // Get character and color with atmospheric perspective
              const intensity = lighting.total * aoFactor;
              const char = getDepthCharacter(segment.z, intensity, isEdge);
              const color = getAtmosphericColor(
                segment.z,
                lighting,
                aoFactor,
                occlusion.isOccluded,
                occlusion.occlusionStrength,
                isRimLit
              );

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

  // Dynamic glow based on average Z depth
  const preStyle: React.CSSProperties = useMemo(() => {
    // More glow when segments are closer on average
    const glowIntensity = 0.2 + avgZRef.current * 0.3;
    const glowSize = 6 + avgZRef.current * 6;

    return {
      fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", monospace',
      fontSize: '6px',
      lineHeight: 1.0,
      letterSpacing: '-0.03em',
      margin: 0,
      padding: 0,
      whiteSpace: 'pre',
      userSelect: 'none',
      filter: `drop-shadow(0 0 ${glowSize}px rgba(100, 255, 100, ${glowIntensity}))`,
      textShadow: `0 0 4px rgba(100, 255, 100, ${glowIntensity * 0.6})`,
    };
  }, []);

  if (!show && !isVisible) return null;

  return (
    <div ref={containerRef} style={containerStyle} aria-hidden="true">
      <pre ref={canvasRef} style={preStyle} />
    </div>
  );
};

export default AsciiOrb;
