/**
 * AIModelCatalogService - Manages the AI model catalog and provider discovery.
 */
const ProviderRegistry = require('../providers/ProviderRegistry');
const { AIModelRepository } = require('../../database');
const notificationService = require('../../services/notificationService');

const PROVIDER_REFRESH_CACHE_MS = 12000;
let providerRefreshCache = { at: 0, providers: null };

function toDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 3650);
}

function toModelType(capabilities = {}) {
    if (capabilities?.image && !capabilities?.text) return 'image';
    return 'text';
}

function parseMetadata(rawValue) {
    try { return JSON.parse(rawValue || '{}') || {}; } catch { return {}; }
}

function mapModelRow(row, usage = null) {
    const fallbackUsage = {
        requests: 0,
        successCount: 0,
        errorCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
    };
    return {
        providerName: row.provider_name,
        providerDisplayName: AIModelRepository.getProviderDisplayName(row.provider_name, { persistIfMissing: true }),
        modelId: row.model_id,
        displayName: row.display_name,
        modelType: row.model_type || 'text',
        installPath: row.install_path || '',
        isActive: (row.is_active ?? 1) === 1,
        isUserVisible: (row.is_user_visible ?? 1) === 1,
        isInternal: (row.is_internal ?? 0) === 1,
        metadata: parseMetadata(row.metadata),
        lastSeenAt: row.last_seen_at || null,
        updatedAt: row.updated_at || null,
        usage: usage || fallbackUsage
    };
}

async function refreshCatalog(opts = {}) {
    const force = opts.force === true;
    const now = Date.now();
    if (!force && providerRefreshCache.providers && (now - providerRefreshCache.at) < PROVIDER_REFRESH_CACHE_MS) {
        return providerRefreshCache.providers;
    }

    const providers = await ProviderRegistry.listProviders();
    const mappedProviders = providers.map((provider) => ({
        ...provider,
        displayName: AIModelRepository.getProviderDisplayName(provider.name, { persistIfMissing: true })
    }));

    mappedProviders.forEach((provider) => {
        const modelType = toModelType(provider.capabilities);
        const installPath = provider.endpointUrl || '';
        const baseMetadata = {
            providerAvailable: !!provider.available,
            providerError: provider.error || null
        };

        const syncedModels = AIModelRepository.syncProviderModels(provider.name, provider.models, {
            modelType,
            installPath,
            metadata: baseMetadata
        });

        notificationService.emitAdminProviderStatusUpdate({
            providerName: provider.name,
            available: !!provider.available,
            error: provider.error || null,
            checkedAt: new Date().toISOString()
        });

        syncedModels.forEach((model) => {
            notificationService.emitAdminModelStatusUpdate({
                providerName: provider.name,
                modelId: model.id,
                isActive: !!model.isActive,
                isUserVisible: !!model.isUserVisible,
                updatedAt: new Date().toISOString()
            });
        });

        if (provider.defaultModel) {
            const row = AIModelRepository.upsertModel(provider.name, provider.defaultModel, {
                modelType,
                installPath,
                metadata: { ...baseMetadata, isDefault: true }
            });
            if (row) {
                notificationService.emitAdminModelStatusUpdate({
                    providerName: row.provider_name,
                    modelId: row.model_id,
                    isActive: (row.is_active ?? 1) === 1,
                    isUserVisible: (row.is_user_visible ?? 1) === 1,
                    updatedAt: row.updated_at || new Date().toISOString()
                });
            }
        }
    });
    providerRefreshCache = { at: now, providers: mappedProviders };
    return mappedProviders;
}

function modelRowsForProvider(providerName, filters = {}) {
    return AIModelRepository.listByProvider(providerName, filters);
}

