// src/pages/landing/LandingPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Switch, Space, Alert, Spin } from 'antd';
import '../../App.css';
import { log, warn } from '../../utils/logger';
import OcrOverlay from "./components/OcrOverlay";
import CharacterStreamViz from './components/CharacterStreamViz';
import useOcrProcessing from './hooks/useOcrProcessing';
import { StreamCharacter, AnimationWave } from '../../types';
import { processOcrText, CorrectedTextPart } from './utils/correctionData';
import { WeightViz } from './components/WeightViz';
import { ConvolutionFiltersViz } from './components/ConvolutionFiltersViz';
import { NetworkGraphViz, FATTEN_LAYER_X } from './components/NetworkGraphViz';
import AnimatedTypoText from './components/AnimatedTypoText';
import {
    EMNIST_MODEL_URL,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TEXT_SCREENSHOT_GRADIENTS,
    HELLO_WELCOME_GRADIENTS,
    OCR_START_DELAY_MS,
} from './utils/constants';
import { useTfModel } from '../../utils/useTfModel';
import {
    CHAR_BOX_CONTENT_WIDTH,
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING
} from './utils/animation';
import { PathManager } from './utils/path';

const GRAPH_CANVAS_HEIGHT = 500;
const CENTRAL_CONNECTION_X = FATTEN_LAYER_X - 50;
const CENTRAL_CONNECTION_Y = GRAPH_CANVAS_HEIGHT / 2;

type OcrSourceIndex = 0 | 1;

