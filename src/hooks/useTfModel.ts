import { useEffect, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import { ModelWeights } from '../types';
import { log, error } from '../utils/logger';

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