async function getUserFacingProviders() {
    const providers = await refreshCatalog();
    return providers.map((provider) => {
        const modelType = toModelType(provider.capabilities);
        const rows = modelRowsForProvider(provider.name, {
            modelType,
            onlyActive: true,
            onlyUserVisible: true,
            excludeInternal: true
        });
        const providerDisplayName = provider.displayName || AIModelRepository.getProviderDisplayName(provider.name, { persistIfMissing: true });
        const models = rows.map((row) => ({
            id: row.model_id,
            displayName: row.display_name,
            isActive: (row.is_active ?? 1) === 1,
            isUserVisible: (row.is_user_visible ?? 1) === 1
        }));
        const modelIds = models.map((m) => m.id);
        const hasDefault = !!provider.defaultModel && modelIds.includes(provider.defaultModel);
        const defaultModel = hasDefault ? provider.defaultModel : (models[0]?.id || null);
        const defaultModelDisplay = defaultModel
            ? (models.find((m) => m.id === defaultModel)?.displayName || AIModelRepository.getDisplayName(provider.name, defaultModel, { persistIfMissing: true, modelType }))
            : null;

        return {
            name: provider.name,
            displayName: providerDisplayName,
            type: provider.type,
            capabilities: provider.capabilities,
            available: !!provider.available,
            error: provider.error || undefined,
            endpointUrl: provider.endpointUrl || null,
            modelType,
            models,
            modelIds,
            defaultModel,
            defaultModelDisplay
        };
    });
}

async function getUserFacingProviderModels(providerName) {
    const providers = await getUserFacingProviders();
    const provider = providers.find((p) => p.name === String(providerName || '').trim().toLowerCase())
        || providers.find((p) => p.name === providerName);
    if (!provider) return null;
    return {
        name: provider.name,
        displayName: provider.displayName || AIModelRepository.getProviderDisplayName(provider.name, { persistIfMissing: true }),
        modelType: provider.modelType,
        models: provider.models,
        modelIds: provider.modelIds,
        defaultModel: provider.defaultModel,
        defaultModelDisplay: provider.defaultModelDisplay
    };
}

async function getAdminCatalog(opts = {}) {
    const days = toDays(opts.days, 30);
    const providers = await refreshCatalog({ force: opts.forceRefresh === true });
    const usage = AIModelRepository.getUsageTotals({ days });
    const usageByModel = usage.byModel || {};

    const allRows = AIModelRepository.listModels();
    const providerMap = new Map();
    providers.forEach((provider) => {
        providerMap.set(provider.name, {
            name: provider.name,
            displayName: provider.displayName || AIModelRepository.getProviderDisplayName(provider.name, { persistIfMissing: true }),
            type: provider.type,
            capabilities: provider.capabilities || {},
            available: !!provider.available,
            error: provider.error || undefined,
            endpointUrl: provider.endpointUrl || null,
            models: []
        });
    });

    allRows.forEach((row) => {
        if (!providerMap.has(row.provider_name)) {
            providerMap.set(row.provider_name, {
                name: row.provider_name,
                displayName: AIModelRepository.getProviderDisplayName(row.provider_name, { persistIfMissing: true }),
                type: row.model_type === 'image' ? 'image' : 'text',
                capabilities: { text: row.model_type !== 'image', image: row.model_type === 'image' },
                available: false,
                error: 'Provider not currently reachable',
                endpointUrl: null,
                models: []
            });
        }
        const key = `${row.provider_name}:${row.model_id}`;
        providerMap.get(row.provider_name).models.push(mapModelRow(row, usageByModel[key]));
    });

    const providerList = [...providerMap.values()].map((provider) => ({
        ...provider,
        models: provider.models.sort((a, b) => {
            if ((b.usage?.requests || 0) !== (a.usage?.requests || 0)) {
                return (b.usage?.requests || 0) - (a.usage?.requests || 0);
            }
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        })
    })).sort((a, b) => String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));

    const totalModels = allRows.length;
    const activeModelCount = allRows.filter((row) => (row.is_active ?? 1) === 1).length;
    const visibleModelCount = allRows.filter((row) => (row.is_user_visible ?? 1) === 1).length;
    const internalModelCount = allRows.filter((row) => (row.is_internal ?? 0) === 1).length;
    const onlineProviderCount = providerList.filter((p) => p.available).length;

    return {
        generatedAt: new Date().toISOString(),
        days,
        totals: {
            providerCount: providerList.length,
            onlineProviderCount,
            modelCount: totalModels,
            activeModelCount,
            visibleModelCount,
            internalModelCount,
            requests: usage.totals?.requests || 0,
            successCount: usage.totals?.successCount || 0,
            errorCount: usage.totals?.errorCount || 0,
            promptTokens: usage.totals?.promptTokens || 0,
            completionTokens: usage.totals?.completionTokens || 0,
            totalTokens: usage.totals?.totalTokens || 0,
            userRequests: usage.byScope?.user?.requests || 0,
            userSuccessCount: usage.byScope?.user?.successCount || 0,
            userErrorCount: usage.byScope?.user?.errorCount || 0,
            userPromptTokens: usage.byScope?.user?.promptTokens || 0,
            userCompletionTokens: usage.byScope?.user?.completionTokens || 0,
            userTotalTokens: usage.byScope?.user?.totalTokens || 0,
            internalRequests: usage.byScope?.internal?.requests || 0,
            internalSuccessCount: usage.byScope?.internal?.successCount || 0,
            internalErrorCount: usage.byScope?.internal?.errorCount || 0,
            internalPromptTokens: usage.byScope?.internal?.promptTokens || 0,
            internalCompletionTokens: usage.byScope?.internal?.completionTokens || 0,
            internalTotalTokens: usage.byScope?.internal?.totalTokens || 0,
            bySource: usage.bySource || {}
        },
        providers: providerList
    };
}

