/**
 * OpenAICompatProvider - Works with OpenAI and compatible APIs.
 */
const BaseProvider = require('./BaseProvider');

class OpenAICompatProvider extends BaseProvider {
    constructor(config = {}) {
        super({ name: config.name || 'openai', ...config });
        this.endpointUrl = config.endpointUrl || 'https://api.openai.com/v1';
        this.defaultModel = config.defaultModel || 'gpt-4o-mini';
        this.timeout = config.settings?.timeoutMs || 60000;
    }

    getCapabilities() {
        return { text: true, image: false, video: false };
    }

    async generateText(messages, options = {}) {
        const model = options.model || this.defaultModel;
        const temperature = options.temperature ?? 0.8;
        const maxTokens = options.maxTokens || 512;

        const apiMessages = [];
        if (options.systemPrompt) {
            apiMessages.push({ role: 'system', content: options.systemPrompt });
        }
        apiMessages.push(...messages);

        const url = `${this.endpointUrl}/chat/completions`;
        const hdrs = { 'Content-Type': 'application/json' };
        if (this.apiKey) hdrs['Authorization'] = `Bearer ${this.apiKey}`;

        const body = { model, messages: apiMessages, temperature, max_tokens: maxTokens };
        if (options.topP !== undefined && options.topP !== null) body.top_p = options.topP;
        if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty;
        if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty;
        if (Array.isArray(options.stop) && options.stop.length) body.stop = options.stop;

        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeout);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: hdrs,
                    body: JSON.stringify(body),
                    signal: controller.signal
                });

                if (!res.ok) {
                    const errText = await res.text();
                    let msg = `${this.name} ${res.status}`;
                    try { const j = JSON.parse(errText); msg += `: ${j.error?.message || j.error || errText}`; } catch { msg += `: ${errText}`; }
                    throw new Error(msg);
                }

                const data = await res.json();
                const choice = data.choices?.[0];
                const text = choice?.message?.content || '';
                const promptTokens = data.usage?.prompt_tokens || 0;
                const completionTokens = data.usage?.completion_tokens || 0;
                const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

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
                    throw new Error(`${this.name} timeout after ${this.timeout}ms`);
                }
                lastError = err;
                if (err.message.includes('401') || err.message.includes('403')) throw err;
            } finally {
                clearTimeout(timer);
            }
        }
        throw lastError;
    }

    async isAvailable() {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
            const res = await fetch(`${this.endpointUrl}/models`, {
                headers,
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) throw new Error(`OpenAI at ${this.endpointUrl} returned ${res.status}`);
            return true;
        } catch (err) {
            throw new Error(`OpenAI not reachable at ${this.endpointUrl}: ${err.message}`);
        }
    }

    async listModels() {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
            const res = await fetch(`${this.endpointUrl}/models`, {
                headers,
                signal: AbortSignal.timeout(5000)
            });
            if (!res.ok) return [];
            const data = await res.json();
            return (data.data || []).map(m => m.id);
        } catch {
            return [];
        }
    }
}

module.exports = OpenAICompatProvider;
