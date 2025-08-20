// src/pages/landing/hooks/useOcrProcessing.ts
import React, { useState, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import {
  EMNIST_CHARS,
  FINAL_LAYER_NAME,
  ACTIVATION_LAYER_NAMES,
  OCR_PROCESSING_DELAY_MS,
  MEDIA_CROP_TOP_PX,
  MEDIA_CROP_BOTTOM_PX,
} from '../utils/constants';
import { findCharacterBoxes } from '../../../utils/ml/segmentation';
import { preprocessCharacterTensor } from '../../../utils/ml/preprocess';
import {
  ActivationData,
  ActivationDataValue,
  BoundingBoxData,
  ProcessableLine,
  AnimationWave,
  RecognizedCharResult,
} from '../../../types';
import { warn, error, log } from '../../../utils/logger';

interface CharacterToProcess {
  box: BoundingBoxData;
  lineIndex: number;
  itemIndex: number;
}

type QueueItem = CharacterToProcess | 'SPACE' | 'NEWLINE';

interface PendingNetworkAnimationData {
  activations: ActivationData;
  softmaxProbabilities: number[];
  predictedLetter: string;
}

interface UseOcrProcessingOptions {
  imageRef: React.RefObject<HTMLImageElement>;
  setNetworkWaves: React.Dispatch<React.SetStateAction<AnimationWave[]>>;
  model: tf.LayersModel | null;
  visModel: tf.LayersModel | null;
  tfReady: boolean;
  isLoadingModel: boolean;
}

interface UseOcrProcessingResult {
  startOcr: (imageDimensions: { width: number; height: number }) => Promise<string>;
  isProcessingOCR: boolean;
  processableLines: ProcessableLine[];
  activeItemIndex: { line: number; item: number } | null;
  liveOcrText: string;
  currentChar: string | null;
  currentCharImageData: ImageData | null;
  onCharAnimationFinished: (processedCharString: string, gradientSetForWave: string[]) => void;
  recognizedChars: RecognizedCharResult[];
}

export default function useOcrProcessing({
  imageRef,
  setNetworkWaves,
  model,
  visModel,
  tfReady,
  isLoadingModel,
}: UseOcrProcessingOptions): UseOcrProcessingResult {
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<{ line: number; item: number } | null>(null);
  const [liveOcrText, setLiveOcrText] = useState('');
  const [currentChar, setCurrentChar] = useState<string | null>(null);
  const [currentCharImageData, setCurrentCharImageData] = useState<ImageData | null>(null);

  const [recognizedChars, setRecognizedChars] = useState<RecognizedCharResult[]>([]);

  const resolveOcrPromise = useRef<((text: string) => void) | null>(null);
  const rawOutputText = useRef<string>('');
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingNetworkDataRef = useRef<Record<string, PendingNetworkAnimationData>>({});

  const processSingleItem = useCallback(async (queueItem: QueueItem) => {
    if (typeof queueItem === 'string') {
      const text = queueItem === 'SPACE' ? ' ' : '\n';
      rawOutputText.current += text;
      setLiveOcrText(prev => prev + text);
      return;
    }

    if (!imageCanvasRef.current || !visModel) return;

    const { box, lineIndex, itemIndex } = queueItem;
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
      if (!padCtx) throw new Error('Failed to get 2D context');
      padCtx.fillStyle = 'white';
      padCtx.fillRect(0, 0, paddedSize, paddedSize);
      const drawX = (paddedSize - w) / 2;
      const drawY = (paddedSize - h) / 2;
      padCtx.drawImage(imageCanvasRef.current, x, y, w, h, drawX, drawY, w, h);
      return padCtx.getImageData(0, 0, paddedSize, paddedSize);
    })();

    const processedTensor = preprocessCharacterTensor(tf.browser.fromPixels(paddedImageData, 4));

    let predictedLetter = '?';
    if (processedTensor) {
      try {
        const predictions = visModel.predict(processedTensor) as tf.Tensor[];
        const activationData: ActivationData = {};
        let pSoftmax: number[] | null = null;

        predictions.forEach((tensor, k) => {
          const layerName = ACTIVATION_LAYER_NAMES[k];
          const data = tensor.arraySync();
          activationData[layerName] = data as ActivationDataValue;
          if (layerName === FINAL_LAYER_NAME) {
            pSoftmax = (data as number[][])[0];
          }
        });

        if (pSoftmax) {
          const idx = pSoftmax.indexOf(Math.max(...pSoftmax));
          predictedLetter = EMNIST_CHARS[idx] || '?';
          pendingNetworkDataRef.current[predictedLetter] = {
            activations: activationData,
            softmaxProbabilities: pSoftmax,
            predictedLetter
          };
        }
        tf.dispose(predictions);
      } catch (e) {
        error('Prediction failed', e);
      } finally {
        tf.dispose(processedTensor);
      }
    }

    rawOutputText.current += predictedLetter;
    setLiveOcrText(prev => prev + predictedLetter);
    setCurrentChar(predictedLetter);
    setCurrentCharImageData(paddedImageData);

    setRecognizedChars(prev => [
      ...prev,
      {
        id: `rc-${lineIndex}-${itemIndex}-${Date.now()}-${Math.random()}`,
        box,
        char: predictedLetter,
      },
    ]);
  }, [visModel]);

  const runProcessingLoop = useCallback(async (queue: QueueItem[]) => {
    for (const item of queue) {
      await processSingleItem(item);
      await new Promise(resolve => setTimeout(resolve, OCR_PROCESSING_DELAY_MS));
    }
    setIsProcessingOCR(false);
    if (resolveOcrPromise.current) {
      resolveOcrPromise.current(rawOutputText.current);
    }
  }, [processSingleItem]);

  const onCharAnimationFinished = useCallback((processedCharString: string, gradientSetForWave: string[]) => {
    const pendingData = pendingNetworkDataRef.current[processedCharString];
    if (pendingData) {
      setNetworkWaves(prev => [
        ...prev,
        {
          id: `wave-${Date.now()}-${Math.random()}`,
          activations: pendingData.activations,
          softmaxProbabilities: pendingData.softmaxProbabilities,
          gradientSet: gradientSetForWave
        }
      ]);
      delete pendingNetworkDataRef.current[processedCharString];
    }
  }, [setNetworkWaves]);

  // NOTE: The parameter is not currently used, but is kept to preserve type-safety at call sites.
  const startOcr = (_imageDimensions: { width: number; height: number }): Promise<string> => {
    return new Promise<string>((resolve) => {
      if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !model) {
        warn('Not ready for OCR processing.');
        return resolve('');
      }

      setIsProcessingOCR(true);
      setProcessableLines([]);
      setLiveOcrText('');
      setRecognizedChars([]);
      setCurrentChar(null);
      setCurrentCharImageData(null);

      rawOutputText.current = '';
      pendingNetworkDataRef.current = {};
      resolveOcrPromise.current = resolve;

      const img = imageRef.current;
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // ⬇️ Crop 5px top & bottom so black lines never reach the OCR pixels
      const cropTop = Math.max(0, MEDIA_CROP_TOP_PX);
      const cropBottom = Math.max(0, MEDIA_CROP_BOTTOM_PX);
      const srcW = natW;
      const srcH = Math.max(0, natH - cropTop - cropBottom);

      const canvas = document.createElement('canvas');
      canvas.width = srcW;
      canvas.height = srcH > 0 ? srcH : natH; // fallback to full height if something odd happens
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(''); return; }

      if (srcH > 0) {
        ctx.drawImage(img, 0, cropTop, srcW, srcH, 0, 0, srcW, srcH);
      } else {
        // fallback (shouldn't happen, but safe)
        ctx.drawImage(img, 0, 0, natW, natH);
      }

      imageCanvasRef.current = canvas;

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const linesToProcess = findCharacterBoxes(imageData);
        setProcessableLines(linesToProcess);

        const characterQueue: QueueItem[] = [];
        linesToProcess.forEach((line, lineIndexGlobal) => {
          line.forEach((item, itemIndex) => {
            if (item) characterQueue.push({ box: item, lineIndex: lineIndexGlobal, itemIndex });
            else characterQueue.push('SPACE');
          });
          if (lineIndexGlobal < linesToProcess.length - 1) {
            characterQueue.push('NEWLINE');
          }
        });

        if (characterQueue.length > 0) {
          runProcessingLoop(characterQueue);
        } else {
          setIsProcessingOCR(false);
          resolve('');
        }
      } catch (errSeg) {
        error('Segmentation failed', errSeg);
        setIsProcessingOCR(false);
        resolve('');
      }
    });
  };

  return {
    startOcr,
    isProcessingOCR,
    processableLines,
    activeItemIndex,
    liveOcrText,
    currentChar,
    currentCharImageData,
    onCharAnimationFinished,
    recognizedChars,
  };
}
