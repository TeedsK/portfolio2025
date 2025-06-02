// src/hooks/useTfModel.ts
import { useState, useEffect, useRef } from 'react'; 
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

    const loadedModelRef = useRef<tf.LayersModel | null>(null);
    const visualizationModelRef = useRef<tf.LayersModel | null>(null);

    useEffect(() => {
        let isMounted = true; // Flag to prevent state updates on unmounted component
        log('Initializing TFJS and loading model...');
        setErrorState(null);
        setIsLoading(true);
        
        // Clear previous model instances from refs and state
        if (loadedModelRef.current) {
            try { loadedModelRef.current.dispose(); } catch (e) { /* ignore */ }
            loadedModelRef.current = null;
        }
        if (visualizationModelRef.current) {
            try { visualizationModelRef.current.dispose(); } catch (e) { /* ignore */ }
            visualizationModelRef.current = null;
        }
        setModel(null);
        setVisModel(null);
        setWeights(null);


        const init = async () => {
            try {
                await tf.ready();
                if (!isMounted) return;
                log(`TFJS Ready. Using backend: ${tf.getBackend()}`);
                setTfReady(true);

                log(`Loading model from: ${modelUrl}`);
                const loaded = await tf.loadLayersModel(modelUrl);
                if (!isMounted) { loaded.dispose(); return; }
                
                loadedModelRef.current = loaded; 
                setModel(loaded);
                log('Model loaded successfully.');

                log('Creating visualization model...');
                const outputLayers = activationLayerNames
                    .map(name => {
                        try {
                            return loaded!.getLayer(name).output;
                        } catch (e) {
                            error(`Layer not found: ${name}`, e);
                            return null;
                        }
                    })
                    .filter((o): o is tf.SymbolicTensor => o !== null);

                if (outputLayers.length !== activationLayerNames.length) {
                    throw new Error('Could not find all specified layers for visualization model.');
                }

                const visualization = tf.model({ inputs: loaded.input, outputs: outputLayers });
                if (!isMounted) { visualization.dispose(); return; }

                visualizationModelRef.current = visualization; 
                setVisModel(visualization);
                log('Visualization model created.');

                // Weight extraction (sync, so less risk with unmounting during it)
                const weightsData: ModelWeights = {};
                for (const name of weightLayerNames) {
                    try {
                        const layer = loaded.getLayer(name);
                        const layerWeights = layer.getWeights();
                        if (layerWeights.length >= 2) { // Kernel and Bias
                            weightsData[name] = {
                                kernel: layerWeights[0].arraySync() as number[][][][],
                                bias: layerWeights[1].arraySync() as number[],
                            };
                        } else if (layerWeights.length === 1) { // Only Kernel
                            weightsData[name] = {
                                kernel: layerWeights[0].arraySync() as number[][][][],
                                bias: [], 
                            };
                        }
                    } catch (e) {
                        error(`Failed to get weights for layer: ${name}`, e);
                    }
                }
                if (isMounted) setWeights(weightsData);
                log('Model weights extracted.');

            } catch (err) {
                error('Failed during TFJS init or model setup', err);
                if (isMounted) {
                    setErrorState(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
                    setTfReady(false);
                    setModel(null); setVisModel(null); setWeights(null);
                    loadedModelRef.current = null; visualizationModelRef.current = null;
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        init();

        return () => {
            isMounted = false; // Set flag on unmount
            log('Disposing models from useTfModel hook cleanup.');
            // Dispose using refs which hold the most recent instances
            if (visualizationModelRef.current) {
                try {
                    visualizationModelRef.current.dispose();
                    log('Visualization model disposed.');
                } catch (e) {
                    error('Error disposing visualization model during cleanup:', e);
                }
                visualizationModelRef.current = null;
            }
            if (loadedModelRef.current) {
                 try {
                    loadedModelRef.current.dispose(); // This should handle all layers it owns
                    log('Main loaded model disposed.');
                } catch (e) {
                    error('Error disposing main loaded model during cleanup:', e);
                }
                loadedModelRef.current = null;
            }
             // No need to call setModel(null) etc. here as component is unmounting
            log('useTfModel cleanup finished.');
        };
    }, [modelUrl, JSON.stringify(activationLayerNames), JSON.stringify(weightLayerNames)]);


    return { model, visModel, weights, isLoading, tfReady, error: errorState };
};