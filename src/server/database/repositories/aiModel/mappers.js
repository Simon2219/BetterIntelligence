function defaultScopedUsage() {
    return {
        user: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        internal: { requests: 0, successCount: 0, errorCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
}

function normalizeModelRowForApi(row) {
    if (!row) return null;
    return {
        id: row.model_id,
        providerName: row.provider_name,
        displayName: row.display_name,
        modelType: row.model_type === 'image' ? 'image' : 'text',
        metadata: row.metadata,
        installPath: row.install_path,
        isActive: (row.is_active ?? 1) === 1,
        isUserVisible: (row.is_user_visible ?? 1) === 1,
        isInternal: (row.is_internal ?? 0) === 1
    };
}

module.exports = {
    defaultScopedUsage,
    normalizeModelRowForApi
};
