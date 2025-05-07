// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { Switch, Space, Alert, Spin, Button } from 'antd';
import './App.css'; // Ensure this contains necessary base styles
import { log, warn, error } from './utils/logger';
import { findCharacterBoxes } from './ml/processing/segmentation';
import { preprocessCharacterTensor } from './ml/processing/preprocess';
import { ActivationDataValue, ActivationData, ModelWeights, BoundingBoxData, ProcessableLine } from './types';
import Typo from 'typo-js';

// Import Visualization Components (Ensure these files exist and export components)
import { ActivationMapViz } from './components/visualizations/ActivationMapViz';
import { SoftmaxProbViz } from './components/visualizations/SoftmaxProbViz';
import { WeightViz } from './components/visualizations/WeightViz';
import { ConvolutionFiltersViz } from './components/visualizations/ConvolutionFiltersViz';
import { NetworkGraphViz } from './components/visualizations/NetworkGraphViz';

// --- Constants ---
const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
const EMNIST_CHARS = 'abcdefghijklmnopqrstuvwxyz'.split(''); // Exported for use in SoftmaxProbViz
const PROCESSING_DELAY_MS = 100; // Delay between processing steps
const DICTIONARY_PATH = '/dictionaries';

// Layer names based on the known EMNIST model structure (Verify against actual model summary if possible)
const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];
const FINAL_LAYER_NAME = 'dense_1'; // Layer producing the 26 class outputs

