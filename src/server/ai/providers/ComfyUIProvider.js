/**
 * ComfyUIProvider - Local image generation via ComfyUI REST API.
 * Supports FLUX.2 Dev FP8 and SD checkpoints.
 */
const BaseProvider = require('./BaseProvider');
const log = require('../../services/Logger')('ai');

function isFlux2Model(modelName) {
    if (!modelName) return false;
    const m = String(modelName).toLowerCase();
    return m.includes('flux2') || m.includes('flux2_dev') || m.includes('flux2-dev');
}

function buildSDWorkflow(prompt, options = {}) {
    const width = options.width || 512;
    const height = options.height || 512;
    const negativePrompt = options.negativePrompt || 'ugly, blurry, low quality';
    const checkpoint = options.model || 'realisticVisionV51_v51VAE.safetensors';
    const seed = options.seed || Math.floor(Math.random() * 2147483647);
    return {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
        '3': { class_type: 'CLIPTextEncode', inputs: { text: negativePrompt, clip: ['1', 1] } },
        '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
        '5': { class_type: 'KSampler', inputs: {
            model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
            seed, steps: 25, cfg: 7, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1.0
        }},
        '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
        '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'betterintel' } }
    };
}

function buildFlux2Workflow(prompt, options = {}) {
    const width = options.width || 1024;
    const height = options.height || 1024;
    const steps = options.steps || 20;
    const cfg = options.cfg || 3.5;
    const seed = options.seed || Math.floor(Math.random() * 2147483647);
    const unetName = options.model || 'flux2_dev_fp8mixed.safetensors';
    const clipName = options.textEncoder || 'mistral_3_small_flux2_fp8.safetensors';
    const vaeName = options.vae || 'flux2-vae.safetensors';
    return {
        '1': { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } },
        '2': { class_type: 'CLIPLoader', inputs: { clip_name: clipName, type: 'flux2' } },
        '3': { class_type: 'VAELoader', inputs: { vae_name: vaeName } },
        '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
        '5': { class_type: 'FluxDisableGuidance', inputs: { conditioning: ['4', 0] } },
        '6': { class_type: 'EmptyFlux2LatentImage', inputs: { width, height, batch_size: 1 } },
        '7': { class_type: 'Flux2Scheduler', inputs: { steps, width, height } },
        '8': { class_type: 'SamplerEulerAncestral', inputs: { eta: 1.0, s_noise: 1.0 } },
        '9': { class_type: 'SamplerCustom', inputs: {
            model: ['1', 0], add_noise: true, noise_seed: seed, cfg,
            positive: ['4', 0], negative: ['5', 0], sampler: ['8', 0], sigmas: ['7', 0], latent_image: ['6', 0]
        }},
        '10': { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
        '11': { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'betterintel' } }
    };
}

class ComfyUIProvider extends BaseProvider {
    constructor(config = {}) {
        super({ name: 'comfyui', ...config });
        this.endpointUrl = config.endpointUrl || 'http://localhost:8188';
        this.defaultModel = config.defaultModel || 'flux2_dev_fp8mixed.safetensors';
        this.timeout = config.settings?.timeoutMs || 180000;
        this.pollIntervalMs = config.settings?.pollIntervalMs || 1500;
    }

    getCapabilities() {
        return { text: false, image: true, video: false };
    }

    async generateImage(prompt, options = {}) {
        const useFlux2 = isFlux2Model(options.model || this.defaultModel);
        const workflow = useFlux2
            ? buildFlux2Workflow(prompt, { ...options, model: options.model || this.defaultModel })
            : buildSDWorkflow(prompt, { ...options, model: options.model || this.defaultModel });

        log.info('ComfyUI submitting', { model: options.model || this.defaultModel, flux2: useFlux2 });

        const submitRes = await fetch(`${this.endpointUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow })
        });

        if (!submitRes.ok) {
            const errText = await submitRes.text();
            throw new Error(`ComfyUI submit failed ${submitRes.status}: ${errText}`);
        }

        const body = await submitRes.json();
        const prompt_id = body.prompt_id || body.promptId;
        if (!prompt_id) throw new Error('ComfyUI: no prompt_id returned');

        const startTime = Date.now();
        let outputImages = null;

        while (Date.now() - startTime < this.timeout) {
            await new Promise(r => setTimeout(r, this.pollIntervalMs));
            const histRes = await fetch(`${this.endpointUrl}/history/${prompt_id}`);
            if (!histRes.ok) continue;
            const history = await histRes.json();
            const entry = history[prompt_id];
            if (!entry) continue;

            if (entry.status?.completed || entry.outputs) {
                for (const nodeOut of Object.values(entry.outputs || {})) {
                    if (nodeOut.images?.length) {
                        outputImages = nodeOut.images;
                        break;
                    }
                }
                if (outputImages) break;
            }
            if (entry.status?.status_str === 'error') {
                throw new Error(`ComfyUI error: ${JSON.stringify(entry.status)}`);
            }
        }

        if (!outputImages?.length) throw new Error('ComfyUI: timeout or no output images');

        const img = outputImages[0];
        const imgUrl = `${this.endpointUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
        const imgRes = await fetch(imgUrl);
        if (!imgRes.ok) throw new Error(`ComfyUI: failed to download image ${imgRes.status}`);

        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const mimeType = imgRes.headers.get('content-type') || 'image/png';

        return {
            buffer,
            mimeType,
            width: options.width || (useFlux2 ? 1024 : 512),
            height: options.height || (useFlux2 ? 1024 : 512),
            provider: this.name,
            model: options.model || this.defaultModel
        };
    }

    async isAvailable() {
        const endpoints = ['/object_info', '/system_stats', '/api/system_stats'];
        for (const path of endpoints) {
            try {
                const res = await fetch(`${this.endpointUrl}${path}`, {
                    signal: AbortSignal.timeout(5000)
                });
                if (res.ok) return true;
            } catch (err) {
                if (path === endpoints[0]) {
                    log.debug('ComfyUI availability check failed', { path, err: err.message });
                }
            }
        }
        log.warn('ComfyUI not reachable', { endpoint: this.endpointUrl });
        return false;
    }

    async listModels() {
        try {
            const res = await fetch(`${this.endpointUrl}/object_info`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return [];
            const data = await res.json();
            const unet = data?.UNETLoader?.input?.required?.unet_name;
            const ckpt = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
            const unetList = Array.isArray(unet?.[0]) ? unet[0] : [];
            const ckptList = Array.isArray(ckpt?.[0]) ? ckpt[0] : [];
            const merged = [...new Set([...unetList, ...ckptList])];
            return merged.length ? merged : (this.defaultModel ? [this.defaultModel] : []);
        } catch {
            return this.defaultModel ? [this.defaultModel] : [];
        }
    }
}

module.exports = ComfyUIProvider;
