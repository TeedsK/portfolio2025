// src/pages/landing/sections/WorkExperience.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import styles from '../styles/WorkExperience.module.css';

gsap.registerPlugin(Flip);

/** Small helper to compose CSS Module classes */
const cx = (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' ');

/** ---------- Helpers ---------- */
const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getNumberPx = (v: string | null) => {
    if (!v) return 0;
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
};

/** Tech → icon (paths match your public/ tree) */
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
    'LangGraph': '/images/coding/langgraph_icon.png',
    'Streamlit': '/images/coding/streamlit_icon.png',
    'GitLab': '/images/coding/gitlab_icon.png',
    'Confluence': '/images/coding/confluence_icon.png',
    'Jira': '/images/coding/jira_icon.png',
    'C++': '/images/coding/cplusplus_icon.png',
    'C#': '/images/coding/csharp_icon.png',
    'MySQL': '/images/coding/mysql_icon.png',
    HTML: '/images/coding/html_icon.png',
    CSS: '/images/coding/css_icon.png',
    Wix: '/images/coding/wix_icon.png',
    Celigo: '/images/coding/celigo_icon.png',
    React: '/images/coding/react_icon.png',
};

/** Brand-ish tint for chips */
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
    'LangGraph': '#5c6a79',
    'Streamlit': '#f05e5e',
    'GitLab': '#de3a3a',
    'Confluence': '#0052cc',
    'Jira': '#0052cc',
    'C++': '#294275',
    'C#': '#6c06b4',
    'MySQL': '#0075a3',
    HTML: '#e34c26',
    CSS: '#264de4',
    Wix: '#32424f',
    Celigo: '#007bff',
    React: '#61dafb',
};
const tint = (name: string) => TECH_TINT[name] ?? '#6366F1';

/** ---------- Types & Data ---------- */
type ExperienceItem = {
    id: string;
    company: string;
    role: string;
    team: string;
    logoSrc: string;
    logoAlt: string;
    detailImage?: string; // expanded right-side image (falls back to logo)
    description: string[];
    tech: string[];
};