// --- Component ---
function App() {
  // --- State Variables ---
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [visModel, setVisModel] = useState<tf.LayersModel | null>(null); // Multi-output model
  const [modelWeights, setModelWeights] = useState<ModelWeights | null>(null); // Extracted weights
  const [currentActivations, setCurrentActivations] = useState<ActivationData | null>(null); // Activations for current char
  const [currentSoftmaxProbs, setCurrentSoftmaxProbs] = useState<number[] | null>(null); // Softmax probs for current char
  const [currentCharVisData, setCurrentCharVisData] = useState<ImageData | null>(null); // Preprocessed image data for NetworkGraphViz

  const [predictedWord, setPredictedWord] = useState<string>(''); // Final predicted word/text
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true); // Tracks model loading
  const [isProcessing, setIsProcessing] = useState<boolean>(false); // Tracks if segmentation/prediction loop is running
  const [tfReady, setTfReady] = useState<boolean>(false); // Tracks TensorFlow.js readiness
  const [errorState, setErrorState] = useState<string | null>(null); // Stores error messages for UI
  const [activeItemIndex, setActiveItemIndex] = useState<{ line: number, item: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  // Update state type for lines
  const [processableLines, setProcessableLines] = useState<ProcessableLine[]>([]);
  // const [processableItems, setProcessableItems] = useState<ProcessableBox[]>([]); // Holds detected BoundingBoxData | null (for space)

  // Visualization Toggles
  const [showConvFilters, setShowConvFilters] = useState<boolean>(false);
  const [showWeights, setShowWeights] = useState<boolean>(false);
  const [showActivations, setShowActivations] = useState<boolean>(true);
  const [showSoftmax, setShowSoftmax] = useState<boolean>(true);
  const [showNetworkGraph, setShowNetworkGraph] = useState<boolean>(true);

  const [typoInstance, setTypoInstance] = useState<Typo | null>(null);
  const [isTypoLoading, setIsTypoLoading] = useState<boolean>(true);
  const [isSpellChecking, setIsSpellChecking] = useState<boolean>(false);
  // Store words with flags for highlighting/correction
  const [textParts, setTextParts] = useState<Array<{ word: string, isCorrect: boolean, original: string, suggestions: string[], isWhitespace: boolean }>>([]);
  const [correctionApplied, setCorrectionApplied] = useState<boolean>(false);


  // Ref for the input image element
  const imageRef = useRef<HTMLImageElement>(null);

  // --- Effects ---

  // Initialize Typo.js
  useEffect(() => {
    setIsTypoLoading(true);
    log('Initializing Typo.js spell checker...');
    try {
      // Typo.js loads dictionary files asynchronously if aff/dic data is not passed directly.
      // We must ensure the path is correct relative to the /public folder.

      
      // Hacky way to check if loaded, Typo.js constructor is synchronous if data isn't passed
      // but file fetching it triggers might be async.
      // A better way is to use its internal loaded promise if available or pre-fetch files.
      // For simplicity, assuming synchronous setup or very fast load from cache for now.
      // Proper loading requires fetch for aff/dic then passing data.
      // Let's fetch manually for explicit async control
      async function loadDictionary() {
        try {
          const affResponse = await fetch(`${DICTIONARY_PATH}/en_US.aff`);
          if (!affResponse.ok) throw new Error(`Failed to load AFF: ${affResponse.statusText}`);
          const affData = await affResponse.text();

          const dicResponse = await fetch(`${DICTIONARY_PATH}/en_US.dic`);
          if (!dicResponse.ok) throw new Error(`Failed to load DIC: ${dicResponse.statusText}`);
          const dicData = await dicResponse.text();

          const dictInstance = new Typo("en_US", affData, dicData);
          log('Typo.js dictionary loaded and instance created successfully.');
          setTypoInstance(dictInstance);
        } catch (dictError) {
          error('Failed to load Typo.js dictionary files:', dictError);
          setErrorState('Spell checker dictionary failed to load.');
        } finally {
          setIsTypoLoading(false);
        }
      }
      loadDictionary();

    } catch (e) {
      error('Error initializing Typo.js:', e);
      setErrorState('Spell checker failed to initialize.');
      setIsTypoLoading(false);
    }
  }, []);

  // Initialize TFJS, load models, extract weights
  useEffect(() => {
    log('App component mounted. Initializing TFJS and loading EMNIST Letters model...');
    setErrorState(null); setIsLoadingModel(true); setModel(null); setVisModel(null); setModelWeights(null);

    async function initializeTFAndLoadModel() {
      try {
        await tf.ready();
        const backend = tf.getBackend();
        log(`TFJS Ready. Using backend: ${backend}`); setTfReady(true);

        log(`Loading EMNIST Letters model from: ${EMNIST_MODEL_URL}`);
        const loadedModel = await tf.loadLayersModel(EMNIST_MODEL_URL);
        setModel(loadedModel); log('EMNIST Letters Model loaded successfully.'); loadedModel.summary();

        // Create Multi-Output Visualization Model
        log('Creating visualization model...');
        const outputLayers = ACTIVATION_LAYER_NAMES.map(name => {
          try { return loadedModel.getLayer(name).output; }
          catch (e) { error(`Layer not found: ${name}`, e); return null; }
        }).filter(output => output !== null) as tf.SymbolicTensor[];
        if (outputLayers.length !== ACTIVATION_LAYER_NAMES.length) { throw new Error("Could not find all specified layers for visualization model."); }
        const visualizationModel = tf.model({ inputs: loadedModel.input, outputs: outputLayers });
        setVisModel(visualizationModel); log('Visualization model created.');

        // Extract Weights
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
              log(`Extracted weights for layer: ${name}`);
            } else if (layerWeights.length === 1) {
              const kernelData = layerWeights[0].arraySync() as number[][][][];
              weightsData[name] = { kernel: kernelData, bias: [] };
              log(`Extracted weights (kernel only) for layer: ${name}`);
            }
            // Consider disposing original weight tensors if memory becomes an issue
            // layerWeights.forEach(t => t.dispose());
          } catch (e) { error(`Failed to get weights for layer: ${name}`, e); }
        }
        setModelWeights(weightsData); log('Model weights extracted.');

        setIsLoadingModel(false); log('TFJS initialization and model/weights/visModel loading complete.');

      } catch (err) {
        error('Failed during TFJS init, model load, or vis setup', err);
        setErrorState(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoadingModel(false); setTfReady(false); setModel(null); setVisModel(null); setModelWeights(null);
      }
    }

    initializeTFAndLoadModel();

    // Cleanup function
    return () => {
      log('App component unmounting.');
      visModel?.dispose(); model?.dispose(); setModel(null); setVisModel(null); setModelWeights(null);
      log('Model states cleared and models disposed.');
      document.getElementById('debugCanvas')?.remove(); // Remove debug canvas if it exists
    };
  }, []); // Run only once on mount

  // Get rendered image dimensions once loaded
  useEffect(() => {
    const imgElement = imageRef.current;
    if (imgElement) {
      const handleLoad = () => {
        log(`Image loaded. Rendered: ${imgElement.offsetWidth}x${imgElement.offsetHeight}, Natural: ${imgElement.naturalWidth}x${imgElement.naturalHeight}`);
        if (imgElement.offsetWidth > 0 && imgElement.offsetHeight > 0) {
          setImageDimensions({ width: imgElement.offsetWidth, height: imgElement.offsetHeight });
        } else {
          log('Rendered dimensions not immediately available.');
          // Attempt fallback using natural size for initial state if needed, though overlay scaling relies on rendered size
          if (imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
            // setImageDimensions({ width: imgElement.naturalWidth, height: imgElement.naturalHeight }); // Option: Initialize with natural size
          }
        }
      };
      const handleError = () => {
        error('Failed to load image source:', imgElement.src);
        setErrorState(`Failed to load image: ${imgElement.src}`);
      };
      if (imgElement.complete && imgElement.naturalWidth > 0) { handleLoad(); }
      else { imgElement.addEventListener('load', handleLoad); }
      imgElement.addEventListener('error', handleError);
      return () => {
        imgElement.removeEventListener('load', handleLoad);
        imgElement.removeEventListener('error', handleError);
      };
    }
  }, [imageRef.current]); // Re-run if imageRef changes


  // --- Handlers ---
  // --- Handlers ---
  const handleImageClick = async () => {
    // Readiness Checks: Ensure models are loaded, TFJS is ready, not already processing, and image ref is valid
    if (isProcessing || !tfReady || isLoadingModel || !imageRef.current?.complete || imageRef.current?.naturalWidth === 0 || !visModel || !model) {
      warn('Not ready for processing.', { isProcessing, tfReady, isLoadingModel, imgComplete: !!imageRef.current?.complete, imgNaturalWidth: imageRef.current?.naturalWidth, hasVisModel: !!visModel, hasModel: !!model });
      if (!imageRef.current?.complete || imageRef.current?.naturalWidth === 0) setErrorState('Image not loaded properly.');
      else if (!model || !visModel) setErrorState('Models not available.');
      else if (!tfReady) setErrorState('TensorFlow.js not ready.');
      return;
    }

    // Reset states for new processing run
    setErrorState(null);
    setIsProcessing(true);
    setPredictedWord('');
    setProcessableLines([]);
    setActiveItemIndex(null);
    setCurrentActivations(null);
    setCurrentSoftmaxProbs(null);
    setCurrentCharVisData(null);
    log('Image clicked. Starting multi-line segmentation and processing...');

    // Setup offscreen canvas for segmentation and cropping
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = imageRef.current; // Already checked non-null status above

    if (!ctx) {
      error('Failed to get canvas context for processing.');
      setErrorState('Internal error: Cannot create canvas context.');
      setIsProcessing(false);
      return;
    }

    // Ensure canvas matches image natural dimensions for accurate segmentation/cropping
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

    // Perform Segmentation (finds lines, chars within lines, and spaces)
    let linesToProcess: ProcessableLine[] = [];
    try {
      log('Finding character lines, boxes, and spaces...');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      linesToProcess = findCharacterBoxes(imageData); // Returns (BoundingBoxData | null)[][]
      setProcessableLines(linesToProcess); // Store for overlay rendering
      if (linesToProcess.length === 0 || linesToProcess.every(line => line.length === 0)) {
        log('No processable lines found by segmentation.');
        setErrorState('No text detected in the image.');
        setIsProcessing(false);
        return;
      }
    } catch (err) {
      error('Segmentation error:', err);
      setErrorState('Segmentation failed. Check console for details.');
      setIsProcessing(false);
      return;
    }

    // Process Lines, Characters, and Spaces sequentially
    let builtWord: string = '';
    try {
      for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex++) {
        const line = linesToProcess[lineIndex];
        for (let itemIndex = 0; itemIndex < line.length; itemIndex++) {
          const item = line[itemIndex];
          setActiveItemIndex({ line: lineIndex, item: itemIndex }); // Highlight current step

          // Reset character-specific visualizations for each step
          setCurrentActivations(null);
          setCurrentSoftmaxProbs(null);
          setCurrentCharVisData(null);

          // --- Handle Space ---
          if (item === null) {
            log(`Processing L${lineIndex + 1}, Item ${itemIndex + 1}: SPACE`);
            builtWord += ' ';
            setPredictedWord(builtWord); // Update display immediately
            // Short delay for visual pacing even for spaces
            await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS / 2));
          }
          // --- Handle Character ---
          else {
            const box = item as BoundingBoxData; // Already validated it's not null
            log(`Processing L${lineIndex + 1}, Item ${itemIndex + 1}: CHARACTER. Box: [${box.join(', ')}]`);

            // Cropping & Padding Character Image Data
            const paddedImageData = (() => {
              const [x, y, w, h] = box;
              log('Cropping and padding character...');
              const cropSourceCanvas = canvas; const PADDING_FACTOR = 1.4; const maxDim = Math.max(w, h); const paddedSize = Math.floor(maxDim * PADDING_FACTOR);
              const padCanvas = document.createElement('canvas'); padCanvas.width = paddedSize; padCanvas.height = paddedSize; const padCtx = padCanvas.getContext('2d');
              if (!padCtx) throw new Error(`Failed context for padding char L${lineIndex + 1}-${itemIndex + 1}`);
              padCtx.fillStyle = 'white'; padCtx.fillRect(0, 0, paddedSize, paddedSize); const drawX = Math.floor((paddedSize - w) / 2); const drawY = Math.floor((paddedSize - h) / 2);
              padCtx.drawImage(cropSourceCanvas, x, y, w, h, drawX, drawY, w, h); return padCtx.getImageData(0, 0, paddedSize, paddedSize);
            })();

            // Create Tensor & Preprocess
            const charTensorUnprocessed = tf.browser.fromPixels(paddedImageData, 4); // Start with 4 channels for safety
            const processedTensor = preprocessCharacterTensor(charTensorUnprocessed); // Handles grayscale, inversion, resize, batch
            charTensorUnprocessed.dispose();

            // Store Preprocessed Image Data for Network Graph Viz
            if (processedTensor) {
              try {
                const tempVisCanvas = document.createElement('canvas'); tempVisCanvas.width = 28; tempVisCanvas.height = 28;
                const tensorToDraw = processedTensor.squeeze([0]); // Remove batch dim for drawing
                await tf.browser.toPixels(tensorToDraw as tf.Tensor2D | tf.Tensor3D, tempVisCanvas);
                const visCtx = tempVisCanvas.getContext('2d');
                if (visCtx) setCurrentCharVisData(visCtx.getImageData(0, 0, 28, 28));
                tensorToDraw.dispose();
              } catch (visErr) { error("Error creating character visualization data", visErr); setCurrentCharVisData(null); }
            } else { setCurrentCharVisData(null); }

            // Skip prediction if preprocessing failed
            if (!processedTensor) {
              builtWord += '?'; log(`Preprocessing failed char L${lineIndex + 1}-${itemIndex + 1}`); setPredictedWord(builtWord);
              await new Promise(r => setTimeout(r, PROCESSING_DELAY_MS)); continue;
            }

            // Prediction and Data Extraction
            let predictedLetter = '?';
            try {
              log('Running visualizationModel.predict() on character...');
              const predictions = visModel.predict(processedTensor) as tf.Tensor[]; // Use non-null assertion checked earlier
              log(`Received ${predictions.length} output tensors.`);

              const activationData: ActivationData = {};
              let softmaxData: number[] | null = null;

              if (predictions.length !== ACTIVATION_LAYER_NAMES.length) {
                error("Prediction output count mismatch with expected layer names!");
              } else {
                // Process each tensor output from the visualization model
                for (let k = 0; k < ACTIVATION_LAYER_NAMES.length; k++) {
                  const layerName = ACTIVATION_LAYER_NAMES[k];
                  const tensor = predictions[k];
                  try {
                    // Use sync extraction for simplicity in step-by-step viz
                    const data = tensor.arraySync();
                    activationData[layerName] = data as ActivationDataValue; // Assert type
                    log(`Extracted activations for ${layerName}, shape: [${tensor.shape.join(',')}]`);
                    // Check if it's the final layer to get softmax probs
                    if (layerName === FINAL_LAYER_NAME) {
                      // Output shape is likely [1, num_classes], flatten needed
                      softmaxData = (data as number[][])[0];
                    }
                  } catch (dataErr) { error(`Error getting data sync for layer ${layerName}`, dataErr); }
                  finally { tensor.dispose(); } // Dispose tensor immediately after use
                }
                // Update state *after* processing all tensors for this step
                setCurrentActivations(activationData);
                setCurrentSoftmaxProbs(softmaxData);

                // Determine predicted letter from softmax
                if (softmaxData) {
                  const predictedIndex = softmaxData.indexOf(Math.max(...softmaxData));
                  predictedLetter = EMNIST_CHARS[predictedIndex] || '?';
                  log(`Character prediction: ${predictedLetter} (Index: ${predictedIndex})`);
                } else { log('Softmax data not found in predictions.'); predictedLetter = '?'; }
              }
            } catch (predictErr) {
              error(`Prediction/Extraction failed for char L${lineIndex + 1}-${itemIndex + 1}`, predictErr);
              predictedLetter = 'X'; // Indicate error
              // Clear viz state on prediction error
              setCurrentActivations(null);
              setCurrentSoftmaxProbs(null);
            }

            processedTensor.dispose(); // Dispose preprocessed tensor
            builtWord += predictedLetter; // Add predicted letter to word
            setPredictedWord(builtWord); // Update display

            // Wait before processing next item
            await new Promise(resolve => setTimeout(resolve, PROCESSING_DELAY_MS));
          } // End Character Handling
        } // End inner loop (items)

        // Add newline character after processing a line (unless it's the last line)
        if (lineIndex < linesToProcess.length - 1) {
          builtWord += '\n'; // Add newline for internal representation
          setPredictedWord(builtWord); // Update display (CSS handles rendering newline)
        }

      } // End outer loop (lines)
    } catch (err) {
      error('Error during character processing loop:', err);
      setErrorState('Processing loop failed.');
      setPredictedWord(builtWord + ' [Error]');
    } finally {
      setIsProcessing(false);
      setActiveItemIndex(null); // Clear active index highlight
      log('Multi-line processing finished.');
      setPredictedWord(builtWord); // Final update just in case
      // Clear last character's visualizations after completion? Optional.
      // setCurrentActivations(null);
      // setCurrentSoftmaxProbs(null);
      // setCurrentCharVisData(null);
    }
  }; // End handleImageClick


  // Handle Spell Check Button Click
  const handleSpellCheck = async () => {
    if (!predictedWord || !typoInstance || isSpellChecking) return;

    log('Starting spell check...');
    setIsSpellChecking(true);
    setCorrectionApplied(false); // Reset correction state
    setTextParts([]); // Clear previous parts

    // Simple word splitting (handles newlines and spaces)
    // Preserve original casing but check lowercase for dictionary for better matching
    const words = predictedWord.split(/(\s+)/).filter(w => w.trim().length > 0 || w.match(/\s+/)); // Keep spaces/newlines
    const processedParts: Array<{ word: string, isCorrect: boolean, original: string, suggestions: string[], isWhitespace: boolean }> = [];

    for (const wordToken of words) {
      if (wordToken.match(/\s+/)) { // It's whitespace
        processedParts.push({ word: wordToken, isCorrect: true, original: wordToken, suggestions: [], isWhitespace: true });
        continue;
      }
      // For checking, remove common punctuation that might interfere, but keep original for display
      const cleanWord = wordToken.replace(/[.,!?;:"']/g, '').toLowerCase();
      const isCorrect = cleanWord.length === 0 || typoInstance.check(cleanWord); // Empty strings are "correct"
      let suggestions: string[] = [];
      if (!isCorrect && cleanWord.length > 0) {
        suggestions = typoInstance.suggest(cleanWord, 5); // Get up to 5 suggestions
      }
      processedParts.push({ word: wordToken, isCorrect, original: wordToken, suggestions, isWhitespace: false });
    }

    setTextParts(processedParts); // This triggers re-render to show red highlights

    // Wait 2 seconds, then apply corrections
    setTimeout(() => {
      if (!processedParts.length) { // Guard against empty parts if original processing fails or is cancelled
        setIsSpellChecking(false);
        return;
      }
      const correctedText = processedParts.map(part => {
        if (part.isWhitespace) return part.original;
        return !part.isCorrect && part.suggestions.length > 0 ? part.suggestions[0] : part.original;
      }).join('');

      setPredictedWord(correctedText); // Update the main predictedWord state
      setCorrectionApplied(true); // Indicate corrections have been applied
      setIsSpellChecking(false);
      // setTextParts([]); // Optionally clear parts after correction, or keep to show history
      log('Spell correction applied.');
    }, 2000);
  };

  // --- Render ---
  return (
    <div className="app-container">
      <h1>Interactive OCR Demo</h1>
      <p>Click the image to automatically detect & process characters (EMNIST Letters a-z model).</p>
      <p style={{ fontSize: '0.8em', color: '#666' }}> (Note: Assumes non-cursive text with gaps. Input preprocessed as white-on-black.)</p>

      <Alert.ErrorBoundary>
        {/* Loading and Error Alerts */}
        {!tfReady && !errorState && <Alert message="Initializing TensorFlow.js..." type="info" showIcon />}
        {isLoadingModel && tfReady && (<Alert message={<span>Loading EMNIST Letters Model... <Spin size="small" /></span>} type="info" showIcon />)}
        {/* {isProcessing && ( <Alert message={<span>Processing Item {activeBoxIndex !== null ? activeBoxIndex + 1 : '?'}/{processableItems.length}... <Spin size="small" /></span>} type="info" showIcon /> )} */}
        {errorState && (<Alert message={errorState} type="error" showIcon closable onClose={() => setErrorState(null)} />)}

        {/* Image and Bounding Box Overlay */}
        <div style={{ position: 'relative', display: 'inline-block', margin: '20px 0' }}>
          <img
            ref={imageRef}
            src="/text_screenshot.png" // Make sure this image exists in /public with spaces
            alt="Text input for OCR"
            className={`ocr-image ${(!tfReady || isLoadingModel || isProcessing || !model) ? 'disabled' : ''}`} // Use a more generic class name maybe
            onClick={handleImageClick}
            style={{ cursor: (!tfReady || isLoadingModel || isProcessing || !model) ? 'not-allowed' : 'pointer', opacity: (!tfReady || isLoadingModel || isProcessing || !model) ? 0.6 : 1, display: 'block', maxWidth: '100%', height: 'auto', border: '1px solid #eee' }}
            crossOrigin="anonymous"
          />
          {/* Bounding Box Visualization Overlay */}
          {imageDimensions && processableLines.length > 0 && (
            <div className="bounding-box-overlay" style={{ position: 'absolute', top: 0, left: 0, width: `${imageDimensions.width}px`, height: `${imageDimensions.height}px`, pointerEvents: 'none' }}>
              {/* Iterate through lines, then items */}
              {processableLines.map((line, lineIndex) =>
                line.map((item, itemIndex) => {
                  if (item === null) return null; // Don't render for spaces

                  const box = item as BoundingBoxData;
                  const scaleX = imageDimensions.width / (imageRef.current?.naturalWidth ?? 1);
                  const scaleY = imageDimensions.height / (imageRef.current?.naturalHeight ?? 1);
                  const [x, y, w, h] = box;
                  const displayX = x * scaleX; const displayY = y * scaleY;
                  const displayW = w * scaleX; const displayH = h * scaleY;

                  // Check if this specific item is active
                  const isActive = activeItemIndex !== null && activeItemIndex.line === lineIndex && activeItemIndex.item === itemIndex;

                  const borderStyle = isActive ? '3px solid rgba(255, 0, 0, 0.8)' : '2px dashed rgba(0, 255, 0, 0.6)';
                  const bgColor = isActive ? 'rgba(255, 0, 0, 0.1)' : 'transparent';
                  // Show green dashed outline for all non-active boxes when processing, hide otherwise? Or always show green? Let's always show non-active green.
                  const displayBorder = isActive ? borderStyle : '2px dashed rgba(0, 255, 0, 0.6)';
                  const displayBg = isActive ? bgColor : 'transparent';

                  // Use combined line/item index for unique key
                  const itemKey = `box-${lineIndex}-${itemIndex}`;

                  return (<div key={itemKey} style={{ position: 'absolute', left: `${displayX}px`, top: `${displayY}px`, width: `${displayW}px`, height: `${displayH}px`, border: displayBorder, backgroundColor: displayBg, transition: 'background-color 0.1s ease, border 0.1s ease', boxSizing: 'border-box', pointerEvents: 'none' }} />);
                })
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <Space direction="horizontal" size="middle" className="controls" wrap>
          <Switch checkedChildren="Conv Filters" unCheckedChildren="Conv Filters" checked={showConvFilters} onChange={setShowConvFilters} disabled={isLoadingModel || isProcessing} />
          <Switch checkedChildren="Weights" unCheckedChildren="Weights" checked={showWeights} onChange={setShowWeights} disabled={isLoadingModel || isProcessing} />
          <Switch checkedChildren="Activations" unCheckedChildren="Activations" checked={showActivations} onChange={setShowActivations} disabled={isLoadingModel || isProcessing} />
          <Switch checkedChildren="Softmax" unCheckedChildren="Softmax" checked={showSoftmax} onChange={setShowSoftmax} disabled={isLoadingModel || isProcessing} />
          <Switch checkedChildren="Network Graph" unCheckedChildren="Network Graph" checked={showNetworkGraph} onChange={setShowNetworkGraph} disabled={isLoadingModel || isProcessing} />
          <Button
                    type="primary"
                    onClick={handleSpellCheck}
                    disabled={isTypoLoading || !typoInstance || !predictedWord.trim() || isProcessing || isSpellChecking}
                    loading={isTypoLoading || isSpellChecking}
                >
                    {isTypoLoading ? 'Loading Dictionary...' : (isSpellChecking ? 'Checking...' : 'Correct Spelling')}
                </Button>
        </Space>

        {/* Output Area */}
        <div className="output" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                {isSpellChecking && !correctionApplied && textParts.length > 0 ? (
                    textParts.map((part, index) => (
                        <span key={index} style={{ color: !part.isWhitespace && !part.isCorrect ? 'red' : 'inherit' }}>
                            {part.original}
                        </span>
                    ))
                ) : (
                    predictedWord || (tfReady && !isLoadingModel ? (model ? 'Click image to process' : 'Model not loaded') : 'Initializing...')
                )}
            </div>

        {/* Visualization Area - Render actual components */}
        <div className="visualization-area" style={{ marginTop: '20px', minHeight: '200px', width: '100%', border: '1px solid #eee', padding: '10px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fdfdfd' }}>
          <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '5px', margin: '-10px -10px 10px -10px', padding: '10px 15px', background: '#f7f7f9', fontWeight: 'normal', fontSize: '1.1em', color: '#555' }}>
            Visualizations {isProcessing && activeItemIndex !== null ? `(Processing Line ${activeItemIndex.line + 1}, Item ${activeItemIndex.item + 1})` : '(Awaiting Input)'}
          </h2>

          {/* Conditionally render visualization components based on toggles AND data availability */}
          {showNetworkGraph && (<NetworkGraphViz activations={currentActivations} softmaxProbabilities={currentSoftmaxProbs} currentCharImageData={currentCharVisData} flattenLayerName="flatten" hiddenDenseLayerName="dense" outputLayerName={FINAL_LAYER_NAME} />)}
          {showConvFilters && modelWeights && modelWeights['conv2d'] && (<ConvolutionFiltersViz weights={modelWeights} layerName='conv2d' />)}
          {showWeights && modelWeights && CONV_LAYER_WEIGHT_NAMES.map(name => modelWeights[name] ? <WeightViz key={name + '-w'} weights={modelWeights} layerName={name} /> : null)}
          {showActivations && currentActivations && ACTIVATION_LAYER_NAMES.slice(0, 6).map(name => <ActivationMapViz key={name + '-a'} activations={currentActivations} layerName={name} />)} {/* Show activations for first few layers */}
          {showSoftmax && currentSoftmaxProbs && (<SoftmaxProbViz probabilities={currentSoftmaxProbs} mapping={EMNIST_CHARS} />)}

          {/* Fallback Messages */}
          {!isLoadingModel && !isProcessing && !currentActivations && !currentSoftmaxProbs && <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Click image to generate visualizations.</div>}
          {!showConvFilters && !showWeights && !showActivations && !showSoftmax && !showNetworkGraph && <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>Enable visualization toggles above.</div>}
        </div>
      </Alert.ErrorBoundary>
    </div>
  );
}

// Export EMNIST_CHARS for use in other components if needed (e.g., SoftmaxProbViz)
// export { EMNIST_CHARS };
export default App;