function updateModelConfig(providerName, modelId, payload = {}) {
    const updates = {};
    if (typeof payload.displayName === 'string') updates.displayName = payload.displayName.trim() || undefined;
    if (payload.modelType === 'text' || payload.modelType === 'image') updates.modelType = payload.modelType;
    if (typeof payload.installPath === 'string') updates.installPath = payload.installPath.trim();
    if (payload.isActive !== undefined) updates.isActive = !!payload.isActive;
    if (payload.isUserVisible !== undefined) updates.isUserVisible = !!payload.isUserVisible;
    if (payload.isInternal !== undefined) updates.isInternal = !!payload.isInternal;
    if (payload.metadata && typeof payload.metadata === 'object') updates.metadata = payload.metadata;

    const updated = AIModelRepository.setModelState(providerName, modelId, updates);
    if (!updated) {
        const err = new Error('Model not found');
        err.statusCode = 404;
        throw err;
    }
    const mapped = mapModelRow(updated);
    notificationService.emitAdminModelStatusUpdate({
        providerName: mapped.providerName,
        modelId: mapped.modelId,
        isActive: !!mapped.isActive,
        isUserVisible: !!mapped.isUserVisible,
        updatedAt: mapped.updatedAt || new Date().toISOString()
    });
    return mapped;
}

function updateProviderConfig(providerName, payload = {}) {
    const normalizedProviderName = String(providerName || '').trim().toLowerCase();
    if (!normalizedProviderName) {
        const err = new Error('Provider not found');
        err.statusCode = 404;
        throw err;
    }

    if (typeof payload.displayName !== 'string') {
        const err = new Error('displayName required');
        err.statusCode = 400;
        throw err;
    }

    const displayName = AIModelRepository.setProviderDisplayName(normalizedProviderName, payload.displayName);
    providerRefreshCache = { at: 0, providers: null };
    notificationService.emitAdminProviderStatusUpdate({
        providerName: normalizedProviderName,
        available: true,
        error: null,
        checkedAt: new Date().toISOString()
    });
    return {
        providerName: normalizedProviderName,
        displayName
    };
}

function getModelUsage(providerName, modelId, opts = {}) {
    const days = toDays(opts.days, 30);
    const bucket = opts.bucket === 'hour' ? 'hour' : 'day';
    const row = AIModelRepository.getByProviderAndModel(providerName, modelId);
    if (!row) {
        const err = new Error('Model not found');
        err.statusCode = 404;
        throw err;
    }
    const usage = AIModelRepository.getUsageTimeline(providerName, modelId, { days, bucket });
    return { model: mapModelRow(row), usage };
}

function recordModelUsage(event) {
    return AIModelRepository.recordUsage(event);
}

module.exports = {
    refreshCatalog,
    getUserFacingProviders,
    getUserFacingProviderModels,
    getAdminCatalog,
    updateModelConfig,
    updateProviderConfig,
    getModelUsage,
    recordModelUsage
};
