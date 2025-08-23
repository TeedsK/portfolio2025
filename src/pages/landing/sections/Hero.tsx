// src/pages/landing/sections/Hero.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Spin } from 'antd';
import '../styles/HeroLayout.css';
import gsap from 'gsap';
import OcrOverlay from "../components/OcrOverlay";
import CharacterStreamViz from '../components/CharacterStreamViz';
import useOcrProcessing from '../hooks/useOcrProcessing';
import { StreamCharacter, AnimationWave } from '../../../types';
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
import {
    CHAR_BOX_CONTENT_WIDTH,
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING
} from '../utils/animation';
import { PathManager } from '../utils/path';
import { WhiteToAlphaCanvas } from '../components/WhiteToAlphaCanvas';

const GRAPH_CANVAS_HEIGHT = 340; // compact footprint

type OcrSourceIndex = 0 | 1;

const Hero: React.FC = () => {
    const [errorState, setErrorState] = useState<string | null>(null);
    const [streamCharacters, setStreamCharacters] = useState<StreamCharacter[]>([]);
    const [networkWaves, setNetworkWaves] = useState<AnimationWave[]>([]);

    const gradientIndex1Ref = useRef(0);
    const gradientIndex2Ref = useRef(0);

    const [hasCollapsedMedia1, setHasCollapsedMedia1] = useState<boolean>(false);
    const [hasCollapsedMedia2, setHasCollapsedMedia2] = useState<boolean>(false);

    // --- Section 1 state (Screenshot) ---
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
    const hasAnimatedOutput1 = useRef(false);

    // --- Section 2 state (Handwriting) ---
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
    const hasAnimatedOutput2 = useRef(false);

    const {
        model,
        visModel,
        isLoading: isLoadingModel,
        tfReady,
        error: modelLoadError,
    } = useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

    const commonSetNetworkWaves = useCallback((updater: React.SetStateAction<AnimationWave[]>) => {
        setNetworkWaves(prev => typeof updater === 'function' ? updater(prev) : updater);
    }, []);

    const ocrProcess1 = useOcrProcessing({ imageRef: imageRef1, setNetworkWaves: commonSetNetworkWaves, model, visModel, tfReady, isLoadingModel });
    const ocrProcess2 = useOcrProcessing({ imageRef: imageRef2, setNetworkWaves: commonSetNetworkWaves, model, visModel, tfReady, isLoadingModel });

    const networkContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (modelLoadError) setErrorState(modelLoadError); }, [modelLoadError]);

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

    /* ====== NETWORK ENTRY (local → viewport coords) ====== */
    const getCentralConnectionPoint = useCallback(() => {
        const width = networkContainerRef.current?.clientWidth ?? 800;
        const x = Math.max(24, Math.round(width * 0.12));   // slightly tighter to the left
        return { x, y: Math.floor(GRAPH_CANVAS_HEIGHT / 2) };
    }, []);

    /* ====== NEW: overlay size = hero size (not viewport) ====== */
    const heroRef = useRef<HTMLElement>(null);
    const [overlaySize, setOverlaySize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });

    useEffect(() => {
        const update = () => {
            if (!heroRef.current) return;
            const rect = heroRef.current.getBoundingClientRect();
            setOverlaySize({ width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) });
        };
        update(); // initial

        let ro: ResizeObserver | null = null;
        if (heroRef.current && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(update);
            ro.observe(heroRef.current);
        }
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            ro?.disconnect();
        };
    }, []);

    const characterOverlayRef = useRef<HTMLDivElement>(null);

    /* ====== Spawn ONLY to the LEFT of the neural graph, in HERO-LOCAL coords ====== */
    const addCharacterToStream = useCallback((
        char: string | null,
        imageData: ImageData | null,
        onAnimFinishedCallback: (processedCharString: string, gradientSetForWave: string[]) => void,
        _sourceName: "Scan 1 (Video)" | "Scan 2 (Static)",
        chosenGradientSet: string[]
    ) => {
        if (!char || !imageData) return;

        const overlayRect = characterOverlayRef.current?.getBoundingClientRect();
        const heroRect = heroRef.current?.getBoundingClientRect();
        const netRect = networkContainerRef.current?.getBoundingClientRect();

        // Dimensions for the overlay canvas (hero-local)
        const overlayW = overlayRect?.width ?? overlaySize.width;
        const overlayH = overlayRect?.height ?? overlaySize.height;

        // Network entry in HERO-LOCAL coords
        const centralLocal = getCentralConnectionPoint();
        const centerInOverlay = (netRect && heroRect)
            ? {
                x: Math.round((netRect.left - heroRect.left) + centralLocal.x),
                y: Math.round((netRect.top - heroRect.top) + centralLocal.y),
            }
            : { x: Math.round(overlayW * 0.75), y: Math.round(overlayH / 2) };

        // Character box dims
        const totalBoxW = CHAR_BOX_CONTENT_WIDTH + CHAR_BOX_PADDING * 2;
        const totalBoxH = CHAR_BOX_CONTENT_HEIGHT + CHAR_BOX_PADDING * 2;
        const halfW = totalBoxW / 2;
        const halfH = totalBoxH / 2;

        // Constrain spawn X to the left of the neural graph (still hero-local)
        const margin = 25;
        const graphLeftLocal = (netRect && heroRect) ? (netRect.left - heroRect.left) : Math.round(overlayW * 0.6);
        const maxXLeftOfGraph = Math.max(halfW + margin, Math.min(graphLeftLocal - margin - halfW, overlayW - halfW - margin));

        const minXCenter = halfW + margin;
        const maxXCenter = Math.max(minXCenter, maxXLeftOfGraph);
        const minYCenter = halfH + margin;
        const maxYCenter = overlayH - halfH - margin;

        const cx = Math.min(maxXCenter, Math.max(minXCenter, Math.random() * (maxXCenter - minXCenter) + minXCenter));
        const cy = Math.min(maxYCenter, Math.max(minYCenter, Math.random() * (maxYCenter - minYCenter) + minYCenter));

        // Path: char box center -> gentle “L” -> network entry (all hero-local)
        const p0Center = { x: cx, y: cy };
        const p2 = centerInOverlay;
        const p1 = Math.random() > 0.5 ? { x: p0Center.x, y: p2.y } : { x: p2.x, y: p0Center.y };

        const topLeftX = p0Center.x - halfW;
        const topLeftY = p0Center.y - halfH;

        setStreamCharacters(prev => ([
            ...prev,
            {
                id: `char-${Date.now()}-${Math.random()}`,
                charImage: imageData,
                startX: topLeftX,
                startY: topLeftY,
                path: new PathManager(p0Center, p1, p2, 15),
                animationState: 'appearing',
                alpha: 0,
                scale: 0.5,
                gradientSet: chosenGradientSet,
                headProgress: 0,
                tailProgress: 0,
                isRetractingColorOverride: false,
                onFinished: () => onAnimFinishedCallback(char, chosenGradientSet),
            }
        ]));
    }, [overlaySize.width, overlaySize.height, getCentralConnectionPoint]);

    // Feed characters
    useEffect(() => {
        if (ocrProcess1.currentChar && ocrProcess1.currentCharImageData) {
            const idx = gradientIndex1Ref.current % TEXT_SCREENSHOT_GRADIENTS.length;
            addCharacterToStream(
                ocrProcess1.currentChar,
                ocrProcess1.currentCharImageData,
                ocrProcess1.onCharAnimationFinished,
                "Scan 1 (Static)",
                TEXT_SCREENSHOT_GRADIENTS[idx]
            );
            gradientIndex1Ref.current++;
        }
    }, [ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => {
        if (ocrProcess2.currentChar && ocrProcess2.currentCharImageData) {
            const idx = gradientIndex2Ref.current % HELLO_WELCOME_GRADIENTS.length;
            addCharacterToStream(
                ocrProcess2.currentChar,
                ocrProcess2.currentCharImageData,
                ocrProcess2.onCharAnimationFinished,
                "Scan 2 (Static)",
                HELLO_WELCOME_GRADIENTS[idx]
            );
            gradientIndex2Ref.current++;
        }
    }, [ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, addCharacterToStream]);

    const onCharacterFinishedStreamViz = useCallback((id: string) => {
        setStreamCharacters(prev => prev.filter(c => c.id !== id));
    }, []);
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

    /* collapse / enlarge routines */
    const collapseMediaContainer = useCallback((sourceIndex: OcrSourceIndex) => {
        const containerRef = sourceIndex === 0 ? mediaContainerRef1 : mediaContainerRef2;
        const outputRef = sourceIndex === 0 ? ocrOutputRef1 : ocrOutputRef2;
        const columnRef = sourceIndex === 0 ? mediaColumnRef1 : mediaColumnRef2;

        const alreadyCollapsed = sourceIndex === 0 ? hasCollapsedMedia1 : hasCollapsedMedia2;
        if (alreadyCollapsed) return;

        const containerEl = containerRef.current;
        const outputEl = outputRef.current;
        const columnEl = columnRef.current;
        if (!containerEl) return;

        const currentHeight = containerEl.getBoundingClientRect().height;
        containerEl.style.height = `${currentHeight}px`;
        containerEl.style.overflow = 'hidden';

        const tl = gsap.timeline({
            defaults: { ease: 'power2.inOut' },
            onComplete: () => {
                containerEl.style.display = 'none';
                if (sourceIndex === 0) setHasCollapsedMedia1(true);
                else setHasCollapsedMedia2(true);
            }
        });

        // 1) Collapse media container
        tl.to(containerEl, { height: 0, opacity: 0, duration: 0.55 });

        // 2) Remove chrome
        if (columnEl) {
            tl.to(columnEl, {
                boxShadow: '0px 0px 0px 0px rgba(0,0,0,0)',
                backgroundColor: 'rgba(255,255,255,0)',
                borderColor: 'rgba(0,0,0,0)',
                borderWidth: 0,
                duration: 0.4
            }, 0);
        }

        // 3) Enlarge OCR text
        if (outputEl) {
            const heading = outputEl.querySelector('h3') as HTMLElement | null;
            if (heading) {
                tl.to(heading, { opacity: 0, height: 0, marginTop: 0, marginBottom: 0, duration: 0.3 }, 0.1)
                    .set(heading, { display: 'none' });
            }
            const bodyEl = outputEl.querySelector('.ocr-output-body') as HTMLElement | null;
            const textEl = outputEl.querySelector('.ocr-output-text') as HTMLElement | null;
            const targetFontSize = sourceIndex === 1 ? '1.5em' : '1.3em';
            if (textEl) tl.to(textEl, { fontSize: targetFontSize, duration: 0.35 }, 0.15);
            else if (bodyEl) tl.to(bodyEl, { fontSize: targetFontSize, duration: 0.35 }, 0.15);
            if (bodyEl) {
                tl.fromTo(bodyEl, { scale: 1 }, { scale: 1.06, duration: 0.2 }, 0.15)
                    .to(bodyEl, { scale: 1, duration: 0.18 }, '>-0.06');
            }
        }
    }, [hasCollapsedMedia1, hasCollapsedMedia2]);

    const onTypoAnimationComplete = (sourceIndex: OcrSourceIndex) => {
        if (sourceIndex === 0) { if (isOcrDone1) setCollapseImage1(true); }
        else { if (isOcrDone2) setCollapseImage2(true); }
        collapseMediaContainer(sourceIndex);
    };

    // first appearance of OCR blocks
    useEffect(() => {
        const shouldAnimate1 = (ocrProcess1.liveOcrText.length > 0 || correctedTextParts1.length > 0) && !hasAnimatedOutput1.current;
        if (shouldAnimate1 && ocrOutputRef1.current) {
            hasAnimatedOutput1.current = true;
            gsap.fromTo(ocrOutputRef1.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
        }
    }, [ocrProcess1.liveOcrText, correctedTextParts1.length]);

    useEffect(() => {
        const shouldAnimate2 = (ocrProcess2.liveOcrText.length > 0 || correctedTextParts2.length > 0) && !hasAnimatedOutput2.current;
        if (shouldAnimate2 && ocrOutputRef2.current) {
            hasAnimatedOutput2.current = true;
            gsap.fromTo(ocrOutputRef2.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' });
        }
    }, [ocrProcess2.liveOcrText, correctedTextParts2.length]);

    const ACCENT_COLOR_1 = TEXT_SCREENSHOT_GRADIENTS[0][0];
    const ACCENT_COLOR_2 = HELLO_WELCOME_GRADIENTS[0][0];

    return (
        <>
            {/* ======= Full-screen hero ======= */}
            <section ref={heroRef} className="hero" style={{ ['--title-left-offset' as any]: '30px' }}>
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
                                    />
                                )}
                            </div>

                            <div ref={ocrOutputRef2} className="ocr-output-container ocr-output-container--below">
                                <div className="ocr-output-body">
                                    {ocrProcess2.isProcessingOCR ? (
                                        <p className="ocr-output-text">
                                            {ocrProcess2.liveOcrText}
                                            <span className="blinking-cursor">|</span>
                                        </p>
                                    ) : (
                                        correctedTextParts2.length > 0 ? (
                                            <AnimatedTypoText parts={correctedTextParts2} onComplete={() => onTypoAnimationComplete(1)} />
                                        ) : (
                                            <p className="ocr-output-text">Awaiting OCR...</p>
                                        )
                                    )}
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
                                    />
                                )}
                            </div>

                            <div ref={ocrOutputRef1} className="ocr-output-container ocr-output-container--below">
                                <div className="ocr-output-body">
                                    {ocrProcess1.isProcessingOCR ? (
                                        <p className="ocr-output-text">
                                            {ocrProcess1.liveOcrText}
                                            <span className="blinking-cursor">|</span>
                                        </p>
                                    ) : (
                                        correctedTextParts1.length > 0 ? (
                                            <AnimatedTypoText parts={correctedTextParts1} onComplete={() => onTypoAnimationComplete(0)} />
                                        ) : (
                                            <p className="ocr-output-text">Awaiting OCR...</p>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right column — Neural Network */}
                    <div className="right-column">
                        <div className="steps-extra-info-container" style={{ minHeight: `${GRAPH_CANVAS_HEIGHT}px`, width: '100%', position: 'relative' }}>
                            {(ocrProcess1.isProcessingOCR || ocrProcess2.isProcessingOCR) && (
                                <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
                                    <Spin tip="Processing OCR..." />
                                </div>
                            )}
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
                                    />
                                )}
                            </div>
                        </div>

                        <Alert.ErrorBoundary>
                            {!tfReady && !errorState && !isLoadingModel && <Alert message="Initializing TensorFlow.js..." type="info" showIcon />}
                            {isLoadingModel && tfReady && (<Alert message={<span>Loading EMNIST Model... <Spin size="small" /></span>} type="info" showIcon />)}
                            {errorState && (<Alert message={errorState} type="error" showIcon closable onClose={() => setErrorState(null)} />)}
                        </Alert.ErrorBoundary>
                    </div>
                </div>

                {/* UNDER content overlay (now local to hero) */}
                <div ref={characterOverlayRef} className="character-overlay" aria-hidden>
                    <CharacterStreamViz
                        characters={streamCharacters}
                        containerSize={overlaySize}
                        onCharacterFinished={onCharacterFinishedStreamViz}
                    />
                </div>
            </section>
        </>
    );
};

export default Hero;
