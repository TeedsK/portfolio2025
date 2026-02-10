import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './HoloPopups.css';

export type PopupType =
    | 'db'
    | 'schemaMessy'
    | 'psqlTables'
    | 'ingestHospitals'
    | 'detectors'
    | 'pruning'
    | 'compiler'
    | 'inference';

export type BeltItem = {
    id: string;
    type: PopupType;
    lifetimeMs: number;
};

/** Public belt component: lays out popups left→right, animates appear/disappear, and slides remaining items left on removal. */
export const PopupBelt: React.FC<{
    items: BeltItem[];
    onClose: (id: string) => void;
}> = ({ items, onClose }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const elRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const timersRef = useRef<Record<string, number>>({});

    const ITEM_W = 300; // px (fixed width to make slot math crisp)
    const GAP = 12;     // px

    // Assign refs
    const setItemRef = (id: string) => (el: HTMLDivElement | null) => {
        elRefs.current[id] = el;
    };

    // Layout/positioning & "appear" for newly mounted items
    useLayoutEffect(() => {
        const xFor = (idx: number) => idx * (ITEM_W + GAP);

        // For each item, compute its target x and either set (new) or tween (existing)
        items.forEach((it, idx) => {
            const el = elRefs.current[it.id];
            if (!el) return;
            const targetX = xFor(idx);

            // New item if we never tracked x before
            const prevX = Number(el.dataset.x ?? 'NaN');
            if (Number.isNaN(prevX)) {
                // Place at target x and pop in (scale 0->1, opacity 0->1)
                gsap.set(el, { x: targetX, transformOrigin: '50% 50%' });
                gsap.fromTo(
                    el,
                    { opacity: 0, scale: 0 },
                    { opacity: 1, scale: 1, duration: 0.28, ease: 'power2.out' },
                );
            } else if (prevX !== targetX) {
                // Slide to the new slot
                gsap.to(el, { x: targetX, duration: 0.32, ease: 'power2.inOut' });
            }
            el.dataset.x = String(targetX);
        });

        // Start timers for newly seen items; clear timers for removed ones
        items.forEach((it) => {
            if (!timersRef.current[it.id]) {
                timersRef.current[it.id] = window.setTimeout(() => {
                    const el = elRefs.current[it.id];
                    if (el) {
                        gsap.to(el, {
                            opacity: 0,
                            scale: 0,
                            duration: 0.24,
                            ease: 'power2.in',
                            onComplete: () => onClose(it.id),
                        });
                    } else {
                        onClose(it.id);
                    }
                    delete timersRef.current[it.id];
                }, it.lifetimeMs);
            }
        });

        Object.keys(timersRef.current).forEach((id) => {
            if (!items.find((it) => it.id === id)) {
                window.clearTimeout(timersRef.current[id]);
                delete timersRef.current[id];
            }
        });
    }, [items, onClose]);

    return (
        <div className="holo-belt">
            <div ref={trackRef} className="holo-belt-track">
                {items.map((it) => (
                    <div
                        key={it.id}
                        ref={setItemRef(it.id)}
                        className="holo-belt-item"
                        style={{ width: 'var(--pop-w, 300px)' }}
                    >
                        {renderPopupContent(it.type)}
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Content renderers (same visual pop-ups you approved earlier) */
function renderPopupContent(type: PopupType): React.ReactNode {
    switch (type) {
        case 'db':
            return (
                <div className="holo-pop holo-pop--terminal">
                    <div className="holo-pop-head">
                        <span className="dot red" />
                        <span className="dot yellow" />
                        <span className="dot green" />
                        <span className="title">holoclean database</span>
                    </div>
                    <div className="holo-pop-body">
                        <div className="mini-line"><span className="ok">✔</span> Holoclean database <span className="ok">initialized</span></div>
                        <div className="mini-line">listening on <span className="key">0.0.0.0</span>:<span className="num">5432</span>/tcp</div>
                    </div>
                </div>
            );

        case 'schemaMessy':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Raw rows (unsorted, no headers)</div>
                    <div className="holo-pop-body">
                        <table className="pop-table pop-table--plain">
                            <tbody>
                                <tr><td>UT-993</td><td>General</td><td>NA</td><td>SaltLake 8410X</td></tr>
                                <tr><td>—</td><td>St. Mara Hosp</td><td>??</td><td>Denver 80014</td></tr>
                                <tr><td>City=Boise</td><td>Hspitl A</td><td>100</td><td>—</td></tr>
                                <tr><td>id: 12</td><td>NYC</td><td>Acute</td><td>10002</td></tr>
                                <tr><td>LA-??</td><td>Memrl</td><td>350+</td><td>CA</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );

        case 'psqlTables':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Tables (psql \\dt)</div>
                    <div className="holo-pop-body">
                        <table className="pop-table">
                            <thead>
                                <tr><th>Schema</th><th>Name</th><th>Type</th><th>Owner</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>public</td><td className="key">hospital_contacts</td><td>table</td><td>holoclean_user</td></tr>
                                <tr><td>public</td><td className="key">hospital_diagnoses</td><td>table</td><td>holoclean_user</td></tr>
                                <tr><td>public</td><td className="key">hospital_visits</td><td>table</td><td>holoclean_user</td></tr>
                                <tr><td>public</td><td className="key">hospitals</td><td>table</td><td>holoclean_user</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );

        case 'ingestHospitals':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">hospitals (sample)</div>
                    <div className="holo-pop-body">
                        <table className="pop-table">
                            <thead>
                                <tr><th>id</th><th>name</th><th>city</th><th>beds</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>101</td><td>Valley General</td><td>Salt Lake City</td><td>220</td></tr>
                                <tr><td>102</td><td>St. Mary Medical</td><td>Denver</td><td>180</td></tr>
                                <tr><td>103</td><td>Boise Regional</td><td>Boise</td><td>140</td></tr>
                            </tbody>
                        </table>
                        <div className="mini-foot"><span className="num">+100</span> rows inserted</div>
                    </div>
                </div>
            );

        case 'detectors':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Detectors (flagged cells)</div>
                    <div className="holo-pop-body">
                        <table className="pop-table">
                            <thead>
                                <tr><th>row_id</th><th>column</th><th>value</th><th>issue</th></tr>
                            </thead>
                            <tbody>
                                <tr><td>42</td><td>zipcode</td><td>84O10</td><td className="warn">letter‑O instead of zero</td></tr>
                                <tr className="error"><td>77</td><td>beds</td><td>-12</td><td>impossible (negative)</td></tr>
                                <tr><td>81</td><td>city</td><td>—</td><td className="warn">missing</td></tr>
                                <tr className="error"><td>96</td><td>state</td><td>Utha</td><td>typo (candidate: <span className="key">Utah</span>)</td></tr>
                            </tbody>
                        </table>
                        <div className="mini-foot">Flagged <span className="num">324</span> issues across <span className="num">12</span> columns</div>
                    </div>
                </div>
            );

        case 'pruning':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Domain pruning</div>
                    <div className="holo-pop-body">
                        <div className="section-title">Filtering unlikely values</div>
                        <ul className="plain">
                            <li className="pruned">Hspitl</li>
                            <li className="pruned">Hosp.</li>
                            <li>Hospital</li>
                        </ul>
                        <div className="section-title">Ranking likely candidates</div>
                        <table className="pop-table">
                            <thead><tr><th>value</th><th>score</th></tr></thead>
                            <tbody>
                                <tr><td>Hospital</td><td><div className="bar"><span style={{ width: '94%' }} /></div></td></tr>
                                <tr><td>Hosp.</td><td><div className="bar"><span style={{ width: '38%' }} /></div></td></tr>
                                <tr><td>Hspitl</td><td><div className="bar"><span style={{ width: '12%' }} /></div></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );

        case 'compiler':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Feature matrix</div>
                    <div className="holo-pop-body">
                        <div className="metric">
                            <div className="metric-value">1,237,211</div>
                            <div className="metric-label">non‑zero features</div>
                        </div>
                    </div>
                </div>
            );

        case 'inference':
            return (
                <div className="holo-pop">
                    <div className="holo-pop-title">Training (train_predict)</div>
                    <div className="holo-pop-body">
                        <EpochsAnimated />
                    </div>
                </div>
            );

        default:
            return null;
    }
}

