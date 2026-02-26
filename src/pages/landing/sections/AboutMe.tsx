// src/pages/landing/sections/AboutMe.tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import gsap from 'gsap';
import '../styles/AboutMe.css';

type NodeId = 'stop-motions' | 'skiing' | 'weightlifting' | 'video-games';

type TopicMedia = {
    id: string;
    kind: 'image' | 'video';
    label: string;
};

type TopicNode = {
    id: NodeId;
    title: string;
    copy: string;
    orbitX: number;
    orbitY: number;
    detailParagraph: string;
    media: TopicMedia[];
};

const TOPIC_NODES: TopicNode[] = [
    {
        id: 'stop-motions',
        title: 'stop motions',
        copy: 'Frame-by-frame storytelling trained my patience and detail-first creativity.',
        orbitX: 230,
        orbitY: -312,
        detailParagraph:
            'I spent years building stop motions by hand, often planning every frame before touching the camera. That workflow shaped how I build software today: define the sequence, pressure-test transitions, and obsess over tiny details that make the final experience feel intentional. It also taught me how to ship creative work with constraints, which is the exact mindset I rely on when turning rough product ideas into real interfaces.',
        media: [
            { id: 'stop-motion-storyboard', kind: 'image', label: 'Storyboard Placeholder' },
            { id: 'stop-motion-timelapse', kind: 'video', label: 'Rig Timelapse Placeholder' },
            { id: 'stop-motion-final-cut', kind: 'video', label: 'Final Cut Placeholder' },
        ],
    },
    {
        id: 'skiing',
        title: 'skiing',
        copy: 'Powder days reset my brain and keep me sharp through long build cycles.',
        orbitX: 432,
        orbitY: -123,
        detailParagraph:
            'Skiing is where I rehearse fast decision-making under changing conditions. Every run is a sequence of micro-adjustments based on terrain, visibility, and speed, and that maps directly to how I iterate in engineering: scan signal, pick a line, commit, then adapt instantly when the environment shifts. The discipline of repeating fundamentals on the mountain carries into how I approach reliability, consistency, and execution in code.',
        media: [
            { id: 'ski-line-map', kind: 'image', label: 'Line Map Placeholder' },
            { id: 'ski-gopro-run', kind: 'video', label: 'GoPro Run Placeholder' },
            { id: 'ski-snow-report', kind: 'image', label: 'Snow Report Placeholder' },
        ],
    },
    {
        id: 'weightlifting',
        title: 'weightlifting',
        copy: 'Lifting gives me structure, consistency, and competitive energy.',
        orbitX: -398,
        orbitY: 120,
        detailParagraph:
            'Weightlifting keeps my process grounded in measurable progress. Training blocks, recovery windows, and deliberate form corrections all translate to engineering habits: break goals into cycles, review performance honestly, and improve one variable at a time. That consistency helps me stay focused across long projects and maintain intensity without burning out when the work gets dense.',
        media: [
            { id: 'lifting-program', kind: 'image', label: 'Program Block Placeholder' },
            { id: 'lifting-form-check', kind: 'video', label: 'Form Check Placeholder' },
            { id: 'lifting-progress', kind: 'image', label: 'Progress Chart Placeholder' },
        ],
    },
    {
        id: 'video-games',
        title: 'video games',
        copy: 'Competitive games taught me systems thinking and rapid decision making.',
        orbitX: -150,
        orbitY: 320,
        detailParagraph:
            'Competitive games trained my systems thinking early: economy management, timing windows, role coordination, and tradeoff analysis under pressure. I bring that same lens to product and platform work by modeling interactions as interconnected systems instead of isolated features. It is one of the reasons I enjoy complex architecture problems and real-time UX where strategy and execution both matter.',
        media: [
            { id: 'gaming-strategy-board', kind: 'image', label: 'Strategy Board Placeholder' },
            { id: 'gaming-match-clip', kind: 'video', label: 'Match Clip Placeholder' },
            { id: 'gaming-stats', kind: 'image', label: 'Performance Stats Placeholder' },
        ],
    },
];

const TOPIC_NODE_MAP = Object.fromEntries(TOPIC_NODES.map((node) => [node.id, node])) as Record<NodeId, TopicNode>;

const ABOUT_ORBIT_RX = 460;
const ABOUT_ORBIT_RY = 360;
const GRID_STEP = 12;
const SCARCITY_HALF_W = 150;
const SCARCITY_HALF_H = 78;
const SCARCITY_NEAR = 20;
const SCARCITY_FAR = 190;
const SCARCITY_MIN_KEEP = 0.16;
const MAX_CANVAS_DPR = 1.25;
const TARGET_FPS = 20;
const HIGH_DENSITY_FPS = 18;
const HIGH_DENSITY_DOT_THRESHOLD = 1800;
const HUE_SPEED_RAD = 0.45;
const HUE_SIGMA = 0.42;
const HUE_TAIL_SIGMA = 0.95;
const HUE_INTENSITY = 0.85;
const HUE_TAIL_WEIGHT = 0.25;
const RICH_BLUE = { r: 30, g: 90, b: 220 };
const BLEED_SAFETY_PX = 6;

