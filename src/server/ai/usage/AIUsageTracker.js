const aiModelCatalogService = require('../../services/aiModelCatalogService');
const realtimeBus = require('../../services/realtimeBus');
const log = require('../../services/Logger')('ai-usage');

function toInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toDurationMs(startedAt) {
    if (!Number.isFinite(startedAt)) return null;
    return Math.max(0, Date.now() - startedAt);
}

function toSource(source, fallback) {
    const normalized = String(source || '').trim();
    return normalized || fallback;
}

function toMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    return metadata;
}

function toErrorMessage(error) {
    const raw = String(error?.message || error || '').trim();
    if (!raw) return 'Unknown error';
    return raw.slice(0, 220);
}

function record(payload) {
    try {
        aiModelCatalogService.recordModelUsage(payload);
        realtimeBus.emitAdminModelUsageUpdate({
            providerName: String(payload?.providerName || '').trim().toLowerCase(),
            modelId: String(payload?.modelId || '').trim(),
            usageDelta: {
                requests: 1,
                successCount: payload?.success === false ? 0 : 1,
                errorCount: payload?.success === false ? 1 : 0,
                promptTokens: toInt(payload?.promptTokens),
                completionTokens: toInt(payload?.completionTokens),
                totalTokens: toInt(payload?.totalTokens)
            },
            window: 'realtime',
            source: payload?.source || 'unknown',
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        log.debug('Failed to persist AI usage event', { err: err?.message });
    }
}

function recordTextSuccess({ agent, result, startedAt, usageContext = {} }) {
    const promptTokens = toInt(result?.usage?.promptTokens ?? result?.aiMetadata?.promptTokens);
    const completionTokens = toInt(result?.usage?.completionTokens ?? result?.aiMetadata?.completionTokens);
    const totalTokens = toInt(result?.usage?.totalTokens ?? (promptTokens + completionTokens));

    record({
        providerName: result?.provider || result?.aiMetadata?.provider || agent?.text_provider,
        modelId: result?.model || result?.aiMetadata?.model || agent?.text_model,
        modelType: 'text',
        userId: usageContext.userId || null,
        agentId: usageContext.agentId || agent?.id || null,
        chatId: usageContext.chatId || null,
        source: toSource(usageContext.source, 'text'),
        success: true,
        promptTokens,
        completionTokens,
        totalTokens,
        durationMs: toDurationMs(startedAt),
        metadata: {
            action: 'text',
            ...toMetadata(usageContext.metadata)
        }
    });
}

function recordTextFailure({ agent, startedAt, usageContext = {}, error }) {
    record({
        providerName: agent?.text_provider,
        modelId: agent?.text_model,
        modelType: 'text',
        userId: usageContext.userId || null,
        agentId: usageContext.agentId || agent?.id || null,
        chatId: usageContext.chatId || null,
        source: toSource(usageContext.source, 'text'),
        success: false,
        durationMs: toDurationMs(startedAt),
        metadata: {
            action: 'text',
            error: toErrorMessage(error),
            ...toMetadata(usageContext.metadata)
        }
    });
}

function recordImageSuccess({ agent, result, startedAt, usageContext = {} }) {
    record({
        providerName: result?.provider || agent?.image_provider,
        modelId: result?.model || agent?.image_model,
        modelType: 'image',
        userId: usageContext.userId || null,
        agentId: usageContext.agentId || agent?.id || null,
        chatId: usageContext.chatId || null,
        source: toSource(usageContext.source, 'image'),
        success: true,
        durationMs: toDurationMs(startedAt),
        metadata: {
            action: 'image',
            ...toMetadata(usageContext.metadata)
        }
    });
}

function recordImageFailure({ agent, providerName, modelId, startedAt, usageContext = {}, error }) {
    record({
        providerName: providerName || agent?.image_provider,
        modelId: modelId || agent?.image_model,
        modelType: 'image',
        userId: usageContext.userId || null,
        agentId: usageContext.agentId || agent?.id || null,
        chatId: usageContext.chatId || null,
        source: toSource(usageContext.source, 'image'),
        success: false,
        durationMs: toDurationMs(startedAt),
        metadata: {
            action: 'image',
            error: toErrorMessage(error),
            ...toMetadata(usageContext.metadata)
        }
    });
}

module.exports = {
    recordTextSuccess,
    recordTextFailure,
    recordImageSuccess,
    recordImageFailure
};
