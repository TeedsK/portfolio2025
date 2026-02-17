// src/pages/landing/visuals/EducationRLDrift.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../styles/EducationRLDrift.css';

type Props = {
    width: number;
    height: number;
};

/** =========================
 *  Small math helpers
 *  ========================= */
const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;

function clamp(x: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, x));
}
function clamp01(x: number): number {
    return clamp(x, 0, 1);
}
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}
function wrapAngle(rad: number): number {
    let a = rad;
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
}
function radToDeg(r: number): number {
    return (r * 180) / Math.PI;
}
function degToRad(d: number): number {
    return (d * Math.PI) / 180;
}
function hypot(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
}
function signNonZero(x: number): number {
    return x === 0 ? 1 : Math.sign(x);
}

type Vec2 = { x: number; y: number };

type TrackSample = {
    // closest point on centerline
    px: number;
    py: number;
    // tangent (unit)
    tx: number;
    ty: number;
    // normal (unit, left of tangent)
    nx: number;
    ny: number;
    // signed distance from centerline
    signedDist: number;
    // absolute distance
    dist: number;
    // progress along centerline [0..totalLength)
    progress: number;
    // curvature estimate at this location
    curvature: number;
    // sign of turn at this location (-1, 0, +1)
    turnSign: number;
};

class RNG {
    private seed: number;
    private spare: number | null = null;

    constructor(seed = 0x12345678) {
        this.seed = seed >>> 0;
    }

    /** Mulberry32 */
    next(): number {
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    normal(mean = 0, std = 1): number {
        // Box–Muller with cached spare
        if (this.spare !== null) {
            const z = this.spare;
            this.spare = null;
            return mean + z * std;
        }
        let u = 0;
        let v = 0;
        // avoid 0
        while (u === 0) u = this.next();
        while (v === 0) v = this.next();
        const mag = Math.sqrt(-2.0 * Math.log(u));
        const z0 = mag * Math.cos(TAU * v);
        const z1 = mag * Math.sin(TAU * v);
        this.spare = z1;
        return mean + z0 * std;
    }
}

/** =========================
 *  Ring buffer for step traces
 *  ========================= */
class RingBuffer {
    private buf: number[];
    private idx = 0;
    private filled = false;

    constructor(private capacity: number) {
        this.buf = new Array(capacity).fill(0);
    }

    clear(): void {
        this.idx = 0;
        this.filled = false;
        this.buf.fill(0);
    }

    push(v: number): void {
        this.buf[this.idx] = v;
        this.idx = (this.idx + 1) % this.capacity;
        if (this.idx === 0) this.filled = true;
    }

    size(): number {
        return this.filled ? this.capacity : this.idx;
    }

    /** i=0 oldest ... i=size-1 newest */
    at(i: number): number {
        const size = this.size();
        if (size === 0) return 0;
        const start = this.filled ? this.idx : 0;
        const j = (start + i) % this.capacity;
        return this.buf[j] ?? 0;
    }

    latest(): number {
        const size = this.size();
        if (size === 0) return 0;
        return this.at(size - 1);
    }
}

/** =========================
 *  Track: rounded-rect centerline
 *  ========================= */
class Track {
    points: Vec2[] = [];
    tangents: Vec2[] = [];
    segLen: number[] = [];
    cumLen: number[] = [];
    curvature: number[] = [];
    turnSign: number[] = [];
    totalLength = 1;

    roadWidth = 120; // in px, tuned on build()

    private tmpPointOut: Vec2 = { x: 0, y: 0 };

    constructor(w: number, h: number) {
        this.build(w, h);
    }

    build(w: number, h: number): void {
        const base = Math.min(w, h);

        // Corridor width around centerline (visual + off-track detection)
        this.roadWidth = clamp(base * 0.23, 78, 140);

        // Centerline rounded-rect bounds
        const pad = clamp(base * 0.18, 46, 86);
        const rect = {
            x: pad,
            y: pad,
            w: w - 2 * pad,
            h: h - 2 * pad,
        };

        const r = Math.min(base * 0.20, rect.w / 2 - 2, rect.h / 2 - 2);
        const cornerSteps = clamp(Math.floor(base / 14), 10, 22);
        const edgeSteps = clamp(Math.floor(base / 18), 10, 20);

        const pts: Vec2[] = [];

        const push = (x: number, y: number) => pts.push({ x, y });

        // Top edge (left->right)
        for (let i = 0; i <= edgeSteps; i++) {
            const t = i / edgeSteps;
            push(lerp(rect.x + r, rect.x + rect.w - r, t), rect.y);
        }
        // Top-right arc (-90..0)
        arcPoints(
            rect.x + rect.w - r,
            rect.y + r,
            r,
            -Math.PI / 2,
            0,
            cornerSteps,
            pts
        );
        // Right edge (top->bottom)
        for (let i = 0; i <= edgeSteps; i++) {
            const t = i / edgeSteps;
            push(rect.x + rect.w, lerp(rect.y + r, rect.y + rect.h - r, t));
        }
        // Bottom-right arc (0..90)
        arcPoints(
            rect.x + rect.w - r,
            rect.y + rect.h - r,
            r,
            0,
            Math.PI / 2,
            cornerSteps,
            pts
        );
        // Bottom edge (right->left)
        for (let i = 0; i <= edgeSteps; i++) {
            const t = i / edgeSteps;
            push(lerp(rect.x + rect.w - r, rect.x + r, t), rect.y + rect.h);
        }
        // Bottom-left arc (90..180)
        arcPoints(
            rect.x + r,
            rect.y + rect.h - r,
            r,
            Math.PI / 2,
            Math.PI,
            cornerSteps,
            pts
        );
        // Left edge (bottom->top)
        for (let i = 0; i <= edgeSteps; i++) {
            const t = i / edgeSteps;
            push(rect.x, lerp(rect.y + rect.h - r, rect.y + r, t));
        }
        // Top-left arc (180..270)
        arcPoints(
            rect.x + r,
            rect.y + r,
            r,
            Math.PI,
            (3 * Math.PI) / 2,
            cornerSteps,
            pts
        );

        // Remove near-duplicates
        const cleaned: Vec2[] = [];
        const eps = 0.3;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const prev = cleaned[cleaned.length - 1];
            if (!prev || hypot(p.x - prev.x, p.y - prev.y) > eps) cleaned.push(p);
        }
        // Ensure closed by not duplicating first point at end.
        this.points = cleaned;

        // Compute segments, tangents, cumulative
        const n = this.points.length;
        this.segLen = new Array(n).fill(0);
        this.cumLen = new Array(n).fill(0);
        this.tangents = new Array(n).fill(0).map(() => ({ x: 1, y: 0 }));

        let total = 0;
        for (let i = 0; i < n; i++) {
            const a = this.points[i];
            const b = this.points[(i + 1) % n];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const L = Math.max(1e-6, hypot(dx, dy));
            this.segLen[i] = L;
            this.tangents[i] = { x: dx / L, y: dy / L };
            this.cumLen[i] = total;
            total += L;
        }
        this.totalLength = Math.max(1e-6, total);

