import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import '../styles/HeroLayout.css';

const REVEAL_DURATION_S = 1;
const ICON_STAGGER_S = 0.25;
const REVEAL_THRESHOLD = 0.35;

const Hero: React.FC = () => {
    const sectionRef = useRef<HTMLElement | null>(null);

    const introRevealRef = useRef<HTMLDivElement | null>(null);
    const nameRevealRef = useRef<HTMLDivElement | null>(null);
    const subtitleRevealRef = useRef<HTMLDivElement | null>(null);
    const impactLinkRevealRef = useRef<HTMLDivElement | null>(null);
    const impactIconsWrapRef = useRef<HTMLDivElement | null>(null);

    const revealTlRef = useRef<gsap.core.Timeline | null>(null);
    const wasInViewRef = useRef(false);

    const [revealCycle, setRevealCycle] = useState(0);
    const [isHeroInView, setIsHeroInView] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    const WHITE_THRESHOLD = 245;
    const ALPHA_THRESHOLD = 10;

    const generateNonWhiteMask = useCallback((src: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;

                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) {
                        resolve(src);
                        return;
                    }

                    ctx.drawImage(img, 0, 0, w, h);
                    const im = ctx.getImageData(0, 0, w, h);
                    const data = im.data;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const a = data[i + 3];
                        const isWhite = r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
                        const visible = a > ALPHA_THRESHOLD && !isWhite;

                        data[i] = 0;
                        data[i + 1] = 0;
                        data[i + 2] = 0;
                        data[i + 3] = visible ? 255 : 0;
                    }

                    ctx.putImageData(im, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch {
                    resolve(src);
                }
            };
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }, []);

    const [iconMasks, setIconMasks] = useState<{ linkedin: string; github: string; instagram: string }>({
        linkedin: '/images/coding/linkedin_icon.png',
        github: '/images/coding/github_icon.png',
        instagram: '/images/coding/instagram_icon.png',
    });

    useEffect(() => {
        let alive = true;

        (async () => {
            const [li, gh, ig] = await Promise.all([
                generateNonWhiteMask('/images/coding/linkedin_icon.png'),
                generateNonWhiteMask('/images/coding/github_icon.png'),
                generateNonWhiteMask('/images/coding/instagram_icon.png'),
            ]);

            if (!alive) return;
            setIconMasks({ linkedin: li, github: gh, instagram: ig });
        })();

        return () => {
            alive = false;
        };
    }, [generateNonWhiteMask]);

    const maskStyle = useCallback((maskUrl: string): React.CSSProperties => {
        return {
            WebkitMaskImage: `url(${maskUrl})`,
            maskImage: `url(${maskUrl})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            backgroundColor: '#aeb0b4',
        };
    }, []);

    const killRevealTimeline = useCallback(() => {
        if (revealTlRef.current) {
            revealTlRef.current.kill();
            revealTlRef.current = null;
        }
    }, []);

    const setHiddenState = useCallback(() => {
        const blocks = [
            introRevealRef.current,
            nameRevealRef.current,
            subtitleRevealRef.current,
            impactLinkRevealRef.current,
        ];

        blocks.forEach((block) => {
            if (!block) return;
            gsap.set(block, {
                overflow: 'hidden',
                maxHeight: 0,
                opacity: 0,
                y: -6,
            });
        });

        if (impactIconsWrapRef.current) {
            gsap.set(impactIconsWrapRef.current, {
                opacity: 0,
                y: -6,
                overflow: 'visible',
                maxHeight: 'none',
            });
        }

        const icons = impactIconsWrapRef.current
            ? Array.from(impactIconsWrapRef.current.querySelectorAll<HTMLElement>('.impact-social'))
            : [];

        if (icons.length > 0) {
            gsap.set(icons, { opacity: 0, y: 0 });
        }
    }, []);

    const setVisibleState = useCallback(() => {
        const blocks = [
            introRevealRef.current,
            nameRevealRef.current,
            subtitleRevealRef.current,
            impactLinkRevealRef.current,
        ];

        blocks.forEach((block) => {
            if (!block) return;
            gsap.set(block, {
                overflow: 'visible',
                maxHeight: 'none',
                opacity: 1,
                y: 0,
            });
        });

        if (impactIconsWrapRef.current) {
            gsap.set(impactIconsWrapRef.current, {
                opacity: 1,
                y: 0,
                overflow: 'visible',
                maxHeight: 'none',
            });
        }

        const icons = impactIconsWrapRef.current
            ? Array.from(impactIconsWrapRef.current.querySelectorAll<HTMLElement>('.impact-social'))
            : [];

        if (icons.length > 0) {
            gsap.set(icons, { opacity: 1, y: 0 });
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setPrefersReducedMotion(motionQuery.matches);

        update();

        if (typeof motionQuery.addEventListener === 'function') {
            motionQuery.addEventListener('change', update);
            return () => motionQuery.removeEventListener('change', update);
        }

        motionQuery.addListener(update);
        return () => motionQuery.removeListener(update);
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry) return;

                if (entry.isIntersecting) {
                    if (!wasInViewRef.current) {
                        wasInViewRef.current = true;
                        setIsHeroInView(true);
                        setRevealCycle((prev) => prev + 1);
                    }
                    return;
                }

                if (wasInViewRef.current) {
                    wasInViewRef.current = false;
                    setIsHeroInView(false);
                }
            },
            { threshold: REVEAL_THRESHOLD }
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        if (prefersReducedMotion) {
            killRevealTimeline();
            setVisibleState();
            return;
        }

        if (revealCycle === 0) {
            setHiddenState();
            return;
        }

        killRevealTimeline();
        setHiddenState();

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        revealTlRef.current = tl;

        const animateBlock = (el: HTMLDivElement | null, at: number) => {
            if (!el) return;

            const naturalHeight = el.scrollHeight || 24;
            tl.to(
                el,
                {
                    maxHeight: naturalHeight,
                    opacity: 1,
                    y: 0,
                    duration: REVEAL_DURATION_S,
                    onComplete: () => {
                        gsap.set(el, { overflow: 'visible' });
                    },
                },
                at
            );
        };

        animateBlock(introRevealRef.current, 0);
        animateBlock(nameRevealRef.current, 0.08);
        animateBlock(subtitleRevealRef.current, 0.16);
        animateBlock(impactLinkRevealRef.current, 0.28);

        if (impactIconsWrapRef.current) {
            tl.to(
                impactIconsWrapRef.current,
                {
                    opacity: 1,
                    y: 0,
                    duration: REVEAL_DURATION_S,
                },
                0.4
            );
        }

        const icons = impactIconsWrapRef.current
            ? Array.from(impactIconsWrapRef.current.querySelectorAll<HTMLElement>('.impact-social'))
            : [];

        if (icons.length > 0) {
            tl.to(
                icons,
                {
                    opacity: 1,
                    duration: REVEAL_DURATION_S,
                    stagger: ICON_STAGGER_S,
                },
                0.48
            );
        }

        return () => {
            killRevealTimeline();
        };
    }, [killRevealTimeline, prefersReducedMotion, revealCycle, setHiddenState, setVisibleState]);

    useEffect(() => {
        if (prefersReducedMotion || isHeroInView) return;
        killRevealTimeline();
        setHiddenState();
    }, [isHeroInView, killRevealTimeline, prefersReducedMotion, setHiddenState]);

    useEffect(() => {
        return () => killRevealTimeline();
    }, [killRevealTimeline]);

    return (
        <section ref={sectionRef} className="hero" aria-label="Hero">
            <div className="hero-content">
                <div ref={introRevealRef} className="hero-reveal-block hero-intro" aria-label="Introduction">
                    <p className="hero-intro-line">Hi,</p>
                    <p className="hero-intro-line">my name is</p>
                </div>

                <div ref={nameRevealRef} className="hero-reveal-block">
                    <h1 className="portfolio-title">Theo Kremer</h1>
                </div>

                <div ref={subtitleRevealRef} className="hero-reveal-block hero-subtitle-stack">
                    <p className="hero-subtitle">
                        I build <span className="hero-subtitle-highlight">user-friendly</span> apps.
                    </p>
                    <p className="hero-subdescription">
                        machine learning and full-stack engineer building tools<br/>and apps that deliver measurable impact.
                    </p>
                </div>

                <div ref={impactLinkRevealRef} className="hero-reveal-block impact-link-reveal">
                    <a
                        href="#smartlinked"
                        className="impact-link"
                        onClick={(e) => {
                            e.preventDefault();
                            const target = document.getElementById('smartlinked');
                            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            else window.location.hash = '#smartlinked';
                        }}
                        aria-label="Jump to SmartLinked: How I used AI to help 18,000 people"
                    >
                        How I applied AI to help 18,000 people →
                    </a>
                </div>

                <div ref={impactIconsWrapRef} className="hero-reveal-block impact-socials" aria-label="Social links">
                    <a className="impact-social" href="http://linkedin.com/in/ttkremer" aria-label="LinkedIn" title="LinkedIn">
                        <img
                            className="impact-social__img"
                            src="/images/coding/linkedin_icon.png"
                            alt=""
                            decoding="async"
                            loading="lazy"
                            draggable={false}
                        />
                        <span className="impact-social__tint" style={maskStyle(iconMasks.linkedin)} aria-hidden />
                    </a>

                    <a className="impact-social" href="https://github.com/TeedsK" aria-label="GitHub" title="GitHub">
                        <img
                            className="impact-social__img"
                            src="/images/coding/github_icon.png"
                            alt=""
                            decoding="async"
                            loading="lazy"
                            draggable={false}
                        />
                        <span className="impact-social__tint" style={maskStyle(iconMasks.github)} aria-hidden />
                    </a>

                    <a className="impact-social" href="https://www.instagram.com/theo.kremer" aria-label="Instagram" title="Instagram">
                        <img
                            className="impact-social__img"
                            src="/images/coding/instagram_icon.png"
                            alt=""
                            decoding="async"
                            loading="lazy"
                            draggable={false}
                        />
                        <span className="impact-social__tint" style={maskStyle(iconMasks.instagram)} aria-hidden />
                    </a>
                </div>
            </div>
        </section>
    );
};

export default Hero;
