function createUsageWriteApi({ run, upsertModel }) {
    function recordUsage(event = {}) {
        const provider = String(event.providerName || '').trim().toLowerCase();
        const modelId = String(event.modelId || '').trim();
        if (!provider || !modelId) return null;
        const modelType = event.modelType === 'image' ? 'image' : 'text';

        upsertModel(provider, modelId, {
            modelType,
            displayName: event.displayName || undefined
        });

        const toInt = (v) => {
            const n = parseInt(v, 10);
            return Number.isFinite(n) ? n : 0;
        };

        const promptTokens = toInt(event.promptTokens);
        const completionTokens = toInt(event.completionTokens);
        const totalTokens = event.totalTokens !== undefined ? toInt(event.totalTokens) : (promptTokens + completionTokens);
        const durationMs = event.durationMs !== undefined && event.durationMs !== null ? toInt(event.durationMs) : null;
        const success = event.success === false ? 0 : 1;
        const metadata = JSON.stringify(event.metadata && typeof event.metadata === 'object' ? event.metadata : {});

        run(`INSERT INTO ai_model_usage_events (
            provider_name, model_id, model_type, user_id, agent_id, chat_id, source, success,
            prompt_tokens, completion_tokens, total_tokens, duration_ms, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            provider,
            modelId,
            modelType,
            event.userId || null,
            event.agentId || null,
            event.chatId || null,
            event.source || 'chat',
            success,
            promptTokens,
            completionTokens,
            totalTokens,
            durationMs,
            metadata
        ]);
        return true;
    }

    return {
        recordUsage
    };
}

module.exports = {
    createUsageWriteApi
};