type DetailMode = 'collapsed' | 'expanding' | 'expanded' | 'collapsing';

type OrbitStyleVars = React.CSSProperties & Record<'--orbit-x' | '--orbit-y', string>;

type BandSpec = {
    inner: number;
    outer: number;
    sizeMul: number;
    scaleMul: number;
    densityMul: number;
};

const BAND_CONFIG: BandSpec[] = [
    { inner: 0.88, outer: 1.08, sizeMul: 1.0, scaleMul: 1.0, densityMul: 1.0 },
    { inner: 0.74, outer: 0.88, sizeMul: 0.86, scaleMul: 0.9, densityMul: 0.92 },
    { inner: 0.6, outer: 0.74, sizeMul: 0.74, scaleMul: 0.82, densityMul: 0.74 },
    { inner: 0.46, outer: 0.6, sizeMul: 0.64, scaleMul: 0.74, densityMul: 0.46 },
    { inner: 0.32, outer: 0.46, sizeMul: 0.56, scaleMul: 0.68, densityMul: 0.26 },
    { inner: 0.2, outer: 0.32, sizeMul: 0.5, scaleMul: 0.62, densityMul: 0.12 },
];

type BreathingDot = {
    bandIndex: number;
    angle: number;
    x: number;
    y: number;
    size: number;
    scaleMin: number;
    scaleMax: number;
    omega: number;
    phase: number;
    alphaMin: number;
    alphaMax: number;
    grayDark: number;
    grayLight: number;
};

const hashCoord = (x: number, y: number, salt: number): number => {
    const value = Math.sin((x + 0.5) * 12.9898 + (y + 0.5) * 78.233 + salt * 37.719) * 43758.5453123;
    return value - Math.floor(value);
};

