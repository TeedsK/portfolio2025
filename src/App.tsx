// src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Switch, Space, Alert, Spin, Popover, Tag } from 'antd';
import './App.css';
import { log, warn, error } from './utils/logger';
import OcrOverlay, { OcrDisplayLine } from "./components/OcrOverlay";
import CharacterStreamViz from './components/visualizations/CharacterStreamViz';
import useOcrProcessing from './hooks/useOcrProcessing';
import {
    DisplayTextPart,
    TypoCorrectionResponse,
    TokenTypoDetail,
    OcrDisplayLinePart,
    StreamCharacter,
    AnimationWave,
} from './types';
import { WeightViz } from './components/visualizations/WeightViz';
import { ConvolutionFiltersViz } from './components/visualizations/ConvolutionFiltersViz';
import { NetworkGraphViz, FATTEN_LAYER_X } from './components/visualizations/NetworkGraphViz';
import gsap from 'gsap';
import {
    EMNIST_MODEL_URL,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TYPO_API_URL,
    OCR_OVERLAY_TEXT_COLOR_NORMAL,
    STATUS_TEXTS,
    getTagColorForProbability,
    TEXT_SCREENSHOT_GRADIENTS, 
    HELLO_WELCOME_GRADIENTS,   
} from './constants';
import { useTfModel } from './hooks/useTfModel';
import { 
    TYPO_HIGHLIGHT_DELAY_MS,
    CHAR_BOX_CONTENT_WIDTH, 
    CHAR_BOX_CONTENT_HEIGHT,
    CHAR_BOX_PADDING
} from './config/animation';
import { PathManager } from './utils/path';

const GRAPH_CANVAS_HEIGHT = 500;
const CENTRAL_CONNECTION_X = FATTEN_LAYER_X - 50;
const CENTRAL_CONNECTION_Y = GRAPH_CANVAS_HEIGHT / 2;

type OcrSourceIndex = 0 | 1; 

