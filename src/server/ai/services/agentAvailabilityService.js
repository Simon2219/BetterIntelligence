/**
 * AgentAvailabilityService - Hydrates agent model availability statuses.
 */
const { AIModelRepository } = require('../../database');

function normalizeProviderName(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeModelId(value) {
    return String(value || '').trim();
}

function cloneAgent(agent) {
    if (!agent || typeof agent !== 'object') return agent;
    return { ...agent };
}

function buildRawModels(agent) {
    const seedModels = Array.isArray(agent?.modelStatuses) ? agent.modelStatuses : [];
    const fromSeed = seedModels.map((entry) => ({
        slot: entry?.slot || 'model',
        provider: entry?.provider || '',
        providerDisplayName: entry?.providerDisplayName || '',
        modelId: entry?.modelId || '',
        displayName: entry?.displayName || ''
    }));

    const fromFields = [
        {
            slot: 'text',
            provider: agent?.text_provider || agent?.textProvider || '',
            providerDisplayName: agent?.text_provider_display || agent?.textProviderDisplayName || '',
            modelId: agent?.text_model || agent?.textModel || '',
            displayName: agent?.text_model_display || agent?.textModelDisplayName || ''
        },
        {
            slot: 'image',
            provider: agent?.image_provider || agent?.imageProvider || '',
            providerDisplayName: agent?.image_provider_display || agent?.imageProviderDisplayName || '',
            modelId: agent?.image_model || agent?.imageModel || '',
            displayName: agent?.image_model_display || agent?.imageModelDisplayName || ''
        }
    ];

    return [...fromSeed, ...fromFields]
        .map((entry) => ({
            slot: String(entry.slot || 'model').trim().toLowerCase(),
            provider: normalizeProviderName(entry.provider),
            providerDisplayName: String(entry.providerDisplayName || '').trim(),
            modelId: normalizeModelId(entry.modelId),
            displayName: String(entry.displayName || '').trim()
        }))
        .filter((entry) => entry.modelId);
}

function dedupeModels(models) {
    const seen = new Set();
    const out = [];
    for (const model of models) {
        const key = `${model.provider}:${model.modelId}:${model.slot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(model);
    }
    return out;
}

function hydrateDisplayNames(agent) {
    const textProvider = normalizeProviderName(agent?.text_provider || agent?.textProvider);
    const imageProvider = normalizeProviderName(agent?.image_provider || agent?.imageProvider);
    const textModel = normalizeModelId(agent?.text_model || agent?.textModel);
    const imageModel = normalizeModelId(agent?.image_model || agent?.imageModel);

    if (textProvider) {
        const display = AIModelRepository.getProviderDisplayName(textProvider, { persistIfMissing: true });
        agent.text_provider_display = display;
        agent.textProviderDisplayName = display;
    }
    if (imageProvider) {
        const display = AIModelRepository.getProviderDisplayName(imageProvider, { persistIfMissing: true });
        agent.image_provider_display = display;
        agent.imageProviderDisplayName = display;
    }
    if (textProvider && textModel) {
        const display = AIModelRepository.getDisplayName(textProvider, textModel, { persistIfMissing: true, modelType: 'text' });
        agent.text_model_display = display;
        agent.textModelDisplayName = display;
    }
    if (imageProvider && imageModel) {
        const display = AIModelRepository.getDisplayName(imageProvider, imageModel, { persistIfMissing: true, modelType: 'image' });
        agent.image_model_display = display;
        agent.imageModelDisplayName = display;
    }
}

function buildModelStatuses(agent) {
    const models = dedupeModels(buildRawModels(agent));
    return models.map((entry) => {
        const row = entry.provider ? AIModelRepository.getByProviderAndModel(entry.provider, entry.modelId) : null;
        const isActive = row ? row.is_active === 1 : true;
        const isUserVisible = row ? row.is_user_visible === 1 : true;
        const isAvailable = isActive && isUserVisible;
        const reasons = [];
        if (!isActive) reasons.push('deactivated');
        if (!isUserVisible) reasons.push('hidden');

        const providerDisplayName = entry.providerDisplayName
            || AIModelRepository.getProviderDisplayName(entry.provider, { persistIfMissing: true });
        const displayName = entry.displayName
            || AIModelRepository.getDisplayName(entry.provider, entry.modelId, {
                persistIfMissing: true,
                modelType: entry.slot === 'image' ? 'image' : 'text'
            });

        return {
            slot: entry.slot,
            provider: entry.provider,
            providerDisplayName,
            modelId: entry.modelId,
            displayName,
            isActive,
            isUserVisible,
            isAvailable,
            reasons
        };
    });
}

function aggregateModelStatus(modelStatuses) {
    const totalModels = modelStatuses.length;
    const unavailableModels = modelStatuses.filter((model) => !model.isAvailable).length;
    const availableModels = Math.max(0, totalModels - unavailableModels);

    const state = totalModels === 0
        ? 'unknown'
        : unavailableModels === 0
            ? 'ok'
            : unavailableModels === totalModels
                ? 'error'
                : 'warning';

    return {
        state,
        totalModels,
        unavailableModels,
        availableModels,
        hasIssues: unavailableModels > 0
    };
}

function hydrateAgentModelAvailability(agent, opts = {}) {
    if (!agent) return agent;
    const target = opts.clone === true ? cloneAgent(agent) : agent;
    hydrateDisplayNames(target);
    const modelStatuses = buildModelStatuses(target);
    target.modelStatuses = modelStatuses;
    target.modelStatus = aggregateModelStatus(modelStatuses);
    return target;
}

function serializeAgentWithAvailability(agent) {
    if (!agent) return null;
    return {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        avatar_url: agent.avatar_url,
        description: agent.description,
        text_provider: agent.text_provider,
        text_model: agent.text_model,
        image_provider: agent.image_provider,
        image_model: agent.image_model,
        text_provider_display: agent.text_provider_display,
        text_model_display: agent.text_model_display,
        image_provider_display: agent.image_provider_display,
        image_model_display: agent.image_model_display,
        textProviderDisplayName: agent.textProviderDisplayName || agent.text_provider_display || null,
        textModelDisplayName: agent.textModelDisplayName || agent.text_model_display || null,
        imageProviderDisplayName: agent.imageProviderDisplayName || agent.image_provider_display || null,
        imageModelDisplayName: agent.imageModelDisplayName || agent.image_model_display || null,
        modelStatuses: Array.isArray(agent.modelStatuses)
            ? agent.modelStatuses.map((entry) => ({
                ...entry,
                reasons: Array.isArray(entry.reasons) ? entry.reasons.slice() : []
            }))
            : [],
        modelStatus: agent.modelStatus || null
    };
}

module.exports = {
    hydrateAgentModelAvailability,
    serializeAgentWithAvailability
};
