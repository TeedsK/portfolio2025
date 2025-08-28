import React, { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import Lottie from 'lottie-react';
import { Skeleton } from 'antd';
import './SmartLinkedCode.css';

/* -------------------- Examples (prompt + text) -------------------- */
type Example = {
    name: string;
    badHeadline: string;
    goodHeadline: string;
    prompt: string;
};

const EXAMPLES: Example[] = [
    {
        name: 'Michael Chen',
        badHeadline: 'Software developer working with web technologies',
        goodHeadline: 'Senior Software Developer · Full‑Stack · JavaScript & Python',
        prompt:
            'Make my profile stand out to recruiters in the web development field.',
    },
    {
        name: 'Ava Patel',
        badHeadline: 'Web Developer',
        goodHeadline: 'Expert Web Developer · Front‑End (React) · UX & Responsive Design',
        prompt:
            'Rewrite my profile to target front-end roles.',
    },
];

/* -------------------- Lottie sets + color map -------------------- */
import mFro from '@assets/profilePictures/messy/fro.json';
import mBeard from '@assets/profilePictures/messy/beard.json';
import mGlasses from '@assets/profilePictures/messy/glasses.json';
import mHair from '@assets/profilePictures/messy/hair.json';
import mPuff from '@assets/profilePictures/messy/puff.json';
import mStache from '@assets/profilePictures/messy/stache.json';

import cFro from '@assets/profilePictures/clean/fro.json';
import cBeard from '@assets/profilePictures/clean/beard.json';
import cGlasses from '@assets/profilePictures/clean/glasses.json';
import cHair from '@assets/profilePictures/clean/hair.json';
import cPuff from '@assets/profilePictures/clean/puff.json';
import cStache from '@assets/profilePictures/clean/stache.json';

// [messy, clean, bannerColor]
const animationMap: [any, any, string][] = [
    [mFro, cFro, '#de9c41'],
    [mBeard, cBeard, '#37bf66'],
    [mGlasses, cGlasses, '#c5958b'],
    [mHair, cHair, '#dba200'],
    [mPuff, cPuff, '#7c78e3'],
    [mStache, cStache, '#e883a1'],
];

/* -------------------- Timing -------------------- */
const STEP_GAP = 0.45;
const DRAW_DURATION = 0.70;
const SEND_DURATION = 0.65;         // “tail follows head” time
const HOLD_AFTER_UPGRADE = 0.9;
const HOLD_BEFORE_NEXT = 2.0;
// Faster typing (you asked for a quick prompt type-in)
const TYPE_SPEED = 60;

/** Orthogonal path helper – only H/V movement */
function orth(
    from: { x: number; y: number },
    to: { x: number; y: number },
    hv: 'h-then-v' | 'v-then-h' = 'h-then-v'
) {
    return hv === 'h-then-v'
        ? `M ${from.x},${from.y} H ${to.x} V ${to.y}`
        : `M ${from.x},${from.y} V ${to.y} H ${to.x}`;
}

type RectLite = { x: number; y: number; w: number; h: number };

const SmartLinkedCode: React.FC<{ play?: boolean }> = ({ play = false }) => {
    const [exIndex, setExIndex] = useState(0);
    const [aniIndex, setAniIndex] = useState(() => Math.floor(Math.random() * animationMap.length));
    const ex = useMemo(() => EXAMPLES[exIndex % EXAMPLES.length], [exIndex]);

    /* -------------------- Refs -------------------- */
    const stageRef = useRef<HTMLDivElement | null>(null);
    const bannerRef = useRef<HTMLDivElement | null>(null);

    const avatarWrapRef = useRef<HTMLDivElement | null>(null);
    const nameRef = useRef<HTMLDivElement | null>(null);

    // New: fixed headline "slot" that anchors both bad and good headlines to the exact same position
    const headSlotRef = useRef<HTMLDivElement | null>(null);
    const headBadRef = useRef<HTMLDivElement | null>(null);
    const headGoodRef = useRef<HTMLDivElement | null>(null);

    const bubbleRef = useRef<HTMLDivElement | null>(null);
    const bubbleTextRef = useRef<HTMLSpanElement | null>(null);

    const squareLRef = useRef<HTMLDivElement | null>(null);
    const squareRRef = useRef<HTMLDivElement | null>(null);

    const svgRef = useRef<SVGSVGElement | null>(null);
    const pathARef = useRef<SVGPathElement | null>(null);
    const pathBRef = useRef<SVGPathElement | null>(null);

    // Skeleton overlay refs (banner, avatar, headline)
    const skelWrapRef = useRef<HTMLDivElement | null>(null);
    const skelBannerRef = useRef<HTMLDivElement | null>(null);
    const skelAvatarRef = useRef<HTMLDivElement | null>(null);
    const skelHeadWrapRef = useRef<HTMLDivElement | null>(null);

    const [typed, setTyped] = useState('');
    const [headlineLines, setHeadlineLines] = useState(1); // 1 or 2
    const [isSkeletonActive, setIsSkeletonActive] = useState(false);

    // Lock reactive layout updates while sending lines (prevents jitter).
    const pathUpdatesLockedRef = useRef(false);

    // NEW: freeze skeleton rects for stability (no width/position “wobble”)
    const frozenSkelRectsRef = useRef<{
        banner: RectLite;
        avatar: RectLite;
        headline: RectLite;
    } | null>(null);

    /* -------------------- Helpers -------------------- */
    const getStageRect = () => stageRef.current!.getBoundingClientRect();
    const toLocal = (r: DOMRect): RectLite => {
        const S = getStageRect();
        return { x: r.left - S.left, y: r.top - S.top, w: r.width, h: r.height };
    };

    const randomSquareY = (stageH: number) => {
        const pad = 24;
        const min = pad;
        const max = Math.max(pad, stageH - pad - 56);
        return Math.round(min + Math.random() * (max - min));
    };

    /** Place squares INSIDE stage (no horizontal overflow) */
    const clampSquaresInside = () => {
        const stage = stageRef.current;
        if (!stage) return;
        const S = stage.getBoundingClientRect();

        const leftX = 12;
        const rightX = Math.max(12, S.width - 54 - 12);
        const topL = randomSquareY(S.height);
        const topR = randomSquareY(S.height);

        gsap.set(squareLRef.current, { left: leftX, top: topL, transformOrigin: '50% 50%' });
        gsap.set(squareRRef.current, { left: rightX, top: topR, transformOrigin: '50% 50%' });
    };

    const updateBubbleRadius = () => {
        const t = bubbleTextRef.current;
        const b = bubbleRef.current;
        if (!t || !b) return;
        const style = window.getComputedStyle(t);
        const lh = parseFloat(style.lineHeight || '20');
        const isMulti = t.scrollHeight > lh * 1.25;
        b.classList.toggle('is-multiline', isMulti);
    };

    /** Capture pixel-perfect skeleton positions exactly once when switching to skeletons. */
    const freezeSkeletonRects = () => {
        const banner = bannerRef.current!;
        const avatar = avatarWrapRef.current!;
        const headSlot = headSlotRef.current!;
        frozenSkelRectsRef.current = {
            banner: toLocal(banner.getBoundingClientRect()),
            avatar: toLocal(avatar.getBoundingClientRect()),
            headline: toLocal(headSlot.getBoundingClientRect()),
        };
    };

    /** Position the skeleton overlay elements. If frozen rects exist, reuse them exactly. */
    const measureAndPositionSkeleton = () => {
        const skWrap = skelWrapRef.current;
        const skBanner = skelBannerRef.current;
        const skAvatar = skelAvatarRef.current;
        const skHead = skelHeadWrapRef.current;
        if (!skWrap || !skBanner || !skAvatar || !skHead) return;
        const S = getStageRect();

        const place = (node: HTMLElement, rect: RectLite) => {
            gsap.set(node, {
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
            });
        };

        // Prefer frozen rects to eliminate jitter during skeleton phase
        const rects = frozenSkelRectsRef.current ?? {
            banner: toLocal(bannerRef.current!.getBoundingClientRect()),
            avatar: toLocal(avatarWrapRef.current!.getBoundingClientRect()),
            headline: toLocal(headSlotRef.current!.getBoundingClientRect()),
        };

        place(skBanner, rects.banner);
        place(skAvatar, rects.avatar);
        place(skHead, rects.headline);

        // Decide 1–2 lines based on headline length (use max of bad/good length)
        const longChars = Math.max(ex.badHeadline.length, ex.goodHeadline.length);
        setHeadlineLines(longChars > 42 ? 2 : 1);
    };

    /** Update connector paths (square centers → target centers).
     *  During skeleton: headline target is RIGHT EDGE of the skeleton block.
     *  Otherwise: RIGHT EDGE of the headline slot (unchanging anchor). */
    const updatePaths = (resetDash = false, force = false) => {
        if (pathUpdatesLockedRef.current && !force) return;
        const stage = stageRef.current;
        if (!stage) return;

        const S = stage.getBoundingClientRect();
        if (!(S.width > 0 && S.height > 0)) return;

        const left = squareLRef.current!;
        const right = squareRRef.current!;
        const avatar = avatarWrapRef.current!;

        const headlineTargetEl = isSkeletonActive ? skelHeadWrapRef.current! : headSlotRef.current!;
        const l = toLocal(left.getBoundingClientRect());
        const r = toLocal(right.getBoundingClientRect());
        const a = toLocal(avatar.getBoundingClientRect());
        const h = toLocal(headlineTargetEl.getBoundingClientRect());

        const pA = pathARef.current!;
        const pB = pathBRef.current!;

        // AVATAR: center of left square → center of avatar
        const fromL = { x: l.x + l.w / 2, y: l.y + l.h / 2 };
        const avatarTarget = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        pA.setAttribute('d', orth(fromL, avatarTarget, 'h-then-v'));

        // HEADLINE: center of right square → RIGHT EDGE midpoint of (skeleton OR slot)
        const fromR = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const headTarget = { x: h.x + h.w - 2, y: h.y + h.h / 2 };
        pB.setAttribute('d', orth(fromR, headTarget, 'v-then-h'));

        if (resetDash) {
            const lenA = Math.max(0.0001, pA.getTotalLength());
            const lenB = Math.max(0.0001, pB.getTotalLength());
            pA.style.strokeDasharray = `${lenA} ${lenA}`;
            pA.style.strokeDashoffset = `${lenA}`;
            pB.style.strokeDasharray = `${lenB} ${lenB}`;
            pB.style.strokeDashoffset = `${lenB}`;
        }
    };

    /** Smooth "send": draw head to target, then tail follows the same path to meet the head. */
    const sendLine = (
        path: SVGPathElement,
        {
            draw = DRAW_DURATION,
            send = SEND_DURATION,
            onHeadConnect,
        }: { draw?: number; send?: number; onHeadConnect?: () => void } = {}
    ) => {
        const len = Math.max(0.0001, path.getTotalLength());
        gsap.set(path, { autoAlpha: 1, strokeDasharray: `${len} ${len}`, strokeDashoffset: len });

        const tl = gsap.timeline();

        // Phase 1 — draw head to target
        tl.to(path, {
            strokeDashoffset: 0,
            duration: draw,
            ease: 'power2.inOut',
            onComplete: onHeadConnect,
        });

        // Phase 2 — tail travels to the head (segment shrinks from the square end)
        const state = { tail: 0 };
        tl.to(state, {
            tail: len,
            duration: send,
            ease: 'power1.inOut',
            onUpdate: () => {
                const seg = Math.max(0.0001, len - state.tail);
                path.style.strokeDasharray = `${seg} ${len}`;
                path.style.strokeDashoffset = `${state.tail}`;
            },
            onComplete: () => {
                path.style.opacity = '0';
            }
        });

        return tl;
    };

    useEffect(() => {
        const ro = new ResizeObserver(() => {
            clampSquaresInside();
            // Keep paths/skeletons steady; if skeleton active and frozen, reuse frozen rects
            measureAndPositionSkeleton();
            updatePaths(false /* resetDash */, false /* force */);
        });
        if (stageRef.current) ro.observe(stageRef.current);
        if (headSlotRef.current) ro.observe(headSlotRef.current);
        return () => ro.disconnect();
    }, []);

    const typePrompt = (text: string) => {
        setTyped('');
        const start = performance.now();
        const tick = () => {
            const elapsed = (performance.now() - start) / 1000;
            const n = Math.min(text.length, Math.floor(elapsed * TYPE_SPEED));
            setTyped(text.slice(0, n));
            updateBubbleRadius();
            if (n >= text.length) return;
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };

    const tlRef = useRef<gsap.core.Timeline | null>(null);
    const stop = () => { tlRef.current?.kill(); tlRef.current = null; };

    const reset = () => {
        setTyped('');
        gsap.set(stageRef.current, { opacity: 1, y: 0 });

        // originals visible flags
        gsap.set([bannerRef.current, avatarWrapRef.current, nameRef.current, headSlotRef.current], {
            autoAlpha: 0, y: 10, scale: 1
        });
        gsap.set(headBadRef.current, { autoAlpha: 1, y: 0, display: 'block', scale: 1 });
        gsap.set(headGoodRef.current, { autoAlpha: 0, y: 0, display: 'none', scale: 1 });

        // bubble (minimal)
        gsap.set(bubbleRef.current, { autoAlpha: 0, y: 8 });
        gsap.set(bubbleTextRef.current, { opacity: 1 });

        // squares/paths
        gsap.set([squareLRef.current, squareRRef.current], { autoAlpha: 0, scale: 0.6 });
        gsap.set([pathARef.current, pathBRef.current], { autoAlpha: 0, clearProps: 'strokeDasharray,strokeDashoffset,opacity' });

        // avatar state
        avatarWrapRef.current?.classList.remove('clean');
        avatarWrapRef.current?.classList.add('messy');
        gsap.set('.slk2-lottie--messy', { autoAlpha: 1 });
        gsap.set('.slk2-lottie--clean', { autoAlpha: 0 });

        // skeleton overlay
        gsap.set(skelWrapRef.current, { autoAlpha: 0, scale: 0.98 });
        setIsSkeletonActive(false);
        frozenSkelRectsRef.current = null;

        pathUpdatesLockedRef.current = false;
    };

    /** Minimal submit animation: smoothly “commit” the prompt by dimming/opacifying the text */
    const playSubmitAnimation = () => {
        const tl = gsap.timeline({ defaults: { ease: 'power1.out' } });
        tl.to(bubbleTextRef.current, { opacity: 0.4, duration: 0.28 });
        tl.to(bubbleRef.current, { y: 0, duration: 0.20 }, '<');
        return tl;
    };

    const build = () => {
        stop();
        reset();

        setAniIndex(Math.floor(Math.random() * animationMap.length));

        const tl = gsap.timeline({
            defaults: { ease: 'power2.out' },
            onComplete: () => {
                gsap.to(stageRef.current, {
                    opacity: 0, y: -8, duration: 0.35, ease: 'power1.inOut',
                    onComplete: () => gsap.delayedCall(HOLD_BEFORE_NEXT, () =>
                        setExIndex((v) => (v + 1) % EXAMPLES.length)
                    ),
                });
            }
        });

        // Prepare squares & initial skeleton measurements (no overflow; accurate positioning)
        tl.add(() => {
            clampSquaresInside();
            measureAndPositionSkeleton();
        });

        // Step 1: intro (basic profile)
        tl.to([bannerRef.current, avatarWrapRef.current], { autoAlpha: 1, y: 0, duration: 0.55 });
        tl.to([nameRef.current, headSlotRef.current], { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.06 }, '-=0.18');
        tl.to({}, { duration: STEP_GAP });

        // Step 2: prompt typing + submit (minimal bubble)
        const typingDuration = ex.prompt.length / TYPE_SPEED;
        tl.to(bubbleRef.current, { autoAlpha: 1, y: -4, duration: 0.35 });
        tl.add(() => typePrompt(ex.prompt));
        tl.to({}, { duration: typingDuration });
        tl.add(playSubmitAnimation);

        // Switch to SKELETONS while processing (freeze rects to keep banner/headline rock-steady)
        tl.addLabel('toSkeleton');
        tl.add(() => {
            setIsSkeletonActive(true);
            freezeSkeletonRects();
            measureAndPositionSkeleton();
        }, 'toSkeleton');
        tl.to([bannerRef.current, headBadRef.current, '.slk2-lottie--messy'], {
            autoAlpha: 0, scale: 0.96, duration: 0.18, ease: 'power1.inOut'
        }, 'toSkeleton');
        tl.to(avatarWrapRef.current, { autoAlpha: 0, scale: 0.94, duration: 0.18, ease: 'power1.inOut' }, 'toSkeleton');
        tl.to(skelWrapRef.current, { autoAlpha: 1, scale: 1, duration: 0.22, ease: 'power2.out' }, 'toSkeleton+=0.02');
        tl.to({}, { duration: STEP_GAP * 0.55 });

        // Step 3: LEFT square pop (avatar → clean)
        tl.add(() => updatePaths(true, true)); // compute once & reset dash
        tl.add(() => { pathUpdatesLockedRef.current = true; }); // lock reactive updates during send
        tl.to(squareLRef.current, { autoAlpha: 1, scale: 1, duration: 0.30, ease: 'back.out(1.6)' });

        tl.add(() => {
            const p = pathARef.current!;
            const inner = sendLine(p, {
                onHeadConnect: () => {
                    // swap avatar to clean under skeleton (revealed later)
                    avatarWrapRef.current?.classList.add('clean');
                    avatarWrapRef.current?.classList.remove('messy');
                    gsap.to('.slk2-lottie--clean', { autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
                }
            });
            return inner;
        });
        tl.to(squareLRef.current, { autoAlpha: 0, scale: 0.6, duration: 0.20, ease: 'power1.in' }, '>-0.10');

        // Step 4: RIGHT square pop (headline → RIGHT EDGE of skeleton/slot)
        tl.add(() => updatePaths(true, true));
        tl.to(squareRRef.current, { autoAlpha: 1, scale: 1, duration: 0.30, ease: 'back.out(1.6)' });

        tl.add(() => {
            const p = pathBRef.current!;
            const inner = sendLine(p, {
                onHeadConnect: () => {
                    // prepare good headline (under skeleton)
                    gsap.set(headGoodRef.current, { display: 'block' });
                }
            });
            return inner;
        });

        tl.to(squareRRef.current, { autoAlpha: 0, scale: 0.6, duration: 0.20, ease: 'power1.in' }, '>-0.10');
        tl.add(() => { pathUpdatesLockedRef.current = false; });

        // Step 5: Reveal improved profile (no green accents; neutral look)
        tl.addLabel('revealGood');
        tl.to(skelWrapRef.current, { autoAlpha: 0, scale: 0.98, duration: 0.26, ease: 'power2.inOut' }, 'revealGood');
        tl.to(bannerRef.current, { autoAlpha: 1, scale: 1, duration: 0.26, ease: 'power2.out' }, 'revealGood+=0.02');
        tl.to(avatarWrapRef.current, { autoAlpha: 1, duration: 0.30, ease: 'power2.out' }, 'revealGood+=0.04');
        tl.to(headBadRef.current, { autoAlpha: 0, duration: 0.001 }, 'revealGood+=0.02');
        tl.to(headGoodRef.current, { autoAlpha: 1, duration: 0.30, ease: 'power2.out' }, 'revealGood+=0.04');
        tl.add(() => setIsSkeletonActive(false), 'revealGood+=0.02');
        tl.to({}, { duration: HOLD_AFTER_UPGRADE });

        tlRef.current = tl;
    };

    useLayoutEffect(() => {
        if (!play) { stop(); return; }
        build();
        return stop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [play, exIndex]);

    const bannerColor = animationMap[aniIndex][2];
    const messy = animationMap[aniIndex][0];
    const clean = animationMap[aniIndex][1];

    /* Geometry with strict max width = no horizontal overflow */
    const stageVars: CSSProperties = {
        ['--stage-maxw' as any]: '640px',
        ['--banner-left' as any]: '96px',
        ['--banner-top' as any]: '8px',
        ['--banner-h' as any]: '76px',
        ['--avatar-d' as any]: '84px',
        ['--avatar-left' as any]: 'calc(var(--banner-left) + 18px)',
        ['--text-left' as any]: 'var(--banner-left)',
        ['--bubble-gap' as any]: '38px', // smaller, sits just below and slightly overlapping the banner region
    };

    const AVATAR_D_NUM = 84; // for Ant Skeleton sizing

    return (
        <div className="slk2-root">
            <div className="slk2-stage" ref={stageRef} style={stageVars}>
                {/* Real profile banner */}
                <div className="slk2-banner" ref={bannerRef} style={{ background: bannerColor }} />

                {/* Avatar (Lottie crossfade messy->clean) */}
                <div className="slk2-avatar messy" ref={avatarWrapRef}>
                    <Lottie className="slk2-lottie slk2-lottie--messy" animationData={messy} loop autoplay />
                    <Lottie className="slk2-lottie slk2-lottie--clean" animationData={clean} loop autoplay />
                </div>

                {/* Name (unchanged during skeleton) */}
                <div className="slk2-name" ref={nameRef}>{ex.name}</div>

                {/* Headline SLOT (anchors both bad & good in the exact same position) */}
                <div className="slk2-headline-slot" ref={headSlotRef} aria-live="polite">
                    <div className="slk2-headline slk2-headline--bad" ref={headBadRef}>
                        {ex.badHeadline}
                    </div>
                    <div className="slk2-headline slk2-headline--good" ref={headGoodRef}>
                        {ex.goodHeadline}
                    </div>
                </div>

                {/* Prompt bubble (minimal, small) */}
                <div className="slk2-bubble" ref={bubbleRef} aria-readonly="true">
                    <span className="slk2-bubble-text" ref={bubbleTextRef}>{typed}</span>
                    <span className="slk2-caret" />
                </div>

                {/* --- Ant Design Skeleton overlay (banner, avatar, headline lines) --- */}
                <div className="slk2-skeleton" ref={skelWrapRef} aria-hidden="true">
                    {/* Banner skeleton (explicit shimmer overlay so it’s visible even on white) */}
                    <div className="slk2-skel-banner" ref={skelBannerRef}>
                        <div className="slk2-skel-banner-shimmer" />
                        <Skeleton.Input active style={{ width: '100%', height: '100%', borderRadius: 16 }} />
                    </div>

                    <div className="slk2-skel-avatar" ref={skelAvatarRef}>
                        <Skeleton.Avatar active shape="circle" size={AVATAR_D_NUM} style={{ border: '3px solid #fff' }} />
                    </div>

                    <div className="slk2-skel-headlines" ref={skelHeadWrapRef}>
                        {Array.from({ length: Math.max(1, Math.min(2, headlineLines)) }).map((_, i) => (
                            <div className="slk2-skel-hline" key={i}>
                                <Skeleton.Input
                                    active
                                    style={{
                                        width: '100%',
                                        height: 16,
                                        borderRadius: 10
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Blue signal squares */}
                <div className="slk2-square" ref={squareLRef} />
                <div className="slk2-square" ref={squareRRef} />

                {/* Connectors (SVG underneath content) */}
                <svg className="slk2-svg" ref={svgRef} preserveAspectRatio="none">
                    <path ref={pathARef} className="slk2-conn" />
                    <path ref={pathBRef} className="slk2-conn" />
                </svg>
            </div>
        </div>
    );
};

export default SmartLinkedCode;

