import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

/**
 * Profile Converter (Middleware)
 * ------------------------------
 * Visualizes "Middleware Conversion":
 * 1. Shows Source Code.
 * 2. Glowing beam scans down.
 * 3. Code "glitches" into binary/hex (middleware state) as beam passes.
 * 4. A second scan resolves the binary into the Target Format.
 */
export function runConverterPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });

    // Code Window
    const win = document.createElement('div');
    Object.assign(win.style, {
        position: 'absolute',
        left: `${center.x}px`, top: `${center.y}px`,
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '240px',
        background: '#1e1e1e',
        borderRadius: '8px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        fontFamily: 'monospace',
        overflow: 'hidden',
        border: '1px solid #333'
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
        background: '#252526', padding: '8px 12px', display: 'flex', gap: '6px',
        borderBottom: '1px solid #333', alignItems: 'center'
    });
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach(c => {
        const dot = document.createElement('div');
        Object.assign(dot.style, { width: '10px', height: '10px', borderRadius: '50%', background: c });
        header.appendChild(dot);
    });

    const titleEl = document.createElement('span');
    titleEl.textContent = 'user_profile.json';
    Object.assign(titleEl.style, { marginLeft: '12px', fontSize: '12px', color: '#999', opacity: '0.8' });
    header.appendChild(titleEl);

    // Body Container
    const bodyContainer = document.createElement('div');
    Object.assign(bodyContainer.style, {
        position: 'relative', width: '100%', height: '100%', padding: '16px'
    });

    // Text
    const codeEl = document.createElement('div');
    Object.assign(codeEl.style, {
        color: '#d4d4d4', fontSize: '13px', whiteSpace: 'pre', lineHeight: '1.6'
    });

    // Scanner Beam
    const beam = document.createElement('div');
    Object.assign(beam.style, {
        position: 'absolute',
        left: '0', top: '-20px', right: '0',
        height: '20px',
        background: 'linear-gradient(to bottom, transparent, rgba(59, 130, 246, 0.5))',
        borderBottom: '2px solid #3b82f6',
        boxShadow: '0 0 15px #3b82f6',
        opacity: '0',
        pointerEvents: 'none'
    });

    bodyContainer.appendChild(codeEl);
    bodyContainer.appendChild(beam);
    win.appendChild(header);
    win.appendChild(bodyContainer);
    root.appendChild(win);
    container.appendChild(root);

    // Data Stages
    const stages = [
        {
            ext: 'json',
            text: `{\n  "id": 9241,\n  "user": "teeds_dev",\n  "role": "architect",\n  "active": true,\n  "meta": { "verified": 1 }\n}`
        },
        {
            // "Middleware" Hex/Garbage State
            ext: 'bin',
            text: `0x4F 0x2A 0x1B 0x9C 0x4D\n0x11 0x00 0xFA 0xCE 0x01\n<processing middleware>\n0x88 0x12 0xBB 0xCC 0xDD\n0x00 0x11 0x22 0x33 0x44`
        },
        {
            ext: 'xml',
            text: `<user>\n  <id>9241</id>\n  <handle>teeds_dev</handle>\n  <role>architect</role>\n  <active>true</active>\n</user>`
        },
        {
            ext: 'bin',
            text: `0xAA 0xBB 0xCC 0xDD 0xEE\n0x12 0x34 0x56 0x78 0x90\n<processing middleware>\n0xFF 0xFE 0xFD 0xFC 0xFB\n0x01 0x02 0x03 0x04 0x05`
        },
        {
            ext: 'yaml',
            text: `user:\n  id: 9241\n  handle: teeds_dev\n  role: architect\n  active: true`
        }
    ];

    codeEl.textContent = stages[0].text;

    const tl = gsap.timeline();

    // Pop in
    tl.from(win, { scale: 0.8, opacity: 0, duration: 0.4, ease: 'back.out(1.2)' });

    // Run a "scan" transition
    const runScan = (targetIndex: number, color: string) => {
        const next = stages[targetIndex];

        // Position beam at top
        tl.set(beam, { top: '0%', opacity: 1, borderBottomColor: color, boxShadow: `0 0 15px ${color}`, background: `linear-gradient(to bottom, transparent, ${color}55)` });

        // Scan down
        tl.to(beam, {
            top: '100%',
            duration: 0.6,
            ease: 'power1.inOut',
            onUpdate: function () {
                // Switch text halfway through scan
                const progress = this.progress();
                if (progress > 0.35 && progress < 0.45) {
                    codeEl.textContent = next.text;
                    titleEl.textContent = `profile_data.${next.ext}`;

                    // Glitch color shift
                    gsap.to(codeEl, { color: color, duration: 0.05, yoyo: true, repeat: 1 });
                    gsap.to(codeEl, { color: '#d4d4d4', duration: 0.05, delay: 0.1 });
                }
            }
        });

        // Fade out beam
        tl.set(beam, { opacity: 0 });
        tl.to({}, { duration: 0.3 }); // dwell
    };

    // JSON -> [Blue Scan] -> Binary -> [Green Scan] -> XML
    tl.to({}, { duration: 0.5 });
    runScan(1, '#3b82f6'); // Blue to Binary
    runScan(2, '#22c55e'); // Green to XML

    tl.to({}, { duration: 0.4 });

    runScan(3, '#3b82f6'); // Blue to Binary
    runScan(4, '#f59e0b'); // Orange to YAML

    // Exit
    tl.to(win, { scale: 0.9, opacity: 0, duration: 0.3, delay: 0.6 });

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve => tl.eventCallback('onComplete', () => { cleanup(); resolve(); }));
    return { promise, cancel: cleanup };
}