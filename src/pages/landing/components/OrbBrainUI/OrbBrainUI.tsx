// src/pages/landing/components/OrbBrainUI/OrbBrainUI.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import './OrbBrainUI.css';
import { shouldRunLandingAnimations } from '../../utils/landingAnimationGate';

type Point2 = { x: number; y: number };

type BubbleState = {
    id: string;
    question: string;
    displayText: string;
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
};

type ResponseState = {
    id: string;
    text: string;
    x: number;
    y: number;
};

export interface OrbBrainUIProps {
    autoStart?: boolean;

    orbCenter: Point2;
    orbRadius: number;
    containerSize: { width: number; height: number };

    onQuestionDelivered: (question: string) => void;
}

const DEFAULT_QUESTIONS: string[] = [
    'Fix my website',
    'Where was Theo raised?',
    'What was Theo’s first full‑stack project?',
    'How long has Theo been coding?',
    'What are some of Theo’s hobbies?',
    'What kind of work does Theo love building most?',
    'What’s a project Theo is most proud of?',
];

const RESPONSES: string[] = [
    'Let me think…',
    'Interesting — pulling context.',
    'I’m forming an answer.',
    'Connecting the dots…',
    'Searching memory traces…',
    'Drafting a response.',
];

const MORPH_IN_MS = 700;
const THINK_HOLD_MS = 2600;
const MORPH_OUT_MS = 700;

// Response appears while it’s “thinking”
const RESPONSE_DELAY_MS = MORPH_IN_MS + 1700;
const TOTAL_CYCLE_MS = MORPH_IN_MS + THINK_HOLD_MS + MORPH_OUT_MS;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const randomPointInBottomHalf = (radius: number): Point2 => {
    for (let i = 0; i < 18; i++) {
        const x = (Math.random() * 2 - 1) * radius;
        const y = Math.random() * radius;
        if (x * x + y * y <= radius * radius) return { x, y };
    }
    return { x: 0, y: radius * 0.35 };
};

const makeResponseText = (question: string) => {
    const q = question.toLowerCase();
    if (q.includes('fix') && q.includes('website')) return 'Working on it.';
    return pick(RESPONSES);
};

type FireOpts = { force?: boolean };

