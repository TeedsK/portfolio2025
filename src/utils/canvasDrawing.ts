// src/utils/canvasDrawing.ts
import { PathManager, Point } from './path'; // Assuming Point is exported from path.ts

/**
 * Draws a segment of a path (either curved via PathManager or straight) on a canvas context.
 * @param ctx The canvas rendering context.
 * @param pathOrPoints Either a PathManager instance for curved paths, or an object { p0: Point, p1: Point, totalLength: number } for straight lines.
 * @param startDist The starting distance along the path for the segment.
 * @param endDist The ending distance along the path for the segment.
 * @param strokeStyle The color or gradient for the stroke.
 * @param lineWidth The width of the line.
 */
export function drawPathSegment(
    ctx: CanvasRenderingContext2D,
    pathOrPoints: PathManager | { p0: Point, p1: Point, totalLength: number },
    startDist: number,
    endDist: number,
    strokeStyle: string | CanvasGradient,
    lineWidth: number
) {
    let totalLength: number;
    if (pathOrPoints instanceof PathManager) {
        totalLength = pathOrPoints.totalLength;
    } else {
        totalLength = pathOrPoints.totalLength;
    }

    if (startDist >= endDist || totalLength === 0) return;

    const clampedStartDist = Math.max(0, Math.min(startDist, totalLength));
    const clampedEndDist = Math.max(0, Math.min(endDist, totalLength));

    if (clampedStartDist >= clampedEndDist) return;

    ctx.beginPath();
    const segments = 20; // Number of samples for this segment, can be adjusted
    const segmentActualLength = clampedEndDist - clampedStartDist;
    const step = segmentActualLength / segments;

    let firstPoint = true;
    for (let i = 0; i <= segments; i++) {
        const dist = clampedStartDist + i * step;
        let point: Point;

        if (pathOrPoints instanceof PathManager) {
            point = pathOrPoints.getPointAt(dist);
        } else { // Straight line interpolation
            const progress = totalLength === 0 ? 0 : dist / totalLength;
            point = {
                x: pathOrPoints.p0.x + (pathOrPoints.p1.x - pathOrPoints.p0.x) * progress,
                y: pathOrPoints.p0.y + (pathOrPoints.p1.y - pathOrPoints.p0.y) * progress,
            };
        }
        
        if (firstPoint) {
            ctx.moveTo(point.x, point.y);
            firstPoint = false;
        } else {
            ctx.lineTo(point.x, point.y);
        }
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
}