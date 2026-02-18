// src/pages/landing/visuals/EducationRLDrift.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import gsap from 'gsap';
import '../styles/EducationRLDrift.css';

/** =========================
 *  Types
 *  ========================= */
type Props = { width: number; height: number };
type Vec2 = { x: number; y: number };

type TrackSample = {
    px: number; py: number;
    tx: number; ty: number;
    nx: number; ny: number;
    signedDist: number;
    dist: number;
    progress: number;
    curvature: number;
    turnSign: number;
};

type CarState = {
    x: number; y: number;
    vx: number; vy: number;
    heading: number;
    omega: number;       // yaw rate (rad/s) — gives inertia to drifts
    steerAngle: number;
    wheelSpin: number;
};

type SmokePuff = {
    x: number; y: number;
    vx: number; vy: number;
    age: number; life: number;
    circles: { ox: number; oy: number; r: number }[];
};

type SkidPt = { lx: number; ly: number; rx: number; ry: number; alpha: number; gap: boolean; time: number };

type TrackTransition = {
    oldTrack: Track;
    /** Fraction of oldTrack that is/was visible — normally 1.0, less if interrupted mid-draw. */
    eraseEndFrac: number;
    newTrack: Track;
};

type UiSnapshot = {
    generation: number;
    totalSteps: number;
    aliveAgents: number;
    populationSize: number;

    bestFitness: number;
    currentBestFitness: number;
    avgFitness: number;

    skill: number;
    mutSigma: number;

    speed: number;
    slipDeg: number;
    headingErrDeg: number;
    trackError: number;
    driftIntensity: number;
    yawRate: number;

    steer: number;
    throttle: number;
    handbrake: number;
    reward: number;
    fitness: number;
};

/** =========================
 *  Math helpers
 *  ========================= */
const TAU = Math.PI * 2;
const FIXED_DT = 1 / 60;

