/**
 * OllamaProvider - Local LLM text generation via Ollama REST API.
 */
const BaseProvider = require('./BaseProvider');
const log = require('../../services/Logger')('ai');

class OllamaProvider extends BaseProvider {
    constructor(config = {}) {
        super({ name: 'ollama', ...config });
        this.endpointUrl = config.endpointUrl || 'http://localhost:11434';
        this.defaultModel = config.defaultModel || 'llama3.2';
        this.timeout = config.settings?.timeoutMs || 60000;
    }

    getCapabilities() {
        return { text: true, image: false, video: false };
    }

    async generateText(messages, options = {}) {
        const model = options.model || this.defaultModel;
        const temperature = options.temperature ?? 0.8;
        const maxTokens = options.maxTokens || 512;

        const ollamaMessages = [];
        if (options.systemPrompt) {
            ollamaMessages.push({ role: 'system', content: options.systemPrompt });
        }
        ollamaMessages.push(...messages);

        const ollamaOpts = { temperature, num_predict: maxTokens };
        if (options.topP !== undefined && options.topP !== null) ollamaOpts.top_p = options.topP;
        if (options.topK !== undefined && options.topK !== null) ollamaOpts.top_k = options.topK;
        if (options.repeatPenalty !== undefined && options.repeatPenalty !== null) ollamaOpts.repeat_penalty = options.repeatPenalty;
        if (options.presencePenalty !== undefined) ollamaOpts.presence_penalty = options.presencePenalty;
        if (options.frequencyPenalty !== undefined) ollamaOpts.frequency_penalty = options.frequencyPenalty;

        const url = `${this.endpointUrl}/api/chat`;
        const body = {
            model,
            messages: ollamaMessages,
            stream: false,
            options: ollamaOpts
        };
        if (Array.isArray(options.stop) && options.stop.length) body.stop = options.stop;

        log.info('Ollama request', { url, model, messageCount: ollamaMessages.length });
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeout);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                if (!res.ok) {
                    const errText = await res.text();
                    let msg = `Ollama ${res.status}`;
                    try { const j = JSON.parse(errText); msg += `: ${j.error || errText}`; } catch { msg += `: ${errText}`; }
                    throw new Error(msg);
                }

                const data = await res.json();
                const text = data.message?.content || '';
                const promptTokens = data.prompt_eval_count || 0;
                const completionTokens = data.eval_count || 0;
                const totalTokens = promptTokens + completionTokens;

                return {
                    text: text.trim(),
                    usage: {
                        promptTokens,
                        completionTokens,
                        totalTokens
                    },
                    model,
                    provider: this.name
                };
            } catch (err) {
                clearTimeout(timer);
                if (err.name === 'AbortError') {
                    throw new Error(`Ollama timeout after ${this.timeout}ms`);
                }
                lastError = err;
                if (err.message.includes('404') || err.message.includes('model')) throw err;
                log.warn('Ollama request failed, retrying...', { attempt, err: err.message });
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastError;
    }

    async isAvailable() {
        try {
            const res = await fetch(`${this.endpointUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) throw new Error(`Ollama at ${this.endpointUrl} returned ${res.status}`);
            return true;
        } catch (err) {
            throw new Error(`Ollama not reachable at ${this.endpointUrl}: ${err.message}`);
        }
    }

    async listModels() {
        try {
            const res = await fetch(`${this.endpointUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.models || []).map(m => m.name);
        } catch {
            return [];
        }
    }
}

module.exports = OllamaProvider;
