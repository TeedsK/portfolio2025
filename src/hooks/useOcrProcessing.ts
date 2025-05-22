import { useState, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import useTfModel from './useTfModel';
import { findCharacterBoxes } from '../ml/processing/segmentation';
import { preprocessCharacterTensor } from '../ml/processing/preprocess';
import {
  ActivationData,
  ActivationDataValue,
  BoundingBoxData,
  ProcessableLine,
} from '../types';
import { warn, error } from '../utils/logger';

const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const PROCESSING_DELAY_MS = 80;
const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
const FINAL_LAYER_NAME = 'dense_1';
const ANIMATION_COLOR_PALETTE = ['#456cff', '#34D399', '#F59E0B', '#EC4899', '#8B5CF6'];
const OCR_OVERLAY_FONT_SIZE = 30;

export interface OcrDisplayLinePart {
  id: string;
  text: string;
  isWhitespace: boolean;
  isFlagged?: boolean;
  ref: React.RefObject<HTMLSpanElement>;
}

export interface OcrDisplayLine {
  id: string;
  textDuringOcr: string;
  parts: OcrDisplayLinePart[];
  y: number;
}

interface UseOcrProcessingOptions {
  imageRef: React.RefObject<HTMLImageElement>;
}

interface UseOcrProcessingResult {
  startOcr: (imageDimensions: { width: number; height: number }) => Promise<string>;
  isProcessingOCR: boolean;
  processableLines: ProcessableLine[];
  activeItemIndex: { line: number; item: number } | null;
  currentActivations: ActivationData | null;
  currentSoftmaxProbs: number[] | null;
  currentCharVisData: ImageData | null;
  ocrDisplayLines: OcrDisplayLine[];
  setOcrDisplayLines: React.Dispatch<React.SetStateAction<OcrDisplayLine[]>>;
  ocrPredictedText: string;
  networkGraphColor: string;
}

export default function useOcrProcessing({ imageRef }: UseOcrProcessingOptions): UseOcrProcessingResult {
  const { model, visModel, tfReady, isLoadingModel } = useTfModel();

  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState<{ line: number; item: number } | null>(null);
  const [currentActivations, setCurrentActivations] = useState<ActivationData | null>(null);
  const [currentSoftmaxProbs, setCurrentSoftmaxProbs] = useState<number[] | null>(null);
  const [currentCharVisData, setCurrentCharVisData] = useState<ImageData | null>(null);
  const [ocrDisplayLines, setOcrDisplayLines] = useState<OcrDisplayLine[]>([]);
  const [ocrPredictedText, setOcrPredictedText] = useState('');
  const [networkGraphColor, setNetworkGraphColor] = useState(ANIMATION_COLOR_PALETTE[0]);

  const ocrCharacterCountRef = useRef(0);

  const startOcr = async (imageDimensions: { width: number; height: number }): Promise<string> => {
    if (isProcessingOCR || !tfReady || isLoadingModel || !imageRef.current?.complete || !imageDimensions || !visModel || !model) {
      warn('Not ready for OCR processing.', { isProcessingOCR, tfReady, isLoadingModel, imgComplete: !!imageRef.current?.complete, imageDimensions: !!imageDimensions });
      return '';
    }

    setIsProcessingOCR(true);
    setOcrPredictedText('');
    setProcessableLines([]);
    setActiveItemIndex(null);
    setOcrDisplayLines([]);
    setCurrentActivations(null);
    setCurrentSoftmaxProbs(null);
    setCurrentCharVisData(null);
    ocrCharacterCountRef.current = 0;
    setNetworkGraphColor(ANIMATION_COLOR_PALETTE[0]);

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !img) { error('Failed to get canvas context.'); setIsProcessingOCR(false); return ''; }

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
        return '';
      }
    } catch (errSeg) {
      error('Segmentation failed', errSeg);
      setIsProcessingOCR(false);
      return '';
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

    let rawOutput = '';
    try {
      for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex++) {
        const line = linesToProcess[lineIndex];
        let currentLineRawText = '';
        for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
          const item = line[itemIndex];
          setActiveItemIndex({ line: lineIndex, item: itemIndex });
          let charToAdd = '';
          if (item === null) {
            charToAdd = ' ';
            await new Promise(r => setTimeout(r, PROCESSING_DELAY_MS / 4));
          } else {
            const box = item as BoundingBoxData;
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
            const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4);
            const processedTensor = preprocessCharacterTensor(charTensorUnprocessed);
            charTensorUnprocessed.dispose();
            let predictedLetter = '?';
            if (processedTensor) {
              try {
                const tempVisCanvas = document.createElement('canvas');
                tempVisCanvas.width = 28;
                tempVisCanvas.height = 28;
                const tensorToDraw = processedTensor.squeeze([0]);
                await tf.browser.toPixels(tensorToDraw as tf.Tensor2D | tf.Tensor3D, tempVisCanvas);
                const visCtx = tempVisCanvas.getContext('2d');
                if (visCtx) setCurrentCharVisData(visCtx.getImageData(0, 0, 28, 28));
                tensorToDraw.dispose();
              } catch (visErr) {
                error('Error creating character visualization data', visErr);
                setCurrentCharVisData(null);
              }

              try {
                const predictions = visModel.predict(processedTensor) as tf.Tensor[];
                const activationData: ActivationData = {};
                let softmaxData: number[] | null = null;
                if (predictions.length === ACTIVATION_LAYER_NAMES.length) {
                  for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) {
                    const layerName = ACTIVATION_LAYER_NAMES[k];
                    const tensor = predictions[k];
                    try {
                      const data = tensor.arraySync();
                      activationData[layerName] = data as ActivationDataValue;
                      if (layerName === FINAL_LAYER_NAME) {
                        softmaxData = (data as number[][])[0];
                      }
                    } finally {
                      tensor.dispose();
                    }
                  }
                  setCurrentActivations(activationData);
                  setCurrentSoftmaxProbs(softmaxData);
                  if (softmaxData) {
                    const idx = softmaxData.indexOf(Math.max(...softmaxData));
                    predictedLetter = EMNIST_CHARS[idx] || '?';
                  }
                }
              } catch (predictErr) {
                error(`Prediction failed char L${lineIndex + 1}-${itemIndex + 1}`, predictErr);
                predictedLetter = 'X';
                setCurrentActivations(null);
                setCurrentSoftmaxProbs(null);
              }
              processedTensor.dispose();
              charToAdd = predictedLetter;
            } else {
              charToAdd = '?';
              setCurrentActivations(null);
              setCurrentSoftmaxProbs(null);
              setCurrentCharVisData(null);
            }
            ocrCharacterCountRef.current++;
            await new Promise(r => setTimeout(r, PROCESSING_DELAY_MS));
          }
          currentLineRawText += charToAdd;
          setOcrDisplayLines(prev => prev.map((l, idx) => idx === lineIndex ? { ...l, textDuringOcr: l.textDuringOcr + charToAdd } : l));
        }
        rawOutput += currentLineRawText;
        if (lineIndex < linesToProcess.length - 1) rawOutput += '\n';
      }
      setOcrPredictedText(rawOutput);
    } catch (errLoop) {
      error('OCR Loop Error', errLoop);
    } finally {
      setIsProcessingOCR(false);
      setActiveItemIndex(null);
    }

    return rawOutput;
  };

  return {
    startOcr,
    isProcessingOCR,
    processableLines,
    activeItemIndex,
    currentActivations,
    currentSoftmaxProbs,
    currentCharVisData,
    ocrDisplayLines,
    setOcrDisplayLines,
    ocrPredictedText,
    networkGraphColor,
  };
}