function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }
function clamp01(x: number): number { return clamp(x, 0, 1); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function smoothstep(e0: number, e1: number, x: number): number {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
}
function wrapAngle(rad: number): number {
    let a = rad;
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
}
function radToDeg(r: number): number { return (r * 180) / Math.PI; }
function degToRad(d: number): number { return (d * Math.PI) / 180; }
function hypot(x: number, y: number): number { return Math.sqrt(x * x + y * y); }

/** =========================
 *  RNG (Mulberry32)
 *  ========================= */
class RNG {
    private seed: number;
    private spare: number | null = null;
    constructor(seed = 0x12345678) { this.seed = seed >>> 0; }
    next(): number {
        let t = (this.seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    normal(mean = 0, std = 1): number {
        if (this.spare !== null) { const z = this.spare; this.spare = null; return mean + z * std; }
        let u = 0, v = 0;
        while (u === 0) u = this.next();
        while (v === 0) v = this.next();
        const mag = Math.sqrt(-2.0 * Math.log(u));
        const z0 = mag * Math.cos(TAU * v);
        this.spare = mag * Math.sin(TAU * v);
        return mean + z0 * std;
    }
}

/** =========================
 *  RingBuffer
 *  ========================= */
class RingBuffer {
    private buf: number[];
    private idx = 0;
    private filled = false;
    constructor(private capacity: number) { this.buf = new Array(capacity).fill(0); }
    clear(): void { this.idx = 0; this.filled = false; this.buf.fill(0); }
    push(v: number): void {
        this.buf[this.idx] = v;
        this.idx = (this.idx + 1) % this.capacity;
        if (this.idx === 0) this.filled = true;
    }
    size(): number { return this.filled ? this.capacity : this.idx; }
    at(i: number): number {
        const size = this.size();
        if (size === 0) return 0;
        return this.buf[((this.filled ? this.idx : 0) + i) % this.capacity] ?? 0;
    }
    latest(): number { return this.size() === 0 ? 0 : this.at(this.size() - 1); }
}

/** =========================
 *  Neural Network  (9 → 16 → 16 → 3)
 *  ========================= */
const NN_ARCH = [9, 16, 16, 3] as const;

function nnWeightCount(arch: readonly number[]): number {
    let n = 0;
    for (let l = 0; l < arch.length - 1; l++) n += arch[l] * arch[l + 1] + arch[l + 1];
    return n;
}

class NeuralNet {
    readonly arch: readonly number[];
    readonly w: Float32Array;

    constructor(arch: readonly number[], rng?: RNG) {
        this.arch = arch;
        this.w = new Float32Array(nnWeightCount(arch));
        if (rng) this._initXavier(rng);
    }

    private _initXavier(rng: RNG): void {
        let off = 0;
        for (let l = 0; l < this.arch.length - 1; l++) {
            const n_in = this.arch[l];
            const n_out = this.arch[l + 1];
            const std = Math.sqrt(2.0 / n_in);
            for (let i = 0; i < n_in * n_out; i++) this.w[off + i] = rng.normal(0, std);
            off += n_in * n_out + n_out;
        }
    }

    forward(input: Float32Array): Float32Array {
        let cur = input;
        let off = 0;
        for (let l = 0; l < this.arch.length - 1; l++) {
            const n_in = this.arch[l];
            const n_out = this.arch[l + 1];
            const nxt = new Float32Array(n_out);
            const bOff = off + n_in * n_out;
            for (let j = 0; j < n_out; j++) {
                let s = this.w[bOff + j];
                for (let i = 0; i < n_in; i++) s += cur[i] * this.w[off + i * n_out + j];
                nxt[j] = Math.tanh(s);
            }
            cur = nxt;
            off += n_in * n_out + n_out;
        }
        return cur;
    }

    static clone(net: NeuralNet): NeuralNet {
        const r = new NeuralNet(net.arch);
        r.w.set(net.w);
        return r;
    }

    static mutate(net: NeuralNet, sigma: number, rng: RNG, rate = 0.12): NeuralNet {
        const r = NeuralNet.clone(net);
        for (let i = 0; i < r.w.length; i++) {
            if (rng.next() < rate) r.w[i] += rng.normal(0, sigma);
            if (rng.next() < 0.02) r.w[i] = rng.normal(0, 1.0); // random reset
        }
        return r;
    }

    static crossover(a: NeuralNet, b: NeuralNet, rng: RNG): NeuralNet {
        const r = NeuralNet.clone(a);
        for (let i = 0; i < r.w.length; i++) if (rng.next() < 0.5) r.w[i] = b.w[i];
        return r;
    }

    static random(rng: RNG): NeuralNet { return new NeuralNet(NN_ARCH, rng); }
}

/** =========================
 *  Track: rounded-rect centerline (supports multiple shapes)
 *  ========================= */
type TrackType = 'oval' | 'chicane' | 'circuit' | 'infinity';

class Track {
    points: Vec2[] = [];
    tangents: Vec2[] = [];
    segLen: number[] = [];
    cumLen: number[] = [];
    curvature: number[] = [];
    turnSign: number[] = [];
    totalLength = 1;
    roadWidth = 120;

    constructor(w: number, h: number, type: TrackType = 'oval') {
        this.build(w, h, type);
    }

    build(w: number, h: number, type: TrackType = 'oval'): void {
        const base = Math.min(w, h);
        this.roadWidth = clamp(base * 0.165, 58, 102);

        let rawPts: Vec2[];
        if (type === 'chicane') rawPts = this._buildChicane(w, h, base);
        else if (type === 'circuit') rawPts = this._buildCircuit(w, h, base);
        else if (type === 'infinity') rawPts = this._buildInfinity(w, h);
        else rawPts = this._buildOval(w, h, base);

        // Remove near-duplicates
        const cleaned: Vec2[] = [];
        const eps = 0.4;
        for (const p of rawPts) {
            const prev = cleaned[cleaned.length - 1];
            if (!prev || hypot(p.x - prev.x, p.y - prev.y) > eps) cleaned.push(p);
        }
        this.points = cleaned;

        const n = this.points.length;
        this.segLen = new Array(n).fill(0);
        this.cumLen = new Array(n).fill(0);
        this.tangents = new Array(n).fill(null).map(() => ({ x: 1, y: 0 }));

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

        this.curvature = new Array(n).fill(0);
        this.turnSign = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            const prev = this.tangents[(i - 1 + n) % n];
            const next = this.tangents[i];
            const cross = prev.x * next.y - prev.y * next.x;
            const dot = prev.x * next.x + prev.y * next.y;
            const ang = Math.atan2(cross, dot);
            const avgL = (this.segLen[(i - 1 + n) % n] + this.segLen[i]) * 0.5;
            const kappa = avgL > 1e-6 ? ang / avgL : 0;
            this.curvature[i] = kappa;
            this.turnSign[i] = Math.abs(ang) < 1e-4 ? 0 : Math.sign(ang);
        }
    }

    private _buildOval(w: number, h: number, base: number): Vec2[] {
        const pad = clamp(base * 0.18, 46, 86);
        const rect = { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };
        const r = Math.min(base * 0.20, rect.w / 2 - 2, rect.h / 2 - 2);
        const cs = clamp(Math.floor(base / 14), 10, 22);
        const es = clamp(Math.floor(base / 18), 10, 20);
        const pts: Vec2[] = [];
        const push = (x: number, y: number) => pts.push({ x, y });

        for (let i = 0; i <= es; i++) push(lerp(rect.x + r, rect.x + rect.w - r, i / es), rect.y);
        arcPoints(rect.x + rect.w - r, rect.y + r, r, -Math.PI / 2, 0, cs, pts);
        for (let i = 0; i <= es; i++) push(rect.x + rect.w, lerp(rect.y + r, rect.y + rect.h - r, i / es));
        arcPoints(rect.x + rect.w - r, rect.y + rect.h - r, r, 0, Math.PI / 2, cs, pts);
        for (let i = 0; i <= es; i++) push(lerp(rect.x + rect.w - r, rect.x + r, i / es), rect.y + rect.h);
        arcPoints(rect.x + r, rect.y + rect.h - r, r, Math.PI / 2, Math.PI, cs, pts);
        for (let i = 0; i <= es; i++) push(rect.x, lerp(rect.y + rect.h - r, rect.y + r, i / es));
        arcPoints(rect.x + r, rect.y + r, r, Math.PI, (3 * Math.PI) / 2, cs, pts);
        return pts;
    }

    private _buildChicane(w: number, h: number, base: number): Vec2[] {
        // Oval base with S-curve perturbations on the straights
        const pts = this._buildOval(w, h, base);
        const cx = w / 2;
        const cy = h / 2;
        const amp = base * 0.07; // chicane amplitude

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            // Detect straight sections (left/right or top/bottom) and add S-curve
            const dx = p.x - cx;
            const dy = p.y - cy;
            const isTopBottom = Math.abs(dy) > Math.abs(dx) * 0.8;
            if (isTopBottom) {
                // S-curve along horizontal straights
                const t = (p.x - cx) / (w / 2);
                pts[i] = { x: p.x, y: p.y + Math.sin(t * Math.PI * 1.8) * amp * Math.sign(dy) };
            }
        }
        return pts;
    }

    private _buildCircuit(w: number, h: number, base: number): Vec2[] {
        // Custom circuit with varied corner radii and a hairpin
        const pad = clamp(base * 0.14, 36, 70);
        const r1 = Math.min(base * 0.22, (w - 2 * pad) / 2);
        const r2 = Math.min(base * 0.10, r1 * 0.45); // tight hairpin
        const pts: Vec2[] = [];
        const cs = clamp(Math.floor(base / 14), 10, 22);
        const es = clamp(Math.floor(base / 18), 8, 18);

        const L = pad;
        const T = pad;
        const R = w - pad;
        const B = h - pad;
        const mx = (L + R) / 2;

        // Top straight (left to right)
        for (let i = 0; i <= es; i++) pts.push({ x: lerp(L + r1, R - r1, i / es), y: T });
        // Top-right long sweeper
        arcPoints(R - r1, T + r1, r1, -Math.PI / 2, 0, cs, pts);
        // Right side down to hairpin
        for (let i = 0; i <= es; i++) pts.push({ x: R, y: lerp(T + r1, B - r2 * 2 - r2, i / es) });
        // Hairpin (tight bottom-right)
        arcPoints(R - r2, B - r2 * 2, r2, 0, Math.PI / 2, cs, pts);
        // Bottom of hairpin going back left
        for (let i = 0; i <= Math.floor(es * 0.6); i++) pts.push({ x: lerp(R - r2, mx + r2, i / Math.floor(es * 0.6)), y: B - r2 });
        // Inner bottom loop around hairpin
        arcPoints(mx, B - r2, r2, 0, -Math.PI / 2, cs, pts);
        // Left infield straight to bottom-left corner
        for (let i = 0; i <= Math.floor(es * 0.8); i++) pts.push({ x: mx - r2, y: lerp(B - r2, B - r1, i / Math.floor(es * 0.8)) });
        // Bottom-left corner
        arcPoints(L + r1, B - r1, r1, Math.PI / 2, Math.PI, cs, pts);
        // Left straight back up
        for (let i = 0; i <= es; i++) pts.push({ x: L, y: lerp(B - r1, T + r1, i / es) });
        // Top-left corner
        arcPoints(L + r1, T + r1, r1, Math.PI, (3 * Math.PI) / 2, cs, pts);

        return pts;
    }

    private _buildInfinity(w: number, h: number): Vec2[] {
        const cx = w / 2;
        const cy = h / 2;
        // Lemniscate of Bernoulli: x = a√2·cos(t)/(1+sin²(t)), y = a√2·sin(t)cos(t)/(1+sin²(t))
        // x-range = [-a√2, a√2], y-range ≈ [-a√2·0.5, a√2·0.5]
        const pad = 48;
        const halfW = (w - pad * 2) / 2;
        const halfH = (h - pad * 2) / 2;
        const a = halfW / Math.SQRT2;                           // x-range exactly fills canvas
        const yStretch = Math.min(halfH / (a * 0.5), 1.6);    // stretch y to use height

        const steps = 240;
        const pts: Vec2[] = [];
        for (let i = 0; i < steps; i++) {
            const t = (i / steps) * Math.PI * 2;
            const denom = 1 + Math.sin(t) * Math.sin(t);
            pts.push({
                x: cx + a * Math.SQRT2 * Math.cos(t) / denom,
                y: cy + a * Math.SQRT2 * Math.sin(t) * Math.cos(t) / denom * yStretch,
            });
        }
        return pts;
    }

    closestSample(x: number, y: number, out: TrackSample): void {
        const n = this.points.length;
        let bestD2 = Infinity;
        let bestI = 0;
        let bestT = 0;

        for (let i = 0; i < n; i++) {
            const a = this.points[i];
            const b = this.points[(i + 1) % n];
            const abx = b.x - a.x, aby = b.y - a.y;
            const apx = x - a.x, apy = y - a.y;
            const denom = abx * abx + aby * aby;
            const t = denom > 1e-6 ? clamp01((apx * abx + apy * aby) / denom) : 0;
            const px = a.x + abx * t, py = a.y + aby * t;
            const dx = x - px, dy = y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) { bestD2 = d2; bestI = i; bestT = t; }
        }

        const a = this.points[bestI];
        const b = this.points[(bestI + 1) % n];
        const abx = b.x - a.x, aby = b.y - a.y;
        const px = a.x + abx * bestT, py = a.y + aby * bestT;
        const tx = this.tangents[bestI].x, ty = this.tangents[bestI].y;
        const nx = -ty, ny = tx;
        const dx = x - px, dy = y - py;
        const dist = Math.sqrt(bestD2);
        const signed = dx * nx + dy * ny;
        const progress = (this.cumLen[bestI] + this.segLen[bestI] * bestT) % this.totalLength;
        const k0 = this.curvature[bestI];
        const k1 = this.curvature[(bestI + 1) % n];
        const kappa = lerp(k0, k1, bestT);
        const s0 = this.turnSign[bestI];
        const s1 = this.turnSign[(bestI + 1) % n];
        const ts_raw = lerp(s0, s1, bestT);
        const ts = Math.abs(ts_raw) < 0.2 ? 0 : Math.sign(ts_raw);

        out.px = px; out.py = py; out.tx = tx; out.ty = ty;
        out.nx = nx; out.ny = ny; out.dist = dist; out.signedDist = signed;
        out.progress = progress; out.curvature = kappa; out.turnSign = ts;
    }

    pointAtDistance(s: number, out: Vec2): void {
        let d = ((s % this.totalLength) + this.totalLength) % this.totalLength;
        const n = this.points.length;
        for (let i = n - 1; i >= 0; i--) {
            if (this.cumLen[i] <= d) {
                const a = this.points[i];
                const b = this.points[(i + 1) % n];
                const t = this.segLen[i] > 1e-6 ? (d - this.cumLen[i]) / this.segLen[i] : 0;
                out.x = lerp(a.x, b.x, t);
                out.y = lerp(a.y, b.y, t);
                return;
            }
        }
        out.x = this.points[0].x; out.y = this.points[0].y;
    }

    tangentAtDistance(s: number, out: Vec2): void {
        let d = ((s % this.totalLength) + this.totalLength) % this.totalLength;
        const n = this.points.length;
        for (let i = n - 1; i >= 0; i--) {
            if (this.cumLen[i] <= d) { out.x = this.tangents[i].x; out.y = this.tangents[i].y; return; }
        }
        out.x = 1; out.y = 0;
    }

    curvatureAtDistance(s: number): number {
        let d = ((s % this.totalLength) + this.totalLength) % this.totalLength;
        const n = this.points.length;
        for (let i = n - 1; i >= 0; i--) {
            if (this.cumLen[i] <= d) return this.curvature[i];
        }
        return 0;
    }
}

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, steps: number, out: Vec2[]): void {
    for (let i = 1; i <= steps; i++) {
        const a = lerp(a0, a1, i / steps);
        out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
}

/** =========================
 *  Physics constants
 *  ========================= */
const MAX_STEER = degToRad(38);
const STEER_RATE = degToRad(290);  // rad/s
const MAX_SPEED = 330;             // px/s
const MAX_ACCEL = 560;             // px/s^2
const DRAG = 0.74;                 // velocity decay per second
const BASE_GRIP = 6.8;             // lateral grip coefficient
const DRIFT_GRIP_MIN = 0.12;       // minimum grip when full drift
const CAR_IZ = 0.14;              // yaw inertia (lower = more responsive)

/** =========================
 *  Agent: one car driven by a neural network
 *  ========================= */
class Agent {
    net: NeuralNet;
    car: CarState;
    alive = false;
    fitness = 0;
    stepsAlive = 0;

    // Skid mark trail (persistent tire trails)
    skidPts: SkidPt[] = [];
    smoke: SmokePuff[] = [];

    // Car dimensions (set by trainer)
    carLength = 46;
    carWidth = 24;
    wheelbase = 30;

    // Last NN actions (for telemetry)
    lastSteer = 0;
    lastThrottle = 0;
    lastHandbrake = 0;
    lastReward = 0;

    // Private state
    private prevProgress = 0;
    private prevSteer = 0;
    private prevThrottle = 0;
    private smokeTimer = 0;
    private driftHold = 0;
    private prevInDriftZone = false;
    private kickTimer = 0;
    private _sample: TrackSample = {
        px: 0, py: 0, tx: 1, ty: 0, nx: 0, ny: 1,
        signedDist: 0, dist: 0, progress: 0, curvature: 0, turnSign: 0
    };
    private _tmpV: Vec2 = { x: 0, y: 0 };

    constructor(net: NeuralNet) {
        this.net = net;
        this.car = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0, steerAngle: 0, wheelSpin: 0 };
    }

    reset(track: Track, rng: RNG, skill: number): void {
        this.alive = true;
        this.fitness = 0;
        this.stepsAlive = 0;
        this.lastSteer = this.lastThrottle = this.lastHandbrake = this.lastReward = 0;
        this.prevSteer = this.prevThrottle = 0;
        this.smokeTimer = this.driftHold = this.kickTimer = 0;
        this.prevInDriftZone = false;
        this.skidPts = [];
        this.smoke = [];

        // Random start position along track (small jitter)
        const startD = rng.next() * track.totalLength * 0.15;
        track.pointAtDistance(startD, this._tmpV);
        this.car.x = this._tmpV.x;
        this.car.y = this._tmpV.y;
        track.tangentAtDistance(startD, this._tmpV);
        this.car.heading = Math.atan2(this._tmpV.y, this._tmpV.x);

        const startSpeed = lerp(140, 210, clamp01(skill));
        this.car.vx = this._tmpV.x * startSpeed;
        this.car.vy = this._tmpV.y * startSpeed;
        this.car.omega = 0;
        this.car.steerAngle = 0;
        this.car.wheelSpin = 0;

        track.closestSample(this.car.x, this.car.y, this._sample);
        this.prevProgress = this._sample.progress;
    }

    stepOnce(track: Track, dt: number, maxSteps: number, visualsEnabled: boolean, rng: RNG): { reward: number; done: boolean } {
        // ---- Build neural network inputs ----
        track.closestSample(this.car.x, this.car.y, this._sample);

        const speed = hypot(this.car.vx, this.car.vy);
        const velAng = speed > 2 ? Math.atan2(this.car.vy, this.car.vx) : this.car.heading;
        const slip = wrapAngle(velAng - this.car.heading);

        const trackAngle = Math.atan2(this._sample.ty, this._sample.tx);
        const headingErr = wrapAngle(this.car.heading - trackAngle);

        const halfRoad = Math.max(20, track.roadWidth * 0.5);
        const lookaheadDist = lerp(55, 105, clamp01(speed / MAX_SPEED));
        const lookCurv = track.curvatureAtDistance(this._sample.progress + lookaheadDist);

        const inputs = new Float32Array([
            clamp01(speed / MAX_SPEED),                          // 0: speed
            clamp(this._sample.signedDist / halfRoad, -1, 1),   // 1: lateral error
            Math.sin(headingErr),                                // 2: heading error sin
            Math.cos(headingErr),                                // 3: heading error cos
            Math.sin(slip),                                      // 4: slip sin
            Math.cos(slip),                                      // 5: slip cos
            clamp(lookCurv * 80, -1, 1),                        // 6: ahead curvature
            clamp(this.car.omega / 5.0, -1, 1),                 // 7: yaw rate
            clamp01(this.stepsAlive / maxSteps),                 // 8: episode progress
        ]);

        // ---- Neural network forward pass ----
        const out = this.net.forward(inputs);
        const steerCmd = clamp(out[0], -1, 1);
        const throttleCmd = clamp01((out[1] + 1) / 2);         // [-1,1] → [0,1]
        const handbrakeCmd = clamp01((out[2] + 1) / 2);        // [-1,1] → [0,1]

        this.lastSteer = steerCmd;
        this.lastThrottle = throttleCmd;
        this.lastHandbrake = handbrakeCmd;

        // ---- Controller state (drift initiation kick) ----
        const curvAbs = Math.abs(this._sample.curvature);
        const inDriftZone = curvAbs > 0.007;

        if (!this.prevInDriftZone && inDriftZone) {
            this.kickTimer = 0.22; // brief handbrake pulse to initiate drift
        }
        this.prevInDriftZone = inDriftZone;
        if (this.kickTimer > 0) this.kickTimer = Math.max(0, this.kickTimer - dt);

        // Effective handbrake = NN's choice or kick override
        const effectiveHB = Math.max(handbrakeCmd, this.kickTimer > 0 ? 0.85 : 0);

        // ---- Physics update ----
        const hx = Math.cos(this.car.heading);
        const hy = Math.sin(this.car.heading);

        const forwardV = this.car.vx * hx + this.car.vy * hy;

        // Drift factor: how much rear traction is lost
        const driftFactor = clamp01(
            (Math.abs(this.car.steerAngle) / MAX_STEER) * 0.55 +
            throttleCmd * 0.28 +
            effectiveHB * 1.3
        ) * clamp01(speed / 100);

        // Yaw rate from steering (bicycle model approximation)
        const yawFromSteer = Math.abs(forwardV) > 8
            ? (forwardV / Math.max(10, this.wheelbase)) * Math.tan(this.car.steerAngle)
            : 0;

        // Power-oversteer yaw boost (RWD characteristic — rear pushes out)
        const turnDir = this._sample.turnSign !== 0 ? this._sample.turnSign
            : (Math.abs(slip) > degToRad(5) ? Math.sign(slip) : 0);
        const yawBoost = driftFactor * 2.9 * turnDir * clamp01(speed / 130);

        // Yaw with inertia (CAR_IZ controls how quickly heading responds)
        const targetOmega = yawFromSteer + yawBoost;
        const omegaDiff = targetOmega - this.car.omega;
        this.car.omega += omegaDiff * Math.min(1, dt / CAR_IZ);
        this.car.omega = clamp(this.car.omega, -5.8, 5.8);
        this.car.heading = wrapAngle(this.car.heading + this.car.omega * dt);

        // Steering angle update (rate-limited)
        const steerTarget = steerCmd * MAX_STEER;
        const maxSD = STEER_RATE * dt;
        this.car.steerAngle += clamp(steerTarget - this.car.steerAngle, -maxSD, maxSD);

        // Engine force (RWD: always forward relative to new heading)
        const nhx = Math.cos(this.car.heading);
        const nhy = Math.sin(this.car.heading);
        const nrx = -nhy, nry = nhx;

        const accel = throttleCmd * MAX_ACCEL * (inDriftZone ? 1.12 : 1.0);
        this.car.vx += nhx * accel * dt;
        this.car.vy += nhy * accel * dt;

        // Handbrake: reduces speed + kills rear grip
        if (effectiveHB > 0.05) {
            const vMag = hypot(this.car.vx, this.car.vy);
            if (vMag > 1) {
                const brake = effectiveHB * 750;
                this.car.vx -= (this.car.vx / vMag) * brake * dt;
                this.car.vy -= (this.car.vy / vMag) * brake * dt;
            }
        }

        // Lateral grip correction (Pacejka-inspired: grip falls as slip increases)
        const sideV = this.car.vx * nrx + this.car.vy * nry;
        const grip = BASE_GRIP * lerp(1.0, DRIFT_GRIP_MIN, driftFactor);
        this.car.vx -= nrx * sideV * grip * dt;
        this.car.vy -= nry * sideV * grip * dt;

        // Aerodynamic drag
        this.car.vx *= Math.max(0, 1 - DRAG * dt);
        this.car.vy *= Math.max(0, 1 - DRAG * dt);

        // Speed cap
        const newSpeed = hypot(this.car.vx, this.car.vy);
        if (newSpeed > MAX_SPEED) {
            this.car.vx *= MAX_SPEED / newSpeed;
            this.car.vy *= MAX_SPEED / newSpeed;
        }

        // Integrate position
        this.car.x += this.car.vx * dt;
        this.car.y += this.car.vy * dt;

        // Wheel spin (visual)
        this.car.wheelSpin = wrapAngle(this.car.wheelSpin + (newSpeed / 9) * dt);

        // ---- Reward computation ----
        track.closestSample(this.car.x, this.car.y, this._sample);

        let progDelta = this._sample.progress - this.prevProgress;
        if (progDelta < -track.totalLength * 0.5) progDelta += track.totalLength;
        if (progDelta > track.totalLength * 0.5) progDelta -= track.totalLength;
        this.prevProgress = this._sample.progress;

        const progressReward = clamp(progDelta / (MAX_SPEED * dt), -1, 1) * 0.65;

        const distNorm = Math.abs(this._sample.signedDist) / halfRoad;
        const trackPenalty = Math.pow(clamp01(distNorm), 2) * 0.75;

        const newSlip = wrapAngle(Math.atan2(this.car.vy, this.car.vx) - this.car.heading);
        const slipAbs = Math.abs(newSlip);
        const driftIntensity = clamp01(slipAbs / degToRad(28)) * clamp01(newSpeed / 110);

        // Drift reward: incentivize maintaining ~18-22° slip angle on corners
        let driftReward = 0;
        if (inDriftZone && driftIntensity > 0.2) {
            const idealSlip = degToRad(20);
            const slipErr = Math.abs(slipAbs - idealSlip);
            driftReward = (1 - clamp01(slipErr / idealSlip)) * 0.45
                * smoothstep(0.007, 0.020, curvAbs);
        }

        // Smoothness penalty
        const smoothPenalty = Math.abs(steerCmd - this.prevSteer) * 0.10
            + Math.abs(throttleCmd - this.prevThrottle) * 0.06;
        this.prevSteer = steerCmd;
        this.prevThrottle = throttleCmd;

        const reward = progressReward + driftReward - trackPenalty - smoothPenalty;
        this.fitness += reward;
        this.lastReward = reward;
        this.stepsAlive++;

        const offTrack = Math.abs(this._sample.signedDist) > halfRoad * 1.12;

        // ---- Visuals ----
        if (visualsEnabled) {
            this._updateVisuals(dt, driftIntensity, newSpeed, effectiveHB, rng);
        }

        return { reward, done: offTrack };
    }

    private _updateVisuals(dt: number, driftIntensity: number, speed: number, hb: number, rng: RNG): void {
        const hx = Math.cos(this.car.heading);
        const hy = Math.sin(this.car.heading);
        const rx = -hy, ry = hx;
        const rOff = -this.carLength * 0.36;
        const hw = this.carWidth * 0.46;

        const lrx = this.car.x + hx * rOff - rx * hw;
        const lry = this.car.y + hy * rOff - ry * hw;
        const rrx = this.car.x + hx * rOff + rx * hw;
        const rry = this.car.y + hy * rOff + ry * hw;

        // Persistent skid marks (only when actively drifting)
        if (driftIntensity > 0.22 && speed > 70) {
            const prevL = this.skidPts[this.skidPts.length - 1];
            const moved = !prevL || prevL.gap ||
                hypot(lrx - prevL.lx, lry - prevL.ly) > 2.5;
            if (moved) {
                this.skidPts.push({
                    lx: lrx, ly: lry, rx: rrx, ry: rry,
                    alpha: clamp01(driftIntensity * 1.6) * 0.55,
                    gap: false,
                    time: performance.now()
                });
            }
        } else {
            // Add gap marker so lines don't connect across non-drifting gaps
            const last = this.skidPts[this.skidPts.length - 1];
            if (last && !last.gap) {
                this.skidPts.push({ lx: last.lx, ly: last.ly, rx: last.rx, ry: last.ry, alpha: 0, gap: true, time: performance.now() });
            }
        }

        // Remove fully aged-out points from front (time-based)
        const EXPIRE_MS = 3400;
        const now2 = performance.now();
        while (this.skidPts.length > 1) {
            const front = this.skidPts[0]!;
            if (!front.gap && now2 - front.time > EXPIRE_MS) {
                this.skidPts.shift();
            } else if (front.gap) {
                // Remove gap markers at front only if the next real point is also expired
                const next = this.skidPts[1];
                if (next && !next.gap && now2 - next.time > EXPIRE_MS) {
                    this.skidPts.shift();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        // Hard cap as safety net
        if (this.skidPts.length > 900) this.skidPts.splice(0, 80);

        // Drift hold for heavy smoke
        if (driftIntensity > 0.65) this.driftHold += dt;
        else this.driftHold = Math.max(0, this.driftHold - dt * 1.6);

        // Spawn smoke on heavy drifts
        this.smokeTimer += dt;
        const heavy = driftIntensity > 0.38 && this.driftHold > 0.18 && (hb > 0.06 || speed > 65);
        if (heavy && this.smokeTimer > 0.06) {
            this.smokeTimer = 0;
            const sp = Math.max(1, speed);
            spawnSmoke(this.smoke, rng, lrx, lry, -this.car.vx / sp, -this.car.vy / sp);
            spawnSmoke(this.smoke, rng, rrx, rry, -this.car.vx / sp, -this.car.vy / sp);
        }

        // Age smoke
        for (let i = this.smoke.length - 1; i >= 0; i--) {
            const p = this.smoke[i];
            p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
            if (p.age >= p.life) this.smoke.splice(i, 1);
        }
        if (this.smoke.length > 70) this.smoke.splice(0, 20);
    }
}

function spawnSmoke(smoke: SmokePuff[], rng: RNG, x: number, y: number, ovx: number, ovy: number): void {
    const life = lerp(0.6, 1.1, rng.next());
    const bv = lerp(12, 24, rng.next());
    const circles: SmokePuff['circles'] = [];
    const cnt = 3 + Math.floor(rng.next() * 3);
    for (let i = 0; i < cnt; i++) circles.push({ ox: rng.normal(0, 4), oy: rng.normal(0, 3.5), r: lerp(5, 10, rng.next()) });
    smoke.push({
        x, y,
        vx: ovx * bv + rng.normal(0, 7),
        vy: ovy * bv + rng.normal(-14, 5),
        age: 0, life, circles
    });
}

/** =========================
 *  Genetic Drift Trainer
 *  ========================= */
const POP_SIZE = 8;
const ELITE_COUNT = 3;

class GeneticDriftTrainer {
    private rng = new RNG(0xdeadbeef);

    track: Track;
    private trackType: TrackType = 'oval';

    private pop: Agent[] = [];
    private generation = 0;
    private totalSteps = 0;

    bestFitness = -Infinity;
    private genBestHistory: number[] = [];
    private genAvgHistory: number[] = [];

    // Live traces from best current agent
    liveSlipTrace = new RingBuffer(220);
    liveRewardTrace = new RingBuffer(220);
    liveSpeedTrace = new RingBuffer(220);

    // Mutation schedule
    private mutSigma = 1.2;

    // Car sizing
    private carLength = 46;
    private carWidth = 24;
    private wheelbase = 30;

    private _ui: UiSnapshot;
    private _stepsPerEpisode = 600;
    private transition: TrackTransition | null = null;
    /** GSAP-animated proxy — drives the visual transition. */
    private _transProxy = { eraseT: 0, drawT: 0, carFade: 1 };
    private _transTimeline: gsap.core.Timeline | null = null;

    constructor(w: number, h: number) {
        this.track = new Track(w, h, 'oval');
        this._resizeCar(w, h);
        this._initPop();
        this._ui = this._buildUiSnap(null);
    }

    private _resizeCar(w: number, h: number): void {
        const base = Math.min(w, h);
        this.carLength = clamp(base * 0.064, 32, 42);
        this.carWidth = clamp(base * 0.033, 15, 22);
        this.wheelbase = this.carLength * 0.62;
    }

    private _applySize(a: Agent): void {
        a.carLength = this.carLength;
        a.carWidth = this.carWidth;
        a.wheelbase = this.wheelbase;
    }

    private _skill(): number {
        return clamp01(1 - Math.exp(-this.generation / 260));
    }

    private _initPop(): void {
        this.pop = [];
        for (let i = 0; i < POP_SIZE; i++) {
            const net = NeuralNet.random(this.rng);
            const a = new Agent(net);
            this._applySize(a);
            a.reset(this.track, this.rng, 0);
            this.pop.push(a);
        }
    }

    private _resetEpisode(): void {
        const skill = this._skill();
        for (const a of this.pop) {
            this._applySize(a);
            a.reset(this.track, this.rng, skill);
        }
    }

    resize(w: number, h: number): void {
        this.track.build(w, h, this.trackType);
        this._resizeCar(w, h);
        this._resetEpisode();
    }

    setTrackType(type: TrackType, w: number, h: number): void {
        if (type === this.trackType) return;

        // --- Determine what is currently visible so we resume seamlessly ---
        let oldTrack: Track;
        let eraseEndFrac = 1.0;
        let initialEraseT = 0;

        if (this._transTimeline) {
            this._transTimeline.kill();
            this._transTimeline = null;

            if (this.transition) {
                const { eraseT, drawT } = this._transProxy;
                if (drawT > 0.005) {
                    // Interrupted mid-draw: only the drawn portion is visible
                    oldTrack = this.transition.newTrack;
                    eraseEndFrac = clamp01(drawT);
                    initialEraseT = 0;
                } else if (eraseT > 0.005 && eraseT < 0.995) {
                    // Interrupted mid-erase: continue from current erase position
                    oldTrack = this.transition.oldTrack;
                    eraseEndFrac = this.transition.eraseEndFrac;
                    initialEraseT = eraseT;
                } else {
                    // Car-exit or gap phase — treat as full old track
                    oldTrack = this.transition.oldTrack;
                    eraseEndFrac = this.transition.eraseEndFrac;
                    initialEraseT = eraseT > 0.995 ? 1 : 0;
                }
            } else {
                oldTrack = this.track;
            }
        } else {
            oldTrack = this.track;
        }

        const newTrack = new Track(w, h, type);
        this.transition = { oldTrack, eraseEndFrac, newTrack };

        this._transProxy.eraseT = initialEraseT;
        this._transProxy.drawT = 0;
        // carFade keeps its current value so interrupts don't snap

        // Erase duration proportional to remaining visible arc
        const remainingErase = eraseEndFrac * (1 - initialEraseT);
        const eraseDuration = Math.max(0, remainingErase * 0.55);
        const drawStart = eraseDuration + 0.08; // small gap after erase

        const tl = gsap.timeline({
            onComplete: () => { this.transition = null; this._transTimeline = null; },
        });

        // Cars fade out and erase begin simultaneously
        tl.to(this._transProxy, { carFade: 0, duration: 0.15, ease: 'power2.in' }, 0);
        if (eraseDuration > 0.01) {
            tl.to(this._transProxy, { eraseT: 1, duration: eraseDuration, ease: 'power2.inOut' }, 0);
        } else {
            this._transProxy.eraseT = 1; // snap to blank immediately
        }

        // New track builds in
        tl.to(this._transProxy, { drawT: 1, duration: 0.75, ease: 'power2.inOut' }, drawStart);

        // Cars fade in overlapping the last 0.1 s of drawing
        tl.to(this._transProxy, { carFade: 1, duration: 0.28, ease: 'power2.out' }, drawStart + 0.65);

        this._transTimeline = tl;
        this.trackType = type;
        this.track = newTrack; // physics on new track immediately
        this._resetEpisode();
    }

    resetTraining(w?: number, h?: number): void {
        this.generation = 0;
        this.totalSteps = 0;
        this.bestFitness = -Infinity;
        this.genBestHistory = [];
        this.genAvgHistory = [];
        this.liveSlipTrace.clear();
        this.liveRewardTrace.clear();
        this.liveSpeedTrace.clear();
        this.mutSigma = 1.2;
        if (w && h) { this.track.build(w, h, this.trackType); this._resizeCar(w, h); }
        this._initPop();
    }

    fastForward(nGen: number): void {
        const target = this.generation + nGen;
        let safety = 0;
        const maxSafety = nGen * POP_SIZE * 900 + 10000;
        while (this.generation < target && safety < maxSafety) {
            this._tickAll(FIXED_DT, false);
            safety++;
        }
    }

    stepAll(dt: number, visualsEnabled: boolean): void {
        this._tickAll(dt, visualsEnabled);
    }

    private _tickAll(dt: number, visuals: boolean): void {
        const maxSteps = this._stepsPerEpisode;
        let anyAlive = false;
        let bestAgent: Agent | null = null;
        let bestFit = -Infinity;

        for (const a of this.pop) {
            if (!a.alive) continue;
            if (a.stepsAlive >= maxSteps) { a.alive = false; continue; }

            const { done } = a.stepOnce(this.track, dt, maxSteps, visuals, this.rng);
            this.totalSteps++;
            anyAlive = true;
            if (done) { a.alive = false; continue; }

            if (a.fitness > bestFit) { bestFit = a.fitness; bestAgent = a; }
        }

        // Live traces from best agent
        if (visuals && bestAgent) {
            const sp = hypot(bestAgent.car.vx, bestAgent.car.vy);
            const velAng = sp > 2 ? Math.atan2(bestAgent.car.vy, bestAgent.car.vx) : bestAgent.car.heading;
            const slip = wrapAngle(velAng - bestAgent.car.heading);
            this.liveSlipTrace.push(radToDeg(slip));
            this.liveSpeedTrace.push(sp);
            this.liveRewardTrace.push(bestAgent.lastReward);
        }

        if (!anyAlive) {
            this._evolve();
            this._resetEpisode();
        }

        this._ui = this._buildUiSnap(bestAgent);
    }

    private _evolve(): void {
        this.pop.sort((a, b) => b.fitness - a.fitness);

        const best = this.pop[0];
        const bestFit = best?.fitness ?? 0;
        const avgFit = this.pop.reduce((s, a) => s + a.fitness, 0) / this.pop.length;

        if (bestFit > this.bestFitness) {
            this.bestFitness = bestFit;
        }

        this.genBestHistory.push(bestFit);
        this.genAvgHistory.push(avgFit);
        if (this.genBestHistory.length > 140) this.genBestHistory.shift();
        if (this.genAvgHistory.length > 140) this.genAvgHistory.shift();

        // Sigma annealing
        this.mutSigma = Math.max(0.04, this.mutSigma * 0.975);

        const elites = this.pop.slice(0, ELITE_COUNT);
        const newPop: Agent[] = [];

        // Keep elites
        for (const e of elites) {
            const a = new Agent(NeuralNet.clone(e.net));
            this._applySize(a);
            newPop.push(a);
        }

        // Offspring
        while (newPop.length < POP_SIZE) {
            const r = this.rng.next();
            let net: NeuralNet;
            if (r < 0.38 && elites.length >= 2) {
                const pa = elites[Math.floor(this.rng.next() * elites.length)]!;
                const pb = elites[Math.floor(this.rng.next() * elites.length)]!;
                net = NeuralNet.crossover(pa.net, pb.net, this.rng);
                net = NeuralNet.mutate(net, this.mutSigma, this.rng, 0.08);
            } else if (r < 0.82) {
                const par = elites[Math.floor(this.rng.next() * elites.length)]!;
                net = NeuralNet.mutate(par.net, this.mutSigma, this.rng, 0.14);
            } else {
                net = NeuralNet.random(this.rng);
            }
            const a = new Agent(net);
            this._applySize(a);
            newPop.push(a);
        }

        this.pop = newPop;
        this.generation++;
    }

    render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        // --- Track transition (driven by GSAP proxy) ---
        let carAlpha = 1;
        let carScale = 1;
        let showCars = true;

        if (this.transition) {
            const { eraseT, drawT, carFade } = this._transProxy;
            const { oldTrack, newTrack, eraseEndFrac } = this.transition;

            carAlpha = carFade;
            carScale = smoothstep(0, 1, carFade); // ease the scale for nicer pop

            if (drawT > 0.005) {
                // Draw phase or car-enter phase
                if (drawT < 0.995) {
                    drawTrackPartial(ctx, newTrack, 0, drawT, 'end');
                    showCars = false;
                } else {
                    drawTrack(ctx, this.track); // fully drawn, show cars fading in
                }
            } else if (eraseT > 0.005) {
                // Erase phase or gap (blank canvas)
                showCars = false;
                if (eraseT < 0.995 && eraseEndFrac > 0) {
                    const startFrac = eraseEndFrac * eraseT;
                    drawTrackPartial(ctx, oldTrack, startFrac, eraseEndFrac, 'start');
                }
                // else: gap — blank canvas intentionally
            } else {
                // Car-exit phase: full old track visible, cars fading out
                drawTrackPartial(ctx, oldTrack, 0, eraseEndFrac, null);
            }
        } else {
            drawTrack(ctx, this.track);
        }

        // Cars, skid marks, smoke, overlay — always gated by showCars + carAlpha
        if (showCars && carAlpha > 0.01) {
            const sorted = [...this.pop].sort((a, b) => b.fitness - a.fitness);

            // Helper: draw with per-car scale (around car centre) + global alpha
            const withCarFx = (fn: () => void, cx: number, cy: number) => {
                ctx.save();
                ctx.globalAlpha = carAlpha;
                ctx.translate(cx, cy);
                ctx.scale(carScale, carScale);
                ctx.translate(-cx, -cy);
                fn();
                ctx.restore();
            };

            // Skid marks and smoke: fade with carAlpha but no scale (world-space effects)
            ctx.save();
            ctx.globalAlpha = carAlpha;
            const skidNow = performance.now();
            for (const a of this.pop) {
                if (a.skidPts.length > 1) drawSkidMarks(ctx, a.skidPts, skidNow);
            }
            for (const a of this.pop) {
                if (a.smoke.length > 0) drawSmoke(ctx, a.smoke);
            }
            ctx.restore();

            // Ghost agents
            for (let i = 1; i < sorted.length; i++) {
                const a = sorted[i]!;
                if (a.alive) withCarFx(() => drawCarGhost(ctx, a, i), a.car.x, a.car.y);
            }

            // Champion on top
            if (sorted[0]?.alive) {
                const champ = sorted[0]!;
                withCarFx(() => drawCarChampion(ctx, champ), champ.car.x, champ.car.y);
            }

            // Info overlay
            drawSimOverlay(ctx, w,
                this.generation,
                this.pop.filter(a => a.alive).length,
                POP_SIZE,
                this.bestFitness
            );
        }
    }

    drawCharts(
        fitCtx: CanvasRenderingContext2D | null,
        sigCtx: CanvasRenderingContext2D | null,
        slipCtx: CanvasRenderingContext2D | null,
        rewardCtx: CanvasRenderingContext2D | null
    ): void {
        if (fitCtx) drawFitnessChart(fitCtx, this.genBestHistory, this.genAvgHistory, 'Fitness / Generation');
        if (sigCtx) drawSigmaChart(sigCtx, this.genBestHistory.length, this.mutSigma);
        if (slipCtx) drawTraceChart(slipCtx, this.liveSlipTrace, -45, 45, 'Live Slip (°)');
        if (rewardCtx) drawTraceChart(rewardCtx, this.liveRewardTrace, -1.2, 1.2, 'Live Reward');
    }

    getUiSnapshot(): UiSnapshot { return this._ui; }
    getGenBestHistory(): number[] { return this.genBestHistory.slice(); }
    getGenAvgHistory(): number[] { return this.genAvgHistory.slice(); }

    private _buildUiSnap(bestAgent: Agent | null): UiSnapshot {
        const skill = this._skill();
        const aliveAgents = this.pop.filter(a => a.alive).length;
        const lastGenAvg = this.genAvgHistory[this.genAvgHistory.length - 1] ?? 0;

        if (!bestAgent) {
            return {
                generation: this.generation, totalSteps: this.totalSteps,
                aliveAgents, populationSize: POP_SIZE,
                bestFitness: Math.max(0, this.bestFitness),
                currentBestFitness: 0, avgFitness: lastGenAvg,
                skill, mutSigma: this.mutSigma,
                speed: 0, slipDeg: 0, headingErrDeg: 0, trackError: 0, driftIntensity: 0, yawRate: 0,
                steer: 0, throttle: 0, handbrake: 0, reward: 0, fitness: 0,
            };
        }

        const sp = hypot(bestAgent.car.vx, bestAgent.car.vy);
        const velAng = sp > 2 ? Math.atan2(bestAgent.car.vy, bestAgent.car.vx) : bestAgent.car.heading;
        const slip = wrapAngle(velAng - bestAgent.car.heading);

        const smp: TrackSample = { px: 0, py: 0, tx: 1, ty: 0, nx: 0, ny: 1, signedDist: 0, dist: 0, progress: 0, curvature: 0, turnSign: 0 };
        this.track.closestSample(bestAgent.car.x, bestAgent.car.y, smp);
        const trackAngle = Math.atan2(smp.ty, smp.tx);
        const headingErr = wrapAngle(bestAgent.car.heading - trackAngle);
        const driftIntensity = clamp01(Math.abs(slip) / degToRad(28)) * clamp01(sp / 110);

        return {
            generation: this.generation, totalSteps: this.totalSteps,
            aliveAgents, populationSize: POP_SIZE,
            bestFitness: Math.max(0, this.bestFitness),
            currentBestFitness: bestAgent.fitness,
            avgFitness: lastGenAvg,
            skill, mutSigma: this.mutSigma,
            speed: sp, slipDeg: radToDeg(slip),
            headingErrDeg: radToDeg(headingErr),
            trackError: smp.signedDist,
            driftIntensity, yawRate: bestAgent.car.omega,
            steer: bestAgent.lastSteer,
            throttle: bestAgent.lastThrottle,
            handbrake: bestAgent.lastHandbrake,
            reward: bestAgent.lastReward,
            fitness: bestAgent.fitness,
        };
    }
}

/** =========================
 *  Rendering helpers
 *  ========================= */
function drawTrack(ctx: CanvasRenderingContext2D, track: Track): void {
    const pts = track.points;
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const drawPath = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.closePath();
    };

    // Outer border
    drawPath(); ctx.strokeStyle = 'rgba(226,232,240,1)'; ctx.lineWidth = track.roadWidth + 12; ctx.stroke();
    // Road surface
    drawPath(); ctx.strokeStyle = 'rgba(226,232,240,0.35)'; ctx.lineWidth = track.roadWidth; ctx.stroke();
    // Centerline dashes
    drawPath(); ctx.strokeStyle = 'rgba(226,232,240,0.65)'; ctx.setLineDash([7, 11]); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

/**
 * Draw an arc of the track from [startFrac, endFrac] (0–1).
 * fadeEdge: 'start' fades the leading edge that's disappearing (erase animation);
 *           'end'   fades the leading edge that's appearing  (draw  animation).
 */
function drawTrackPartial(
    ctx: CanvasRenderingContext2D,
    track: Track,
    startFrac: number,
    endFrac: number,
    fadeEdge: 'start' | 'end' | null = null,
): void {
    const pts = track.points;
    const n = pts.length;
    if (n < 2 || endFrac <= startFrac) return;

    const si = Math.min(n - 1, Math.floor(n * clamp01(startFrac)));
    const ei = Math.min(n - 1, Math.ceil(n * clamp01(endFrac)));
    if (ei <= si) return;

    const visLen = ei - si;
    const FADE_STEPS = Math.max(2, Math.floor(visLen * 0.18));

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Draw a single segment pts[a]→pts[a+1] at a given globalAlpha
    const drawSeg = (a: number, alpha: number) => {
        if (a >= n - 1) return;
        const p0 = pts[a]!, p1 = pts[a + 1]!;
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = 'rgba(226,232,240,1)';    ctx.lineWidth = track.roadWidth + 12; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = 'rgba(226,232,240,0.35)'; ctx.lineWidth = track.roadWidth;      ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = 'rgba(226,232,240,0.65)'; ctx.lineWidth = 1.2; ctx.setLineDash([7, 11]); ctx.stroke();
        ctx.setLineDash([]);
    };

    // Draw a range of points as one path at full alpha (fast path)
    const drawBulk = (from: number, to: number) => {
        if (to <= from) return;
        ctx.globalAlpha = 1;
        const sub = pts.slice(from, to + 1);
        const path = () => {
            ctx.beginPath();
            ctx.moveTo(sub[0]!.x, sub[0]!.y);
            for (let i = 1; i < sub.length; i++) ctx.lineTo(sub[i]!.x, sub[i]!.y);
        };
        path(); ctx.strokeStyle = 'rgba(226,232,240,1)';    ctx.lineWidth = track.roadWidth + 12; ctx.stroke();
        path(); ctx.strokeStyle = 'rgba(226,232,240,0.35)'; ctx.lineWidth = track.roadWidth;      ctx.stroke();
        path(); ctx.strokeStyle = 'rgba(226,232,240,0.65)'; ctx.lineWidth = 1.2; ctx.setLineDash([7, 11]); ctx.stroke();
        ctx.setLineDash([]);
    };

    if (fadeEdge === 'start') {
        // Tip at si fades from 0 → 1 over FADE_STEPS segments; bulk is drawn at full alpha
        const fadeEnd = Math.min(si + FADE_STEPS, ei);
        drawBulk(fadeEnd, ei);
        for (let i = si; i < fadeEnd; i++) drawSeg(i, (i - si + 1) / FADE_STEPS);
    } else if (fadeEdge === 'end') {
        // Tip at ei fades from 1 → 0 over FADE_STEPS segments; bulk at full alpha
        const fadeStart = Math.max(si, ei - FADE_STEPS);
        drawBulk(si, fadeStart);
        for (let i = fadeStart; i < ei; i++) drawSeg(i, (ei - i) / FADE_STEPS);
    } else {
        drawBulk(si, ei);
    }

    ctx.restore();
}

function drawSkidMarks(ctx: CanvasRenderingContext2D, pts: SkidPt[], now: number): void {
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    const FADE_MS = 3200;   // full fade duration in ms

    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        if (a.gap || b.gap) continue;

        // Age-based fade: oldest (front) fades first
        const age = now - a.time; // ms since this point was created
        if (age > FADE_MS) continue; // fully faded, skip

        // normalizedAge: 0 = just created, 1 = fully faded
        const ageFade = clamp01(1 - age / FADE_MS);

        // Also apply position-based fade (newer segments still visible even if nearby old ones faded)
        // This creates the sequential "head disappears first" look
        const posFade = clamp01((i + 1) / Math.max(1, n));

        const alpha = a.alpha * ageFade * (0.4 + 0.6 * posFade);
        if (alpha < 0.005) continue;

        ctx.strokeStyle = `rgba(148,163,184,${alpha})`;
        ctx.beginPath(); ctx.moveTo(a.lx, a.ly); ctx.lineTo(b.lx, b.ly); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.rx, a.ry); ctx.lineTo(b.rx, b.ry); ctx.stroke();
    }
    ctx.restore();
}

