// src/pages/landing/sections/WorkExperience.tsx
import React, { useState } from 'react';
import '../styles/WorkExperience.css';

/** Simple inlined monogram logo (fallback if no image) */
const MonogramLogo: React.FC<{ text: string }> = ({ text }) => (
    <div
        aria-hidden
        style={{
            width: 58,
            height: 58,
            borderRadius: 8,
            background:
                'linear-gradient(180deg, rgba(6,147,227,0.12) 0%, rgba(155,81,224,0.12) 100%)',
            border: '1px solid rgba(15, 23, 42, 0.12)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            color: '#1f2937',
            fontFamily: 'Inter, system-ui, sans-serif',
            letterSpacing: 0.5,
            userSelect: 'none',
        }}
    >
        {text}
    </div>
);

type Tech = { name: string; color: string };

type ExperienceItem = {
    id: string;
    company: string;
    logoAlt?: string;
    role: string;
    team: string;
    description: string[];
    extra?: string[];
    tech: Tech[];
};

const TECH_COLORS: Record<string, string> = {
    Python: '#3776AB',
    TensorFlow: '#FF6F00',
    PyTorch: '#EE4C2C',
    React: '#61DAFB',
    TypeScript: '#3178C6',
    Docker: '#2496ED',
    Kubernetes: '#326CE5',
    AWS: '#FF9900',
    Spark: '#E25A1C',
};

const colorForTech = (name: string) => TECH_COLORS[name] ?? '#6366F1';

const EXPERIENCES: ExperienceItem[] = [
    {
        id: 'gs-ml',
        company: 'Goldman Sachs',
        role: 'Machine Learning Engineer',
        team: 'Production Runtime Experience',
        description: [
            'Built and operated ML inference services powering internal analytics.',
            'Optimized model serving pipelines and feature stores at scale.',
            'Drove latency and cost reductions with profiling & model distillation.',
        ],
        extra: [
            'Instrumented E2E tracing; introduced autoscaling & canary deploys.',
            'Partnered with platform team to harden CI/CD for GPU/CPU runtimes.',
        ],
        tech: [
            { name: 'Python', color: colorForTech('Python') },
            { name: 'TensorFlow', color: colorForTech('TensorFlow') },
            { name: 'Docker', color: colorForTech('Docker') },
            { name: 'AWS', color: colorForTech('AWS') },
        ],
    },
    {
        id: 'gs-se',
        company: 'Goldman Sachs',
        role: 'Software Engineer',
        team: 'Production Runtime Experience',
        description: [
            'Delivered backend services and APIs supporting critical workflows.',
            'Led reliability workstreams and on-call rotations.',
            'Improved observability with structured logs and SLO dashboards.',
        ],
        extra: ['Partnered with cross‑functional teams to reduce incident MTTR by 38%.'],
        tech: [
            { name: 'Python', color: colorForTech('Python') },
            { name: 'TensorFlow', color: colorForTech('TensorFlow') },
            { name: 'Kubernetes', color: colorForTech('Kubernetes') },
        ],
    },
];

const HeaderArt: React.FC = () => (
    <img
        src="/hello_and_welcome.png"
        alt=""
        aria-hidden
        style={{
            width: 58,
            height: 58,
            borderRadius: 12,
            objectFit: 'cover',
            boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
        }}
    />
);

const WorkCard: React.FC<{ item: ExperienceItem }> = ({ item }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <article className="experience-card" aria-labelledby={`${item.id}-title`}>
            <div className="experience-card__top">
                <div className="experience-card__ident">
                    <MonogramLogo text={item.company.split(' ').map(w => w[0]).join('').slice(0, 2)} />
                    <div className="experience-card__titles">
                        <h3 id={`${item.id}-title`} className="experience-card__role">
                            {item.role}
                        </h3>
                        <p className="experience-card__team">{item.team}</p>
                    </div>
                </div>
                <button
                    type="button"
                    className="experience-card__expand"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(v => !v)}
                >
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
            </div>

            <div className="experience-card__body">
                <ul className="experience-card__desc">
                    {item.description.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                    {expanded &&
                        (item.extra ?? []).map((line, i) => (
                            <li key={`x-${i}`} className="experience-card__extra">
                                {line}
                            </li>
                        ))}
                </ul>

                <div className="experience-card__tech">
                    {item.tech.map(t => (
                        <span
                            key={t.name}
                            className="tech-chip"
                            title={t.name}
                            style={{
                                backgroundColor: `${t.color}22`,
                                borderColor: `${t.color}55`,
                                color: t.color,
                            }}
                        >
                            {t.name}
                        </span>
                    ))}
                </div>
            </div>
        </article>
    );
};

const WorkExperience: React.FC = () => {
    return (
        <section id="work-experience" className="work-section" aria-labelledby="work-title">
            <div className="work-header">
                <HeaderArt />
                <div className="work-titles">
                    <h2 id="work-title" className="work-title">
                        Work Experience
                    </h2>
                    <p className="work-subtitle">From teaching computer science to applying it</p>
                    <p className="work-meta">4 total years of experience</p>
                </div>
            </div>

            {/* Horizontal snap scroller */}
            <div className="work-cards-viewport">
                <div className="work-cards-rail">
                    {EXPERIENCES.map((exp) => (
                        <WorkCard key={exp.id} item={exp} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default WorkExperience;