const smoothstep = (edge0: number, edge1: number, value: number): number => {
    if (value <= edge0) return 0;
    if (value >= edge1) return 1;
    const t = (value - edge0) / (edge1 - edge0);
    return t * t * (3 - 2 * t);
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const isPresent = <T,>(value: T | null | undefined): value is T => value != null;

const shortestAngularDistance = (a: number, b: number): number => {
    const TAU = Math.PI * 2;
    let diff = (a - b) % TAU;
    if (diff > Math.PI) diff -= TAU;
    if (diff < -Math.PI) diff += TAU;
    return diff;
};

const BREATHING_DOTS: BreathingDot[] = (() => {
    const dots: BreathingDot[] = [];
    const bandBounds = BAND_CONFIG.map((band) => ({
        innerSq: band.inner * band.inner,
        outerSq: band.outer * band.outer,
    }));

    for (let y = -ABOUT_ORBIT_RY, row = 0; y <= ABOUT_ORBIT_RY; y += GRID_STEP, row++) {
        // Staggered rows match the screenshot's hex-like spacing.
        const rowOffset = row % 2 === 0 ? 0 : GRID_STEP * 0.5;
        for (let x = -ABOUT_ORBIT_RX + rowOffset; x <= ABOUT_ORBIT_RX; x += GRID_STEP) {
            const metric = (x * x) / (ABOUT_ORBIT_RX * ABOUT_ORBIT_RX) + (y * y) / (ABOUT_ORBIT_RY * ABOUT_ORBIT_RY);

            let bandIndex = -1;
            for (let i = 0; i < bandBounds.length; i++) {
                const band = bandBounds[i];
                if (metric >= band.innerSq && metric <= band.outerSq) {
                    bandIndex = i;
                    break;
                }
            }
            if (bandIndex < 0) continue;

            const band = BAND_CONFIG[bandIndex];

            let minEdgeDistance = Number.POSITIVE_INFINITY;
            for (const node of TOPIC_NODES) {
                const dx = Math.max(Math.abs(x - node.orbitX) - SCARCITY_HALF_W, 0);
                const dy = Math.max(Math.abs(y - node.orbitY) - SCARCITY_HALF_H, 0);
                const edgeDistance = Math.hypot(dx, dy);
                if (edgeDistance < minEdgeDistance) minEdgeDistance = edgeDistance;
            }

            const spread = smoothstep(SCARCITY_NEAR, SCARCITY_FAR, minEdgeDistance);
            const scarcityKeep = SCARCITY_MIN_KEEP + (1 - SCARCITY_MIN_KEEP) * spread;
            const keepProbability = clamp01(scarcityKeep * band.densityMul);
            if (hashCoord(x, y, 11) > keepProbability) continue;

            const isLargeDot = hashCoord(x, y, 1) < 0.36;
            const baseSize = isLargeDot ? 6.6 : 4.2;
            const sizeJitter = (hashCoord(x, y, 14) - 0.5) * (isLargeDot ? 0.8 : 0.5);
            const dotSize = Math.max(2.0, (baseSize + sizeJitter) * band.sizeMul);
            const scaleMin = (0.64 + hashCoord(x, y, 2) * 0.12) * band.scaleMul;
            const scaleMax = (1.14 + hashCoord(x, y, 3) * 0.2) * band.scaleMul;
            const cycleSeconds = 1.55 + hashCoord(x, y, 4) * 0.75;
            const phase = hashCoord(x, y, 5) * Math.PI * 2;
            const alphaMin = 0.28 + hashCoord(x, y, 6) * 0.26;
            const alphaMax = Math.min(0.84, alphaMin + 0.2);
            const grayDark = 55 + hashCoord(x, y, 7) * 35;
            const grayLight = 170 + hashCoord(x, y, 8) * 50;
            const angle = Math.atan2(y, x);

            dots.push({
                bandIndex,
                angle,
                x,
                y,
                size: dotSize,
                scaleMin,
                scaleMax,
                omega: (Math.PI * 2) / cycleSeconds,
                phase,
                alphaMin,
                alphaMax,
                grayDark,
                grayLight,
            });
        }
    }

    return dots;
})();

const AboutMe: React.FC = () => {
    const sectionRef = useRef<HTMLElement>(null);
    const webCanvasRef = useRef<HTMLDivElement>(null);
    const dotsLayerRef = useRef<HTMLDivElement>(null);
    const dotsCanvasRef = useRef<HTMLCanvasElement>(null);

    const centerRef = useRef<HTMLDivElement>(null);
    const introRef = useRef<HTMLParagraphElement>(null);
    const subtitleRef = useRef<HTMLParagraphElement>(null);

    const detailsScrimRef = useRef<HTMLButtonElement>(null);
    const detailsPanelRef = useRef<HTMLDivElement>(null);
    const backButtonRef = useRef<HTMLButtonElement>(null);
    const detailsCopyRef = useRef<HTMLParagraphElement>(null);
    const detailsMediaRowRef = useRef<HTMLDivElement>(null);
    const detailsSwitchRef = useRef<HTMLDivElement>(null);

    const cardRefs = useRef<Record<NodeId, HTMLElement | null>>({
        'stop-motions': null,
        skiing: null,
        weightlifting: null,
        'video-games': null,
    });

    const openTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const closeTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const switchTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const transitionLockRef = useRef(false);
    const closeFallbackTimerRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);

    const [activeTopicId, setActiveTopicId] = useState<NodeId | null>(null);
    const [mode, setMode] = useState<DetailMode>('collapsed');
    const [isSwitchingTopic, setIsSwitchingTopic] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    const modeRef = useRef<DetailMode>(mode);
    const activeTopicIdRef = useRef<NodeId | null>(activeTopicId);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        activeTopicIdRef.current = activeTopicId;
    }, [activeTopicId]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);

        handleChange();

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    const setCardRef = useCallback((id: NodeId, card: HTMLElement | null) => {
        cardRefs.current[id] = card;
    }, []);

    const getCardElements = useCallback((): HTMLElement[] => {
        return TOPIC_NODES.map((node) => cardRefs.current[node.id]).filter(isPresent);
    }, []);

    const getImageElements = useCallback((): HTMLElement[] => {
        if (!sectionRef.current) return [];
        return Array.from(sectionRef.current.querySelectorAll<HTMLElement>('.about-image-node'));
    }, []);

    const getDetailContentTargets = useCallback((): HTMLElement[] => {
        const targets: Array<HTMLElement | null> = [
            subtitleRef.current,
            backButtonRef.current,
            detailsSwitchRef.current,
            detailsCopyRef.current,
            detailsMediaRowRef.current,
        ];

        return targets.filter(isPresent);
    }, []);

    const killTimelines = useCallback(() => {
        openTimelineRef.current?.kill();
        closeTimelineRef.current?.kill();
        switchTimelineRef.current?.kill();
        openTimelineRef.current = null;
        closeTimelineRef.current = null;
        switchTimelineRef.current = null;
    }, []);

    const clearCloseFallback = useCallback(() => {
        if (closeFallbackTimerRef.current !== null) {
            window.clearTimeout(closeFallbackTimerRef.current);
            closeFallbackTimerRef.current = null;
        }
    }, []);

    const getExpandedHeadingShift = useCallback(() => {
        const canvas = webCanvasRef.current;
        const center = centerRef.current;
        const backButton = backButtonRef.current;
        if (!canvas || !center) {
            return { x: 0, y: 0 };
        }

        // Mobile layout is already top-aligned; preserve that flow.
        if (window.innerWidth < 1200) {
            return { x: 0, y: 0 };
        }

        const canvasRect = canvas.getBoundingClientRect();
        const centerRect = center.getBoundingClientRect();
        const fallbackPaddingX = window.innerWidth < 760 ? 20 : 46;
        const fallbackPaddingY = window.innerWidth < 760 ? 14 : 34;

        let targetLeft = fallbackPaddingX;
        let targetTop = fallbackPaddingY;
        if (backButton) {
            const backRect = backButton.getBoundingClientRect();
            targetLeft = backRect.left - canvasRect.left;
            targetTop = backRect.bottom - canvasRect.top + 10;
        }

        const targetCenterX = targetLeft + centerRect.width * 0.5;
        const targetCenterY = targetTop + centerRect.height * 0.5;

        return {
            x: targetCenterX - canvasRect.width * 0.5,
            y: targetCenterY - canvasRect.height * 0.5,
        };
    }, []);

    const completeTransition = useCallback(() => {
        transitionLockRef.current = false;
        if (!isMountedRef.current) return;
        setIsSwitchingTopic(false);
    }, []);

    const switchTopic = useCallback(
        (nextTopicId: NodeId) => {
            if (transitionLockRef.current) return;
            if (modeRef.current !== 'expanded') return;
            if (activeTopicIdRef.current === nextTopicId) return;

            const subtitle = subtitleRef.current;
            const copy = detailsCopyRef.current;
            const mediaRow = detailsMediaRowRef.current;
            const switchRow = detailsSwitchRef.current;
            if (!subtitle || !copy || !mediaRow) {
                flushSync(() => {
                    setActiveTopicId(nextTopicId);
                });
                return;
            }

            killTimelines();
            transitionLockRef.current = true;
            setIsSwitchingTopic(true);

            const contentTargets: HTMLElement[] = [subtitle, copy, mediaRow, switchRow].filter(isPresent);
            const fadeOutDuration = prefersReducedMotion ? 0.08 : 0.18;
            const fadeInDuration = prefersReducedMotion ? 0.1 : 0.24;

            const timeline = gsap.timeline({
                onComplete: () => {
                    switchTimelineRef.current = null;
                    completeTransition();
                },
                onInterrupt: () => {
                    switchTimelineRef.current = null;
                    completeTransition();
                },
            });

            switchTimelineRef.current = timeline;

            timeline
                .to(contentTargets, {
                    autoAlpha: 0,
                    y: -8,
                    duration: fadeOutDuration,
                    ease: 'power1.inOut',
                })
                .add(() => {
                    flushSync(() => {
                        setActiveTopicId(nextTopicId);
                    });
                })
                .set(contentTargets, { y: 10 })
                .to(contentTargets, {
                    autoAlpha: 1,
                    y: 0,
                    duration: fadeInDuration,
                    ease: 'power2.out',
                    stagger: prefersReducedMotion ? 0 : 0.03,
                });
        },
        [completeTransition, killTimelines, prefersReducedMotion],
    );

    const openTopic = useCallback(
        (topicId: NodeId) => {
            if (transitionLockRef.current) return;

            if (modeRef.current === 'expanded') {
                switchTopic(topicId);
                return;
            }

            if (modeRef.current !== 'collapsed') return;

            const center = centerRef.current;
            const intro = introRef.current;
            const subtitle = subtitleRef.current;
            const scrim = detailsScrimRef.current;
            const panel = detailsPanelRef.current;
            const dotsLayer = dotsLayerRef.current;

            if (!center || !intro || !subtitle || !scrim || !panel || !dotsLayer) return;

            killTimelines();
            transitionLockRef.current = true;

            flushSync(() => {
                setActiveTopicId(topicId);
                setMode('expanding');
                setIsSwitchingTopic(false);
            });

            const cardElements = getCardElements();
            const imageElements = getImageElements();
            const contentTargets = getDetailContentTargets();
            const subduedTargets = [dotsLayer, ...imageElements];
            const headingShift = getExpandedHeadingShift();

            const cardFadeDuration = prefersReducedMotion ? 0.12 : 0.34;
            const headingMoveDuration = prefersReducedMotion ? 0.16 : 0.58;
            const panelDuration = prefersReducedMotion ? 0.14 : 0.36;
            const contentDuration = prefersReducedMotion ? 0.1 : 0.28;

            const timeline = gsap.timeline({
                onComplete: () => {
                    openTimelineRef.current = null;
                    if (!isMountedRef.current) {
                        completeTransition();
                        return;
                    }
                    setMode('expanded');
                    completeTransition();
                },
                onInterrupt: () => {
                    openTimelineRef.current = null;
                    completeTransition();
                },
            });

            openTimelineRef.current = timeline;

            timeline.set([scrim, panel], {
                visibility: 'visible',
                pointerEvents: 'auto',
            });

            if (cardElements.length > 0) {
                timeline.to(
                    cardElements,
                    {
                        autoAlpha: 0,
                        y: 16,
                        scale: 0.94,
                        duration: cardFadeDuration,
                        ease: 'power2.inOut',
                        stagger: prefersReducedMotion ? 0 : 0.03,
                    },
                    0,
                );
            }

            timeline.to(
                intro,
                {
                    autoAlpha: 0,
                    y: 14,
                    duration: cardFadeDuration,
                    ease: 'power2.inOut',
                },
                0,
            );

            if (subduedTargets.length > 0) {
                timeline.to(
                    subduedTargets,
                    {
                        opacity: 0.08,
                        duration: panelDuration,
                        ease: 'power1.out',
                    },
                    0,
                );
            }

            timeline.to(
                center,
                {
                    x: headingShift.x,
                    y: headingShift.y,
                    duration: headingMoveDuration,
                    ease: prefersReducedMotion ? 'power1.out' : 'power3.inOut',
                },
                0.02,
            );

            timeline.fromTo(
                scrim,
                { autoAlpha: 0 },
                {
                    autoAlpha: 1,
                    duration: panelDuration,
                    ease: 'power1.out',
                },
                0.08,
            );

            timeline.fromTo(
                panel,
                { autoAlpha: 0, y: prefersReducedMotion ? 8 : 20 },
                {
                    autoAlpha: 1,
                    y: 0,
                    duration: panelDuration,
                    ease: 'power2.out',
                },
                0.12,
            );

            if (contentTargets.length > 0) {
                timeline.fromTo(
                    contentTargets,
                    { autoAlpha: 0, y: 10 },
                    {
                        autoAlpha: 1,
                        y: 0,
                        duration: contentDuration,
                        ease: 'power2.out',
                        stagger: prefersReducedMotion ? 0 : 0.03,
                    },
                    0.18,
                );
            }
        },
        [
            completeTransition,
            getCardElements,
            getDetailContentTargets,
            getExpandedHeadingShift,
            getImageElements,
            killTimelines,
            prefersReducedMotion,
            switchTopic,
        ],
    );

    const closeTopic = useCallback(() => {
        if (transitionLockRef.current) return;
        if (modeRef.current !== 'expanded' && modeRef.current !== 'expanding') return;

        const center = centerRef.current;
        const intro = introRef.current;
        const subtitle = subtitleRef.current;
        const scrim = detailsScrimRef.current;
        const panel = detailsPanelRef.current;
        const dotsLayer = dotsLayerRef.current;

        if (!center || !intro || !scrim || !panel || !dotsLayer || !subtitle) return;

        killTimelines();
        transitionLockRef.current = true;
        setMode('collapsing');

        const cardElements = getCardElements();
        const imageElements = getImageElements();
        const contentTargets = getDetailContentTargets();
        const restoreTargets = [dotsLayer, ...imageElements];

        const contentFadeDuration = prefersReducedMotion ? 0.1 : 0.24;
        const headingMoveDuration = prefersReducedMotion ? 0.14 : 0.52;
        const restoreDuration = prefersReducedMotion ? 0.14 : 0.36;
        let didFinalize = false;

        const finalizeClose = () => {
            if (didFinalize) return;
            didFinalize = true;
            clearCloseFallback();
            closeTimelineRef.current = null;
            gsap.set([scrim, panel], {
                visibility: 'hidden',
                pointerEvents: 'none',
            });
            if (cardElements.length > 0) {
                gsap.set(cardElements, { clearProps: 'x,y,scale,opacity,visibility' });
            }
            gsap.set(center, { clearProps: 'x,y,transform' });
            gsap.set(intro, { clearProps: 'opacity,visibility,y' });
            gsap.set(subtitle, { autoAlpha: 0, y: 10 });
            if (restoreTargets.length > 0) {
                gsap.set(restoreTargets, { clearProps: 'opacity' });
            }
            if (!isMountedRef.current) {
                completeTransition();
                return;
            }
            flushSync(() => {
                setMode('collapsed');
                setActiveTopicId(null);
                setIsSwitchingTopic(false);
            });
            completeTransition();
        };

        const timeline = gsap.timeline({
            onComplete: finalizeClose,
            onInterrupt: finalizeClose,
        });

        closeTimelineRef.current = timeline;
        clearCloseFallback();
        closeFallbackTimerRef.current = window.setTimeout(
            finalizeClose,
            Math.max(420, (contentFadeDuration + headingMoveDuration + restoreDuration + 0.22) * 1000),
        );

        if (contentTargets.length > 0) {
            timeline.to(
                contentTargets,
                {
                    autoAlpha: 0,
                    y: 8,
                    duration: contentFadeDuration,
                    ease: 'power2.inOut',
                },
                0,
            );
        }

        timeline.to(
            panel,
            {
                autoAlpha: 0,
                y: prefersReducedMotion ? 6 : 16,
                duration: contentFadeDuration,
                ease: 'power2.inOut',
            },
            0.02,
        );

        timeline.to(
            scrim,
            {
                autoAlpha: 0,
                duration: contentFadeDuration,
                ease: 'power1.out',
            },
            0.02,
        );

        timeline.to(
            center,
            {
                x: 0,
                y: 0,
                duration: headingMoveDuration,
                ease: prefersReducedMotion ? 'power1.out' : 'power3.inOut',
            },
            0,
        );

        timeline.to(
            intro,
            {
                autoAlpha: 1,
                y: 0,
                duration: restoreDuration,
                ease: 'power2.out',
            },
            0.12,
        );

        if (cardElements.length > 0) {
            timeline.to(
                cardElements,
                {
                    autoAlpha: 1,
                    y: 0,
                    scale: 1,
                    duration: restoreDuration,
                    ease: 'power2.out',
                    stagger: prefersReducedMotion ? 0 : 0.03,
                },
                0.1,
            );
        }

        if (restoreTargets.length > 0) {
            timeline.to(
                restoreTargets,
                {
                    opacity: 1,
                    duration: restoreDuration,
                    ease: 'power1.out',
                },
                0.06,
            );
        }

        timeline.set([scrim, panel], {
            visibility: 'hidden',
            pointerEvents: 'none',
        });
    }, [
        clearCloseFallback,
        completeTransition,
        getCardElements,
        getDetailContentTargets,
        getImageElements,
        killTimelines,
        prefersReducedMotion,
    ]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (modeRef.current !== 'expanded') return;
            event.preventDefault();
            closeTopic();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeTopic]);

    useEffect(() => {
        const canvas = webCanvasRef.current;
        const center = centerRef.current;
        if (!canvas || !center) return;

        const resizeObserver = new ResizeObserver(() => {
            const currentMode = modeRef.current;
            if (currentMode !== 'expanded' && currentMode !== 'expanding') return;
            const shift = getExpandedHeadingShift();
            gsap.set(center, {
                x: shift.x,
                y: shift.y,
            });
        });

        resizeObserver.observe(canvas);
        return () => resizeObserver.disconnect();
    }, [getExpandedHeadingShift]);

    useLayoutEffect(() => {
        const context = gsap.context(() => {
            if (detailsScrimRef.current) {
                gsap.set(detailsScrimRef.current, {
                    autoAlpha: 0,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                });
            }

            if (detailsPanelRef.current) {
                gsap.set(detailsPanelRef.current, {
                    autoAlpha: 0,
                    y: 20,
                    visibility: 'hidden',
                    pointerEvents: 'none',
                });
            }

            if (subtitleRef.current) {
                gsap.set(subtitleRef.current, {
                    autoAlpha: 0,
                    y: 10,
                });
            }
        }, sectionRef);

        return () => context.revert();
    }, []);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            clearCloseFallback();
            killTimelines();
        };
    }, [clearCloseFallback, killTimelines]);

    useEffect(() => {
        const dotsLayer = dotsLayerRef.current;
        const dotsCanvas = dotsCanvasRef.current;
        if (!dotsLayer || !dotsCanvas) return;

        const ctx = dotsCanvas.getContext('2d', { alpha: true, desynchronized: true });
        if (!ctx) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const targetFps = BREATHING_DOTS.length > HIGH_DENSITY_DOT_THRESHOLD ? HIGH_DENSITY_FPS : TARGET_FPS;
        const frameIntervalMs = 1000 / targetFps;

        let drawWidth = 0;
        let drawHeight = 0;
        let drawBleed = BLEED_SAFETY_PX;
        let inView = true;
        let pageVisible = document.visibilityState === 'visible';
        let rafId = 0;
        let lastPaintAt = 0;

        const renderFrame = (timeSeconds: number, staticFrame: boolean) => {
            if (drawWidth <= 0 || drawHeight <= 0) return;

            ctx.clearRect(0, 0, drawWidth, drawHeight);

            const centerX = drawWidth * 0.5;
            const centerY = drawHeight * 0.5;
            const sweepAngle = staticFrame ? Math.PI * 0.62 : timeSeconds * HUE_SPEED_RAD;
            const globalExpansion = staticFrame ? 0.62 : 0.5 + 0.5 * Math.sin(timeSeconds * 3.1);

            for (let i = 0; i < BREATHING_DOTS.length; i++) {
                const dot = BREATHING_DOTS[i];
                const localPulse = staticFrame ? 0.55 : 0.5 + 0.5 * Math.sin(timeSeconds * dot.omega + dot.phase);
                const pulse = clamp01(0.32 + 0.68 * (localPulse * 0.58 + globalExpansion * 0.42));
                const scale = dot.scaleMin + (dot.scaleMax - dot.scaleMin) * pulse;
                const radius = dot.size * scale * 0.5;
                const alpha = dot.alphaMin + (dot.alphaMax - dot.alphaMin) * pulse;
                const grayStrength = Math.pow(pulse, 0.95);
                const baseGray = dot.grayDark + (dot.grayLight - dot.grayDark) * grayStrength;

                const dist = shortestAngularDistance(dot.angle, sweepAngle);
                const maskCore = Math.exp(-(dist * dist) / (2 * HUE_SIGMA * HUE_SIGMA));
                const maskTail =
                    Math.exp(-(dist * dist) / (2 * HUE_TAIL_SIGMA * HUE_TAIL_SIGMA)) * HUE_TAIL_WEIGHT;
                const hueMask = clamp01((maskCore + maskTail) * HUE_INTENSITY);

                const red = baseGray + (RICH_BLUE.r - baseGray) * hueMask;
                const green = baseGray + (RICH_BLUE.g - baseGray) * hueMask;
                const blue = baseGray + (RICH_BLUE.b - baseGray) * hueMask;
                ctx.fillStyle = `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
                ctx.beginPath();
                ctx.arc(centerX + dot.x, centerY + dot.y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        const measure = () => {
            const rect = dotsLayer.getBoundingClientRect();
            const nextWidth = Math.floor(rect.width);
            const nextHeight = Math.floor(rect.height);

            if (nextWidth <= 0 || nextHeight <= 0) {
                drawWidth = 0;
                drawHeight = 0;
                drawBleed = BLEED_SAFETY_PX;
                dotsCanvas.width = 1;
                dotsCanvas.height = 1;
                ctx.clearRect(0, 0, 1, 1);
                return;
            }

            const halfLayerW = nextWidth * 0.5;
            const halfLayerH = nextHeight * 0.5;

            let maxExtentX = 0;
            let maxExtentY = 0;
            for (let i = 0; i < BREATHING_DOTS.length; i++) {
                const dot = BREATHING_DOTS[i];
                const radiusMax = dot.size * dot.scaleMax * 0.5;
                const extentX = Math.abs(dot.x) + radiusMax;
                const extentY = Math.abs(dot.y) + radiusMax;
                if (extentX > maxExtentX) maxExtentX = extentX;
                if (extentY > maxExtentY) maxExtentY = extentY;
            }

            const bleedX = Math.ceil(Math.max(0, maxExtentX - halfLayerW)) + BLEED_SAFETY_PX;
            const bleedY = Math.ceil(Math.max(0, maxExtentY - halfLayerH)) + BLEED_SAFETY_PX;
            drawBleed = Math.max(bleedX, bleedY, BLEED_SAFETY_PX);

            drawWidth = nextWidth + drawBleed * 2;
            drawHeight = nextHeight + drawBleed * 2;

            const dpr = Math.min(MAX_CANVAS_DPR, window.devicePixelRatio || 1);
            dotsCanvas.width = Math.max(1, Math.floor(drawWidth * dpr));
            dotsCanvas.height = Math.max(1, Math.floor(drawHeight * dpr));
            dotsCanvas.style.width = `${drawWidth}px`;
            dotsCanvas.style.height = `${drawHeight}px`;
            dotsCanvas.style.transform = `translate(${-drawBleed}px, ${-drawBleed}px)`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            renderFrame(performance.now() / 1000, true);
        };

        const onVisibilityChange = () => {
            pageVisible = document.visibilityState === 'visible';
            if (pageVisible) {
                renderFrame(performance.now() / 1000, reducedMotion);
            }
        };

        const tick = (now: number) => {
            rafId = window.requestAnimationFrame(tick);
            if (reducedMotion || !inView || !pageVisible) return;
            if (now - lastPaintAt < frameIntervalMs) return;

            lastPaintAt = now;
            renderFrame(now / 1000, false);
        };

        const io = new IntersectionObserver(
            ([entry]) => {
                if (!entry) return;
                inView = entry.isIntersecting;
                if (inView) {
                    renderFrame(performance.now() / 1000, reducedMotion);
                }
            },
            { threshold: 0.01, rootMargin: '180px' },
        );
        io.observe(dotsLayer);

        const ro = new ResizeObserver(() => {
            measure();
        });
        ro.observe(dotsLayer);

        document.addEventListener('visibilitychange', onVisibilityChange);
        measure();

        if (!reducedMotion) {
            rafId = window.requestAnimationFrame(tick);
        }

        return () => {
            window.cancelAnimationFrame(rafId);
            io.disconnect();
            ro.disconnect();
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    const activeTopic = activeTopicId ? TOPIC_NODE_MAP[activeTopicId] : null;
    const isExpanded = mode === 'expanded';
    const isDockedHeading = mode === 'expanding' || mode === 'expanded';
    const isDetailVisible = mode !== 'collapsed';
    const isTransitioning = mode === 'expanding' || mode === 'collapsing' || isSwitchingTopic;
    const areCardButtonsDisabled = isTransitioning || mode !== 'collapsed';

    return (
        <section id="about-me" className="about-section" aria-labelledby="about-me-title" ref={sectionRef}>
            <div className="about-inner">
                <div className="about-web-canvas" ref={webCanvasRef}>
                    <div className="about-breathing-dots" aria-hidden="true" ref={dotsLayerRef}>
                        <canvas ref={dotsCanvasRef} className="about-breathing-dots-canvas" />
                    </div>

                    <figure className="about-image-node about-orbit-node about-image-ski" aria-hidden="true">
                        <img src="/images/about_me/ski.png" alt="" loading="lazy" />
                    </figure>

                    {TOPIC_NODES.map((node) => {
                        const isActive = activeTopicId === node.id;
                        return (
                            <article
                                key={node.id}
                                ref={(card) => setCardRef(node.id, card)}
                                className={`about-node-card about-orbit-node about-node-${node.id}`}
                                aria-labelledby={`about-${node.id}-title`}
                                style={{
                                    '--orbit-x': `${node.orbitX}px`,
                                    '--orbit-y': `${node.orbitY}px`,
                                } as OrbitStyleVars}
                            >
                                <h3 id={`about-${node.id}-title`} className="about-node-title">
                                    {node.title}
                                </h3>
                                <p className="about-node-copy">{node.copy}</p>
                                <button
                                    type="button"
                                    className="about-node-cta"
                                    aria-controls="about-details-panel"
                                    aria-expanded={isExpanded && isActive}
                                    disabled={areCardButtonsDisabled}
                                    onClick={() => openTopic(node.id)}
                                >
                                    View details
                                </button>
                            </article>
                        );
                    })}

                    <div className={`about-node-center ${isDockedHeading ? 'is-expanded' : ''}`} ref={centerRef}>
                        <h2 id="about-me-title" className="about-title">
                            About Me
                        </h2>
                        <p className="about-details-subtitle" ref={subtitleRef} aria-live="polite">
                            {activeTopic?.title ?? ''}
                        </p>
                        <p className="about-intro" ref={introRef}>
                            I started coding at 13 by learning HTML through freeCodeCamp, and by 14 during my
                            freshman year of high school I was already building products. I studied Computer Science at
                            the University of Utah, where I also discovered how much I love skiing. I love gym
                            culture, I am a huge San Jose Sharks fan, and I created stop motions all through
                            elementary and middle school as my creative outlet before that creativity shifted into
                            coding.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="about-details-scrim"
                        ref={detailsScrimRef}
                        aria-label="Close about details"
                        aria-hidden={!isDetailVisible}
                        tabIndex={isExpanded ? 0 : -1}
                        onClick={closeTopic}
                    />

                    <div
                        id="about-details-panel"
                        className="about-details-panel"
                        ref={detailsPanelRef}
                        aria-hidden={!isDetailVisible}
                    >
                        <button
                            type="button"
                            className="about-details-back"
                            ref={backButtonRef}
                            aria-label="Back to about overview"
                            onClick={closeTopic}
                        >
                            <span aria-hidden="true" className="about-details-back-arrow">
                                ←
                            </span>
                            <span>Back</span>
                        </button>

                        <div className="about-details-topic-switch" ref={detailsSwitchRef}>
                            {TOPIC_NODES.map((node) => {
                                const isActive = activeTopicId === node.id;
                                return (
                                    <button
                                        key={`switch-${node.id}`}
                                        type="button"
                                        className={`about-details-topic-pill ${isActive ? 'is-active' : ''}`}
                                        onClick={() => openTopic(node.id)}
                                        aria-pressed={isActive}
                                        disabled={!isExpanded || isSwitchingTopic || isActive}
                                    >
                                        {node.title}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="about-details-copy" ref={detailsCopyRef}>
                            {activeTopic?.detailParagraph ?? ''}
                        </p>

                        <div className="about-details-media-row" ref={detailsMediaRowRef}>
                            {(activeTopic?.media ?? []).map((entry) => (
                                <article
                                    key={entry.id}
                                    className={`about-media-placeholder about-media-placeholder-${entry.kind}`}
                                    aria-label={`${entry.kind} placeholder: ${entry.label}`}
                                >
                                    <span className="about-media-kind">{entry.kind}</span>
                                    <strong className="about-media-label">{entry.label}</strong>
                                </article>
                            ))}
                        </div>
                    </div>

                    <figure className="about-image-node about-orbit-node about-image-normal" aria-hidden="true">
                        <img src="/images/about_me/normal.png" alt="" loading="lazy" />
                    </figure>
                </div>
            </div>
        </section>
    );
};

export default AboutMe;
