import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './HoloDataset.css';

export type Phase =
    | 'idle'
    | 'ingested'
    | 'detected'
    | 'pruned'
    | 'compiled'
    | 'inferred'
    | 'evaluated';

export type RunStats = {
    rowsTotal: number;
    flaggedTotal: number;
    precision: number; // 0..1
    recall: number;    // 0..1
    f1: number;        // 0..1
    fixedTotal: number;
};

type Row = {
    id: number;
    name: string;
    city: string;
    state: string;
    zipcode: string;
    beds: number | string;
};

type CellKey = 'name' | 'city' | 'state' | 'zipcode' | 'beds';

type Flag = {
    rowId: number;
    col: CellKey;
    issue: string;
    severity: 'warn' | 'error';
};

type Suggestion = {
    rowId: number;
    col: CellKey;
    value: string | number;
    prob: number; // 0..1
};

type Fix = Suggestion;

type PopoverStage = 'hidden' | 'issues' | 'suggestions' | 'fixed';
type Side = 'left' | 'right';

/** ---------- Randomized run generator ---------- */

type RunData = {
    rows: Row[];
    flags: Flag[];
    suggestions: Suggestion[];
    signature: string;
};

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = <T,>(arr: T[]) => arr[rand(0, arr.length - 1)];

const ROW_TEMPLATES: Omit<Row, 'id'>[] = [
    { name: 'Valley General', city: 'Salt Lake City', state: 'Utah', zipcode: '84010', beds: 220 },
    { name: 'St. Mary Medical', city: 'Denver', state: 'Colorado', zipcode: '80014', beds: 180 },
    { name: 'Boise Regional', city: 'Boise', state: 'Idaho', zipcode: '83702', beds: 140 },
    { name: 'Wasatch Health', city: 'Salt Lake', state: 'Utah', zipcode: '84105', beds: 200 },
    { name: 'Canyon Clinic', city: 'Provo', state: 'Utah', zipcode: '84601', beds: 120 },
    { name: 'Junction Care', city: 'Grand Junction', state: 'Colorado', zipcode: '81501', beds: 160 },
];

function typoState(s: string) {
    const map: Record<string, string> = {
        utah: 'Utha',
        colorado: 'Colarado',
        idaho: 'Idaoh',
    };
    return map[s.toLowerCase()] ?? (s.slice(0, Math.max(1, s.length - 1)));
}

function corruptZipO(z: string) {
    const indices = [...z].map((ch, i) => ({ ch, i })).filter(e => e.ch === '0');
    if (indices.length) {
        const idx = choice(indices).i;
        return z.slice(0, idx) + 'O' + z.slice(idx + 1);
    }
    const idx = rand(0, z.length - 1);
    return z.slice(0, idx) + 'O' + z.slice(idx + 1);
}

function probApprox(lo = 0.78, hi = 0.97) {
    return Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
}