function drawSmoke(ctx: CanvasRenderingContext2D, smoke: SmokePuff[]): void {
    ctx.save();
    for (const p of smoke) {
        const t = clamp01(p.age / p.life);
        const scale = lerp(0.7, 1.8, smoothstep(0, 1, t));
        const alpha = Math.pow(1 - t, 1.8) * 0.22;
        ctx.fillStyle = `rgba(226,232,240,${alpha})`;
        for (const c of p.circles) {
            ctx.beginPath();
            ctx.arc(p.x + c.ox * scale, p.y + c.oy * scale, c.r * scale, 0, TAU);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawCarChampion(ctx: CanvasRenderingContext2D, agent: Agent): void {
    const { car, carLength, carWidth } = agent;
    const sp = hypot(car.vx, car.vy);

    // Velocity direction arrow (shows the drift — body heading vs travel direction)
    if (sp > 12) {
        const vx = car.vx / sp, vy = car.vy / sp;
        ctx.save();
        ctx.strokeStyle = 'rgba(99,102,241,0.55)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(car.x, car.y); ctx.lineTo(car.x + vx * 34, car.y + vy * 34); ctx.stroke();
        // Arrow tip
        const ax = car.x + vx * 34, ay = car.y + vy * 34;
        const px = -vy, py = vx;
        ctx.fillStyle = 'rgba(99,102,241,0.55)';
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - vx * 6 + px * 4, ay - vy * 6 + py * 4);
        ctx.lineTo(ax - vx * 6 - px * 4, ay - vy * 6 - py * 4); ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    drawCarShape(ctx, car, carLength, carWidth, 1.0, '#1e293b', '#0f172a');
}

function drawCarGhost(ctx: CanvasRenderingContext2D, agent: Agent, rank: number): void {
    const alpha = Math.max(0.18, 0.45 - rank * 0.06);
    ctx.save();
    ctx.globalAlpha = alpha;
    drawCarShape(ctx, agent.car, agent.carLength, agent.carWidth, 1.0, '#334155', '#1e293b');
    ctx.restore();
}

function drawCarShape(
    ctx: CanvasRenderingContext2D,
    car: CarState,
    carL: number,
    carW: number,
    _alpha: number,
    bodyColor: string,
    roofColor: string
): void {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);

    const hL = carL * 0.5;
    const hW = carW * 0.5;
    const r = Math.min(hW, 7);

    // Body
    ctx.fillStyle = bodyColor;
    roundedRect(ctx, -hL, -hW, carL, carW, r);
    ctx.fill();

    // Roof/windshield area
    ctx.fillStyle = roofColor;
    const roofL = carL * 0.54, roofW = carW * 0.50;
    roundedRect(ctx, -roofL * 0.28, -roofW * 0.5, roofL, roofW, Math.min(roofW / 2, 5));
    ctx.fill();

    // Tail lights (red accent)
    ctx.fillStyle = '#ef4444';
    const tlW = 4.4, tlH = 2.0;
    ctx.fillRect(-hL + 2.0, -hW + 2.4, tlW, tlH);
    ctx.fillRect(-hL + 2.0, hW - 2.4 - tlH, tlW, tlH);

    // Wheels
    const wW = Math.max(5.5, carW * 0.22);
    const wH = Math.max(2.4, carW * 0.10);
    const wxF = hL * 0.28;
    const wxR = -hL * 0.28;
    const wy = hW * 0.78;

    // Front wheels (steered)
    drawWheel(ctx, wxF, -wy, wW, wH, car.steerAngle, car.wheelSpin);
    drawWheel(ctx, wxF, wy, wW, wH, car.steerAngle, car.wheelSpin);
    // Rear wheels (RWD — no steer angle)
    drawWheel(ctx, wxR, -wy, wW, wH, 0, car.wheelSpin);
    drawWheel(ctx, wxR, wy, wW, wH, 0, car.wheelSpin);

    // Nose indicator
    ctx.strokeStyle = 'rgba(226,232,240,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(hL - 5, 0); ctx.lineTo(hL - 1.5, 0); ctx.stroke();

    ctx.restore();
}

function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, steer: number, spin: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(steer);
    ctx.fillStyle = '#0b1220';
    roundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, 2));
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,232,240,0.45)';
    ctx.lineWidth = 1.0;
    ctx.save();
    ctx.rotate(spin);
    ctx.beginPath(); ctx.moveTo(-w * 0.27, 0); ctx.lineTo(w * 0.27, 0); ctx.stroke();
    ctx.restore();
    ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function drawSimOverlay(ctx: CanvasRenderingContext2D, _w: number, gen: number, alive: number, total: number, bestFit: number): void {
    const dpr = window.devicePixelRatio || 1;
    const w = ctx.canvas.width / dpr;
    const h = ctx.canvas.height / dpr;
    ctx.save();
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`GEN ${gen}   ALIVE ${alive}/${total}   BEST FIT ${bestFit > -Infinity ? bestFit.toFixed(1) : '—'}`, w / 2, h - 10);
    ctx.restore();
}

