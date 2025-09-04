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

const SAMPLE_ROWS: Row[] = [
    { id: 101, name: 'Valley General', city: 'Salt Lake City', state: 'Utah', zipcode: '84010', beds: 220 },
    { id: 102, name: 'St. Mary Medical', city: 'Denver', state: 'CO', zipcode: '80014', beds: 180 },
    { id: 103, name: 'Boise Regional', city: 'Boise', state: 'ID', zipcode: '83702', beds: 140 },
    // rows with issues
    { id: 104, name: 'Wasatch Health', city: 'Salt Lake', state: 'Utha', zipcode: '84O10', beds: 200 }, // O vs 0; state typo
    { id: 105, name: 'Canyon Clinic', city: '', state: 'UT', zipcode: '84101', beds: -12 }, // missing city; negative beds
];

const DETECTED_FLAGS: Flag[] = [
    { rowId: 104, col: 'state', issue: 'state typo → Utah', severity: 'error' },
    { rowId: 104, col: 'zipcode', issue: 'zipcode: letter “O” as 0', severity: 'warn' },
    { rowId: 105, col: 'city', issue: 'city missing', severity: 'warn' },
    { rowId: 105, col: 'beds', issue: 'beds negative', severity: 'error' },
];

const PRUNED_SUGGESTIONS: readonly Suggestion[] = [
    { rowId: 104, col: 'state', value: 'Utah', prob: 0.96 },
    { rowId: 104, col: 'zipcode', value: '84010', prob: 0.92 },
    { rowId: 105, col: 'city', value: 'Salt Lake City', prob: 0.78 },
    { rowId: 105, col: 'beds', value: 120, prob: 0.88 },
];

const FEATURE_COUNT = 1237211;
const EVAL_SUMMARY = { precision: 0.93, recall: 0.91, f1: 0.92 };

const cellKey = (rowId: number, col: CellKey) => `${rowId}:${col}`;

