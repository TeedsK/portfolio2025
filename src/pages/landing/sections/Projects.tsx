// src/pages/landing/sections/Projects.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/Projects.css';

import SmartLinkedCode from '../visuals/projects/SmartLinkedCode';
import KudoToolsCode from '../visuals/projects/KudoToolsCode';
import HoloCleanCode from '../visuals/projects/HoloCleanCode';
import StackchanCode from '../visuals/projects/StackchanCode';

type ProjectKey = 'smartlinked' | 'kudotools' | 'holoclean' | 'stackchan';

type ProjectDef = {
    key: ProjectKey;
    id: string;           // anchor id for the header
    eyebrow: string;      // small pill/category
    title: string;
    description: string;
    bullets?: string[];
    cta?: { href: string; label: string }[];
    hero?: string;        // optional small image on the left copy
};

const PROJECTS: ProjectDef[] = [
    {
        key: 'smartlinked',
        id: 'smartlinked',
        eyebrow: 'Product • AI + React + Firebase',
        title: 'SmartLinked',
        description:
            'AI-enhanced LinkedIn tooling that evaluates, rewrites, and reasons about profile content. Built with React, Firebase Functions, MySQL metrics, and OpenAI integrations.',
        bullets: [
            'Section-by-section grading with rationale',
            'Keyword and value-prop optimization',
            'Charge system (standard / pro) with resets + referral packs',
        ],
        cta: [
            { href: '#smartlinked', label: 'View details' },
        ],
        hero: '/smartlinked_hero.png',
    },
    {
        key: 'kudotools',
        id: 'kudotools',
        eyebrow: 'Internal Toolkit • Node + React',
        title: 'Kudo Tools',
        description:
            'A suite of internal utilities for content operations and growth workflows. Fast, pragmatic UI with opinionated helpers to unblock teams.',
        bullets: [
            'Task macros and batch actions',
            'Permission-aware flows with audit history',
            'Plug-in architecture for new tools',
        ],
        cta: [{ href: '#kudotools', label: 'View details' }],
        hero: '/kudo_tools_hero.png',
    },
    {
        key: 'holoclean',
        id: 'holoclean',
        eyebrow: 'Research • Python + Pandas',
        title: 'HoloClean',
        description:
            'Data quality tooling for detecting and repairing messy, real-world datasets. Focus on explainable “fixes” rather than black-box magic.',
        bullets: [
            'Constraint & pattern-based cleaning',
            'Human-in-the-loop review UI',
            'Metrics that quantify data repair impact',
        ],
        cta: [{ href: '#holoclean', label: 'View details' }],
        hero: '/holoclean_hero.png',
    },
    {
        key: 'stackchan',
        id: 'stackchan',
        eyebrow: 'Hardware • C++ / Microcontrollers',
        title: 'Stackchan',
        description:
            'A small companion bot that reacts, speaks, and animates—bridging code with personality. I/O drivers, behaviors, and a scripted animation runtime.',
        bullets: [
            'Event loop with queued behaviors',
            'Audio “mouth” / LED animation DSL',
            'Modular sensors + actions',
        ],
        cta: [{ href: '#stackchan', label: 'View details' }],
        hero: '/stackchan_hero.png',
    },
];

/**
 * Measures which left-side project block overlaps the "focus band" (the central
 * 60% of viewport height) the most. The winner drives the right-side animation.
 */
function useMostCentered(refs: React.RefObject<HTMLElement>[]) {
    const [activeIndex, setActiveIndex] = useState(0);
    const rafRef = useRef<number | null>(null);

    const compute = useCallback(() => {
        const vh = window.innerHeight;
        const bandTop = vh * 0.2;
        const bandBottom = vh * 0.8;

        let best = 0;
        let bestIdx = 0;

        refs.forEach((ref, idx) => {
            const el = ref.current;
            if (!el) return;
            const r = el.getBoundingClientRect();

            const overlap =
                Math.max(0, Math.min(r.bottom, bandBottom) - Math.max(r.top, bandTop));

            if (overlap > best) {
                best = overlap;
                bestIdx = idx;
            }
        });

        setActiveIndex(bestIdx);
    }, [refs]);

    useEffect(() => {
        const onScroll = () => {
            if (rafRef.current != null) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                compute();
            });
        };

        compute(); // first paint
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', compute);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', compute);
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        };
    }, [compute]);

    return activeIndex;
}

const Projects: React.FC = () => {
    const itemRefs = useMemo(
        () => PROJECTS.map(() => React.createRef<HTMLElement>()),
        [],
    );

    const activeIndex = useMostCentered(itemRefs);
    const activeKey = PROJECTS[activeIndex]?.key ?? 'smartlinked';

    return (
        <section id="projects" className="projects-section" aria-labelledby="projects-title">
            <div className="projects-inner">
                {/* Left: write-ups */}
                <div className="projects-left">
                    {/* <header className="projects-header">
                        <span className="projects-eyebrow">Projects</span>
                        <h2 id="projects-title" className="projects-title">
                            Products & tools I’ve built.
                        </h2>
                        <p className="projects-subtitle">
                            Scroll the write‑ups on the left. The code panel on the right
                            reacts to whichever project is most centered in your viewport.
                        </p>
                    </header> */}

                    <div className="project-list" aria-live="polite">
                        {PROJECTS.map((p, i) => (
                            <article
                                key={p.key}
                                ref={itemRefs[i]}
                                className="project-block"
                                aria-labelledby={p.id}
                            >
                                <div className="project-copy">
                                    <div className="project-eyebrow">{p.eyebrow}</div>
                                    <h3 id={p.id} className="project-title">
                                        {p.title}
                                    </h3>
                                    <p className="project-desc">{p.description}</p>
                                    {p.bullets && (
                                        <ul className="project-bullets">
                                            {p.bullets.map((b, idx) => (
                                                <li key={idx}>{b}</li>
                                            ))}
                                        </ul>
                                    )}
                                    {p.cta && (
                                        <div className="project-ctas">
                                            {p.cta.map((c) => (
                                                <a key={c.label} href={c.href} className="project-cta">
                                                    {c.label}
                                                    <span aria-hidden> →</span>
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* {p.hero && (
                                    <div className="project-hero">
                                        <img loading="lazy" src={p.hero} alt="" />
                                    </div>
                                )} */}
                            </article>
                        ))}
                    </div>
                </div>

                {/* Right: sticky, animation pane (NO code-panel wrapper; overflow allowed) */}
                <div className="projects-right" aria-live="polite" aria-label="Project animation panel">
                    <div className="viz-switcher">
                        <div className={`viz-layer ${activeKey === 'smartlinked' ? 'is-active' : ''}`} data-viz="smartlinked">
                            <SmartLinkedCode play={activeKey === 'smartlinked'} />
                        </div>
                        <div className={`viz-layer ${activeKey === 'kudotools' ? 'is-active' : ''}`} data-viz="kudotools">
                            <KudoToolsCode play={activeKey === 'kudotools'} />
                        </div>
                        <div className={`viz-layer ${activeKey === 'holoclean' ? 'is-active' : ''}`} data-viz="holoclean">
                            <HoloCleanCode play={activeKey === 'holoclean'} />
                        </div>
                        <div className={`viz-layer ${activeKey === 'stackchan' ? 'is-active' : ''}`} data-viz="stackchan">
                            <StackchanCode play={activeKey === 'stackchan'} />
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default Projects;