        // Curvature estimate per vertex
        this.curvature = new Array(n).fill(0);
        this.turnSign = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            const prev = this.tangents[(i - 1 + n) % n];
            const next = this.tangents[i];
            const cross = prev.x * next.y - prev.y * next.x;
            const dot = prev.x * next.x + prev.y * next.y;
            const ang = Math.atan2(cross, dot); // signed
            const avgL = (this.segLen[(i - 1 + n) % n] + this.segLen[i]) * 0.5;
            const kappa = avgL > 1e-6 ? ang / avgL : 0;
            this.curvature[i] = kappa;
            this.turnSign[i] = Math.abs(ang) < 1e-4 ? 0 : Math.sign(ang);
        }
    }

    /** Find closest point on polyline centerline, return track sample. */
    closestSample(x: number, y: number, out: TrackSample): void {
        const n = this.points.length;
        let bestD2 = Number.POSITIVE_INFINITY;
        let bestI = 0;
        let bestT = 0;

        for (let i = 0; i < n; i++) {
            const a = this.points[i];
            const b = this.points[(i + 1) % n];
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = x - a.x;
            const apy = y - a.y;
            const denom = abx * abx + aby * aby;
            const t = denom > 1e-6 ? clamp01((apx * abx + apy * aby) / denom) : 0;
            const px = a.x + abx * t;
            const py = a.y + aby * t;
            const dx = x - px;
            const dy = y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestI = i;
                bestT = t;
            }
        }

        const a = this.points[bestI];
        const b = this.points[(bestI + 1) % n];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const px = a.x + abx * bestT;
        const py = a.y + aby * bestT;

        const tx = this.tangents[bestI].x;
        const ty = this.tangents[bestI].y;
        // left normal (perp)
        const nx = -ty;
        const ny = tx;

        const dx = x - px;
        const dy = y - py;
        const dist = Math.sqrt(bestD2);

        // signed distance via normal
        const signed = dx * nx + dy * ny;

        const progress = (this.cumLen[bestI] + this.segLen[bestI] * bestT) % this.totalLength;

        // blend curvature and turn sign between vertex i and i+1
        const k0 = this.curvature[bestI];
        const k1 = this.curvature[(bestI + 1) % n];
        const kappa = lerp(k0, k1, bestT);

        const s0 = this.turnSign[bestI];
        const s1 = this.turnSign[(bestI + 1) % n];
        const ts = Math.abs(lerp(s0, s1, bestT)) < 0.2 ? 0 : signNonZero(lerp(s0, s1, bestT));

        out.px = px;
        out.py = py;
        out.tx = tx;
        out.ty = ty;
        out.nx = nx;
        out.ny = ny;
        out.dist = dist;
        out.signedDist = signed;
        out.progress = progress;
        out.curvature = kappa;
        out.turnSign = ts;
    }

    /** Get point on centerline at distance s (wraps). */
    pointAtDistance(s: number, out: Vec2): void {
        let d = s % this.totalLength;
        if (d < 0) d += this.totalLength;

        const n = this.points.length;
        // linear scan (n is small ~200)
        for (let i = n - 1; i >= 0; i--) {
            if (this.cumLen[i] <= d) {
                const a = this.points[i];
                const b = this.points[(i + 1) % n];
                const seg = this.segLen[i];
                const t = seg > 1e-6 ? (d - this.cumLen[i]) / seg : 0;
                out.x = lerp(a.x, b.x, t);
                out.y = lerp(a.y, b.y, t);
                return;
            }
        }

        // fallback
        const p0 = this.points[0];
        out.x = p0.x;
        out.y = p0.y;
    }

    tangentAtDistance(s: number, out: Vec2): void {
        let d = s % this.totalLength;
        if (d < 0) d += this.totalLength;

        const n = this.points.length;
        for (let i = n - 1; i >= 0; i--) {
            if (this.cumLen[i] <= d) {
                out.x = this.tangents[i].x;
                out.y = this.tangents[i].y;
                return;
            }
        }
        out.x = 1;
        out.y = 0;
    }
}

function arcPoints(
    cx: number,
    cy: number,
    r: number,
    a0: number,
    a1: number,
    steps: number,
    out: Vec2[]
): void {
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const a = lerp(a0, a1, t);
        out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
}

/** =========================
 *  Visual trail primitives
 *  ========================= */
type DriftArc = {
    ax: number;
    ay: number;
    cx: number;
    cy: number;
    bx: number;
    by: number;
    age: number;
    life: number;
    alpha: number;
};

type SmokePuff = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    // cluster of circles
    circles: { ox: number; oy: number; r: number }[];
};

type CarState = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    heading: number; // rad
    steerAngle: number; // rad (front wheels)
    wheelSpin: number; // rad
};

type UiSnapshot = {
    // training
    episode: number;
    step: number;
    stepInEpisode: number;
    stepsPerEpisode: number;
    totalSteps: number;
    episodeReturn: number;
    bestReturn: number;
    avgReturn: number;
    reward: number;

    // learning signals (stylized)
    skill: number;
    epsilon: number;
    loss: number;
    qValue: number;

    // physics/telemetry
    speed: number;
    headingDeg: number;
    velDeg: number;
    slipDeg: number;
    desiredSlipDeg: number;
    curvature: number;
    trackError: number;

    steerCmd: number; // [-1..1]
    steerDeg: number;
    throttle: number; // [0..1]
    handbrake: number; // [0..1]

    driftIntensity: number; // [0..1]
};

function formatSigned(x: number, digits = 2): string {
    const s = x >= 0 ? '+' : '';
    return `${s}${x.toFixed(digits)}`;
}
function formatPct01(x: number): string {
    return `${Math.round(clamp01(x) * 100)}%`;
}

/** =========================
 *  RL Drift Trainer Simulation
 *  ========================= */
class DriftTrainerSim {
    // dimensions (CSS px)
    private w = 800;
    private h = 500;

    private rng = new RNG(0xdecafbad);

    private track: Track;

    private car: CarState;

    // visuals
    private arcs: DriftArc[] = [];
    private smoke: SmokePuff[] = [];
    private arcTimer = 0;
    private smokeTimer = 0;
    private driftHold = 0; // time spent in strong drift

    // training stats
    episode = 0;
    step = 0;
    stepInEpisode = 0;
    stepsPerEpisode = 720;

    episodeReturn = 0;
    bestReturn = -1e9;
    lastReward = 0;

    // histories
    private returns: number[] = [];
    private epsHistory: number[] = [];
    private skillHistory: number[] = [];

    // step traces (last few seconds)
    private slipTrace = new RingBuffer(260);
    private speedTrace = new RingBuffer(260);
    private rewardTrace = new RingBuffer(260);

    // derived "learning" scalars
    skill = 0; // 0..1
    epsilon = 0.55;
    loss = 0.9;
    qValue = 0.0;

    // controller parameters (shift over training)
    private maxSteer = degToRad(34);
    private steerRate = degToRad(220); // rad/s
    private wheelBase = 30; // px
    private carLength = 46; // px
    private carWidth = 24; // px

    private maxSpeed = 340; // px/s
    private maxAccel = 520; // px/s^2
    private brakeStrength = 820; // px/s^2
    private drag = 0.78; // 1/s

    private baseGrip = 7.2; // lateral "grip" coefficient
    private driftSpeed = 140; // px/s at which drift is meaningful

    private driftCurvThreshold = 0.010; // track curvature threshold for drift zones

    // controller state
    private kickTimer = 0;
    private prevInDriftZone = false;
    private prevSteerCmd = 0;
    private prevThrottle = 0;
    private prevHandbrake = 0;

