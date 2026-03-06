export function bindModelsTabEvents({
    content,
    uiState,
    modelsByKey,
    decodeModelKey,
    confirmDialog,
    applyUsageTileMode,
    getUsageTileMode,
    api,
    showToast,
    renderModelsTab
}) {
    content.querySelectorAll('[data-model-mode]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            uiState.modelsSubView = btn.dataset.modelMode === 'stats' ? 'stats' : 'config';
            await renderModelsTab(content);
        });
    });

    content.querySelector('#admin-models-usage-window')?.addEventListener('change', async (event) => {
        uiState.modelCatalogUsageDays = parseInt(event.target.value, 10) || 30;
        await renderModelsTab(content);
    });

    content.querySelectorAll('[data-usage-tile]').forEach((tile) => {
        const tileId = tile.dataset.usageTile || '';
        if (!tileId) return;
        applyUsageTileMode(tile, getUsageTileMode(tileId));
        tile.addEventListener('click', () => {
            const current = getUsageTileMode(tileId);
            const next = current === 'split' ? 'total' : 'split';
            uiState.usageTileModes[tileId] = next;
            applyUsageTileMode(tile, next);
        });
    });

    content.querySelectorAll('[data-provider-edit-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const providerKey = btn.dataset.providerEditToggle || '';
            if (!providerKey) return;
            content.querySelectorAll('[data-provider-edit-inline]').forEach((row) => {
                const rowKey = row.dataset.providerEditInline || '';
                if (rowKey !== providerKey) {
                    row.hidden = true;
                    const view = content.querySelector(`[data-provider-view="${rowKey}"]`);
                    if (view) view.hidden = false;
                }
            });
            const viewRow = content.querySelector(`[data-provider-view="${providerKey}"]`);
            const inlineRow = content.querySelector(`[data-provider-edit-inline="${providerKey}"]`);
            if (!inlineRow) return;
            const shouldOpen = inlineRow.hidden;
            inlineRow.hidden = !shouldOpen;
            if (viewRow) viewRow.hidden = shouldOpen;
            if (shouldOpen) {
                const input = inlineRow.querySelector('[data-provider-display]');
                input?.focus();
                input?.select();
            }
        });
    });

    content.querySelectorAll('[data-provider-edit-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const providerKey = btn.dataset.providerEditCancel || '';
            if (!providerKey) return;
            const viewRow = content.querySelector(`[data-provider-view="${providerKey}"]`);
            const inlineRow = content.querySelector(`[data-provider-edit-inline="${providerKey}"]`);
            if (inlineRow) inlineRow.hidden = true;
            if (viewRow) viewRow.hidden = false;
        });
    });

    content.querySelectorAll('[data-provider-display]').forEach((input) => {
        input.addEventListener('keydown', (event) => {
            const providerKey = input.dataset.providerDisplay || '';
            if (!providerKey) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                content.querySelector(`[data-provider-edit-cancel="${providerKey}"]`)?.click();
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                content.querySelector(`[data-provider-save-name="${providerKey}"]`)?.click();
            }
        });
    });

    content.querySelectorAll('[data-model-edit-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modelKey = btn.dataset.modelEditToggle || '';
            if (!modelKey) return;
            content.querySelectorAll('[data-model-edit-inline]').forEach((row) => {
                const rowKey = row.dataset.modelEditInline || '';
                if (rowKey !== modelKey) {
                    row.hidden = true;
                    const view = content.querySelector(`[data-model-view="${rowKey}"]`);
                    if (view) view.hidden = false;
                }
            });
            const viewRow = content.querySelector(`[data-model-view="${modelKey}"]`);
            const inlineRow = content.querySelector(`[data-model-edit-inline="${modelKey}"]`);
            if (!inlineRow) return;
            const shouldOpen = inlineRow.hidden;
            inlineRow.hidden = !shouldOpen;
            if (viewRow) viewRow.hidden = shouldOpen;
            if (shouldOpen) {
                const input = inlineRow.querySelector('[data-model-display]');
                input?.focus();
                input?.select();
            }
        });
    });

    content.querySelectorAll('[data-model-edit-cancel]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const modelKey = btn.dataset.modelEditCancel || '';
            if (!modelKey) return;
            const viewRow = content.querySelector(`[data-model-view="${modelKey}"]`);
            const inlineRow = content.querySelector(`[data-model-edit-inline="${modelKey}"]`);
            if (inlineRow) {
                const input = inlineRow.querySelector('[data-model-display]');
                if (input && input.dataset.originalName) input.value = input.dataset.originalName;
                inlineRow.hidden = true;
            }
            if (viewRow) viewRow.hidden = false;
        });
    });

    content.querySelectorAll('[data-model-display]').forEach((input) => {
        input.addEventListener('keydown', (event) => {
            const key = input.dataset.modelDisplay || '';
            if (!key) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                content.querySelector(`[data-model-edit-cancel="${key}"]`)?.click();
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                content.querySelector(`[data-model-save-name="${key}"]`)?.click();
            }
        });
    });

    content.querySelectorAll('[data-model-save-name]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.modelSaveName;
            const selected = decodeModelKey(key);
            if (!selected) return;
            const displayName = content.querySelector(`[data-model-display="${key}"]`)?.value?.trim() || '';
            try {
                await api(`/admin/models/${encodeURIComponent(selected.providerName)}/${encodeURIComponent(selected.modelId)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ displayName })
                });
                showToast('Display name updated', 'success');
                await renderModelsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    content.querySelectorAll('[data-provider-save-name]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const providerKey = btn.dataset.providerSaveName || '';
            const providerName = providerKey ? decodeURIComponent(providerKey) : '';
            if (!providerName) return;
            const displayName = content.querySelector(`[data-provider-display="${providerKey}"]`)?.value?.trim() || '';
            try {
                await api(`/admin/models/providers/${encodeURIComponent(providerName)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ displayName })
                });
                showToast('Provider display name updated', 'success');
                await renderModelsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    content.querySelectorAll('[data-model-toggle-active]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.modelToggleActive;
            const selected = decodeModelKey(key);
            const current = modelsByKey.get(key);
            if (!selected || !current) return;
            const nextState = !current.isActive;
            const ok = await confirmDialog({
                title: `${nextState ? 'Activate' : 'Deactivate'} Model`,
                message: `${nextState ? 'Activate' : 'Deactivate'} "${current.displayName || current.modelId}" for backend runtime usage?`,
                confirmText: nextState ? 'Activate' : 'Deactivate',
                danger: !nextState
            });
            if (!ok) return;

            try {
                await api(`/admin/models/${encodeURIComponent(selected.providerName)}/${encodeURIComponent(selected.modelId)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isActive: nextState })
                });
                showToast(`Model ${nextState ? 'activated' : 'deactivated'}`, 'success');
                await renderModelsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    content.querySelectorAll('[data-model-toggle-visible]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.modelToggleVisible;
            const selected = decodeModelKey(key);
            const current = modelsByKey.get(key);
            if (!selected || !current) return;
            const nextState = !current.isUserVisible;
            const ok = await confirmDialog({
                title: `${nextState ? 'Show' : 'Hide'} Model`,
                message: `${nextState ? 'Expose' : 'Hide'} "${current.displayName || current.modelId}" for users in Agent Builder and chat views?`,
                confirmText: nextState ? 'Show' : 'Hide',
                danger: !nextState
            });
            if (!ok) return;

            try {
                await api(`/admin/models/${encodeURIComponent(selected.providerName)}/${encodeURIComponent(selected.modelId)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isUserVisible: nextState })
                });
                showToast(`Model is now ${nextState ? 'visible' : 'hidden'}`, 'success');
                await renderModelsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    content.querySelectorAll('[data-model-open-stats]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            uiState.selectedModelKey = btn.dataset.modelOpenStats;
            uiState.modelsSubView = 'stats';
            uiState.modelUsageMetric = null;
            await renderModelsTab(content);
        });
    });

    content.querySelectorAll('[data-model-pick]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const nextKey = btn.dataset.modelPick;
            if (uiState.selectedModelKey !== nextKey) uiState.modelUsageMetric = null;
            uiState.selectedModelKey = nextKey;
            await renderModelsTab(content);
        });
    });

    content.querySelector('#admin-model-clear-selection')?.addEventListener('click', async () => {
        uiState.selectedModelKey = null;
        uiState.modelUsageMetric = null;
        await renderModelsTab(content);
    });

    content.querySelector('#admin-model-days')?.addEventListener('change', async (event) => {
        uiState.modelUsageDays = parseInt(event.target.value, 10) || 30;
        await renderModelsTab(content);
    });

    content.querySelector('#admin-model-bucket')?.addEventListener('change', async (event) => {
        uiState.modelUsageBucket = event.target.value === 'hour' ? 'hour' : 'day';
        await renderModelsTab(content);
    });

    content.querySelectorAll('[data-usage-metric]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const metric = btn.dataset.usageMetric || null;
            if (!metric) return;
            uiState.modelUsageMetric = uiState.modelUsageMetric === metric ? null : metric;
            await renderModelsTab(content);
        });
    });
}

