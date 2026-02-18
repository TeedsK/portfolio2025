import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

/**
 * Server Management Animation (Live Status Dashboard)
 * ----------------------------------------------------
 * 1. A dark dashboard card pops in with server rows.
 * 2. Bars pulse showing live traffic / healthy state.
 * 3. One server degrades — bar drops, status goes red, alert badge appears.
 * 4. Automated restart sequence plays on that row.
 * 5. Server recovers — bar fills, status goes green.
 * 6. "All Systems Operational" banner, then exit.
 */

interface ServerRow {
    row: HTMLDivElement;
    dot: HTMLDivElement;
    bar: HTMLDivElement;
    barFill: HTMLDivElement;
    ping: HTMLDivElement;
    name: string;
    normalLoad: number; // 0-1
}

export function runServersPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });

    // Dashboard card
    const card = document.createElement('div');
    Object.assign(card.style, {
        position: 'absolute',
        left: `${center.x}px`, top: `${center.y}px`,
        transform: 'translate(-50%, -50%)',
        width: '420px',
        background: '#0f172a',
        borderRadius: '10px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        fontFamily: 'ui-monospace, monospace',
        overflow: 'hidden',
        border: '1px solid #1e293b',
    });

    // Header bar
    const header = document.createElement('div');
    Object.assign(header.style, {
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: '8px',
        borderBottom: '1px solid #1e293b',
        background: '#0b1120',
    });
    const headerDot = document.createElement('div');
    Object.assign(headerDot.style, {
        width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e',
        boxShadow: '0 0 6px #22c55e',
    });
    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'CLUSTER STATUS';
    Object.assign(headerTitle.style, {
        fontSize: '11px', fontWeight: '700', color: '#94a3b8',
        letterSpacing: '0.08em',
    });
    header.appendChild(headerDot);
    header.appendChild(headerTitle);
    card.appendChild(header);

    // Server list
    const list = document.createElement('div');
    Object.assign(list.style, { padding: '6px 0' });

    const servers: ServerRow[] = [];
    const serverDefs = [
        { name: 'us-east-1', load: 0.62 },
        { name: 'us-west-2', load: 0.45 },
        { name: 'eu-central', load: 0.78 },
        { name: 'ap-south-1', load: 0.33 },
    ];

    for (const def of serverDefs) {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 14px',
            borderBottom: '1px solid rgba(30,41,59,0.5)',
        });

        // Status dot
        const dot = document.createElement('div');
        Object.assign(dot.style, {
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#22c55e',
            boxShadow: '0 0 6px rgba(34,197,94,0.5)',
            flexShrink: '0',
        });

        // Name
        const nameEl = document.createElement('span');
        nameEl.textContent = def.name;
        Object.assign(nameEl.style, {
            fontSize: '12px', color: '#e2e8f0', width: '90px', flexShrink: '0',
        });

        // Bar track
        const bar = document.createElement('div');
        Object.assign(bar.style, {
            flex: '1', height: '6px', background: '#1e293b',
            borderRadius: '3px', overflow: 'hidden', position: 'relative',
        });

        // Bar fill
        const barFill = document.createElement('div');
        Object.assign(barFill.style, {
            height: '100%', width: '0%',
            background: 'linear-gradient(90deg, #22c55e, #4ade80)',
            borderRadius: '3px',
            transition: 'background 0.3s',
        });
        bar.appendChild(barFill);

        // Ping label
        const ping = document.createElement('span');
        ping.textContent = `${Math.round(def.load * 100)}%`;
        Object.assign(ping.style, {
            fontSize: '10px', color: '#64748b', width: '36px',
            textAlign: 'right', flexShrink: '0',
        });

        row.appendChild(dot);
        row.appendChild(nameEl);
        row.appendChild(bar);
        row.appendChild(ping);
        list.appendChild(row);

        servers.push({ row, dot, bar, barFill, ping, name: def.name, normalLoad: def.load });
    }

    card.appendChild(list);

    // Alert banner (hidden)
    const banner = document.createElement('div');
    Object.assign(banner.style, {
        padding: '8px 14px',
        fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em',
        textAlign: 'center',
        opacity: '0',
    });
    card.appendChild(banner);

    root.appendChild(card);
    container.appendChild(root);

    // --- Animation ---
    const tl = gsap.timeline();
    const failIdx = 2; // eu-central will fail
    const failServer = servers[failIdx];

    // 1. Pop in
    tl.from(card, { scale: 0.85, opacity: 0, duration: 0.4, ease: 'back.out(1.2)' });

    // 2. Bars fill in staggered
    servers.forEach((s, i) => {
        tl.to(s.barFill, {
            width: `${s.normalLoad * 100}%`,
            duration: 0.5,
            ease: 'power2.out',
        }, 0.5 + i * 0.08);
    });

    // 3. Brief healthy pulse — bars fluctuate subtly
    const pulseLabel = 'pulse';
    servers.forEach((s, i) => {
        const jitter = gsap.utils.random(-5, 5);
        tl.to(s.barFill, {
            width: `${Math.min(95, s.normalLoad * 100 + jitter)}%`,
            duration: 0.4,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: 1,
        }, `${pulseLabel}+=${i * 0.06}`);
    });
    tl.addLabel(pulseLabel, '+=0.3');

    // 4. eu-central degrades
    const degradeLabel = 'degrade';
    tl.addLabel(degradeLabel, '+=0.2');

    // Bar drops
    tl.to(failServer.barFill, {
        width: '92%',
        background: 'linear-gradient(90deg, #f59e0b, #eab308)',
        duration: 0.4,
        ease: 'power2.in',
    }, degradeLabel);

    // Dot goes yellow
    tl.to(failServer.dot, {
        background: '#f59e0b',
        boxShadow: '0 0 6px rgba(245,158,11,0.6)',
        duration: 0.2,
    }, degradeLabel);

    tl.set(failServer.ping, {
        color: '#f59e0b',
        onComplete: () => { failServer.ping.textContent = '92%'; },
    }, `${degradeLabel}+=0.3`);

    // Then crashes to red
    const crashLabel = 'crash';
    tl.addLabel(crashLabel, '+=0.4');

    tl.to(failServer.barFill, {
        width: '4%',
        background: 'linear-gradient(90deg, #ef4444, #dc2626)',
        duration: 0.5,
        ease: 'power3.in',
    }, crashLabel);

    tl.to(failServer.dot, {
        background: '#ef4444',
        boxShadow: '0 0 8px rgba(239,68,68,0.7)',
        duration: 0.3,
    }, crashLabel);

    tl.set(failServer.ping, {
        color: '#ef4444',
        onComplete: () => { failServer.ping.textContent = 'DOWN'; },
    }, `${crashLabel}+=0.3`);

    // Row flash red briefly
    tl.to(failServer.row, {
        background: 'rgba(239,68,68,0.08)',
        duration: 0.15,
        yoyo: true,
        repeat: 3,
    }, crashLabel);

    // Show alert banner
    tl.set(banner, {
        onComplete: () => {
            banner.textContent = '⚠ ALERT — eu-central unresponsive';
            banner.style.color = '#fca5a5';
            banner.style.background = 'rgba(239,68,68,0.1)';
            banner.style.borderTop = '1px solid rgba(239,68,68,0.2)';
        },
    }, `${crashLabel}+=0.4`);
    tl.to(banner, { opacity: 1, duration: 0.25 }, `${crashLabel}+=0.4`);

    // 5. Restart sequence
    const restartLabel = 'restart';
    tl.addLabel(restartLabel, '+=0.8');

    tl.set(banner, {
        onComplete: () => {
            banner.textContent = '↻ RESTARTING eu-central …';
            banner.style.color = '#93c5fd';
            banner.style.background = 'rgba(59,130,246,0.08)';
            banner.style.borderTop = '1px solid rgba(59,130,246,0.15)';
        },
    }, restartLabel);

    // Dot blinks blue during restart
    tl.to(failServer.dot, {
        background: '#3b82f6',
        boxShadow: '0 0 6px rgba(59,130,246,0.6)',
        duration: 0.25,
        yoyo: true,
        repeat: 5,
        ease: 'steps(1)',
    }, restartLabel);

    tl.set(failServer.ping, {
        onComplete: () => { failServer.ping.textContent = '...'; failServer.ping.style.color = '#64748b'; },
    }, restartLabel);

    // Bar slowly recovers
    tl.to(failServer.barFill, {
        width: `${failServer.normalLoad * 100}%`,
        background: 'linear-gradient(90deg, #22c55e, #4ade80)',
        duration: 1.4,
        ease: 'power2.out',
    }, `${restartLabel}+=0.3`);

    // 6. Recovery complete
    const recoveryLabel = 'recovery';
    tl.addLabel(recoveryLabel, `${restartLabel}+=1.8`);

    tl.to(failServer.dot, {
        background: '#22c55e',
        boxShadow: '0 0 6px rgba(34,197,94,0.5)',
        duration: 0.3,
    }, recoveryLabel);

    tl.set(failServer.ping, {
        onComplete: () => {
            failServer.ping.textContent = `${Math.round(failServer.normalLoad * 100)}%`;
            failServer.ping.style.color = '#64748b';
        },
    }, recoveryLabel);

    tl.to(failServer.row, { background: 'transparent', duration: 0.3 }, recoveryLabel);

    // Banner → success
    tl.set(banner, {
        onComplete: () => {
            banner.textContent = '✓ ALL SYSTEMS OPERATIONAL';
            banner.style.color = '#86efac';
            banner.style.background = 'rgba(34,197,94,0.08)';
            banner.style.borderTop = '1px solid rgba(34,197,94,0.15)';
        },
    }, `${recoveryLabel}+=0.1`);

    // Header dot pulse
    tl.to(headerDot, {
        scale: 1.4, duration: 0.2, yoyo: true, repeat: 1,
    }, `${recoveryLabel}+=0.1`);

    // 7. Exit
    tl.to(card, { scale: 0.9, opacity: 0, duration: 0.35, delay: 0.8, ease: 'power2.in' });

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve =>
        tl.eventCallback('onComplete', () => { cleanup(); resolve(); })
    );

    return { promise, cancel: cleanup };
}
