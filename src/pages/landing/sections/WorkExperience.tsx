// src/pages/landing/sections/WorkExperience.tsx
import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from '../styles/WorkExperience.module.css';

gsap.registerPlugin(ScrollTrigger);

/** Number of items to show initially (first row) */
const INITIAL_VISIBLE_COUNT = 3;

/** Tech icon paths */
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
};

/** Brand colors for tech chips */
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
};

const getTint = (name: string) => TECH_TINT[name] ?? '#6366F1';

/** Experience data type */
type ExperienceItem = {
    id: string;
    dateRange: string;
    company: string;
    role: string;
    logoSrc: string;
    logoAlt: string;
    detailImage?: string;
    description: string[];
    tech: string[];
};

/** Work experience data - ordered newest to oldest */
const EXPERIENCES: ExperienceItem[] = [
    {
        id: 'goldman-ml',
        dateRange: 'June 2025 - August 2025',
        company: 'Goldman Sachs',
        role: 'Machine Learning Intern',
        logoSrc: '/images/work-experience/goldman_sachs.png',
        logoAlt: 'Goldman Sachs Logo',
        detailImage: '/images/work-experience/goldman/1.png',
        description: [
            'Built a Python agentic framework for deep analysis and discovery over a 20M-node / 135M-edge graph, unlocking novel insights and empowering business users.',
            'Designed a LangGraph multi-agent architecture of 10+ agents and tools, integrating closely with existing services, enforcing state isolation and guardrails.',
        ],
        tech: ['Python', 'LangGraph', 'Streamlit', 'GitLab', 'Confluence'],
    },
    {
        id: 'goldman-se',
        dateRange: 'June 2024 - August 2024',
        company: 'Goldman Sachs',
        role: 'Software Engineer Intern',
        logoSrc: '/images/work-experience/goldman_sachs.png',
        logoAlt: 'Goldman Sachs Logo',
        detailImage: '/images/work-experience/goldman/3.png',
        description: [
            'Designed and developed an internal web service using React and Java, enabling firm-wide adoption from 19% to 100% by streamlining onboarding processes.',
            'Collaborated with a team of 19 across 5 time zones using Agile methodologies, including sprint planning and progress tracking.',
        ],
        tech: ['Java', 'React', 'GitLab', 'Jira', 'Confluence'],
    },
    {
        id: 'uofu',
        dateRange: 'August 2023 - May 2024',
        company: 'University of Utah',
        role: 'Computer Science Tutor',
        logoSrc: '/images/work-experience/university_of_utah.png',
        logoAlt: 'University of Utah Logo',
        detailImage: '/images/work-experience/tutor/1.png',
        description: [
            'Reinforced computer science topics for 10+ students daily through individualized tutoring and visual aids.',
        ],
        tech: ['Python', 'Java', 'C++', 'C#', 'MySQL'],
    },
    {
        id: 'rodina',
        dateRange: 'May 2022 - August 2022',
        company: 'Rodina Consulting',
        role: 'Middleware Software Engineer',
        logoSrc: '/images/work-experience/rodina_consulting.png',
        logoAlt: 'Rodina Consulting Logo',
        description: [
            'Automated billing system integration via Celigo platform, fulfilling workload equivalent of 3 employees.',
            'Led feasibility study on Wix templates, resulting in significant SEO enhancements.',
        ],
        tech: ['JavaScript', 'HTML', 'CSS', 'Wix', 'Celigo'],
    },
    {
        id: 'tippett',
        dateRange: 'June 2021 - August 2021',
        company: 'Tippett Studios',
        role: 'Pipeline Developer Intern',
        logoSrc: '/images/work-experience/tippett_studios.png',
        logoAlt: 'Tippett Studios Logo',
        detailImage: '/images/work-experience/tippett/1.png',
        description: [
            'Automated asset checks and dailies packaging via Python tools.',
            'Built utilities to smooth artist handoffs and contributed to pipeline docs.',
        ],
        tech: ['Python', 'JavaScript', 'Docker'],
    },
];

/** Experience Card component */
const ExperienceCard: React.FC<{
    item: ExperienceItem;
}> = ({ item }) => {
    return (
        <article
            className={styles.card}
            aria-labelledby={`${item.id}-title`}
        >
            {/* Company Logo */}
            <div className={styles.logoWrapper}>
                <img
                    className={styles.logo}
                    src={item.logoSrc}
                    alt={item.logoAlt}
                />
            </div>

            {/* Job Title */}
            <h3 id={`${item.id}-title`} className={styles.role}>
                {item.role}
            </h3>

            {/* Company Name */}
            <p className={styles.company}>{item.company}</p>

            {/* Date Range */}
            <p className={styles.dateRange}>{item.dateRange}</p>

            {/* Description as paragraphs */}
            <div className={styles.description}>
                {item.description.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                ))}
            </div>

            {/* Tech Stack Chips */}
            <div className={styles.techStack}>
                {item.tech.map((t) => {
                    const icon = TECH_ICON_SRC[t];
                    const color = getTint(t);
                    return (
                        <span
                            key={t}
                            className={styles.techChip}
                            title={t}
                            style={{
                                backgroundColor: `${color}15`,
                                borderColor: `${color}40`,
                                color: color,
                            }}
                        >
                            {icon && (
                                <img
                                    src={icon}
                                    alt=""
                                    aria-hidden="true"
                                    className={styles.techIcon}
                                />
                            )}
                            <span>{t}</span>
                        </span>
                    );
                })}
            </div>

            {/* Detail Image (only if exists) */}
            {item.detailImage && (
                <div className={styles.imageWrapper}>
                    <img
                        src={item.detailImage}
                        alt={`${item.company} work preview`}
                        className={styles.detailImage}
                    />
                </div>
            )}
        </article>
    );
};

