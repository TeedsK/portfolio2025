export type SubvizRunHandle = {
    promise: Promise<void>;
    cancel?: () => void;
};

export type SubvizOpts = {
    container: HTMLElement;
    center: { x: number; y: number };
};

export { runInventoryPreview } from './inventory';
export { runCaptchaPreview } from './captcha';
export { runServersPreview } from './servers';
export { runConverterPreview } from './converter';
export { runSpoofPreview } from './spoof';