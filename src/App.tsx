// src/App.tsx
import * as tf from '@tensorflow/tfjs';

import React, { useState, useEffect, useRef } from 'react';
import { Switch, Space, Alert, Spin, Popover, Tag } from 'antd';
import './App.css';
import { log, warn, error } from './utils/logger';
import useTfModel from './hooks/useTfModel';
import useOcrProcessing from './hooks/useOcrProcessing';
import {
    ActivationDataValue,
    ActivationData,
    ModelWeights,
    BoundingBoxData,
    ProcessableLine,
    DisplayTextPart,
    OcrDisplayLine,
    TypoCorrectionResponse,
    TokenTypoDetail
} from './types';
import { ActivationMapViz } from './components/visualizations/ActivationMapViz';
import { SoftmaxProbViz } from './components/visualizations/SoftmaxProbViz';
import { WeightViz } from './components/visualizations/WeightViz';
import { ConvolutionFiltersViz } from './components/visualizations/ConvolutionFiltersViz';
import { NetworkGraphViz } from './components/visualizations/NetworkGraphViz';
import { useTfModel } from './hooks/useTfModel';
import gsap from 'gsap';
import { useTypoCorrection } from './hooks/useTypoCorrection';

// --- Constants ---
const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const PROCESSING_DELAY_MS = 80;
const TYPO_ANIMATION_DELAY_MS = 60;

const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
const FINAL_LAYER_NAME = 'dense_1';
const ANIMATION_COLOR_PALETTE = ['#456cff', '#34D399', '#F59E0B', '#EC4899', '#8B5CF6'];
=======
import {
    EMNIST_MODEL_URL,
    EMNIST_CHARS,
    PROCESSING_DELAY_MS,
    TYPO_ANIMATION_DELAY_MS,
    ACTIVATION_LAYER_NAMES,
    CONV_LAYER_WEIGHT_NAMES,
    FINAL_LAYER_NAME,
    TYPO_API_URL,
    ANIMATION_COLOR_PALETTE,
    OCR_OVERLAY_FONT_SIZE,
    OCR_OVERLAY_TEXT_COLOR_NORMAL,
    OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR,
    STATUS_TEXTS,
    getTagColorForProbability,
} from './constants';

