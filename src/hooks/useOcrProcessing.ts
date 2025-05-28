// src/hooks/useOcrProcessing.ts
import { useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import { useTfModel } from './useTfModel';
import { EMNIST_MODEL_URL, ACTIVATION_LAYER_NAMES, CONV_LAYER_WEIGHT_NAMES, FINAL_LAYER_NAME, ANIMATION_COLOR_PALETTE, OCR_OVERLAY_FONT_SIZE, EMNIST_CHARS } from '../constants';
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
import { warn, error } from '../utils/logger';

interface CharacterToProcess {
    box: BoundingBoxData;
    lineIndex: number;
    itemIndex: number;
}

interface UseOcrProcessingOptions {
  imageRef: React.RefObject<HTMLImageElement>;
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
  currentChar: string | null;
  currentCharImageData: ImageData | null;
  networkGraphColor: string; // Expose the color for the current character
  onCharAnimationFinished: (char: string) => void;
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
  const [networkGraphColor, setNetworkGraphColor] = useState(ANIMATION_COLOR_PALETTE[0]);
  
  const characterQueue = useRef<CharacterToProcess[]>([]).current;
  const ocrCharacterCountRef = useRef(0);
  const animationFinishedCallback = useRef<((char: string) => void) | null>(null);
  const resolveOcrPromise = useRef<((text: string) => void) | null>(null);
  const rawOutputText = useRef<string>('');

  const onCharAnimationFinished = useCallback((char: string) => {
    if (animationFinishedCallback.current) {
      animationFinishedCallback.current(char);
    }
  }, []);

  const onWaveFinished = (waveId: string) => {
    setNetworkWaves(prev => prev.filter(w => w.id !== waveId));
  };

  const startOcr = (imageDimensions: { width: number; height: number }): Promise<string> => {
    return new Promise(async (resolve) => {
      if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !imageDimensions || !visModel || !model) {
        warn('Not ready for OCR processing.', { isProcessingOCR, tfReady, isLoadingModel, imgComplete: !!imageRef.current?.complete, imageDimensions: !!imageDimensions });
        resolve('');
        return;
      }

      setIsProcessingOCR(true);
      setOcrPredictedText('');
      setProcessableLines([]);
      setActiveItemIndex(null);
      setOcrDisplayLines([]);
      setNetworkWaves([]);
      characterQueue.length = 0;
      ocrCharacterCountRef.current = 0;
      rawOutputText.current = '';
      resolveOcrPromise.current = resolve;

      const img = imageRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || !img) { error('Failed to get canvas context.'); setIsProcessingOCR(false); resolve(''); return; }

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

      let linesToProcess: ProcessableLine[] = [];
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        linesToProcess = findCharacterBoxes(imageData);
        setProcessableLines(linesToProcess);
        if (linesToProcess.length === 0 || linesToProcess.every(line => line.length === 0)) {
          setIsProcessingOCR(false);
          resolve('');
          return;
        }
      } catch (errSeg) {
        error('Segmentation failed', errSeg);
        setIsProcessingOCR(false);
        resolve('');
        return;
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
            if(item) {
                characterQueue.push({box: item, lineIndex, itemIndex});
            }
        });
        if (lineIndex < linesToProcess.length - 1) {
            characterQueue.push(null as any);
        }
      });
      
      animationFinishedCallback.current = () => {
        processNextCharacter(canvas);
      };

      processNextCharacter(canvas);
    });
  };

  const processNextCharacter = async (canvas: HTMLCanvasElement) => {
    if (characterQueue.length === 0) {
        setIsProcessingOCR(false);
        setActiveItemIndex(null);
        if(resolveOcrPromise.current) {
            resolveOcrPromise.current(rawOutputText.current);
        }
        return;
    }

    const charToProcess = characterQueue.shift();

    if (charToProcess === null) {
        rawOutputText.current += '\n';
        processNextCharacter(canvas);
        return;
    }

    const { box, lineIndex, itemIndex } = charToProcess;
    setActiveItemIndex({ line: lineIndex, item: itemIndex });

    const currentCharacterColor = ANIMATION_COLOR_PALETTE[ocrCharacterCountRef.current % ANIMATION_COLOR_PALETTE.length];
    setNetworkGraphColor(currentCharacterColor);

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
        padCtx.drawImage(canvas, x, y, w, h, drawX, drawY, w, h);
        return padCtx.getImageData(0, 0, paddedSize, paddedSize);
    })();

    setCurrentCharImageData(paddedImageData);

    const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4);
    const processedTensor = preprocessCharacterTensor(charTensorUnprocessed);
    charTensorUnprocessed.dispose();
    
    let predictedLetter = '?';
    let processedActivations: ActivationData | null = null;
    let processedSoftmax: number[] | null = null;

    if (processedTensor) {
        try {
            const predictions = visModel!.predict(processedTensor) as tf.Tensor[];
            const activationData: ActivationData = {};
            if (predictions.length === ACTIVATION_LAYER_NAMES.length) {
                for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) {
                    const layerName = ACTIVATION_LAYER_NAMES[k];
                    const tensor = predictions[k];
                    const data = await tensor.array();
                    activationData[layerName] = data as ActivationDataValue;
                    if (layerName === FINAL_LAYER_NAME) {
                        processedSoftmax = (data as number[][])[0];
                    }
                    tensor.dispose();
                }
                processedActivations = activationData;
                if (processedSoftmax) {
                    const idx = processedSoftmax.indexOf(Math.max(...processedSoftmax));
                    predictedLetter = EMNIST_CHARS[idx] || '?';
                }
            }
        } catch (predictErr) {
            error(`Prediction failed on char`, predictErr);
            predictedLetter = 'X';
        }
        processedTensor.dispose();
    }

    if (processedActivations && processedSoftmax) {
        const newWave: AnimationWave = {
            id: `wave-${Date.now()}-${Math.random()}`,
            activations: processedActivations,
            softmaxProbabilities: processedSoftmax,
            color: currentCharacterColor
        };
        setNetworkWaves(prev => [...prev, newWave]);
    }
    
    rawOutputText.current += predictedLetter;
    setOcrDisplayLines(prev => prev.map((l, idx) => idx === lineIndex ? { ...l, textDuringOcr: l.textDuringOcr + predictedLetter } : l));

    setCurrentChar(predictedLetter);
    ocrCharacterCountRef.current++;
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
    networkGraphColor,
    onCharAnimationFinished,
  };
}