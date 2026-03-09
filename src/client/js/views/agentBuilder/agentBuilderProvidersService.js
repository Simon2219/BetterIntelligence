export function createAgentBuilderProvidersService({ api }) {
    let providersCache = null;

    async function fetchProviders(forceRefresh = false) {
        if (!forceRefresh && providersCache) return providersCache;
        try {
            const { data } = await api('/ai/providers');
            providersCache = data;
            return data;
        } catch {
            return [];
        }
    }

    function normalizeModelOptions(models) {
        return (Array.isArray(models) ? models : [])
            .map((entry) => {
                if (typeof entry === 'string') {
                    const id = entry.trim();
                    if (!id) return null;
                    return { id, displayName: id, isActive: true, isUserVisible: true };
                }
                if (!entry || typeof entry !== 'object') return null;
                const id = String(entry.id || entry.model || entry.name || '').trim();
                if (!id) return null;
                const displayName = String(entry.displayName || entry.display_name || entry.label || entry.name || id).trim() || id;
                return {
                    id,
                    displayName,
                    isActive: entry.isActive !== false,
                    isUserVisible: entry.isUserVisible !== false
                };
            })
            .filter(Boolean);
    }

    return {
        fetchProviders,
        normalizeModelOptions
    };
}

