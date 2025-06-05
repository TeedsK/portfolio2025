// src/hooks/useOcrProcessing.ts
import React, { useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import { useTfModel } from './useTfModel';
import { 
    EMNIST_MODEL_URL, 
    ACTIVATION_LAYER_NAMES, 
    CONV_LAYER_WEIGHT_NAMES, 
    FINAL_LAYER_NAME, 
    OCR_OVERLAY_FONT_SIZE, 
    EMNIST_CHARS 
} from '../constants';
import { findCharacterBoxes } from '../ml/processing/segmentation';
import { preprocessCharacterTensor } from '../ml/processing/preprocess';
import {
  ActivationData,
  ActivationDataValue,
  BoundingBoxData,
  ProcessableLine,
  OcrDisplayLine,
  AnimationWave,
} from '../types';
import { warn, error, log } from '../utils/logger';

interface CharacterToProcess {
    box: BoundingBoxData;
    lineIndex: number;
    itemIndex: number;
}

interface PendingNetworkAnimationData {
    activations: ActivationData;
    softmaxProbabilities: number[];
    predictedLetter: string;
}

interface UseOcrProcessingOptions {
  imageRef: React.RefObject<HTMLImageElement>;
  setNetworkWaves: React.Dispatch<React.SetStateAction<AnimationWave[]>>;
}

interface UseOcrProcessingResult {
  startOcr: (imageDimensions: { width: number; height: number }) => Promise<string>;
  isProcessingOCR: boolean;
  processableLines: ProcessableLine[];
  activeItemIndex: { line: number; item: number } | null;
  ocrDisplayLines: OcrDisplayLine[];
  setOcrDisplayLines: React.Dispatch<React.SetStateAction<OcrDisplayLine[]>>;
  ocrPredictedText: string | null; 
  currentChar: string | null;
  setCurrentChar: React.Dispatch<React.SetStateAction<string | null>>;
  currentCharImageData: ImageData | null;
  setCurrentCharImageData: React.Dispatch<React.SetStateAction<ImageData | null>>;
  onCharAnimationFinished: (processedCharString: string, gradientSetForWave: string[]) => void;
}

export default function useOcrProcessing({ imageRef, setNetworkWaves }: UseOcrProcessingOptions): UseOcrProcessingResult {
  const { model, visModel, tfReady, isLoading: isLoadingModel } =
    useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<{ line: number; item: number } | null>(null);
  const [ocrDisplayLines, setOcrDisplayLines] = useState<OcrDisplayLine[]>([]);
  const [ocrPredictedText, setOcrPredictedText] = useState<string | null>(null);
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [currentCharImageData, setCurrentCharImageData] = useState<ImageData | null>(null);
  
  const characterQueue = useRef<CharacterToProcess[]>([]).current;
  const ocrCharacterCountRef = useRef(0); 
  const resolveOcrPromise = useRef<((text: string) => void) | null>(null);
  const rawOutputText = useRef<string>('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pendingNetworkDataRef = useRef<PendingNetworkAnimationData | null>(null);

  const processNextCharacterFromQueue = useCallback(async () => {
    if (characterQueue.length === 0) {
        log('[OCR Processing] Character queue empty. OCR process finished.');
        setIsProcessingOCR(false);
        setActiveItemIndex(null);
        setCurrentChar(null); 
        setCurrentCharImageData(null);
        pendingNetworkDataRef.current = null;
        if(resolveOcrPromise.current) {
            resolveOcrPromise.current(rawOutputText.current);
        }
        return;
    }

    const charItem = characterQueue.shift();
    if (!charItem) { 
        processNextCharacterFromQueue(); 
        return;
    }
    
    if (!imageCanvasRef.current) {
        error("Image canvas ref not set in useOcrProcessing");
        setIsProcessingOCR(false);
        if(resolveOcrPromise.current) resolveOcrPromise.current(rawOutputText.current || "Error: Canvas not set");
        return;
    }

    const { box, lineIndex, itemIndex } = charItem;
    log(`[OCR Processing] Processing character ${ocrCharacterCountRef.current + 1} from queue. Line: ${lineIndex}, Item: ${itemIndex}`);
    setActiveItemIndex({ line: lineIndex, item: itemIndex });

    const paddedImageData = (() => {
        const [x, y, w, h] = box;
        const PADDING_FACTOR = 1.4;
        const maxDim = Math.max(w, h);
        const paddedSize = Math.floor(maxDim * PADDING_FACTOR);
        const padCanvas = document.createElement('canvas');
        padCanvas.width = paddedSize;
        padCanvas.height = paddedSize;
        const padCtx = padCanvas.getContext('2d');
        if (!padCtx) throw new Error('Failed context for padding');
        padCtx.fillStyle = 'white';
        padCtx.fillRect(0, 0, paddedSize, paddedSize);
        const drawX = Math.floor((paddedSize - w) / 2);
        const drawY = Math.floor((paddedSize - h) / 2);
        padCtx.drawImage(imageCanvasRef.current, x, y, w, h, drawX, drawY, w, h);
        return padCtx.getImageData(0, 0, paddedSize, paddedSize);
    })();

    const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4);
    const processedTensor = preprocessCharacterTensor(charTensorUnprocessed);
    tf.dispose(charTensorUnprocessed); 
    
    let predictedLetter = '?';
    let pActivations: ActivationData | null = null;
    let pSoftmax: number[] | null = null;

    if (processedTensor && visModel) {
        try {
            const predictions = visModel.predict(processedTensor) as tf.Tensor[];
            const activationData: ActivationData = {};
            if (predictions.length === ACTIVATION_LAYER_NAMES.length) {
                for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) {
                    const layerName = ACTIVATION_LAYER_NAMES[k];
                    const tensor = predictions[k];
                    const data = await tensor.array(); 
                    activationData[layerName] = data as ActivationDataValue;
                    if (layerName === FINAL_LAYER_NAME) {
                        pSoftmax = (data as number[][])[0];
                    }
                }
                tf.dispose(predictions); 
                pActivations = activationData;
                if (pSoftmax) {
                    const idx = pSoftmax.indexOf(Math.max(...pSoftmax));
                    predictedLetter = EMNIST_CHARS[idx] || '?';
                }
            } else {
                warn(`[OCR Processing] Prediction tensor count mismatch. Expected ${ACTIVATION_LAYER_NAMES.length}, got ${predictions.length}`);
                tf.dispose(predictions);
            }
        } catch (predictErr) {
            error(`Prediction failed on char`, predictErr);
            predictedLetter = 'X';
        }
        tf.dispose(processedTensor); 
    } else {
        warn("[OCR Processing] No processed tensor or visModel not ready for prediction.");
        if(processedTensor) tf.dispose(processedTensor);
    }
    
    if (pActivations && pSoftmax) {
        pendingNetworkDataRef.current = { 
            activations: pActivations,
            softmaxProbabilities: pSoftmax,
            predictedLetter: predictedLetter
        };
    } else {
        pendingNetworkDataRef.current = null; 
    }
    
    rawOutputText.current += predictedLetter;
    setOcrDisplayLines(prev => prev.map((l, idx) => idx === lineIndex ? { ...l, textDuringOcr: l.textDuringOcr + predictedLetter } : l));
    
    setCurrentChar(predictedLetter); 
    setCurrentCharImageData(paddedImageData); 
    ocrCharacterCountRef.current++;
    log(`[OCR Processing] Set display for '${predictedLetter}'. Waiting for its line animation to finish.`);

  }, [visModel, setCurrentChar, setCurrentCharImageData, setOcrDisplayLines]);

  const onCharAnimationFinished = useCallback((processedCharString: string, gradientSetForWave: string[]) => {
    log(`[OCR Processing] Line anim for '${processedCharString}' finished. Triggering wave with gradient:`, gradientSetForWave); // Log received gradient
    if (pendingNetworkDataRef.current && pendingNetworkDataRef.current.predictedLetter === processedCharString) {
        const data = pendingNetworkDataRef.current;
        const newWave: AnimationWave = {
            id: `wave-${Date.now()}-${Math.random()}`,
            activations: data.activations,
            softmaxProbabilities: data.softmaxProbabilities,
            gradientSet: gradientSetForWave 
        };
        setNetworkWaves(prev => [...prev, newWave]); 
        log(`[OCR Processing] Network wave added for '${processedCharString}'.`);
        pendingNetworkDataRef.current = null;
    } else {
        warn(`[OCR Processing] No pending network data or mismatch for char: '${processedCharString}'`);
    }
    processNextCharacterFromQueue();
  }, [processNextCharacterFromQueue, setNetworkWaves]); 

  const startOcr = (imageDimensions: { width: number; height: number }): Promise<string> => {
    return new Promise(async (resolve) => {
      if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !imageDimensions || !visModel || !model) {
        warn('Not ready for OCR processing or image not fully loaded/available.');
        resolve('');
        return;
      }
      log('[OCR Processing] Starting OCR...');
      setIsProcessingOCR(true);
      setOcrPredictedText(''); 
      setProcessableLines([]);
      setActiveItemIndex(null);
      setOcrDisplayLines([]);
      characterQueue.length = 0;
      ocrCharacterCountRef.current = 0;
      rawOutputText.current = '';
      pendingNetworkDataRef.current = null;
      resolveOcrPromise.current = resolve; 

      const img = imageRef.current;
      if (!img) {
          error('Image ref is null in startOcr');
          setIsProcessingOCR(false);
          resolve('');
          return;
      }
      const canvas = document.createElement('canvas'); 
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { error('Failed to get canvas context.'); setIsProcessingOCR(false); resolve(''); return; }
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
      imageCanvasRef.current = canvas; 

      let linesToProcess: ProcessableLine[] = [];
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        linesToProcess = findCharacterBoxes(imageData);
        setProcessableLines(linesToProcess);
        if (linesToProcess.length === 0 || linesToProcess.every(line => line.length === 0 || line.every(item => item === null))) {
          log('[OCR Processing] No character boxes found.');
          setIsProcessingOCR(false);
          resolve(''); 
          return;
        }
      } catch (errSeg) {
        error('Segmentation failed', errSeg); setIsProcessingOCR(false); resolve(''); return;
      }

      const initialDisplayLines = linesToProcess.map((line, idx) => {
        let lineY = (idx * (OCR_OVERLAY_FONT_SIZE * 1.5)) + OCR_OVERLAY_FONT_SIZE;
        const firstCharBox = line.find(item => item !== null) as BoundingBoxData | undefined;
        if (firstCharBox && imageRef.current && imageRef.current.naturalHeight > 0 && imageDimensions.height > 0 && imageDimensions.width > 0) {
            const naturalImgHeight = imageRef.current.naturalHeight;
            const naturalImgWidth = imageRef.current.naturalWidth;
            let displayedImgHeight = imageDimensions.height;
            let offsetY_text = 0;
            if (naturalImgWidth > 0 && naturalImgHeight > 0) {
                const containerAspectRatio = imageDimensions.width / imageDimensions.height;
                const naturalAspectRatio = naturalImgWidth / naturalImgHeight;
                if (naturalAspectRatio > containerAspectRatio) {
                    displayedImgHeight = imageDimensions.width / naturalAspectRatio;
                    offsetY_text = (imageDimensions.height - displayedImgHeight) / 2;
                }
            }
            const scaleY_text = displayedImgHeight > 0 && naturalImgHeight > 0 ? displayedImgHeight / naturalImgHeight : 1;
            lineY = offsetY_text + (firstCharBox[1] * scaleY_text) + (OCR_OVERLAY_FONT_SIZE * 0.3 * Math.min(1, scaleY_text));
            lineY = Math.max(OCR_OVERLAY_FONT_SIZE * 0.8, lineY);
            lineY = Math.min(imageDimensions.height - OCR_OVERLAY_FONT_SIZE * 0.5 + offsetY_text, lineY); 
        }
        return { id: `line-${idx}`, textDuringOcr: '', parts: [], y: lineY };
      });
      setOcrDisplayLines(initialDisplayLines);
      
      linesToProcess.forEach((line, lineIndexGlobal) => { 
        line.forEach((item, itemIndex) => { 
            if(item) characterQueue.push({box: item, lineIndex: lineIndexGlobal, itemIndex});
        });
      });
      
      const validCharItems = characterQueue.filter(item => item !== null);
      characterQueue.length = 0; // Clear old queue
      characterQueue.push(...validCharItems); // Repopulate with only valid items

      if (characterQueue.length === 0) {
        log('[OCR Processing] Character queue is empty after attempting to populate.');
        setIsProcessingOCR(false);
        resolve(rawOutputText.current); 
        return;
      }
      
      log(`[OCR Processing] Initialized character queue with ${characterQueue.length} characters.`);
      processNextCharacterFromQueue();
    });
  };
  
  return {
    startOcr,
    isProcessingOCR,
    processableLines,
    activeItemIndex,
    ocrDisplayLines,
    setOcrDisplayLines,
    ocrPredictedText,
    currentChar,
    setCurrentChar,
    currentCharImageData,
    setCurrentCharImageData,
    onCharAnimationFinished,
  };
}