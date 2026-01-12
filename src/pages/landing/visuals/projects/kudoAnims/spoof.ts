import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

export function runSpoofPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });

    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute',
        left: `${center.x}px`, top: `${center.y}px`,
        transform: 'translate(-50%, -50%)',
        background: '#000',
        color: '#00ff41',
        fontFamily: 'monospace',
        fontSize: '24px',
        padding: '20px 40px',
        borderRadius: '4px',
        border: '1px solid #00ff41',
        textAlign: 'center',
        boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)'
    });

    const ipLine = document.createElement('div');
    ipLine.textContent = '192.168.1.45';

    const locLine = document.createElement('div');
    Object.assign(locLine.style, { fontSize: '14px', marginTop: '8px', opacity: '0.8', textTransform: 'uppercase' });
    locLine.textContent = 'Utah, United States';

    box.appendChild(ipLine);
    box.appendChild(locLine);
    root.appendChild(box);
    container.appendChild(root);

    const locations = [
        { ip: '104.23.11.92', loc: 'Tokyo, Japan' },
        { ip: '89.14.220.5', loc: 'Berlin, Germany' },
        { ip: '201.45.88.12', loc: 'São Paulo, Brazil' }
    ];

    const tl = gsap.timeline();

    tl.from(box, { scaleX: 0, duration: 0.3 });

    locations.forEach(loc => {
        // Glitch effect
        tl.to(box, { skewX: 20, duration: 0.05, delay: 0.8 });
        tl.to(box, {
            skewX: -20, duration: 0.05, onComplete: () => {
                ipLine.textContent = loc.ip;
                locLine.textContent = loc.loc;
            }
        });
        tl.to(box, { skewX: 0, duration: 0.05 });

        // Color shift for impact
        tl.fromTo(ipLine, { textShadow: '2px 0 red, -2px 0 blue' }, { textShadow: 'none', duration: 0.2 });
    });

    tl.to(box, { opacity: 0, duration: 0.2, delay: 0.5 });

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve => tl.eventCallback('onComplete', () => { cleanup(); resolve(); }));
    return { promise, cancel: cleanup };
}