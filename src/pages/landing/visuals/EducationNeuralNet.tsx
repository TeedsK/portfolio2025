// src/pages/landing/visuals/EducationNeuralNet.tsx
import { useEffect, useRef } from 'react';

type Props = {
    width: number;
    height: number;
};

// --- Realistic MNIST-style architecture ---
// Shown nodes per layer (simplified diagram of a larger network)
const LAYER_SIZES = [10, 8, 8, 10]; // input, hidden1, hidden2, output
const OUTPUT_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const LAYER_LABELS = ['Input Layer', 'Hidden Layer', 'Hidden Layer', 'Output Layer'];
const LAYER_SUBLABELS = ['784 features', '128 neurons', '64 neurons', '10 classes'];

// Indices where we insert an ellipsis gap (after this node index) to suggest more nodes
// e.g. for 10 shown nodes, put dots between node 4 and 5 to suggest "...more..."
const ELLIPSIS_AFTER = [4, 3, 3, 4];

type Node = { x: number; y: number; layer: number; label?: string; pulse: number; isEllipsis?: boolean };
type Connection = { from: number; to: number };
type Particle = {
    connIdx: number;
    progress: number;
    speed: number;
    alive: boolean;
};

const PARTICLE_POOL_CAP = 100;
const FIRE_INTERVAL_MS = 800;
const PARTICLE_SPEED = 0.012;

function buildNodes(w: number, h: number): Node[] {
    const nodes: Node[] = [];
    const padX = w * 0.1;
    const layerXs = [
        padX,
        padX + (w - 2 * padX) * 0.33,
        padX + (w - 2 * padX) * 0.66,
        w - padX,
    ];
    const padY = h * 0.14;
    const usableH = h - 2 * padY - 30; // leave room for layer labels at bottom

    for (let li = 0; li < LAYER_SIZES.length; li++) {
        const count = LAYER_SIZES[li];
        const x = layerXs[li];
        const labels = li === 3 ? OUTPUT_LABELS : undefined;
        const ellipsisAfter = ELLIPSIS_AFTER[li];
        // Total visual slots = count + 1 (for ellipsis gap)
        const totalSlots = count + 1;

        let slotIdx = 0;
        for (let i = 0; i < count; i++) {
            if (i === ellipsisAfter) {
                // Insert ellipsis node
                const ey = padY + (usableH / (totalSlots + 1)) * (slotIdx + 1);
                nodes.push({ x, y: ey, layer: li, pulse: 0, isEllipsis: true });
                slotIdx++;
            }
            const y = padY + (usableH / (totalSlots + 1)) * (slotIdx + 1);
            nodes.push({ x, y, layer: li, label: labels?.[i], pulse: 0 });
            slotIdx++;
        }
    }
    return nodes;
}

function buildConnections(nodes: Node[]): Connection[] {
    const conns: Connection[] = [];
    const byLayer: number[][] = [[], [], [], []];
    nodes.forEach((n, i) => {
        if (!n.isEllipsis) byLayer[n.layer].push(i);
    });

    for (let layer = 0; layer < 3; layer++) {
        const sources = byLayer[layer];
        const targets = byLayer[layer + 1];
        for (const s of sources) {
            for (const t of targets) {
                if ((s * 7 + t * 13) % 10 < 6) {
                    conns.push({ from: s, to: t });
                }
            }
        }
    }
    return conns;
}

function realNodesByLayer(nodes: Node[]): number[][] {
    const layers: number[][] = [[], [], [], []];
    nodes.forEach((n, i) => {
        if (!n.isEllipsis) layers[n.layer].push(i);
    });
    return layers;
}

