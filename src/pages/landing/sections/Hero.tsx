// src/pages/landing/sections/Hero.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import '../styles/HeroLayout.css';
import gsap from 'gsap';
import OcrOverlay from "../components/OcrOverlay";
import useOcrProcessing from '../hooks/useOcrProcessing';
import { AnimationWave, ScanBeam, Point } from '../../../types';
import { processOcrText, CorrectedTextPart } from '../utils/correctionData';
import { NetworkGraphViz } from '../components/NetworkGraphViz';
import AnimatedTypoText from '../components/AnimatedTypoText';
import {
    EMNIST_MODEL_URL,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TEXT_SCREENSHOT_GRADIENTS,
    HELLO_WELCOME_GRADIENTS,
    OCR_START_DELAY_MS,
    MEDIA_CROP_TOP_PX,
    MEDIA_CROP_BOTTOM_PX
} from '../utils/constants';
import { useTfModel } from '../../../utils/useTfModel';
import { PathManager } from '../utils/path';
import { WhiteToAlphaCanvas } from '../components/WhiteToAlphaCanvas';
import ScanBeamViz from '../components/ScanBeamViz';
import AsciiOrb from '../components/AsciiOrb';

const GRAPH_CANVAS_HEIGHT = 340;
const BOTTOM_Y_LIFT_PX = 30;

type OcrSourceIndex = 0 | 1;

