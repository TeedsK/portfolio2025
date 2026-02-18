// src/pages/landing/sections/Education.tsx
import React, { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import EducationRLDrift from '../visuals/EducationRLDrift';
import '../styles/Education.css';

gsap.registerPlugin(ScrollTrigger);

// --- Semester data (each is a point on the timeline) ---
type Semester = {
    label: string;
    logo?: string;
    logoAlt?: string;
    courses: { code: string; name: string }[];
};

const SEMESTERS: Semester[] = [
    {
        label: 'Fall 2022',
        logo: '/images/work-experience/university_of_utah.png',
        logoAlt: 'University of Utah logo',
        courses: [
            { code: 'CS 1410', name: 'Intro to OOP' },
            { code: 'CS 2100', name: 'Discrete Structures' },
            { code: 'MATH 1220', name: 'Calculus II' },
        ],
    },
    {
        label: 'Spring 2023',
        courses: [
            { code: 'CS 2420', name: 'Data Structures' },
            { code: 'CS 3500', name: 'Software Practice I' },
            { code: 'MATH 2270', name: 'Linear Algebra' },
        ],
    },
    {
        label: 'Fall 2023',
        courses: [
            { code: 'CS 3505', name: 'Software Practice II' },
            { code: 'CS 3810', name: 'Computer Organization' },
            { code: 'CS 4400', name: 'Computer Systems' },
        ],
    },
    {
        label: 'Spring 2024',
        courses: [
            { code: 'CS 4150', name: 'Algorithms' },
            { code: 'CS 4530', name: 'Mobile Development' },
            { code: 'CS 4540', name: 'Probability & Stats' },
        ],
    },
    {
        label: 'Fall 2024',
        logo: '/images/education/UNSW_emblem.png',
        logoAlt: 'UNSW Sydney logo',
        courses: [
            { code: 'COMP 6714', name: 'Info Retrieval & Web Search' },
            { code: 'COMP 9444', name: 'Neural Networks & Deep Learning' },
            { code: 'COMP 9517', name: 'Computer Vision' },
        ],
    },
    {
        label: 'Spring 2025',
        courses: [
            { code: 'CS 4610', name: 'Compilers' },
            { code: 'CS 5350', name: 'Machine Learning' },
            { code: 'CS 5353', name: 'Deep Learning' },
        ],
    },
    {
        label: 'Fall 2025',
        courses: [
            { code: 'CS 5340', name: 'Natural Language Processing' },
            { code: 'CS 5630', name: 'Visualization' },
            { code: 'CS 6966', name: 'AI Ethics' },
        ],
    },
    {
        label: 'Spring 2026',
        courses: [
            { code: 'CS 5960', name: 'Capstone Project' },
            { code: 'CS 6350', name: 'Advanced ML' },
        ],
    },
];

const Education: React.FC = () => {
    const sectionRef = useRef<HTMLElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const rlWrapperRef = useRef<HTMLDivElement>(null);

    // RL visual responsive sizing
    const [rlSize, setRlSize] = useState({ width: 900, height: 420 });

    const measureRl = useCallback(() => {
        if (rlWrapperRef.current) {
            const rect = rlWrapperRef.current.getBoundingClientRect();
            if (rect.width > 0) {
                const w = Math.floor(rect.width);
                // Sim is full-width now; use a shallower aspect ratio
                const h = Math.max(300, Math.min(440, Math.floor(w * 0.3)));
                setRlSize({ width: w, height: h });
            }
        }
    }, []);

    useEffect(() => {
        measureRl();
        const ro = new ResizeObserver(measureRl);
        if (rlWrapperRef.current) ro.observe(rlWrapperRef.current);
        return () => ro.disconnect();
    }, [measureRl]);

    // GSAP entrance animations
    useLayoutEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) return;

        const ctx = gsap.context(() => {
            // Timeline track: scaleX 0→1
            if (trackRef.current) {
                gsap.fromTo(
                    trackRef.current,
                    { scaleX: 0 },
                    {
                        scaleX: 1,
                        duration: 0.8,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: trackRef.current,
                            start: 'top 85%',
                            toggleActions: 'play none none none',
                        },
                    }
                );
            }

            // Semester columns: fade + slideUp, staggered
            if (gridRef.current) {
                const cols = gridRef.current.querySelectorAll('.edu-sem');
                gsap.set(cols, { opacity: 0, y: 24 });
                gsap.to(cols, {
                    opacity: 1,
                    y: 0,
                    duration: 0.5,
                    stagger: 0.1,
                    ease: 'power2.out',
                    scrollTrigger: {
                        trigger: gridRef.current,
                        start: 'top 82%',
                        toggleActions: 'play none none none',
                    },
                });
            }

            // RL section: fade in
            if (rlWrapperRef.current) {
                gsap.fromTo(
                    rlWrapperRef.current,
                    { opacity: 0, y: 20 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.7,
                        ease: 'power2.out',
                        scrollTrigger: {
                            trigger: rlWrapperRef.current,
                            start: 'top 85%',
                            toggleActions: 'play none none none',
                        },
                    }
                );
            }
        }, sectionRef);

        return () => ctx.revert();
    }, []);

    return (
        <section id="education" className="edu-section" aria-labelledby="edu-title" ref={sectionRef}>
            <div className="edu-inner">
                {/* Header */}
                <div className="edu-header">
                    <h2 id="edu-title" className="edu-title">
                        Education
                    </h2>
                    <p className="edu-subtitle">
                        B.S. Computer Science — University of Utah, with exchange at UNSW Sydney
                    </p>
                </div>

                {/* Unified timeline + course grid */}
                <div className="edu-timeline-grid" ref={gridRef}>
                    <div className="edu-track" ref={trackRef} />
                    {SEMESTERS.map((sem) => (
                        <div className="edu-sem" key={sem.label}>
                            {sem.logo ? (
                                <img
                                    className="edu-logo-badge"
                                    src={sem.logo}
                                    alt={sem.logoAlt || ''}
                                    loading="lazy"
                                />
                            ) : (
                                <div className="edu-tick" />
                            )}
                            <span className="edu-sem-label">{sem.label}</span>
                            <div className="edu-courses">
                                {sem.courses.map((c) => (
                                    <div className="edu-course" key={c.code}>
                                        <span className="edu-course-code">{c.code}</span>
                                        <span className="edu-course-name">{c.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Full-width RL section - outside edu-inner */}
            <div className="edu-rl-section" ref={rlWrapperRef}>
                <EducationRLDrift width={rlSize.width} height={rlSize.height} />
            </div>
        </section>
    );
};

export default Education;