/** =========================
 *  Chart drawing
 *  ========================= */
function chartFrame(ctx: CanvasRenderingContext2D, title: string): { w: number; h: number; px: number; py: number; pw: number; ph: number } {
    const w = ctx.canvas.width / (window.devicePixelRatio || 1);
    const h = ctx.canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.fillStyle = 'rgba(100,116,139,0.9)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, 8, 5);
    return { w, h, px: 8, py: 18, pw: w - 16, ph: h - 24 };
}

function drawFitnessChart(ctx: CanvasRenderingContext2D, best: number[], avg: number[], title: string): void {
    const { px, py, pw, ph } = chartFrame(ctx, title);
    if (best.length < 2) return;

    const allVals = [...best, ...avg];
    let minV = Math.min(...allVals);
    let maxV = Math.max(...allVals);
    const pad = (maxV - minV) * 0.12 + 0.5;
    minV -= pad; maxV += pad;
    const rng = maxV - minV || 1;

    // Grid lines
    ctx.strokeStyle = 'rgba(15,23,42,0.06)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        const y = py + ph * i / 4;
        ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px + pw, y); ctx.stroke();
    }

    // Avg line (lighter)
    const n = Math.min(best.length, avg.length);
    ctx.strokeStyle = 'rgba(100,116,139,0.4)'; ctx.lineWidth = 1.0;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const x = px + (i / (n - 1)) * pw;
        const y = py + (1 - (avg[i]! - minV) / rng) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Best line (solid)
    ctx.strokeStyle = 'rgba(15,23,42,0.72)'; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < best.length; i++) {
        const x = px + (i / (best.length - 1)) * pw;
        const y = py + (1 - (best[i]! - minV) / rng) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Latest value label
    const last = best[best.length - 1] ?? 0;
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(last.toFixed(1), px + pw, 5);

    // Legend
    ctx.fillStyle = 'rgba(100,116,139,0.75)'; ctx.textAlign = 'left';
    ctx.fillText('best', px, 5);
    ctx.fillStyle = 'rgba(100,116,139,0.45)';
    ctx.fillText('avg', px + 28, 5);
}

