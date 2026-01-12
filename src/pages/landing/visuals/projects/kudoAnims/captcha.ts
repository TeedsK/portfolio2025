import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

export function runCaptchaPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });

    // Captcha Box
    const box = document.createElement('div');
    Object.assign(box.style, {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        left: `${center.x}px`,
        top: `${center.y}px`,
        width: '340px',
        height: '80px',
        background: '#f9fafb',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        fontFamily: 'sans-serif'
    });

    // Checkbox
    const checkbox = document.createElement('div');
    Object.assign(checkbox.style, {
        width: '28px', height: '28px',
        border: '2px solid #c0c0c0',
        borderRadius: '4px',
        background: '#fff',
        position: 'relative'
    });

    // Loading Spinner (hidden initially)
    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
        position: 'absolute', inset: '-2px',
        borderRadius: '50%', border: '2px solid transparent',
        borderTopColor: '#3b82f6', borderRightColor: '#3b82f6',
        opacity: '0'
    });
    checkbox.appendChild(spinner);

    // Checkmark (hidden initially)
    const checkmark = document.createElement('div');
    checkmark.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    Object.assign(checkmark.style, {
        position: 'absolute', top: '-8px', left: '-2px', opacity: '0', transform: 'scale(0.5)'
    });
    checkbox.appendChild(checkmark);

    // Text
    const text = document.createElement('div');
    text.innerHTML = `<div style="font-size:14px; font-weight:500; color:#1f2937;">I'm not a robot</div>`;

    // Logo Placeholder (Recaptcha style)
    const logo = document.createElement('div');
    Object.assign(logo.style, { marginLeft: 'auto', textAlign: 'center', opacity: '0.5' });
    logo.innerHTML = `<img src="/images/icons/connection.svg" width="24" /><div style="font-size:9px; color:#6b7280;">reCAPTCHA</div>`;

    box.appendChild(checkbox);
    box.appendChild(text);
    box.appendChild(logo);
    root.appendChild(box);

    // Cursor
    const cursor = document.createElement('img');
    cursor.src = '/images/icons/cursor.png'; // Fallback to CSS arrow if missing
    cursor.onerror = () => {
        cursor.style.width = '0'; cursor.style.height = '0';
        cursor.style.borderLeft = '12px solid transparent';
        cursor.style.borderRight = '12px solid transparent';
        cursor.style.borderBottom = '20px solid black';
        cursor.style.transform = 'rotate(-45deg)';
    };
    Object.assign(cursor.style, {
        position: 'absolute',
        left: `${center.x + 100}px`,
        top: `${center.y + 100}px`,
        width: '24px',
        zIndex: '50'
    });
    root.appendChild(cursor);
    container.appendChild(root);

    // Animation
    const tl = gsap.timeline();

    // 1. Appear
    tl.fromTo(box, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.3 });

    // 2. Cursor Move
    tl.to(cursor, {
        left: center.x - 120, // Approx checkbox X
        top: center.y + 5,    // Approx checkbox Y
        duration: 0.8,
        ease: 'power2.inOut'
    });

    // 3. Click
    tl.to(cursor, { scale: 0.8, duration: 0.1 });
    tl.to(cursor, { scale: 1, duration: 0.1 });

    // 4. Load (Spinner)
    tl.to(checkbox, { borderColor: 'transparent', duration: 0.1 });
    tl.to(spinner, { opacity: 1, duration: 0.1 }, '<');
    tl.to(spinner, { rotation: 360, repeat: 2, duration: 0.6, ease: 'linear' });

    // 5. Success
    tl.to(spinner, { opacity: 0, duration: 0.1 });
    tl.to(checkmark, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.5)' });

    // 6. Exit
    tl.to([box, cursor], { opacity: 0, duration: 0.3, delay: 0.5 });

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve => tl.eventCallback('onComplete', () => { cleanup(); resolve(); }));
    return { promise, cancel: cleanup };
}