    // scratch objects (avoid allocations per step)
    private sample: TrackSample = {
        px: 0,
        py: 0,
        tx: 1,
        ty: 0,
        nx: 0,
        ny: 1,
        signedDist: 0,
        dist: 0,
        progress: 0,
        curvature: 0,
        turnSign: 0,
    };
    private tmpVecA: Vec2 = { x: 0, y: 0 };
    private tmpVecB: Vec2 = { x: 0, y: 0 };

    // UI scratch
    private ui: UiSnapshot;

    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.track = new Track(w, h);

        this.car = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            heading: 0,
            steerAngle: 0,
            wheelSpin: 0,
        };

        this.ui = DriftTrainerSim.initialUi();
        this.resetEpisode(true);
    }

    static initialUi(): UiSnapshot {
        return {
            episode: 0,
            step: 0,
            stepInEpisode: 0,
            stepsPerEpisode: 720,
            totalSteps: 0,
            episodeReturn: 0,
            bestReturn: 0,
            avgReturn: 0,
            reward: 0,

            skill: 0,
            epsilon: 0,
            loss: 0,
            qValue: 0,

            speed: 0,
            headingDeg: 0,
            velDeg: 0,
            slipDeg: 0,
            desiredSlipDeg: 0,
            curvature: 0,
            trackError: 0,

            steerCmd: 0,
            steerDeg: 0,
            throttle: 0,
            handbrake: 0,

            driftIntensity: 0,
        };
    }

    resize(w: number, h: number): void {
        this.w = w;
        this.h = h;
        this.track.build(w, h);

        // re-tune a few size-dependent params
        const base = Math.min(w, h);
        this.carLength = clamp(base * 0.085, 42, 56);
        this.carWidth = clamp(base * 0.044, 20, 30);
        this.wheelBase = this.carLength * 0.62;

        // reset the running episode so we don't end up off-track after resize
        this.resetEpisode(false);
    }

    resetTraining(): void {
        this.episode = 0;
        this.step = 0;
        this.stepInEpisode = 0;

        this.episodeReturn = 0;
        this.bestReturn = -1e9;
        this.lastReward = 0;

        this.returns = [];
        this.epsHistory = [];
        this.skillHistory = [];

        this.slipTrace.clear();
        this.speedTrace.clear();
        this.rewardTrace.clear();

        this.skill = 0;
        this.epsilon = 0.55;
        this.loss = 0.9;
        this.qValue = 0;

        this.kickTimer = 0;
        this.prevInDriftZone = false;
        this.prevSteerCmd = 0;
        this.prevThrottle = 0;
        this.prevHandbrake = 0;

        this.resetEpisode(true);
    }

    /** Run simulation steps until we advance N episodes (visuals disabled). */
    fastForwardEpisodes(n: number): void {
        const targetEpisode = this.episode + Math.max(0, Math.floor(n));
        // Put visuals in a clean state
        this.arcs = [];
        this.smoke = [];
        this.arcTimer = 0;
        this.smokeTimer = 0;
        this.driftHold = 0;

        // Run with fixed dt
        let safety = 0;
        while (this.episode < targetEpisode && safety < 2_000_000) {
            this.stepOnce(FIXED_DT, false);
            safety++;
        }
    }

    /** One fixed step of the world. */
    stepOnce(dt: number, visualsEnabled: boolean): void {
        // Training schedules: skill grows with episodes; epsilon decays
        this.skill = clamp01(1 - Math.exp(-this.episode / 330));
        const skillForDrift = smoothstep(0.12, 0.92, this.skill);

        this.epsilon = lerp(0.55, 0.03, this.skill);
        // stylized loss + q
        this.loss = lerp(0.85, 0.02, this.skill) + this.rng.next() * 0.01;
        this.qValue = lerp(0.4, 2.8, this.skill) + this.rng.normal(0, 0.05);

        // Track sample
        this.track.closestSample(this.car.x, this.car.y, this.sample);

        // Lookahead target on centerline
        const speed = hypot(this.car.vx, this.car.vy);
        const lookahead = lerp(54, 110, clamp01(speed / this.maxSpeed));
        this.track.pointAtDistance(this.sample.progress + lookahead, this.tmpVecA);

        const desiredHeading = Math.atan2(this.tmpVecA.y - this.car.y, this.tmpVecA.x - this.car.x);
        const headingErr = wrapAngle(desiredHeading - this.car.heading);

        // Velocity / slip
        const velAng = Math.atan2(this.car.vy, this.car.vx);
        const slip = speed > 2 ? wrapAngle(velAng - this.car.heading) : 0;

        // Curvature / drift zone
        const curv = this.sample.curvature;
        const curvAbs = Math.abs(curv);
        const inDriftZone = curvAbs > this.driftCurvThreshold;

        // Planned drift goal gets more ambitious with "skill"
        const slipMax = degToRad(lerp(8, 32, skillForDrift));
        const zoneStrength = smoothstep(this.driftCurvThreshold, this.driftCurvThreshold * 3.2, curvAbs);
        const desiredSlip = inDriftZone ? this.sample.turnSign * slipMax * zoneStrength : 0;

        // Detect drift-zone entry → kick timer (handbrake pulse)
        if (!this.prevInDriftZone && inDriftZone) {
            // as skill improves, kick is shorter and more precise
            const kickDur = lerp(0.42, 0.22, this.skill);
            this.kickTimer = kickDur;
        }
        this.prevInDriftZone = inDriftZone;

        // Controller gains evolve to favor smoother, more stable drifts
        const headingK = lerp(1.55, 2.05, this.skill);
        const lateralK = lerp(0.38, 0.62, this.skill);
        const slipK = lerp(0.55, 1.05, this.skill);

        // Normalize track error by half road width (avoid div by 0)
        const halfRoad = Math.max(20, this.track.roadWidth * 0.5);
        const trackErrN = clamp(this.sample.signedDist / halfRoad, -2, 2);

        // Steering command:
        // - follow lookahead heading
        // - pull back to centerline
        // - target slip in drift zones (countersteer emerges from slip error term)
        let steerCmd =
            headingK * headingErr +
            lateralK * trackErrN +
            slipK * (desiredSlip - slip);

        // Kick into drift: quick steer jab + handbrake
        let handbrake = 0;
        if (this.kickTimer > 0) {
            this.kickTimer = Math.max(0, this.kickTimer - dt);
            handbrake = 1.0;
            // steer "into" the corner to initiate rotation
            const jab = lerp(0.9, 0.55, this.skill);
            steerCmd += this.sample.turnSign * jab;
        }

        // Desired speed: faster on straights, slightly moderated in corners (but still aggressive)
        const desiredSpeed = inDriftZone ? lerp(210, 260, this.skill) : lerp(240, 320, this.skill);
        let throttle = clamp01(0.62 + (desiredSpeed - speed) / desiredSpeed);

        // In drift zones, keep throttle steady to maintain slide (RWD power-over)
        if (inDriftZone) throttle = clamp01(throttle + 0.10);

        // Exploration noise (decays with training)
        steerCmd += this.rng.normal(0, this.epsilon * 0.35);
        throttle += this.rng.normal(0, this.epsilon * 0.10);
        if (handbrake > 0) {
            handbrake = clamp01(handbrake + Math.abs(this.rng.normal(0, this.epsilon * 0.12)));
        }

        steerCmd = clamp(steerCmd, -1, 1);
        throttle = clamp01(throttle);
        handbrake = clamp01(handbrake);

        // Smoothness penalty uses action deltas
        const dSteer = steerCmd - this.prevSteerCmd;
        const dThr = throttle - this.prevThrottle;
        const dHb = handbrake - this.prevHandbrake;
        this.prevSteerCmd = steerCmd;
        this.prevThrottle = throttle;
        this.prevHandbrake = handbrake;

        // Update steering angle with rate limit
        const steerTarget = steerCmd * this.maxSteer;
        const maxDelta = this.steerRate * dt;
        this.car.steerAngle = approach(this.car.steerAngle, steerTarget, maxDelta);

        // --- Physics update (simple drift-capable top-down model) ---
        const fX = Math.cos(this.car.heading);
        const fY = Math.sin(this.car.heading);

        // For yaw rate, use forward component of velocity
        const forwardSpeed = this.car.vx * fX + this.car.vy * fY;

        // Extra yaw boost during drift initiation / power-over
        const driftFactor =
            clamp01((Math.abs(this.car.steerAngle) / this.maxSteer) * 0.8 + throttle * 0.4 + handbrake * 1.1) *
            clamp01(speed / this.driftSpeed);

        const yawFromSteer = (forwardSpeed / Math.max(12, this.wheelBase)) * Math.tan(this.car.steerAngle);
        const yawBoost = driftFactor * 2.6 * this.sample.turnSign;

        const yawRate = clamp(yawFromSteer + yawBoost, -4.6, 4.6);
        this.car.heading = wrapAngle(this.car.heading + yawRate * dt);

        // Recompute forward/right after heading update
        const nfX = Math.cos(this.car.heading);
        const nfY = Math.sin(this.car.heading);
        const rX = -nfY;
        const rY = nfX;

        // Engine acceleration (RWD feel: stronger when in drift zone)
        const accel = throttle * this.maxAccel * (inDriftZone ? 1.08 : 1.0);
        this.car.vx += nfX * accel * dt;
        this.car.vy += nfY * accel * dt;

        // Handbrake removes speed and reduces grip
        if (handbrake > 0) {
            const vMag = hypot(this.car.vx, this.car.vy);
            if (vMag > 1e-3) {
                const bx = this.car.vx / vMag;
                const by = this.car.vy / vMag;
                const b = handbrake * this.brakeStrength;
                this.car.vx -= bx * b * dt;
                this.car.vy -= by * b * dt;
            }
        }

        // Lateral grip: remove sideways velocity component in car-local frame
        const sideSpeed = this.car.vx * rX + this.car.vy * rY;

        // Grip decreases when drifting (handbrake + throttle/steer at speed)
        const grip = this.baseGrip * lerp(1.0, 0.18, clamp01(driftFactor));
        this.car.vx -= rX * sideSpeed * grip * dt;
        this.car.vy -= rY * sideSpeed * grip * dt;

        // Drag
        const dragFactor = Math.max(0, 1 - this.drag * dt);
        this.car.vx *= dragFactor;
        this.car.vy *= dragFactor;

        // Clamp max speed
        const newSpeed = hypot(this.car.vx, this.car.vy);
        if (newSpeed > this.maxSpeed) {
            const s = this.maxSpeed / newSpeed;
            this.car.vx *= s;
            this.car.vy *= s;
        }

        // Integrate position
        this.car.x += this.car.vx * dt;
        this.car.y += this.car.vy * dt;

        // Wheel spin (rear wheels slightly more pronounced under throttle)
        const spinRate = (newSpeed / 10) * (1 + throttle * 0.35);
        this.car.wheelSpin = wrapAngle(this.car.wheelSpin + spinRate * dt);

        // --- Reward shaping: smooth, planned drifts on corners ---
        // Progress along tangent
        const progressSpeed = (this.car.vx * this.sample.tx + this.car.vy * this.sample.ty);
        const progressReward = clamp(progressSpeed / this.maxSpeed, -1, 1) * 0.55;

        // Track penalty
        const trackPenalty = Math.pow(clamp01(Math.abs(this.sample.signedDist) / halfRoad), 2) * 0.85;

        // Slip reward: in drift zones target desiredSlip, otherwise prefer low slip
        const slipErr = inDriftZone ? Math.abs(wrapAngle(slip - desiredSlip)) : Math.abs(slip);
        const slipReward = inDriftZone
            ? (1 - clamp01(slipErr / Math.max(1e-3, slipMax))) * 0.55
            : (1 - clamp01(slipErr / degToRad(18))) * 0.18;

        // Smoothness penalty (favor seamless drifts)
        const smoothPenalty = (Math.abs(dSteer) * 0.24 + Math.abs(dThr) * 0.12 + Math.abs(dHb) * 0.20);

        // Off-track termination
        const offTrack = Math.abs(this.sample.signedDist) > halfRoad * 1.07;

        const reward = progressReward + slipReward - trackPenalty - smoothPenalty;
        this.lastReward = reward;
        this.episodeReturn += reward;

        // Drift intensity & visuals signals
        const driftIntensity = clamp01(Math.abs(slip) / degToRad(32)) * clamp01(newSpeed / this.driftSpeed);

        if (driftIntensity > 0.65) this.driftHold += dt;
        else this.driftHold = Math.max(0, this.driftHold - dt * 1.3);

        if (visualsEnabled) {
            this.spawnAndUpdateVisuals(dt, driftIntensity, slip, newSpeed, desiredSlip, inDriftZone, handbrake);
        } else {
            // Keep visuals clean during fast-forward
            this.arcs = [];
            this.smoke = [];
            this.arcTimer = 0;
            this.smokeTimer = 0;
            this.driftHold = 0;
        }

        // Traces
        this.slipTrace.push(radToDeg(slip));
        this.speedTrace.push(newSpeed);
        this.rewardTrace.push(reward);

        // Step counters
        this.step++;
        this.stepInEpisode++;

        if (offTrack) {
            this.endEpisode(true);
            return;
        }

        if (this.stepInEpisode >= this.stepsPerEpisode) {
            this.endEpisode(false);
            return;
        }

        // Update UI snapshot cache (cheap values only)
        this.ui = this.makeUiSnapshot(steerCmd, throttle, handbrake, desiredSlip, driftIntensity, curv);
    }

    private spawnAndUpdateVisuals(
        dt: number,
        driftIntensity: number,
        slip: number,
        speed: number,
        desiredSlip: number,
        inDriftZone: boolean,
        handbrake: number
    ): void {
        // Aging existing arcs
        for (let i = this.arcs.length - 1; i >= 0; i--) {
            this.arcs[i].age += dt;
            if (this.arcs[i].age >= this.arcs[i].life) this.arcs.splice(i, 1);
        }

        // Aging smoke puffs
        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const p = this.smoke[i];
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.age >= p.life) this.smoke.splice(i, 1);
        }

        // Spawn stylized drift arcs (thin, repeated curves)
        this.arcTimer += dt;
        const arcInterval = lerp(0.11, 0.07, clamp01(driftIntensity));
        const shouldArc = driftIntensity > 0.30 && speed > this.driftSpeed * 0.75 && inDriftZone;

        if (shouldArc && this.arcTimer >= arcInterval) {
            this.arcTimer = 0;

            // rear wheel positions in world coords
            const rearOffset = -this.carLength * 0.34;
            const halfW = this.carWidth * 0.45;

            const hx = Math.cos(this.car.heading);
            const hy = Math.sin(this.car.heading);
            const rx = -hy;
            const ry = hx;

            const w1x = this.car.x + hx * rearOffset + rx * (-halfW);
            const w1y = this.car.y + hy * rearOffset + ry * (-halfW);
            const w2x = this.car.x + hx * rearOffset + rx * (halfW);
            const w2y = this.car.y + hy * rearOffset + ry * (halfW);

            const velMag = Math.max(1e-3, hypot(this.car.vx, this.car.vy));
            const vx = this.car.vx / velMag;
            const vy = this.car.vy / velMag;
            // arc length and curvature scale
            const arcLen = lerp(20, 34, clamp01(speed / this.maxSpeed));
            const curveAmt = lerp(8, 16, clamp01(Math.abs(slip - desiredSlip) / degToRad(28))) + this.rng.next() * 4;

            // Use slip sign to bend arcs in drift direction (graphic motion indicator)
            const bend = signNonZero(slip) * curveAmt;

            // Two arcs per wheel with slight offsets to create "repeated strokes"
            spawnArc(this.arcs, w1x, w1y, vx, vy, bend, arcLen, 0.95);
            spawnArc(this.arcs, w2x, w2y, vx, vy, bend, arcLen, 0.95);
            spawnArc(this.arcs, w1x + rx * 2, w1y + ry * 2, vx, vy, bend * 0.85, arcLen * 0.92, 0.75);
            spawnArc(this.arcs, w2x - rx * 2, w2y - ry * 2, vx, vy, bend * 0.85, arcLen * 0.92, 0.75);
        }

        // Spawn smoke only for long/heavy drifts
        this.smokeTimer += dt;
        const heavy = driftIntensity > 0.78 && this.driftHold > 0.65 && (handbrake > 0.2 || speed > this.driftSpeed);

        if (heavy && this.smokeTimer > 0.10) {
            this.smokeTimer = 0;

            const rearOffset = -this.carLength * 0.34;
            const halfW = this.carWidth * 0.45;

            const hx = Math.cos(this.car.heading);
            const hy = Math.sin(this.car.heading);
            const rx = -hy;
            const ry = hx;

            const w1x = this.car.x + hx * rearOffset + rx * (-halfW);
            const w1y = this.car.y + hy * rearOffset + ry * (-halfW);
            const w2x = this.car.x + hx * rearOffset + rx * (halfW);
            const w2y = this.car.y + hy * rearOffset + ry * (halfW);

            // slight upward drift in screen-space + a touch opposite velocity
            const vMag = Math.max(1e-3, hypot(this.car.vx, this.car.vy));
            const ovx = -this.car.vx / vMag;
            const ovy = -this.car.vy / vMag;

            spawnSmoke(this.smoke, this.rng, w1x, w1y, ovx, ovy);
            spawnSmoke(this.smoke, this.rng, w2x, w2y, ovx, ovy);
        }

        // keep arrays bounded
        if (this.arcs.length > 520) this.arcs.splice(0, this.arcs.length - 520);
        if (this.smoke.length > 220) this.smoke.splice(0, this.smoke.length - 220);
    }

    private endEpisode(crashed: boolean): void {
        const ret = crashed ? this.episodeReturn - 6.5 : this.episodeReturn;
        this.bestReturn = Math.max(this.bestReturn, ret);

        // Keep a compact history
        this.returns.push(ret);
        if (this.returns.length > 140) this.returns.shift();

        this.epsHistory.push(this.epsilon);
        if (this.epsHistory.length > 140) this.epsHistory.shift();

        this.skillHistory.push(this.skill);
        if (this.skillHistory.length > 140) this.skillHistory.shift();

        this.episode++;
        this.resetEpisode(false);
    }

    private resetEpisode(clearTraces: boolean): void {
        this.stepInEpisode = 0;
        this.episodeReturn = 0;
        this.lastReward = 0;

        this.kickTimer = 0;
        this.prevInDriftZone = false;
        this.prevSteerCmd = 0;
        this.prevThrottle = 0;
        this.prevHandbrake = 0;

        this.arcTimer = 0;
        this.smokeTimer = 0;
        this.driftHold = 0;
        this.arcs = [];
        this.smoke = [];

        if (clearTraces) {
            this.slipTrace.clear();
            this.speedTrace.clear();
            this.rewardTrace.clear();
        }

        // Start at distance 0 on track, oriented along tangent (clockwise)
        this.track.pointAtDistance(0, this.tmpVecA);
        this.track.tangentAtDistance(0, this.tmpVecB);

        this.car.x = this.tmpVecA.x;
        this.car.y = this.tmpVecA.y;
        this.car.heading = Math.atan2(this.tmpVecB.y, this.tmpVecB.x);

        // Give it a bit of initial forward speed
        const startSpeed = lerp(170, 240, clamp01(this.skill));
        this.car.vx = this.tmpVecB.x * startSpeed;
        this.car.vy = this.tmpVecB.y * startSpeed;

        this.car.steerAngle = 0;
        this.car.wheelSpin = 0;

        this.track.closestSample(this.car.x, this.car.y, this.sample);
        this.ui = this.makeUiSnapshot(0, 0.6, 0, 0, 0, this.sample.curvature);
    }

    private makeUiSnapshot(
        steerCmd: number,
        throttle: number,
        handbrake: number,
        desiredSlip: number,
        driftIntensity: number,
        curvature: number
    ): UiSnapshot {
        const speed = hypot(this.car.vx, this.car.vy);
        const velAng = Math.atan2(this.car.vy, this.car.vx);
        const slip = speed > 2 ? wrapAngle(velAng - this.car.heading) : 0;

        const avg = averageLast(this.returns, 24);

        return {
            episode: this.episode,
            step: this.step,
            stepInEpisode: this.stepInEpisode,
            stepsPerEpisode: this.stepsPerEpisode,
            totalSteps: this.step,
            episodeReturn: this.episodeReturn,
            bestReturn: this.bestReturn,
            avgReturn: avg,
            reward: this.lastReward,

            skill: this.skill,
            epsilon: this.epsilon,
            loss: this.loss,
            qValue: this.qValue,

            speed,
            headingDeg: radToDeg(this.car.heading),
            velDeg: radToDeg(velAng),
            slipDeg: radToDeg(slip),
            desiredSlipDeg: radToDeg(desiredSlip),
            curvature,
            trackError: this.sample.signedDist,

            steerCmd,
            steerDeg: radToDeg(this.car.steerAngle),
            throttle,
            handbrake,

            driftIntensity,
        };
    }

    getUiSnapshot(): UiSnapshot {
        return this.ui;
    }

    getReturnHistory(): number[] {
        return this.returns.slice();
    }
    getEpsilonHistory(): number[] {
        return this.epsHistory.slice();
    }
    getSkillHistory(): number[] {
        return this.skillHistory.slice();
    }

    getSlipTrace(): RingBuffer {
        return this.slipTrace;
    }
    getSpeedTrace(): RingBuffer {
        return this.speedTrace;
    }
    getRewardTrace(): RingBuffer {
        return this.rewardTrace;
    }

    render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        // Background (white) + subtle grid
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        drawFaintGrid(ctx, w, h);

        // Track (stroke-based road for clean vector look)
        drawTrack(ctx, this.track);

        // Drift arcs (light gray motion curves)
        drawDriftArcs(ctx, this.arcs);

        // Smoke (soft circles)
        drawSmoke(ctx, this.smoke);

        // Velocity arrow (subtle, helps "drift" readability)
        drawVelocityVector(ctx, this.car);

        // Car
        drawCar(ctx, this.car, this.carLength, this.carWidth, this.maxSteer);
    }

    drawCharts(
        returnCtx: CanvasRenderingContext2D | null,
        epsCtx: CanvasRenderingContext2D | null,
        slipCtx: CanvasRenderingContext2D | null,
        rewardCtx: CanvasRenderingContext2D | null
    ): void {
        if (returnCtx) {
            drawEpisodeChart(returnCtx, this.getReturnHistory(), this.bestReturn, 'Episode Return');
        }
        if (epsCtx) {
            // show skill and epsilon together
            drawDualChart(epsCtx, this.getSkillHistory(), this.getEpsilonHistory(), 'Skill / Epsilon');
        }
        if (slipCtx) {
            drawTraceChart(slipCtx, this.slipTrace, -40, 40, 'Slip (deg)');
        }
        if (rewardCtx) {
            drawTraceChart(rewardCtx, this.rewardTrace, -1.1, 1.1, 'Reward (step)');
        }
    }
}

