// src/App.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Switch, Space, Alert, Spin, Popover, Tag } from 'antd';
import './App.css';
import { log, warn, error } from './utils/logger';
import OcrOverlay from "./components/OcrOverlay";
import CharacterStreamViz from './components/visualizations/CharacterStreamViz';
import useOcrProcessing from './hooks/useOcrProcessing';
import {
    DisplayTextPart,
    TypoCorrectionResponse,
    TokenTypoDetail,
    OcrDisplayLinePart,
    StreamCharacter,
} from './types';
import { WeightViz } from './components/visualizations/WeightViz';
import { ConvolutionFiltersViz } from './components/visualizations/ConvolutionFiltersViz';
import { NetworkGraphViz, FATTEN_LAYER_X } from './components/visualizations/NetworkGraphViz';
import gsap from 'gsap';
import useStatusText from "./hooks/useStatusText";
import {
    EMNIST_MODEL_URL,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TYPO_API_URL,
    OCR_OVERLAY_TEXT_COLOR_NORMAL,
    STATUS_TEXTS,
    getTagColorForProbability,
    LINE_GRADIENT_SETS, 
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

function App() {
    const [errorState, setErrorState] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
    const [showWeights, setShowWeights] = useState<boolean>(false);
    const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);
    const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
    const [shouldStartOcr, setShouldStartOcr] = useState<boolean>(false);
    const [isShowingTypoHighlights, setIsShowingTypoHighlights] = useState<boolean>(false);
    const [currentAppPhase, setCurrentAppPhase] = useState<number>(0);
    const [showMediaElement] = useState<boolean>(true);
    const [streamCharacters, setStreamCharacters] = useState<StreamCharacter[]>([]);
    const gradientSetIndexRef = useRef(0); 


    const hasStartedAutoOcr = useRef<boolean>(false);

    const [interactiveOcrParts, setInteractiveOcrParts] = useState<DisplayTextPart[]>([]);
    const [backendCorrectedSentence, setBackendCorrectedSentence] = useState<string>('');
    const [isTypoCheckingAPILoading, setIsTypoCheckingAPILoading] = useState<boolean>(false);

    const imageRef = useRef<HTMLImageElement | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const {
        startOcr,
        isProcessingOCR,
        processableLines,
        activeItemIndex,
        ocrDisplayLines,
        setOcrDisplayLines,
        ocrPredictedText,
        networkWaves, 
        onWaveFinished,
        currentChar,
        currentCharImageData,
        onCharAnimationFinished,
    } = useOcrProcessing({ imageRef: imageRef as unknown as React.RefObject<HTMLImageElement> });

    const ocrDisplayLinesRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
    const statusTextRef = useStatusText(currentAppPhase);
    const mediaContainerRef = useRef<HTMLDivElement>(null);
    const networkContainerRef = useRef<HTMLDivElement>(null);

    const {
        weights: modelWeights,
        isLoading: isLoadingModel,
        tfReady,
        error: modelLoadError,
    } = useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

    useEffect(() => {
        if (modelLoadError) {
            setErrorState(modelLoadError);
        }
    }, [modelLoadError]);

    useEffect(() => {
        const mediaContainer = mediaContainerRef.current;
        if (mediaContainer) {
            const observer = new ResizeObserver(entries => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    if (width > 0 && height > 0) {
                        setImageDimensions({ width, height });
                    }
                }
            });
            observer.observe(mediaContainer);
            return () => {
                observer.disconnect();
            };
        }
    }, []);

    const handleVideoEnd = () => {
        log('Video ended.');
        setIsVideoPlaying(false);
    };

    const handleTypoCorrectionAPI = useCallback(async (textToCorrect: string) => { 
        if (!textToCorrect.trim()) { return; }
        log('Sending to typo correction API:', textToCorrect);
        setIsTypoCheckingAPILoading(true);
        setErrorState(null); setInteractiveOcrParts([]); setBackendCorrectedSentence('');

        try {
            const response = await fetch(TYPO_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sentence: textToCorrect, top_k: 3 }), });
            if (!response.ok) { const errData = await response.json().catch(() => ({ message: "Unknown API error" })); throw new Error(`API Error (${response.status}): ${errData.error || errData.message}`);}
            const result = await response.json() as TypoCorrectionResponse;
            log('Typo API response:', result);
            setBackendCorrectedSentence(result.corrected_sentence);
            const popoverInteractiveParts: DisplayTextPart[] = [];
            const originalWordsAndSpacesForPopover = result.original_sentence.split(/(\s+)/);
            let currentTokenDetailSearchIndex = 0;
            originalWordsAndSpacesForPopover.forEach(part => {
                if (part.match(/^\s+$/) || part === '') { popoverInteractiveParts.push({ text: part, isWhitespace: true, isFlagged: false }); }
                else {
                    let detail: TokenTypoDetail | undefined;
                    for(let i = currentTokenDetailSearchIndex; i < result.token_details.length; i++) {
                        if (result.token_details[i].token === part) {
                            detail = result.token_details[i];
                            currentTokenDetailSearchIndex = i + 1; 
                            break;
                        }
                    }
                    if (detail) { popoverInteractiveParts.push({ text: part, isWhitespace: false, isFlagged: detail.pred_tag !== 'KEEP', originalToken: part, predictions: detail.top_probs, predictedTag: detail.pred_tag, });}
                    else { warn(`Popover: Word "${part}" not found or already matched in token_details.`); popoverInteractiveParts.push({ text: part, isWhitespace: false, isFlagged: false }); }
                }
            });
            setInteractiveOcrParts(popoverInteractiveParts);
            const linesFromApiSentence = result.original_sentence.split('\n');
            let globalTokenIndex = 0; 
            const updatedOcrDisplayLines = ocrDisplayLines.map((existingLine, lineIdx) => {
                const lineTextFromApi = linesFromApiSentence[lineIdx] || ""; 
                const newParts: OcrDisplayLinePart[] = [];
                let partIdCounter = 0;
                const wordsAndSpacesOnLine = lineTextFromApi.split(/(\s+)/).filter(p => p.length > 0);
                wordsAndSpacesOnLine.forEach(textSegment => {
                    const partId = `${existingLine.id}-part-${partIdCounter++}`;
                    if (textSegment.match(/^\s+$/)) { 
                        newParts.push({ id: partId, text: textSegment, isWhitespace: true, ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement> });
                    } else { 
                        let isFlagged = false;
                        if (globalTokenIndex < result.token_details.length && result.token_details[globalTokenIndex].token === textSegment) {
                            isFlagged = result.token_details[globalTokenIndex].pred_tag !== 'KEEP';
                            globalTokenIndex++;
                        } else {
                            warn(`Highlighting token mismatch: OCR'd word "${textSegment}" vs API token "${result.token_details[globalTokenIndex]?.token}" on line ${lineIdx}. Defaulting to not flagged.`);
                            const popoverMatch = popoverInteractiveParts.find(pip => pip.text === textSegment && !pip.isWhitespace);
                            if (popoverMatch) isFlagged = popoverMatch.isFlagged;
                        }
                        newParts.push({ id: partId, text: textSegment, isWhitespace: false, isFlagged, ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement> });
                    }
                });
                return { ...existingLine, parts: newParts, textDuringOcr: lineTextFromApi };
            });
            setOcrDisplayLines(updatedOcrDisplayLines);
            setIsShowingTypoHighlights(true);
        } catch (errApi) {
            error('Typo correction API call failed:', errApi);
            setErrorState(`Typo API Error: ${errApi instanceof Error ? errApi.message : String(errApi)}`);
            setOcrDisplayLines(prevLines => prevLines.map(line => ({
                ...line,
                parts: line.textDuringOcr.split(/(\s+)/).filter(p=>p.length>0).map((p,idx) => ({id: `${line.id}-part-${idx}`, text: p, isWhitespace: p.match(/^\s+$/) !== null, isFlagged: false, ref: React.createRef<HTMLSpanElement>() as React.RefObject<HTMLSpanElement> }))
            })));
            setBackendCorrectedSentence(textToCorrect);
            setIsShowingTypoHighlights(true); 
        }
        finally { setIsTypoCheckingAPILoading(false); setCurrentAppPhase(2); }
    }, [ocrDisplayLines, setOcrDisplayLines]);

    useEffect(() => {
        if (shouldStartOcr && imageDimensions && imageRef.current?.complete && !isProcessingOCR) {
            log('Auto-starting OCR process.');
            setCurrentAppPhase(1);
            startOcr(imageDimensions)
                .then(raw => {
                    if (raw.trim().length > 0) {
                        handleTypoCorrectionAPI(raw).catch(() => {});
                    } else {
                        setCurrentAppPhase(2);
                    }
                })
                .catch(() => {})
                .finally(() => {
                    setShouldStartOcr(false);
                });
        }
    }, [shouldStartOcr, imageDimensions, isProcessingOCR, startOcr, handleTypoCorrectionAPI]);

    useEffect(() => {
        if (currentChar && currentCharImageData && networkContainerRef.current) {
            const containerRect = networkContainerRef.current.getBoundingClientRect();
            const spawnAreaWidth = CENTRAL_CONNECTION_X - 50;
            
            const standardBoxTotalWidth = CHAR_BOX_CONTENT_WIDTH + CHAR_BOX_PADDING * 2;
            const standardBoxTotalHeight = CHAR_BOX_CONTENT_HEIGHT + CHAR_BOX_PADDING * 2;

            const initialStartX = Math.random() * (spawnAreaWidth - standardBoxTotalWidth);
            const initialStartY = Math.random() * (containerRect.height - standardBoxTotalHeight);
            
            const p0 = { 
                x: initialStartX + standardBoxTotalWidth / 2, 
                y: initialStartY + standardBoxTotalHeight / 2 
            };
            const p2 = { x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y };
            const p1 = Math.random() > 0.5 ? { x: p0.x, y: p2.y } : { x: p2.x, y: p0.y };

            const chosenGradientSet = LINE_GRADIENT_SETS[gradientSetIndexRef.current % LINE_GRADIENT_SETS.length];
            gradientSetIndexRef.current++;

            const newChar: StreamCharacter = {
                id: `char-${Date.now()}`,
                charImage: currentCharImageData,
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
                onFinished: () => onCharAnimationFinished(currentChar),
            };
            setStreamCharacters(prev => [...prev, newChar]);
        }
    }, [currentChar, currentCharImageData, onCharAnimationFinished]); 

    useEffect(() => {
        if (isVideoPlaying && !hasStartedAutoOcr.current) {
            const timer = setTimeout(() => {
                hasStartedAutoOcr.current = true;
                setShouldStartOcr(true);
            }, 400);
            return () => clearTimeout(timer);
        }
    }, [isVideoPlaying]);

    useEffect(() => { 
        if (isShowingTypoHighlights && ocrDisplayLines.some(line => line.parts.length > 0)) {
            const wordSpansToAnimate: HTMLElement[] = [];
            ocrDisplayLines.forEach(line => {
                line.parts.forEach(part => {
                    if (!part.isWhitespace && part.ref?.current) {
                        wordSpansToAnimate.push(part.ref.current);
                    }
                });
            });
            if (wordSpansToAnimate.length > 0) {
                gsap.set(wordSpansToAnimate, { 
                    opacity: 1, 
                    color: OCR_OVERLAY_TEXT_COLOR_NORMAL, 
                });
                const tl = gsap.timeline();
                wordSpansToAnimate.forEach((span) => {
                    const isIncorrect = span.classList.contains('typo-incorrect');
                    tl.to(span, { 
                        color: isIncorrect ? '#dc3545' : '#28a745', 
                        duration: 0.3,
                        ease: 'power1.inOut'
                    }, `-=${0.3 - (TYPO_HIGHLIGHT_DELAY_MS / 1000)}`); 
                });
            }
        }
    }, [isShowingTypoHighlights, ocrDisplayLines]);

    const onCharacterFinished = useCallback((id: string) => {
        setStreamCharacters(prev => prev.filter(c => c.id !== id));
    }, []);

    const renderPopoverContent = (tokenDetail: DisplayTextPart) => {
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

    const renderStepExtraInfo = () => {
        switch (currentAppPhase) { 
            case 0: 
                 if(isVideoPlaying) return <p>Hello and welcome! The process will begin shortly as the text is "written".</p>;
                 return <p>Text writing animation finished. Preparing for OCR...</p>;
            case 1:
                return (
                    <div className="network-graph-container" ref={networkContainerRef}>
                        {networkContainerRef.current && (
                            <CharacterStreamViz
                                characters={streamCharacters}
                                containerSize={{
                                    width: networkContainerRef.current.clientWidth,
                                    height: networkContainerRef.current.clientHeight
                                }}
                                onCharacterFinished={onCharacterFinished}
                            />
                        )}
                        {showNetworkGraph && showMediaElement && (
                            <NetworkGraphViz
                                waves={networkWaves}
                                onWaveFinished={onWaveFinished}
                                flattenLayerName="flatten"
                                hiddenDenseLayerName="dense"
                                outputLayerName={FINAL_LAYER_NAME}
                                centralConnectionPoint={{ x: CENTRAL_CONNECTION_X, y: CENTRAL_CONNECTION_Y }}
                            />
                        )}
                        {(!showNetworkGraph || !showMediaElement) && <p>Neural network visualization appears here during OCR if enabled.</p>} 
                        <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)'}}>
                            {isProcessingOCR && <Spin tip="Analyzing characters..." />}
                        </div>
                         {!showMediaElement && ocrDisplayLines.length > 0 && <p style={{textAlign:'center', color: '#555'}}>Handwriting analysis complete. Moving to typo check.</p>}
                    </div>
                );
            case 2: {
                const typosToShow = interactiveOcrParts.filter(p => p.isFlagged && !p.isWhitespace && p.originalToken);
                if (isTypoCheckingAPILoading) return <div style={{width:'100%', textAlign:'center'}}><Spin tip="Fetching typo details..." /></div>;
                if (typosToShow.length === 0 && !isTypoCheckingAPILoading) return <p>No typos found by the checker, or correction process complete!</p>;
                const typoRows: DisplayTextPart[][] = [];
                for (let i = 0; i < typosToShow.length; i += 8) {
                    typoRows.push(typosToShow.slice(i, i + 8));
                }
                return (
                    <div className="typo-analysis-container">
                        <h4>Typo Analysis Results:</h4>
                        {typoRows.map((row, rowIndex) => (
                            <div key={`typo-row-${rowIndex}`} className="typo-details-row-wrapper">
                                {row.map((typo) => (
                                    <div key={typo.originalToken! + (typo.predictedTag || Math.random())} className="typo-detail-item-wrapper">
                                        <div className="typo-detail-text-row">
                                            <span className="typo-original-text">{typo.originalToken}</span>
                                            <span className="typo-arrow">➔</span>
                                            <span className="typo-fixed-text">
                                                {typo.predictedTag?.startsWith("REPLACE_") 
                                                    ? typo.predictedTag.substring("REPLACE_".length) 
                                                    : typo.predictedTag === "DELETE" 
                                                        ? <>[DELETE]</> 
                                                        : typo.originalToken } 
                                            </span>
                                        </div>
                                        {typo.predictions && (
                                            <div className="typo-prediction-tags">
                                                {Object.entries(typo.predictions)
                                                    .sort(([,a],[,b]) => (b as number)-(a as number)) 
                                                    .slice(0,3) 
                                                    .map(([tag, prob]) => {
                                                        const tagText = tag.startsWith("REPLACE_") ? tag.substring("REPLACE_".length) : tag;
                                                        const color = getTagColorForProbability(prob as number); 
                                                        return <Tag color={color} key={tag}>{tagText} ({(prob as number *100).toFixed(0)}%)</Tag>
                                                    })
                                                }
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                );
            }
            default: return null;
        }
    };
    return (
        <div className="app-container">
            <h1>Theo Kremer</h1>
            <div className="media-wrapper">
                <div ref={mediaContainerRef} className={`media-container ${!showMediaElement ? 'hidden-media' : ''}`}>
                    <img
                        ref={imageRef}
                        src="/text_screenshot.png"
                        alt="Text input for OCR"
                        className="screenshot-underlay"
                        style={{
                            cursor: 'default',
                            opacity: isVideoPlaying ? 0 : 1,
                            position: isVideoPlaying ? 'absolute' : 'relative',
                        }}
                        crossOrigin="anonymous"
                    />
                    {isVideoPlaying && (
                        <video
                            ref={videoRef}
                            src="/text_writing.mp4"
                            autoPlay
                            muted
                            onEnded={handleVideoEnd}
                            playsInline
                        >
                            Your browser does not support the video tag.
                        </video>
                    )}
                </div>
                {imageDimensions && (
                    <OcrOverlay
                        lines={ocrDisplayLines}
                        isShowingHighlights={isShowingTypoHighlights}
                        lineRefs={ocrDisplayLinesRefs}
                        activeBoxInfo={{
                            activeItemIndex,
                            processableLines,
                            imageDimensions,
                            imageRef: imageRef as unknown as React.RefObject<HTMLImageElement>,
                            showMediaElement,
                            mediaOffset: mediaContainerRef.current ? { top: mediaContainerRef.current.offsetTop, left: mediaContainerRef.current.offsetLeft } : null
                        }}
                    />
                )}
                <div className="status-text-container">
                    <span ref={statusTextRef} className="status-text-animator">{STATUS_TEXTS[currentAppPhase]}</span>
                </div>
            </div>
            <div className="steps-extra-info-container">
                {renderStepExtraInfo()}
            </div>
            <Alert.ErrorBoundary>
                {!tfReady && !errorState && !isLoadingModel && <Alert message="Initializing TensorFlow.js..." type="info" showIcon />}
                {isLoadingModel && tfReady && (<Alert message={<span>Loading EMNIST Model... <Spin size="small" /></span>} type="info" showIcon />)}
                {errorState && (<Alert message={errorState} type="error" showIcon closable onClose={() => setErrorState(null)} />)}
                 {!isVideoPlaying && (currentAppPhase < 2 || (currentAppPhase ===2 && !isTypoCheckingAPILoading && !isShowingTypoHighlights)) && (
                     <Space direction="horizontal" size="middle" className="controls" wrap style={{ marginTop: '20px'}}>
                        <Switch title="Toggle Convolutional Filters Visualization" checkedChildren="Conv Filters" unCheckedChildren="Conv Filters" checked={showConvFilters} onChange={setShowConvFilters} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } /> 
                        <Switch title="Toggle Weights Visualization" checkedChildren="Weights" unCheckedChildren="Weights" checked={showWeights} onChange={setShowWeights} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                        <Switch title="Toggle Full Network Graph Visualization" checkedChildren="Network Graph" unCheckedChildren="Network Graph" checked={showNetworkGraph} onChange={setShowNetworkGraph} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                    </Space>
                )}
                 <div className="output-container" style={{ marginTop: '20px', width: '100%', display: 'flex', flexDirection: 'column', gap: '15px', opacity: isVideoPlaying ? 0.3 : 1 }}>
                    <div>
                        <h3>Detailed OCR Output (with Popovers for suggestions):</h3>
                        <div className="output-text-box" style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: '10px', minHeight: '50px', background: '#f9f9f9', lineHeight: '1.8' }}>
                            {currentAppPhase === 1 && isProcessingOCR && !ocrPredictedText && <div><Spin tip="OCR in progress..." /></div>}
                            {(currentAppPhase >= 1 && !isProcessingOCR && interactiveOcrParts.length === 0 && ocrPredictedText ) ? ocrPredictedText : null}
                            {interactiveOcrParts.map((part, index) => 
                                part.isFlagged && !part.isWhitespace && part.originalToken ? ( 
                                    <Popover key={`${part.text}-${index}-pop`} content={renderPopoverContent(part)} title="Correction Details" trigger="hover">
                                        <span style={{ textDecoration: part.predictedTag === 'DELETE' ? 'line-through' : 'none', backgroundColor: '#fff2b2', padding: '0 2px', borderRadius: '3px', cursor: 'pointer' }}>
                                            {part.text}
                                        </span>
                                    </Popover>
                                ) : ( <span key={`${part.text}-${index}-pop`}>{part.text}</span> )
                            )}
                             {currentAppPhase < 1 && isVideoPlaying && "Waiting for video..."}
                             {currentAppPhase === 1 && !isProcessingOCR && !ocrPredictedText && !isProcessingOCR && "OCR starting soon..."}
                        </div>
                    </div>
                    <div>
                        <h3>Final Corrected Text (from Backend):</h3>
                        <div className="output-text-box" style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: '10px', minHeight: '50px', background: '#e6ffed' }}>
                            {currentAppPhase === 2 && isTypoCheckingAPILoading && <div><Spin tip="Correcting..." /></div>}
                            {backendCorrectedSentence || ((currentAppPhase >=2 && !isTypoCheckingAPILoading && interactiveOcrParts.length === 0 && ocrPredictedText ) ? "Awaiting correction or no corrections needed." : "")}
                             {currentAppPhase < 2 && !backendCorrectedSentence && "Pending typo check..."}
                        </div>
                    </div>
                </div>
                {!isVideoPlaying && (currentAppPhase ===1 || currentAppPhase ===2) && (showConvFilters || showWeights) && (
                    <div className="visualization-area" style={{ marginTop: '20px', minHeight: '100px', width: '100%', border: '1px solid #eee', padding: '10px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fdfdfd' }}>
                        <h3 style={{textAlign:'center', color:'#777'}}>Additional Layer Visualizations</h3>
                        {showConvFilters && modelWeights && modelWeights['conv2d'] && (<ConvolutionFiltersViz weights={modelWeights} layerName='conv2d' />)}
                        {showWeights && modelWeights && CONV_LAYER_WEIGHT_NAMES.map(name => modelWeights[name] ? <WeightViz key={name + '-w'} weights={modelWeights} layerName={name} /> : null)}
                    </div>
                )}
            </Alert.ErrorBoundary>
        </div>
    );
}

export default App;