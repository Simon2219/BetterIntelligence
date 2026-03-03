function createCatalogReadWriteApi({ run, all, get, deriveModelDisplayName }) {
    function getByProviderAndModel(providerName, modelId) {
        const provider = String(providerName || '').trim().toLowerCase();
        const id = String(modelId || '').trim();
        if (!provider || !id) return null;
        return get('SELECT * FROM ai_provider_models WHERE provider_name = ? AND model_id = ?', [provider, id]) || null;
    }

    function upsertModel(providerName, modelId, data = {}) {
        const provider = String(providerName || '').trim().toLowerCase();
        const id = String(modelId || '').trim();
        if (!provider || !id) return null;
        const existing = getByProviderAndModel(provider, id);
        const hasDisplayNameUpdate = Object.prototype.hasOwnProperty.call(data, 'displayName');
        let displayName = '';
        if (hasDisplayNameUpdate) {
            const requestedDisplayName = String(data.displayName || '').trim();
            displayName = requestedDisplayName || String(existing?.display_name || '').trim() || deriveModelDisplayName(id) || id;
        } else {
            displayName = String(existing?.display_name || '').trim() || deriveModelDisplayName(id) || id;
        }

        const modelType = data.modelType === 'image' ? 'image' : 'text';
        let existingMetadata = {};
        try { existingMetadata = JSON.parse(existing?.metadata || '{}') || {}; } catch {}
        const metadata = JSON.stringify({ ...existingMetadata, ...(data.metadata || {}) });
        const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : ((existing?.is_active ?? 1) ? 1 : 0);
        const isUserVisible = data.isUserVisible !== undefined ? (data.isUserVisible ? 1 : 0) : ((existing?.is_user_visible ?? 1) ? 1 : 0);
        const isInternal = data.isInternal !== undefined ? (data.isInternal ? 1 : 0) : ((existing?.is_internal ?? 0) ? 1 : 0);
        const installPath = data.installPath !== undefined ? String(data.installPath || '') : String(existing?.install_path || '');

        if (existing) {
            run(`UPDATE ai_provider_models
                SET display_name = ?, model_type = ?, metadata = ?, install_path = ?, is_active = ?, is_user_visible = ?, is_internal = ?,
                    updated_at = datetime('now'), last_seen_at = datetime('now')
                WHERE id = ?`,
            [displayName, modelType, metadata, installPath, isActive, isUserVisible, isInternal, existing.id]);
        } else {
            run(`INSERT INTO ai_provider_models (
                provider_name, model_id, display_name, model_type, metadata, install_path, is_active, is_user_visible, is_internal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [provider, id, displayName, modelType, metadata, installPath, isActive, isUserVisible, isInternal]);
        }
        return getByProviderAndModel(provider, id);
    }

    function getDisplayName(providerName, modelId, opts = {}) {
        const provider = String(providerName || '').trim().toLowerCase();
        const id = String(modelId || '').trim();
        if (!id) return '';
        if (!provider) return deriveModelDisplayName(id);

        const row = getByProviderAndModel(provider, id);
        if (row?.display_name) return row.display_name;

        const derived = deriveModelDisplayName(id);
        if (opts.persistIfMissing) {
            upsertModel(provider, id, {
                displayName: derived,
                modelType: opts.modelType === 'image' ? 'image' : 'text'
            });
        }
        return derived;
    }

    function syncProviderModels(providerName, models, opts = {}) {
        const provider = String(providerName || '').trim().toLowerCase();
        if (!provider) return [];
        const modelType = opts.modelType === 'image' ? 'image' : 'text';
        const list = Array.isArray(models) ? models : [];

        return list.map((entry) => {
            const base = {
                modelType,
                metadata: opts.metadata || {},
                installPath: opts.installPath,
                isActive: opts.isActive,
                isUserVisible: opts.isUserVisible,
                isInternal: opts.isInternal
            };
            if (typeof entry === 'string') {
                const row = upsertModel(provider, entry, base);
                return {
                    id: entry,
                    displayName: row?.display_name || deriveModelDisplayName(entry),
                    modelType: row?.model_type || modelType,
                    isActive: (row?.is_active ?? 1) === 1,
                    isUserVisible: (row?.is_user_visible ?? 1) === 1,
                    isInternal: (row?.is_internal ?? 0) === 1
                };
            }

            const modelId = String(entry?.id || entry?.model || entry?.name || '').trim();
            if (!modelId) return null;
            const hasExplicitDisplayName = Object.prototype.hasOwnProperty.call(entry || {}, 'displayName')
                || Object.prototype.hasOwnProperty.call(entry || {}, 'display_name');
            const explicitDisplayName = hasExplicitDisplayName
                ? String(entry?.displayName ?? entry?.display_name ?? '').trim()
                : undefined;

            const row = upsertModel(provider, modelId, {
                ...base,
                ...(hasExplicitDisplayName ? { displayName: explicitDisplayName } : {}),
                metadata: { ...(base.metadata || {}), ...(entry?.metadata || {}) },
                installPath: entry?.installPath !== undefined ? entry.installPath : base.installPath,
                isActive: entry?.isActive !== undefined ? entry.isActive : base.isActive,
                isUserVisible: entry?.isUserVisible !== undefined ? entry.isUserVisible : base.isUserVisible,
                isInternal: entry?.isInternal !== undefined ? entry.isInternal : base.isInternal
            });
            return {
                id: modelId,
                displayName: row?.display_name || explicitDisplayName || deriveModelDisplayName(modelId),
                modelType: row?.model_type || modelType,
                isActive: (row?.is_active ?? 1) === 1,
                isUserVisible: (row?.is_user_visible ?? 1) === 1,
                isInternal: (row?.is_internal ?? 0) === 1
            };
        }).filter(Boolean);
    }

    function listModels(filters = {}) {
        const clauses = [];
        const params = [];
        if (filters.providerName) {
            clauses.push('provider_name = ?');
            params.push(String(filters.providerName).trim().toLowerCase());
        }
        if (filters.modelType) {
            clauses.push('model_type = ?');
            params.push(filters.modelType === 'image' ? 'image' : 'text');
        }
        if (filters.onlyActive) clauses.push('is_active = 1');
        if (filters.onlyUserVisible) clauses.push('is_user_visible = 1');
        if (filters.excludeInternal) clauses.push('is_internal = 0');

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = Number.isFinite(Number(filters.limit)) ? Number(filters.limit) : null;
        const sql = `SELECT * FROM ai_provider_models ${where} ORDER BY provider_name ASC, model_type ASC, display_name COLLATE NOCASE ASC${limit ? ' LIMIT ?' : ''}`;
        return limit ? all(sql, [...params, limit]) : all(sql, params);
    }

    function listByProvider(providerName, filters = {}) {
        return listModels({ ...filters, providerName });
    }

    function setModelState(providerName, modelId, updates = {}) {
        const provider = String(providerName || '').trim().toLowerCase();
        const id = String(modelId || '').trim();
        if (!provider || !id) return null;
        const existing = getByProviderAndModel(provider, id);
        if (!existing) return null;

        return upsertModel(provider, id, {
            displayName: updates.displayName !== undefined ? updates.displayName : existing.display_name,
            modelType: updates.modelType !== undefined ? updates.modelType : existing.model_type,
            metadata: updates.metadata !== undefined ? updates.metadata : (() => {
                try { return JSON.parse(existing.metadata || '{}') || {}; } catch { return {}; }
            })(),
            installPath: updates.installPath !== undefined ? updates.installPath : existing.install_path,
            isActive: updates.isActive !== undefined ? !!updates.isActive : existing.is_active === 1,
            isUserVisible: updates.isUserVisible !== undefined ? !!updates.isUserVisible : existing.is_user_visible === 1,
            isInternal: updates.isInternal !== undefined ? !!updates.isInternal : existing.is_internal === 1
        });
    }

    return {
        getByProviderAndModel,
        upsertModel,
        getDisplayName,
        syncProviderModels,
        listModels,
        listByProvider,
        setModelState
    };
}

module.exports = {
    createCatalogReadWriteApi
};
