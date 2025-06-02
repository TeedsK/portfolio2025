// src/hooks/useOcrProcessing.ts
import { useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import { useTfModel } from './useTfModel';
import { 
    EMNIST_MODEL_URL, 
    ACTIVATION_LAYER_NAMES, 
    CONV_LAYER_WEIGHT_NAMES, 
    FINAL_LAYER_NAME, 
    LINE_GRADIENT_SETS, 
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
import { warn, error, log } from '../utils/logger'; // Added log

interface CharacterToProcess {
    box: BoundingBoxData;
    lineIndex: number;
    itemIndex: number;
}

// Data to hold for the character whose line is currently animating,
// before its network wave is triggered.
interface PendingNetworkAnimationData {
    activations: ActivationData;
    softmaxProbabilities: number[];
    gradientSet: string[];
    predictedLetter: string;
}

interface UseOcrProcessingResult {
  startOcr: (imageDimensions: { width: number; height: number }) => Promise<string>;
  isProcessingOCR: boolean;
  processableLines: ProcessableLine[];
  activeItemIndex: { line: number; item: number } | null;
  ocrDisplayLines: OcrDisplayLine[];
  setOcrDisplayLines: React.Dispatch<React.SetStateAction<OcrDisplayLine[]>>;
  ocrPredictedText: string;
  networkWaves: AnimationWave[];
  onWaveFinished: (waveId: string) => void;
  currentChar: string | null; // The character string (e.g., "a", "b") for App.tsx
  currentCharImageData: ImageData | null; // ImageData for App.tsx to create StreamCharacter
  onCharAnimationFinished: (processedCharString: string) => void; // Callback from App.tsx
}

export default function useOcrProcessing({ imageRef }: UseOcrProcessingOptions): UseOcrProcessingResult {
  const { model, visModel, tfReady, isLoading: isLoadingModel } =
    useTfModel(EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES);

  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<{ line: number; item: number } | null>(null);
  const [ocrDisplayLines, setOcrDisplayLines] = useState<OcrDisplayLine[]>([]);
  const [ocrPredictedText, setOcrPredictedText] = useState('');
  const [networkWaves, setNetworkWaves] = useState<AnimationWave[]>([]);
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [currentCharImageData, setCurrentCharImageData] = useState<ImageData | null>(null);
  
  const characterQueue = useRef<CharacterToProcess[]>([]).current;
  const ocrCharacterCountRef = useRef(0); 
  const resolveOcrPromise = useRef<((text: string) => void) | null>(null);
  const rawOutputText = useRef<string>('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null); // To store the main image canvas

  // Holds the network animation data for the character whose line is currently animating
  const pendingNetworkDataRef = useRef<PendingNetworkAnimationData | null>(null);

  const processNextCharacterFromQueue = useCallback(async () => {
    if (characterQueue.length === 0) {
        log('[OCR Processing] Character queue empty. OCR process finished.');
        setIsProcessingOCR(false);
        setActiveItemIndex(null);
        setCurrentChar(null); // Clear current char display
        setCurrentCharImageData(null);
        pendingNetworkDataRef.current = null;
        if(resolveOcrPromise.current) {
            resolveOcrPromise.current(rawOutputText.current);
        }
        return;
    }

    const charItem = characterQueue.shift();
    if (!charItem) { // Should not happen if queue not empty, but good check
        processNextCharacterFromQueue(); // Try next
        return;
    }
    
    if (!imageCanvasRef.current) {
        error("Image canvas ref not set in useOcrProcessing");
        setIsProcessingOCR(false);
        return;
    }

    const { box, lineIndex, itemIndex } = charItem;
    log(`[OCR Processing] Processing character ${ocrCharacterCountRef.current + 1} from queue. Line: ${lineIndex}, Item: ${itemIndex}`);
    setActiveItemIndex({ line: lineIndex, item: itemIndex });

    const currentGradientSet = LINE_GRADIENT_SETS[ocrCharacterCountRef.current % LINE_GRADIENT_SETS.length];

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
        padCtx.drawImage(imageCanvasRef.current, x, y, w, h, drawX, drawY, w, h); // Use stored image canvas
        return padCtx.getImageData(0, 0, paddedSize, paddedSize);
    })();

    const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4);
    const processedTensor = preprocessCharacterTensor(charTensorUnprocessed);
    charTensorUnprocessed.dispose();
    
    let predictedLetter = '?';
    let pActivations: ActivationData | null = null;
    let pSoftmax: number[] | null = null;

    if (processedTensor) {
        try {
            const predictions = visModel!.predict(processedTensor) as tf.Tensor[];
            const activationData: ActivationData = {};
            if (predictions.length === ACTIVATION_LAYER_NAMES.length) {
                for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) {
                    const layerName = ACTIVATION_LAYER_NAMES[k];
                    const tensor = predictions[k];
                    const data = await tensor.array(); // Ensure this is awaited
                    activationData[layerName] = data as ActivationDataValue;
                    if (layerName === FINAL_LAYER_NAME) {
                        pSoftmax = (data as number[][])[0];
                    }
                    tensor.dispose();
                }
                pActivations = activationData;
                if (pSoftmax) {
                    const idx = pSoftmax.indexOf(Math.max(...pSoftmax));
                    predictedLetter = EMNIST_CHARS[idx] || '?';
                }
            }
        } catch (predictErr) {
            error(`Prediction failed on char`, predictErr);
            predictedLetter = 'X';
        }
        processedTensor.dispose();
    }
    
    // Store data for when line animation finishes
    if (pActivations && pSoftmax) {
        pendingNetworkDataRef.current = {
            activations: pActivations,
            softmaxProbabilities: pSoftmax,
            gradientSet: currentGradientSet,
            predictedLetter: predictedLetter
        };
    } else {
        pendingNetworkDataRef.current = null; // Ensure no stale data
    }
    
    rawOutputText.current += predictedLetter;
    setOcrDisplayLines(prev => prev.map((l, idx) => idx === lineIndex ? { ...l, textDuringOcr: l.textDuringOcr + predictedLetter } : l));
    
    // Trigger CharacterStreamViz animation in App.tsx
    setCurrentChar(predictedLetter); 
    setCurrentCharImageData(paddedImageData); 
    ocrCharacterCountRef.current++;
    log(`[OCR Processing] Set display for '${predictedLetter}'. Waiting for its line animation to finish.`);

  }, [visModel]); // Added visModel to dependencies

  const onCharAnimationFinished = useCallback((processedCharString: string) => {
    log(`[OCR Processing] Line animation finished for char: '${processedCharString}'. Triggering network wave.`);
    if (pendingNetworkDataRef.current && pendingNetworkDataRef.current.predictedLetter === processedCharString) {
        const data = pendingNetworkDataRef.current;
        const newWave: AnimationWave = {
            id: `wave-${Date.now()}-${Math.random()}`,
            activations: data.activations,
            softmaxProbabilities: data.softmaxProbabilities,
            gradientSet: data.gradientSet
        };
        setNetworkWaves(prev => [...prev, newWave]);
        log(`[OCR Processing] Network wave added for '${processedCharString}'.`);
        pendingNetworkDataRef.current = null;
    } else {
        warn(`[OCR Processing] No pending network data or mismatch for char: '${processedCharString}'`);
    }
    // Proceed to process the next character in the queue for its line animation
    processNextCharacterFromQueue();
  }, [processNextCharacterFromQueue]); // processNextCharacterFromQueue is now a dependency

  const startOcr = (imageDimensions: { width: number; height: number }): Promise<string> => {
    return new Promise(async (resolve) => {
      if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !imageDimensions || !visModel || !model) {
        warn('Not ready for OCR processing.');
        resolve('');
        return;
      }
      log('[OCR Processing] Starting OCR...');
      setIsProcessingOCR(true);
      setOcrPredictedText('');
      setProcessableLines([]);
      setActiveItemIndex(null);
      setOcrDisplayLines([]);
      setNetworkWaves([]);
      characterQueue.length = 0;
      ocrCharacterCountRef.current = 0;
      rawOutputText.current = '';
      pendingNetworkDataRef.current = null;
      resolveOcrPromise.current = resolve;

      const img = imageRef.current;
      const canvas = document.createElement('canvas'); // This will be imageCanvasRef.current
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { error('Failed to get canvas context.'); setIsProcessingOCR(false); resolve(''); return; }
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
      imageCanvasRef.current = canvas; // Store for use in processNextCharacterFromQueue

      let linesToProcess: ProcessableLine[] = [];
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        linesToProcess = findCharacterBoxes(imageData);
        setProcessableLines(linesToProcess);
        if (linesToProcess.length === 0 || linesToProcess.every(line => line.length === 0)) {
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
        if (firstCharBox) {
          const scaleY = imageDimensions.height / img.naturalHeight;
          lineY = firstCharBox[1] * scaleY + OCR_OVERLAY_FONT_SIZE * 0.3;
          lineY = Math.max(OCR_OVERLAY_FONT_SIZE * 0.8, lineY);
          lineY = Math.min(imageDimensions.height - OCR_OVERLAY_FONT_SIZE * 0.5, lineY);
        }
        return { id: `line-${idx}`, textDuringOcr: '', parts: [], y: lineY };
      });
      setOcrDisplayLines(initialDisplayLines);
      
      linesToProcess.forEach((line, lineIndex) => {
        line.forEach((item, itemIndex) => {
            if(item) characterQueue.push({box: item, lineIndex, itemIndex});
        });
        if (lineIndex < linesToProcess.length - 1) characterQueue.push(null as any); 
      });
      
      log(`[OCR Processing] Initialized character queue with ${characterQueue.filter(c=>c!==null).length} characters.`);
      processNextCharacterFromQueue(); // Start the first character processing
    });
  };
  
  const onWaveFinished = (waveId: string) => {
    setNetworkWaves(prev => prev.filter(w => w.id !== waveId));
  };

  return {
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
  };
}