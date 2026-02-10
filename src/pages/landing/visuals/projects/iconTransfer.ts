// src/pages/landing/visuals/projects/iconTransfer.ts
import { gsap } from 'gsap';

export type IconTransferOpts = {
    container: HTMLElement;       // overlay host (use `.projects-right`)
    profileEl?: HTMLElement;      // element whose center we connect to (the profile stack)
    size?: number;                // square size
    mode?: 'edge' | 'offsets';
    offsets?: {
        left: { dx: number; dy: number };
        right: { dx: number; dy: number };
        'top-left': { dx: number; dy: number };
        'top-right': { dx: number; dy: number };
    };
    edge?: {
        edgeMargin?: number;
        topRowY?: number;
        topHorizInset?: number;
    };
    timings?: {
        appear: number;   // square in (scale/opacity) — 1.0s
        draw: number;     // extend: head travels from square to center
        dwell: number;    // pause when fully extended
        retract: number;  // retract: tail catches up while staying anchored at center
        out: number;      // square out
        gap: number;      // stagger between starts (0.5s)
    };
};

export function runIconTransfer(opts: IconTransferOpts): {
    promise: Promise<void>;
    cancel: () => void;
} {
    const {
        container,
        profileEl,
        size = 56,
        mode = 'edge',
        offsets,
        edge,
        timings = { appear: 1.0, draw: 0.8, dwell: 0.25, retract: 0.5, out: 0.3, gap: 0.5 },
    } = opts;

    // Coords
    const hostRect = container.getBoundingClientRect();
    const targetRect = (profileEl ?? container).getBoundingClientRect();

    const center = {
        x: targetRect.left + targetRect.width / 2 - hostRect.left,
        y: targetRect.top + targetRect.height / 2 - hostRect.top,
    };

    type ItemKey = 'left' | 'right' | 'top-left' | 'top-right';
    const edgeMargin = edge?.edgeMargin ?? 16;
    const topRowY = edge?.topRowY ?? 16 + size / 2;
    const topHorizInset = edge?.topHorizInset ?? 28;

    const toPositions = (): Record<ItemKey, { sx: number; sy: number }> => {
        if (mode === 'offsets' && offsets) {
            return {
                left: { sx: center.x + offsets.left.dx, sy: center.y + offsets.left.dy },
                right: { sx: center.x + offsets.right.dx, sy: center.y + offsets.right.dy },
                'top-left': { sx: center.x + offsets['top-left'].dx, sy: center.y + offsets['top-left'].dy },
                'top-right': { sx: center.x + offsets['top-right'].dx, sy: center.y + offsets['top-right'].dy },
            };
        }
        return {
            left: { sx: edgeMargin + size / 2, sy: center.y },
            right: { sx: hostRect.width - edgeMargin - size / 2, sy: center.y },
            'top-left': { sx: edgeMargin + topHorizInset + size / 2, sy: topRowY },
            'top-right': { sx: hostRect.width - edgeMargin - topHorizInset - size / 2, sy: topRowY },
        };
    };

    const positions = toPositions();

    // Build overlay
    const layer = document.createElement('div');
    layer.className = 'sl-xfer-layer';
    container.appendChild(layer);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'sl-xfer-svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'none');
    layer.appendChild(svg);

    const defs = document.createElementNS(svgNS, 'defs');
    svg.appendChild(defs);

    const squaresRoot = document.createElement('div');
    squaresRoot.className = 'sl-xfer-squares';
    layer.appendChild(squaresRoot);

    const labelsRoot = squaresRoot;

    // --- Center receiver (SmartLinked logo) — appears first, no gradient wave ---
    const aiSq = document.createElement('div');
    aiSq.className = 'sl-xfer-square';
    aiSq.style.left = `${Math.round(center.x - size / 2)}px`;
    aiSq.style.top = `${Math.round(center.y - size / 2)}px`;
    aiSq.style.width = `${size}px`;
    aiSq.style.height = `${size}px`;

    const aiImg = document.createElement('img');
    aiImg.src = '/images/icons/smartLinkedLogo.svg';
    aiImg.alt = 'smartlinked';
    aiImg.className = 'sl-xfer-icon';
    aiSq.appendChild(aiImg);
    squaresRoot.appendChild(aiSq);

    const aiLabel = document.createElement('div');
    aiLabel.className = 'sl-xfer-label';
    aiLabel.style.left = `${center.x}px`;
    aiLabel.style.top = `${center.y + size / 2 + 8}px`;
    const aiText = document.createElement('span');
    aiText.textContent = 'improving profile';
    const aiDots = document.createElement('span');
    aiDots.textContent = ' .';
    aiLabel.appendChild(aiText);
    aiLabel.appendChild(document.createTextNode(' '));
    aiLabel.appendChild(aiDots);
    labelsRoot.appendChild(aiLabel);

    const dotsTl = gsap.timeline({ repeat: -1, paused: true });
    dotsTl
        .call(() => { aiDots.textContent = ' .'; })
        .to({}, { duration: 0.35 })
        .call(() => { aiDots.textContent = ' ..'; })
        .to({}, { duration: 0.35 })
        .call(() => { aiDots.textContent = ' ...'; })
        .to({}, { duration: 0.35 });

    // Peripheral items (with gradient wave on icons & lines)
    type Item = { key: ItemKey; src: string; label: string };
    const items: Item[] = [
        { key: 'left', src: '/images/icons/resume.svg', label: 'resume' },
        { key: 'right', src: '/images/icons/comment_search.svg', label: 'context' },
        { key: 'top-left', src: '/images/icons/lightbulb.svg', label: 'ideas' },
        { key: 'top-right', src: '/images/icons/connection.svg', label: 'relation' },
    ];

    const paths: SVGPathElement[] = [];
    const squares: HTMLDivElement[] = [];
    const labels: HTMLDivElement[] = [];
    const waveTls: gsap.core.Tween[] = [];

    const makeMovingGradient = (sx: number, sy: number, ex: number, ey: number, id: string) => {
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.setAttribute('id', id);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', `${sx}`); grad.setAttribute('y1', `${sy}`);
        grad.setAttribute('x2', `${ex}`); grad.setAttribute('y2', `${ey}`);
        grad.setAttribute('spreadMethod', 'reflect');

        const c1 = '#227de6', c2 = '#d40b8a';
        const s0 = document.createElementNS(svgNS, 'stop'); s0.setAttribute('offset', '0%'); s0.setAttribute('stop-color', c1);
        const s1 = document.createElementNS(svgNS, 'stop'); s1.setAttribute('offset', '50%'); s1.setAttribute('stop-color', c2);
        const s2 = document.createElementNS(svgNS, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', c1);
        grad.appendChild(s0); grad.appendChild(s1); grad.appendChild(s2);
        defs.appendChild(grad);

        // Animate gradient along the line direction
        const dx = ex - sx, dy = ey - sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const state = { t: 0 };
        const tween = gsap.to(state, {
            t: 200,
            duration: 1.6,
            repeat: -1,
            ease: 'none',
            onUpdate: () => grad.setAttribute('gradientTransform', `translate(${ux * state.t}, ${uy * state.t})`)
        });
        tween.pause();
        return { tween };
    };

    // Build nodes
    items.forEach((it, i) => {
        const { sx, sy } = positions[it.key];

        // Square with masked gradient icon
        const sq = document.createElement('div');
        sq.className = 'sl-xfer-square';
        sq.style.left = `${Math.round(sx - size / 2)}px`;
        sq.style.top = `${Math.round(sy - size / 2)}px`;
        sq.style.width = `${size}px`;
        sq.style.height = `${size}px`;

        const icon = document.createElement('div');
        icon.className = 'sl-xfer-icon sl-xfer-icon--masked';
        (icon.style as any).webkitMaskImage = `url('${it.src}')`;
        (icon.style as any).maskImage = `url('${it.src}')`;
        (icon.style as any).webkitMaskRepeat = 'no-repeat';
        (icon.style as any).maskRepeat = 'no-repeat';
        (icon.style as any).webkitMaskPosition = 'center';
        (icon.style as any).maskPosition = 'center';
        (icon.style as any).webkitMaskSize = 'contain';
        (icon.style as any).maskSize = 'contain';
        // gradient background is in CSS; we animate backgroundPositionX
        squaresRoot.appendChild(sq);
        sq.appendChild(icon);
        squares.push(sq);

        // Label
        const label = document.createElement('div');
        label.className = 'sl-xfer-label';
        label.style.left = `${sx}px`;
        label.style.top = `${sy + size / 2 + 8}px`;
        label.textContent = it.label;
        labelsRoot.appendChild(label);
        labels.push(label);

        // Line path with moving gradient
        const gradId = `sl-grad-${Date.now()}-${i}-${Math.round(Math.random() * 1e5)}`;
        const { tween: gradTween } = makeMovingGradient(sx, sy, center.x, center.y, gradId);

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', 'sl-xfer-line');
        path.setAttribute('d', `M ${sx} ${sy} L ${center.x} ${center.y}`);
        path.setAttribute('stroke', `url(#${gradId})`);
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);

        const len = path.getTotalLength();
        const GAP = len + 1000; // ensure no repeats

        // PROGRESS LINE MECHANICS:
        // Phase 1 (extend): anchored at square (start), increase visible length L: 0 -> len
        //   dasharray = `${L} ${GAP}`, dashoffset = 0
        // Phase 2 (retract): anchored at center (end), decrease L: len -> 0
        //   dasharray = `${L} ${GAP}`, dashoffset = -(len - L)

        // Initialize at zero length at the square
        path.style.strokeDasharray = `0 ${GAP}`;
        path.style.strokeDashoffset = '0';

        paths.push(path);
        waveTls.push(gradTween);

        // Icon wave (sync with path)
        const iconWave = gsap.to(icon, {
            backgroundPositionX: '200%',
            duration: 1.6,
            repeat: -1,
            ease: 'none',
            paused: true,
        });
        waveTls.push(iconWave as unknown as gsap.core.Tween);
    });

    // Master timeline
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    // 1) Center receiver first
    tl.fromTo(aiSq, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: timings.appear, ease: 'power3.out' }, 0);
    tl.fromTo(aiLabel, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: Math.max(0.6, timings.appear * 0.8) }, 0);
    tl.add(() => { dotsTl.play(); }, 0);

    // 2) Peripheral squares with 0.5s stagger; progress segment extend -> dwell -> retract; square fades on disconnect
    const base = 0.5;
    items.forEach((_it, i) => {
        const sq = squares[i];
        const label = labels[i];
        const path = paths[i];
        const gradTween = waveTls[i * 2 + 0];
        const iconTween = waveTls[i * 2 + 1];

        const len = path.getTotalLength();
        const GAP = len + 1000;

        const start = base + i * timings.gap;            // when square starts appearing
        const afterAppear = start + timings.appear;      // when square is visible

        // Appear + label
        tl.fromTo(sq, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: timings.appear, ease: 'power3.out' }, start);
        tl.fromTo(label, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: Math.max(0.5, timings.appear * 0.8) }, start);

        // Start the gradient/icon waves as soon as the square appears
        tl.add(() => { gradTween.play(); iconTween.play(); }, afterAppear - 0.001);

        // === EXTEND: grow from the square (L: 0 → len), anchored at start ===
        const extendState = { L: 0 };
        tl.to(extendState, {
            L: len,
            duration: timings.draw,
            ease: 'power2.inOut',
            onUpdate: () => {
                path.style.strokeDasharray = `${extendState.L} ${GAP}`;
                path.style.strokeDashoffset = '0'; // anchored at start
            }
        }, afterAppear);

        // DWELL at full length
        const afterDraw = afterAppear + timings.draw;
        tl.to({}, { duration: timings.dwell }, afterDraw);

        // === RETRACT: shrink while staying connected to the center (end) ===
        const retractState = { L: len };
        const afterDwell = afterDraw + timings.dwell;
        tl.to(retractState, {
            L: 0,
            duration: timings.retract,
            ease: 'power2.in',
            onUpdate: () => {
                const L = retractState.L;
                path.style.strokeDasharray = `${L} ${GAP}`;
                // Anchor at path end (center): offset negative so dash ends at len
                path.style.strokeDashoffset = `${-(len - L)}`;
            }
        }, afterDwell);

        // OUT: when disconnected, fade square + label
        const afterRetract = afterDwell + timings.retract;
        tl.to(sq, { opacity: 0, scale: 0, duration: timings.out, ease: 'power2.in' }, afterRetract);
        tl.to(label, { opacity: 0, y: 2, duration: timings.out, ease: 'power2.in' }, afterRetract);

        // Stop waves after it's gone
        tl.add(() => { gradTween.kill(); iconTween.kill(); }, afterRetract + timings.out);
    });

    // 3) Fade out receiver, stop dots, cleanup
    tl.to(aiSq, { opacity: 0, scale: 0, duration: 0.3, ease: 'power2.in' }, '>');
    tl.to(aiLabel, { opacity: 0, y: 2, duration: 0.3, ease: 'power2.in' }, '<');
    tl.add(() => { dotsTl.kill(); });

    // Remove overlay
    tl.add(() => { if (layer.parentElement === container) container.removeChild(layer); });

    // Promise onComplete
    let resolveFn: (() => void) | null = null;
    const promise = new Promise<void>((resolve) => (resolveFn = resolve));
    tl.eventCallback('onComplete', () => resolveFn && resolveFn());

    // Play
    tl.play();

    const cancel = () => {
        tl.kill();
        dotsTl.kill();
        waveTls.forEach((w) => w.kill());
        if (layer.parentElement === container) container.removeChild(layer);
    };

    return { promise, cancel };
}