function drawSigmaChart(ctx: CanvasRenderingContext2D, genCount: number, currentSigma: number): void {
    const { px, py, pw, ph } = chartFrame(ctx, 'Mutation σ');

    // Draw the decay curve
    const INIT_SIGMA = 1.2;
    const DECAY = 0.975;

    ctx.strokeStyle = 'rgba(100,116,139,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    const midY = py + ph * 0.5;
    ctx.beginPath(); ctx.moveTo(px, midY); ctx.lineTo(px + pw, midY); ctx.stroke();
    ctx.setLineDash([]);

    // Simulated sigma history
    const pts: number[] = [];
    let sig = INIT_SIGMA;
    for (let i = 0; i < Math.max(genCount, 2); i++) { pts.push(sig); sig *= DECAY; }

    const maxV = INIT_SIGMA * 1.1;
    ctx.strokeStyle = 'rgba(15,23,42,0.68)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
        const x = px + (i / (pts.length - 1)) * pw;
        const y = py + (1 - pts[i]! / maxV) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(currentSigma.toFixed(3), px + pw, 5);
}

function drawTraceChart(ctx: CanvasRenderingContext2D, trace: RingBuffer, minV: number, maxV: number, title: string): void {
    const { px, py, pw, ph } = chartFrame(ctx, title);
    const n = trace.size();
    if (n < 2) return;

    const rng = maxV - minV || 1;

    // Mid line
    const midY = py + (1 - (0 - minV) / rng) * ph;
    ctx.strokeStyle = 'rgba(100,116,139,0.18)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(px, midY); ctx.lineTo(px + pw, midY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(15,23,42,0.68)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
        const x = px + (i / (n - 1)) * pw;
        const y = py + (1 - (clamp(trace.at(i), minV, maxV) - minV) / rng) * ph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    const last = trace.latest();
    ctx.fillStyle = 'rgba(15,23,42,0.8)';
    ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(last.toFixed(1), px + pw, 5);
}