const Hero: React.FC = () => {
    const [networkWaves, setNetworkWaves] = useState<AnimationWave[]>([]);

    const gradientIndex1Ref = useRef(0);
    const gradientIndex2Ref = useRef(0);

    const [hasCollapsedMedia1, setHasCollapsedMedia1] = useState<boolean>(false);
    const [hasCollapsedMedia2, setHasCollapsedMedia2] = useState<boolean>(false);

    // --- Section 1 state (Screenshot / bottom) ---
    const [imageDimensions1, setImageDimensions1] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying1, setIsVideoPlaying1] = useState<boolean>(true);
    const [shouldStartOcr1, setShouldStartOcr1] = useState<boolean>(false);
    const [correctedTextParts1, setCorrectedTextParts1] = useState<CorrectedTextPart[]>([]);
    const [aspectRatio1, setAspectRatio1] = useState<number>(16 / 9);
    const [collapseImage1, setCollapseImage1] = useState<boolean>(false);
    const [isOcrDone1, setIsOcrDone1] = useState<boolean>(false);
    const imageRef1 = useRef<HTMLImageElement | null>(null);
    const videoRef1 = useRef<HTMLVideoElement | null>(null);
    const mediaContainerRef1 = useRef<HTMLDivElement>(null);
    const mediaColumnRef1 = useRef<HTMLDivElement>(null);
    const ocrOutputRef1 = useRef<HTMLDivElement>(null);
    const scaleShellRef1 = useRef<HTMLDivElement>(null);
    const hasMountedOutput1 = useRef(false);
    const [readyForTypos1, setReadyForTypos1] = useState<boolean>(false);

    // --- Section 2 state (Handwriting / top) ---
    const [imageDimensions2, setImageDimensions2] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying2, setIsVideoPlaying2] = useState<boolean>(true);
    const [shouldStartOcr2, setShouldStartOcr2] = useState<boolean>(false);
    const [correctedTextParts2, setCorrectedTextParts2] = useState<CorrectedTextPart[]>([]);
    const [aspectRatio2, setAspectRatio2] = useState<number>(16 / 9);
    const [collapseImage2, setCollapseImage2] = useState<boolean>(false);
    const [isOcrDone2, setIsOcrDone2] = useState<boolean>(false);
    const imageRef2 = useRef<HTMLImageElement | null>(null);
    const videoRef2 = useRef<HTMLVideoElement | null>(null);
    const mediaContainerRef2 = useRef<HTMLDivElement>(null);
    const mediaColumnRef2 = useRef<HTMLDivElement>(null);
    const ocrOutputRef2 = useRef<HTMLDivElement>(null);
    const scaleShellRef2 = useRef<HTMLDivElement>(null);
    const hasMountedOutput2 = useRef(false);
    const [readyForTypos2, setReadyForTypos2] = useState<boolean>(false);

    const [typoAnimationComplete1, setTypoAnimationComplete1] = useState(false);
    const [typoAnimationComplete2, setTypoAnimationComplete2] = useState(false);

    // === Gate ASCII orb appearance until the neural viz has faded away ===
    const [hasFadedNeuralNet, setHasFadedNeuralNet] = useState(false);
    const neuralContainerRef = useRef<HTMLDivElement>(null);
    const hasTriggeredFadeRef = useRef(false);

    // --- Link + Icons (masking + reveal) ---
    const aiImpactLinkRef = useRef<HTMLAnchorElement | null>(null);
    const impactLinkRevealRef = useRef<HTMLDivElement | null>(null); // wrapper that we animate like labels
    const impactIconsWrapRef = useRef<HTMLDivElement | null>(null);
    const linkIconsTLRef = useRef<gsap.core.Timeline | null>(null);

    // --- Non-white mask generation for icons (keeps whites visible) ---
    const WHITE_THRESHOLD = 245;    // treat near-white as white
    const ALPHA_THRESHOLD = 10;     // ignore near-transparent pixels

    const generateNonWhiteMask = useCallback((src: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const w = img.naturalWidth || img.width;
                    const h = img.naturalHeight || img.height;
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) { resolve(src); return; } // graceful fallback

                    ctx.drawImage(img, 0, 0, w, h);
                    const im = ctx.getImageData(0, 0, w, h);
                    const data = im.data;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                        const isWhite = r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD;
                        const visible = a > ALPHA_THRESHOLD && !isWhite;
                        // Output: fully transparent where white; solid alpha elsewhere
                        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = visible ? 255 : 0;
                    }

                    ctx.putImageData(im, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch {
                    resolve(src); // fallback: use original alpha mask
                }
            };
            img.onerror = () => resolve(src); // fallback
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
        return () => { alive = false; };
    }, [generateNonWhiteMask]);

    // Helper to build CSS mask style for a given (generated) mask image
    const maskStyle = useCallback((maskUrl: string): React.CSSProperties => ({
        WebkitMaskImage: `url(${maskUrl})`,
        maskImage: `url(${maskUrl})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        backgroundColor: '#aeb0b4',
    }), []);

    const {
        model,
        visModel,
        isLoading: isLoadingModel,
        tfReady,
    } = useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

    const commonSetNetworkWaves = useCallback((updater: React.SetStateAction<AnimationWave[]>) => {
        setNetworkWaves(prev => typeof updater === 'function' ? updater(prev) : updater);
    }, []);

    const ocrProcess1 = useOcrProcessing({ imageRef: imageRef1, setNetworkWaves: commonSetNetworkWaves, model, visModel, tfReady, isLoadingModel });
    const ocrProcess2 = useOcrProcessing({ imageRef: imageRef2, setNetworkWaves: commonSetNetworkWaves, model, visModel, tfReady, isLoadingModel });

    const lockAndSwapToTypos = useCallback((sourceIndex: OcrSourceIndex) => {
        const outRef = sourceIndex === 0 ? ocrOutputRef1 : ocrOutputRef2;
        const bodyEl = outRef.current?.querySelector('.ocr-output-body') as HTMLDivElement | null;
        if (!bodyEl) {
            if (sourceIndex === 0) setReadyForTypos1(true);
            else setReadyForTypos2(true);
            return;
        }

        const prevH = bodyEl.getBoundingClientRect().height;
        gsap.set(bodyEl, { height: prevH, overflow: 'hidden' });

        // Mount typo component
        if (sourceIndex === 0) setReadyForTypos1(true);
        else setReadyForTypos2(true);

        // On the next frame, measure the new content height and animate to it smoothly, then release.
        requestAnimationFrame(() => {
            const targetH = bodyEl.scrollHeight; // auto height of new content
            gsap.to(bodyEl, {
                height: targetH,
                duration: 0.2,
                ease: 'power1.out',
                onComplete: () => {
                    gsap.set(bodyEl, { height: 'auto', overflow: 'visible' });
                }
            });
        });
    }, []);

    const networkContainerRef = useRef<HTMLDivElement>(null);

    // Resize observers for media (track DISPLAY size for overlay/canvas)
    useEffect(() => {
        const setupObserver = (
            containerRef: React.RefObject<HTMLDivElement>,
            setDims: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>
        ) => {
            if (!containerRef.current) return;
            const observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (width > 0 && height > 0) setDims({ width: Math.round(width), height: Math.round(height) });
                }
            });
            observer.observe(containerRef.current);
            return () => observer.disconnect();
        };
        const cleanup1 = setupObserver(mediaContainerRef1, setImageDimensions1);
        const cleanup2 = setupObserver(mediaContainerRef2, setImageDimensions2);
        return () => { cleanup1?.(); cleanup2?.(); };
    }, []);

    const handleVideoEnd1 = () => setIsVideoPlaying1(false);
    const handleVideoEnd2 = () => setIsVideoPlaying2(false);

    const handleOcrFinished = useCallback((rawText: string, sourceIndex: OcrSourceIndex) => {
        if (rawText.trim()) {
            const parts = processOcrText(rawText, sourceIndex);
            if (sourceIndex === 0) { setCorrectedTextParts1(parts); setIsOcrDone1(true); }
            else { setCorrectedTextParts2(parts); setIsOcrDone2(true); }
        }
    }, []);

    // Auto-start OCR
    useEffect(() => {
        if (isVideoPlaying1 && !ocrProcess1.isProcessingOCR) {
            const t = setTimeout(() => { if (isVideoPlaying1) setShouldStartOcr1(true); }, OCR_START_DELAY_MS);
            return () => clearTimeout(t);
        }
    }, [isVideoPlaying1, ocrProcess1.isProcessingOCR]);
    useEffect(() => {
        if (isVideoPlaying2 && !ocrProcess2.isProcessingOCR) {
            const t = setTimeout(() => { if (isVideoPlaying2) setShouldStartOcr2(true); }, OCR_START_DELAY_MS);
            return () => clearTimeout(t);
        }
    }, [isVideoPlaying2, ocrProcess2.isProcessingOCR]);

    useEffect(() => {
        if (shouldStartOcr1 && imageDimensions1 && imageRef1.current?.complete && !ocrProcess1.isProcessingOCR && tfReady && !isLoadingModel) {
            ocrProcess1.startOcr(imageDimensions1).then(raw => handleOcrFinished(raw as unknown as string, 0)).finally(() => setShouldStartOcr1(false));
        }
    }, [shouldStartOcr1, imageDimensions1, ocrProcess1, tfReady, isLoadingModel, handleOcrFinished]);

    useEffect(() => {
        if (shouldStartOcr2 && imageDimensions2 && imageRef2.current?.complete && !ocrProcess2.isProcessingOCR && tfReady && !isLoadingModel) {
            ocrProcess2.startOcr(imageDimensions2).then(raw => handleOcrFinished(raw as unknown as string, 1)).finally(() => setShouldStartOcr2(false));
        }
    }, [shouldStartOcr2, imageDimensions2, ocrProcess2, tfReady, isLoadingModel, handleOcrFinished]);

    /**
     * ENSURE: Link + social icons are never visible before the reveal animation.
     * UseLayoutEffect guarantees GSAP sets initial state BEFORE first paint.
     * Durations fixed to 1s and icon stagger at 0.25s as requested.
     */
    useLayoutEffect(() => {
        if (!typoAnimationComplete1) return;

        // Kill an existing TL if any (React StrictMode safety)
        if (linkIconsTLRef.current) {
            linkIconsTLRef.current.kill();
            linkIconsTLRef.current = null;
        }

        const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
        linkIconsTLRef.current = tl;

        // LINK (like rt-labels): height reveal + fade + slight rise
        if (impactLinkRevealRef.current) {
            const el = impactLinkRevealRef.current;
            const naturalH = el.scrollHeight || 24;
            // Set initial hidden state BEFORE first paint
            gsap.set(el, { overflow: 'hidden', maxHeight: 0, opacity: 0, y: -6 });
            tl.to(el, {
                maxHeight: naturalH,
                opacity: 1,
                y: 0,
                duration: 1,
                onComplete: () => gsap.set(el, { clearProps: 'maxHeight,overflow,transform' }),
            }, 0);
        }

        // ICON ROW: same container reveal
        if (impactIconsWrapRef.current) {
            const row = impactIconsWrapRef.current;
            const rowH = row.scrollHeight || 34;
            gsap.set(row, { overflow: 'hidden', maxHeight: 0, opacity: 0, y: -6 });
            tl.to(row, {
                maxHeight: rowH,
                opacity: 1,
                y: 0,
                duration: 1,
                onComplete: () => gsap.set(row, { clearProps: 'maxHeight,overflow,transform' }),
            }, 0.12);

            // Child icons: opacity + y with 250ms stagger
            const icons = Array.from(row.querySelectorAll<HTMLElement>('.impact-social'));
            if (icons.length) {
                gsap.set(icons, { opacity: 0, y: -6 });
                tl.to(icons, {
                    opacity: 1,
                    y: 0,
                    duration: 1,
                    stagger: 0.25, // 250ms between each
                }, 0.18);
            }
        }

        return () => {
            if (linkIconsTLRef.current) {
                linkIconsTLRef.current.kill();
                linkIconsTLRef.current = null;
            }
        };
    }, [typoAnimationComplete1]);

    /** ===== Network entry point (single source of truth) ===== */
    const calcCentralPoint = useCallback((w: number, h: number): Point => {
        return { x: Math.max(20, Math.floor(w * 0.15)), y: Math.floor(h / 2) };
    }, []);
    const networkCanvasSize = useMemo(() => ({
        width: networkContainerRef.current?.clientWidth ?? 800,
        height: GRAPH_CANVAS_HEIGHT
    }), [networkContainerRef.current?.clientWidth]);

    // keep viewport (fixed) overlay size in sync
    const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
        width: typeof window !== 'undefined' ? window.innerWidth : 1200,
        height: typeof window !== 'undefined' ? window.innerHeight : 800
    });
    useEffect(() => {
        const onResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Global, fixed overlay for beams (viewport coords)
    const beamOverlayRef = useRef<HTMLDivElement>(null);

    // Live scan box anchors (viewport px) — maintain one per source
    const scanAnchorViewportRef1 = useRef<Point | null>(null); // bottom image/video (source 0)
    const scanAnchorViewportRef2 = useRef<Point | null>(null); // top handwriting (source 1)
    const handleScanBoxAnchorChange1 = useCallback((pt: Point | null) => { scanAnchorViewportRef1.current = pt; }, []);
    const handleScanBoxAnchorChange2 = useCallback((pt: Point | null) => { scanAnchorViewportRef2.current = pt; }, []);

    // ===== Beams state =====
    const [beams, setBeams] = useState<ScanBeam[]>([]);
    const onBeamFinished = useCallback((id: string) => {
        setBeams(prev => prev.filter(b => b.id !== id));
    }, []);

    // Helper: spawn a beam using a given origin (viewport px)
    const addBeamFromScanner = useCallback((
        originViewport: Point | null,
        gradientSet: string[],
        onAnimFinishedCallback: (processedCharString: string, gradientSet: string[]) => void,
        processedChar: string
    ) => {
        if (!originViewport || !networkContainerRef.current) return;

        const netRect = networkContainerRef.current.getBoundingClientRect();
        const netW = networkContainerRef.current.clientWidth || 800;
        const localCentral = calcCentralPoint(netW, GRAPH_CANVAS_HEIGHT);

        // Compute *viewport* entry point for the graph, then convert to document space
        const netEntryViewport = { x: Math.round(netRect.left + localCentral.x), y: Math.round(netRect.top + localCentral.y) };

        // Convert origin + entry to *document* space so the path stays stable while scrolling
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        const originDoc = { x: originViewport.x + sx, y: originViewport.y + sy };
        const targetDoc = { x: netEntryViewport.x + sx, y: netEntryViewport.y + sy };

        // Curved path geometry
        const verticalKick = (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 120);
        const lateralJitter = (Math.random() - 0.5) * 60;
        const elbowDoc = { x: originDoc.x + lateralJitter, y: originDoc.y + verticalKick };
        const arcRadius = 48 + Math.random() * 24;

        const p0 = { x: originDoc.x - sx, y: originDoc.y - sy };
        const p1 = { x: elbowDoc.x - sx, y: elbowDoc.y - sy };
        const p2 = { x: targetDoc.x - sx, y: targetDoc.y - sy };
        const path = new PathManager(p0, p1, p2, arcRadius);

        setBeams(prev => ([
            ...prev,
            {
                id: `beam-${Date.now()}-${Math.random()}`,
                path,
                gradientSet,
                headProgress: 0,
                tailProgress: 0,
                alpha: 1,
                onFinished: () => onAnimFinishedCallback(processedChar, gradientSet),
                docOrigin: originDoc,
                docElbow: elbowDoc,
                docTarget: targetDoc,
                arcRadius,
            }
        ]));
    }, [calcCentralPoint]);

    useEffect(() => {
        if (ocrProcess1.currentChar) {
            const idx = gradientIndex1Ref.current % TEXT_SCREENSHOT_GRADIENTS.length;
            addBeamFromScanner(
                scanAnchorViewportRef1.current,
                TEXT_SCREENSHOT_GRADIENTS[idx],
                ocrProcess1.onCharAnimationFinished,
                ocrProcess1.currentChar
            );
            gradientIndex1Ref.current++;
        }
    }, [ocrProcess1.currentChar, ocrProcess1.onCharAnimationFinished, addBeamFromScanner]);

    useEffect(() => {
        if (ocrProcess2.currentChar) {
            const idx = gradientIndex2Ref.current % HELLO_WELCOME_GRADIENTS.length;
            addBeamFromScanner(
                scanAnchorViewportRef2.current,
                HELLO_WELCOME_GRADIENTS[idx],
                ocrProcess2.onCharAnimationFinished,
                ocrProcess2.currentChar
            );
            gradientIndex2Ref.current++;
        }
    }, [ocrProcess2.currentChar, ocrProcess2.onCharAnimationFinished, addBeamFromScanner]);

    const onNetworkWaveFinishedApp = useCallback((waveId: string) => {
        setNetworkWaves(prev => prev.filter(w => w.id !== waveId));
    }, []);

    // Only compute aspect ratio on load
    const handleImageOnLoad = (sourceIndex: OcrSourceIndex) => {
        const ref = sourceIndex === 0 ? imageRef1 : imageRef2;
        const setAspect = sourceIndex === 0 ? setAspectRatio1 : setAspectRatio2;
        if (ref.current) {
            const w = ref.current.naturalWidth || 1920;
            const h = ref.current.naturalHeight || 1080;
            if (w > 0 && h > 0) setAspect(w / h);
        }
    };

    /** Collapse / fade media, but don't remove from DOM to avoid a late layout snap. */
    const collapseMediaContainer = useCallback((sourceIndex: OcrSourceIndex): Promise<void> => {
        return new Promise<void>((resolve) => {
            const containerRef = sourceIndex === 0 ? mediaContainerRef1 : mediaContainerRef2;
            const columnRef = sourceIndex === 0 ? mediaColumnRef1 : mediaColumnRef2;

            const alreadyCollapsed = sourceIndex === 0 ? hasCollapsedMedia1 : hasCollapsedMedia2;
            if (alreadyCollapsed) { resolve(); return; }

            const containerEl = containerRef.current;
            const columnEl = columnRef.current;
            if (!containerEl) { resolve(); return; }

            const currentHeight = containerEl.getBoundingClientRect().height;
            containerEl.style.height = `${currentHeight}px`;
            containerEl.style.overflow = 'hidden';

            const tl = gsap.timeline({
                defaults: { ease: 'power2.inOut' },
                onComplete: () => {
                    containerEl.style.height = '0px';
                    containerEl.style.opacity = '0';
                    containerEl.style.visibility = 'hidden';
                    if (sourceIndex === 0) setHasCollapsedMedia1(true);
                    else setHasCollapsedMedia2(true);
                    resolve();
                }
            });

            tl.to(containerEl, { height: 0, opacity: 0, duration: 0.55 });

            if (columnEl) {
                tl.to(columnEl, {
                    boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)',
                    backgroundColor: 'rgba(255,255,255,0)',
                    borderColor: 'rgba(0,0,0,0)',
                    borderWidth: 0,
                    duration: 0.4
                }, 0);
            }
        });
    }, [hasCollapsedMedia1, hasCollapsedMedia2]);

    /** First appearance of OCR blocks: fade in and set scale shell to 0.5. */
    useEffect(() => {
        const shouldMount1 = (ocrProcess1.liveOcrText.length > 0 || correctedTextParts1.length > 0) && !hasMountedOutput1.current;
        if (shouldMount1 && ocrOutputRef1.current && scaleShellRef1.current) {
            hasMountedOutput1.current = true;
            gsap.fromTo(ocrOutputRef1.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
            gsap.set(scaleShellRef1.current, { scale: 0.5, transformOrigin: 'left top' });
        }
    }, [ocrProcess1.liveOcrText, correctedTextParts1.length]);

    useEffect(() => {
        const shouldMount2 = (ocrProcess2.liveOcrText.length > 0 || correctedTextParts2.length > 0) && !hasMountedOutput2.current;
        if (shouldMount2 && ocrOutputRef2.current && scaleShellRef2.current) {
            hasMountedOutput2.current = true;
            gsap.fromTo(ocrOutputRef2.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
            gsap.set(scaleShellRef2.current, { scale: 0.5, transformOrigin: 'left top' });
        }
    }, [ocrProcess2.liveOcrText, correctedTextParts2.length]);

    /**
     * Order:
     * 1) collapse media
     * 2) scale 0.5 -> 1.0
     * 3) (bottom only) lift the OCR output up by 30px
     * 4) swap to typo component with height-lock
     */
    const runReplacementThenTypos = useCallback(async (sourceIndex: OcrSourceIndex) => {
        if (sourceIndex === 0) setCollapseImage1(true);
        else setCollapseImage2(true);

        await collapseMediaContainer(sourceIndex);

        // Scale up first
        const shell = sourceIndex === 0 ? scaleShellRef1.current : scaleShellRef2.current;
        if (shell) {
            await new Promise<void>((resolve) => {
                gsap.to(shell, { scale: 1, duration: 0.45, ease: 'power2.out', onComplete: resolve });
            });
        }

        // Bottom OCR result: lift it closer to the "Theo Kremer" title (smooth transform)
        if (sourceIndex === 0 && ocrOutputRef1.current) {
            gsap.to(ocrOutputRef1.current, { y: -BOTTOM_Y_LIFT_PX, duration: 0.35, ease: 'power2.out' });
        }

        // Now perform the swap to the typo component without layout jumping
        lockAndSwapToTypos(sourceIndex);
    }, [collapseMediaContainer, lockAndSwapToTypos]);

    useEffect(() => {
        if (isOcrDone1 && !readyForTypos1) runReplacementThenTypos(0);
    }, [isOcrDone1, readyForTypos1, runReplacementThenTypos]);

    useEffect(() => {
        if (isOcrDone2 && !readyForTypos2) runReplacementThenTypos(1);
    }, [isOcrDone2, readyForTypos2, runReplacementThenTypos]);

    // Was a no-op; now we only use the granular flags below.
    const typoAnimationsDone = typoAnimationComplete1 && typoAnimationComplete2;

    // === NEW: when *everything* is finished (OCR, beams, network waves, typo animations),
    // fade & scale the neural viz to 0, THEN allow the showcase to snap into its final layout.
    const allOcrAndNetworkFinished = useMemo(() => {
        const noBeams = beams.length === 0;
        const noWaves = networkWaves.length === 0;
        const ocrIdle = !ocrProcess1.isProcessingOCR && !ocrProcess2.isProcessingOCR;
        return typoAnimationsDone && noBeams && noWaves && ocrIdle;
    }, [typoAnimationsDone, beams.length, networkWaves.length, ocrProcess1.isProcessingOCR, ocrProcess2.isProcessingOCR]);

    useEffect(() => {
        if (!allOcrAndNetworkFinished) return;
        if (hasFadedNeuralNet || hasTriggeredFadeRef.current) return;

        hasTriggeredFadeRef.current = true;

        const el = neuralContainerRef.current;
        if (!el) {
            // If for some reason the ref is missing, just allow the showcase to proceed.
            setHasFadedNeuralNet(true);
            return;
        }

        // Ensure transform origin centers for a clean shrink
        gsap.set(el, { transformOrigin: 'center center' });
        gsap.to(el, {
            opacity: 0,
            scale: 0,
            duration: 0.6,
            ease: 'power2.inOut',
            onComplete: () => {
                // Let the showcase know it can move into place now
                setHasFadedNeuralNet(true);
                // Optionally collapse pointer-events after fade
                gsap.set(el, { pointerEvents: 'none', visibility: 'hidden' });
            }
        });
    }, [allOcrAndNetworkFinished, hasFadedNeuralNet]);

    const ACCENT_COLOR_1 = TEXT_SCREENSHOT_GRADIENTS[0][0];
    const ACCENT_COLOR_2 = HELLO_WELCOME_GRADIENTS[0][0];

    const centralPointForGraph = useMemo(
        () => calcCentralPoint(networkCanvasSize.width, networkCanvasSize.height),
        [calcCentralPoint, networkCanvasSize.width, networkCanvasSize.height]
    );

    return (
        <>
            {/* ======= Full-screen hero ======= */}
            <section className="hero" style={{ ['--title-left-offset' as any]: '30px' }}>
                <div className="split-layout">
                    <div className="left-column">
                        {/* ------ Section 2: Handwriting (TOP) ------ */}
                        <div className="media-column" ref={mediaColumnRef2}>
                            <div ref={mediaContainerRef2} className="media-container" style={{ aspectRatio: aspectRatio2 as any }}>
                                {/* Hidden sources */}
                                <img
                                    ref={imageRef2}
                                    src="/hello_and_welcome.png"
                                    alt="Hello and Welcome OCR"
                                    className={`screenshot-underlay ${collapseImage2 ? 'shrink-vertical' : ''}`}
                                    style={{ opacity: 0, visibility: 'hidden' }}
                                    onLoad={() => handleImageOnLoad(1)}
                                    crossOrigin="anonymous"
                                />
                                <video
                                    ref={videoRef2}
                                    src="/hello_and_welcome_writing.mp4"
                                    style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0, opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
                                    autoPlay
                                    muted
                                    onEnded={handleVideoEnd2}
                                    playsInline
                                />

                                {/* White→Alpha canvases */}
                                {imageDimensions2 && (
                                    <>
                                        <WhiteToAlphaCanvas
                                            sourceRef={videoRef2}
                                            kind="video"
                                            width={imageDimensions2.width}
                                            height={imageDimensions2.height}
                                            show={isVideoPlaying2 && !collapseImage2 && !hasCollapsedMedia2}
                                            zIndex={2}
                                            clipTopPx={MEDIA_CROP_TOP_PX}
                                            clipBottomPx={MEDIA_CROP_BOTTOM_PX}
                                            whiteLow={235}
                                            whiteHigh={252}
                                        />
                                        <WhiteToAlphaCanvas
                                            sourceRef={imageRef2}
                                            kind="image"
                                            width={imageDimensions2.width}
                                            height={imageDimensions2.height}
                                            show={!isVideoPlaying2 && !collapseImage2 && !hasCollapsedMedia2}
                                            zIndex={2}
                                            clipTopPx={MEDIA_CROP_TOP_PX}
                                            clipBottomPx={MEDIA_CROP_BOTTOM_PX}
                                            whiteLow={235}
                                            whiteHigh={252}
                                        />
                                    </>
                                )}

                                {imageDimensions2 && !collapseImage2 && !hasCollapsedMedia2 && (
                                    <OcrOverlay
                                        accentColor={ACCENT_COLOR_2}
                                        recognizedChars={ocrProcess2.recognizedChars}
                                        activeBoxInfo={{
                                            activeItemIndex: ocrProcess2.activeItemIndex,
                                            processableLines: ocrProcess2.processableLines,
                                            imageDimensions: imageDimensions2,
                                            imageRef: imageRef2,
                                            showMediaElement: !hasCollapsedMedia2
                                        }}
                                        onScanBoxAnchorChange={handleScanBoxAnchorChange2}
                                    />
                                )}
                            </div>

                            <div ref={ocrOutputRef2} className="ocr-output-container ocr-output-container--below ocr-typography">
                                <div ref={scaleShellRef2} className="ocr-output-scale-shell">
                                    <div className="ocr-output-body">
                                        {ocrProcess2.isProcessingOCR ? (
                                            <p className="ocr-output-text">
                                                {ocrProcess2.liveOcrText}
                                                <span className="blinking-cursor">|</span>
                                            </p>
                                        ) : (
                                            readyForTypos2 && correctedTextParts2.length > 0 ? (
                                                <AnimatedTypoText parts={correctedTextParts2} onComplete={() => setTypoAnimationComplete2(true)} />
                                            ) : (
                                                <p className="ocr-output-text">{ocrProcess2.liveOcrText}</p>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Portfolio title — left aligned */}
                        <h1 className="portfolio-title">Theo Kremer</h1>

                        {/* ------ Section 1: Screenshot (BOTTOM) ------ */}
                        <div className="media-column" ref={mediaColumnRef1}>
                            <div ref={mediaContainerRef1} className="media-container" style={{ aspectRatio: aspectRatio1 as any }}>
                                {/* Hidden sources */}
                                <img
                                    ref={imageRef1}
                                    src="/text_screenshot.png"
                                    alt="Text input for OCR"
                                    className={`screenshot-underlay ${collapseImage1 ? 'shrink-vertical' : ''}`}
                                    style={{ opacity: 0, visibility: 'hidden' }}
                                    onLoad={() => handleImageOnLoad(0)}
                                    crossOrigin="anonymous"
                                />
                                <video
                                    ref={videoRef1}
                                    src="/text_writing.mp4"
                                    style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0, opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
                                    autoPlay
                                    muted
                                    onEnded={handleVideoEnd1}
                                    playsInline
                                />

                                {/* White→Alpha canvases */}
                                {imageDimensions1 && (
                                    <>
                                        <WhiteToAlphaCanvas
                                            sourceRef={videoRef1}
                                            kind="video"
                                            width={imageDimensions1.width}
                                            height={imageDimensions1.height}
                                            show={isVideoPlaying1 && !collapseImage1 && !hasCollapsedMedia1}
                                            zIndex={2}
                                            clipTopPx={MEDIA_CROP_TOP_PX}
                                            clipBottomPx={MEDIA_CROP_BOTTOM_PX}
                                            whiteLow={235}
                                            whiteHigh={252}
                                        />
                                        <WhiteToAlphaCanvas
                                            sourceRef={imageRef1}
                                            kind="image"
                                            width={imageDimensions1.width}
                                            height={imageDimensions1.height}
                                            show={!isVideoPlaying1 && !collapseImage1 && !hasCollapsedMedia1}
                                            zIndex={2}
                                            clipTopPx={MEDIA_CROP_TOP_PX}
                                            clipBottomPx={MEDIA_CROP_BOTTOM_PX}
                                            whiteLow={235}
                                            whiteHigh={252}
                                        />
                                    </>
                                )}

                                {imageDimensions1 && !collapseImage1 && !hasCollapsedMedia1 && (
                                    <OcrOverlay
                                        accentColor={ACCENT_COLOR_1}
                                        recognizedChars={ocrProcess1.recognizedChars}
                                        activeBoxInfo={{
                                            activeItemIndex: ocrProcess1.activeItemIndex,
                                            processableLines: ocrProcess1.processableLines,
                                            imageDimensions: imageDimensions1,
                                            imageRef: imageRef1,
                                            showMediaElement: !hasCollapsedMedia1
                                        }}
                                        onScanBoxAnchorChange={handleScanBoxAnchorChange1}
                                    />
                                )}
                            </div>

                            <div ref={ocrOutputRef1} className="ocr-output-container ocr-output-container--below ocr-typography">
                                <div className="ocr-output-scale-shell" ref={scaleShellRef1}>
                                    <div className="ocr-output-body">
                                        {ocrProcess1.isProcessingOCR ? (
                                            <p className="ocr-output-text">
                                                {ocrProcess1.liveOcrText}
                                                <span className="blinking-cursor">|</span>
                                            </p>
                                        ) : (
                                            readyForTypos1 && correctedTextParts1.length > 0 ? (
                                                <AnimatedTypoText
                                                    parts={correctedTextParts1}
                                                    onComplete={() => setTypoAnimationComplete1(true)}
                                                    as="p"
                                                    className="ocr-output-text"
                                                    startDelayMs={120}
                                                />
                                            ) : (
                                                <p className="ocr-output-text">{ocrProcess1.liveOcrText}</p>
                                            )
                                        )}
                                        {typoAnimationComplete1 && (
                                            <>
                                                {/* Link reveal wrapper (animated like Role/Team labels) */}
                                                <div ref={impactLinkRevealRef} className="impact-link-reveal">
                                                    <a
                                                        ref={aiImpactLinkRef}
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

                                                {/* Icons row (container animates like labels; items stagger) */}
                                                <div ref={impactIconsWrapRef} className="impact-socials" aria-label="Social links">
                                                    {/* LinkedIn */}
                                                    <a className="impact-social" href="http://linkedin.com/in/ttkremer" aria-label="LinkedIn" title="LinkedIn" role="link">
                                                        <img
                                                            className="impact-social__img"
                                                            src="/images/coding/linkedin_icon.png"
                                                            alt=""
                                                            decoding="async"
                                                            loading="lazy"
                                                            draggable={false}
                                                        />
                                                        {/* Tint only NON-WHITE areas via generated mask */}
                                                        <span
                                                            className="impact-social__tint"
                                                            style={maskStyle(iconMasks.linkedin)}
                                                            aria-hidden
                                                        />
                                                    </a>

                                                    {/* GitHub */}
                                                    <a className="impact-social" href="https://github.com/TeedsK" aria-label="GitHub" title="GitHub" role="link">
                                                        <img
                                                            className="impact-social__img"
                                                            src="/images/coding/github_icon.png"
                                                            alt=""
                                                            decoding="async"
                                                            loading="lazy"
                                                            draggable={false}
                                                        />
                                                        <span
                                                            className="impact-social__tint"
                                                            style={maskStyle(iconMasks.github)}
                                                            aria-hidden
                                                        />
                                                    </a>

                                                    {/* Instagram */}
                                                    <a className="impact-social" href="https://www.instagram.com/theo.kremer" aria-label="Instagram" title="Instagram" role="link">
                                                        <img
                                                            className="impact-social__img"
                                                            src="/images/coding/instagram_icon.png"
                                                            alt=""
                                                            decoding="async"
                                                            loading="lazy"
                                                            draggable={false}
                                                        />
                                                        <span
                                                            className="impact-social__tint"
                                                            style={maskStyle(iconMasks.instagram)}
                                                            aria-hidden
                                                        />
                                                    </a>
                                                </div>
                                            </>
                                        )}

                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right column — Neural Network + ASCII Orb */}
                    <div className="right-column" style={{ position: 'relative' }}>
                        <div
                            ref={neuralContainerRef}
                            className="steps-extra-info-container"
                            style={{ minHeight: `${GRAPH_CANVAS_HEIGHT}px`, width: '100%', position: 'relative' }}
                        >
                            <div ref={networkContainerRef} style={{ position: 'relative', width: '100%', height: `${GRAPH_CANVAS_HEIGHT}px` }}>
                                {networkContainerRef.current && (
                                    <NetworkGraphViz
                                        waves={networkWaves}
                                        onWaveFinished={onNetworkWaveFinishedApp}
                                        flattenLayerName="flatten"
                                        hiddenDenseLayerName="dense"
                                        outputLayerName={FINAL_LAYER_NAME}
                                        width={networkContainerRef.current.clientWidth}
                                        height={GRAPH_CANVAS_HEIGHT}
                                        centralConnectionPoint={centralPointForGraph}
                                    />
                                )}
                            </div>
                        </div>

                        {/* ASCII Orb - appears after neural network fades */}
                        <div
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                pointerEvents: 'none',
                                zIndex: 10,
                            }}
                        >
                            <AsciiOrb
                                show={hasFadedNeuralNet}
                                size={70}
                                animationSpeed={0.6}
                                morphSpeed={0.5}
                                shapeDuration={5}
                            />
                        </div>
                    </div>
                </div>

                {/* UNDER content overlay (fixed to viewport) */}
                <div ref={beamOverlayRef} className="character-overlay" aria-hidden>
                    <ScanBeamViz
                        beams={beams}
                        containerSize={viewportSize}
                        onBeamFinished={onBeamFinished}
                    />
                </div>
            </section>

        </>
    );
};

export default Hero;