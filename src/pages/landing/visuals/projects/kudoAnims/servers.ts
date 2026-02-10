import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

/**
 * Server Management Animation (Isometric Cluster)
 * -----------------------------------------------
 * Visualizes "Load Balancing" in a 3D Isometric view.
 * 1. A cluster of 9 Server Pods (3x3 grid) sits in isometric space.
 * 2. "Traffic" (particles) falls from the cloud onto the grid.
 * 3. Scenario: Traffic hits only ONE node, causing it to spike (Overload).
 * 4. Action: The system "Balances," and the height of the spiked node
 * flows outward to neighbors until all are equal.
 */
export function runServersPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { 
        position: 'absolute', inset: '0', pointerEvents: 'none',
        perspective: '800px', // Enable 3D space
        overflow: 'hidden'
    });

    // --- 1. The Isometric Plane ---
    const plane = document.createElement('div');
    Object.assign(plane.style, {
        position: 'absolute',
        left: `${center.x}px`, top: `${center.y + 40}px`, // Shift down slightly for 3D height
        width: '0px', height: '0px',
        transformStyle: 'preserve-3d',
        transform: 'rotateX(55deg) rotateZ(45deg)', // Isometric angle
    });
    root.appendChild(plane);

    // --- 2. The Server Pods (3x3 Grid) ---
    const gridSize = 3;
    const gap = 40;
    const podSize = 32;
    const offset = ((gridSize - 1) * gap) / 2; // To center the grid
    
    const pods: { el: HTMLDivElement, body: HTMLDivElement, top: HTMLDivElement, height: number }[] = [];

    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            const podGroup = document.createElement('div');
            // Position in grid (centered around 0,0)
            const px = (x * gap) - offset;
            const py = (y * gap) - offset;

            Object.assign(podGroup.style, {
                position: 'absolute',
                left: `${px}px`, top: `${py}px`,
                width: `${podSize}px`, height: `${podSize}px`,
                transformStyle: 'preserve-3d',
                transform: 'translate(-50%, -50%)'
            });

            // Pod Body (The vertical bar)
            const body = document.createElement('div');
            Object.assign(body.style, {
                position: 'absolute',
                left: '0', top: '0', width: '100%', height: '100%',
                background: 'linear-gradient(to bottom, #3b82f6, #1e3a8a)', // Blue gradient
                transformOrigin: '50% 50%',
                transform: 'translateZ(-1px)', // Extrude downwards visually
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
            });
            
            // Pod Top (The cap)
            const topFace = document.createElement('div');
            Object.assign(topFace.style, {
                position: 'absolute',
                left: '0', top: '0', width: '100%', height: '100%',
                background: '#60a5fa', // Lighter blue top
                border: '1px solid #93c5fd',
                transform: 'translateZ(1px)', // Sits on top
                boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)',
                transition: 'background 0.3s'
            });

            // Construct 3D Box (Pseudo-3D using Z-translation)
            // We animate the 'height' by translating the topFace Z up, and scaling the body Z
            // But simpler method for CSS: Just animate translateZ of the *Group* or Top, and stretch a side face.
            // Let's stick to a simpler visual: The 'body' is just a flat colored square, 
            // but we will extrude it by adding a 'side' pseudo-element later if needed.
            // Actually, let's keep it simple: The 'body' creates the column.
            
            // Simpler 3D approach for GSAP:
            // We will animate the `transform: translateZ(H)` of the top face, 
            // and scale the height of a side face. 
            // To keep code clean, we will just move the WHOLE pod up/down in Z space 
            // and assume the user looks from above, or just scale the Z-axis.
            
            // REVISION: Let's just use a "Bar Chart" visual. 
            // The podGroup is the base. We add a "pillar" inside.
            const pillar = document.createElement('div');
            Object.assign(pillar.style, {
                position: 'absolute', bottom: '0', left: '0', width: '100%', 
                height: '10px', // Initial height
                background: 'rgba(59, 130, 246, 0.6)',
                border: '1px solid #60a5fa',
                transform: 'rotateX(-90deg) translateZ(16px)', // Stand it up? No, CSS 3D is tricky.
                // Let's just stack them flat layers for the isometric "stack" look.
                transformStyle: 'preserve-3d'
            });
            
            // To make a solid looking bar in isometric, we need 3 faces: Top, Left, Right.
            // Top
            const fTop = document.createElement('div');
            Object.assign(fTop.style, {
                position: 'absolute', width: '100%', height: '100%', background: '#60a5fa',
                transform: 'translateZ(0px)'
            });
            // Right
            const fRight = document.createElement('div');
            Object.assign(fRight.style, {
                position: 'absolute', top: '0', right: '0', width: '10px', height: '100%',
                background: '#2563eb', transformOrigin: 'right', transform: 'rotateY(90deg)'
            });
            // Front
            const fFront = document.createElement('div');
            Object.assign(fFront.style, {
                position: 'absolute', bottom: '0', left: '0', width: '100%', height: '10px',
                background: '#1d4ed8', transformOrigin: 'bottom', transform: 'rotateX(-90deg)'
            });

            podGroup.appendChild(fRight);
            podGroup.appendChild(fFront);
            podGroup.appendChild(fTop);
            plane.appendChild(podGroup);

            pods.push({ el: podGroup, body: fFront, top: fTop, height: 0 });
        }
    }

    container.appendChild(root);

    // Helper to set height of a pod (by moving Top and stretching Sides)
    const setPodHeight = (podIdx: number, h: number, color = '#60a5fa') => {
        const p = pods[podIdx];
        const sideColor = color === '#ef4444' ? '#b91c1c' : '#2563eb'; // Darker red or blue
        const frontColor = color === '#ef4444' ? '#991b1b' : '#1d4ed8'; // Darkest red or blue

        // 1. Move Top Face up
        gsap.to(p.top, { z: h, backgroundColor: color, duration: 0.5, ease: 'power2.out' });
        
        // 2. Stretch Side/Front faces (scaleY or height)
        // Since they are rotated, 'width' or 'height' maps to Z height in parent space
        const sideEl = p.el.children[0] as HTMLElement; // Right
        const frontEl = p.el.children[1] as HTMLElement; // Front
        
        gsap.to(sideEl, { width: h, backgroundColor: sideColor, duration: 0.5, ease: 'power2.out' });
        gsap.to(frontEl, { height: h, backgroundColor: frontColor, duration: 0.5, ease: 'power2.out' });
    };

    // === ANIMATION SEQUENCE ===
    const tl = gsap.timeline();

    // 1. Intro: Grow from floor
    pods.forEach((p, i) => {
        // Initial state
        gsap.set(p.top, { z: 0 });
        gsap.set(p.el.children[0], { width: 0 });
        gsap.set(p.el.children[1], { height: 0 });
        
        // Animate to "Idle" height (approx 20px)
        const randomH = gsap.utils.random(15, 30);
        tl.add(() => setPodHeight(i, randomH), i * 0.05);
    });

    // 2. Data Ingress (Particles falling)
    // Visual only: White streaks falling into the center pod
    const trafficDuration = 1.5;
    for(let i=0; i<5; i++) {
        const drop = document.createElement('div');
        Object.assign(drop.style, {
            position: 'absolute', width: '2px', height: '20px', background: '#fff',
            left: '0px', top: '0px', // Center of plane
            transform: `translateZ(200px)`
        });
        plane.appendChild(drop);
        
        tl.to(drop, { 
            z: 50, // Hit the stack
            opacity: 0, 
            duration: 0.4, 
            ease: 'power1.in',
            onComplete: () => drop.remove()
        }, 0.5 + (i*0.2));
    }

    // 3. IMBALANCE: Center pod (index 4) grows HUGE and RED
    const centerIdx = 4;
    tl.add(() => {
        // Grow center
        setPodHeight(centerIdx, 120, '#ef4444'); // Red, Tall
        // Shrink others slightly (starved)
        pods.forEach((p, i) => {
            if (i !== centerIdx) setPodHeight(i, 10, '#93c5fd');
        });
    }, 0.8);

    // Text Label appearing
    const label = document.createElement('div');
    Object.assign(label.style, {
        position: 'absolute', left: `${center.x}px`, top: `${center.y - 120}px`,
        transform: 'translate(-50%, -50%)',
        background: '#ef4444', color: '#fff', padding: '4px 8px', borderRadius: '4px',
        fontSize: '10px', fontWeight: 'bold', opacity: '0', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });
    label.textContent = "OVERLOAD DETECTED";
    root.appendChild(label);
    
    tl.to(label, { opacity: 1, y: -10, duration: 0.3 }, 1.2);

    // 4. REBALANCING ACTION
    tl.to(label, { 
        backgroundColor: '#10b981', 
        text: "BALANCING...", // Requires TextPlugin? Fallback to opacity/swap if not available
        duration: 0.2,
        onStart: () => { label.textContent = "REBALANCING"; }
    }, 2.2);

    // The Wave: Center shrinks, neighbors grow until all are equal
    tl.add(() => {
        const balancedH = 40;
        pods.forEach((p, i) => {
            // Slight stagger based on distance from center for a "ripple" effect
            const row = Math.floor(i / 3);
            const col = i % 3;
            const dist = Math.abs(1 - row) + Math.abs(1 - col); // Manhattan dist from center (1,1)
            
            setTimeout(() => {
                setPodHeight(i, balancedH, '#3b82f6'); // Back to healthy blue
            }, dist * 100);
        });
    }, 2.4);

    // 5. Success state
    tl.to(label, { opacity: 0, duration: 0.3, delay: 0.5 });

    // 6. Exit: Collapse all
    tl.add(() => {
        pods.forEach((p, i) => {
            setTimeout(() => setPodHeight(i, 0), i * 30);
        });
    }, '+=0.5');

    // Wait for collapse animation to finish before resolving
    tl.to({}, { duration: 0.8 }); 

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve => tl.eventCallback('onComplete', () => { cleanup(); resolve(); }));

    return { promise, cancel: cleanup };
}