function App() {
    const [errorState, setErrorState] = useState<string | null>(null);
    
    const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
    const [showWeights, setShowWeights] = useState<boolean>(false);
    const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);
    const [showMediaElement] = useState<boolean>(true); 
    
    const [streamCharacters, setStreamCharacters] = useState<StreamCharacter[]>([]);
    const [networkWaves, setNetworkWaves] = useState<AnimationWave[]>([]);
    
    const gradientSetIndexRef = useRef(0); 

    const [imageDimensions1, setImageDimensions1] = useState<{ width: number; height: number } | null>(null);
    const [isVideoPlaying1, setIsVideoPlaying1] = useState<boolean>(true); 
    const [shouldStartOcr1, setShouldStartOcr1] = useState<boolean>(false);
    const [isShowingTypoHighlights1, setIsShowingTypoHighlights1] = useState<boolean>(false);
    const [currentAppPhase1, setCurrentAppPhase1] = useState<number>(0); 
    const hasStartedAutoOcr1 = useRef<boolean>(false); 
    const [interactiveOcrParts1, setInteractiveOcrParts1] = useState<DisplayTextPart[]>([]);
    const [backendCorrectedSentence1, setBackendCorrectedSentence1] = useState<string>('');
    const [isTypoCheckingAPILoading1, setIsTypoCheckingAPILoading1] = useState<boolean>(false);
    const imageRef1 = useRef<HTMLImageElement | null>(null);
    const videoRef1 = useRef<HTMLVideoElement>(null);
    const statusTextRef1 = useRef<HTMLSpanElement>(null);
    const mediaContainerRef1 = useRef<HTMLDivElement>(null);
    const ocrOverlayLineRefs1 = useRef<Map<string, HTMLDivElement | null>>(new Map());

    const [imageDimensions2, setImageDimensions2] = useState<{ width: number; height: number } | null>(null);
    const [shouldStartOcr2, setShouldStartOcr2] = useState<boolean>(false);
    const [isShowingTypoHighlights2, setIsShowingTypoHighlights2] = useState<boolean>(false);
    const [currentAppPhase2, setCurrentAppPhase2] = useState<number>(0); 
    const [interactiveOcrParts2, setInteractiveOcrParts2] = useState<DisplayTextPart[]>([]);
    const [backendCorrectedSentence2, setBackendCorrectedSentence2] = useState<string>('');
    const [isTypoCheckingAPILoading2, setIsTypoCheckingAPILoading2] = useState<boolean>(false);
    const imageRef2 = useRef<HTMLImageElement | null>(null);
    const statusTextRef2 = useRef<HTMLSpanElement>(null);
    const mediaContainerRef2 = useRef<HTMLDivElement>(null);
    const ocrOverlayLineRefs2 = useRef<Map<string, HTMLDivElement | null>>(new Map());

    const commonSetNetworkWaves = useCallback((updater: React.SetStateAction<AnimationWave[]>) => {
        setNetworkWaves(prev => typeof updater === 'function' ? updater(prev) : updater);
    }, []);

    const ocrProcess1 = useOcrProcessing({ 
        imageRef: imageRef1,
        setNetworkWaves: commonSetNetworkWaves 
    });
    const ocrProcess2 = useOcrProcessing({ 
        imageRef: imageRef2,
        setNetworkWaves: commonSetNetworkWaves 
    });

    const networkContainerRef = useRef<HTMLDivElement>(null);

    const {
        weights: modelWeights,
        isLoading: isLoadingModel,
        tfReady,
        error: modelLoadError,
    } = useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

    useEffect(() => {
        if (modelLoadError) setErrorState(modelLoadError);
    }, [modelLoadError]);

    useEffect(() => {
        const setupObserver = (containerRef: React.RefObject<HTMLDivElement>, setDims: React.Dispatch<React.SetStateAction<{width: number; height: number} | null>>, id: string) => {
            if (containerRef.current) {
                const observer = new ResizeObserver(entries => {
                    for (const entry of entries) {
                        const { width, height } = entry.contentRect;
                        const contentAreaWidth = width - 8;  
                        const contentAreaHeight = height - 8; 
                        if (contentAreaWidth > 0 && contentAreaHeight > 0) {
                           log(`ResizeObserver (${id}), new overlay dims: ${contentAreaWidth}x${contentAreaHeight} (from container ${width}x${height})`);
                           setDims({ width: contentAreaWidth, height: contentAreaHeight });
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

    const updateStatusText = (ref: React.RefObject<HTMLSpanElement>, phase: number, isVideoPlayingRelevant: boolean, scanName: string) => {
        if (ref.current) {
            let newText = STATUS_TEXTS[phase] || STATUS_TEXTS[0];
            if (scanName === "Scan 1 (Video)") {
                if (phase === 0 && !isVideoPlayingRelevant) newText = "Text animation finished. Preparing OCR...";
                else if (phase === 0 && isVideoPlayingRelevant) newText = STATUS_TEXTS[0];
            } else if (scanName === "Scan 2 (Static)") {
                if (phase === 0) newText = "Preparing for static scan...";
            }
            
            const currentTextContent = ref.current.textContent;
            if (ref.current.textContent !== newText) {
                gsap.timeline()
                    .to(ref.current, { y: -20, opacity: 0, duration: 0.3, ease: 'power1.in', overwrite: true })
                    .add(() => { if (ref.current) ref.current.textContent = newText; })
                    .set(ref.current, { y: (currentTextContent !== "" && currentTextContent !== null && currentTextContent !== newText) ? 20 : 0, opacity: 0 })
                    .to(ref.current, { y: 0, opacity: 1, duration: 0.4, ease: 'power1.out' });
            } else if ((currentTextContent === "" || currentTextContent === null) && newText !== "") {
                if (ref.current) ref.current.textContent = newText;
                gsap.set(ref.current, {y: 0, opacity: 1});
            }
        }
    };
    useEffect(() => updateStatusText(statusTextRef1, currentAppPhase1, isVideoPlaying1, "Scan 1 (Video)"), [currentAppPhase1, isVideoPlaying1]);
    useEffect(() => updateStatusText(statusTextRef2, currentAppPhase2, false, "Scan 2 (Static)"), [currentAppPhase2]);

    const handleVideoEnd1 = () => {
        log('Video ended for text_screenshot.');
        setIsVideoPlaying1(false); 
        if (!hasStartedAutoOcr1.current && imageRef1.current?.complete) { 
            log("Video ended, triggering OCR for Scan 1.");
            hasStartedAutoOcr1.current = true;
            setShouldStartOcr1(true);
        }
    };

    const handleTypoCorrectionAPI = useCallback(async (textToCorrect: string, sourceIndex: OcrSourceIndex) => { 
        const { setOcrDisplayLines: setLinesHook, ocrDisplayLines: linesHook } = sourceIndex === 0 ? ocrProcess1 : ocrProcess2;
        const currentPhaseSetter = sourceIndex === 0 ? setCurrentAppPhase1 : setCurrentAppPhase2;
        const setLoading = sourceIndex === 0 ? setIsTypoCheckingAPILoading1 : setIsTypoCheckingAPILoading2;
        const setParts = sourceIndex === 0 ? setInteractiveOcrParts1 : setInteractiveOcrParts2;
        const setSentence = sourceIndex === 0 ? setBackendCorrectedSentence1 : setBackendCorrectedSentence2;
        const setShowHighlights = sourceIndex === 0 ? setIsShowingTypoHighlights1 : setIsShowingTypoHighlights2;
        const scanName = sourceIndex === 0 ? "text_screenshot" : "hello_and_welcome";

        if (!textToCorrect.trim()) {
            currentPhaseSetter(2); return;
        }
        log(`Sending to typo API for ${scanName}: ${textToCorrect.substring(0,50)}...`);
        setLoading(true); setErrorState(null); setParts([]); setSentence('');

        try {
            const response = await fetch(TYPO_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentence: textToCorrect, top_k: 3 }), });
            if (!response.ok) { const errData = await response.json().catch(() => ({ message: "Unknown API error" })); throw new Error(`API Error (${response.status}): ${errData.error || errData.message}`);}
            const result = await response.json() as TypoCorrectionResponse;
            log(`Typo API response for ${scanName}:`, result);
            setSentence(result.corrected_sentence);
            
            const popoverInteractivePartsData: DisplayTextPart[] = [];
            const originalWordsAndSpacesForPopover = result.original_sentence.split(/(\s+)/);
            let currentTokenDetailSearchIndex = 0;
            originalWordsAndSpacesForPopover.forEach(part => {
                if (part.match(/^\s+$/) || part === '') { popoverInteractivePartsData.push({ text: part, isWhitespace: true, isFlagged: false }); }
                else {
                    let detail: TokenTypoDetail | undefined;
                    for(let i = currentTokenDetailSearchIndex; i < result.token_details.length; i++) {
                        if (result.token_details[i].token === part) { detail = result.token_details[i]; currentTokenDetailSearchIndex = i + 1; break; }
                    }
                    if (detail) { popoverInteractivePartsData.push({ text: part, isWhitespace: false, isFlagged: detail.pred_tag !== 'KEEP', originalToken: part, predictions: detail.top_probs, predictedTag: detail.pred_tag }); }
                    else { warn(`Popover (${scanName}): Word "${part}" not found. Details:`,result.token_details); popoverInteractivePartsData.push({ text: part, isWhitespace: false, isFlagged: false }); }
                }
            });
            setParts(popoverInteractivePartsData);
            
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
            setLinesHook((prevLines: OcrDisplayLine[]) => prevLines.map(line => ({ ...line, parts: line.textDuringOcr.split(/(\s+)/).filter(p=>p.length>0).map((p,idx) => ({id: `${line.id}-part-${idx}`, text: p, isWhitespace: p.match(/^\s+$/) !== null, isFlagged: false, ref: React.createRef()})) })));
            setSentence(textToCorrect); 
            setShowHighlights(true);
        } finally { 
            setLoading(false); 
            currentPhaseSetter(2);
        }
    }, [ocrProcess1.ocrDisplayLines, ocrProcess1.setOcrDisplayLines, ocrProcess2.ocrDisplayLines, ocrProcess2.setOcrDisplayLines]);

    useEffect(() => { 
        if (isVideoPlaying1 && !hasStartedAutoOcr1.current) {
            const timer = setTimeout(() => {
                if (isVideoPlaying1) { 
                    log("Auto-starting OCR timer for Scan 1 (text_screenshot.png)");
                    hasStartedAutoOcr1.current = true;
                    setShouldStartOcr1(true);
                }
            }, 1200); 
            return () => clearTimeout(timer);
        } else if (!isVideoPlaying1 && !hasStartedAutoOcr1.current && imageRef1.current?.complete) {
            // If video already ended (e.g. fast load or re-render after video end) and OCR hasn't started
            log("Video already ended or not playing, attempting to start OCR for Scan 1.");
            hasStartedAutoOcr1.current = true;
            setShouldStartOcr1(true);
        }
    }, [isVideoPlaying1]);

    useEffect(() => { 
        let canStart = shouldStartOcr1 && imageDimensions1 && imageRef1.current?.complete && !ocrProcess1.isProcessingOCR;
        if (isVideoPlaying1 && !hasStartedAutoOcr1.current) {
            canStart = false;
        }

        if (canStart) {
            log(`Starting OCR for Scan 1 (text_screenshot). Img complete: ${imageRef1.current?.complete}, Dims: ${JSON.stringify(imageDimensions1)}`);
            setCurrentAppPhase1(1);
            if (!imageDimensions1) { 
                 error("Cannot start OCR1: imageDimensions1 is null.");
                 setShouldStartOcr1(false); setCurrentAppPhase1(isVideoPlaying1 ? 0 : 2);
                 return;
            }
            ocrProcess1.startOcr(imageDimensions1)
                .then(raw => { if (raw && raw.trim().length > 0) handleTypoCorrectionAPI(raw, 0); else { log("OCR1 empty result"); setCurrentAppPhase1(2); } })
                .catch(err => { error("OCR1 failed", err); setCurrentAppPhase1(2); })
                .finally(() => setShouldStartOcr1(false));
        }
    }, [shouldStartOcr1, imageDimensions1, ocrProcess1.isProcessingOCR, isVideoPlaying1, ocrProcess1.startOcr, handleTypoCorrectionAPI]);

    // Modified addCharacterToStream to include a delay parameter
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
                    id: `char-${Date.now()}-${sourceName.replace(/\s|\(|\)/g,'')}-${Math.random()}`, charImage: imageData,
                    startX: initialStartX, startY: initialStartY, path: new PathManager(p0, p1, p2, 15), 
                    animationState: 'appearing', alpha: 0, scale: 0.5, gradientSet: chosenGradientSet,
                    headProgress: 0, tailProgress: 0, isRetractingColorOverride: false,
                    onFinished: () => onAnimFinishedCallback(char, chosenGradientSet),
                };
                setStreamCharacters(prev => [...prev, newChar]);
            }
        };

        if (delayMs > 0) {
            setTimeout(createAndAddChar, delayMs);
        } else {
            createAndAddChar();
        }
    }, [/* No direct state dependencies from App, relies on passed args */]);

    useEffect(() => { 
        if(ocrProcess1.currentChar && ocrProcess1.currentCharImageData) {
            const gradientsToUse = TEXT_SCREENSHOT_GRADIENTS;
            const chosenGradientSet = gradientsToUse[gradientSetIndexRef.current % gradientsToUse.length];
            // gradientSetIndexRef.current++; // Increment globally or per source. Global means they share sequence.
            addCharacterToStream(ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, "Scan 1 (Video)", chosenGradientSet, 0); // No delay for first source
        }
    }, [ocrProcess1.currentChar, ocrProcess1.currentCharImageData, ocrProcess1.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => { 
        if(ocrProcess2.currentChar && ocrProcess2.currentCharImageData) {
            const gradientsToUse = HELLO_WELCOME_GRADIENTS;
            const chosenGradientSet = gradientsToUse[(gradientSetIndexRef.current + Math.floor(gradientsToUse.length/2)) % gradientsToUse.length]; // Offset starting gradient for visual difference
            gradientSetIndexRef.current++; // Increment globally
            addCharacterToStream(ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, "Scan 2 (Static)", chosenGradientSet, 75); // 75ms delay for second source
        }
    }, [ocrProcess2.currentChar, ocrProcess2.currentCharImageData, ocrProcess2.onCharAnimationFinished, addCharacterToStream]);

    useEffect(() => { 
        const animateHighlights = (ocrDisplayLines: OcrDisplayLine[], isTypoHighlightingActive: boolean) => {
            // ... (same as before) ...
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

    useEffect(() => { 
        if (shouldStartOcr2 && imageDimensions2 && imageRef2.current?.complete && !ocrProcess2.isProcessingOCR) {
            log(`Attempting to start OCR for Scan 2 (hello_and_welcome). Img complete: ${imageRef2.current?.complete}, Dims: ${JSON.stringify(imageDimensions2)}`);
            setCurrentAppPhase2(1);
            if (!imageDimensions2) { 
                error("Cannot start OCR2: imageDimensions2 is null.");
                setShouldStartOcr2(false); setCurrentAppPhase2(2);
                return;
            }
            const startDelay = 700; // Delay for the second OCR process to start.
            log(`Delaying OCR start for Scan 2 by ${startDelay}ms`);
            setTimeout(() => {
                if (imageRef2.current?.complete && !ocrProcess2.isProcessingOCR) { 
                    log("Starting OCR for Scan 2 after delay.");
                    ocrProcess2.startOcr(imageDimensions2)
                        .then(raw => { if (raw && raw.trim().length > 0) handleTypoCorrectionAPI(raw, 1); else { log("OCR2 empty result"); setCurrentAppPhase2(2); } })
                        .catch(err => { error("OCR2 failed", err); setCurrentAppPhase2(2); })
                        .finally(() => setShouldStartOcr2(false));
                } else {
                    log("Conditions for Scan 2 OCR no longer met after delay.");
                    setShouldStartOcr2(false); 
                }
            }, startDelay); 
        }
    }, [shouldStartOcr2, imageDimensions2, ocrProcess2.isProcessingOCR, ocrProcess2.startOcr, handleTypoCorrectionAPI]);
    
    const onCharacterFinishedStreamViz = useCallback((id: string) => {
        setStreamCharacters(prev => prev.filter(c => c.id !== id));
    }, []);
    
    const onNetworkWaveFinishedApp = useCallback((waveId: string) => {
        setNetworkWaves(prev => prev.filter(w => w.id !== waveId));
    }, []);

    const renderPopoverContent = (tokenDetail: DisplayTextPart) => { /* ... (same) ... */ 
        if (!tokenDetail.predictions) return null;
        return (
            <div>
                {Object.entries(tokenDetail.predictions)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 3)
                    .map(([tag, prob]) => (
                        <div key={tag}>{`${tag}: ${(prob * 100).toFixed(0)}%`}</div>
                    ))}
            </div>
        );
    };
        
    const handleImageOnLoad = useCallback((sourceIndex: OcrSourceIndex) => {
        const ref = sourceIndex === 0 ? imageRef1 : imageRef2;
        const containerRef = sourceIndex === 0 ? mediaContainerRef1 : mediaContainerRef2;
        const setDims = sourceIndex === 0 ? setImageDimensions1 : setImageDimensions2;
        const setShouldStart = sourceIndex === 0 ? setShouldStartOcr1 : setShouldStartOcr2;
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
                // Subtract padding only if natural size is used to mimic content area
                setDims({width: Math.max(0, ref.current.naturalWidth - 8), height: Math.max(0, ref.current.naturalHeight - 8)});
            } else {
                log(`Cannot set dimensions for ${scanName}, container and natural size are zero.`);
                return; 
            }

            if (sourceIndex === 0) { 
                if (!isVideoPlaying1 && !hasStartedAutoOcr1.current) { 
                    log("Setting shouldStartOcr1 (onLoad, video not playing).");
                    hasStartedAutoOcr1.current = true; 
                    setShouldStart(true);
                }
            } else { 
                log("Setting shouldStartOcr2 (onLoad).");
                setShouldStart(true); 
            }
        }
    }, [isVideoPlaying1]); 

    const renderOutputSection = ( /* ... (same) ... */
        title: string,
        ocrAppPhase: number,
        ocrIsProcessing: boolean,
        ocrHookPredictedText: string | null, 
        ocrInteractiveParts: DisplayTextPart[],
        ocrBackendSentence: string,
        ocrIsTypoLoading: boolean
    ) => (
        <>
            <div>
                <h3 style={{fontSize: '1em'}}>Detailed OCR ({title}):</h3>
                <div className="output-text-box" style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: '10px', minHeight: '30px', background: '#f9f9f9', lineHeight: '1.6', fontSize: '0.9em' }}>
                    {ocrAppPhase === 1 && ocrIsProcessing && !ocrHookPredictedText && <div><Spin size="small" tip="OCR..." /></div>}
                    {(ocrAppPhase >= 1 && !ocrIsProcessing && ocrInteractiveParts.length === 0 && ocrHookPredictedText ) ? ocrHookPredictedText : null}
                    {ocrInteractiveParts.map((part, index) => 
                        part.isFlagged && !part.isWhitespace && part.originalToken ? ( 
                            <Popover key={`${part.text}-${index}-pop-${title}`} content={renderPopoverContent(part)} title="Correction Details" trigger="hover" placement="top">
                                <span style={{ textDecoration: part.predictedTag === 'DELETE' ? 'line-through' : 'none', backgroundColor: '#fff2b2', padding: '0 1px', borderRadius: '2px', cursor: 'pointer' }}>
                                    {part.text}
                                </span>
                            </Popover>
                        ) : ( <span key={`${part.text}-${index}-pop-${title}`}>{part.text}</span> )
                    )}
                    {ocrAppPhase < 1 && !ocrIsProcessing && !ocrHookPredictedText && "Waiting..."}
                </div>
            </div>
            <div>
                <h3 style={{fontSize: '1em'}}>Corrected Text ({title}):</h3>
                <div className="output-text-box" style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: '10px', minHeight: '30px', background: '#e6ffed', lineHeight: '1.6', fontSize: '0.9em' }}>
                    {ocrAppPhase === 2 && ocrIsTypoLoading && <div><Spin size="small" tip="Correcting..." /></div>}
                    {ocrBackendSentence || ((ocrAppPhase >=2 && !ocrIsTypoLoading && ocrInteractiveParts.length === 0 && ocrHookPredictedText ) ? "Awaiting or no corrections." : "")}
                    {ocrAppPhase < 2 && !ocrBackendSentence && "Pending..."}
                </div>
            </div>
        </>
    );

    return (
        <div className="app-container">
            <h1>Theo Kremer - Concurrent OCR</h1>
            <div className="concurrent-media-wrapper" style={{ display: 'flex', flexDirection: 'row', gap: '15px', width: '100%', alignItems: 'flex-start' }}>
                
                <div className="media-column" style={{ flex: 1, border: '1px solid #ccc', padding: '10px', borderRadius: '8px', background: '#fdfdfd' }}>
                    <h2 style={{marginTop: 0, marginBottom: '10px', fontSize: '1.2em', textAlign: 'center'}}>Scan 1: Video Text</h2>
                    <div ref={mediaContainerRef1} id="mediaContainer1" className="media-container" style={{backgroundColor: '#e9e9e9', padding: '4px', position: 'relative'}}>
                        <img
                            ref={imageRef1} src="/text_screenshot.png" alt="Text input for OCR 1"
                            className="screenshot-underlay"
                            style={{ opacity: isVideoPlaying1 ? 0 : 1, position: isVideoPlaying1 ? 'absolute' : 'relative', top:0, left:0, display:'block', width: '100%', height:'auto'}}
                            onLoad={() => handleImageOnLoad(0)} crossOrigin="anonymous"
                        />
                        {isVideoPlaying1 && ( 
                            <video ref={videoRef1} src="/text_writing.mp4" style={{width: '100%', height: 'auto', display:'block', position:'relative', zIndex: 2}} autoPlay muted onEnded={handleVideoEnd1} playsInline />
                        )}
                        {imageDimensions1 && (
                            <OcrOverlay
                                lines={ocrProcess1.ocrDisplayLines} isShowingHighlights={isShowingTypoHighlights1}
                                lineRefs={ocrOverlayLineRefs1} 
                                activeBoxInfo={{
                                    activeItemIndex: ocrProcess1.activeItemIndex, processableLines: ocrProcess1.processableLines,
                                    imageDimensions: imageDimensions1, imageRef: imageRef1,
                                    showMediaElement
                                }}
                            />
                        )}
                    </div>
                    <div className="status-text-container" style={{position: 'relative', marginTop: 'auto', paddingTop: '10px'}}><span ref={statusTextRef1} className="status-text-animator" /></div>
                    <div className="output-sections" style={{marginTop: '10px', opacity: isVideoPlaying1 ? 0.3 : 1}}>
                       {renderOutputSection("Video Text", currentAppPhase1, ocrProcess1.isProcessingOCR, ocrProcess1.ocrPredictedText, interactiveOcrParts1, backendCorrectedSentence1, isTypoCheckingAPILoading1)}
                    </div>
                </div>

                <div className="media-column" style={{ flex: 1, border: '1px solid #ccc', padding: '10px', borderRadius: '8px', background: '#fdfdfd' }}>
                    <h2 style={{marginTop: 0, marginBottom: '10px', fontSize: '1.2em', textAlign: 'center'}}>Scan 2: Static Image</h2>
                    <div ref={mediaContainerRef2} id="mediaContainer2" className="media-container" style={{backgroundColor: '#e9e9e9', padding: '4px', position: 'relative'}}>
                        <img
                            ref={imageRef2} src="/hello_and_welcome.png" alt="Hello and Welcome OCR 2"
                            className="screenshot-underlay" 
                            style={{ opacity: 1, display: 'block', width: '100%', height: 'auto' }}
                            onLoad={() => handleImageOnLoad(1)} crossOrigin="anonymous"
                        />
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
                     <div className="status-text-container" style={{position: 'relative', marginTop: 'auto', paddingTop: '10px'}}><span ref={statusTextRef2} className="status-text-animator" /></div>
                     <div className="output-sections" style={{marginTop: '10px'}}>
                        {renderOutputSection("Static Image", currentAppPhase2, ocrProcess2.isProcessingOCR, ocrProcess2.ocrPredictedText, interactiveOcrParts2, backendCorrectedSentence2, isTypoCheckingAPILoading2)}
                     </div>
                </div>
            </div>

            <div className="steps-extra-info-container" style={{minHeight: `${GRAPH_CANVAS_HEIGHT + 70}px`, width: '100%', marginTop: '20px', borderTop: '2px solid #ccc', paddingTop: '10px', position: 'relative'}}>
                 <h3 style={{textAlign: 'center', marginBottom: '5px'}}>Shared Network Visualization</h3>
                 {(ocrProcess1.isProcessingOCR || ocrProcess2.isProcessingOCR) && 
                    <div style={{position: 'absolute', top: '35px', left: '50%', transform: 'translateX(-50%)', zIndex: 20}}>
                        <Spin tip="Processing OCR..." />
                    </div>
                 }
                <div ref={networkContainerRef} style={{ position: 'relative', width: '80%', height: `${GRAPH_CANVAS_HEIGHT}px`}}>
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
                        // Wrapper for NetworkGraphViz - REMOVED flex centering, ensuring left-alignment
                        <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: `${GRAPH_CANVAS_HEIGHT}px` }}>
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
                 
                { !isLoadingModel && !ocrProcess1.isProcessingOCR && !ocrProcess2.isProcessingOCR && !isTypoCheckingAPILoading1 && !isTypoCheckingAPILoading2 && (
                     <Space direction="horizontal" size="middle" className="controls" wrap style={{ marginTop: '20px', justifyContent: 'center', width: '100%'}}>
                        <Switch title="Toggle Conv Filters" checkedChildren="Conv Filters" unCheckedChildren="Conv Filters" checked={showConvFilters} onChange={setShowConvFilters} /> 
                        <Switch title="Toggle Weights" checkedChildren="Weights" unCheckedChildren="Weights" checked={showWeights} onChange={setShowWeights} />
                        <Switch title="Toggle Network Graph" checkedChildren="Network Graph" unCheckedChildren="Network Graph" checked={showNetworkGraph} onChange={setShowNetworkGraph} />
                    </Space>
                )}
            </Alert.ErrorBoundary>
        </div>
    );
}

export default App;