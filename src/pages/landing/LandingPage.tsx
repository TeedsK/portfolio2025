// src/pages/landing/LandingPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Switch, Space, Alert, Spin, Popover } from 'antd';
import '../../App.css';
import { log, warn, error } from '../../utils/logger';
import OcrOverlay, { OcrDisplayLine } from "./components/OcrOverlay";
import CharacterStreamViz from './components/CharacterStreamViz';
import useOcrProcessing from './hooks/useOcrProcessing';
import {
    DisplayTextPart,
    TypoCorrectionResponse,
    TokenTypoDetail,
    OcrDisplayLinePart,
    StreamCharacter,
    AnimationWave,
} from '../../types';
import { WeightViz } from './components/WeightViz';
import { ConvolutionFiltersViz } from './components/ConvolutionFiltersViz';
import { NetworkGraphViz, FATTEN_LAYER_X } from './components/NetworkGraphViz';
import gsap from 'gsap';
import {
    EMNIST_MODEL_URL,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TYPO_API_URL,
    OCR_OVERLAY_TEXT_COLOR_NORMAL,
    TEXT_SCREENSHOT_GRADIENTS,
    HELLO_WELCOME_GRADIENTS,
} from './utils/constants';
import { useTfModel } from '../../utils/useTfModel';
import {
    TYPO_HIGHLIGHT_DELAY_MS,
    CHAR_BOX_CONTENT_WIDTH,
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING
} from './utils/animation';
import { PathManager } from './utils/path';

