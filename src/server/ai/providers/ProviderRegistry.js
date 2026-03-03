/**
 * ProviderRegistry - Central registry for AI providers (Ollama, ComfyUI, OpenAI).
 */
const Config = require('../../../../config/Config');
const log = require('../../services/Logger')('ai');
const OllamaProvider = require('./OllamaProvider');
const ComfyUIProvider = require('./ComfyUIProvider');
const OpenAICompatProvider = require('./OpenAICompatProvider');
const ComfyUIProcessManager = require('./ComfyUIProcessManager');

const providers = new Map();
let initialized = false;

function init() {
    if (initialized) return;

    const aiConfig = Config.get('ai', {});
    const aiEnabled = process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true' || aiConfig.enabled;
    if (!aiEnabled) {
        log.info('AI system disabled');
        initialized = true;
        return;
    }

    try {
        const ollamaUrl = process.env.OLLAMA_URL || aiConfig.ollamaUrl || 'http://localhost:11434';
        const ollamaModel = process.env.OLLAMA_MODEL || aiConfig.ollamaModel || 'llama3.2';
        providers.set('ollama', new OllamaProvider({
            endpointUrl: ollamaUrl,
            defaultModel: ollamaModel,
            settings: { timeoutMs: aiConfig.queue?.timeoutMs || 60000 }
        }));
    } catch (e) {
        log.error('Failed to initialize Ollama provider', { err: e.message });
    }

    try {
        const comfyUrl = process.env.COMFYUI_URL || aiConfig.comfyuiUrl || 'http://localhost:8188';
        const comfyModel = process.env.COMFYUI_MODEL || aiConfig.comfyuiModel || 'flux2_dev_fp8mixed.safetensors';
        providers.set('comfyui', new ComfyUIProvider({
            endpointUrl: comfyUrl,
            defaultModel: comfyModel,
            settings: { timeoutMs: 180000, pollIntervalMs: 1500 }
        }));
    } catch (e) {
        log.error('Failed to initialize ComfyUI provider', { err: e.message });
    }

    try {
        if (process.env.OPENAI_API_KEY) {
            providers.set('openai', new OpenAICompatProvider({
                name: 'openai',
                endpointUrl: 'https://api.openai.com/v1',
                apiKey: process.env.OPENAI_API_KEY,
                defaultModel: aiConfig.openaiModel || 'gpt-4o-mini',
                settings: { timeoutMs: 60000 }
            }));
        }
    } catch (e) {
        log.error('Failed to initialize OpenAI provider', { err: e.message });
    }

    initialized = true;
    log.info('ProviderRegistry initialized', { providers: [...providers.keys()] });
}

function getProvider(name) {
    return providers.get(name) || null;
}

function getTextProvider(preferred = null) {
    if (preferred && providers.has(preferred)) {
        const p = providers.get(preferred);
        if (p.getCapabilities().text) return p;
    }
    const defaultName = Config.get('ai.defaultTextProvider', 'ollama');
    if (providers.has(defaultName)) {
        const p = providers.get(defaultName);
        if (p.getCapabilities().text) return p;
    }
    for (const p of providers.values()) {
        if (p.getCapabilities().text) return p;
    }
    return null;
}

function getImageProvider(preferred = null) {
    if (preferred && providers.has(preferred)) {
        const p = providers.get(preferred);
        if (p.getCapabilities().image) return p;
    }
    const defaultName = Config.get('ai.defaultImageProvider', 'comfyui');
    if (providers.has(defaultName)) {
        const p = providers.get(defaultName);
        if (p.getCapabilities().image) return p;
    }
    for (const p of providers.values()) {
        if (p.getCapabilities().image) return p;
    }
    return null;
}

async function listProviders() {
    const result = [];
    for (const [name, provider] of providers) {
        const caps = provider.getCapabilities();
        let available = false;
        let error = null;
        try {
            available = typeof provider.isAvailable === 'function' ? await provider.isAvailable() : true;
        } catch (e) {
            error = e?.message || String(e);
        }
        let models = [];
        try { models = typeof provider.listModels === 'function' ? await provider.listModels() : []; } catch {}
        result.push({
            name,
            type: caps.text ? 'text' : caps.image ? 'image' : 'unknown',
            capabilities: caps,
            available,
            error: error || undefined,
            defaultModel: provider.defaultModel || null,
            endpointUrl: provider.endpointUrl || null,
            models
        });
    }
    return result;
}

function getStatus() {
    return {
        initialized,
        aiEnabled: Config.get('ai.enabled', false) || process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true',
        providerCount: providers.size,
        providers: [...providers.keys()]
    };
}

async function startManagedProcesses() {
    const comfyuiStartWithServer = Config.get('ai.comfyuiStartWithServer', false);
    if (!comfyuiStartWithServer) return;
    const comfyuiUrl = Config.get('ai.comfyuiUrl', 'http://localhost:8188');
    await ComfyUIProcessManager.start({ url: comfyuiUrl });
}

async function stopManagedProcesses() {
    if (!ComfyUIProcessManager.isRunning()) return;
    await ComfyUIProcessManager.stop();
}

module.exports = {
    init,
    getProvider,
    getTextProvider,
    getImageProvider,
    listProviders,
    getStatus,
    startManagedProcesses,
    stopManagedProcesses
};
