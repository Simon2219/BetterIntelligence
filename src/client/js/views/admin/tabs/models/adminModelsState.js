export function normalizeModelsTabState({ uiState, modelsByKey }) {
    if (uiState.selectedModelKey && !modelsByKey.has(uiState.selectedModelKey)) {
        uiState.selectedModelKey = null;
    }
    if (!['config', 'stats'].includes(uiState.modelsSubView)) {
        uiState.modelsSubView = 'config';
    }
    if (!['day', 'hour'].includes(uiState.modelUsageBucket)) {
        uiState.modelUsageBucket = 'day';
    }
    if (!['requests', 'tokens', 'errors', null].includes(uiState.modelUsageMetric)) {
        uiState.modelUsageMetric = null;
    }
}