/** =========================
 *  Canvas resize helper
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
 *  Formatters
 *  ========================= */
function fmtSgn(x: number, d = 2): string { return (x >= 0 ? '+' : '') + x.toFixed(d); }
function fmtPct(x: number): string { return `${Math.round(clamp01(x) * 100)}%`; }
function fmt(x: number, d = 2): string { return x.toFixed(d); }

/** =========================
 *  React Component
 *  ========================= */
const TRACK_TYPES: TrackType[] = ['oval', 'chicane', 'circuit', 'infinity'];
const TRACK_LABELS: Record<TrackType, string> = { oval: 'Oval', chicane: 'Chicane', circuit: 'Circuit', infinity: '∞ Infinity' };

const EducationRLDrift: React.FC<Props> = ({ width, height }) => {
    const rootRef = useRef<HTMLDivElement | null>(null);

    const simWrapRef = useRef<HTMLDivElement | null>(null);
    const simCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const chartFitWrapRef = useRef<HTMLDivElement | null>(null);
    const chartSigWrapRef = useRef<HTMLDivElement | null>(null);
    const chartSlipWrapRef = useRef<HTMLDivElement | null>(null);
    const chartRewWrapRef = useRef<HTMLDivElement | null>(null);

    const chartFitCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartSigCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartSlipCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartRewCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const trainerRef = useRef<GeneticDriftTrainer | null>(null);
    const simCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartFitCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartSigCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartSlipCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const chartRewCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    const rafRef = useRef<number>(0);
    const lastTRef = useRef<number>(0);
    const accRef = useRef<number>(0);
    const uiTimerRef = useRef<number>(0);
    const visibleRef = useRef<boolean>(true);

    const simDimsRef = useRef<{ w: number; h: number }>({ w: 600, h: 400 });

    const [running, setRunning] = useState(true);
    const [trackType, setTrackType] = useState<TrackType>('oval');
    const [ui, setUi] = useState<UiSnapshot>(() => ({
        generation: 0, totalSteps: 0, aliveAgents: 0, populationSize: POP_SIZE,
        bestFitness: 0, currentBestFitness: 0, avgFitness: 0,
        skill: 0, mutSigma: 1.2,
        speed: 0, slipDeg: 0, headingErrDeg: 0, trackError: 0, driftIntensity: 0, yawRate: 0,
        steer: 0, throttle: 0, handbrake: 0, reward: 0, fitness: 0,
    }));

    // Root is full-width column; only the sim canvas needs an explicit height
    const simStyle = useMemo<React.CSSProperties>(() => ({
        height,
    }), [height]);

    // Ensure trainer is created
    const ensureTrainer = useCallback((w: number, h: number) => {
        if (!trainerRef.current) {
            trainerRef.current = new GeneticDriftTrainer(w, h);
        } else {
            trainerRef.current.resize(w, h);
        }
        simDimsRef.current = { w, h };
    }, []);

    // ResizeObserver
    useEffect(() => {
        const resizeAll = () => {
            if (simWrapRef.current && simCanvasRef.current) {
                const r = simWrapRef.current.getBoundingClientRect();
                const ctx = resizeCanvas(simCanvasRef.current, r.width, r.height);
                simCtxRef.current = ctx;
                ensureTrainer(Math.floor(r.width), Math.floor(r.height));
            }

            const rc = (wrap: HTMLDivElement | null, canvas: HTMLCanvasElement | null, ref: React.MutableRefObject<CanvasRenderingContext2D | null>) => {
                if (!wrap || !canvas) return;
                ref.current = resizeCanvas(canvas, wrap.getBoundingClientRect().width, wrap.getBoundingClientRect().height);
            };
            rc(chartFitWrapRef.current, chartFitCanvasRef.current, chartFitCtxRef);
            rc(chartSigWrapRef.current, chartSigCanvasRef.current, chartSigCtxRef);
            rc(chartSlipWrapRef.current, chartSlipCanvasRef.current, chartSlipCtxRef);
            rc(chartRewWrapRef.current, chartRewCanvasRef.current, chartRewCtxRef);

            if (trainerRef.current) setUi(trainerRef.current.getUiSnapshot());
        };

        resizeAll();
        const ro = new ResizeObserver(() => resizeAll());
        [simWrapRef, chartFitWrapRef, chartSigWrapRef, chartSlipWrapRef, chartRewWrapRef].forEach(ref => {
            if (ref.current) ro.observe(ref.current);
        });
        return () => ro.disconnect();
    }, [ensureTrainer, width, height]);

    // Intersection observer (pause offscreen)
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const io = new IntersectionObserver(([e]) => { visibleRef.current = e?.isIntersecting ?? true; }, { threshold: 0.05 });
        io.observe(root);
        return () => io.disconnect();
    }, []);

    // RAF loop
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const tick = (now: number) => {
            rafRef.current = requestAnimationFrame(tick);
            if (!visibleRef.current) return;

            const trainer = trainerRef.current;
            const simCtx = simCtxRef.current;
            if (!trainer || !simCtx) return;

            const dtMs = now - (lastTRef.current || now);
            lastTRef.current = now;
            const dt = Math.min(0.05, Math.max(0, dtMs / 1000));

            if (running) {
                accRef.current += dt;
                let steps = 0;
                while (accRef.current >= FIXED_DT && steps < 12) {
                    trainer.stepAll(FIXED_DT, true);
                    accRef.current -= FIXED_DT;
                    steps++;
                }
            }

            // Render sim every frame
            const cv = simCanvasRef.current;
            if (cv) {
                const wCss = cv.width / (window.devicePixelRatio || 1);
                const hCss = cv.height / (window.devicePixelRatio || 1);
                trainer.render(simCtx, wCss, hCss);
            }

            // Update UI + charts ~12fps
            uiTimerRef.current += dt;
            if (uiTimerRef.current > 0.082) {
                uiTimerRef.current = 0;
                setUi(trainer.getUiSnapshot());
                trainer.drawCharts(chartFitCtxRef.current, chartSigCtxRef.current, chartSlipCtxRef.current, chartRewCtxRef.current);
            }
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [running]);

    const onReset = useCallback(() => {
        const trainer = trainerRef.current;
        if (!trainer) return;
        const d = simDimsRef.current;
        trainer.resetTraining(d.w, d.h);
        setUi(trainer.getUiSnapshot());
    }, []);

    const onJump = useCallback((nGen: number) => {
        const trainer = trainerRef.current;
        if (!trainer) return;
        trainer.fastForward(nGen);
        setUi(trainer.getUiSnapshot());
    }, []);

    const onTrackChange = useCallback((type: TrackType) => {
        setTrackType(type);
        const trainer = trainerRef.current;
        const d = simDimsRef.current;
        if (!trainer) return;
        trainer.setTrackType(type, d.w, d.h);
    }, []);

    const status = running ? 'TRAINING' : 'PAUSED';

    return (
        <div className="rl-root" ref={rootRef}>
            {/* Simulation canvas — full width, fixed height */}
            <div className="rl-sim" ref={simWrapRef} style={simStyle}>
                <canvas ref={simCanvasRef} className="rl-sim-canvas" />
            </div>

            {/* Bottom row: description left, stats hub right */}
            <div className="rl-bottom">
                <div className="rl-info">
                    <h3 className="rl-info-heading">Reinforcement Learning</h3>
                    <p className="rl-info-body">
                        A neuroevolution drift trainer where eight neural-network agents compete
                        each generation on a rear-wheel-drive track. Top performers survive,
                        recombine, and mutate—progressively learning to initiate controlled
                        oversteer at corner entry, sustain a precise slip angle through the apex,
                        and exit cleanly without spinning out. Use the jump buttons to
                        fast-forward through generations and watch the skill evolve in real time.
                    </p>
                </div>

            {/* Stats hub */}
            <div className="rl-panel">
                <div className="rl-controls">
                    <div className="rl-controls-top">
                        <div className="rl-status">
                            <span className={`rl-dot ${running ? 'is-on' : ''}`} />
                            {status}
                        </div>
                    </div>

                    {/* Track selector */}
                    <div className="rl-buttons">
                        {TRACK_TYPES.map(t => (
                            <button
                                key={t}
                                className={`rl-btn ${trackType === t ? 'rl-btn-primary' : ''}`}
                                onClick={() => onTrackChange(t)}
                            >
                                {TRACK_LABELS[t]}
                            </button>
                        ))}
                    </div>

                    {/* Control buttons */}
                    <div className="rl-buttons">
                        <button className="rl-btn rl-btn-primary" onClick={() => setRunning(r => !r)}>
                            {running ? 'Pause' : 'Play'}
                        </button>
                        <button className="rl-btn" onClick={onReset}>Reset</button>
                        <div className="rl-spacer" />
                        <button className="rl-btn" onClick={() => onJump(10)}>+10 Gen</button>
                        <button className="rl-btn" onClick={() => onJump(50)}>+50 Gen</button>
                        <button className="rl-btn" onClick={() => onJump(200)}>+200 Gen</button>
                        <button className="rl-btn" onClick={() => onJump(800)}>+800 Gen</button>
                    </div>
                </div>

                {/* Dense numeric telemetry */}
                <div className="rl-telemetry">
                    <div className="rl-row">
                        <div className="k">GEN</div>
                        <div className="v">{ui.generation}</div>
                        <div className="k">ALIVE</div>
                        <div className="v">{ui.aliveAgents}/{ui.populationSize}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">BestFit</div>
                        <div className="v">{fmtSgn(ui.bestFitness, 1)}</div>
                        <div className="k">CurFit</div>
                        <div className="v">{fmtSgn(ui.currentBestFitness, 1)}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">AvgFit</div>
                        <div className="v">{fmtSgn(ui.avgFitness, 1)}</div>
                        <div className="k">Steps</div>
                        <div className="v">{ui.totalSteps.toLocaleString()}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">Skill</div>
                        <div className="v">{fmtPct(ui.skill)}</div>
                        <div className="k">σ</div>
                        <div className="v">{fmt(ui.mutSigma, 3)}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">Speed</div>
                        <div className="v">{fmt(ui.speed, 0)}</div>
                        <div className="k">YawRate</div>
                        <div className="v">{fmtSgn(ui.yawRate, 2)}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">Slip</div>
                        <div className="v">{fmtSgn(ui.slipDeg, 1)}°</div>
                        <div className="k">HdgErr</div>
                        <div className="v">{fmtSgn(ui.headingErrDeg, 1)}°</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">TrkErr</div>
                        <div className="v">{fmtSgn(ui.trackError, 1)}</div>
                        <div className="k">Drift</div>
                        <div className="v">{fmtPct(ui.driftIntensity)}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">Steer</div>
                        <div className="v">{fmtSgn(ui.steer, 2)}</div>
                        <div className="k">Throttle</div>
                        <div className="v">{fmt(ui.throttle, 2)}</div>
                    </div>
                    <div className="rl-row">
                        <div className="k">Handbrk</div>
                        <div className="v">{fmt(ui.handbrake, 2)}</div>
                        <div className="k">r(t)</div>
                        <div className="v">{fmtSgn(ui.reward, 3)}</div>
                    </div>
                </div>

                {/* Charts */}
                <div className="rl-charts">
                    <div className="rl-chart" ref={chartFitWrapRef}>
                        <canvas ref={chartFitCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartSigWrapRef}>
                        <canvas ref={chartSigCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartSlipWrapRef}>
                        <canvas ref={chartSlipCanvasRef} />
                    </div>
                    <div className="rl-chart" ref={chartRewWrapRef}>
                        <canvas ref={chartRewCanvasRef} />
                    </div>
                </div>
            </div>
            </div>{/* /rl-bottom */}
        </div>
    );
};

export default EducationRLDrift;