function approach(cur: number, target: number, maxDelta: number): number {
    const d = target - cur;
    if (Math.abs(d) <= maxDelta) return target;
    return cur + Math.sign(d) * maxDelta;
}

function averageLast(arr: number[], n: number): number {
    if (arr.length === 0) return 0;
    const k = Math.max(1, Math.min(n, arr.length));
    let s = 0;
    for (let i = arr.length - k; i < arr.length; i++) s += arr[i] ?? 0;
    return s / k;
}

/** =========================
 *  Visual spawning helpers
 *  ========================= */
function spawnArc(
    arcs: DriftArc[],
    sx: number,
    sy: number,
    dirx: number,
    diry: number,
    bend: number,
    len: number,
    alpha: number
): void {
    // from start, go backward along velocity direction
    const bx = sx - dirx * len;
    const by = sy - diry * len;
    // control point: midpoint + perpendicular bend
    const mx = (sx + bx) * 0.5;
    const my = (sy + by) * 0.5;
    const px = -diry;
    const py = dirx;
    const cx = mx + px * bend;
    const cy = my + py * bend;

    arcs.push({
        ax: sx,
        ay: sy,
        cx,
        cy,
        bx,
        by,
        age: 0,
        life: 1.05,
        alpha,
    });
}

function spawnSmoke(
    smoke: SmokePuff[],
    rng: RNG,
    x: number,
    y: number,
    ovx: number,
    ovy: number
): void {
    const life = lerp(0.75, 1.25, rng.next());
    const baseV = lerp(16, 30, rng.next());
    const vx = ovx * baseV + rng.normal(0, 8);
    const vy = ovy * baseV + rng.normal(-18, 6); // upward-ish in screen coordinates

    const circles: { ox: number; oy: number; r: number }[] = [];
    const count = 4 + Math.floor(rng.next() * 3);
    for (let i = 0; i < count; i++) {
        circles.push({
            ox: rng.normal(0, 5),
            oy: rng.normal(0, 4),
            r: lerp(6, 12, rng.next()),
        });
    }

    smoke.push({
        x,
        y,
        vx,
        vy,
        age: 0,
        life,
        circles,
    });
}

