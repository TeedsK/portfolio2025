// src/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Switch, Space, Alert, Spin, Popover, Tag }
    from 'antd';
import './App.css';
import { log, warn, error } from './utils/logger';
import { findCharacterBoxes } from './ml/processing/segmentation';
import { preprocessCharacterTensor } from './ml/processing/preprocess';
import {
    ActivationDataValue, ActivationData, ModelWeights, BoundingBoxData,
    ProcessableLine, TypoCorrectionResponse, TokenTypoDetail, DisplayTextPart
} from './types';
import { ActivationMapViz } from './components/visualizations/ActivationMapViz';
import { SoftmaxProbViz } from './components/visualizations/SoftmaxProbViz';
import { WeightViz } from './components/visualizations/WeightViz';
import { ConvolutionFiltersViz } from './components/visualizations/ConvolutionFiltersViz';
import { NetworkGraphViz } from './components/visualizations/NetworkGraphViz';
import gsap from 'gsap';

// --- Constants ---
const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const PROCESSING_DELAY_MS = 80;
const TYPO_ANIMATION_DELAY_MS = 60;

const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
const FINAL_LAYER_NAME = 'dense_1';
const TYPO_API_URL = 'http://localhost:5001/api/check_typos';
const ANIMATION_COLOR_PALETTE = ['#456cff', '#34D399', '#F59E0B', '#EC4899', '#8B5CF6'];

interface OcrDisplayLinePart {
    id: string;
    text: string;
    isWhitespace: boolean;
    isFlagged?: boolean;
    ref: React.RefObject<HTMLSpanElement>; // Ensure ref is always created and typed
}
interface OcrDisplayLine {
    id: string;
    textDuringOcr: string;
    parts: OcrDisplayLinePart[];
    y: number;
}

const OCR_OVERLAY_FONT_SIZE = 30;
const OCR_OVERLAY_TEXT_COLOR_NORMAL = 'rgba(50, 50, 50, 0.95)';
const OCR_OVERLAY_BACKGROUND_COLOR_DURING_OCR = 'rgba(255, 255, 255, 0.0)'; // Transparent background

const getTagColorForProbability = (probability: number): string => {
    const percent = probability * 100;
    if (percent > 80) return "green";
    if (percent > 60) return "gold";
    if (percent > 40) return "orange";
    if (percent > 20) return "volcano";
    if (percent > 0) return "red";
    return "default";
};

const STATUS_TEXTS = [
    "Writing text...",
    "Predicting handwriting...",
    "Checking typos..."
];