const GRAPH_CANVAS_HEIGHT = 500;
const CENTRAL_CONNECTION_X = FATTEN_LAYER_X - 50;
const CENTRAL_CONNECTION_Y = GRAPH_CANVAS_HEIGHT / 2;
const OCR_START_DELAY_MS = 50; // Delay to start OCR after video plays

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

    // State for first media element (text_screenshot)
    const [imageDimensions1, setImageDimensions1] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying1, setIsVideoPlaying1] = useState<boolean>(true);
    const [shouldStartOcr1, setShouldStartOcr1] = useState<boolean>(false);
    const [isShowingTypoHighlights1, setIsShowingTypoHighlights1] = useState<boolean>(false);
    const hasStartedAutoOcr1 = useRef<boolean>(false);
    const imageRef1 = useRef<HTMLImageElement | null>(null);
    const videoRef1 = useRef<HTMLVideoElement>(null);
    const mediaContainerRef1 = useRef<HTMLDivElement>(null);
    const ocrOverlayLineRefs1 = useRef<Map<string, HTMLDivElement | null>>(new Map());

    // State for second media element (hello_and_welcome)
    const [imageDimensions2, setImageDimensions2] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying2, setIsVideoPlaying2] = useState<boolean>(true);
    const [shouldStartOcr2, setShouldStartOcr2] = useState<boolean>(false);
    const [isShowingTypoHighlights2, setIsShowingTypoHighlights2] = useState<boolean>(false);
    const hasStartedAutoOcr2 = useRef<boolean>(false);
    const imageRef2 = useRef<HTMLImageElement | null>(null);
    const videoRef2 = useRef<HTMLVideoElement>(null);
    const mediaContainerRef2 = useRef<HTMLDivElement>(null);
    const ocrOverlayLineRefs2 = useRef<Map<string, HTMLDivElement | null>>(new Map());

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

    const ocrProcess1 = useOcrProcessing({
        imageRef: imageRef1,
        setNetworkWaves: commonSetNetworkWaves,
        model,
        visModel,
        tfReady,
        isLoadingModel,
    });
    const ocrProcess2 = useOcrProcessing({
        imageRef: imageRef2,
        setNetworkWaves: commonSetNetworkWaves,
        model,
        visModel,
        tfReady,
        isLoadingModel,
    });

    const networkContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (modelLoadError) setErrorState(modelLoadError);
    }, [modelLoadError]);

    useEffect(() => {
        const setupObserver = (containerRef: React.RefObject<HTMLDivElement>, setDims: React.Dispatch<React.SetStateAction<{ width: number; height: number } | null>>, id: string) => {
            if (containerRef.current) {
                const observer = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        const { width, height } = entry.contentRect;
                        if (width > 0 && height > 0) {
                            log(`ResizeObserver (${id}), new overlay dims: ${width}x${height}`);
                            setDims({ width, height });
                        } else {
                            log(`ResizeObserver (${id}): Invalid dimensions for overlay: ${width}x${height}`);
                        }
                    }
                });
                observer.observe(containerRef.current);
                return observer;
            }
            return null;
        };
        const observer1 = setupObserver(mediaContainerRef1, setImageDimensions1, "Scan1Container");
        const observer2 = setupObserver(mediaContainerRef2, setImageDimensions2, "Scan2Container");
        return () => {
            if (observer1) observer1.disconnect();
            if (observer2) observer2.disconnect();
        };
    }, []);

    const handleTypoCorrectionAPI = useCallback(async (textToCorrect: string, sourceIndex: OcrSourceIndex) => {
        const { setOcrDisplayLines: setLinesHook, ocrDisplayLines: linesHook } = sourceIndex === 0 ? ocrProcess1 : ocrProcess2;
        const setShowHighlights = sourceIndex === 0 ? setIsShowingTypoHighlights1 : setIsShowingTypoHighlights2;
        const scanName = sourceIndex === 0 ? "text_screenshot" : "hello_and_welcome";

        if (!textToCorrect.trim()) return;

        log(`Sending to typo API for ${scanName}: ${textToCorrect.substring(0, 50)}...`);
        setErrorState(null);

        try {
            const response = await fetch(TYPO_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentence: textToCorrect, top_k: 3 }), });
            if (!response.ok) { const errData = await response.json().catch(() => ({ message: "Unknown API error" })); throw new Error(`API Error (${response.status}): ${errData.error || errData.message}`); }
            const result = await response.json() as TypoCorrectionResponse;
            log(`Typo API response for ${scanName}:`, result);

            const popoverInteractivePartsData: DisplayTextPart[] = [];
            const originalWordsAndSpacesForPopover = result.original_sentence.split(/(\s+)/);
            let currentTokenDetailSearchIndex = 0;
            originalWordsAndSpacesForPopover.forEach(part => {
                if (part.match(/^\s+$/) || part === '') { popoverInteractivePartsData.push({ text: part, isWhitespace: true, isFlagged: false }); }
                else {
                    let detail: TokenTypoDetail | undefined;
                    for (let i = currentTokenDetailSearchIndex; i < result.token_details.length; i++) {
                        if (result.token_details[i].token === part) { detail = result.token_details[i]; currentTokenDetailSearchIndex = i + 1; break; }
                    }
                    if (detail) { popoverInteractivePartsData.push({ text: part, isWhitespace: false, isFlagged: detail.pred_tag !== 'KEEP', originalToken: part, predictions: detail.top_probs, predictedTag: detail.pred_tag }); }
                    else { warn(`Popover (${scanName}): Word "${part}" not found. Details:`, result.token_details); popoverInteractivePartsData.push({ text: part, isWhitespace: false, isFlagged: false }); }
                }
            });

            const linesFromApiSentence = result.original_sentence.split('\n');
            let globalTokenIndex = 0;
            const updatedOcrDisplayLines = linesHook.map((existingLine: OcrDisplayLine, lineIdx: number) => {
                const lineTextFromApi = linesFromApiSentence[lineIdx] || "";
                const newParts: OcrDisplayLinePart[] = [];
                let partIdCounter = 0;
                const wordsAndSpacesOnLine = lineTextFromApi.split(/(\s+)/).filter(p => p.length > 0);
                wordsAndSpacesOnLine.forEach(textSegment => {
                    const partId = `${existingLine.id}-part-${partIdCounter++}`;
                    if (textSegment.match(/^\s+$/)) { newParts.push({ id: partId, text: textSegment, isWhitespace: true, ref: React.createRef() }); }
                    else {
                        let isFlagged = false;
                        const popoverMatch = popoverInteractivePartsData.find(pip => pip.text === textSegment && !pip.isWhitespace);
                        if (globalTokenIndex < result.token_details.length && result.token_details[globalTokenIndex].token === textSegment) {
                            isFlagged = result.token_details[globalTokenIndex].pred_tag !== 'KEEP'; globalTokenIndex++;
                        } else if (popoverMatch) {
                            warn(`Highlighting (${scanName}) fallback for "${textSegment}". API token: "${result.token_details[globalTokenIndex]?.token}".`);
                            isFlagged = popoverMatch.isFlagged;
                            const resyncIdx = result.token_details.findIndex((td, idx) => idx >= globalTokenIndex && td.token === textSegment);
                            if (resyncIdx !== -1) globalTokenIndex = resyncIdx + 1;
                        } else {
                            warn(`Highlighting (${scanName}) mismatch: "${textSegment}" vs API "${result.token_details[globalTokenIndex]?.token}". No popover match.`);
                        }
                        newParts.push({ id: partId, text: textSegment, isWhitespace: false, isFlagged, ref: React.createRef() });
                    }
                });
                return { ...existingLine, parts: newParts, textDuringOcr: lineTextFromApi };
            });
            setLinesHook(updatedOcrDisplayLines);
            setShowHighlights(true);
        } catch (errApi) {
            error(`Typo correction API call failed for ${scanName}:`, errApi);
            setErrorState(`Typo API Error (${scanName}): ${errApi instanceof Error ? errApi.message : String(errApi)}`);
            setLinesHook((prevLines: OcrDisplayLine[]) => prevLines.map(line => ({ ...line, parts: line.textDuringOcr.split(/(\s+)/).filter(p => p.length > 0).map((p, idx) => ({ id: `${line.id}-part-${idx}`, text: p, isWhitespace: p.match(/^\s+$/) !== null, isFlagged: false, ref: React.createRef() })) })));
            setShowHighlights(true);
        }
    }, [ocrProcess1.ocrDisplayLines, ocrProcess1.setOcrDisplayLines, ocrProcess2.ocrDisplayLines, ocrProcess2.setOcrDisplayLines]);

    const handleVideoEnd1 = () => {
        log('Video ended for text_screenshot.');
        setIsVideoPlaying1(false);
    };
    const handleVideoEnd2 = () => {
        log('Video ended for hello_and_welcome.');
        setIsVideoPlaying2(false);
    };

    useEffect(() => {
        if (isVideoPlaying1 && !hasStartedAutoOcr1.current) {
            const timer = setTimeout(() => {
                if (isVideoPlaying1) {
                    log(`Auto-starting OCR timer for Scan 1 with ${OCR_START_DELAY_MS}ms delay.`);
                    hasStartedAutoOcr1.current = true;
                    setShouldStartOcr1(true);
                }
            }, OCR_START_DELAY_MS);
            return () => clearTimeout(timer);
        }
    }, [isVideoPlaying1]);

    useEffect(() => {
        if (isVideoPlaying2 && !hasStartedAutoOcr2.current) {
            const timer = setTimeout(() => {
                if (isVideoPlaying2) {
                    log(`Auto-starting OCR timer for Scan 2 with ${OCR_START_DELAY_MS}ms delay.`);
                    hasStartedAutoOcr2.current = true;
                    setShouldStartOcr2(true);
                }
            }, OCR_START_DELAY_MS);
            return () => clearTimeout(timer);
        }
    }, [isVideoPlaying2]);


    useEffect(() => {
        if (shouldStartOcr1 && imageDimensions1 && imageRef1.current?.complete && !ocrProcess1.isProcessingOCR && tfReady && !isLoadingModel) {
            log(`Executing OCR for Scan 1. Dims: ${JSON.stringify(imageDimensions1)}`);
            if (!imageDimensions1) return;
            ocrProcess1.startOcr(imageDimensions1)
                .then(raw => { if (raw && raw.trim().length > 0) handleTypoCorrectionAPI(raw, 0); else log("OCR1 empty result"); })
                .catch(err => { error("OCR1 failed", err); })
                .finally(() => setShouldStartOcr1(false));
        }
    }, [shouldStartOcr1, imageDimensions1, ocrProcess1.isProcessingOCR, tfReady, isLoadingModel, ocrProcess1.startOcr, handleTypoCorrectionAPI]);

    useEffect(() => {
        if (shouldStartOcr2 && imageDimensions2 && imageRef2.current?.complete && !ocrProcess2.isProcessingOCR && tfReady && !isLoadingModel) {
            log(`Executing OCR for Scan 2. Dims: ${JSON.stringify(imageDimensions2)}`);
            if (!imageDimensions2) return;
            ocrProcess2.startOcr(imageDimensions2)
                .then(raw => { if (raw && raw.trim().length > 0) handleTypoCorrectionAPI(raw, 1); else log("OCR2 empty result"); })
                .catch(err => { error("OCR2 failed", err); })
                .finally(() => setShouldStartOcr2(false));
        }
    }, [shouldStartOcr2, imageDimensions2, ocrProcess2.isProcessingOCR, tfReady, isLoadingModel, ocrProcess2.startOcr, handleTypoCorrectionAPI]);


    const addCharacterToStream = useCallback((char: string | null, imageData: ImageData | null, onAnimFinishedCallback: (processedCharString: string, gradientSetForWave: string[]) => void, sourceName: "Scan 1 (Video)" | "Scan 2 (Static)", chosenGradientSet: string[], delayMs = 0) => {
        const createAndAddChar = () => {
            if (char && imageData && networkContainerRef.current) {
                const containerRect = networkContainerRef.current.getBoundingClientRect();
                if (!containerRect || containerRect.height === 0 || containerRect.width === 0) {
                    warn("Network container not sized yet for CharacterStreamViz, character add skipped.");
                    return;
                }
                const spawnAreaWidth = CENTRAL_CONNECTION_X - 50;
                const standardBoxTotalWidth = CHAR_BOX_CONTENT_WIDTH + CHAR_BOX_PADDING * 2;
                const standardBoxTotalHeight = CHAR_BOX_CONTENT_HEIGHT + CHAR_BOX_PADDING * 2;
                const xOffset = sourceName === "Scan 2 (Static)" ? 10 : 0;
                const initialStartX = (Math.random() * (spawnAreaWidth - standardBoxTotalWidth - xOffset)) + xOffset;
                const initialStartY = (Math.random() * (containerRect.height - standardBoxTotalHeight));

                const p0 = { x: initialStartX + standardBoxTotalWidth / 2, y: initialStartY + standardBoxTotalHeight / 2 };
                const p2 = { x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y };
                const p1 = Math.random() > 0.5 ? { x: p0.x, y: p2.y } : { x: p2.x, y: p0.y };

                const newChar: StreamCharacter = {
                    id: `char-${Date.now()}-${sourceName.replace(/\s|\(|\)/g,'')}-${Math.random()}`,
                    charImage: imageData,
                    startX: initialStartX,
                    startY: initialStartY,
                    path: new PathManager(p0, p1, p2, 15),
                    animationState: 'appearing',
                    alpha: 0,
                    scale: 0.5,
                    gradientSet: chosenGradientSet,
                    headProgress: 0,
                    tailProgress: 0,
                    isRetractingColorOverride: false,
                    onFinished: () => onAnimFinishedCallback(char, chosenGradientSet),
                };
                setStreamCharacters(prev => [...prev, newChar]);
            }
        };

        if (delayMs > 0) setTimeout(createAndAddChar, delayMs);
        else createAndAddChar();
    }, []);

    useEffect(() => {
        if(ocrProcess1.currentChar && ocrProcess1.currentCharImageData) {
            const gradientsToUse = TEXT_SCREENSHOT_GRADIENTS;
            const chosenGradientSet = gradientsToUse[gradientSetIndexRef.current % gradientsToUse.length];
            addCharacterToStream(ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, "Scan 1 (Video)", chosenGradientSet, 0);
        }
    }, [ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => {
        if(ocrProcess2.currentChar && ocrProcess2.currentCharImageData) {
            const gradientsToUse = HELLO_WELCOME_GRADIENTS;
            const chosenGradientSet = gradientsToUse[(gradientSetIndexRef.current + Math.floor(gradientsToUse.length/2)) % gradientsToUse.length];
            gradientSetIndexRef.current++;
            addCharacterToStream(ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, "Scan 2 (Static)", chosenGradientSet, 75);
        }
    }, [ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => {
        const animateHighlights = (ocrDisplayLines: OcrDisplayLine[], isTypoHighlightingActive: boolean) => {
            if (isTypoHighlightingActive && ocrDisplayLines.some(line => line.parts.length > 0)) {
                const wordSpansToAnimate: HTMLElement[] = [];
                ocrDisplayLines.forEach(line => {
                    line.parts.forEach(part => {
                        if (!part.isWhitespace && part.ref?.current) wordSpansToAnimate.push(part.ref.current);
                    });
                });
                if (wordSpansToAnimate.length > 0) {
                    gsap.set(wordSpansToAnimate, { opacity: 1, color: OCR_OVERLAY_TEXT_COLOR_NORMAL });
                    const tl = gsap.timeline();
                    wordSpansToAnimate.forEach((span) => {
                        const isIncorrect = span.classList.contains('typo-incorrect');
                        tl.to(span, { color: isIncorrect ? '#dc3545' : '#28a745', duration: 0.3, ease: 'power1.inOut' }, `-=${0.3 - (TYPO_HIGHLIGHT_DELAY_MS / 1000)}`);
                    });
                }
            }
        };
        animateHighlights(ocrProcess1.ocrDisplayLines, isShowingTypoHighlights1);
        animateHighlights(ocrProcess2.ocrDisplayLines, isShowingTypoHighlights2);

    }, [isShowingTypoHighlights1, ocrProcess1.ocrDisplayLines, isShowingTypoHighlights2, ocrProcess2.ocrDisplayLines]);


    const onCharacterFinishedStreamViz = useCallback((id: string) => {
        setStreamCharacters(prev => prev.filter(c => c.id !== id));
    }, []);

    const onNetworkWaveFinishedApp = useCallback((waveId: string) => {
        setNetworkWaves(prev => prev.filter(w => w.id !== waveId));
    }, []);

    const handleImageOnLoad = useCallback((sourceIndex: OcrSourceIndex) => {
        const ref = sourceIndex === 0 ? imageRef1 : imageRef2;
        const containerRef = sourceIndex === 0 ? mediaContainerRef1 : mediaContainerRef2;
        const setDims = sourceIndex === 0 ? setImageDimensions1 : setImageDimensions2;
        const scanName = sourceIndex === 0 ? "text_screenshot" : "hello_and_welcome";

        if (ref.current && containerRef.current) {
            log(`Image ${scanName} loaded. Natural: ${ref.current.naturalWidth}x${ref.current.naturalHeight}`);

            const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();
            const contentAreaWidth = containerWidth > 8 ? containerWidth - 8 : 0;
            const contentAreaHeight = containerHeight > 8 ? containerHeight - 8 : 0;

            if (contentAreaWidth > 0 && contentAreaHeight > 0) {
                setDims({ width: contentAreaWidth, height: contentAreaHeight });
            } else if (ref.current.naturalWidth > 0 && ref.current.naturalHeight > 0) {
                log(`Container for ${scanName} has no dimensions, falling back to natural image size for overlay trigger.`);
                setDims({ width: Math.max(0, ref.current.naturalWidth - 8), height: Math.max(0, ref.current.naturalHeight - 8) });
            } else {
                log(`Cannot set dimensions for ${scanName}, container and natural size are zero.`);
            }
        }
    }, []);

    return (
        <React.Fragment>
            <div className="left-column">
                <div className="media-column">
                    <div className="ocr-output-container">
                        <h3>Live OCR Output (Source 2)</h3>
                        <p className="ocr-output-text">{ocrProcess2.liveOcrText || "Awaiting OCR..."}</p>
                    </div>
                    <div ref={mediaContainerRef2} id="mediaContainer2" className="media-container">
                        <img
                            ref={imageRef2} src="/hello_and_welcome.png" alt="Hello and Welcome OCR"
                            className="screenshot-underlay"
                            style={{ opacity: isVideoPlaying2 ? 0 : 1, position: isVideoPlaying2 ? 'absolute' : 'relative', top: 0, left: 0, display: 'block', width: '100%', height: 'auto' }}
                            onLoad={() => handleImageOnLoad(1)} crossOrigin="anonymous"
                        />
                        {isVideoPlaying2 && (
                            <video ref={videoRef2} src="/hello_and_welcome_writing.mp4" style={{ width: '100%', height: 'auto', display: 'block', position: 'relative', zIndex: 2 }} autoPlay muted onEnded={handleVideoEnd2} playsInline />
                        )}
                        {imageDimensions2 && (
                            <OcrOverlay
                                lines={ocrProcess2.ocrDisplayLines} isShowingHighlights={isShowingTypoHighlights2}
                                lineRefs={ocrOverlayLineRefs2}
                                activeBoxInfo={{
                                    activeItemIndex: ocrProcess2.activeItemIndex, processableLines: ocrProcess2.processableLines,
                                    imageDimensions: imageDimensions2, imageRef: imageRef2,
                                    showMediaElement
                                }}
                            />
                        )}
                    </div>
                </div>
                <h1>Theo Kremer</h1>
                <div className="media-column">
                    <div className="ocr-output-container">
                        <h3>Live OCR Output (Source 1)</h3>
                        <p className="ocr-output-text">{ocrProcess1.liveOcrText || "Awaiting OCR..."}</p>
                    </div>
                    <div ref={mediaContainerRef1} id="mediaContainer1" className="media-container">
                        <img
                            ref={imageRef1} src="/text_screenshot.png" alt="Text input for OCR"
                            className="screenshot-underlay"
                            style={{ opacity: isVideoPlaying1 ? 0 : 1, position: isVideoPlaying1 ? 'absolute' : 'relative', top: 0, left: 0, display: 'block', width: '100%', height: 'auto' }}
                            onLoad={() => handleImageOnLoad(0)} crossOrigin="anonymous"
                        />
                        {isVideoPlaying1 && (
                            <video ref={videoRef1} src="/text_writing.mp4" style={{ width: '100%', height: 'auto', display: 'block', position: 'relative', zIndex: 2 }} autoPlay muted onEnded={handleVideoEnd1} playsInline />
                        )}
                        {imageDimensions1 && (
                            <OcrOverlay
                                lines={[]} 
                                isShowingHighlights={isShowingTypoHighlights1}
                                lineRefs={ocrOverlayLineRefs1}
                                activeBoxInfo={{
                                    activeItemIndex: ocrProcess1.activeItemIndex, processableLines: ocrProcess1.processableLines,
                                    imageDimensions: imageDimensions1, imageRef: imageRef1,
                                    showMediaElement
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="right-column">
                <div className="steps-extra-info-container" style={{ minHeight: `${GRAPH_CANVAS_HEIGHT + 70}px`, width: '100%', position: 'relative' }}>
                    <h3 style={{ textAlign: 'center', marginBottom: '5px' }}>Shared Network Visualization</h3>
                    {(ocrProcess1.isProcessingOCR || ocrProcess2.isProcessingOCR) &&
                        <div style={{ position: 'absolute', top: '35px', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
                            <Spin tip="Processing OCR..." />
                        </div>
                    }
                    <div ref={networkContainerRef} style={{ position: 'relative', width: '100%', height: `${GRAPH_CANVAS_HEIGHT}px` }}>
                        {networkContainerRef.current && (networkContainerRef.current.clientWidth > 0) && (
                            <CharacterStreamViz
                                characters={streamCharacters}
                                containerSize={{
                                    width: networkContainerRef.current.clientWidth,
                                    height: GRAPH_CANVAS_HEIGHT
                                }}
                                onCharacterFinished={onCharacterFinishedStreamViz}
                            />
                        )}
                        {showNetworkGraph && showMediaElement && networkContainerRef.current && (
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${GRAPH_CANVAS_HEIGHT}px` }}>
                                <NetworkGraphViz
                                    waves={networkWaves}
                                    onWaveFinished={onNetworkWaveFinishedApp}
                                    flattenLayerName="flatten"
                                    hiddenDenseLayerName="dense"
                                    outputLayerName={FINAL_LAYER_NAME}
                                    centralConnectionPoint={{ x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y }}
                                />
                            </div>
                        )}
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
            </div>
        </React.Fragment>
    );
}

export default LandingPage;