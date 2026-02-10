import { gsap } from 'gsap';
import type { SubvizOpts, SubvizRunHandle } from './index';

/**
 * Inventory Animation
 * -------------------
 * Displays a table of shoe inventory with tiered pricing logic.
 * Categories: Expensive (High profit), Average (Mid profit), Cheap (Low profit).
 * Images are pulled from /public/images/shoes/{category}/{filename}.png
 * Names are derived from filenames (snake_case -> Title Case).
 */
export function runInventoryPreview({ container, center }: SubvizOpts): SubvizRunHandle {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });

    // Card Container
    const card = document.createElement('div');
    Object.assign(card.style, {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        left: `${center.x}px`,
        top: `${center.y}px`,
        width: '640px',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        padding: '20px',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
    });

    // Header
    const title = document.createElement('h4');
    title.textContent = 'Inventory';
    Object.assign(title.style, {
        margin: '0 0 15px 0',
        fontSize: '14px',
        fontWeight: '800',
        textTransform: 'uppercase',
        color: '#64748b',
        letterSpacing: '0.05em'
    });
    card.appendChild(title);

    // Table Construction
    const table = document.createElement('table');
    Object.assign(table.style, { width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', tableLayout: 'fixed' });

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr style="text-align:left; font-size:12px; color:#94a3b8;">
            <th style="padding:0 10px; width: 60px;">ID</th>
            <th style="padding:0 10px;">Item</th>
            <th style="padding:0 10px; text-align:right;">Cost</th>
            <th style="padding:0 10px; text-align:right;">Market</th>
            <th style="padding:0 10px; text-align:right;">Unrealized</th>
        </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // --- Data Generation Logic ---

    // Helper: Convert snake_case to Title Case
    const formatName = (filename: string) => {
        return filename
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const TIERS = [
        {
            id: 'expensive',
            // Filenames from public/images/shoes/expensive/
            items: [
                'Nike_Air_Max_97_Wotherspoon',
                'Nike_Ben_&_Jerry’s_Dunk',
                'Nike_Jordan_1_Chicago_1994',
                'Nike_Jordan_1_Dior',
                'Nike_Jordan_1_Travis_scott',
                'Nike_Jordan_4_Union',
                'Nike_Off-White_Canary_AF1',
                'Nike_Strange_Love_Dunk'
            ],
            gen: () => {
                // Profit: Thousands
                const cost = Math.floor(Math.random() * 500) + 200; // Cost $200 - $700
                const profit = Math.floor(Math.random() * 3000) + 1500; // Profit $1500 - $4500
                return { cost, profit, market: cost + profit };
            }
        },
        {
            id: 'average',
            // Filenames from public/images/shoes/average/
            items: [
                'Nike_Jordan_1_Game_Royal',
                'Nike_Kobe_Grinch',
                'Nike_Kobe_Pronto',
                'Supreme_Box_Logo',
                'Yeezy_350'
            ],
            gen: () => {
                // Profit: Couple hundred
                const cost = Math.floor(Math.random() * 100) + 120; // Cost $120 - $220
                const profit = Math.floor(Math.random() * 300) + 200; // Profit $200 - $500
                return { cost, profit, market: cost + profit };
            }
        },
        {
            id: 'cheap',
            // Filenames from public/images/shoes/cheap/
            items: [
                'Nike_Pandas_Dunk'
            ],
            gen: () => {
                // Profit: $50 - $100
                const cost = Math.floor(Math.random() * 40) + 60; // Cost $60 - $100
                const profit = Math.floor(Math.random() * 50) + 50; // Profit $50 - $100
                return { cost, profit, market: cost + profit };
            }
        }
    ];

    // Create 5 random rows
    const rowsData = Array.from({ length: 5 }).map((_, i) => {
        // Pick a random tier
        const tier = TIERS[Math.floor(Math.random() * TIERS.length)];

        // Pick a random item from that tier's list
        const filename = tier.items[Math.floor(Math.random() * tier.items.length)];

        const financials = tier.gen();
        const displayName = formatName(filename);

        return {
            id: i + 1,
            type: tier.id,
            name: displayName,
            // Corrected path to match your file tree: /public/images/shoes/...
            img: `/images/shoes/${tier.id}/${filename}.png`,
            ...financials
        };
    });

    const rowEls: HTMLElement[] = [];

    // Format Currency
    const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

    rowsData.forEach(d => {
        const tr = document.createElement('tr');
        Object.assign(tr.style, {
            background: '#f8fafc',
            transition: 'transform 0.2s',
            transformOrigin: 'center',
            position: 'relative'
        });

        const cellStyle = 'padding: 6px 10px; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; font-size:13px; vertical-align: middle;';
        const firstStyle = cellStyle + 'border-left:1px solid #e2e8f0; border-top-left-radius:8px; border-bottom-left-radius:8px;';
        const lastStyle = cellStyle + 'border-right:1px solid #e2e8f0; border-top-right-radius:8px; border-bottom-right-radius:8px; text-align:right;';

        // Image HTML with fallback and object-fit
        const imgHTML = `
            <div style="
                width: 48px; 
                height: 48px; 
                background: #fff; 
                border-radius: 6px; 
                border: 1px solid #cbd5e1; 
                display: flex; 
                align-items: center; 
                justify-content: center;
                overflow: hidden;
                padding: 4px;
                flex-shrink: 0;
            ">
                <img 
                    src="${d.img}" 
                    alt="${d.name}"
                    onerror="this.style.display='none'; this.parentElement.style.background='#f1f5f9';" 
                    style="
                        width: 100%; 
                        height: 100%; 
                        object-fit: contain; 
                        display: block;
                    " 
                />
            </div>
        `;

        tr.innerHTML = `
            <td style="${firstStyle} font-weight:600; color:#64748b;">#${d.id}</td>
            <td style="${cellStyle}">
                <div style="display:flex; align-items:center; gap:12px;">
                    ${imgHTML}
                    <div style="display:flex; flex-direction:column; justify-content:center; overflow:hidden;">
                        <span style="font-weight:600; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${d.name}">${d.name}</span>
                        <span style="font-size:11px; color:#94a3b8;">SKU-${1000 + d.id}</span>
                    </div>
                </div>
            </td>
            <td style="${cellStyle} text-align:right; color:#64748b;">${money(d.cost)}</td>
            <td style="${cellStyle} text-align:right; font-weight:500;">${money(d.market)}</td>
            <td style="${lastStyle} font-weight:700; color:#10b981;">
                +${money(d.profit)}
            </td>
        `;
        tbody.appendChild(tr);
        rowEls.push(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    root.appendChild(card);
    container.appendChild(root);

    // Animation Sequence
    const tl = gsap.timeline();

    // Enter
    tl.fromTo(card, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.2)' });
    tl.fromTo(rowEls, { y: 10, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.3 }, '-=0.2');

    // Spotlight random rows (scale up)
    const targetIndices = [1, 3];
    targetIndices.forEach(idx => {
        if (!rowEls[idx]) return;
        const row = rowEls[idx];
        tl.to(row, {
            scale: 1.08,
            zIndex: 10,
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            background: '#fff',
            borderColor: 'transparent',
            duration: 0.3,
            ease: 'power2.out'
        }, '+=0.2');
        tl.to(row, {
            scale: 1,
            zIndex: 0,
            boxShadow: 'none',
            background: '#f8fafc',
            duration: 0.3,
            ease: 'power2.in'
        }, '+=0.8');
    });

    // Exit
    tl.to(card, { scale: 0.9, opacity: 0, duration: 0.3, delay: 0.5 });

    const cleanup = () => { tl.kill(); root.remove(); };
    const promise = new Promise<void>(resolve => tl.eventCallback('onComplete', () => { cleanup(); resolve(); }));

    return { promise, cancel: cleanup };
}