/** Animated epochs mini-view shown inside the inference popup */
const EpochsAnimated: React.FC = () => {
    const refEpoch = useRef<HTMLSpanElement>(null);
    const refLoss = useRef<HTMLSpanElement>(null);
    const refAuc = useRef<HTMLSpanElement>(null);
    const refSaves = useRef<HTMLDivElement>(null);

    const seq = [
        { e: 1, loss: 0.6924, auc: 0.71 },
        { e: 5, loss: 0.5310, auc: 0.86 },
        { e: 10, loss: 0.4173, auc: 0.90 },
        { e: 15, loss: 0.3542, auc: 0.92 },
        { e: 20, loss: 0.3117, auc: 0.94 },
        { e: 25, loss: 0.2846, auc: 0.95 },
    ];

    useEffect(() => {
        let i = 0;
        const id = window.setInterval(() => {
            const s = seq[Math.min(i, seq.length - 1)];
            if (refEpoch.current) refEpoch.current.textContent = `${s.e}`;
            if (refLoss.current) refLoss.current.textContent = s.loss.toFixed(4);
            if (refAuc.current) refAuc.current.textContent = s.auc.toFixed(2);
            i += 1;
            if (i >= seq.length + 1) {
                window.clearInterval(id);
                if (refSaves.current) {
                    gsap.fromTo(
                        refSaves.current,
                        { opacity: 0, y: 4 },
                        { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' },
                    );
                }
            }
        }, 450);

        return () => window.clearInterval(id);
    }, []);

    return (
        <>
            <div className="kv">
                <div><span className="k">epoch</span> <span ref={refEpoch} className="num">1</span><span className="muted">/25</span></div>
                <div><span className="k">loss</span> <span ref={refLoss} className="num">0.6924</span></div>
                <div><span className="k">val_auc</span> <span ref={refAuc} className="num">0.71</span></div>
            </div>
            <div ref={refSaves} className="save-lines" style={{ opacity: 0 }}>
                <div className="ok">Saved model → <span className="file">trained_model_100.pth</span></div>
                <div className="ok">Saved builder → <span className="file">builder_state_100.pkl</span></div>
                <div className="ok">Predictions → <span className="file">marginals_100_rows.pkl</span></div>
            </div>
        </>
    );
};
