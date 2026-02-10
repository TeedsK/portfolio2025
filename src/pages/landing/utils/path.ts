// src/utils/path.ts

export interface Point {
    x: number;
    y: number;
}

export class PathManager {
    private p0: Point;
    private p1: Point;
    private p2: Point;
    private radius: number;

    // Calculated properties
    private tangentStart: Point = { x: 0, y: 0 }; // Point where line P0-P1 meets the arc
    private tangentEnd: Point = { x: 0, y: 0 };   // Point where arc meets line P1-P2
    private arcCenter: Point = { x: 0, y: 0 };
    private arcStartAngle: number = 0;
    private arcEndAngle: number = 0;
    private arcActualRadius: number = 0;
    private arcLength: number = 0;
    private segment1Length: number = 0; // Length from P0 to tangentStart
    private segment2Length: number = 0; // Length from tangentEnd to P2
    public totalLength: number = 0;
    private isArcPossible: boolean = true;

    constructor(p0: Point, p1: Point, p2: Point, radius: number) {
        this.p0 = p0;
        this.p1 = p1;
        this.p2 = p2;
        this.radius = Math.max(0.01, radius); // Ensure radius is positive and non-zero
        this.calculate();
    }

    private calculate() {
        // Vectors from P1 to P0 and P1 to P2
        const v1x = this.p0.x - this.p1.x;
        const v1y = this.p0.y - this.p1.y;
        const v2x = this.p2.x - this.p1.x;
        const v2y = this.p2.y - this.p1.y;

        const len_p1_p0 = Math.sqrt(v1x * v1x + v1y * v1y);
        const len_p1_p2 = Math.sqrt(v2x * v2x + v2y * v2y);

        if (len_p1_p0 < 0.01 || len_p1_p2 < 0.01) {
            this.isArcPossible = false; // P1 coincides with P0 or P2, or segments are too short
            this.segment1Length = Math.sqrt(Math.pow(this.p1.x - this.p0.x, 2) + Math.pow(this.p1.y - this.p0.y, 2));
            this.segment2Length = Math.sqrt(Math.pow(this.p2.x - this.p1.x, 2) + Math.pow(this.p2.y - this.p1.y, 2));
            this.totalLength = this.segment1Length + this.segment2Length;
            this.tangentStart = {...this.p1};
            this.tangentEnd = {...this.p1};
            return;
        }

        // Normalized vectors from P1
        const e1x = v1x / len_p1_p0; // Normalized P1->P0
        const e1y = v1y / len_p1_p0;
        const e2x = v2x / len_p1_p2; // Normalized P1->P2
        const e2y = v2y / len_p1_p2;

        // Angle at P1. dot = cos(theta)
        const dotProduct = e1x * e2x + e1y * e2y;
        
        // If dotProduct is too close to 1 or -1, points are collinear or form a very shallow/sharp angle.
        if (Math.abs(dotProduct) > 0.9999) { // Nearly 0 or 180 degrees
            this.isArcPossible = false;
            this.segment1Length = len_p1_p0;
            this.segment2Length = len_p1_p2;
            this.totalLength = len_p1_p0 + len_p1_p2;
            this.tangentStart = { ...this.p1 };
            this.tangentEnd = { ...this.p1 };
            return;
        }
        
        const angleAtP1_rad = Math.acos(dotProduct); // Angle between P1P0 and P1P2 (0 to PI)

        // Distance from P1 to tangent points (T_start on P1P0, T_end on P1P2)
        let distToTangents = this.radius / Math.abs(Math.tan(angleAtP1_rad / 2));
        
        // Cap this distance by the actual lengths of segments P1P0 and P1P2
        distToTangents = Math.min(distToTangents, len_p1_p0, len_p1_p2);
        
        this.arcActualRadius = distToTangents * Math.abs(Math.tan(angleAtP1_rad / 2));

        if (this.arcActualRadius < 0.1) { // If radius is negligible, no arc
            this.isArcPossible = false;
            this.segment1Length = len_p1_p0;
            this.segment2Length = len_p1_p2;
            this.totalLength = len_p1_p0 + len_p1_p2;
            this.tangentStart = { ...this.p1 };
            this.tangentEnd = { ...this.p1 };
            return;
        }

        // Tangent points on segments P1P0 and P1P2, measured from P1
        this.tangentStart = { x: this.p1.x + e1x * distToTangents, y: this.p1.y + e1y * distToTangents };
        this.tangentEnd   = { x: this.p1.x + e2x * distToTangents, y: this.p1.y + e2y * distToTangents };

        // Length of the first straight segment (P0 to tangentStart)
        this.segment1Length = Math.sqrt(Math.pow(this.tangentStart.x - this.p0.x, 2) + Math.pow(this.tangentStart.y - this.p0.y, 2));

        // Determine turn direction using cross product of P1->P0 and P1->P2
        // cross_z = (P0-P1) x (P2-P1) = v1x * v2y - v1y * v2x
        const crossProduct_z = v1x * v2y - v1y * v2x;
        const turnDirectionSign = Math.sign(crossProduct_z); // Positive for P1P0 to P1P2 CCW, negative for CW

        // Arc center calculation
        // The center is 'radius' distance from tangentStart along the perpendicular to P1P0,
        // directed towards the "inside" of the turn.
        // Normal to P1P0 (e1x, e1y)
        const normal_to_e1_x = -e1y; // CCW normal
        const normal_to_e1_y = e1x;

        // If turn is CW (turnDirectionSign < 0), we use the CW normal from T_start.
        // If turn is CCW (turnDirectionSign > 0), we use the CCW normal.
        // The Path P0-P1-P2 turns CW if P2 is CW of P0 relative to P1. This means (P1P0)x(P1P2) is positive.
        // My crossProduct_z is (P1P0)x(P1P2). So turnDirectionSign > 0 implies P1P2 is CCW of P1P0.
        // This corresponds to a "left turn" of the path P0-P1-P2.
        
        // If turnDirectionSign > 0 (left turn, CCW), center is CCW normal direction from tangentStart
        // If turnDirectionSign < 0 (right turn, CW), center is CW normal direction from tangentStart
        // We want the center to be on the side such that P1 is convex for the arc.
        // The current normal (-e1y, e1x) is CCW from P1P0.
        // If it's a left turn (P1P2 is CCW from P1P0), we use this normal.
        // If it's a right turn (P1P2 is CW from P1P0), we use the opposite normal (e1y, -e1x).

        let perp_dx = normal_to_e1_x;
        let perp_dy = normal_to_e1_y;

        if (turnDirectionSign < 0) { // Path P0-P1-P2 makes a "right turn" (CW)
            perp_dx = e1y;
            perp_dy = -e1x;
        }

        this.arcCenter = {
            x: this.tangentStart.x + perp_dx * this.arcActualRadius,
            y: this.tangentStart.y + perp_dy * this.arcActualRadius,
        };
        
        this.arcStartAngle = Math.atan2(this.tangentStart.y - this.arcCenter.y, this.tangentStart.x - this.arcCenter.x);
        this.arcEndAngle = Math.atan2(this.tangentEnd.y - this.arcCenter.y, this.tangentEnd.x - this.arcCenter.x);

        let sweepAngle = this.arcEndAngle - this.arcStartAngle;

        // Normalize sweep angle to be the shortest path in the correct direction
        if (turnDirectionSign > 0) { // Left turn (CCW path), sweep should be positive
            while (sweepAngle < 0) sweepAngle += 2 * Math.PI;
            while (sweepAngle > Math.PI) sweepAngle -= 2*Math.PI; // Take shorter CCW path
        } else { // Right turn (CW path), sweep should be negative
            while (sweepAngle > 0) sweepAngle -= 2 * Math.PI;
            while (sweepAngle < -Math.PI) sweepAngle += 2*Math.PI; // Take shorter CW path
        }
         // Correction for cases where sweepAngle can still be wrong due to atan2 periodicity.
        // The actual angle of the bend is (PI - angleAtP1_rad). Ensure sweep matches this.
        const expectedSweepMagnitude = Math.PI - angleAtP1_rad;
        if(Math.abs(Math.abs(sweepAngle) - expectedSweepMagnitude) > 0.1) { // If calculated sweep is very different
            sweepAngle = expectedSweepMagnitude * turnDirectionSign;
        }


        this.arcLength = Math.abs(sweepAngle * this.arcActualRadius);
        this.arcEndAngle = this.arcStartAngle + sweepAngle; // Final end angle for interpolation

        // Length of the second straight segment (tangentEnd to P2)
        this.segment2Length = Math.sqrt(Math.pow(this.p2.x - this.tangentEnd.x, 2) + Math.pow(this.p2.y - this.tangentEnd.y, 2));
        this.totalLength = this.segment1Length + this.arcLength + this.segment2Length;

        if(isNaN(this.totalLength) || this.totalLength < 0.01){
            this.isArcPossible = false;
            this.segment1Length = len_p1_p0;
            this.segment2Length = len_p1_p2;
            this.totalLength = len_p1_p0 + len_p1_p2;
            this.tangentStart = {...this.p1};
            this.tangentEnd = {...this.p1};
        }
    }