function App() {
    const [model, setModel] = useState<tf.LayersModel | null>(null);
    const [visModel, setVisModel] = useState<tf.LayersModel | null>(null);
    const [modelWeights, setModelWeights] = useState<ModelWeights | null>(null);
    const [currentActivations, setCurrentActivations] = useState<ActivationData | null>(null);
    const [currentSoftmaxProbs, setCurrentSoftmaxProbs] = useState<number[] | null>(null);
    const [currentCharVisData, setCurrentCharVisData] = useState<ImageData | null>(null);
    const [networkGraphColor, setNetworkGraphColor] = useState<string>(ANIMATION_COLOR_PALETTE[0]);
    const [ocrPredictedText, setOcrPredictedText] = useState<string>('');
    const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
    const [isProcessingOCR, setIsProcessingOCR] = useState<boolean>(false);
    const [tfReady, setTfReady] = useState<boolean>(false);
    const [errorState, setErrorState] = useState<string | null>(null);
    const [activeItemIndex, setActiveItemIndex] = useState<{ line: number, item: number } | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
    const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
    const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
    const [showWeights, setShowWeights] = useState<boolean>(false);
    const [showActivations, setShowActivations] = useState<boolean>(false);
    const [showSoftmax, setShowSoftmax] = useState<boolean>(false);
    const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);
    const [isTypoCheckingAPILoading, setIsTypoCheckingAPILoading] = useState<boolean>(false);
    const [interactiveOcrParts, setInteractiveOcrParts] = useState<DisplayTextPart[]>([]);
    const [backendCorrectedSentence, setBackendCorrectedSentence] = useState<string>('');
    const [isVideoPlaying, setIsVideoPlaying] = useState<boolean>(true);
    const [ocrDisplayLines, setOcrDisplayLines] = useState<OcrDisplayLine[]>([]);
    const [shouldStartOcr, setShouldStartOcr] = useState<boolean>(false);
    const [isShowingTypoHighlights, setIsShowingTypoHighlights] = useState<boolean>(false);
    const [currentAppPhase, setCurrentAppPhase] = useState<number>(0);
    const [showMediaElement, setShowMediaElement] = useState<boolean>(true);

    const imageRef = useRef<HTMLImageElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const ocrCharacterCountRef = useRef<number>(0);
    const ocrDisplayLinesRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
    const statusTextRef = useRef<HTMLSpanElement>(null);
    const mediaContainerRef = useRef<HTMLDivElement>(null);
    const ocrFinishedRef = useRef<boolean>(false);

    useEffect(() => { /* ... TFJS and Model Loading ... */
        log('App component mounted. Initializing TFJS and loading EMNIST Letters model...');
        setErrorState(null); setIsLoadingModel(true); setModel(null); setVisModel(null); setModelWeights(null);

        async function initializeTFAndLoadModel() {
            try {
                await tf.ready();
                const backend = tf.getBackend();
                log(`TFJS Ready. Using backend: ${backend}`); setTfReady(true);

                log(`Loading EMNIST Letters model from: ${EMNIST_MODEL_URL}`);
                const loadedModel = await tf.loadLayersModel(EMNIST_MODEL_URL);
                setModel(loadedModel); log('EMNIST Letters Model loaded successfully.');

                log('Creating visualization model...');
                const outputLayers = ACTIVATION_LAYER_NAMES.map(name => {
                    try { return loadedModel.getLayer(name).output; }
                    catch (e) { error(`Layer not found: ${name}`, e); return null; }
                }).filter(output => output !== null) as tf.SymbolicTensor[];

                if (outputLayers.length !== ACTIVATION_LAYER_NAMES.length) {
                    throw new Error("Could not find all specified layers for visualization model.");
                }
                const visualizationModel = tf.model({ inputs: loadedModel.input, outputs: outputLayers });
                setVisModel(visualizationModel); log('Visualization model created.');

                log('Extracting model weights...');
                const weightsData: ModelWeights = {};
                for (const name of CONV_LAYER_WEIGHT_NAMES) {
                    try {
                        const layer = loadedModel.getLayer(name);
                        const layerWeights = layer.getWeights();
                        if (layerWeights.length >= 2) {
                            const kernelData = layerWeights[0].arraySync() as number[][][][];
                            const biasData = layerWeights[1].arraySync() as number[];
                            weightsData[name] = { kernel: kernelData, bias: biasData };
                        } else if (layerWeights.length === 1) {
                            const kernelData = layerWeights[0].arraySync() as number[][][][];
                            weightsData[name] = { kernel: kernelData, bias: [] };
                        }
                        log(`Extracted weights for layer: ${name}`);
                    } catch (e) { error(`Failed to get weights for layer: ${name}`, e); }
                }
                setModelWeights(weightsData); log('Model weights extracted.');
                setIsLoadingModel(false); log('TFJS initialization and model/weights/visModel loading complete.');

            } catch (errRes) {
                error('Failed during TFJS init, model load, or vis setup', errRes);
                setErrorState(`Setup failed: ${errRes instanceof Error ? errRes.message : String(errRes)}`);
                setIsLoadingModel(false); setTfReady(false); setModel(null); setVisModel(null); setModelWeights(null);
            }
        }
        initializeTFAndLoadModel();
        return () => {
            log('App component unmounting.');
            visModel?.dispose(); model?.dispose();
            setModel(null); setVisModel(null); setModelWeights(null);
            log('Model states cleared and models disposed.');
        };
     }, []);
    useEffect(() => { /* ... Image Dimension Loading ... */
        const imgElement = imageRef.current;
        if (imgElement) {
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
    }, []);

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


    const fadeOutAndProceed = async () => {
        if (mediaContainerRef.current) {
            gsap.to(mediaContainerRef.current, {
                opacity: 0,
                duration: 0.5,
                onComplete: async () => {
                    setShowMediaElement(false);
                    if (ocrPredictedText.trim().length > 0) {
                        await handleTypoCorrectionAPI(ocrPredictedText);
                    } else {
                        setInteractiveOcrParts([]); setBackendCorrectedSentence('');
                    }
                }
            });
        } else {
            setShowMediaElement(false);
            if (ocrPredictedText.trim().length > 0) {
                await handleTypoCorrectionAPI(ocrPredictedText);
            }
        }
        setCurrentAppPhase(2);
    };

    const handleVideoPlay = () => {
        setTimeout(() => setShouldStartOcr(true), 400);
    };

    const handleVideoEnd = () => {
        log('Video ended.');
        setIsVideoPlaying(false);
        setCurrentAppPhase(1);
        if (ocrFinishedRef.current && showMediaElement) {
            fadeOutAndProceed();
        }
    };

    useEffect(() => { // Auto-trigger OCR
        if (shouldStartOcr && imageDimensions && imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
            log('Auto-starting OCR process.');
            handleImageClick();
            setShouldStartOcr(false);
        }
    }, [shouldStartOcr, imageDimensions]);

    const handleImageClick = async () => {
        // ... (Guard conditions unchanged) ...
        if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !imageDimensions || !visModel || !model) {
             warn('Not ready for OCR processing.', {isProcessingOCR, tfReady, isLoadingModel, imgComplete: !!imageRef.current?.complete, imageDimensions: !!imageDimensions});
             return;
        }

        setCurrentAppPhase(1);
        setIsProcessingOCR(true);
        setShowMediaElement(true); 
        setOcrPredictedText(''); setInteractiveOcrParts([]);setBackendCorrectedSentence('');
        setProcessableLines([]); setActiveItemIndex(null); setOcrDisplayLines([]);
        setIsShowingTypoHighlights(false);
        setCurrentActivations(null); setCurrentSoftmaxProbs(null); setCurrentCharVisData(null);
        ocrCharacterCountRef.current = 0;
        setNetworkGraphColor(ANIMATION_COLOR_PALETTE[0]);
        ocrDisplayLinesRefs.current.clear();

        log('Starting OCR processing...');
        const currentImageRef = imageRef.current;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { error('Failed to get canvas context.'); setIsProcessingOCR(false); return; }

        canvas.width = currentImageRef.naturalWidth;
        canvas.height = currentImageRef.naturalHeight;
        ctx.drawImage(currentImageRef, 0, 0, currentImageRef.naturalWidth, currentImageRef.naturalHeight);

        let linesToProcess: ProcessableLine[] = [];
        try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            linesToProcess = findCharacterBoxes(imageData);
            setProcessableLines(linesToProcess);
            if (linesToProcess.length === 0 || linesToProcess.every(line => line.length === 0)) {
                setErrorState('No text detected.'); setIsProcessingOCR(false); setCurrentAppPhase(1); return;
            }
        } catch (errSeg) { setErrorState(`Segmentation failed: ${errSeg instanceof Error ? errSeg.message : String(errSeg)}`); setIsProcessingOCR(false); setCurrentAppPhase(1); return;}
        
        const initialDisplayLinesData: OcrDisplayLine[] = linesToProcess.map((line, idx) => {
            let lineY = (idx * (OCR_OVERLAY_FONT_SIZE * 1.5)) + OCR_OVERLAY_FONT_SIZE;
            const firstCharBox = line.find(item => item !== null) as BoundingBoxData | undefined;
            if (firstCharBox && imageDimensions) { 
                const scaleY = imageDimensions.height / currentImageRef.naturalHeight;
                lineY = firstCharBox[1] * scaleY + OCR_OVERLAY_FONT_SIZE * 0.3; 
                lineY = Math.max(OCR_OVERLAY_FONT_SIZE * 0.8, lineY);
                lineY = Math.min(imageDimensions.height - OCR_OVERLAY_FONT_SIZE * 0.5, lineY);
            }
            return { id: `line-${idx}`, textDuringOcr: '', parts: [], y: lineY };
        });
        setOcrDisplayLines(initialDisplayLinesData);
        initialDisplayLinesData.forEach(line => ocrDisplayLinesRefs.current.set(line.id, null));

        let rawOcrOutputAccumulator: string = '';
        try {
            for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex++) {
                // ... (OCR character processing loop - this logic for charToAdd and updating textDuringOcr is fine)
                 const line = linesToProcess[lineIndex];
                let currentLineRawText = '';
                for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
                    const item = line[itemIndex];
                    setActiveItemIndex({ line: lineIndex, item: itemIndex });
                    let charToAdd = '';
                    if (item === null) { charToAdd = ' '; await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS / 4)); }
                    else { 
                        const box = item as BoundingBoxData;
                        const currentCharacterColor = ANIMATION_COLOR_PALETTE[ocrCharacterCountRef.current % ANIMATION_COLOR_PALETTE.length]; 
                        setNetworkGraphColor(currentCharacterColor); 
                        const paddedImageData = (() => { 
                            const [x, y, w, h] = box; 
                            const PADDING_FACTOR = 1.4; const maxDim = Math.max(w, h); const paddedSize = Math.floor(maxDim * PADDING_FACTOR); 
                            const padCanvas = document.createElement('canvas'); padCanvas.width = paddedSize; padCanvas.height = paddedSize; 
                            const padCtx = padCanvas.getContext('2d'); 
                            if (!padCtx) throw new Error(`Failed context for padding char L${lineIndex + 1}-${itemIndex + 1}`); 
                            padCtx.fillStyle = 'white'; padCtx.fillRect(0, 0, paddedSize, paddedSize); 
                            const drawX = Math.floor((paddedSize - w) / 2); const drawY = Math.floor((paddedSize - h) / 2); 
                            padCtx.drawImage(canvas, x, y, w, h, drawX, drawY, w, h); 
                            return padCtx.getImageData(0, 0, paddedSize, paddedSize); 
                        })();
                        const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4); 
                        const processedTensor = preprocessCharacterTensor(charTensorUnprocessed); 
                        charTensorUnprocessed.dispose(); 
                        let predictedLetter = '?'; 
                        if (processedTensor) { 
                            try { 
                                const tempVisCanvas = document.createElement('canvas'); tempVisCanvas.width = 28; tempVisCanvas.height = 28; 
                                const tensorToDraw = processedTensor.squeeze([0]); 
                                await tf.browser.toPixels(tensorToDraw as tf.Tensor2D | tf.Tensor3D, tempVisCanvas); 
                                const visCtx = tempVisCanvas.getContext('2d'); 
                                if (visCtx) setCurrentCharVisData(visCtx.getImageData(0, 0, 28, 28)); 
                                tensorToDraw.dispose(); 
                            } catch (visErr) { error("Error creating character visualization data", visErr); setCurrentCharVisData(null); } 

                            try { 
                                const predictions = visModel.predict(processedTensor) as tf.Tensor[]; 
                                const activationData: ActivationData = {}; 
                                let softmaxData: number[] | null = null; 
                                if (predictions.length !== ACTIVATION_LAYER_NAMES.length) { error("Prediction output count mismatch!"); }
                                else { 
                                    for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) { 
                                        const layerName = ACTIVATION_LAYER_NAMES[k]; 
                                        const tensor = predictions[k]; 
                                        try {
                                            const data = tensor.arraySync(); 
                                            activationData[layerName] = data as ActivationDataValue; 
                                            if (layerName === FINAL_LAYER_NAME) { softmaxData = (data as number[][])[0]; }
                                        } catch (dataErr) { error(`Error sync for ${layerName}`, dataErr); } 
                                        finally { tensor.dispose(); } 
                                    }
                                    setCurrentActivations(activationData); 
                                    setCurrentSoftmaxProbs(softmaxData); 
                                    if (softmaxData) { 
                                        const currentPredictedIndex = softmaxData.indexOf(Math.max(...softmaxData)); 
                                        predictedLetter = EMNIST_CHARS[currentPredictedIndex] || '?'; 
                                    }
                                }
                            } catch (predictErr) { error(`Prediction failed char L${lineIndex + 1}-${itemIndex + 1}`, predictErr); predictedLetter = 'X'; setCurrentActivations(null); setCurrentSoftmaxProbs(null); }
                            processedTensor.dispose(); 
                            charToAdd = predictedLetter;
                        } else { charToAdd = '?'; setCurrentActivations(null); setCurrentSoftmaxProbs(null); setCurrentCharVisData(null); }
                        ocrCharacterCountRef.current++; 
                        await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS));                     
                    } 
                    currentLineRawText += charToAdd;
                    setOcrDisplayLines(prevLines =>
                        prevLines.map((lineObj, idx) =>
                            idx === lineIndex ? { ...lineObj, textDuringOcr: lineObj.textDuringOcr + charToAdd } : lineObj
                        )
                    );
                }
                rawOcrOutputAccumulator += currentLineRawText;
                if (lineIndex < linesToProcess.length - 1) { rawOcrOutputAccumulator += '\n'; }
            }
            setOcrPredictedText(rawOcrOutputAccumulator);
            log('OCR finished. Raw output for typo API:', rawOcrOutputAccumulator);
            
            ocrFinishedRef.current = true;
            if (!isVideoPlaying && showMediaElement) {
                await fadeOutAndProceed();
            }
        } catch (errLoop) { setErrorState(`OCR Loop Error: ${errLoop instanceof Error ? errLoop.message : String(errLoop)}`);}
        finally { setIsProcessingOCR(false); setActiveItemIndex(null); }
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
                const newParts: OcrDisplayLinePart[] = [];
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


    const renderPopoverContent = (tokenDetail: DisplayTextPart) => { /* ... unchanged ... */ };
    const getStepStatus = (stepIndex: number): "finish" | "process" | "wait" | "error" => { /* ... unchanged ... */ 
        if (errorState && currentAppPhase === stepIndex && (
            (stepIndex === 0 && !isVideoPlaying) ||
            (stepIndex === 1 && !isProcessingOCR && !tfReady) || 
            (stepIndex === 1 && !isProcessingOCR && tfReady && !ocrPredictedText && !errorState) || 
            (stepIndex === 2 && !isTypoCheckingAPILoading && !backendCorrectedSentence && !errorState && ocrPredictedText.length > 0) 
        )) return "error";

        if (stepIndex < currentAppPhase) return "finish";
        if (stepIndex === currentAppPhase) {
            if (stepIndex === 0 && isVideoPlaying) return "process";
            if (stepIndex === 0 && !isVideoPlaying && !shouldStartOcr) return "finish"; 
            if (stepIndex === 1 && isProcessingOCR) return "process";
            if (stepIndex === 1 && !isProcessingOCR && ocrPredictedText && !showMediaElement) return "finish"; 
            if (stepIndex === 2 && isTypoCheckingAPILoading) return "process";
            if (stepIndex === 2 && !isTypoCheckingAPILoading && (backendCorrectedSentence || (ocrPredictedText && interactiveOcrParts.length === 0 && !errorState && isShowingTypoHighlights) )) return "finish"; 
            return "process";
        }
        return "wait";
    };
    
    const renderStepExtraInfo = () => { /* ... MODIFIED from previous to use currentAppPhase ... */ 
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
            case 2: 
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
            default: return null;
        }
    };


    return (
        <div className="app-container">
            <h1>Theo Kremer</h1> {/* MODIFIED Header */}

            <div className="media-wrapper"> {/* New wrapper for media and status text */}
                <div ref={mediaContainerRef} className={`media-container ${!showMediaElement ? 'hidden-media' : ''}`}>
                    <img ref={imageRef} src="/text_screenshot.png" alt="Text input for OCR" className={`base-image ${isVideoPlaying ? 'hidden-during-video' : ''}`} crossOrigin="anonymous" />
                    <video ref={videoRef} src="/text_writing.mp4" autoPlay muted onPlay={handleVideoPlay} onEnded={handleVideoEnd} playsInline className="writing-video"> Your browser does not support the video tag. </video>
                </div>
                {/* OCR Overlay Text & Highlights */}
                {imageDimensions && (
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
                                ref={el => ocrDisplayLinesRefs.current.set(line.id, el)} 
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