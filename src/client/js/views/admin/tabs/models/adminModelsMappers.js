export function flattenProviderModels(providers) {
    return (providers || []).flatMap((provider) =>
        (provider.models || []).map((model) => ({
            ...model,
            providerName: provider.name,
            providerDisplayName: provider.displayName || provider.name,
            endpointUrl: provider.endpointUrl || ''
        }))
    );
}

export function buildModelsByKey(modelsFlat, encodeModelKey) {
    return new Map((modelsFlat || []).map((model) => [encodeModelKey(model.providerName, model.modelId), model]));
}

export function normalizeSelectedModelKey(uiState, modelsByKey) {
    if (uiState.selectedModelKey && !modelsByKey.has(uiState.selectedModelKey)) {
        uiState.selectedModelKey = null;
    }
}

export function buildModelPickerItems({
    modelsFlat,
    uiState,
    encodeModelKey,
    escapeHtml
}) {
    return (modelsFlat || [])
        .slice()
        .sort((a, b) => (b.usage?.requests || 0) - (a.usage?.requests || 0))
        .map((model) => {
            const key = encodeModelKey(model.providerName, model.modelId);
            const typeKey = model.modelType === 'image' ? 'image' : 'text';
            const typeLabel = typeKey === 'image' ? 'Image' : 'Text';
            return `
                <button type="button" class="admin-model-picker__item ${uiState.selectedModelKey === key ? 'admin-model-picker__item--active' : ''}" data-model-pick="${key}">
                    <span class="admin-model-picker__type admin-model-type-rail admin-model-type-rail--${typeKey}">${typeLabel}</span>
                    <span class="admin-model-picker__body">
                        <span class="admin-model-picker__name">${escapeHtml(model.displayName || model.modelId)}</span>
                        <span class="admin-model-picker__meta">${escapeHtml(model.providerDisplayName || model.providerName)} - ${escapeHtml(model.modelId)}</span>
                    </span>
                </button>
            `;
        })
        .join('');
}

