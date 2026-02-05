// src/pages/landing/utils/sphereDistribution.ts

import { Point3D } from './math3d';

/**
 * Sphere distribution algorithms for positioning neural network nodes in 3D space.
 * Creates an organic, floating particle effect while maintaining 3D depth.
 */

// Golden angle in radians (for Fibonacci distribution)
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Generate evenly distributed points on a sphere surface using the Fibonacci sphere algorithm.
 * @param count Number of points to generate
 * @param radius Radius of the sphere
 * @returns Array of Point3D positions on the sphere surface
 */
export function fibonacciSphere(count: number, radius: number): Point3D[] {
    const points: Point3D[] = [];

    for (let i = 0; i < count; i++) {
        // Y goes from 1 to -1 (top to bottom)
        const y = 1 - (i / (count - 1)) * 2;
        // Radius at this Y level (ensures points are on sphere surface)
        const radiusAtY = Math.sqrt(1 - y * y);
        // Angle around Y axis
        const theta = GOLDEN_ANGLE * i;

        points.push({
            x: Math.cos(theta) * radiusAtY * radius,
            y: y * radius,
            z: Math.sin(theta) * radiusAtY * radius,
        });
    }

    return points;
}

/**
 * Distribute hidden layer nodes in an organic 3D cloud formation.
 * Uses Fibonacci base with varied radii for depth and organic feel.
 * @param count Number of hidden nodes
 * @param radius Base radius
 * @returns Array of Point3D positions for hidden nodes
 */
export function distributeHiddenNodes(count: number, radius: number): Point3D[] {
    const points: Point3D[] = [];

    for (let i = 0; i < count; i++) {
        // Y distribution - spread vertically
        const y = 1 - (i / (count - 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = GOLDEN_ANGLE * i;

        // Vary the radius for organic depth (0.6 to 1.0 of full radius)
        // Creates layers of particles at different depths
        const depthVariation = 0.6 + 0.4 * ((i * 7) % 10) / 10;

        points.push({
            x: Math.cos(theta) * radiusAtY * radius * depthVariation,
            y: y * radius * depthVariation,
            z: Math.sin(theta) * radiusAtY * radius * depthVariation,
        });
    }

    return points;
}

/**
 * Distribute output nodes (a-z) on the right side in a spread 3D arrangement.
 * Uses spherical coordinates with organic variation for a floating feel.
 * @param count Number of output nodes (typically 26 for a-z)
 * @param radius Base radius
 * @returns Array of Point3D positions for output nodes
 */
export function distributeOutputNodes(count: number, radius: number): Point3D[] {
    const points: Point3D[] = [];

    // Distribute in a more spread out pattern on the right side
    // Using spherical coordinates with wider angles

    const rows = Math.ceil(Math.sqrt(count * 0.7));
    const cols = Math.ceil(count / rows);

    let index = 0;
    for (let row = 0; row < rows && index < count; row++) {
        // Phi: latitude spread from ~15° to ~165° (wide vertical spread)
        const phi = (Math.PI * 0.1) + (row / (rows - 1 || 1)) * (Math.PI * 0.8);

        for (let col = 0; col < cols && index < count; col++) {
            // Theta: longitude spread - wider angle range for spread feel
            const theta = ((col / (cols - 1 || 1)) - 0.5) * (Math.PI * 0.8);

            // Add slight radius variation for organic depth
            const depthVariation = 0.85 + 0.15 * Math.sin(index * 1.7);

            // Convert spherical to Cartesian
            const x = radius * depthVariation * Math.sin(phi) * Math.cos(theta);
            const y = radius * depthVariation * Math.cos(phi);
            const z = radius * depthVariation * Math.sin(phi) * Math.sin(theta);

            points.push({ x, y, z });
            index++;
        }
    }

    return points;
}

/**
 * Get the position of the single input node on the left side.
 * Positioned further out for clear visual separation.
 * @param radius Base radius
 * @returns Point3D position for the input node
 */
export function getInputNodePosition(radius: number): Point3D {
    // Position well to the left, at center height
    return {
        x: -radius * 1.2,
        y: 0,
        z: 0,
    };
}