/** Generate a randomized 6-row sample, with issues limited to the first 4 rows. */
function makeRunData(rowsTotal: number, prevSig?: string): RunData {
    const idStart = Math.max(1, rand(1, Math.max(6, rowsTotal - 5)));
    const rows: Row[] = ROW_TEMPLATES.map((tpl, i) => ({
        id: idStart + i,
        ...tpl
    }));
    const original: Row[] = ROW_TEMPLATES.map((tpl, i) => ({
        id: idStart + i,
        ...tpl
    }));

    type ErrType = 'stateTypo' | 'zipcodeO' | 'cityMissing' | 'bedsNegative';
    const errorTypes: ErrType[] = ['stateTypo', 'zipcodeO', 'cityMissing', 'bedsNegative'];

    // choose 2..3 errors within first 4 rows
    const candidateIds = [idStart + 0, idStart + 1, idStart + 2, idStart + 3];
    const targetErrorsCount = rand(2, 3);
    const picks: { rowId: number; type: ErrType }[] = [];
    const usedCells = new Set<string>();
    const ckey = (rid: number, t: ErrType) => `${rid}:${t}`;

    let guard = 0;
    while (picks.length < targetErrorsCount && guard++ < 20) {
        const rid = choice(candidateIds);
        const t = choice(errorTypes);
        const key = ckey(rid, t);
        if (usedCells.has(key)) continue;
        usedCells.add(key);
        picks.push({ rowId: rid, type: t });
    }

    const flags: Flag[] = [];
    const suggestions: Suggestion[] = [];

    picks.forEach(({ rowId, type }) => {
        const idx = rows.findIndex(r => r.id === rowId);
        const base = original[idx];
        const r = rows[idx];

        if (type === 'stateTypo') {
            const bad = typoState(base.state);
            r.state = bad;
            flags.push({ rowId, col: 'state', issue: `state typo → ${base.state}`, severity: 'error' });
            suggestions.push({ rowId, col: 'state', value: base.state, prob: probApprox(0.92, 0.98) });
        }
        if (type === 'zipcodeO') {
            const bad = corruptZipO(base.zipcode);
            r.zipcode = bad;
            flags.push({ rowId, col: 'zipcode', issue: 'zipcode: letter “O” as 0', severity: 'warn' });
            suggestions.push({ rowId, col: 'zipcode', value: base.zipcode, prob: probApprox(0.88, 0.96) });
        }
        if (type === 'cityMissing') {
            r.city = '';
            flags.push({ rowId, col: 'city', issue: 'city missing', severity: 'warn' });
            suggestions.push({ rowId, col: 'city', value: base.city, prob: probApprox(0.72, 0.9) });
        }
        if (type === 'bedsNegative') {
            const val = typeof base.beds === 'number' ? base.beds : 100;
            r.beds = -Math.max(10, Math.round(val * 0.6));
            flags.push({ rowId, col: 'beds', issue: 'beds negative', severity: 'error' });
            suggestions.push({ rowId, col: 'beds', value: Math.abs(Number(r.beds)) || val, prob: probApprox(0.85, 0.95) });
        }
    });

    const signature = picks.map(p => `${p.rowId}:${p.type}`).sort().join('|');
    if (prevSig && signature === prevSig) {
        // try again for variety
        return makeRunData(rowsTotal, undefined);
    }

    return { rows, flags, suggestions, signature };
}