function App() {
    const [currentActivations, setCurrentActivations] = useState<ActivationData | null>(null);
    const [currentSoftmaxProbs, setCurrentSoftmaxProbs] = useState<number[] | null>(null);
    const [currentCharVisData, setCurrentCharVisData] = useState<ImageData | null>(null);
    const [networkGraphColor, setNetworkGraphColor] = useState<string>(ANIMATION_COLOR_PALETTE[0]);
    const [ocrPredictedText, setOcrPredictedText] = useState<string>('');
    const [isProcessingOCR, setIsProcessingOCR] = useState<boolean>(false);

    const [errorState, setErrorState] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
    const [showWeights, setShowWeights] = useState<boolean>(false);
    const [showActivations, setShowActivations] = useState<boolean>(false);
    const [showSoftmax, setShowSoftmax] = useState<boolean>(false);
    const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);
    const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
    const [shouldStartOcr, setShouldStartOcr] = useState<boolean>(false);
    const [isShowingTypoHighlights, setIsShowingTypoHighlights] = useState<boolean>(false);
    const [currentAppPhase, setCurrentAppPhase] = useState<number>(0);
    const [showMediaElement, setShowMediaElement] = useState<boolean>(true);

    const imageRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const ocrDisplayLinesRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
    const statusTextRef = useRef<HTMLSpanElement>(null);
    const mediaContainerRef = useRef<HTMLDivElement>(null);

    const {
        model,
        visModel,
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

    useEffect(() => { /* ... Image Dimension Loading ... */
        const imgElement = imageRef.current;
        if (imgElement && !isVideoPlaying) {
            const handleLoad = () => {
                if (imgElement.offsetWidth > 0 && imgElement.offsetHeight > 0) {
                    setImageDimensions({ width: imgElement.offsetWidth, height: imgElement.offsetHeight });
                    log(`Image dimensions set: ${imgElement.offsetWidth}x${imgElement.offsetHeight}`);
                } else {
                    log('Image loaded but rendered dimensions are 0.');
                }
            };
            const handleErrorLoad = () => {
                error('Failed to load image source:', imgElement.src);
                setErrorState(`Failed to load image: ${imgElement.src}`);
            };

            if (imgElement.complete && imgElement.naturalWidth > 0) {
                if (imgElement.offsetWidth > 0 && imgElement.offsetHeight > 0) {
                     setImageDimensions({ width: imgElement.offsetWidth, height: imgElement.offsetHeight });
                     log(`Image dimensions set (pre-loaded): ${imgElement.offsetWidth}x${imgElement.offsetHeight}`);
                } else {
                    log('Image pre-loaded but offset dimensions are 0. Attaching load listener.');
                    imgElement.addEventListener('load', handleLoad);
                }
            } else {
                imgElement.addEventListener('load', handleLoad);
                imgElement.addEventListener('error', handleErrorLoad);
            }
            return () => {
                if(imgElement){ 
                    imgElement.removeEventListener('load', handleLoad);
                    imgElement.removeEventListener('error', handleErrorLoad);
                }
            };
        }
     }, [isVideoPlaying]);

    useEffect(() => { // Animate status text
        if (statusTextRef.current) {
            const newText = STATUS_TEXTS[currentAppPhase] || STATUS_TEXTS[0];
            const currentText = statusTextRef.current.textContent;
            const tl = gsap.timeline();

            if (currentText !== "" && currentText !== newText) {
                tl.to(statusTextRef.current, { y: -20, opacity: 0, duration: 0.3, ease: 'power1.in' });
            }
            
            tl.add(() => { // Use .add for guaranteed execution order after potential fade out
                if (statusTextRef.current) {
                    statusTextRef.current.textContent = newText;
                }
            })
            .set(statusTextRef.current, { y: 20, opacity: 0 }) // Set initial state for new text
            .to(statusTextRef.current, { y: 0, opacity: 1, duration: 0.4, ease: 'power1.out' });
        }
    }, [currentAppPhase]);


    const handleVideoEnd = () => {
        log('Video ended. Switching to image and queueing OCR.');
        setIsVideoPlaying(false);
        setCurrentAppPhase(1);
        setShouldStartOcr(true);
    };

    useEffect(() => { // Auto-trigger OCR
        if (shouldStartOcr && !isVideoPlaying && imageDimensions && imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
            log('Auto-starting OCR process.');
            handleImageClick();
            setShouldStartOcr(false);
        }
    }, [shouldStartOcr, isVideoPlaying, imageDimensions, handleImageClick]);

    const handleImageClick = async () => {
        if (isVideoPlaying || !imageDimensions) return;
        if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete) {
            warn('Not ready for OCR processing.', { isProcessingOCR, tfReady, isLoadingModel, imgComplete: !!imageRef.current?.complete });
            return;
        }

        setCurrentAppPhase(1);
        setIsProcessingOCR(true);
        setShowMediaElement(true);
        setOcrPredictedText('');
        resetTypoData();
        setProcessableLines([]); 
        setActiveItemIndex(null); 
        setOcrDisplayLines([]);
        setShowMediaElement(true);
        setInteractiveOcrParts([]);
        setBackendCorrectedSentence('');
        setIsShowingTypoHighlights(false);
        ocrDisplayLinesRefs.current.clear();


        const rawText = await startOcr(imageDimensions);

        if (mediaContainerRef.current) {
            gsap.to(mediaContainerRef.current, {
                opacity: 0,
                duration: 0.5,
                onComplete: async () => {
                    setShowMediaElement(false);
                    setCurrentAppPhase(2);
                    if (rawText.trim().length > 0) {
                        await handleTypoCorrectionAPI(rawText);
                    }
                }
            });
        } else {
            setShowMediaElement(false);
            setCurrentAppPhase(2);
            if (rawText.trim().length > 0) {
                await handleTypoCorrectionAPI(rawText);
            }
        }
    };
    
    const handleTypoCorrectionAPI = async (textToCorrect: string) => { /* MODIFIED to build parts correctly */
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

            // For Popovers (using result.original_sentence for token alignment)
            const popoverInteractiveParts: DisplayTextPart[] = [];
            const originalWordsAndSpacesForPopover = result.original_sentence.split(/(\s+)/);
            let currentTokenDetailSearchIndex = 0; 
            originalWordsAndSpacesForPopover.forEach(part => {
                if (part.match(/^\s+$/) || part === '') { popoverInteractiveParts.push({ text: part, isWhitespace: true, isFlagged: false }); }
                else {
                    let detail: TokenTypoDetail | undefined;
                    // Ensure we find the correct token, even if words repeat, by searching from last found index
                    for(let i = currentTokenDetailSearchIndex; i < result.token_details.length; i++) {
                        if (result.token_details[i].token === part) { 
                            detail = result.token_details[i]; 
                            currentTokenDetailSearchIndex = i + 1; // Next search starts after this one
                            break; 
                        }
                    }
                    if (detail) { popoverInteractiveParts.push({ text: part, isWhitespace: false, isFlagged: detail.pred_tag !== 'KEEP', originalToken: part, predictions: detail.top_probs, predictedTag: detail.pred_tag, });}
                    else { warn(`Popover: Word "${part}" not found or already matched in token_details.`); popoverInteractiveParts.push({ text: part, isWhitespace: false, isFlagged: false }); }
                }
            });
            setInteractiveOcrParts(popoverInteractiveParts);


            // --- Transform ocrDisplayLines to use parts for highlighting ---
            // Use the existing ocrDisplayLines (which have correct Y positions and IDs)
            // and populate their 'parts' array based on the typo API result.
            const linesFromApiSentence = result.original_sentence.split('\n');
            let globalTokenIndex = 0; // To iterate through result.token_details sequentially

            const updatedOcrDisplayLines = ocrDisplayLines.map((existingLine, lineIdx) => {
                const lineTextFromApi = linesFromApiSentence[lineIdx] || ""; // Text for this line from API
                const newParts: DisplayTextPart[] = [];
                let partIdCounter = 0;

                // Split the line text by words and spaces to create parts
                const wordsAndSpacesOnLine = lineTextFromApi.split(/(\s+)/).filter(p => p.length > 0);

                wordsAndSpacesOnLine.forEach(textSegment => {
                    const partId = `${existingLine.id}-part-${partIdCounter++}`;
                    if (textSegment.match(/^\s+$/)) { // It's whitespace
                        newParts.push({ id: partId, text: textSegment, isWhitespace: true, ref: React.createRef() });
                    } else { // It's a word
                        let isFlagged = false;
                        // Match this word with the token_details from the API
                        // This assumes token_details are in order of appearance in original_sentence
                        if (globalTokenIndex < result.token_details.length && result.token_details[globalTokenIndex].token === textSegment) {
                            isFlagged = result.token_details[globalTokenIndex].pred_tag !== 'KEEP';
                            globalTokenIndex++;
                        } else {
                            // Fallback or warning if alignment is off
                            warn(`Highlighting token mismatch: OCR'd word "${textSegment}" vs API token "${result.token_details[globalTokenIndex]?.token}" on line ${lineIdx}. Defaulting to not flagged.`);
                            // Try a more resilient find for popover data as a backup for flagging status
                            const popoverMatch = popoverInteractiveParts.find(pip => pip.text === textSegment && !pip.isWhitespace);
                            if (popoverMatch) isFlagged = popoverMatch.isFlagged;
                        }
                        newParts.push({ id: partId, text: textSegment, isWhitespace: false, isFlagged, ref: React.createRef() });
                    }
                });
                return { ...existingLine, parts: newParts, textDuringOcr: lineTextFromApi /* Update to match API */ };
            });

            setOcrDisplayLines(updatedOcrDisplayLines);
            setIsShowingTypoHighlights(true);

        } catch (errApi) { 
            error('Typo correction API call failed:', errApi); 
            setErrorState(`Typo API Error: ${errApi instanceof Error ? errApi.message : String(errApi)}`); 
            // Fallback to simple parts if API fails, no highlighting info
            setOcrDisplayLines(prevLines => prevLines.map(line => ({
                ...line,
                parts: line.textDuringOcr.split(/(\s+)/).filter(p=>p.length>0).map((p,idx) => ({id: `${line.id}-part-${idx}`, text: p, isWhitespace: p.match(/^\s+$/) !== null, isFlagged: false, ref: React.createRef() }))
            })));
            setBackendCorrectedSentence(textToCorrect); 
            setIsShowingTypoHighlights(true); // Still show text, but unhighlighted
        }
        finally { setIsTypoCheckingAPILoading(false); setCurrentAppPhase(2); } 
    };

    useEffect(() => { // GSAP Animation for Typo Highlighting (on existing text parts)
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
                // Ensure spans are visible with their base color before animating color
                gsap.set(wordSpansToAnimate, { 
                    opacity: 1, // They should already be visible
                    color: OCR_OVERLAY_TEXT_COLOR_NORMAL, 
                });

                const tl = gsap.timeline();
                wordSpansToAnimate.forEach((span) => {
                    const isIncorrect = span.classList.contains('typo-incorrect');
                    tl.to(span, { 
                        color: isIncorrect ? '#dc3545' : '#28a745', // Red for typo, Green for correct
                        duration: 0.3,
                        ease: 'power1.inOut'
                    }, `-=${0.3 - (TYPO_ANIMATION_DELAY_MS / 1000)}`); // Staggered color change
                });
            }
        }
    }, [isShowingTypoHighlights, ocrDisplayLines]);


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
                    <div className="network-graph-container">
                        {showNetworkGraph && showMediaElement && (
                            <NetworkGraphViz
                                activations={currentActivations}
                                softmaxProbabilities={currentSoftmaxProbs}
                                currentCharImageData={currentCharVisData}
                                animationBaseColor={networkGraphColor}
                                flattenLayerName="flatten"
                                hiddenDenseLayerName="dense"
                                outputLayerName={FINAL_LAYER_NAME}
                            />
                        )}
                        {(!showNetworkGraph || !showMediaElement) && <p>Neural network visualization appears here during OCR if enabled.</p>} 
                        {(isProcessingOCR) && <div style={{width:'100%', textAlign:'center', marginTop:'10px'}}><Spin tip="Analyzing characters..."/></div>}
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
            <h1>Theo Kremer</h1> {/* MODIFIED Header */}

            <div className="media-wrapper"> {/* New wrapper for media and status text */}
                <div ref={mediaContainerRef} className={`media-container ${!showMediaElement ? 'hidden-media' : ''}`}>
                    {isVideoPlaying ? (
                        <video ref={videoRef} src="/text_writing.mp4" autoPlay muted onEnded={handleVideoEnd} playsInline > Your browser does not support the video tag. </video>
                    ) : (
                        // Image is primarily for structure; opacity is controlled by showMediaElement via CSS
                        <img ref={imageRef} src="/text_screenshot.png" alt="Text input for OCR" style={{cursor: 'default' }} crossOrigin="anonymous" />
                    )}
                </div>
                {/* OCR Overlay Text & Highlights - This is now always "active" after video, its content changes */}
                {!isVideoPlaying && imageDimensions && (
                    <div className="overlay-container" style={{ 
                        position: 'absolute', 
                        top: mediaContainerRef.current ? `${mediaContainerRef.current.offsetTop + 4}px` : '0px', // +4 for padding
                        left: mediaContainerRef.current ? `${mediaContainerRef.current.offsetLeft + 4}px` : '0px', // +4 for padding
                        width: imageDimensions.width - 8 + 'px', // Adjust for padding
                        height: imageDimensions.height - 8 + 'px', // Adjust for padding
                        pointerEvents: 'none',
                        overflow: 'hidden' // Ensure text doesn't overflow original media box
                    }}>
                        {activeItemIndex && showMediaElement && processableLines[activeItemIndex.line] && processableLines[activeItemIndex.line][activeItemIndex.item] && (() => { /* ... active box during OCR ... */
                            const item = processableLines[activeItemIndex.line][activeItemIndex.item];
                            if (item === null) return null;
                            const box = item as BoundingBoxData;
                            const scaleX = imageDimensions.width / (imageRef.current?.naturalWidth ?? 1);
                            const scaleY = imageDimensions.height / (imageRef.current?.naturalHeight ?? 1);
                            const [x, y, w, h] = box;
                            return (<div style={{ position: 'absolute', left: `${x * scaleX}px`, top: `${y * scaleY}px`, width: `${w * scaleX}px`, height: `${h * scaleY}px`, border: '2px solid rgba(255, 0, 0, 0.7)', backgroundColor: 'rgba(255, 0, 0, 0.1)', boxSizing: 'border-box' }} />);
                            })()}
                        
                        {ocrDisplayLines.map((line) => ( 
                            <div
                                key={line.id}
                                ref={el => { ocrDisplayLinesRefs.current.set(line.id, el); }}
                                className="ocr-overlay-line" 
                                style={{ 
                                    top: `${line.y}px`, 
                                    left: '0px', 
                                    fontSize: `${OCR_OVERLAY_FONT_SIZE}px`,
                                    // Background is transparent if highlights are showing, or default during OCR
                                    backgroundColor: isShowingTypoHighlights ? 'transparent' : OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR,
                                }}
                            >
                                {(isShowingTypoHighlights && line.parts.length > 0)
                                    ? line.parts.map(part => (
                                        part.isWhitespace ? (
                                            <span key={part.id} style={{whiteSpace: 'pre'}}>{part.text}</span>
                                        ) : (
                                            <span
                                                key={part.id}
                                                ref={part.ref} 
                                                className={`typo-highlight-word ${part.isFlagged ? 'typo-incorrect' : 'typo-correct'}`}
                                                style={{ color: OCR_OVERLAY_TEXT_COLOR_NORMAL }}
                                            >
                                                {part.text}
                                            </span>
                                        )
                                    ))
                                    : <span style={{color: OCR_OVERLAY_TEXT_COLOR_NORMAL}}>{line.textDuringOcr}</span>
                                }
                            </div>
                        ))}
                    </div>
                )}
                 {/* Animated Status Text */}
                <div className="status-text-container">
                    <span ref={statusTextRef} className="status-text-animator">{STATUS_TEXTS[currentAppPhase]}</span>
                </div>
            </div>


            <div className="steps-extra-info-container"> {/* MOVED below media-wrapper */}
                {renderStepExtraInfo()}
            </div>

            <Alert.ErrorBoundary>
                {/* ... Alerts ... */}
                {!tfReady && !errorState && !isLoadingModel && <Alert message="Initializing TensorFlow.js..." type="info" showIcon />}
                {isLoadingModel && tfReady && (<Alert message={<span>Loading EMNIST Model... <Spin size="small" /></span>} type="info" showIcon />)}
                {errorState && (<Alert message={errorState} type="error" showIcon closable onClose={() => setErrorState(null)} />)}
                
                {/* ... Controls, Output Boxes, Other Visualizations ... */}
                 {!isVideoPlaying && (currentAppPhase < 2 || (currentAppPhase ===2 && !isTypoCheckingAPILoading && !isShowingTypoHighlights)) && (
                     <Space direction="horizontal" size="middle" className="controls" wrap style={{ marginTop: '20px'}}>
                        <Switch title="Toggle Convolutional Filters Visualization" checkedChildren="Conv Filters" unCheckedChildren="Conv Filters" checked={showConvFilters} onChange={setShowConvFilters} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } /> 
                        <Switch title="Toggle Weights Visualization" checkedChildren="Weights" unCheckedChildren="Weights" checked={showWeights} onChange={setShowWeights} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                        <Switch title="Toggle Activations Visualization" checkedChildren="Activations" unCheckedChildren="Activations" checked={showActivations} onChange={setShowActivations} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                        <Switch title="Toggle Softmax Output Visualization" checkedChildren="Softmax" unCheckedChildren="Softmax" checked={showSoftmax} onChange={setShowSoftmax} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                        <Switch title="Toggle Full Network Graph Visualization" checkedChildren="Network Graph" unCheckedChildren="Network Graph" checked={showNetworkGraph} onChange={setShowNetworkGraph} disabled={isLoadingModel || isProcessingOCR || isTypoCheckingAPILoading } />
                    </Space>
                )}

                 <div className="output-container" style={{ marginTop: '20px', width: '100%', display: 'flex', flexDirection: 'column', gap: '15px', opacity: isVideoPlaying ? 0.3 : 1 }}>
                    <div>
                        <h3>Detailed OCR Output (with Popovers for suggestions):</h3>
                        <div className="output-text-box" style={{ whiteSpace: 'pre-wrap', border: '1px solid #ddd', padding: '10px', minHeight: '50px', background: '#f9f9f9', lineHeight: '1.8' }}>
                            {(currentAppPhase === 1 && isProcessingOCR && !ocrPredictedText) ? <Spin tip="OCR in progress..." /> : null}
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
                            {(currentAppPhase ===2 && isTypoCheckingAPILoading && !backendCorrectedSentence) ? <Spin tip="Correcting..." /> : null}
                            {backendCorrectedSentence || ((currentAppPhase >=2 && !isTypoCheckingAPILoading && interactiveOcrParts.length === 0 && ocrPredictedText ) ? "Awaiting correction or no corrections needed." : "")}
                             {currentAppPhase < 2 && !backendCorrectedSentence && "Pending typo check..."}
                        </div>
                    </div>
                </div>
                {!isVideoPlaying && (currentAppPhase ===1 || currentAppPhase ===2) && (showConvFilters || showWeights || showActivations || showSoftmax) && (
                    <div className="visualization-area" style={{ marginTop: '20px', minHeight: '100px', width: '100%', border: '1px solid #eee', padding: '10px', display: (showConvFilters || showWeights || showActivations || showSoftmax) ? 'flex' : 'none', flexDirection: 'column', gap: '15px', background: '#fdfdfd' }}>
                        <h3 style={{textAlign:'center', color:'#777'}}>Additional Layer Visualizations</h3>
                        {showConvFilters && modelWeights && modelWeights['conv2d'] && (<ConvolutionFiltersViz weights={modelWeights} layerName='conv2d' />)} 
                        {showWeights && modelWeights && CONV_LAYER_WEIGHT_NAMES.map(name => modelWeights[name] ? <WeightViz key={name + '-w'} weights={modelWeights} layerName={name} /> : null)}
                        {showActivations && currentActivations && ACTIVATION_LAYER_NAMES.slice(0, 6).map(name =>currentActivations[name] ? <ActivationMapViz key={name + '-a'} activations={currentActivations} layerName={name} />: null)}
                        {showSoftmax && currentSoftmaxProbs && (<SoftmaxProbViz probabilities={currentSoftmaxProbs} mapping={EMNIST_CHARS} />)}
                    </div>
                )}

            </Alert.ErrorBoundary>
        </div>
    );
}

export default App;