function LandingPage() {
    const [errorState, setErrorState] = useState<string | null>(null);
    const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
    const [showWeights, setShowWeights] = useState<boolean>(false);
    const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);
    const [showMediaElement] = useState<boolean>(true);
    const [streamCharacters, setStreamCharacters] = useState<StreamCharacter[]>([]);
    const [networkWaves, setNetworkWaves] = useState<AnimationWave[]>([]);
    const gradientSetIndexRef = useRef(0);

    // --- Section 1 state (Screenshot) ---
    const [imageDimensions1, setImageDimensions1] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying1, setIsVideoPlaying1] = useState<boolean>(true);
    const [shouldStartOcr1, setShouldStartOcr1] = useState<boolean>(false);
    const [correctedTextParts1, setCorrectedTextParts1] = useState<CorrectedTextPart[]>([]);
    const [aspectRatio1, setAspectRatio1] = useState<number>(16 / 9);
    const [collapseImage1, setCollapseImage1] = useState<boolean>(false);
    const [isOcrDone1, setIsOcrDone1] = useState<boolean>(false);
    const imageRef1 = useRef<HTMLImageElement | null>(null);
    const mediaContainerRef1 = useRef<HTMLDivElement>(null);

    // --- Section 2 state (Handwriting) ---
    const [imageDimensions2, setImageDimensions2] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying2, setIsVideoPlaying2] = useState<boolean>(true);
    const [shouldStartOcr2, setShouldStartOcr2] = useState<boolean>(false);
    const [correctedTextParts2, setCorrectedTextParts2] = useState<CorrectedTextPart[]>([]);
    const [aspectRatio2, setAspectRatio2] = useState<number>(16 / 9);
    const [collapseImage2, setCollapseImage2] = useState<boolean>(false);
    const [isOcrDone2, setIsOcrDone2] = useState<boolean>(false);
    const imageRef2 = useRef<HTMLImageElement | null>(null);
    const mediaContainerRef2 = useRef<HTMLDivElement>(null);

    const {
        model,
        visModel,
        weights: modelWeights,
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

    // Keep container height stable via ResizeObserver (we still use it to give overlay a concrete pixel size)
    useEffect(() => {
        const setupObserver = (containerRef: React.RefObject<HTMLDivElement>, setDims: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>) => {
            if (!containerRef.current) return;
            const observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (width > 0 && height > 0) setDims({ width, height });
                }
            });
            observer.observe(containerRef.current);
            return () => observer.disconnect();
        };
        const observer1 = setupObserver(mediaContainerRef1, setImageDimensions1);
        const observer2 = setupObserver(mediaContainerRef2, setImageDimensions2);
        return () => {
            observer1?.();
            observer2?.();
        };
    }, []);

    const handleVideoEnd1 = () => setIsVideoPlaying1(false);
    const handleVideoEnd2 = () => setIsVideoPlaying2(false);

    const handleOcrFinished = useCallback((rawText: string, sourceIndex: OcrSourceIndex) => {
        if (rawText.trim()) {
            const parts = processOcrText(rawText, sourceIndex);
            if (sourceIndex === 0) {
                setCorrectedTextParts1(parts);
                setIsOcrDone1(true);
            } else {
                setCorrectedTextParts2(parts);
                setIsOcrDone2(true);
            }
        }
    }, []);

    // Auto-start OCR 500ms after video starts
    useEffect(() => {
        if (isVideoPlaying1 && !ocrProcess1.isProcessingOCR) {
            const timer = setTimeout(() => {
                if (isVideoPlaying1) {
                    setShouldStartOcr1(true);
                }
            }, OCR_START_DELAY_MS);
            return () => clearTimeout(timer);
        }
    }, [isVideoPlaying1, ocrProcess1.isProcessingOCR]);

    useEffect(() => {
        if (isVideoPlaying2 && !ocrProcess2.isProcessingOCR) {
            const timer = setTimeout(() => {
                if (isVideoPlaying2) {
                    setShouldStartOcr2(true);
                }
            }, OCR_START_DELAY_MS);
            return () => clearTimeout(timer);
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

    const addCharacterToStream = useCallback((char: string | null, imageData: ImageData | null, onAnimFinishedCallback: (processedCharString: string, gradientSetForWave: string[]) => void, sourceName: "Scan 1 (Video)" | "Scan 2 (Static)", chosenGradientSet: string[]) => {
        if (!char || !imageData || !networkContainerRef.current) return;
        const containerRect = networkContainerRef.current.getBoundingClientRect();
        if (!containerRect || containerRect.height === 0) return;
        const p0 = { x: (Math.random() * (CENTRAL_CONNECTION_X - 100)), y: (Math.random() * (containerRect.height - 50) + 25) };
        const p2 = { x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y };
        const p1 = Math.random() > 0.5 ? { x: p0.x, y: p2.y } : { x: p2.x, y: p0.y };
        setStreamCharacters(prev => [...prev, {
            id: `char-${Date.now()}-${Math.random()}`, charImage: imageData, startX: p0.x, startY: p0.y, path: new PathManager(p0, p1, p2, 15),
            animationState: 'appearing', alpha: 0, scale: 0.5, gradientSet: chosenGradientSet,
            headProgress: 0, tailProgress: 0, isRetractingColorOverride: false,
            onFinished: () => onAnimFinishedCallback(char, chosenGradientSet),
        }]);
    }, []);

    useEffect(() => {
        if (ocrProcess1.currentChar && ocrProcess1.currentCharImageData) {
            addCharacterToStream(ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, "Scan 1 (Video)", TEXT_SCREENSHOT_GRADIENTS[gradientSetIndexRef.current % TEXT_SCREENSHOT_GRADIENTS.length]);
        }
    }, [ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => {
        if (ocrProcess2.currentChar && ocrProcess2.currentCharImageData) {
            gradientSetIndexRef.current++;
            addCharacterToStream(ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, "Scan 2 (Static)", HELLO_WELCOME_GRADIENTS[gradientSetIndexRef.current % HELLO_WELCOME_GRADIENTS.length]);
        }
    }, [ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, addCharacterToStream]);

    const onCharacterFinishedStreamViz = useCallback((id: string) => setStreamCharacters(prev => prev.filter(c => c.id !== id)), []);
    const onNetworkWaveFinishedApp = useCallback((waveId: string) => setNetworkWaves(prev => prev.filter(w => w.id !== waveId)), []);

    const handleImageOnLoad = (sourceIndex: OcrSourceIndex) => {
        const ref = sourceIndex === 0 ? imageRef1 : imageRef2;
        const setDims = sourceIndex === 0 ? setImageDimensions1 : setImageDimensions2;
        const setAspect = sourceIndex === 0 ? setAspectRatio1 : setAspectRatio2;
        if (ref.current) {
            const w = ref.current.naturalWidth || 1920;
            const h = ref.current.naturalHeight || 1080;
            setDims({ width: w, height: h });
            if (w > 0 && h > 0) {
                setAspect(w / h);
            }
        }
    };

    // Collapse (shrink) the image after typo animation completes
    const onTypoAnimationComplete = (sourceIndex: OcrSourceIndex) => {
        if (sourceIndex === 0) {
            if (isOcrDone1) setCollapseImage1(true);
        } else {
            if (isOcrDone2) setCollapseImage2(true);
        }
    };

    const ACCENT_COLOR_1 = TEXT_SCREENSHOT_GRADIENTS[0][0];
    const ACCENT_COLOR_2 = HELLO_WELCOME_GRADIENTS[0][0];

    return (
        <React.Fragment>
            <div className="left-column">
                <div className="media-column">
                    <div className="ocr-output-container">
                        <h3>Live OCR Output (Handwriting)</h3>
                        {ocrProcess2.isProcessingOCR ? (
                            <p className="ocr-output-text">{ocrProcess2.liveOcrText}<span className="blinking-cursor">|</span></p>
                        ) : (
                            correctedTextParts2.length > 0 ? (
                                <AnimatedTypoText
                                    parts={correctedTextParts2}
                                    onComplete={() => onTypoAnimationComplete(1)}
                                />
                            ) : (
                                <p className="ocr-output-text">Awaiting OCR...</p>
                            )
                        )}
                    </div>

                    <div
                        ref={mediaContainerRef2}
                        className="media-container"
                        style={{ aspectRatio: aspectRatio2 }}
                    >
                        {/* Screenshot image under the video */}
                        <img
                            ref={imageRef2}
                            src="/hello_and_welcome.png"
                            alt="Hello and Welcome OCR"
                            className={`screenshot-underlay ${collapseImage2 ? 'shrink-vertical' : ''}`}
                            style={{ opacity: isVideoPlaying2 ? 0 : 1 }}
                            onLoad={() => handleImageOnLoad(1)}
                            crossOrigin="anonymous"
                        />

                        {/* Always render the video; fade out on end */}
                        <video
                            src="/hello_and_welcome_writing.mp4"
                            style={{
                                width: '100%',
                                height: '100%',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                zIndex: 2,
                                opacity: isVideoPlaying2 ? 1 : 0,
                                visibility: isVideoPlaying2 ? 'visible' : 'hidden',
                                pointerEvents: 'none'
                            }}
                            autoPlay
                            muted
                            onEnded={handleVideoEnd2}
                            playsInline
                        />

                        {imageDimensions2 && !collapseImage2 && (
                            <OcrOverlay
                                accentColor={ACCENT_COLOR_2}
                                recognizedChars={ocrProcess2.recognizedChars}
                                activeBoxInfo={{ activeItemIndex: ocrProcess2.activeItemIndex, processableLines: ocrProcess2.processableLines, imageDimensions: imageDimensions2, imageRef: imageRef2, showMediaElement }}
                            />
                        )}
                    </div>
                </div>

                <h1>Theo Kremer</h1>

                <div className="media-column">
                    <div className="ocr-output-container">
                        <h3>Live OCR Output (Screenshot)</h3>
                        {ocrProcess1.isProcessingOCR ? (
                            <p className="ocr-output-text">{ocrProcess1.liveOcrText}<span className="blinking-cursor">|</span></p>
                        ) : (
                            correctedTextParts1.length > 0 ? (
                                <AnimatedTypoText
                                    parts={correctedTextParts1}
                                    onComplete={() => onTypoAnimationComplete(0)}
                                />
                            ) : (
                                <p className="ocr-output-text">Awaiting OCR...</p>
                            )
                        )}
                    </div>

                    <div
                        ref={mediaContainerRef1}
                        className="media-container"
                        style={{ aspectRatio: aspectRatio1 }}
                    >
                        {/* Screenshot image under the video */}
                        <img
                            ref={imageRef1}
                            src="/text_screenshot.png"
                            alt="Text input for OCR"
                            className={`screenshot-underlay ${collapseImage1 ? 'shrink-vertical' : ''}`}
                            style={{ opacity: isVideoPlaying1 ? 0 : 1 }}
                            onLoad={() => handleImageOnLoad(0)}
                            crossOrigin="anonymous"
                        />

                        {/* Always render the video; fade out on end */}
                        <video
                            src="/text_writing.mp4"
                            style={{
                                width: '100%',
                                height: '100%',
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                zIndex: 2,
                                opacity: isVideoPlaying1 ? 1 : 0,
                                visibility: isVideoPlaying1 ? 'visible' : 'hidden',
                                pointerEvents: 'none'
                            }}
                            autoPlay
                            muted
                            onEnded={handleVideoEnd1}
                            playsInline
                        />

                        {imageDimensions1 && !collapseImage1 && (
                            <OcrOverlay
                                accentColor={ACCENT_COLOR_1}
                                recognizedChars={ocrProcess1.recognizedChars}
                                activeBoxInfo={{ activeItemIndex: ocrProcess1.activeItemIndex, processableLines: ocrProcess1.processableLines, imageDimensions: imageDimensions1, imageRef: imageRef1, showMediaElement }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="right-column">
                <div className="steps-extra-info-container" style={{ minHeight: `${GRAPH_CANVAS_HEIGHT + 70}px`, width: '100%', position: 'relative' }}>
                    <h3 style={{ textAlign: 'center', marginBottom: '5px' }}>Shared Network Visualization</h3>
                    {(ocrProcess1.isProcessingOCR || ocrProcess2.isProcessingOCR) && (<div style={{ position: 'absolute', top: '35px', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}><Spin tip="Processing OCR..." /></div>)}
                    <div ref={networkContainerRef} style={{ position: 'relative', width: '100%', height: `${GRAPH_CANVAS_HEIGHT}px` }}>
                        {networkContainerRef.current && (<CharacterStreamViz characters={streamCharacters} containerSize={{ width: networkContainerRef.current.clientWidth, height: GRAPH_CANVAS_HEIGHT }} onCharacterFinished={onCharacterFinishedStreamViz} />)}
                        {showNetworkGraph && showMediaElement && networkContainerRef.current && (<NetworkGraphViz waves={networkWaves} onWaveFinished={onNetworkWaveFinishedApp} flattenLayerName="flatten" hiddenDenseLayerName="dense" outputLayerName={FINAL_LAYER_NAME} centralConnectionPoint={{ x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y }} />)}
                    </div>
                </div>

                <Alert.ErrorBoundary>
                    {!tfReady && !errorState && !isLoadingModel && <Alert message="Initializing TensorFlow.js..." type="info" showIcon />}
                    {isLoadingModel && tfReady && (<Alert message={<span>Loading EMNIST Model... <Spin size="small" /></span>} type="info" showIcon />)}
                    {errorState && (<Alert message={errorState} type="error" showIcon closable onClose={() => setErrorState(null)} />)}
                    {!isLoadingModel && !ocrProcess1.isProcessingOCR && !ocrProcess2.isProcessingOCR && (
                        <Space direction="horizontal" size="middle" className="controls" wrap style={{ marginTop: '20px', justifyContent: 'center', width: '100%' }}>
                            <Switch title="Toggle Conv Filters" checkedChildren="Conv Filters" unCheckedChildren="Conv Filters" checked={showConvFilters} onChange={setShowConvFilters} />
                            <Switch title="Toggle Weights" checkedChildren="Weights" unCheckedChildren="Weights" checked={showWeights} onChange={setShowWeights} />
                            <Switch title="Toggle Network Graph" checkedChildren="Network Graph" unCheckedChildren="Network Graph" checked={showNetworkGraph} onChange={setShowNetworkGraph} />
                        </Space>
                    )}
                </Alert.ErrorBoundary>

                {showWeights && modelWeights && (
                    <div style={{ marginTop: 16 }}>
                        <WeightViz weights={modelWeights} layerName="conv2d" />
                    </div>
                )}
                {showConvFilters && modelWeights && (
                    <div style={{ marginTop: 16 }}>
                        <ConvolutionFiltersViz weights={modelWeights} layerName="conv2d" />
                    </div>
                )}
            </div>
        </React.Fragment>
    );
}

export default LandingPage;