const EducationNeuralNet: React.FC<Props> = ({ width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const nodesRef = useRef<Node[]>([]);
    const connsRef = useRef<Connection[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const layersRef = useRef<number[][]>([]);
    const lastFireRef = useRef(0);
    const visibleRef = useRef(true);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || width <= 0 || height <= 0) return;

        const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const nodes = buildNodes(width, height);
        const conns = buildConnections(nodes);
        const layers = realNodesByLayer(nodes);

        nodesRef.current = nodes;
        connsRef.current = conns;
        layersRef.current = layers;
        particlesRef.current = [];
        lastFireRef.current = 0;

        // Layer x-positions for labels
        const padX = width * 0.1;
        const layerXs = [
            padX,
            padX + (width - 2 * padX) * 0.33,
            padX + (width - 2 * padX) * 0.66,
            width - padX,
        ];

        const io = new IntersectionObserver(
            (entries) => {
                visibleRef.current = entries[0]?.isIntersecting ?? true;
            },
            { threshold: 0.05 }
        );
        io.observe(canvas);

        const tick = (now: number) => {
            if (!visibleRef.current) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            // Fire signals
            if (now - lastFireRef.current > FIRE_INTERVAL_MS) {
                lastFireRef.current = now;
                const inputNodes = layers[0];
                const count = 1 + Math.floor(Math.random() * 2);
                for (let i = 0; i < count; i++) {
                    const srcIdx = inputNodes[Math.floor(Math.random() * inputNodes.length)];
                    nodes[srcIdx].pulse = 1;
                    const outConns = conns
                        .map((c, ci) => ({ c, ci }))
                        .filter(({ c }) => c.from === srcIdx);
                    for (const { ci } of outConns) {
                        if (particlesRef.current.length < PARTICLE_POOL_CAP) {
                            particlesRef.current.push({
                                connIdx: ci,
                                progress: 0,
                                speed: PARTICLE_SPEED + Math.random() * 0.005,
                                alive: true,
                            });
                        }
                    }
                }
            }

            // Update particles
            const particles = particlesRef.current;
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                if (!p.alive) continue;
                p.progress += p.speed;
                if (p.progress >= 1) {
                    p.alive = false;
                    const conn = conns[p.connIdx];
                    const destNode = nodes[conn.to];
                    destNode.pulse = 1;
                    if (destNode.layer < 3) {
                        const outConns = conns
                            .map((c, ci) => ({ c, ci }))
                            .filter(({ c }) => c.from === conn.to);
                        for (const { ci } of outConns) {
                            if (particles.length < PARTICLE_POOL_CAP) {
                                particles.push({
                                    connIdx: ci,
                                    progress: 0,
                                    speed: PARTICLE_SPEED + Math.random() * 0.005,
                                    alive: true,
                                });
                            }
                        }
                    }
                }
            }
            particlesRef.current = particles.filter((p) => p.alive);

            // Decay pulses
            for (const n of nodes) {
                n.pulse *= 0.93;
                if (n.pulse < 0.01) n.pulse = 0;
            }

            // --- Render ---
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, width, height);

            // Connections
            for (let ci = 0; ci < conns.length; ci++) {
                const c = conns[ci];
                const a = nodes[c.from];
                const b = nodes[c.to];
                let activeGlow = 0;
                for (const p of particlesRef.current) {
                    if (p.connIdx === ci && p.alive) {
                        activeGlow = Math.max(activeGlow, 0.6);
                    }
                }
                const alpha = 0.08 + activeGlow * 0.4;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
                ctx.lineWidth = activeGlow > 0 ? 1.8 : 0.7;
                ctx.stroke();
            }

            // Particles
            for (const p of particlesRef.current) {
                if (!p.alive) continue;
                const c = conns[p.connIdx];
                const a = nodes[c.from];
                const b = nodes[c.to];
                const px = a.x + (b.x - a.x) * p.progress;
                const py = a.y + (b.y - a.y) * p.progress;
                const grad = ctx.createRadialGradient(px, py, 0, px, py, 8);
                grad.addColorStop(0, 'rgba(96, 165, 250, 0.9)');
                grad.addColorStop(1, 'rgba(96, 165, 250, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(px, py, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#93c5fd';
                ctx.beginPath();
                ctx.arc(px, py, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Nodes
            const nodeRadius = Math.max(4, Math.min(8, width * 0.008));
            for (const n of nodes) {
                // Ellipsis nodes: draw three vertical dots instead of a circle
                if (n.isEllipsis) {
                    ctx.fillStyle = 'rgba(148, 197, 253, 0.35)';
                    for (let d = -1; d <= 1; d++) {
                        ctx.beginPath();
                        ctx.arc(n.x, n.y + d * 6, 1.8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    continue;
                }

                const glowR = nodeRadius + n.pulse * 12;
                if (n.pulse > 0.05) {
                    const grad = ctx.createRadialGradient(n.x, n.y, nodeRadius * 0.5, n.x, n.y, glowR);
                    grad.addColorStop(0, `rgba(96, 165, 250, ${n.pulse * 0.6})`);
                    grad.addColorStop(1, 'rgba(96, 165, 250, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
                    ctx.fill();
                }

                const brightness = 0.3 + n.pulse * 0.7;
                ctx.fillStyle = `rgba(96, 165, 250, ${brightness})`;
                ctx.beginPath();
                ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = `rgba(148, 197, 253, ${0.4 + n.pulse * 0.6})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Output labels (digit classes 0-9)
                if (n.label) {
                    ctx.fillStyle = `rgba(203, 213, 225, ${0.6 + n.pulse * 0.4})`;
                    ctx.font = `600 ${Math.max(10, Math.min(12, width * 0.011))}px system-ui, -apple-system, sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(n.label, n.x + nodeRadius + 8, n.y);
                }
            }

            // Layer labels at bottom
            const labelY = height - 16;
            const subY = height - 4;
            const fontSize = Math.max(9, Math.min(12, width * 0.011));
            for (let li = 0; li < 4; li++) {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
                ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
                ctx.fillText(LAYER_LABELS[li], layerXs[li], labelY);
                ctx.font = `400 ${fontSize - 1}px system-ui, -apple-system, sans-serif`;
                ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
                ctx.fillText(LAYER_SUBLABELS[li], layerXs[li], subY);
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafRef.current);
            io.disconnect();
        };
    }, [width, height]);

    return (
        <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
        />
    );
};

export default EducationNeuralNet;