const EXPERIENCES: ExperienceItem[] = [
    {
        id: 'goldman-ml',
        company: 'Goldman Sachs',
        role: 'Machine Learning Engineer',
        team: 'Production Runtime Experience',
        logoSrc: '/images/work-experience/goldman_sachs.png',
        logoAlt: 'Goldman Sachs Logo',
        detailImage: '/images/work-experience/goldman/1.png',
        description: [
            'Built an agentic framework for deep analysis and discovery over a 20M-node / 135M-edge graph, unlocking novel insights and empowering business users',
            'Designed a LangGraph multi-agent architecture of 10+ agents and tools, integrating closely with existing services, enforcing state isolation and guardrails to reduce unnecessary content bloats and minimizing errors',
            'Compared and documented 6 different LLM models for each agent, recording run times, responses, and token costs across each representative task, culminating in a comprehensive model-selection rubric.'
        ],
        tech: ['Python', 'LangGraph', 'Streamlit', 'GitLab', 'Confluence'],
    },
    {
        id: 'goldman-se',
        company: 'Goldman Sachs',
        role: 'Software Engineer',
        team: 'Production Runtime Experience',
        logoSrc: '/images/work-experience/goldman_sachs.png',
        logoAlt: 'Goldman Sachs Logo',
        detailImage: '/images/work-experience/goldman/3.png',
        description: [
            'Designed and developed an internal web service using React and Java, which enabled firm-wide adoption from 19% to 100% by streamlining onboarding processes, reducing learning curves, and automating error prevention.',
            'Collaborated with a team of 19 across 5 time zones in daily stand-ups, using Jira to apply Agile methodologies, including sprint planning, task scheduling, and progress tracking, aiding project management and transparency.',
            'Created functional specification documents through stakeholder interviews, requirements analysis, and demo review sessions, resulting in reaching milestones faster, fewer revisions, and long-term maintainability in code.',
        ],
        tech: ['Java', 'React', 'GitLab', 'Jira', 'Confluence'],
    },
    {
        id: 'uofu',
        company: 'University of Utah',
        role: 'Computer Science Tutor',
        team: 'School of Computing',
        logoSrc: '/images/work-experience/university_of_utah.png',
        logoAlt: 'University of Utah Logo',
        detailImage: '/images/work-experience/tutor/1.png',
        description: [
            'Reinforced understanding of topics such as Software Practices and Algorithms for 10+ students daily.',
            'Tailored teaching methods to cater for a diverse student body, ensuring comprehension and fostering a learning environment at any level resulting in positive feedback for clear explanations and breakdown of complex topics.',
            'Received positive feedback from students for clarity of explanations and breaking down complex topics.'
        ],
        tech: ['Python', 'Java', 'C++', 'C#', 'MySQL'],
    },
    {
        id: 'rodina',
        company: 'Rodina Consulting',
        role: 'Middleware Software Engineer',
        team: 'Invoice Platforms',
        logoSrc: '/images/work-experience/rodina_consulting.png',
        logoAlt: 'Rodina Consulting Logo',
        description: [
            'Automated billing system integration via the Celigo platform, fulfilling the workload equivalent of 3 employees.',
            'Led a feasibility study on customizing Wix website templates, resulting in significant SEO enhancements and increased web traffic.'
        ],
        tech: ['JavaScript', 'HTML', 'CSS', 'Wix', 'Celigo'],
    },
    {
        id: 'tippett',
        company: 'Tippett Studios',
        role: 'Pipeline Developer (Intern)',
        team: 'VFX Production',
        logoSrc: '/images/work-experience/tippett_studios.png',
        logoAlt: 'Tippett Studios Logo',
        detailImage: '/images/work-experience/tippett/1.png',
        description: [
            'Automated asset checks and dailies packaging via Python tools.',
            'Built small utilities to smooth artist handoffs and renders.',
            'Contributed to pipeline docs and onboarding recipes.',
        ],
        tech: ['Python', 'JavaScript', 'Docker'],
    },
];

/** ---------- Header art (auto-sizes to text block height) ---------- */
const HeaderArt: React.FC<{ textRef: React.RefObject<HTMLDivElement> }> = ({ textRef }) => {
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const target = textRef.current;
        const img = imgRef.current;
        if (!target || !img) return;

        const reduce = prefersReducedMotion();
        const resize = () => {
            const h = Math.max(40, Math.round(target.getBoundingClientRect().height));
            gsap.to(img, {
                width: h,
                height: h,
                duration: reduce ? 0 : 0.25,
                ease: 'power2.out',
            });
        };

        const ro = new ResizeObserver(resize);
        ro.observe(target);
        window.addEventListener('resize', resize);
        resize();

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', resize);
        };
    }, [textRef]);

    return (
        <img
            ref={imgRef}
            src="/images/work-experience/header.png"
            alt=""
            aria-hidden
            className={styles['work-header-art']}
        />
    );
};

/** Compute the target scrollLeft so a given card is centered if possible. */
function computeCenteredScrollLeft(
    viewportEl: HTMLElement,
    cardEl: HTMLElement,
    targetCardWidth?: number
) {
    const viewportWidth = viewportEl.clientWidth;
    const padLeft = parseFloat(getComputedStyle(viewportEl).paddingLeft || '0') || 0;
    const cardLeftInRail = (cardEl as HTMLElement).offsetLeft; // relative to the rail
    const cardWidth = targetCardWidth ?? cardEl.getBoundingClientRect().width;

    const cardLeftInScrollSpace = padLeft + cardLeftInRail;
    let desired = cardLeftInScrollSpace - (viewportWidth - cardWidth) / 2;
    const maxScroll = Math.max(0, viewportEl.scrollWidth - viewportWidth);
    if (desired < 0) desired = 0;
    if (desired > maxScroll) desired = maxScroll;
    return desired;
}