const HoloDataset: React.FC<{ phase: Phase }> = ({ phase }) => {
    const [rows, setRows] = useState<Row[]>([]);
    const [flags, setFlags] = useState<Flag[]>([]);
    const [fixes, setFixes] = useState<Fix[]>([]);
    const [showFeatures, setShowFeatures] = useState(false);
    const [showEval, setShowEval] = useState(false);

    // Popover stage for rows with problems
    const [popoverStage, setPopoverStage] = useState<PopoverStage>('hidden');

    // layout refs
    const wrapRef = useRef<HTMLDivElement>(null);          // scroll container
    const tableRef = useRef<HTMLTableElement>(null);       // table
    const panelRef = useRef<HTMLElement>(null);            // dataset panel
    const overlayRef = useRef<HTMLDivElement>(null);       // popover overlay (sibling to wrap)

    // Which rows have problems
    const problemRowIds = useMemo(
        () => Array.from(new Set(DETECTED_FLAGS.map(f => f.rowId))),
        []
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

            // Use the *cell inner* boxes so we ignore vertical spacing added by border-spacing.
            const firstInner = tr.querySelector('td:first-child .cell-inner') as HTMLElement | null;
            const lastInner = tr.querySelector('td:last-child .cell-inner') as HTMLElement | null;

            // Fallbacks: td rects, then tr rect (worst case)
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
                midY: (baseRect.top + baseRect.height / 2) - ov.top, // vertical center of the *cell*, not the row gap
            };
        });
        setRowPositions(res);
    };

    // Keep anchors in sync with scrolling, resizing, content morphs, and after initial layout
    useEffect(() => {
        measurePositions();
        const sc = wrapRef.current;
        const onScroll = () => measurePositions();
        const onResize = () => measurePositions();
        sc?.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize, { passive: true });

        const ro = new ResizeObserver(() => measurePositions());
        if (panelRef.current) ro.observe(panelRef.current);

        // font/layout settling pass
        const settle1 = window.setTimeout(measurePositions, 100);
        const settle2 = window.setTimeout(measurePositions, 250);

        return () => {
            sc?.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            ro.disconnect();
            clearTimeout(settle1);
            clearTimeout(settle2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, flags, fixes]);

    // Also re-measure when popover content switches stage (Issues → Predictions → Fixed)
    useEffect(() => {
        requestAnimationFrame(() => requestAnimationFrame(measurePositions));
    }, [popoverStage]);

    // Derived lookups
    const flaggedMap = useMemo(() => {
        const m = new Map<string, Flag>();
        flags.forEach((f) => m.set(cellKey(f.rowId, f.col), f));
        return m;
    }, [flags]);

    const fixedMap = useMemo(() => {
        const m = new Map<string, Fix>();
        fixes.forEach((f) => m.set(cellKey(f.rowId, f.col), f));
        return m;
    }, [fixes]);

    // Phase logic
    useEffect(() => {
        if (phase === 'idle') {
            setRows([]);
            setFlags([]);
            setFixes([]);
            setShowFeatures(false);
            setShowEval(false);
            setPopoverStage('hidden');
            return;
        }

        if (phase === 'ingested') {
            setRows(SAMPLE_ROWS);
            setPopoverStage('hidden');
            requestAnimationFrame(() => {
                const rowEls = tableRef.current?.querySelectorAll('tbody tr');
                if (!rowEls) return;
                gsap.fromTo(
                    rowEls,
                    { opacity: 0, y: 8, scale: 0.98 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: 'power2.out', stagger: 0.06 }
                );
            });
            return;
        }

        if (phase === 'detected') {
            setFlags(DETECTED_FLAGS);
            setPopoverStage('issues');

            requestAnimationFrame(() => {
                DETECTED_FLAGS.forEach((f, i) => {
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
            return;
        }

        if (phase === 'pruned') {
            setPopoverStage('suggestions');
            return;
        }

        if (phase === 'compiled') {
            setShowFeatures(true);
            const badge = document.querySelector('.feature-badge');
            if (badge) {
                gsap.fromTo(badge, { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' });
            }
            return;
        }

        if (phase === 'inferred') {
            PRUNED_SUGGESTIONS.forEach((s) => {
                setRows((prev) =>
                    prev.map((r) => (r.id === s.rowId ? { ...r, [s.col]: s.value as any } : r))
                );
            });
            setFixes(PRUNED_SUGGESTIONS as Fix[]);
            setFlags([]);
            setPopoverStage('fixed');

            requestAnimationFrame(() => {
                PRUNED_SUGGESTIONS.forEach((s, i) => {
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
            return;
        }

        if (phase === 'evaluated') {
            setShowEval(true);
            const panel = document.querySelector('.dataset-eval');
            if (panel) {
                gsap.fromTo(panel, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
            }
        }
    }, [phase]);

    // Headers & stats
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

    const rowCount = rows.length;
    const flaggedCount = flags.length;
    const fixedCount = fixes.length;

    const isFlagged = (r: Row, col: CellKey) => flaggedMap.has(cellKey(r.id, col));
    const isFixed = (r: Row, col: CellKey) => fixedMap.has(cellKey(r.id, col));
    const sevClass = (r: Row, col: CellKey) => {
        const f = flaggedMap.get(cellKey(r.id, col));
        return f?.severity === 'error' ? 'sev-error' : f ? 'sev-warn' : '';
    };

    /** Build the three potential sections (Issues → Predictions → Corrected) per row. */
    type RowSection = { title: string; variant: 'warn' | 'error' | 'info' | 'ok'; items: string[] };
    const sectionsForRow = (rid: number): RowSection[] => {
        const rowFlags = DETECTED_FLAGS.filter(f => f.rowId === rid);
        if (!rowFlags.length) return [];

        const issuesHasErr = rowFlags.some(f => f.severity === 'error');
        const issues: RowSection = {
            title: 'Issues',
            variant: issuesHasErr ? 'error' : 'warn',
            items: rowFlags.map(f => `• ${f.issue}`),
        };

        const predsData = PRUNED_SUGGESTIONS.filter(s => s.rowId === rid);
        const preds: RowSection = {
            title: 'Predictions',
            variant: 'info',
            items: predsData.map(s => `• ${s.col} → ${s.value} (${Math.round(s.prob * 100)}%)`),
        };

        const fixedData = PRUNED_SUGGESTIONS.filter(s => s.rowId === rid);
        const fixed: RowSection = {
            title: 'Corrected',
            variant: 'ok',
            items: fixedData.map(s => `• ${s.col} = ${s.value} (${Math.round(s.prob * 100)}%)`),
        };

        return [issues, preds, fixed];
    };

    /** Visible section count by stage (1=Issues, 2=+Predictions, 3=+Corrected). */
    const visibleCountByStage = (st: PopoverStage) =>
        st === 'issues' ? 1 : st === 'suggestions' ? 2 : st === 'fixed' ? 3 : 0;

    return (
        <section ref={panelRef} className="dataset-panel unbounded" aria-label="Dataset live view">
            <header className="dataset-head">
                <div className="dataset-title">hospital records</div>
                <div className="dataset-stats">
                    <span className="stat">rows <span className="num">{rowCount || '—'}</span></span>
                    <span className="stat">flagged <span className="num">{flaggedCount}</span></span>
                    <span className="stat">fixed <span className="num">{fixedCount}</span></span>
                    {showFeatures && (
                        <span className="feature-badge">{FEATURE_COUNT.toLocaleString()} features</span>
                    )}
                </div>
            </header>

            {/* Scrollable table */}
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

                {showEval && (
                    <div className="dataset-eval" role="note" aria-label="Evaluation summary">
                        <div>evaluation</div>
                        <div className="kv">
                            <div><span className="k">precision</span> <span className="num">{EVAL_SUMMARY.precision.toFixed(2)}</span></div>
                            <div><span className="k">recall</span> <span className="num">{EVAL_SUMMARY.recall.toFixed(2)}</span></div>
                            <div><span className="k">f1</span> <span className="num">{EVAL_SUMMARY.f1.toFixed(2)}</span></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Row popovers overlay — sibling to scroller so it never clips */}
            <div ref={overlayRef} className="row-popovers" aria-hidden>
                {problemRowIds.map((rid) => {
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
                            visibleCount={visibleCountByStage(popoverStage)}
                        />
                    );
                })}
            </div>
        </section>
    );
};

// Keep this component isolated from parent re-renders (typing in terminal).
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

    // Animate expansion when visibleCount increases (Issues → +Predictions → +Corrected)
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
            className={`rp rp-${side}`}  // neutral root; per-section colors inside
            style={style}
            role="status"
        >
            <div ref={containerRef} className="rp-content rp-content--anim">
                {sections.map((sec, i) => (
                    <div
                        key={`${sec.title}-${i}`}
                        className={`rp-sec rp-sec--${sec.variant}`}
                        data-idx={i}
                        style={{ display: i < visibleCount ? 'block' : 'none' }}
                    >
                        <div className="rp-head">{sec.title}</div>
                        {sec.items.map((t, j) => (<div key={j} className="rp-line">{t}</div>))}
                    </div>
                ))}
            </div>
        </div>
    );
};