const OrbBrainUI: React.FC<OrbBrainUIProps> = ({
    autoStart = false,
    orbCenter,
    orbRadius,
    containerSize,
    onQuestionDelivered,
}) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const bubbleRef = useRef<HTMLDivElement | null>(null);

    const timersRef = useRef<number[]>([]);
    const typeIntervalRef = useRef<number | null>(null);

    const startedRef = useRef(false);
    const questionIndexRef = useRef(0);

    // Tracks whether the user actually edited (so auto-send shouldn’t “steal” control)
    const userEditedRef = useRef(false);
    const autoTypingRef = useRef(false);

    const [value, setValue] = useState('');
    const [bubble, setBubble] = useState<BubbleState | null>(null);
    const [responses, setResponses] = useState<ResponseState[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const inputWidth = useMemo(() => {
        const w = Math.max(320, containerSize.width);
        return Math.min(560, w - 48);
    }, [containerSize.width]);

    const inputLeft = useMemo(() => {
        const margin = 24;
        const half = inputWidth / 2;
        const w = Math.max(1, containerSize.width);
        return clamp(orbCenter.x, margin + half, w - margin - half);
    }, [containerSize.width, inputWidth, orbCenter.x]);

    const inputTop = useMemo(() => {
        return orbCenter.y + orbRadius + 28;
    }, [orbCenter.y, orbRadius]);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((id) => window.clearTimeout(id));
        timersRef.current = [];
        if (typeIntervalRef.current) {
            window.clearInterval(typeIntervalRef.current);
            typeIntervalRef.current = null;
        }
        autoTypingRef.current = false;
    }, []);

    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    const schedule = useCallback((fn: () => void, ms: number) => {
        const id = window.setTimeout(fn, ms);
        timersRef.current.push(id);
        return id;
    }, []);

    const resizeTextarea = useCallback((animate: boolean) => {
        const el = textareaRef.current;
        if (!el) return;

        gsap.killTweensOf(el);

        el.style.height = 'auto';
        const target = Math.min(el.scrollHeight, 160);

        const current = el.getBoundingClientRect().height || target;
        el.style.height = `${current}px`;

        if (!animate) {
            el.style.height = `${target}px`;
            return;
        }

        gsap.to(el, {
            height: target,
            duration: 0.25,
            ease: 'power2.out',
        });
    }, []);

    useLayoutEffect(() => {
        resizeTextarea(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useLayoutEffect(() => {
        resizeTextarea(!autoTypingRef.current);
    }, [value, resizeTextarea]);

    const addResponse = useCallback((text: string) => {
        const offset = randomPointInBottomHalf(orbRadius * 0.62);
        const x = orbCenter.x + offset.x;
        const y = orbCenter.y + offset.y;

        const id = `resp-${Date.now()}-${Math.random()}`;
        setResponses((prev) => [...prev, { id, text, x, y }]);

        schedule(() => {
            setResponses((prev) => prev.filter((r) => r.id !== id));
        }, 5200);
    }, [orbCenter.x, orbCenter.y, orbRadius, schedule]);

    useLayoutEffect(() => {
        if (!rootRef.current) return;
        if (responses.length === 0) return;

        const last = responses[responses.length - 1];
        const el = rootRef.current.querySelector(`[data-response-id="${last.id}"]`) as HTMLElement | null;
        if (!el) return;

        gsap.fromTo(
            el,
            { opacity: 0, scale: 0.0, y: 10 },
            { opacity: 1, scale: 1, y: 0, duration: 0.38, ease: 'power2.out' }
        );
    }, [responses]);

    const fireQuestionCycle = useCallback((question: string, opts: FireOpts = {}) => {
        if (!shouldRunLandingAnimations()) return;
        if (isThinking) return;
        if (bubble) return;

        // Critical fix: auto cycles should not get stuck just because textarea stayed focused.
        // Only block on focus when NOT forced.
        if (!opts.force && isFocused) return;

        const rootRect = rootRef.current?.getBoundingClientRect();
        const inputRect = textareaRef.current?.getBoundingClientRect();
        if (!rootRect || !inputRect) return;

        const startX = inputRect.left - rootRect.left + inputRect.width / 2;
        const startY = inputRect.top - rootRect.top + Math.min(28, inputRect.height / 2);

        const targetX = orbCenter.x;
        const targetY = orbCenter.y + orbRadius * 0.08;

        setBubble({
            id: `bubble-${Date.now()}-${Math.random()}`,
            question,
            displayText: truncate(question, 26),
            startX,
            startY,
            targetX,
            targetY,
        });

        setIsThinking(true);
    }, [bubble, isFocused, isThinking, orbCenter.x, orbCenter.y, orbRadius]);

    useLayoutEffect(() => {
        if (!bubble) return;
        const el = bubbleRef.current;
        if (!el) return;

        gsap.killTweensOf(el);

        const midX = (bubble.startX + bubble.targetX) / 2 + (Math.random() - 0.5) * 90;
        const midY = Math.min(bubble.startY, bubble.targetY) - (120 + Math.random() * 70);

        gsap.set(el, {
            x: bubble.startX,
            y: bubble.startY,
            xPercent: -50,
            yPercent: -50,
            scale: 1,
            opacity: 1,
            filter: 'blur(0px)',
        });

        const tl = gsap.timeline({
            onComplete: () => {
                onQuestionDelivered(bubble.question);

                const responseText = makeResponseText(bubble.question);
                schedule(() => {
                    addResponse(responseText);
                }, RESPONSE_DELAY_MS);

                schedule(() => {
                    setIsThinking(false);
                    setValue('');

                    // Continue loop automatically (if started in auto mode and user didn't take over)
                    if (startedRef.current && !userEditedRef.current) {
                        schedule(() => {
                            const next = DEFAULT_QUESTIONS[questionIndexRef.current % DEFAULT_QUESTIONS.length];
                            questionIndexRef.current += 1;
                            startTypewriter(next, true);
                        }, 850);
                    }
                }, TOTAL_CYCLE_MS + 100);

                setBubble(null);
            }
        });

        tl.to(el, { scale: 0.82, duration: 0.16, ease: 'power2.inOut' });
        tl.to(el, { x: midX, y: midY, scale: 0.55, duration: 0.38, ease: 'power2.out' }, '<');
        tl.to(el, {
            x: bubble.targetX,
            y: bubble.targetY,
            scale: 0.22,
            opacity: 0,
            filter: 'blur(1.5px)',
            duration: 0.34,
            ease: 'power3.in',
        });

        return () => tl.kill();
    }, [addResponse, bubble, onQuestionDelivered, schedule]);

    const startTypewriter = useCallback((text: string, autoSend: boolean) => {
        clearTimers();
        autoTypingRef.current = true;
        userEditedRef.current = false;
        setValue('');

        let i = 0;
        typeIntervalRef.current = window.setInterval(() => {
            i += 1;
            setValue(text.slice(0, i));

            if (i >= text.length) {
                if (typeIntervalRef.current) {
                    window.clearInterval(typeIntervalRef.current);
                    typeIntervalRef.current = null;
                }
                autoTypingRef.current = false;

                if (autoSend) {
                    schedule(() => {
                        // Don’t auto-send if the user started editing
                        if (userEditedRef.current) return;
                        // Force-send so we never stall on focus
                        fireQuestionCycle(text, { force: true });
                    }, 900);
                }
            }
        }, 22);
    }, [clearTimers, fireQuestionCycle, schedule]);

    // Start ONLY when autoStart becomes true (Hero intro finished)
    useEffect(() => {
        if (!autoStart) return;
        if (!shouldRunLandingAnimations()) return;
        if (startedRef.current) return;

        startedRef.current = true;
        questionIndexRef.current = 1; // next question after the first

        schedule(() => {
            startTypewriter(DEFAULT_QUESTIONS[0], true); // "Fix my website"
        }, 350);
    }, [autoStart, schedule, startTypewriter]);

    const onFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const onBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        userEditedRef.current = true;
        setValue(e.target.value);
    }, []);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            const q = value.trim();
            if (!q) return;
            if (isThinking || bubble) return;

            // Manual sends are not forced; respects focus (user is controlling it anyway)
            fireQuestionCycle(q, { force: true });
        }
    }, [bubble, fireQuestionCycle, isThinking, value]);

    return (
        <div ref={rootRef} className="orb-brain-ui" aria-hidden={false}>
            <div
                className="orb-brain-input"
                style={{
                    left: `${inputLeft}px`,
                    top: `${inputTop}px`,
                    width: `${inputWidth}px`,
                }}
            >
                <div className="orb-brain-input__label">
                    Ask the orb
                    <span className={`orb-brain-input__status ${isThinking ? 'is-thinking' : ''}`}>
                        {isThinking ? 'Thinking…' : ' '}
                    </span>
                </div>

                <textarea
                    ref={textareaRef}
                    className="orb-brain-input__textarea"
                    value={value}
                    placeholder="Type a question…"
                    onChange={onChange}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    onKeyDown={onKeyDown}
                    spellCheck={false}
                    rows={1}
                    aria-label="Question input"
                />

                <div className="orb-brain-input__hint">
                    <span>Ctrl/⌘ + Enter to send</span>
                </div>
            </div>

            {bubble && (
                <div ref={bubbleRef} className="orb-thought-bubble">
                    {bubble.displayText}
                </div>
            )}

            {responses.map((r) => (
                <div
                    key={r.id}
                    data-response-id={r.id}
                    className="orb-response-card"
                    style={{ left: `${r.x}px`, top: `${r.y}px` }}
                >
                    {r.text}
                </div>
            ))}
        </div>
    );
};

export default OrbBrainUI;
