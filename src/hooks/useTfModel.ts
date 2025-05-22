import { useState, useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import { ModelWeights } from '../types';
import { log, error } from '../utils/logger';

export interface UseTfModelResult {
    model: tf.LayersModel | null;
    visModel: tf.LayersModel | null;
    weights: ModelWeights | null;
    isLoading: boolean;
    tfReady: boolean;
    error: string | null;
}

/**
 * Loads a TensorFlow.js model and extracts visualization helpers.
 * Handles disposal when the component using this hook unmounts.
 */
export const useTfModel = (
    modelUrl: string,
    activationLayerNames: string[],
    weightLayerNames: string[],
): UseTfModelResult => {
    const [model, setModel] = useState<tf.LayersModel | null>(null);
    const [visModel, setVisModel] = useState<tf.LayersModel | null>(null);
    const [weights, setWeights] = useState<ModelWeights | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [tfReady, setTfReady] = useState<boolean>(false);
    const [errorState, setErrorState] = useState<string | null>(null);

    useEffect(() => {
        log('Initializing TFJS and loading model...');
        setErrorState(null);
        setIsLoading(true);
        setModel(null);
        setVisModel(null);
        setWeights(null);

        let loadedModel: tf.LayersModel | null = null;
        let visualizationModel: tf.LayersModel | null = null;

        const init = async () => {
            try {
                await tf.ready();
                log(`TFJS Ready. Using backend: ${tf.getBackend()}`);
                setTfReady(true);

                log(`Loading model from: ${modelUrl}`);
                loadedModel = await tf.loadLayersModel(modelUrl);
                setModel(loadedModel);
                log('Model loaded successfully.');

                log('Creating visualization model...');
                const outputLayers = activationLayerNames
                    .map(name => {
                        try {
                            return loadedModel!.getLayer(name).output;
                        } catch (e) {
                            error(`Layer not found: ${name}`, e);
                            return null;
                        }
                    })
                    .filter((o): o is tf.SymbolicTensor => o !== null);

                if (outputLayers.length !== activationLayerNames.length) {
                    throw new Error('Could not find all specified layers for visualization model.');
                }

                visualizationModel = tf.model({ inputs: loadedModel.input, outputs: outputLayers });
                setVisModel(visualizationModel);
                log('Visualization model created.');

                log('Extracting model weights...');
                const weightsData: ModelWeights = {};
                for (const name of weightLayerNames) {
                    try {
                        const layer = loadedModel.getLayer(name);
                        const layerWeights = layer.getWeights();
                        if (layerWeights.length >= 2) {
                            weightsData[name] = {
                                kernel: layerWeights[0].arraySync() as number[][][][],
                                bias: layerWeights[1].arraySync() as number[],
                            };
                        } else if (layerWeights.length === 1) {
                            weightsData[name] = {
                                kernel: layerWeights[0].arraySync() as number[][][][],
                                bias: [],
                            };
                        }
                        log(`Extracted weights for layer: ${name}`);
                    } catch (e) {
                        error(`Failed to get weights for layer: ${name}`, e);
                    }
                }
                setWeights(weightsData);
                log('Model weights extracted.');
            } catch (err) {
                error('Failed during TFJS init or model setup', err);
                setErrorState(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
                setTfReady(false);
                setModel(null);
                setVisModel(null);
                setWeights(null);
            } finally {
                setIsLoading(false);
            }
        };

        init();

        return () => {
            log('Disposing models from useTfModel.');
            visualizationModel?.dispose();
            loadedModel?.dispose();
            setModel(null);
            setVisModel(null);
            setWeights(null);
        };
    }, [modelUrl, activationLayerNames, weightLayerNames]);

    return { model, visModel, weights, isLoading, tfReady, error: errorState };
};
=======
const EMNIST_MODEL_URL = 'https://cdn.jsdelivr.net/gh/mbotsu/emnist-letters@master/models/model_fp32/model.json';
const ACTIVATION_LAYER_NAMES = ['conv2d', 'max_pooling2d', 'conv2d_1', 'max_pooling2d_1', 'conv2d_2', 'max_pooling2d_2', 'flatten', 'dense', 'dense_1'];
const CONV_LAYER_WEIGHT_NAMES = ['conv2d', 'conv2d_1', 'conv2d_2'];

export interface UseTfModelResult {
  model: tf.LayersModel | null;
  visModel: tf.LayersModel | null;
  modelWeights: ModelWeights | null;
  tfReady: boolean;
  isLoadingModel: boolean;
  errorState: string | null;
}

export default function useTfModel(): UseTfModelResult {
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [visModel, setVisModel] = useState<tf.LayersModel | null>(null);
  const [modelWeights, setModelWeights] = useState<ModelWeights | null>(null);
  const [tfReady, setTfReady] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        await tf.ready();
        const backend = tf.getBackend();
        log(`TFJS Ready. Using backend: ${backend}`);
        if (!isMounted) return;
        setTfReady(true);

        log(`Loading EMNIST Letters model from: ${EMNIST_MODEL_URL}`);
        const loadedModel = await tf.loadLayersModel(EMNIST_MODEL_URL);
        if (!isMounted) { loadedModel.dispose(); return; }
        setModel(loadedModel);
        log('EMNIST Letters Model loaded successfully.');

        const outputLayers = ACTIVATION_LAYER_NAMES.map(name => loadedModel.getLayer(name).output) as tf.SymbolicTensor[];
        const visualizationModel = tf.model({ inputs: loadedModel.input, outputs: outputLayers });
        if (!isMounted) { visualizationModel.dispose(); loadedModel.dispose(); return; }
        setVisModel(visualizationModel);
        log('Visualization model created.');

        const weights: ModelWeights = {};
        for (const name of CONV_LAYER_WEIGHT_NAMES) {
          try {
            const layer = loadedModel.getLayer(name);
            const layerWeights = layer.getWeights();
            if (layerWeights.length >= 2) {
              weights[name] = {
                kernel: layerWeights[0].arraySync() as number[][][][],
                bias: layerWeights[1].arraySync() as number[]
              };
            } else if (layerWeights.length === 1) {
              weights[name] = {
                kernel: layerWeights[0].arraySync() as number[][][][],
                bias: []
              };
            }
          } catch (e) {
            error(`Failed to get weights for layer: ${name}`, e);
          }
        }
        if (isMounted) setModelWeights(weights);
      } catch (err) {
        error('Failed during TFJS init or model load', err);
        if (isMounted) setErrorState(err instanceof Error ? err.message : String(err));
      } finally {
        if (isMounted) setIsLoadingModel(false);
      }
    }
    load();
    return () => {
      isMounted = false;
      visModel?.dispose();
      model?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { model, visModel, modelWeights, tfReady, isLoadingModel, errorState };
}