/** =========================
 *  Rendering helpers
 *  ========================= */
function drawFaintGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const spacing = 34;
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.045)';
    ctx.lineWidth = 1;

    // vertical
    for (let x = 0; x <= w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
    }
    // horizontal
    for (let y = 0; y <= h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
    }

    ctx.restore();
}

function drawTrack(ctx: CanvasRenderingContext2D, track: Track): void {
    const pts = track.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Outer border
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = track.roadWidth + 10;
    ctx.stroke();

    // Road surface
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = track.roadWidth;
    ctx.stroke();

    // Centerline (thin dashed)
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.setLineDash([7, 10]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // A few subtle "apex markers" (dots)
    ctx.fillStyle = 'rgba(100, 116, 139, 0.22)';
    const stride = Math.max(10, Math.floor(pts.length / 10));
    for (let i = 0; i < pts.length; i += stride) {
        const p = pts[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, TAU);
        ctx.fill();
    }

    ctx.restore();
}

function drawDriftArcs(ctx: CanvasRenderingContext2D, arcs: DriftArc[]): void {
    ctx.save();
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const a of arcs) {
        const t = clamp01(a.age / a.life);

        // fade in quickly then fade out
        const fadeIn = smoothstep(0, 0.12, t);
        const fadeOut = 1 - smoothstep(0.55, 1.0, t);
        const alpha = a.alpha * fadeIn * fadeOut;

        ctx.strokeStyle = `rgba(148, 163, 184, ${alpha * 0.65})`;
        ctx.beginPath();
        ctx.moveTo(a.ax, a.ay);
        ctx.quadraticCurveTo(a.cx, a.cy, a.bx, a.by);
        ctx.stroke();
    }

    ctx.restore();
}