/** ---------- Work Card ---------- */
type WorkCardProps = {
    item: ExperienceItem;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    viewportRef: React.RefObject<HTMLDivElement>;
    reportCardRef: (id: string, el: HTMLDivElement | null) => void;
};

const WorkCard: React.FC<WorkCardProps> = ({
    item,
    isExpanded,
    onToggle,
    viewportRef,
    reportCardRef,
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const descWrapRef = useRef<HTMLDivElement>(null);
    const descUlRef = useRef<HTMLUListElement>(null);
    const fadeRef = useRef<HTMLDivElement>(null);
    const descColRef = useRef<HTMLDivElement>(null);
    const mediaColRef = useRef<HTMLDivElement>(null);
    const titlesRef = useRef<HTMLDivElement>(null);
    const logoRef = useRef<HTMLImageElement>(null);
    const rtGridRef = useRef<HTMLDivElement>(null);
    const chipsRef = useRef<HTMLDivElement>(null);

    const collapsedWidthRef = useRef<number | null>(null);
    const tlRef = useRef<gsap.core.Timeline | null>(null);

    const [hasOverflow, setHasOverflow] = useState(false);

    useEffect(() => {
        reportCardRef(item.id, cardRef.current);
        return () => reportCardRef(item.id, null);
    }, [item.id, reportCardRef]);

    useLayoutEffect(() => {
        if (cardRef.current && collapsedWidthRef.current == null) {
            collapsedWidthRef.current = cardRef.current.getBoundingClientRect().width;
        }
    }, []);

    // Measure whether description overflows when collapsed
    useEffect(() => {
        const wrap = descWrapRef.current;
        if (!wrap) return;

        const check = () => {
            if (!wrap) return;
            if (isExpanded) {
                setHasOverflow(false);
            } else {
                const overflow = wrap.scrollHeight > wrap.clientHeight + 1;
                setHasOverflow(overflow);
            }
        };

        const ro = new ResizeObserver(check);
        ro.observe(wrap);
        window.addEventListener('resize', check);
        check();
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', check);
        };
    }, [isExpanded]);

    // Auto-size logo to match titles block height (square)
    useEffect(() => {
        const titles = titlesRef.current;
        const logo = logoRef.current;
        if (!titles || !logo) return;
        const reduce = prefersReducedMotion();

        const update = () => {
            const h = Math.max(40, Math.round(titles.getBoundingClientRect().height));
            gsap.to(logo, {
                width: h,
                height: h,
                duration: reduce ? 0 : 0.25,
                ease: 'power2.out',
            });
        };

        const ro = new ResizeObserver(update);
        ro.observe(titles);
        window.addEventListener('resize', update);
        update();

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', update);
        };
    }, []);

    // Helper to get the collapsed "max-height" in pixels (~6 lines)
    const getCollapsedDescMaxPx = () => {
        const ul = descUlRef.current;
        if (!ul) return 120; // fallback
        const cs = getComputedStyle(ul);
        let lineHeight = getNumberPx(cs.lineHeight);
        if (!lineHeight) {
            const fontSize = getNumberPx(cs.fontSize) || 14;
            lineHeight = 1.5 * fontSize;
        }
        return Math.round(lineHeight * 6);
    };

    // Expansion / collapse animation + smooth centering + smooth desc height
    useEffect(() => {
        const cardEl = cardRef.current;
        const descWrapEl = descWrapRef.current;
        const fadeEl = fadeRef.current;
        const descEl = descColRef.current;
        const mediaEl = mediaColRef.current;
        const titlesEl = titlesRef.current;
        const rtEl = rtGridRef.current;
        const viewportEl = viewportRef.current;

        if (!cardEl || !descWrapEl || !descEl || !mediaEl || !titlesEl || !rtEl || !viewportEl) return;

        const reduce = prefersReducedMotion();

        if (tlRef.current) { tlRef.current.kill(); tlRef.current = null; }

        const railW = viewportEl.clientWidth;
        const collapsedW = collapsedWidthRef.current ?? cardEl.getBoundingClientRect().width;
        const targetExpandedW = Math.floor(railW * 0.7);
        const finalExpandedW = Math.max(collapsedW, targetExpandedW);

        // IMPORTANT: use hashed module classes for DOM queries
        const pairEls = Array.from(
            rtEl.querySelectorAll('.' + styles['rt-pair'])
        ) as HTMLElement[];
        const labelEls = Array.from(
            rtEl.querySelectorAll('.' + styles['rt-label'])
        ) as HTMLElement[];

        const measureLabelHeights = () => labelEls.map((el) => el.scrollHeight);

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        tlRef.current = tl;

        // Smooth scroll helper
        const quickScroll = gsap.quickTo(viewportEl, 'scrollLeft', {
            duration: reduce ? 0 : 0.35,
            ease: 'power3.inOut',
        });

        if (isExpanded) {
            // ---- EXPAND ----

            const collapsedPx = getCollapsedDescMaxPx();
            gsap.set(descWrapEl, { maxHeight: collapsedPx });

            gsap.set(mediaEl, { display: 'block', flexBasis: '0%', opacity: 0, pointerEvents: 'none' });
            gsap.set(descEl, { flexBasis: '100%' });

            gsap.set(labelEls, { maxHeight: 0, opacity: 0, y: -6 });

            // capture flip state then add class for expanded layout (hashed)
            const flipState = Flip.getState(pairEls);
            cardEl.classList.add(styles['experience-card--expanded']);

            const WIDTH_DUR = reduce ? 0 : 0.50;

            // (A) Width tween
            tl.to(cardEl, { width: finalExpandedW, duration: WIDTH_DUR, ease: 'power3.inOut' }, 0);

            // (B) Follow-centering while width grows
            tl.to(
                {},
                {
                    duration: WIDTH_DUR,
                    ease: 'none',
                    onUpdate: () => {
                        const nowW = cardEl.getBoundingClientRect().width;
                        const target = computeCenteredScrollLeft(viewportEl, cardEl, nowW);
                        quickScroll(target);
                    },
                },
                0
            );

            if (fadeEl) {
                tl.to(fadeEl, { opacity: 0, duration: reduce ? 0 : 0.24 }, 0.14);
            }

            const heights = measureLabelHeights();
            tl.to(
                labelEls,
                {
                    maxHeight: (i) => heights[i] || 18,
                    opacity: 1,
                    y: 0,
                    duration: reduce ? 0 : 0.24,
                    ease: 'power2.out',
                },
                0.18
            );

            // Body columns to 70/30
            tl.to(
                descEl,
                { flexBasis: '70%', duration: reduce ? 0 : 0.40, ease: 'power2.inOut' },
                0.20
            );
            tl.to(
                mediaEl,
                {
                    flexBasis: '30%',
                    opacity: 1,
                    duration: reduce ? 0 : 0.40,
                    ease: 'power2.inOut',
                    onComplete: () => gsap.set(mediaEl, { pointerEvents: 'auto' }),
                },
                0.20
            );

            // Animate description wrap to full height
            tl.to(
                descWrapEl,
                {
                    maxHeight: () => descWrapEl.scrollHeight,
                    duration: reduce ? 0 : 0.40,
                    ease: 'power2.inOut',
                    onComplete: () => {
                        gsap.set(descWrapEl, { clearProps: 'maxHeight' });
                    },
                },
                0.26
            );

            // Chip reveal (hashed selector)
            if (chipsRef.current) {
                const chips = Array.from(
                    chipsRef.current.querySelectorAll('.' + styles['tech-chip'])
                );
                tl.fromTo(
                    chips,
                    { y: 6, opacity: 0 },
                    { y: 0, opacity: 1, stagger: reduce ? 0 : 0.03, duration: reduce ? 0 : 0.25 },
                    0.28
                );
            }

            // Re-sync logo
            tl.add(() => {
                const h = Math.max(40, Math.round(titlesEl.getBoundingClientRect().height));
                gsap.to(logoRef.current, { width: h, height: h, duration: reduce ? 0 : 0.25, ease: 'power2.out' });
            }, 0.46);

            // Final gentle re-center
            tl.add(() => {
                const nowW = cardEl.getBoundingClientRect().width;
                const target = computeCenteredScrollLeft(viewportEl, cardEl, nowW);
                quickScroll(target);
            }, WIDTH_DUR + 0.06);
        } else {
            // ---- COLLAPSE ----
            const flipState = Flip.getState(pairEls);

            const fullPx = descWrapEl.scrollHeight;
            const collapsedPx = getCollapsedDescMaxPx();
            gsap.set(descWrapEl, { maxHeight: fullPx });

            tl.to(
                labelEls,
                {
                    maxHeight: 0,
                    opacity: 0,
                    y: -6,
                    duration: reduce ? 0 : 0.18,
                    ease: 'power2.in',
                },
                0
            );

            // remove hashed expanded class
            cardEl.classList.remove(styles['experience-card--expanded']);

            tl.add(
                Flip.from(flipState, {
                    duration: reduce ? 0 : 0.32,
                    ease: 'power2.out',
                    absolute: false,
                    prune: true,
                    stagger: reduce ? 0 : 0.02,
                }),
                0.02
            );

            tl.to(
                descWrapEl,
                {
                    maxHeight: collapsedPx,
                    duration: reduce ? 0 : 0.35,
                    ease: 'power2.inOut',
                    onComplete: () => {
                        gsap.set(descWrapEl, { clearProps: 'maxHeight' });
                    },
                },
                0.02
            );

            if (fadeEl) {
                tl.to(fadeEl, { opacity: 1, duration: reduce ? 0 : 0.20, ease: 'power1.out' }, 0.18);
            }

            tl.to(
                descEl,
                { flexBasis: '100%', duration: reduce ? 0 : 0.35, ease: 'power2.inOut' },
                0.02
            );
            tl.to(
                mediaEl,
                {
                    flexBasis: '0%',
                    opacity: 0,
                    duration: reduce ? 0 : 0.30,
                    ease: 'power2.inOut',
                    onComplete: () =>
                        gsap.set(mediaEl, { display: 'none', pointerEvents: 'none' }),
                },
                0.02
            );

            tl.to(
                cardEl,
                {
                    width:
                        collapsedWidthRef.current ?? cardEl.getBoundingClientRect().width,
                    duration: reduce ? 0 : 0.45,
                    ease: 'power3.inOut',
                },
                0.05
            );

            tl.add(() => {
                const h = Math.max(40, Math.round(titlesEl.getBoundingClientRect().height));
                gsap.to(logoRef.current, { width: h, height: h, duration: reduce ? 0 : 0.25, ease: 'power2.out' });
            }, 0.40);
        }

        return () => {
            if (tlRef.current) { tlRef.current.kill(); tlRef.current = null; }
        };
    }, [isExpanded, viewportRef]);

    const detailSrc = item.detailImage ?? item.logoSrc;

    // Module-safe wrapper class (adds hashed "has-overflow" only when needed)
    const wrapClass = cx(
        styles['experience-card__desc-wrap'],
        hasOverflow && !isExpanded && styles['has-overflow']
    );

    return (
        <article
            ref={cardRef}
            className={styles['experience-card']}
            aria-labelledby={`${item.id}-company`}
            data-card-id={item.id}
        >
            <div className={styles['experience-card__top']}>
                <div className={styles['experience-card__ident']}>
                    <img
                        ref={logoRef}
                        className={styles['experience-card__logo']}
                        src={item.logoSrc}
                        alt={item.logoAlt}
                    />
                    <div ref={titlesRef} className={styles['experience-card__titles']}>
                        <h3 id={`${item.id}-company`} className={styles['experience-card__company']}>
                            {item.company}
                        </h3>

                        {/* Role/Team */}
                        <div ref={rtGridRef} className={styles['rt-grid']} aria-label="Role and Team">
                            <div className={styles['rt-pair']} data-kind="role">
                                <span className={styles['rt-label']}>Role</span>
                                <span className={styles['rt-value']}>{item.role}</span>
                            </div>
                            <div className={styles['rt-pair']} data-kind="team">
                                <span className={styles['rt-label']}>Team</span>
                                <span className={styles['rt-value']}>{item.team}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className={styles['experience-card__expand']}
                    aria-expanded={isExpanded}
                    aria-controls={`${item.id}-body`}
                    onClick={() => onToggle(item.id)}
                >
                    {isExpanded ? 'Collapse' : 'Expand'}
                </button>
            </div>

            <div ref={bodyRef} id={`${item.id}-body`} className={styles['experience-card__body']}>
                {/* Description column */}
                <div
                    ref={descColRef}
                    className={cx(styles['experience-card__col'], styles['experience-card__col--desc'])}
                >
                    <div ref={descWrapRef} className={wrapClass}>
                        <ul ref={descUlRef} className={styles['experience-card__desc']}>
                            {item.description.map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                        {/* Gradient fade overlay (only visible when has-overflow + collapsed) */}
                        <div ref={fadeRef} className={styles['desc-fade']} aria-hidden="true" />
                    </div>

                    <div ref={chipsRef} className={styles['experience-card__tech']}>
                        {item.tech.map((t) => {
                            const icon = TECH_ICON_SRC[t];
                            const c = tint(t);
                            return (
                                <span
                                    key={t}
                                    className={styles['tech-chip']}
                                    title={t}
                                    style={{
                                        backgroundColor: `${c}18`,
                                        borderColor: `${c}55`,
                                        color: c,
                                    }}
                                >
                                    {icon && <img src={icon} alt="" aria-hidden className={styles['tech-chip__icon']} />}
                                    <span className={styles['tech-chip__label']}>{t}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Media column */}
                <div
                    ref={mediaColRef}
                    className={cx(styles['experience-card__col'], styles['experience-card__col--media'])}
                    aria-hidden={!isExpanded}
                >
                    <div className={styles['experience-card__media-wrapper']}>
                        <img src={detailSrc} alt="" className={styles['experience-card__media']} />
                    </div>
                </div>
            </div>
        </article>
    );
};

/** ---------- Section ---------- */
const WorkExperience: React.FC = () => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const cardEls = useRef<Record<string, HTMLDivElement>>({});
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Header text→art sizing
    const headerTextRef = useRef<HTMLDivElement>(null);

    const reportCardRef = (id: string, el: HTMLDivElement | null) => {
        if (!el) delete cardEls.current[id];
        else cardEls.current[id] = el;
    };

    const handleToggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

    return (
        <section id="work-experience" className={styles['work-section']} aria-labelledby="work-title">
            <div className={styles['work-header']}>
                <HeaderArt textRef={headerTextRef} />
                <div ref={headerTextRef} className={styles['work-titles']}>
                    <h2 id="work-title" className={styles['work-title']}>Work Experience</h2>
                    <p className={styles['work-subtitle']}>From teaching computer science to applying it</p>
                    <p className={styles['work-meta']}>{EXPERIENCES.length} roles across industry &amp; academia</p>
                </div>
            </div>

            <div ref={viewportRef} className={styles['work-cards-viewport']}>
                <div className={styles['work-cards-rail']}>
                    {EXPERIENCES.map((exp) => (
                        <WorkCard
                            key={exp.id}
                            item={exp}
                            isExpanded={expandedId === exp.id}
                            onToggle={handleToggle}
                            viewportRef={viewportRef}
                            reportCardRef={reportCardRef}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WorkExperience;
