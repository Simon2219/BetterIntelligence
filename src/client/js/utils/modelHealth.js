export function normalizeAgentModelStatuses(agent) {
    const explicit = Array.isArray(agent?.modelStatuses) ? agent.modelStatuses : [];
    if (explicit.length) {
        return explicit.map((entry) => {
            const provider = String(entry?.provider || '').trim();
            const modelId = String(entry?.modelId || '').trim();
            const isActive = entry?.isActive !== false;
            const isUserVisible = entry?.isUserVisible !== false;
            const isAvailable = entry?.isAvailable !== false && isActive && isUserVisible;
            return {
                slot: entry?.slot || 'model',
                provider,
                providerDisplayName: String(entry?.providerDisplayName || entry?.provider_display || provider || '').trim(),
                modelId,
                displayName: String(entry?.displayName || modelId || '').trim(),
                isActive,
                isUserVisible,
                isAvailable,
                reasons: Array.isArray(entry?.reasons) ? entry.reasons : []
            };
        }).filter((entry) => entry.modelId);
    }

    const fallback = [
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

    return fallback
        .filter((entry) => String(entry.modelId || '').trim())
        .map((entry) => ({
            slot: entry.slot,
            provider: String(entry.provider || '').trim(),
            providerDisplayName: String(entry.providerDisplayName || entry.provider || '').trim(),
            modelId: String(entry.modelId || '').trim(),
            displayName: String(entry.displayName || entry.modelId || '').trim(),
            isActive: true,
            isUserVisible: true,
            isAvailable: true,
            reasons: []
        }));
}

export function evaluateAgentModelHealth(agent) {
    const models = normalizeAgentModelStatuses(agent);
    const totalModels = models.length;
    const unavailableModels = models.filter((m) => !m.isAvailable).length;
    const availableModels = Math.max(0, totalModels - unavailableModels);

    let state = 'unknown';
    if (totalModels > 0) {
        if (unavailableModels === 0) state = 'ok';
        else if (unavailableModels === totalModels) state = 'error';
        else state = 'warning';
    }

    let summaryText = 'No models configured';
    if (state === 'ok') summaryText = `All ${totalModels} model${totalModels !== 1 ? 's are' : ' is'} available`;
    if (state === 'warning') summaryText = `${unavailableModels} of ${totalModels} models are unavailable`;
    if (state === 'error') summaryText = `All ${totalModels} model${totalModels !== 1 ? 's are' : ' is'} unavailable`;

    return {
        state,
        totalModels,
        unavailableModels,
        availableModels,
        models,
        summaryText,
        hasIssues: unavailableModels > 0
    };
}
