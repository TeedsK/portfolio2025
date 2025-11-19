// src/pages/landing/sections/Projects.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/Projects.css';
import gsap from 'gsap';

import SmartLinkedCode from '../visuals/projects/SmartLinkedCode';
import KudoToolsCode from '../visuals/projects/KudoToolsCode';
import HoloCleanCode from '../visuals/projects/HoloCleanCode';
import StackchanCode from '../visuals/projects/StackchanCode';
import InlineWordToggle from '../../../components/InlineWordToggle';

type ProjectKey = 'smartlinked' | 'kudotools' | 'holoclean' | 'stackchan';
type SeeMoreKind = 'media' | 'metrics' | 'github';

type SeeMoreItem = {
    kind: SeeMoreKind;
    label: string;
    description: string;
    href: string;
};

type ProjectDef = {
    key: ProjectKey;
    id: string;
    eyebrow: string;          // kept for completeness
    title: string;            // small name beside logo
    description: string;      // big headline text
    bullets?: string[];
    github?: string;          // surfaced via seeMore, not a button
    seeMore?: SeeMoreItem[];
    hero?: string;
    logo: string;
    tech: string[];
};

function renderWithBold(text: string): React.ReactNode {
    if (!text) return null;
    const parts: React.ReactNode[] = [];
    const re = /\*\*(.*?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push(text.slice(last, m.index));
        parts.push(<strong key={`b-${m.index}`}>{m[1]}</strong>);
        last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return <>{parts}</>;
}
const sanitizeDesc = (s: string) => s.replace(/[\u2013\u2014-]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const TECH_ICON_SRC: Record<string, string | undefined> = {
    Python: '/images/coding/python_icon.png',
    'Node.js': '/images/coding/node_icon.png',
    TypeScript: '/images/coding/typescript_icon.png',
    JavaScript: '/images/coding/javascript_icon.png',
    Java: '/images/coding/java_icon.png',
    TensorFlow: '/images/coding/tensorflow_icon.png',
    Firebase: '/images/coding/firebase_icon.png',
    Docker: '/images/coding/docker_icon.png',
    'Google Cloud': '/images/coding/google_cloud_icon.png',
    LangGraph: '/images/coding/langgraph_icon.png',
    Streamlit: '/images/coding/streamlit_icon.png',
    GitLab: '/images/coding/gitlab_icon.png',
    Confluence: '/images/coding/confluence_icon.png',
    Jira: '/images/coding/jira_icon.png',
    'C++': '/images/coding/cplusplus_icon.png',
    'C#': '/images/coding/csharp_icon.png',
    MySQL: '/images/coding/mysql_icon.png',
    HTML: '/images/coding/html_icon.png',
    CSS: '/images/coding/css_icon.png',
    Wix: '/images/coding/wix_icon.png',
    Celigo: '/images/coding/celigo_icon.png',
    React: '/images/coding/react_icon.png',
    Pandas: '/images/coding/pandas_icon.png',
};
const TECH_TINT: Record<string, string> = {
    Python: '#3776AB',
    'Node.js': '#539E43',
    TypeScript: '#3178C6',
    JavaScript: '#F4D03F',
    Java: '#E76F00',
    TensorFlow: '#FF6F00',
    Firebase: '#FFCA28',
    Docker: '#2496ED',
    'Google Cloud': '#4285F4',
    LangGraph: '#5c6a79',
    Streamlit: '#f05e5e',
    GitLab: '#de3a3a',
    Confluence: '#0052cc',
    Jira: '#0052cc',
    'C++': '#294275',
    'C#': '#6c06b4',
    MySQL: '#0075a3',
    HTML: '#e34c26',
    CSS: '#264de4',
    Wix: '#32424f',
    Celigo: '#007bff',
    React: '#61dafb',
    Pandas: '#150458',
};
const tint = (n: string) => TECH_TINT[n] ?? '#6366F1';

const PROJECTS: ProjectDef[] = [
    {
        key: 'smartlinked',
        id: 'smartlinked',
        eyebrow: 'Product • AI · React · Firebase',
        title: 'SmartLinked',
        description: 'AI that **rewrites** and **grades** LinkedIn profiles, built for growth.',
        bullets: ['Profile generator + evaluator', 'Full stack: React · Firebase · MySQL', 'Referral & charge model'],
        github: '#smartlinked-github',
        seeMore: [
            { kind: 'media', label: 'videos & pictures', description: 'see the design and functionality', href: '#smartlinked-media' },
            { kind: 'metrics', label: 'metrics', description: 'impact & adoption at a glance', href: '#smartlinked-metrics' },
            { kind: 'github', label: 'github', description: 'repository and source code', href: '#smartlinked-github' },
        ],
        hero: '/smartlinked_hero.png',
        logo: '/images/icons/smartLinkedLogo.svg',
        tech: ['TypeScript', 'React', 'Firebase', 'MySQL', 'Node.js'],
    },
    {
        key: 'kudotools',
        id: 'kudotools',
        eyebrow: 'Internal Toolkit • Node · React',
        title: 'Kudo Tools',
        description: 'Compact content ops toolkit with **fast macros**, plug‑ins, and guided flows.',
        bullets: ['Batch actions', 'Audit‑ready flows', 'Plug‑in architecture'],
        github: '#kudotools-github',
        seeMore: [
            { kind: 'media', label: 'videos & pictures', description: 'UI speed & flows', href: '#kudotools-media' },
            { kind: 'metrics', label: 'metrics', description: 'ops throughput & savings', href: '#kudotools-metrics' },
            { kind: 'github', label: 'github', description: 'repository and source code', href: '#kudotools-github' },
        ],
        hero: '/kudo_tools_hero.png',
        logo: '/images/icons/kudotools.png',
        tech: ['TypeScript', 'React', 'Node.js'],
    },
    {
        key: 'holoclean',
        id: 'holoclean',
        eyebrow: 'Research • Python · Pandas',
        title: 'HoloClean',
        description: 'Explainable data repair with **constraints**, **patterns**, and human‑in‑the‑loop review.',
        bullets: ['Constraint rules', 'Review UI', 'Repair metrics'],
        github: '#holoclean-github',
        seeMore: [
            { kind: 'media', label: 'videos & pictures', description: 'repair rationale demos', href: '#holoclean-media' },
            { kind: 'metrics', label: 'metrics', description: 'quality lift across datasets', href: '#holoclean-metrics' },
            { kind: 'github', label: 'github', description: 'repository and source code', href: '#holoclean-github' },
        ],
        hero: '/holoclean_hero.png',
        logo: '/images/icons/holoclean.png',
        tech: ['Python', 'Pandas'],
    },
    {
        key: 'stackchan',
        id: 'stackchan',
        eyebrow: 'Hardware • C++ / Microcontrollers',
        title: 'Stackchan',
        description: 'A tiny companion bot with **behaviors**, **speech**, and a playful animation runtime.',
        bullets: ['Event loop', 'LED/Audio runtime', 'Modular sensors'],
        github: '#stackchan-github',
        seeMore: [
            { kind: 'media', label: 'videos & pictures', description: 'expressivity & motion', href: '#stackchan-media' },
            { kind: 'metrics', label: 'metrics', description: 'runtime & responsiveness', href: '#stackchan-metrics' },
            { kind: 'github', label: 'github', description: 'repository and source code', href: '#stackchan-github' },
        ],
        hero: '/stackchan_hero.png',
        logo: '/images/icons/stackchan.png',
        tech: ['C++', 'Python'],
    },
];

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
            const overlap = Math.max(0, Math.min(r.bottom, bandBottom) - Math.max(r.top, bandTop));
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

        compute();
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
    const itemRefs = useMemo(() => PROJECTS.map(() => React.createRef<HTMLElement>()), []);
    const activeIndex = useMostCentered(itemRefs);
    const activeKey = PROJECTS[activeIndex]?.key ?? 'smartlinked';

    useEffect(() => {
        let raf: number | null = null;
        const onScroll = () => {
            if (raf != null) return;
            raf = requestAnimationFrame(() => {
                document.documentElement.style.setProperty('--projects-dash-offset', `${window.scrollY}px`);
                raf = null;
            });
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    /** ---- Tech stack overflow detection & toggle expand/collapse ---- */
    const techRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [techOverflow, setTechOverflow] = useState<Record<string, boolean>>({});
    const [expandedTech, setExpandedTech] = useState<Record<string, boolean>>({});

    const setTechRef = (id: string) => (el: HTMLDivElement | null) => {
        if (el) techRefs.current[id] = el;
        else delete techRefs.current[id];
    };

    useEffect(() => {
        const measure = () => {
            const next: Record<string, boolean> = {};
            Object.entries(techRefs.current).forEach(([id, el]) => {
                if (!el) return;
                const chips = Array.from(el.querySelectorAll('.tech-chip')) as HTMLElement[];
                if (!chips.length) return;
                const firstTop = chips[0].offsetTop;
                let rowH = 0;
                for (const ch of chips) {
                    if (ch.offsetTop === firstTop) rowH = Math.max(rowH, ch.getBoundingClientRect().height);
                }
                if (!rowH) rowH = chips[0].getBoundingClientRect().height || 28;
                (el as HTMLElement).style.setProperty('--tech-collapsed-h', `${Math.ceil(rowH)}px`);
                const overflow = el.scrollHeight > rowH + 2;
                next[id] = overflow;
                if (!overflow) {
                    (el as HTMLElement).style.maxHeight = 'none';
                }
            });
            setTechOverflow(next);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const expandTech = (id: string) => {
        const el = techRefs.current[id];
        if (!el) return;
        const cs = getComputedStyle(el);
        const collapsedH = parseFloat(cs.getPropertyValue('--tech-collapsed-h')) || el.getBoundingClientRect().height;
        const targetH = el.scrollHeight;

        gsap.fromTo(
            el,
            { maxHeight: collapsedH },
            {
                maxHeight: targetH,
                duration: 0.35,
                ease: 'power2.out',
                onStart: () => (el as HTMLElement).classList.remove('is-collapsed'),
                onComplete: () => {
                    (el as HTMLElement).classList.add('is-expanded');
                    (el as HTMLElement).style.maxHeight = 'none';
                    setExpandedTech((s) => ({ ...s, [id]: true }));
                },
            }
        );

        // cascade-in extra chips
        const chips = Array.from(el.querySelectorAll('.tech-chip')) as HTMLElement[];
        const firstTop = chips[0]?.offsetTop ?? 0;
        const extra = chips.filter((ch) => ch.offsetTop > firstTop);
        gsap.fromTo(extra, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.03, ease: 'power2.out', delay: 0.1 });
    };

    const collapseTech = (id: string) => {
        const el = techRefs.current[id];
        if (!el) return;
        const cs = getComputedStyle(el);
        const collapsedH = parseFloat(cs.getPropertyValue('--tech-collapsed-h')) || 32;
        const currentH = el.scrollHeight;

        gsap.fromTo(
            el,
            { maxHeight: currentH },
            {
                maxHeight: collapsedH,
                duration: 0.35,
                ease: 'power2.inOut',
                onStart: () => (el as HTMLElement).classList.remove('is-expanded'),
                onComplete: () => {
                    (el as HTMLElement).classList.add('is-collapsed');
                    (el as HTMLElement).style.maxHeight = `${collapsedH}px`;
                    setExpandedTech((s) => ({ ...s, [id]: false }));
                },
            }
        );
    };

    const toggleTech = (id: string) => (expandedTech[id] ? collapseTech(id) : expandTech(id));

    return (
        <section id="projects" className="projects-section" aria-labelledby="projects-title">
            <div className="projects-inner">
                {/* Left: write-ups */}
                <div className="projects-left">
                    <div className="column-guides" aria-hidden="true">
                        <span className="guide guide-center dash-line" />
                        <span className="guide guide-right dash-line" />
                    </div>

                    <div className="project-list" aria-live="polite">
                        {PROJECTS.map((p, i) => (
                            <article key={p.key} ref={itemRefs[i]} className="project-block" aria-labelledby={p.id}>
                                <div className="project-copy">
                                    <div className="project-meta">
                                        {p.logo && <img className="project-logo" src={p.logo} alt={`${p.title} logo`} loading="lazy" />}
                                        <div className="project-name">{p.title}</div>
                                    </div>

                                    <h3 id={p.id} className="project-title sr-only">{p.title}</h3>

                                    <p className="project-desc spaced">{renderWithBold(sanitizeDesc(p.description))}</p>

                                    {p.bullets && (
                                        <ul className="project-bullets spaced">
                                            {p.bullets.map((b, idx) => <li key={idx}>{renderWithBold(b)}</li>)}
                                        </ul>
                                    )}

                                    <div className="project-actions spaced">
                                        {p.seeMore && p.seeMore.length > 0 && (
                                            <div className="see-more spaced">
                                                <div className="see-more-title">See more</div>
                                                <ul className="see-more-list">
                                                    {p.seeMore.map((s) => (
                                                        <li key={`${p.id}-${s.kind}`} className={`see-more-item see-more-${s.kind}`}>
                                                            <span className="see-more-line">
                                                                <a href={s.href} className="see-more-anchor" role="button">{s.label}</a>
                                                                <span className="see-more-sep">: </span>
                                                                <span className="see-more-desc">{s.description}</span>
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Tech stack + animated inline toggle */}
                                        {p.tech?.length ? (
                                            <>
                                                <div
                                                    ref={setTechRef(p.id)}
                                                    className={`project-tech ${expandedTech[p.id] ? 'is-expanded' : techOverflow[p.id] ? 'is-collapsed' : ''} spaced`}
                                                >
                                                    {p.tech.map((t) => {
                                                        const icon = TECH_ICON_SRC[t];
                                                        const c = tint(t);
                                                        return (
                                                            <span
                                                                key={t}
                                                                className="tech-chip"
                                                                title={t}
                                                                style={{ backgroundColor: `${c}18`, borderColor: `${c}55`, color: c }}
                                                            >
                                                                {icon && <img src={icon} alt="" aria-hidden className="tech-chip__icon" />}
                                                                <span className="tech-chip__label">{t}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>

                                                {techOverflow[p.id] && (
                                                    <InlineWordToggle
                                                        className="view-all-tech spaced"
                                                        expanded={!!expandedTech[p.id]}
                                                        onToggle={() => toggleTech(p.id)}
                                                    />
                                                )}
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>

                {/* Right: sticky animation pane */}
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