/** Work Experience Section */
const WorkExperience: React.FC = () => {
    const sectionRef = useRef<HTMLElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const hiddenGridRef = useRef<HTMLDivElement>(null);
    const hiddenWrapperRef = useRef<HTMLDivElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    // Split experiences into visible and hidden
    const visibleExperiences = EXPERIENCES.slice(0, INITIAL_VISIBLE_COUNT);
    const hiddenExperiences = EXPERIENCES.slice(INITIAL_VISIBLE_COUNT);

    // Initial scroll-triggered animation for visible cards
    useLayoutEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReducedMotion) {
            const cards = gridRef.current?.querySelectorAll(`.${styles.card}`);
            cards?.forEach((card) => {
                gsap.set(card, { opacity: 1, y: 0 });
            });
            return;
        }

        const ctx = gsap.context(() => {
            const cards = gridRef.current?.querySelectorAll(`.${styles.card}`);

            if (!cards || cards.length === 0) return;

            gsap.set(cards, { opacity: 0, y: 40 });

            gsap.to(cards, {
                opacity: 1,
                y: 0,
                duration: 0.6,
                ease: 'power2.out',
                stagger: { amount: 0.4, from: 'start' },
                scrollTrigger: {
                    trigger: gridRef.current,
                    start: 'top 80%',
                    toggleActions: 'play none none none',
                },
            });
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    // Handle expand/collapse animation
    const toggleExpand = useCallback(() => {
        if (isAnimating || !hiddenWrapperRef.current || !hiddenGridRef.current) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const wrapper = hiddenWrapperRef.current;
        const hiddenCards = hiddenGridRef.current.querySelectorAll(`.${styles.card}`);

        setIsAnimating(true);

        if (!isExpanded) {
            // Expanding
            // First, set wrapper to auto height to measure
            gsap.set(wrapper, { height: 'auto', overflow: 'hidden' });
            const fullHeight = wrapper.offsetHeight;

            // Reset to 0 and animate
            gsap.set(wrapper, { height: 0 });
            gsap.set(hiddenCards, { opacity: 0, y: 30 });

            const tl = gsap.timeline({
                onComplete: () => {
                    gsap.set(wrapper, { height: 'auto', overflow: 'visible' });
                    setIsAnimating(false);
                },
            });

            if (prefersReducedMotion) {
                gsap.set(wrapper, { height: 'auto' });
                gsap.set(hiddenCards, { opacity: 1, y: 0 });
                setIsAnimating(false);
            } else {
                tl.to(wrapper, {
                    height: fullHeight,
                    duration: 0.5,
                    ease: 'power2.out',
                });

                tl.to(hiddenCards, {
                    opacity: 1,
                    y: 0,
                    duration: 0.4,
                    stagger: 0.1,
                    ease: 'power2.out',
                }, '-=0.2');
            }

            setIsExpanded(true);
        } else {
            // Collapsing
            const tl = gsap.timeline({
                onComplete: () => {
                    gsap.set(wrapper, { overflow: 'hidden' });
                    setIsAnimating(false);
                },
            });

            if (prefersReducedMotion) {
                gsap.set(hiddenCards, { opacity: 0, y: 30 });
                gsap.set(wrapper, { height: 0, overflow: 'hidden' });
                setIsAnimating(false);
            } else {
                tl.to(hiddenCards, {
                    opacity: 0,
                    y: 20,
                    duration: 0.3,
                    stagger: { amount: 0.15, from: 'end' },
                    ease: 'power2.in',
                });

                tl.to(wrapper, {
                    height: 0,
                    overflow: 'hidden',
                    duration: 0.4,
                    ease: 'power2.inOut',
                }, '-=0.1');
            }

            setIsExpanded(false);
        }
    }, [isExpanded, isAnimating]);

    return (
        <section
            id="work-experience"
            className={styles.section}
            aria-labelledby="work-title"
            ref={sectionRef}
        >
            <div className={styles.sectionHeader}>
                <h2 id="work-title" className={styles.sectionTitle}>
                    Work Experience
                </h2>
                <p className={styles.sectionSubtitle}>
                    From teaching computer science to applying it
                </p>
            </div>

            {/* Initially visible cards */}
            <div className={styles.cardGrid} ref={gridRef}>
                {visibleExperiences.map((exp) => (
                    <ExperienceCard key={exp.id} item={exp} />
                ))}
            </div>

            {/* Hidden cards wrapper */}
            {hiddenExperiences.length > 0 && (
                <>
                    <div
                        ref={hiddenWrapperRef}
                        className={styles.hiddenWrapper}
                        style={{ height: 0, overflow: 'hidden' }}
                    >
                        <div className={styles.cardGrid} ref={hiddenGridRef}>
                            {hiddenExperiences.map((exp) => (
                                <ExperienceCard key={exp.id} item={exp} />
                            ))}
                        </div>
                    </div>

                    {/* View More / View Less button */}
                    <div className={styles.toggleButtonWrapper}>
                        <button
                            className={styles.toggleButton}
                            onClick={toggleExpand}
                            disabled={isAnimating}
                            aria-expanded={isExpanded}
                            aria-controls="hidden-experiences"
                        >
                            <span>{isExpanded ? 'View Less' : 'View More'}</span>
                            <svg
                                className={`${styles.toggleIcon} ${isExpanded ? styles.rotated : ''}`}
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M4 6L8 10L12 6"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </>
            )}
        </section>
    );
};

export default WorkExperience;