/** Utility: animate stat swaps (fade/slide) */
function animateStatSwap(el: HTMLElement | null, nextText: string) {
    if (!el) return;
    gsap.to(el, {
        y: -6,
        opacity: 0,
        duration: 0.16,
        ease: 'power1.in',
        onComplete: () => {
            el.textContent = nextText;
            gsap.set(el, { y: 6, opacity: 0 });
            gsap.to(el, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out' });
        }
    });
}

/* ---------- Component ---------- */

const HoloDataset: React.FC<{ phase: Phase; stats: RunStats }> = ({ phase, stats }) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [flags, setFlags] = useState<Flag[]>([]);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [fixes, setFixes] = useState<Fix[]>([]);
    const [showFeatures, setShowFeatures] = useState(false);

    // Popover stage for rows with problems (cumulative sections)
    const [popoverStage, setPopoverStage] = useState<PopoverStage>('hidden');

    // layout refs
    const wrapRef = useRef<HTMLDivElement>(null);          // scroll container (now non-scrollable)
    const tableRef = useRef<HTMLTableElement>(null);       // table
    const panelRef = useRef<HTMLDivElement>(null);         // dataset panel
    const overlayRef = useRef<HTMLDivElement>(null);       // row popover overlay (sibling to scroller)

    // Header stats number refs (we animate text swaps)
    const rowsNumRef = useRef<HTMLSpanElement>(null);
    const flaggedNumRef = useRef<HTMLSpanElement>(null);
    const fixedNumRef = useRef<HTMLSpanElement>(null);
    const featureBadgeRef = useRef<HTMLSpanElement>(null);

    // Keep last run signature to avoid repetition
    const lastSigRef = useRef<string | undefined>(undefined);
    const runRef = useRef<RunData | null>(null);

    // Which rows have problems (based on current flags)
    const problemRowIds = useMemo(
        () => Array.from(new Set(flags.map(f => f.rowId))),
        [flags]
    );

    // Alternate sides for each problem row
    const [rowSides, setRowSides] = useState<Record<number, Side>>({});
    useEffect(() => {
        if (!rows.length) return;
        const mapping: Record<number, Side> = {};
        const order = rows.filter(r => problemRowIds.includes(r.id)).map(r => r.id);
        order.forEach((rid, idx) => {
            mapping[rid] = (idx % 2 === 0) ? 'left' : 'right';
        });
        setRowSides(mapping);
    }, [rows, problemRowIds]);

    // Measure row positions for popovers — relative to the overlay (NOT the scroller)
    const [rowPositions, setRowPositions] = useState<Record<number, { leftEdge: number; rightEdge: number; midY: number }>>({});

    const measurePositions = () => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const ov = overlay.getBoundingClientRect();
        const res: Record<number, { leftEdge: number; rightEdge: number; midY: number }> = {};

        problemRowIds.forEach((rid) => {
            const tr = tableRef.current?.querySelector(`tbody tr[data-rid="${rid}"]`) as HTMLTableRowElement | null;
            if (!tr) return;

            // Use inner cell boxes so we ignore row spacing from border-spacing
            const firstInner = tr.querySelector('td:first-child .cell-inner') as HTMLElement | null;
            const lastInner = tr.querySelector('td:last-child .cell-inner') as HTMLElement | null;

            const firstTd = tr.querySelector('td:first-child') as HTMLTableCellElement | null;
            const lastTd = tr.querySelector('td:last-child') as HTMLTableCellElement | null;

            const baseRect = (firstInner?.getBoundingClientRect()
                ?? firstTd?.getBoundingClientRect()
                ?? tr.getBoundingClientRect());

            const lastRect = (lastInner?.getBoundingClientRect()
                ?? lastTd?.getBoundingClientRect()
                ?? baseRect);

            res[rid] = {
                leftEdge: baseRect.left - ov.left,
                rightEdge: lastRect.right - ov.left,
                midY: (baseRect.top + baseRect.height / 2) - ov.top, // exact center of visible cell area
            };
        });
        setRowPositions(res);
    };

    // Keep anchors in sync with resizing/content morphs and after initial layout
    useEffect(() => {
        measurePositions();
        const onResize = () => measurePositions();
        window.addEventListener('resize', onResize, { passive: true });

        const ro = new ResizeObserver(() => measurePositions());
        if (panelRef.current) ro.observe(panelRef.current);

        const settle1 = window.setTimeout(measurePositions, 100);
        const settle2 = window.setTimeout(measurePositions, 250);

        return () => {
            window.removeEventListener('resize', onResize);
            ro.disconnect();
            clearTimeout(settle1);
            clearTimeout(settle2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, flags, fixes]);

    // Also re-measure when popover content grows across stages
    useEffect(() => {
        requestAnimationFrame(() => requestAnimationFrame(measurePositions));
    }, [popoverStage]);

    // Derived lookups
    const flaggedMap = useMemo(() => {
        const m = new Map<string, Flag>();
        flags.forEach((f) => m.set(`${f.rowId}:${f.col}`, f));
        return m;
    }, [flags]);

    const fixedMap = useMemo(() => {
        const m = new Map<string, Fix>();
        fixes.forEach((f) => m.set(`${f.rowId}:${f.col}`, f));
        return m;
    }, [fixes]);

    /* ---------- Phase logic ---------- */
    useEffect(() => {
        if (phase === 'idle') {
            // Animate out existing rows + popovers (if any), then clear
            const hasContent = rows.length > 0 || flags.length > 0 || fixes.length > 0;
            if (hasContent) {
                const tl = gsap.timeline();
                const rowEls = tableRef.current?.querySelectorAll('tbody tr');
                if (rowEls && rowEls.length) {
                    tl.to(rowEls, { opacity: 0, y: 8, scale: 0.98, duration: 0.24, ease: 'power2.in', stagger: 0.04 }, 0);
                }
                if (overlayRef.current) {
                    tl.to(overlayRef.current, { opacity: 0, duration: 0.18, ease: 'power1.in' }, 0);
                }
                tl.add(() => {
                    setRows([]);
                    setFlags([]);
                    setSuggestions([]);
                    setFixes([]);
                    setShowFeatures(false);
                    setPopoverStage('hidden');
                    if (overlayRef.current) gsap.set(overlayRef.current, { clearProps: 'opacity' });
                });
            } else {
                setRows([]);
                setFlags([]);
                setSuggestions([]);
                setFixes([]);
                setShowFeatures(false);
                setPopoverStage('hidden');
            }

            // Reset header numbers visually
            animateStatSwap(rowsNumRef.current, '—');
            animateStatSwap(flaggedNumRef.current, '0');
            animateStatSwap(fixedNumRef.current, '0');
            return;
        }

        if (phase === 'ingested') {
            // New randomized run (6 rows; issues only in first 4)
            const run = makeRunData(stats.rowsTotal, lastSigRef.current);
            lastSigRef.current = run.signature;
            runRef.current = run;

            setRows(run.rows);
            setPopoverStage('hidden');

            // Animate table rows in
            requestAnimationFrame(() => {
                const rowEls = tableRef.current?.querySelectorAll('tbody tr');
                if (!rowEls) return;
                gsap.fromTo(
                    rowEls,
                    { opacity: 0, y: 8, scale: 0.98 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out', stagger: 0.06 }
                );
            });

            // Header numbers → randomized rows (≥ 900)
            animateStatSwap(rowsNumRef.current, String(stats.rowsTotal));
            animateStatSwap(flaggedNumRef.current, '0');
            animateStatSwap(fixedNumRef.current, '0');
            return;
        }

        if (phase === 'detected') {
            if (overlayRef.current) gsap.set(overlayRef.current, { opacity: 1 });
            const run = runRef.current;
            if (!run) return;

            setFlags(run.flags);
            setPopoverStage('issues');

            // Subtle glow on flagged cells
            requestAnimationFrame(() => {
                run.flags.forEach((f, i) => {
                    const el = tableRef.current?.querySelector(
                        `[data-row="${f.rowId}"][data-col="${f.col}"] .cell-inner`
                    ) as HTMLElement | null;
                    if (el) {
                        gsap.fromTo(
                            el,
                            { boxShadow: '0 0 0 rgba(244,63,94,0)' },
                            { boxShadow: '0 0 16px rgba(244,63,94,.28)', duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1, delay: i * 0.05 }
                        );
                    }
                });
            });

            // Update flagged count to this run's header count
            animateStatSwap(flaggedNumRef.current, String(stats.flaggedTotal));
            return;
        }

        if (phase === 'pruned') {
            const run = runRef.current;
            if (!run) return;
            setSuggestions(run.suggestions);
            setPopoverStage('suggestions');
            return;
        }

        if (phase === 'compiled') {
            setShowFeatures(true);

            // Smooth badge reveal: width 0 -> target, with fade & slight slide, no wrapping
            requestAnimationFrame(() => {
                const badge = featureBadgeRef.current;
                const statsRow = panelRef.current?.querySelector('.dataset-stats') as HTMLElement | null;
                if (!badge || !statsRow) return;

                const naturalWidth = Math.max(badge.scrollWidth, badge.getBoundingClientRect().width);

                badge.style.overflow = 'hidden';
                gsap.set(badge, { width: 0, opacity: 0, x: -8 });
                gsap.to(badge, {
                    width: naturalWidth,
                    opacity: 1,
                    x: 0,
                    duration: 0.55,
                    ease: 'power3.out',
                    onComplete: () => {
                        // allow it to flex naturally after animation
                        badge.style.width = '';
                        badge.style.overflow = '';
                    }
                });

                // Gentle nudge on siblings so the row breathes while the badge arrives
                const sibs = Array.from(statsRow.children).filter((el) => el !== badge) as HTMLElement[];
                gsap.fromTo(sibs, { x: -6 }, { x: 0, duration: 0.45, ease: 'power3.out', stagger: 0.02 });
            });
            return;
        }

        if (phase === 'inferred') {
            // Apply suggestions into rows; flip to "fixed" stage
            suggestions.forEach((s) => {
                setRows((prev) =>
                    prev.map((r) => (r.id === s.rowId ? { ...r, [s.col]: s.value as any } : r))
                );
            });
            setFixes(suggestions as Fix[]);
            setFlags([]);
            setPopoverStage('fixed');

            // Animate corrected cells
            requestAnimationFrame(() => {
                suggestions.forEach((s, i) => {
                    const el = tableRef.current?.querySelector(
                        `[data-row="${s.rowId}"][data-col="${s.col}"] .cell-inner`
                    ) as HTMLElement | null;
                    if (el) {
                        gsap.fromTo(
                            el,
                            { backgroundColor: 'rgba(52,211,153,.10)' },
                            { backgroundColor: 'rgba(52,211,153,.22)', duration: 0.18, yoyo: true, repeat: 1, delay: i * 0.06 }
                        );
                    }
                });
            });

            // Update fixed count to precision × flagged (rounded) for THIS run
            animateStatSwap(fixedNumRef.current, String(stats.fixedTotal));
            return;
        }

        if (phase === 'evaluated') {
            // Terminal shows eval; dataset header/state already aligned above.
            return;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, stats]);

    // Headers & stats (labels only; numbers are mutated via refs for clean swap animation)
    const colHeaders: { key: CellKey | 'id'; label: string }[] = useMemo(
        () => [
            { key: 'id', label: 'id' },
            { key: 'name', label: 'name' },
            { key: 'city', label: 'city' },
            { key: 'state', label: 'state' },
            { key: 'zipcode', label: 'zipcode' },
            { key: 'beds', label: 'beds' },
        ],
        []
    );

    const isFlagged = (r: Row, col: CellKey) => flaggedMap.has(`${r.id}:${col}`);
    const isFixed = (r: Row, col: CellKey) => fixedMap.has(`${r.id}:${col}`);
    const sevClass = (r: Row, col: CellKey) => {
        const f = flaggedMap.get(`${r.id}:${col}`);
        return f?.severity === 'error' ? 'sev-error' : f ? 'sev-warn' : '';
    };

    type RowSection = { title: string; variant: 'warn' | 'error' | 'info' | 'ok'; items: string[] };
    const sectionsForRow = (rid: number): RowSection[] => {
        const rowFlags = flags.filter(f => f.rowId === rid);
        if (!rowFlags.length) return [];

        const issuesHasErr = rowFlags.some(f => f.severity === 'error');
        const issues: RowSection = {
            title: 'Issues',
            variant: issuesHasErr ? 'error' : 'warn',
            items: rowFlags.map(f => `• ${f.issue}`),
        };

        const predsData = suggestions.filter(s => s.rowId === rid);
        const preds: RowSection = {
            title: 'Predictions',
            variant: 'info',
            items: predsData.map(s => `• ${s.col} → ${s.value} (${Math.round(s.prob * 100)}%)`),
        };

        const fixedData = suggestions.filter(s => s.rowId === rid);
        const fixed: RowSection = {
            title: 'Corrected',
            variant: 'ok',
            items: fixedData.map(s => `• ${s.col} = ${s.value} (${Math.round(s.prob * 100)}%)`),
        };

        return [issues, preds, fixed];
    };

    const visibleCountByStage = (st: PopoverStage) =>
        st === 'issues' ? 1 : st === 'suggestions' ? 2 : st === 'fixed' ? 3 : 0;

    const visibleSections = visibleCountByStage(popoverStage);

    return (
        <section ref={panelRef} className="dataset-panel unbounded" aria-label="Dataset live view">
            <header className="dataset-head">
                <div className="dataset-title">hospital records</div>
                <div className="dataset-stats">
                    <span className="stat">rows <span ref={rowsNumRef} className="num">—</span></span>
                    <span className="stat">flagged <span ref={flaggedNumRef} className="num">0</span></span>
                    <span className="stat">fixed <span ref={fixedNumRef} className="num">0</span></span>
                    {showFeatures && (
                        <span ref={featureBadgeRef} className="feature-badge">1,237,211 features</span>
                    )}
                </div>
            </header>

            {/* Non-scrollable table area */}
            <div ref={wrapRef} className="dataset-table-wrap">
                <table ref={tableRef} className="dataset-table">
                    <thead>
                        <tr>
                            {colHeaders.map((c) => (
                                <th key={c.key}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id} data-rid={r.id}>
                                <td data-row={r.id} data-col="id">
                                    <div className="cell-inner">{r.id}</div>
                                </td>
                                <td data-row={r.id} data-col="name">
                                    <div className="cell-inner">{r.name}</div>
                                </td>
                                <td data-row={r.id} data-col="city">
                                    <div className={`cell-inner ${isFlagged(r, 'city') ? `is-flagged ${sevClass(r, 'city')}` : ''} ${isFixed(r, 'city') ? 'is-fixed' : ''}`}>
                                        {r.city || <span className="muted">—</span>}
                                    </div>
                                </td>
                                <td data-row={r.id} data-col="state">
                                    <div className={`cell-inner ${isFlagged(r, 'state') ? `is-flagged ${sevClass(r, 'state')}` : ''} ${isFixed(r, 'state') ? 'is-fixed' : ''}`}>
                                        {r.state}
                                    </div>
                                </td>
                                <td data-row={r.id} data-col="zipcode">
                                    <div className={`cell-inner ${isFlagged(r, 'zipcode') ? `is-flagged ${sevClass(r, 'zipcode')}` : ''} ${isFixed(r, 'zipcode') ? 'is-fixed' : ''}`}>
                                        {r.zipcode}
                                    </div>
                                </td>
                                <td data-row={r.id} data-col="beds">
                                    <div className={`cell-inner ${isFlagged(r, 'beds') ? `is-flagged ${sevClass(r, 'beds')}` : ''} ${isFixed(r, 'beds') ? 'is-fixed' : ''}`}>
                                        {r.beds}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Row popovers overlay — sibling to table so it never clips */}
            <div ref={overlayRef} className="row-popovers" aria-hidden>
                {visibleSections > 0 && problemRowIds.map((rid) => {
                    const pos = rowPositions[rid];
                    const side = rowSides[rid] ?? 'left';
                    const sections = sectionsForRow(rid);
                    if (!pos || !sections.length) return null;
                    return (
                        <RowPopover
                            key={rid}
                            rowId={rid}
                            side={side}
                            top={pos.midY}
                            refLeft={pos.leftEdge}
                            refRight={pos.rightEdge}
                            stage={popoverStage}
                            sections={sections}
                            visibleCount={visibleSections}
                        />
                    );
                })}
            </div>
        </section>
    );
};

// Keep this component isolated from parent re-renders.
export default memo(HoloDataset);

/** Row popover that anchors to a row (left or right), and expands cumulatively across stages. */
const RowPopover: React.FC<{
    rowId: number;
    side: Side;
    top: number;
    refLeft: number;
    refRight: number;
    stage: PopoverStage;
    sections: { title: string; variant: 'warn' | 'error' | 'info' | 'ok'; items: string[] }[];
    visibleCount: number; // how many sections should be visible (1..3)
}> = ({ side, top, refLeft, refRight, stage, sections, visibleCount }) => {
    const ref = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastVisible = useRef<number>(0);

    // Appear once when it first becomes visible
    useEffect(() => {
        if (stage === 'hidden') return;
        if (!ref.current) return;
        gsap.fromTo(
            ref.current,
            { opacity: 0, scale: 0.96, y: -4 },
            { opacity: 1, scale: 1, y: 0, duration: 0.28, ease: 'power2.out' }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Animate expansion when visibleCount increases
    useLayoutEffect(() => {
        const cont = containerRef.current;
        if (!cont) return;

        const prev = lastVisible.current;
        const next = Math.min(visibleCount, sections.length);

        if (next > prev) {
            for (let idx = prev; idx < next; idx++) {
                const sec = cont.querySelector(`.rp-sec[data-idx="${idx}"]`) as HTMLElement | null;
                if (!sec) continue;

                // Prepare starting state before paint to avoid flicker
                gsap.set(sec, {
                    height: 0,
                    opacity: 0,
                    scaleY: 0.98,
                    y: 2,
                    transformOrigin: 'top center',
                    display: 'block'
                });

                // Animate this section open (height 0 -> auto) with a calm ease
                gsap.to(sec, {
                    height: 'auto',
                    opacity: 1,
                    scaleY: 1,
                    y: 0,
                    duration: 0.48,
                    ease: 'power3.out',
                    clearProps: 'height'
                });
            }
            lastVisible.current = next;
        } else {
            lastVisible.current = next;
        }
    }, [visibleCount, sections.length]);

    const style: React.CSSProperties =
        side === 'left'
            ? { left: refLeft, top }
            : { left: refRight, top };

    return (
        <div
            ref={ref}
            className={`rp rp-${side}`}
            style={style}
            role="status"
        >
            <div ref={containerRef} className="rp-content rp-content--anim">
                {sections.map((c, i) => (
                    <div
                        key={`${c.title}-${i}`}
                        className={`rp-sec rp-sec--${c.variant}`}
                        data-idx={i}
                        style={{ display: i < visibleCount ? 'block' : 'none' }}
                    >
                        <div className="rp-head">{c.title}</div>
                        {c.items.map((t, j) => (<div key={j} className="rp-line">{t}</div>))}
                    </div>
                ))}
            </div>
        </div>
    );
};