    public getPointAt(distance: number): Point {
        if (this.totalLength === 0) return this.p0;
        distance = Math.max(0, Math.min(distance, this.totalLength));

        if (!this.isArcPossible) {
            // Simplified: if P0-P1-P2 is collinear or P1 is an endpoint
            if (this.segment1Length + this.segment2Length === this.totalLength) { //Treat as P0-P1 then P1-P2
                 if (distance <= this.segment1Length) {
                    const progress = this.segment1Length === 0 ? 0 : distance / this.segment1Length;
                    return { x: this.p0.x + (this.p1.x - this.p0.x) * progress, y: this.p0.y + (this.p1.y - this.p0.y) * progress };
                } else {
                    const progress = this.segment2Length === 0 ? 0 : (distance - this.segment1Length) / this.segment2Length;
                    return { x: this.p1.x + (this.p2.x - this.p1.x) * progress, y: this.p1.y + (this.p2.y - this.p1.y) * progress };
                }
            } else { // Default to P0-P2 direct line if structure is ambiguous
                 const progress = this.totalLength === 0 ? 1 : distance / this.totalLength;
                 return { x: this.p0.x + (this.p2.x - this.p0.x) * progress, y: this.p0.y + (this.p2.y - this.p0.y) * progress };
            }
        }

        // Point is on the first straight line segment
        if (distance <= this.segment1Length) {
            const progress = this.segment1Length === 0 ? 1 : distance / this.segment1Length;
            return {
                x: this.p0.x + (this.tangentStart.x - this.p0.x) * progress,
                y: this.p0.y + (this.tangentStart.y - this.p0.y) * progress,
            };
        }
        distance -= this.segment1Length;

        // Point is on the arc
        if (distance <= this.arcLength) {
            const angleProgress = this.arcLength === 0 ? 0 : distance / this.arcLength; // Prevent div by zero
            // arcEndAngle already incorporates the correct sweep direction and magnitude
            const angle = this.arcStartAngle + (this.arcEndAngle - this.arcStartAngle) * angleProgress;
            return {
                x: this.arcCenter.x + Math.cos(angle) * this.arcActualRadius,
                y: this.arcCenter.y + Math.sin(angle) * this.arcActualRadius,
            };
        }
        distance -= this.arcLength;

        // Point is on the second straight line segment
        const progress = this.segment2Length === 0 ? 1 : distance / this.segment2Length;
        return {
            x: this.tangentEnd.x + (this.p2.x - this.tangentEnd.x) * progress,
            y: this.tangentEnd.y + (this.p2.y - this.tangentEnd.y) * progress,
        };
    }
}