function drawSmoke(ctx: CanvasRenderingContext2D, smoke: SmokePuff[]): void {
    ctx.save();
    for (const p of smoke) {
        const t = clamp01(p.age / p.life);

        const scale = lerp(0.75, 1.65, smoothstep(0, 1, t));
        const alpha = Math.pow(1 - t, 2) * 0.25;

        ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`;

        for (const c of p.circles) {
            const r = c.r * scale;
            const ox = c.ox * scale;
            const oy = c.oy * scale;

            ctx.beginPath();
            ctx.arc(p.x + ox, p.y + oy, r, 0, TAU);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawVelocityVector(ctx: CanvasRenderingContext2D, car: CarState): void {
    const sp = hypot(car.vx, car.vy);
    if (sp < 2) return;

    const vx = car.vx / sp;
    const vy = car.vy / sp;

    ctx.save();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(car.x, car.y);
    ctx.lineTo(car.x + vx * 28, car.y + vy * 28);
    ctx.stroke();
    ctx.restore();
}

function drawCar(
    ctx: CanvasRenderingContext2D,
    car: CarState,
    carL: number,
    carW: number,
    maxSteer: number
): void {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);

    // Body (rounded rect)
    const halfL = carL * 0.5;
    const halfW = carW * 0.5;
    const radius = Math.min(halfW, 7);

    ctx.fillStyle = '#1f2937';
    roundedRect(ctx, -halfL, -halfW, carL, carW, radius);
    ctx.fill();

    // Window/roof (simple darker shape)
    ctx.fillStyle = '#0f172a';
    const roofL = carL * 0.56;
    const roofW = carW * 0.52;
    roundedRect(ctx, -roofL * 0.3, -roofW * 0.5, roofL, roofW, Math.min(roofW / 2, 6));
    ctx.fill();

    // Tail lights (minimal accent red)
    ctx.fillStyle = '#ef4444';
    const tlW = 4.6;
    const tlH = 2.2;
    // rear is -halfL
    ctx.fillRect(-halfL + 2.2, -halfW + 2.6, tlW, tlH);
    ctx.fillRect(-halfL + 2.2, halfW - 2.6 - tlH, tlW, tlH);

    // Wheels (barely visible, implied) + spin lines
    const wheelW = Math.max(5.5, carW * 0.22);
    const wheelH = Math.max(2.4, carW * 0.10);
    const wheelXFront = halfL * 0.28;
    const wheelXRear = -halfL * 0.28;
    const wheelY = halfW * 0.78;

    // front wheels steer with steerAngle
    drawWheel(ctx, wheelXFront, -wheelY, wheelW, wheelH, car.steerAngle, car.wheelSpin);
    drawWheel(ctx, wheelXFront, wheelY, wheelW, wheelH, car.steerAngle, car.wheelSpin);

    // rear wheels (RWD) — slight extra spin under throttle is baked into wheelSpin already
    drawWheel(ctx, wheelXRear, -wheelY, wheelW, wheelH, 0, car.wheelSpin);
    drawWheel(ctx, wheelXRear, wheelY, wheelW, wheelH, 0, car.wheelSpin);

    // subtle nose marker (helps orientation in top-down)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(halfL - 6, 0);
    ctx.lineTo(halfL - 2, 0);
    ctx.stroke();

    ctx.restore();
}

function drawWheel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    steerAngle: number,
    spin: number
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steerAngle);

    ctx.fillStyle = '#0b1220';
    roundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, 2));
    ctx.fill();

    // Spin line (implied tire rotation; graphic/clean)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.50)';
    ctx.lineWidth = 1.1;
    ctx.save();
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.moveTo(-w * 0.28, 0);
    ctx.lineTo(w * 0.28, 0);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
}

function roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
): void {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

/** =========================
 *  Charts
 *  ========================= */
function chartFrame(ctx: CanvasRenderingContext2D, title: string): { w: number; h: number } {
    const w = ctx.canvas.width / (window.devicePixelRatio || 1);
    const h = ctx.canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // frame
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // title
    ctx.fillStyle = 'rgba(100, 116, 139, 0.90)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 8, 6);

    ctx.restore();

    return { w, h };
}

function drawEpisodeChart(ctx: CanvasRenderingContext2D, data: number[], best: number, title: string): void {
    const { w, h } = chartFrame(ctx, title);

    const plotX = 8;
    const plotY = 20;
    const plotW = w - 16;
    const plotH = h - 28;

    if (data.length < 2) return;

    let minV = Math.min(...data);
    let maxV = Math.max(...data, best);

    // expand range a bit
    const pad = (maxV - minV) * 0.12 + 1e-3;
    minV -= pad;
    maxV += pad;

    // grid
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        const y = plotY + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
    }
    ctx.restore();

    // line
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.68)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
        const t = data.length === 1 ? 0 : i / (data.length - 1);
        const x = plotX + t * plotW;
        const y = plotY + (1 - (data[i] - minV) / (maxV - minV)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // best marker line
    ctx.save();
    const yBest = plotY + (1 - (best - minV) / (maxV - minV)) * plotH;
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(plotX, yBest);
    ctx.lineTo(plotX + plotW, yBest);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // last value label
    const last = data[data.length - 1] ?? 0;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(last.toFixed(1), plotX + plotW, 6);
    ctx.restore();
}

function drawDualChart(ctx: CanvasRenderingContext2D, a: number[], b: number[], title: string): void {
    const { w, h } = chartFrame(ctx, title);

    const plotX = 8;
    const plotY = 20;
    const plotW = w - 16;
    const plotH = h - 28;

    const n = Math.min(a.length, b.length);
    if (n < 2) return;

    // Both are [0..1-ish], clamp range to [0..1]
    const minV = 0;
    const maxV = 1;

    // grid
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        const y = plotY + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
    }
    ctx.restore();

    // skill (darker)
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.70)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = plotX + t * plotW;
        const y = plotY + (1 - (clamp01(a[i]) - minV) / (maxV - minV)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // epsilon (lighter)
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = plotX + t * plotW;
        const y = plotY + (1 - (clamp01(b[i]) - minV) / (maxV - minV)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // labels
    ctx.save();
    ctx.fillStyle = 'rgba(100, 116, 139, 0.85)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('skill', plotX, 6);
    ctx.textAlign = 'right';
    ctx.fillText('epsilon', plotX + plotW, 6);
    ctx.restore();
}

function drawTraceChart(ctx: CanvasRenderingContext2D, trace: RingBuffer, minV: number, maxV: number, title: string): void {
    const { w, h } = chartFrame(ctx, title);

    const plotX = 8;
    const plotY = 20;
    const plotW = w - 16;
    const plotH = h - 28;

    const n = trace.size();
    if (n < 2) return;

    // grid
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        const y = plotY + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(plotX, y);
        ctx.lineTo(plotX + plotW, y);
        ctx.stroke();
    }
    ctx.restore();

    // midline
    const mid = (minV + maxV) / 2;
    const yMid = plotY + (1 - (mid - minV) / (maxV - minV)) * plotH;
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.20)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(plotX, yMid);
    ctx.lineTo(plotX + plotW, yMid);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // line
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.68)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        const x = plotX + t * plotW;
        const v = trace.at(i);
        const y = plotY + (1 - (clamp(v, minV, maxV) - minV) / (maxV - minV)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // last label
    const last = trace.latest();
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(last.toFixed(1), plotX + plotW, 6);
    ctx.restore();
}

/** =========================
 *  Canvas resizing helper
 *  ========================= */
function resizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(cssW));
    const h = Math.max(1, Math.floor(cssH));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

/** =========================
 *  React component
 *  ========================= */
const EducationRLDrift: React.FC<Props> = ({ width, height }) => {
    const rootRef = useRef<HTMLDivElement | null>(null);

    const simWrapRef = useRef<HTMLDivElement | null>(null);
    const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const chartReturnWrapRef = useRef<HTMLDivElement | null>(null);
    const chartEpsWrapRef = useRef<HTMLDivElement | null>(null);
    const chartSlipWrapRef = useRef<HTMLDivElement | null>(null);
    const chartRewardWrapRef = useRef<HTMLDivElement | null>(null);

    const chartReturnCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartEpsCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartSlipCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartRewardCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const simRef = useRef<DriftTrainerSim | null>(null);

    const simCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartReturnCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartEpsCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartSlipCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartRewardCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    const rafRef = useRef<number>(0);
    const lastTRef = useRef<number>(0);
    const accRef = useRef<number>(0);
    const uiTimerRef = useRef<number>(0);

    const visibleRef = useRef<boolean>(true);

    const [running, setRunning] = useState(true);
    const [ui, setUi] = useState<UiSnapshot>(() => DriftTrainerSim.initialUi());

    const compact = width < 840;

    const rootStyle = useMemo<React.CSSProperties>(() => {
        return {
            width,
            height,
            flexDirection: compact ? 'column' : 'row',
        };
    }, [width, height, compact]);

    const ensureSim = useCallback((w: number, h: number) => {
        if (!simRef.current) simRef.current = new DriftTrainerSim(w, h);
        else simRef.current.resize(w, h);
    }, []);

    // ResizeObserver to size canvases to their rendered boxes
    useEffect(() => {
        const resizeAll = () => {
            // sim
            if (simWrapRef.current && simCanvasRef.current) {
                const r = simWrapRef.current.getBoundingClientRect();
                const ctx = resizeCanvas(simCanvasRef.current, r.width, r.height);
                simCtxRef.current = ctx;
                if (ctx) ensureSim(Math.floor(r.width), Math.floor(r.height));
            }

            // charts
            const resizeChart = (
                wrap: HTMLDivElement | null,
                canvas: HTMLCanvasElement | null,
                outRef: React.MutableRefObject<CanvasRenderingContext2D | null>
            ) => {
                if (!wrap || !canvas) return;
                const r = wrap.getBoundingClientRect();
                const ctx = resizeCanvas(canvas, r.width, r.height);
                outRef.current = ctx;
            };

            resizeChart(chartReturnWrapRef.current, chartReturnCanvasRef.current, chartReturnCtxRef);
            resizeChart(chartEpsWrapRef.current, chartEpsCanvasRef.current, chartEpsCtxRef);
            resizeChart(chartSlipWrapRef.current, chartSlipCanvasRef.current, chartSlipCtxRef);
            resizeChart(chartRewardWrapRef.current, chartRewardCanvasRef.current, chartRewardCtxRef);

            // update UI snapshot immediately after resize
            if (simRef.current) setUi(simRef.current.getUiSnapshot());
        };

        resizeAll();

        const ro = new ResizeObserver(() => resizeAll());
        if (simWrapRef.current) ro.observe(simWrapRef.current);
        if (chartReturnWrapRef.current) ro.observe(chartReturnWrapRef.current);
        if (chartEpsWrapRef.current) ro.observe(chartEpsWrapRef.current);
        if (chartSlipWrapRef.current) ro.observe(chartSlipWrapRef.current);
        if (chartRewardWrapRef.current) ro.observe(chartRewardWrapRef.current);

        return () => ro.disconnect();
    }, [ensureSim, width, height]);

    // Visibility observer to pause work offscreen
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const io = new IntersectionObserver(
            (entries) => {
                visibleRef.current = entries[0]?.isIntersecting ?? true;
            },
            { threshold: 0.05 }
        );
        io.observe(root);
        return () => io.disconnect();
    }, []);

    // RAF loop
    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const tick = (now: number) => {
            rafRef.current = requestAnimationFrame(tick);

            if (!visibleRef.current) return;

            const sim = simRef.current;
            const simCtx = simCtxRef.current;

            if (!sim || !simCtx) return;

            const dtMs = now - (lastTRef.current || now);
            lastTRef.current = now;

            // Clamp big jumps (tab switching)
            const dt = Math.min(0.05, Math.max(0, dtMs / 1000));

            if (running) {
                accRef.current += dt;

                // Limit work per frame
                const maxSteps = 10;
                let steps = 0;

                while (accRef.current >= FIXED_DT && steps < maxSteps) {
                    sim.stepOnce(FIXED_DT, true);
                    accRef.current -= FIXED_DT;
                    steps++;
                }
            }

            // Render sim every frame
            const simCanvas = simCanvasRef.current;
            if (simCanvas) {
                const wCss = simCanvas.width / (window.devicePixelRatio || 1);
                const hCss = simCanvas.height / (window.devicePixelRatio || 1);
                sim.render(simCtx, wCss, hCss);
            }

            // Update UI + charts at ~12fps
            uiTimerRef.current += dt;
            if (uiTimerRef.current > 0.085) {
                uiTimerRef.current = 0;

                setUi(sim.getUiSnapshot());

                sim.drawCharts(
                    chartReturnCtxRef.current,
                    chartEpsCtxRef.current,
                    chartSlipCtxRef.current,
                    chartRewardCtxRef.current
                );
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [running]);

    const onReset = useCallback(() => {
        const sim = simRef.current;
        if (!sim) return;
        sim.resetTraining();
        setUi(sim.getUiSnapshot());
    }, []);

    const onJump = useCallback((episodes: number) => {
        const sim = simRef.current;
        if (!sim) return;
        sim.fastForwardEpisodes(episodes);
        setUi(sim.getUiSnapshot());
    }, []);

    const status = running ? 'TRAINING' : 'PAUSED';

    return (
        <div className="rl-root" ref={rootRef} style={rootStyle}>
            {/* Simulation */}
            <div className="rl-sim" ref={simWrapRef}>
                <canvas ref={simCanvasRef} className="rl-sim-canvas" />
            </div>

            {/* Panel */}
            <div className="rl-panel">
                <div className="rl-controls">
                    <div className="rl-controls-top">
                        <div className="rl-title">RL DRIFT TRAINER</div>
                        <div className="rl-status">
                            <span className={`rl-dot ${running ? 'is-on' : ''}`} />
                            {status}
                        </div>
                    </div>

                    <div className="rl-buttons">
                        <button className="rl-btn rl-btn-primary" onClick={() => setRunning((r) => !r)}>
                            {running ? 'Pause' : 'Play'}
                        </button>
                        <button className="rl-btn" onClick={onReset}>
                            Reset
                        </button>

                        <div className="rl-spacer" />

                        <button className="rl-btn" onClick={() => onJump(10)}>
                            Jump +10
                        </button>
                        <button className="rl-btn" onClick={() => onJump(50)}>
                            Jump +50
                        </button>
                        <button className="rl-btn" onClick={() => onJump(200)}>
                            Jump +200
                        </button>
                        <button className="rl-btn" onClick={() => onJump(800)}>
                            Jump +800
                        </button>
                    </div>
                </div>

                {/* Dense numeric telemetry */}
                <div className="rl-telemetry">
                    <div className="rl-row">
                        <div className="k">EP</div>
                        <div className="v">{ui.episode}</div>
                        <div className="k">STEP</div>
                        <div className="v">
                            {ui.stepInEpisode}/{ui.stepsPerEpisode}
                        </div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Return</div>
                        <div className="v">{formatSigned(ui.episodeReturn, 2)}</div>
                        <div className="k">Best</div>
                        <div className="v">{formatSigned(ui.bestReturn, 2)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Avg(24)</div>
                        <div className="v">{formatSigned(ui.avgReturn, 2)}</div>
                        <div className="k">r(t)</div>
                        <div className="v">{formatSigned(ui.reward, 2)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Skill</div>
                        <div className="v">{formatPct01(ui.skill)}</div>
                        <div className="k">ε</div>
                        <div className="v">{ui.epsilon.toFixed(3)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Loss</div>
                        <div className="v">{ui.loss.toFixed(3)}</div>
                        <div className="k">Q̂</div>
                        <div className="v">{ui.qValue.toFixed(2)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Speed</div>
                        <div className="v">{ui.speed.toFixed(1)}</div>
                        <div className="k">Curv</div>
                        <div className="v">{ui.curvature.toFixed(4)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Heading</div>
                        <div className="v">{formatSigned(ui.headingDeg, 1)}°</div>
                        <div className="k">Vel</div>
                        <div className="v">{formatSigned(ui.velDeg, 1)}°</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Slip</div>
                        <div className="v">{formatSigned(ui.slipDeg, 1)}°</div>
                        <div className="k">Target</div>
                        <div className="v">{formatSigned(ui.desiredSlipDeg, 1)}°</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">TrackErr</div>
                        <div className="v">{formatSigned(ui.trackError, 1)}</div>
                        <div className="k">Drift</div>
                        <div className="v">{formatPct01(ui.driftIntensity)}</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Steer</div>
                        <div className="v">{formatSigned(ui.steerCmd, 2)}</div>
                        <div className="k">δ</div>
                        <div className="v">{formatSigned(ui.steerDeg, 1)}°</div>
                    </div>

                    <div className="rl-row">
                        <div className="k">Throttle</div>
                        <div className="v">{ui.throttle.toFixed(2)}</div>
                        <div className="k">HB</div>
                        <div className="v">{ui.handbrake.toFixed(2)}</div>
                    </div>
                </div>

                {/* Charts */}
                <div className="rl-charts">
                    <div className="rl-chart" ref={chartReturnWrapRef}>
                        <canvas ref={chartReturnCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartEpsWrapRef}>
                        <canvas ref={chartEpsCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartSlipWrapRef}>
                        <canvas ref={chartSlipCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartRewardWrapRef}>
                        <canvas ref={chartRewardCanvasRef} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EducationRLDrift;
