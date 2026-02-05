// src/pages/landing/utils/math3d.ts

/**
 * 3D math utilities for the sphere neural network visualization.
 */

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

export interface ProjectedPoint {
    x: number;
    y: number;
    depth: number;
    scale: number;
}

// Vector operations

export function add3D(a: Point3D, b: Point3D): Point3D {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract3D(a: Point3D, b: Point3D): Point3D {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3D(p: Point3D, s: number): Point3D {
    return { x: p.x * s, y: p.y * s, z: p.z * s };
}

export function length3D(p: Point3D): number {
    return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
}

export function normalize3D(p: Point3D): Point3D {
    const len = length3D(p);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: p.x / len, y: p.y / len, z: p.z / len };
}

export function dot3D(a: Point3D, b: Point3D): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function distance3D(a: Point3D, b: Point3D): number {
    return length3D(subtract3D(a, b));
}

/**
 * Rotate a point around the Y-axis by the given angle (radians).
 * Y-axis rotation matrix:
 * | cos(θ)   0   sin(θ) |
 * |   0      1     0    |
 * | -sin(θ)  0   cos(θ) |
 */
export function rotateY(point: Point3D, angle: number): Point3D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: point.x * cos + point.z * sin,
        y: point.y,
        z: -point.x * sin + point.z * cos,
    };
}

/**
 * Rotate a point around the X-axis by the given angle (radians).
 * X-axis rotation matrix:
 * | 1    0       0    |
 * | 0  cos(θ) -sin(θ) |
 * | 0  sin(θ)  cos(θ) |
 */
export function rotateX(point: Point3D, angle: number): Point3D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: point.x,
        y: point.y * cos - point.z * sin,
        z: point.y * sin + point.z * cos,
    };
}

/**
 * Project a 3D point to 2D using perspective projection.
 * @param point3D The 3D point to project
 * @param cameraDistance Distance from camera to the projection plane (affects perspective strength)
 * @param centerX Center X of the 2D viewport
 * @param centerY Center Y of the 2D viewport
 * @param baseScale Base scale factor for the projection
 * @returns Projected 2D point with depth and scale information
 */
export function projectPerspective(
    point3D: Point3D,
    cameraDistance: number,
    centerX: number,
    centerY: number,
    baseScale: number = 1
): ProjectedPoint {
    // Z increases towards the camera, so we add cameraDistance
    const z = point3D.z + cameraDistance;
    // Prevent division by zero or negative values
    const safeZ = Math.max(z, 0.1);
    const perspectiveScale = cameraDistance / safeZ;

    return {
        x: centerX + point3D.x * perspectiveScale * baseScale,
        y: centerY + point3D.y * perspectiveScale * baseScale,
        depth: point3D.z,
        scale: perspectiveScale * baseScale,
    };
}

/**
 * Calculate depth-based alpha for rendering objects further back as more transparent.
 * @param depth The z-depth of the object
 * @param radius The radius of the sphere (used to normalize depth)
 * @param minAlpha Minimum alpha value (for objects furthest back)
 * @param maxAlpha Maximum alpha value (for objects closest to camera)
 * @returns Alpha value between minAlpha and maxAlpha
 */
export function depthToAlpha(
    depth: number,
    radius: number,
    minAlpha: number = 0.3,
    maxAlpha: number = 1.0
): number {
    // Normalize depth from [-radius, +radius] to [0, 1]
    const normalized = (depth + radius) / (2 * radius);
    // Clamp and interpolate
    const clamped = Math.max(0, Math.min(1, normalized));
    return minAlpha + clamped * (maxAlpha - minAlpha);
}

/**
 * Calculate the projected 2D position of the input node in the neural network visualization.
 * This allows external components (like scan beams) to target the input node accurately.
 * @param canvasWidth Width of the canvas
 * @param canvasHeight Height of the canvas
 * @param sphereRadius Radius of the 3D sphere (default: 320)
 * @param cameraDistance Camera distance for perspective (default: 800)
 * @returns The 2D position { x, y } where the input node is rendered
 */
export function getInputNode2DPosition(
    canvasWidth: number,
    canvasHeight: number,
    sphereRadius: number = 320,
    cameraDistance: number = 800
): { x: number; y: number } {
    // Input node 3D position: well to the left at center height
    const inputPos3D: Point3D = {
        x: -sphereRadius * 1.2,
        y: 0,
        z: 0,
    };

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // Apply perspective projection (same math as projectPerspective)
    const z = inputPos3D.z + cameraDistance;
    const safeZ = Math.max(z, 0.1);
    const perspectiveScale = cameraDistance / safeZ;

    return {
        x: centerX + inputPos3D.x * perspectiveScale,
        y: centerY + inputPos3D.y * perspectiveScale,
    };
}
