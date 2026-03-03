
export function createAdminView(deps) {
    const { api, showToast, showConfirm, escapeHtml, applyAppearance, appearanceClient, getSocketClients } = deps;

    const {
        fetchAdminPalettes,
        createPalette,
        updatePalette,
        deletePalette,
        reorderPalettes,
        updatePaletteAssignments
    } = appearanceClient || {};

    const ADMIN_COLOR_KEYS = [
        'bg-primary', 'bg-secondary', 'bg-card', 'bg-hover',
        'text-primary', 'text-secondary', 'text-muted',
        'accent', 'accent-primary', 'accent-secondary', 'accent-hover',
        'success', 'danger', 'warning', 'info', 'border'
    ];

    const uiState = {
        activeTab: 'dashboard',
        previewTheme: document.documentElement.getAttribute('data-theme') || 'dark',
        selectedPaletteId: null,
        paletteListCollapsed: false,
        showNewPaletteForm: false,
        newPaletteName: '',
        colorDraft: {},
        colorDraftPaletteId: null,
        assignmentDraft: { dark: null, light: null },
        modelsSubView: 'config',
        modelUsageDays: 30,
        modelCatalogUsageDays: 30,
        modelUsageBucket: 'day',
        modelUsageMetric: null,
        selectedModelKey: null,
        modelsCatalogSynced: false,
        usageTileModes: {}
    };
    let adminRealtimeSocket = null;
    let adminRealtimeBound = false;
    let modelRealtimeRefreshTimer = null;

    function scheduleModelsRealtimeRefresh(content) {
        if (modelRealtimeRefreshTimer) window.clearTimeout(modelRealtimeRefreshTimer);
        modelRealtimeRefreshTimer = window.setTimeout(async () => {
            if (uiState.activeTab !== 'models') return;
            try {
                await renderModelsTab(content);
            } catch (err) {
                console.warn('Failed to refresh models tab from realtime update', err);
            }
        }, 220);
    }

    function bindModelsRealtime(content) {
        if (typeof getSocketClients !== 'function') return;
        const clients = getSocketClients();
        const socket = clients?.getAdminSocket?.();
        if (!socket) return;

        if (adminRealtimeSocket !== socket) {
            adminRealtimeSocket = socket;
            adminRealtimeBound = false;
        }

        if (adminRealtimeBound) {
            socket.emit('admin:model_status:subscribe', {});
            return;
        }

        adminRealtimeBound = true;
        socket.on('connect', () => socket.emit('admin:model_status:subscribe', {}));
        socket.on('admin:model_status:update', () => scheduleModelsRealtimeRefresh(content));
        socket.on('admin:model_usage:update', () => scheduleModelsRealtimeRefresh(content));
        socket.on('admin:provider_status:update', () => scheduleModelsRealtimeRefresh(content));
        socket.emit('admin:model_status:subscribe', {});
    }

    function formatNumber(value) {
        const num = Number(value) || 0;
        return num.toLocaleString();
    }

    function formatCompactNumber(value) {
        const num = Number(value) || 0;
        const abs = Math.abs(num);
        if (abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
        if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
        if (abs >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
        return formatNumber(num);
    }

    function normalizeUsageTileMode(mode) {
        return mode === 'total' ? 'total' : 'split';
    }

    function getUsageTileMode(tileId) {
        return normalizeUsageTileMode(uiState.usageTileModes[tileId]);
    }

    function applyUsageTileMode(tileEl, mode) {
        const normalized = normalizeUsageTileMode(mode);
        tileEl.dataset.usageMode = normalized;
        tileEl.classList.toggle('is-split', normalized === 'split');
        tileEl.classList.toggle('is-total', normalized === 'total');
        tileEl.setAttribute('aria-pressed', normalized === 'total' ? 'true' : 'false');
    }

    function renderSplitValueTile({ label, userValue, internalValue, className = '', tileId = '' }) {
        const user = Number(userValue) || 0;
        const internal = Number(internalValue) || 0;
        const total = user + internal;
        const resolvedTileId = String(tileId || `${label}-${className || 'tile'}`);
        const mode = getUsageTileMode(resolvedTileId);
        return `
            <button
                type="button"
                class="admin-model-stat admin-model-stat--volume admin-model-stat--split admin-model-stat--toggle ${escapeHtml(className)} ${mode === 'total' ? 'is-total' : 'is-split'}"
                data-usage-tile="${escapeHtml(resolvedTileId)}"
                data-usage-mode="${escapeHtml(mode)}"
                aria-pressed="${mode === 'total' ? 'true' : 'false'}"
                aria-label="${escapeHtml(label)} statistic tile"
            >
                <span class="admin-model-stat__label">${escapeHtml(label)}</span>
                <div class="admin-model-stat__split-grid">
                    <div class="admin-model-stat__split-cell admin-model-stat__split-cell--user">
                        <strong>${formatCompactNumber(user)}</strong>
                    </div>
                    <div class="admin-model-stat__split-cell admin-model-stat__split-cell--internal">
                        <strong>${formatCompactNumber(internal)}</strong>
                    </div>
                </div>
                <span class="admin-model-stat__total-value">${formatCompactNumber(total)}</span>
                <span class="admin-model-stat__split-pill" aria-hidden="true"><span>User</span><span>Internal</span></span>
                <span class="admin-model-stat__total-pill" aria-hidden="true">Total</span>
            </button>
        `;
    }

    function toPeriodKeyUtc(date, bucket) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        if (bucket === 'hour') {
            const h = String(date.getUTCHours()).padStart(2, '0');
            return `${y}-${m}-${d} ${h}:00`;
        }
        return `${y}-${m}-${d}`;
    }

    function buildUsageTimeline(points, usageMeta, bucket, days) {
        const safeBucket = bucket === 'hour' ? 'hour' : 'day';
        const now = new Date();
        const sinceDate = usageMeta?.since ? new Date(usageMeta.since) : new Date(now.getTime() - ((days || 30) * 86400000));
        const start = Number.isNaN(sinceDate.getTime()) ? new Date(now.getTime() - ((days || 30) * 86400000)) : sinceDate;
        if (safeBucket === 'hour') {
            start.setUTCMinutes(0, 0, 0);
            now.setUTCMinutes(0, 0, 0);
        } else {
            start.setUTCHours(0, 0, 0, 0);
            now.setUTCHours(0, 0, 0, 0);
        }

        const stepMs = safeBucket === 'hour' ? 3600000 : 86400000;
        const byPeriod = new Map((points || []).map((p) => [String(p.period || ''), p]));
        const full = [];
        for (let t = start.getTime(); t <= now.getTime(); t += stepMs) {
            const key = toPeriodKeyUtc(new Date(t), safeBucket);
            const found = byPeriod.get(key) || {};
            full.push({
                period: key,
                requests: Number(found.requests) || 0,
                totalTokens: Number(found.totalTokens) || 0,
                errorCount: Number(found.errorCount) || 0
            });
        }
        return full;
    }

    function periodLabel(period, bucket) {
        const text = String(period || '');
        if (bucket === 'hour') return text.slice(5).replace(':00', 'h');
        return text.slice(5);
    }

    function encodeModelKey(providerName, modelId) {
        return `${encodeURIComponent(String(providerName || '').trim())}::${encodeURIComponent(String(modelId || '').trim())}`;
    }

    function decodeModelKey(modelKey) {
        if (!modelKey || !modelKey.includes('::')) return null;
        const [providerPart, modelPart] = modelKey.split('::');
        return {
            providerName: decodeURIComponent(providerPart || ''),
            modelId: decodeURIComponent(modelPart || '')
        };
    }

    async function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
        if (typeof showConfirm === 'function') {
            return showConfirm({
                title,
                message,
                confirmText,
                cancelText: 'Cancel',
                danger
            });
        }
        return window.confirm(`${title}\n\n${message}`);
    }

    function palettePreviewSwatches(palette) {
        const keys = ['bg-primary', 'bg-card', 'accent', 'text-primary'];
        return keys.map((k) => {
            const color = String(palette?.colors?.[k] || '#000000');
            return `<span class="admin-palette__swatch" style="background:${escapeHtml(color)}"></span>`;
        }).join('');
    }

    function normalizeHex(value) {
        const v = String(value || '').trim();
        return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
    }

    function colorInputRow(key, value) {
        return `
            <div class="admin-color-row" data-color-row="${escapeHtml(key)}">
                <button type="button" class="admin-color-row__swatch" data-swatch-btn="${escapeHtml(key)}" style="background:${escapeHtml(value)}" title="Pick color"></button>
                <div class="admin-color-row__meta">
                    <label class="admin-color-row__label">${escapeHtml(key)}</label>
                    <button type="button" class="admin-color-row__pick-btn" data-open-picker="${escapeHtml(key)}">Picker</button>
                </div>
                <input type="text" class="form-input form-input--sm admin-color-row__hex" data-color-key="${escapeHtml(key)}" value="${escapeHtml(value)}" />
                <div class="admin-color-row__popover" data-color-popover="${escapeHtml(key)}" role="dialog" aria-label="${escapeHtml(key)} picker">
                    <div class="admin-color-row__popover-header">
                        <span class="admin-color-row__popover-title">Select ${escapeHtml(key)}</span>
                        <button type="button" class="admin-color-row__popover-close" data-close-picker="${escapeHtml(key)}">Done</button>
                    </div>
                    <input type="color" class="admin-color-row__picker" data-color-picker="${escapeHtml(key)}" value="${escapeHtml(value)}" aria-label="${escapeHtml(key)} color" />
                </div>
            </div>
        `;
    }

    function bindPaletteDnD(container, palettes, onReordered) {
        const rows = [...container.querySelectorAll('.admin-palette')];
        rows.forEach((row) => {
            row.addEventListener('dragstart', (event) => {
                row.classList.add('admin-palette--dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', row.dataset.paletteId || '');
            });
            row.addEventListener('dragend', () => row.classList.remove('admin-palette--dragging'));
            row.addEventListener('dragover', (event) => {
                event.preventDefault();
                row.classList.add('admin-palette--over');
            });
            row.addEventListener('dragleave', () => row.classList.remove('admin-palette--over'));
            row.addEventListener('drop', (event) => {
                event.preventDefault();
                row.classList.remove('admin-palette--over');
                const fromId = event.dataTransfer.getData('text/plain');
                const toId = row.dataset.paletteId;
                if (!fromId || !toId || fromId === toId) return;

                const next = palettes.slice();
                const from = next.findIndex((p) => p.id === fromId);
                const to = next.findIndex((p) => p.id === toId);
                if (from < 0 || to < 0) return;

                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                onReordered(next);
            });
        });
    }

    async function renderColorsTab(content) {
        if (!fetchAdminPalettes || !updatePalette || !createPalette || !deletePalette || !reorderPalettes || !updatePaletteAssignments) {
            content.innerHTML = '<p class="text-danger">Appearance client bindings are missing.</p>';
            return;
        }

        const payload = await fetchAdminPalettes(api);
        const palettes = Array.isArray(payload?.palettes) ? payload.palettes : [];
        const assignments = payload?.assignments || { dark: null, light: null };

        if (!palettes.length) {
            content.innerHTML = '<p class="text-muted">No palettes available.</p>';
            return;
        }

        if (!uiState.selectedPaletteId || !palettes.some((p) => p.id === uiState.selectedPaletteId)) {
            uiState.selectedPaletteId = palettes[0].id;
        }

        const selected = palettes.find((p) => p.id === uiState.selectedPaletteId) || palettes[0];
        if (!selected) {
            content.innerHTML = '<p class="text-muted">No palettes available.</p>';
            return;
        }

        if (uiState.colorDraftPaletteId !== selected.id) {
            uiState.colorDraft = {};
            ADMIN_COLOR_KEYS.forEach((key) => {
                uiState.colorDraft[key] = selected?.colors?.[key] || '#000000';
            });
            uiState.colorDraftPaletteId = selected.id;
        }

        if (!palettes.some((p) => p.id === uiState.assignmentDraft.dark)) {
            uiState.assignmentDraft.dark = assignments.dark || palettes[0].id;
        }
        if (!palettes.some((p) => p.id === uiState.assignmentDraft.light)) {
            uiState.assignmentDraft.light = assignments.light || palettes[0].id;
        }

        function assignmentTiles(themeKey) {
            const selectedId = uiState.assignmentDraft[themeKey];
            return palettes.map((palette) => `
                <button
                    type="button"
                    class="admin-assignment-tile ${selectedId === palette.id ? 'admin-assignment-tile--active' : ''}"
                    data-assignment-theme="${themeKey}"
                    data-assignment-palette="${escapeHtml(palette.id)}"
                >
                    <span class="admin-assignment-tile__name">${escapeHtml(palette.name)}</span>
                    <span class="admin-assignment-tile__swatches">${palettePreviewSwatches(palette)}</span>
                </button>
            `).join('');
        }

        content.innerHTML = `
            <div class="admin-colors">
                <section class="admin-card">
                    <div class="admin-card__header">
                        <h3>Theme Assignments</h3>
                        <div class="admin-card__actions">
                            <div class="admin-theme-switch" role="tablist" aria-label="Preview theme">
                                <button type="button" class="admin-theme-switch__btn ${uiState.previewTheme === 'dark' ? 'admin-theme-switch__btn--active' : ''}" data-theme-btn="dark">Dark</button>
                                <button type="button" class="admin-theme-switch__btn ${uiState.previewTheme === 'light' ? 'admin-theme-switch__btn--active' : ''}" data-theme-btn="light">Light</button>
                            </div>
                        </div>
                    </div>
                    <div class="admin-assignments">
                        <div class="admin-assignments__group">
                            <label class="admin-models__label">Dark Theme Palette</label>
                            <div class="admin-assignments__tiles">
                                ${assignmentTiles('dark')}
                            </div>
                        </div>
                        <div class="admin-assignments__group">
                            <label class="admin-models__label">Light Theme Palette</label>
                            <div class="admin-assignments__tiles">
                                ${assignmentTiles('light')}
                            </div>
                        </div>
                        <div class="admin-assignments__actions">
                            <button type="button" class="btn btn-tonal btn-sm" id="assign-both-btn">Use Active Palette For Both</button>
                            <button type="button" class="btn btn-primary btn-sm" id="save-assignments-btn">Save Assignments</button>
                        </div>
                    </div>
                </section>

                <section class="admin-card">
                    <div class="admin-card__header">
                        <h3>Palette Editor</h3>
                        <div class="admin-card__actions">
                            <button type="button" class="btn btn-tonal btn-sm" id="new-palette-toggle">New Palette</button>
                            <button type="button" class="btn btn-tonal btn-sm" id="toggle-palette-list">
                                ${uiState.paletteListCollapsed ? 'Show Saved Palettes' : 'Hide Saved Palettes'}
                            </button>
                        </div>
                    </div>

                    <section class="admin-editor-section">
                        <div class="admin-editor-section__header">
                            <h4>Saved Palettes</h4>
                        </div>
                        ${uiState.showNewPaletteForm ? `
                            <div class="admin-palette-create">
                                <input type="text" class="form-input" id="new-palette-name" placeholder="Palette name" value="${escapeHtml(uiState.newPaletteName || '')}">
                                <div class="admin-palette-create__actions">
                                    <button type="button" class="btn btn-primary btn-sm" id="create-palette-btn">Create</button>
                                    <button type="button" class="btn btn-tonal btn-sm" id="cancel-create-palette-btn">Cancel</button>
                                </div>
                            </div>
                        ` : ''}

                        <div class="admin-palette-list ${uiState.paletteListCollapsed ? 'admin-palette-list--collapsed' : ''}" id="palette-list">
                            ${palettes.map((palette) => `
                                <div class="admin-palette ${palette.id === selected.id ? 'admin-palette--active' : ''}" draggable="true" data-palette-id="${escapeHtml(palette.id)}">
                                    <button type="button" class="admin-palette__body" data-select-palette="${escapeHtml(palette.id)}">
                                        <span class="admin-palette__name">${escapeHtml(palette.name)}</span>
                                        <span class="admin-palette__swatches">${palettePreviewSwatches(palette)}</span>
                                    </button>
                                    ${palettes.length > 1 ? `<button type="button" class="admin-palette__delete" data-delete-palette="${escapeHtml(palette.id)}" title="Delete palette">x</button>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <div class="admin-palette-edit-name">
                        <div class="admin-models__label">Editing Palette</div>
                        <div class="admin-palette-edit-name__value">${escapeHtml(selected.name)}</div>
                    </div>

                    <div class="admin-color-grid">
                        ${ADMIN_COLOR_KEYS.map((key) => colorInputRow(key, uiState.colorDraft[key] || '#000000')).join('')}
                    </div>

                    <div class="admin-editor-actions">
                        <button type="button" class="btn btn-primary" id="save-palette-btn">Save Palette Colors</button>
                    </div>
                </section>
            </div>
        `;

        const paletteList = content.querySelector('#palette-list');
        if (paletteList) {
            bindPaletteDnD(paletteList, palettes, async (orderedPalettes) => {
                try {
                    await reorderPalettes(api, orderedPalettes.map((p) => p.id));
                    showToast('Palette order saved', 'success');
                    await renderColorsTab(content);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        }

        content.querySelector('#new-palette-toggle')?.addEventListener('click', async () => {
            uiState.showNewPaletteForm = !uiState.showNewPaletteForm;
            if (!uiState.showNewPaletteForm) uiState.newPaletteName = '';
            await renderColorsTab(content);
        });

        content.querySelector('#cancel-create-palette-btn')?.addEventListener('click', async () => {
            uiState.showNewPaletteForm = false;
            uiState.newPaletteName = '';
            await renderColorsTab(content);
        });

        content.querySelector('#create-palette-btn')?.addEventListener('click', async () => {
            const name = (content.querySelector('#new-palette-name')?.value || '').trim();
            if (!name) {
                showToast('Palette name is required', 'warning');
                return;
            }
            try {
                const result = await createPalette(api, { name, colors: selected.colors || {} });
                uiState.showNewPaletteForm = false;
                uiState.newPaletteName = '';
                uiState.selectedPaletteId = result?.palette?.id || result?.palettes?.[result.palettes.length - 1]?.id || uiState.selectedPaletteId;
                uiState.colorDraftPaletteId = null;
                await applyAppearance();
                showToast('Palette created', 'success');
                await renderColorsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        content.querySelector('#toggle-palette-list')?.addEventListener('click', async () => {
            uiState.paletteListCollapsed = !uiState.paletteListCollapsed;
            await renderColorsTab(content);
        });

        content.querySelectorAll('[data-select-palette]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const paletteId = btn.dataset.selectPalette;
                if (!paletteId || paletteId === uiState.selectedPaletteId) return;
                uiState.selectedPaletteId = paletteId;
                uiState.colorDraftPaletteId = null;
                await renderColorsTab(content);
            });
        });

        content.querySelectorAll('[data-delete-palette]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const paletteId = btn.dataset.deletePalette;
                if (!paletteId) return;
                const palette = palettes.find((p) => p.id === paletteId);
                const ok = await confirmDialog({
                    title: 'Delete Palette',
                    message: `Delete "${palette?.name || 'this palette'}"? This cannot be undone.`,
                    confirmText: 'Delete',
                    danger: true
                });
                if (!ok) return;
                try {
                    await deletePalette(api, paletteId);
                    if (uiState.selectedPaletteId === paletteId) {
                        uiState.selectedPaletteId = palettes.find((p) => p.id !== paletteId)?.id || null;
                        uiState.colorDraftPaletteId = null;
                    }
                    await applyAppearance();
                    showToast('Palette deleted', 'success');
                    await renderColorsTab(content);
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });

        content.querySelectorAll('[data-assignment-theme][data-assignment-palette]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.assignmentTheme === 'light' ? 'light' : 'dark';
                const paletteId = btn.dataset.assignmentPalette;
                if (!palettes.some((p) => p.id === paletteId)) return;
                uiState.assignmentDraft[theme] = paletteId;
                content.querySelectorAll(`[data-assignment-theme="${theme}"]`).forEach((tile) => {
                    tile.classList.toggle('admin-assignment-tile--active', tile.dataset.assignmentPalette === paletteId);
                });
            });
        });

        content.querySelector('#assign-both-btn')?.addEventListener('click', () => {
            uiState.assignmentDraft.dark = selected.id;
            uiState.assignmentDraft.light = selected.id;
            content.querySelectorAll('[data-assignment-theme]').forEach((tile) => {
                tile.classList.toggle('admin-assignment-tile--active', tile.dataset.assignmentPalette === selected.id);
            });
        });

        content.querySelector('#save-assignments-btn')?.addEventListener('click', async () => {
            try {
                await updatePaletteAssignments(api, uiState.assignmentDraft.dark, uiState.assignmentDraft.light);
                await applyAppearance();
                showToast('Theme assignments saved', 'success');
                await renderColorsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        content.querySelectorAll('[data-theme-btn]').forEach((button) => {
            button.addEventListener('click', async () => {
                uiState.previewTheme = button.dataset.themeBtn === 'light' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', uiState.previewTheme);
                await applyAppearance();
                await renderColorsTab(content);
            });
        });

        content.querySelectorAll('[data-color-key]').forEach((input) => {
            const key = input.dataset.colorKey;
            const picker = content.querySelector(`[data-color-picker="${key}"]`);
            const swatchBtn = content.querySelector(`[data-swatch-btn="${key}"]`);
            const openPickerBtn = content.querySelector(`[data-open-picker="${key}"]`);
            const closePickerBtn = content.querySelector(`[data-close-picker="${key}"]`);
            const popover = content.querySelector(`[data-color-popover="${key}"]`);

            const closePopover = () => popover?.classList.remove('admin-color-row__popover--open');
            const openPopover = () => {
                content.querySelectorAll('.admin-color-row__popover--open').forEach((el) => el.classList.remove('admin-color-row__popover--open'));
                popover?.classList.add('admin-color-row__popover--open');
            };

            swatchBtn?.addEventListener('click', () => openPopover());
            openPickerBtn?.addEventListener('click', () => openPopover());
            closePickerBtn?.addEventListener('click', () => closePopover());

            picker?.addEventListener('input', () => {
                input.value = picker.value;
                uiState.colorDraft[key] = picker.value;
                if (swatchBtn) swatchBtn.style.background = picker.value;
            });

            input.addEventListener('input', () => {
                const normalized = normalizeHex(input.value);
                if (!normalized) return;
                input.value = normalized;
                uiState.colorDraft[key] = normalized;
                if (picker) picker.value = normalized;
                if (swatchBtn) swatchBtn.style.background = normalized;
            });
        });

        content.querySelector('#save-palette-btn')?.addEventListener('click', async () => {
            try {
                await updatePalette(api, selected.id, { name: selected.name, colors: uiState.colorDraft });
                await applyAppearance();
                showToast('Palette saved', 'success');
                await renderColorsTab(content);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    async function renderModelsTab(content) {
        const allTimeDays = 3650;
        if (!uiState.modelsCatalogSynced) {
            try {
                await api('/admin/models/refresh', { method: 'POST', body: JSON.stringify({ days: allTimeDays }) });
            } catch (err) {
                console.warn('Failed to sync model catalog on load', err);
            } finally {
                uiState.modelsCatalogSynced = true;
            }
        }

        const { data } = await api(`/admin/models?days=${allTimeDays}`);
        const providers = data?.providers || [];
        const totals = data?.totals || {};
        const usageWindowDays = parseInt(uiState.modelCatalogUsageDays, 10) || 30;
        let usageTotals = totals;
        if (usageWindowDays !== allTimeDays) {
            try {
                const { data: windowedData } = await api(`/admin/models?days=${usageWindowDays}`);
                usageTotals = windowedData?.totals || usageTotals;
            } catch (err) {
                console.warn('Failed to load model usage timeframe totals', err);
            }
        }

        const modelsFlat = providers.flatMap((provider) =>
            (provider.models || []).map((model) => ({
                ...model,
                providerName: provider.name,
                providerDisplayName: provider.displayName || provider.name,
                endpointUrl: provider.endpointUrl || ''
            }))
        );

        const modelsByKey = new Map(modelsFlat.map((model) => [encodeModelKey(model.providerName, model.modelId), model]));
        if (uiState.selectedModelKey && !modelsByKey.has(uiState.selectedModelKey)) {
            uiState.selectedModelKey = null;
        }

        let usageHtml = '<div class="admin-model-usage-empty">Choose a model to load detailed statistics.</div>';
        if (uiState.modelsSubView === 'stats' && uiState.selectedModelKey) {
            const selected = decodeModelKey(uiState.selectedModelKey);
            if (selected?.providerName && selected?.modelId) {
                try {
                    const days = parseInt(uiState.modelUsageDays, 10) || 30;
                    const bucket = uiState.modelUsageBucket === 'hour' ? 'hour' : 'day';
                    const { data: usageData } = await api(`/admin/models/${encodeURIComponent(selected.providerName)}/${encodeURIComponent(selected.modelId)}/usage?days=${days}&bucket=${bucket}`);
                    const points = usageData?.usage?.points || [];
                    const totalsUsage = usageData?.usage?.totals || {};
                    const fullPoints = buildUsageTimeline(points, usageData?.usage, bucket, days);
                    const maxRequests = Math.max(...fullPoints.map((p) => p.requests || 0), 0);
                    const maxTokens = Math.max(...fullPoints.map((p) => p.totalTokens || 0), 0);
                    const maxErrors = Math.max(...fullPoints.map((p) => p.errorCount || 0), 0);
                    const metricMeta = {
                        requests: { label: 'Requests', value: (p) => p.requests || 0, max: maxRequests, className: 'requests' },
                        tokens: { label: 'Tokens', value: (p) => p.totalTokens || 0, max: maxTokens, className: 'tokens' },
                        errors: { label: 'Errors', value: (p) => p.errorCount || 0, max: maxErrors, className: 'errors' }
                    };
                    const activeMetric = ['requests', 'tokens', 'errors'].includes(uiState.modelUsageMetric) ? uiState.modelUsageMetric : null;
                    const hasAnyData = fullPoints.some((p) => (p.requests || 0) > 0 || (p.totalTokens || 0) > 0 || (p.errorCount || 0) > 0);

                    const chartHtml = (() => {
                        if (!activeMetric) {
                            return `
                                <div class="admin-model-chart ${!hasAnyData ? 'admin-model-chart--empty' : ''}">
                                    ${!hasAnyData ? '<div class="admin-model-chart__empty">No data available</div>' : ''}
                                    ${fullPoints.map((point) => {
                                        const req = point.requests || 0;
                                        const tok = point.totalTokens || 0;
                                        const err = point.errorCount || 0;
                                        const reqHeight = req > 0 && maxRequests > 0 ? Math.max(8, Math.round((req / maxRequests) * 100)) : 0;
                                        const tokHeight = tok > 0 && maxTokens > 0 ? Math.max(8, Math.round((tok / maxTokens) * 100)) : 0;
                                        const errHeight = err > 0 && maxErrors > 0 ? Math.max(8, Math.round((err / maxErrors) * 100)) : 0;
                                        return `
                                            <div class="admin-model-chart__bar-wrap" title="${escapeHtml(point.period)} • ${formatNumber(req)} requests • ${formatNumber(tok)} tokens • ${formatNumber(err)} errors">
                                                <div class="admin-model-chart__values">
                                                    ${req > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--requests">${formatCompactNumber(req)}</span>` : ''}
                                                    ${tok > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--tokens">${formatCompactNumber(tok)}</span>` : ''}
                                                    ${err > 0 ? `<span class="admin-model-chart__value admin-model-chart__value--errors">${formatCompactNumber(err)}</span>` : ''}
                                                </div>
                                                <div class="admin-model-chart__bars">
                                                    ${reqHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--requests" style="height:${reqHeight}%"></div>` : ''}
                                                    ${tokHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--tokens" style="height:${tokHeight}%"></div>` : ''}
                                                    ${errHeight > 0 ? `<div class="admin-model-chart__bar admin-model-chart__bar--errors" style="height:${errHeight}%"></div>` : ''}
                                                </div>
                                                <span class="admin-model-chart__label">${escapeHtml(periodLabel(point.period, bucket))}</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            `;
                        }

                        const meta = metricMeta[activeMetric];
                        const values = fullPoints.map((p) => meta.value(p));
                        const maxValue = meta.max || 0;
                        const hasMetricData = values.some((v) => v > 0);
                        const pointCount = fullPoints.length;
                        const chartWidth = Math.max(280, (pointCount - 1) * 28 + 48);
                        const svgWidth = chartWidth;
                        const svgHeight = 186;
                        const padL = 22;
                        const padR = 20;
                        const padT = 18;
                        const padB = 32;
                        const plotW = Math.max(1, svgWidth - padL - padR);
                        const plotH = Math.max(1, svgHeight - padT - padB);
                        const stride = pointCount > 120 ? Math.ceil(pointCount / 28) : pointCount > 70 ? Math.ceil(pointCount / 20) : 1;

                        const coords = fullPoints.map((p, idx) => {
                            const raw = meta.value(p);
                            const ratio = maxValue > 0 ? raw / maxValue : 0;
                            const x = padL + (pointCount > 1 ? (idx * plotW) / (pointCount - 1) : plotW / 2);
                            const y = padT + (1 - ratio) * plotH;
                            return { idx, x, y, raw, period: p.period };
                        });
                        const linePoints = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');

                        return `
                            <div class="admin-model-chart admin-model-chart--line ${!hasMetricData ? 'admin-model-chart--empty' : ''}">
                                ${!hasMetricData ? '<div class="admin-model-chart__empty">No data available</div>' : ''}
                                <div class="admin-model-line" style="width:${chartWidth}px">
                                    <svg class="admin-model-line__svg" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(meta.label)} line chart">
                                        <line class="admin-model-line__axis" x1="${padL}" y1="${svgHeight - padB}" x2="${svgWidth - padR}" y2="${svgHeight - padB}"></line>
                                        ${hasMetricData ? `<polyline class="admin-model-line__path admin-model-line__path--${meta.className}" points="${linePoints}"></polyline>` : ''}
                                        ${coords.map((c) => {
                                            if (!hasMetricData) return '';
                                            const showPoint = c.raw > 0 || c.idx % stride === 0;
                                            if (!showPoint) return '';
                                            const showValue = c.raw > 0 && (pointCount <= 80 || c.idx % stride === 0);
                                            return `
                                                <g class="admin-model-line__point-group admin-model-line__point-group--${meta.className}">
                                                    <circle class="admin-model-line__point" cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="2.8"></circle>
                                                    ${showValue ? `<text class="admin-model-line__value" x="${c.x.toFixed(2)}" y="${Math.max(10, c.y - 7).toFixed(2)}">${escapeHtml(formatCompactNumber(c.raw))}</text>` : ''}
                                                </g>
                                            `;
                                        }).join('')}
                                    </svg>
                                    <div class="admin-model-line__labels">
                                        ${coords.map((c) => `<span class="admin-model-line__label ${c.idx % stride === 0 ? '' : 'admin-model-line__label--muted'}">${c.idx % stride === 0 ? escapeHtml(periodLabel(c.period, bucket)) : ''}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        `;
                    })();

                    usageHtml = `
                        <div class="admin-model-usage">
                            <div class="admin-model-usage__header">
                                <h4>${escapeHtml(usageData?.model?.displayName || selected.modelId)}</h4>
                                <p>${escapeHtml(usageData?.model?.providerDisplayName || usageData?.model?.providerName || selected.providerName)} • ${escapeHtml(selected.modelId)}</p>
                            </div>
                            <div class="admin-model-usage__stats">
                                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--requests ${activeMetric === 'requests' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="requests" aria-pressed="${activeMetric === 'requests' ? 'true' : 'false'}">
                                    <span class="admin-model-usage-stat__label">Requests</span>
                                    <strong>${formatCompactNumber(totalsUsage.requests || 0)}</strong>
                                </button>
                                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--tokens ${activeMetric === 'tokens' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="tokens" aria-pressed="${activeMetric === 'tokens' ? 'true' : 'false'}">
                                    <span class="admin-model-usage-stat__label">Tokens</span>
                                    <strong>${formatCompactNumber(totalsUsage.totalTokens || 0)}</strong>
                                </button>
                                <button type="button" class="admin-model-usage-stat admin-model-usage-stat--errors ${activeMetric === 'errors' ? 'admin-model-usage-stat--active' : ''}" data-usage-metric="errors" aria-pressed="${activeMetric === 'errors' ? 'true' : 'false'}">
                                    <span class="admin-model-usage-stat__label">Errors</span>
                                    <strong>${formatCompactNumber(totalsUsage.errorCount || 0)}</strong>
                                </button>
                            </div>
                            ${chartHtml}
                        </div>
                    `;
                } catch (err) {
                    usageHtml = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
                }
            }
        }

        const modelPickerItems = modelsFlat
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
                            <span class="admin-model-picker__meta">${escapeHtml(model.providerDisplayName || model.providerName)} • ${escapeHtml(model.modelId)}</span>
                        </span>
                    </button>
                `;
            }).join('');

        content.innerHTML = `
            <div class="admin-models">
                <section class="admin-card admin-models__catalog">
                    <div class="admin-models__stats admin-models__stats--wide">
                        <div class="admin-models__stats-cluster admin-models__stats-cluster--health" aria-label="Catalog availability">
                            <div class="admin-models__stats-group admin-models__stats-group--compact">
                                <div class="admin-model-stat admin-model-stat--compact"><span class="admin-model-stat__label">Providers</span><strong>${formatNumber(totals.providerCount || 0)}</strong></div>
                                <div class="admin-model-stat admin-model-stat--compact"><span class="admin-model-stat__label">Models</span><strong>${formatNumber(totals.modelCount || 0)}</strong></div>
                                <div class="admin-model-stat admin-model-stat--compact"><span class="admin-model-stat__label">Online</span><strong>${formatNumber(totals.onlineProviderCount || 0)}</strong></div>
                                <div class="admin-model-stat admin-model-stat--compact"><span class="admin-model-stat__label">Active</span><strong>${formatNumber(totals.activeModelCount || 0)}</strong></div>
                                <div class="admin-model-stat admin-model-stat--compact"><span class="admin-model-stat__label">Visible</span><strong>${formatNumber(totals.visibleModelCount || 0)}</strong></div>
                            </div>
                        </div>
                        <div class="admin-models__stats-cluster admin-models__stats-cluster--usage" aria-label="Catalog usage">
                            <div class="admin-models__stats-cluster-head">
                                <span class="admin-models__stats-cluster-title">Model Usage</span>
                                <select id="admin-models-usage-window" class="form-input form-input--sm admin-models__usage-window">
                                    <option value="1" ${uiState.modelCatalogUsageDays === 1 ? 'selected' : ''}>24H</option>
                                    <option value="3" ${uiState.modelCatalogUsageDays === 3 ? 'selected' : ''}>3D</option>
                                    <option value="7" ${uiState.modelCatalogUsageDays === 7 ? 'selected' : ''}>7D</option>
                                    <option value="30" ${uiState.modelCatalogUsageDays === 30 ? 'selected' : ''}>1 Month</option>
                                    <option value="90" ${uiState.modelCatalogUsageDays === 90 ? 'selected' : ''}>3 Month</option>
                                    <option value="180" ${uiState.modelCatalogUsageDays === 180 ? 'selected' : ''}>6 Month</option>
                                    <option value="365" ${uiState.modelCatalogUsageDays === 365 ? 'selected' : ''}>1 Year</option>
                                </select>
                            </div>
                            <div class="admin-models__stats-group admin-models__stats-group--volume">
                                ${renderSplitValueTile({ label: 'Requests', userValue: usageTotals.userRequests, internalValue: usageTotals.internalRequests, tileId: 'catalog-requests' })}
                                ${renderSplitValueTile({ label: 'Prompt Tokens', userValue: usageTotals.userPromptTokens, internalValue: usageTotals.internalPromptTokens, tileId: 'catalog-prompt-tokens' })}
                                ${renderSplitValueTile({ label: 'Completion Tokens', userValue: usageTotals.userCompletionTokens, internalValue: usageTotals.internalCompletionTokens, tileId: 'catalog-completion-tokens' })}
                                ${renderSplitValueTile({ label: 'Errors', userValue: usageTotals.userErrorCount, internalValue: usageTotals.internalErrorCount, tileId: 'catalog-errors' })}
                            </div>
                        </div>
                    </div>
                </section>

                <div class="admin-models__mode-switch" role="tablist" aria-label="Model view selector">
                    <button type="button" class="admin-models__mode-btn ${uiState.modelsSubView === 'config' ? 'admin-models__mode-btn--active' : ''}" data-model-mode="config">Configuration</button>
                    <button type="button" class="admin-models__mode-btn ${uiState.modelsSubView === 'stats' ? 'admin-models__mode-btn--active' : ''}" data-model-mode="stats">Statistics</button>
                </div>

                ${uiState.modelsSubView === 'config' ? `
                    <section class="admin-card">
                        <div class="admin-card__header"><h3>Available Models</h3></div>
                        <div class="admin-model-providers">
                            ${providers.map((provider) => `
                                <article class="admin-model-provider">
                                    <header class="admin-model-provider__header">
                                        <div class="admin-model-provider__identity">
                                            <div class="admin-model-provider__title-row admin-model-provider__title-row--editable" data-provider-view="${encodeURIComponent(provider.name)}">
                                                <h4 data-provider-display-text="${encodeURIComponent(provider.name)}">${escapeHtml(provider.displayName || provider.name)}</h4>
                                                <button type="button" class="admin-provider-edit-btn" data-provider-edit-toggle="${encodeURIComponent(provider.name)}" title="Edit display name" aria-label="Edit display name">&#9998;</button>
                                            </div>
                                            <div class="admin-provider-edit-inline" data-provider-edit-inline="${encodeURIComponent(provider.name)}" hidden>
                                                <input type="text" class="form-input form-input--sm admin-model-row__display" data-provider-display="${encodeURIComponent(provider.name)}" value="${escapeHtml(provider.displayName || provider.name)}">
                                                <button type="button" class="btn btn-primary btn-sm" data-provider-save-name="${encodeURIComponent(provider.name)}">Save</button>
                                                <button type="button" class="btn btn-tonal btn-sm" data-provider-edit-cancel="${encodeURIComponent(provider.name)}">Cancel</button>
                                            </div>
                                        </div>
                                        <div class="admin-model-provider__status">
                                            <span class="badge ${provider.available ? 'badge-primary' : 'badge-ghost'}">${provider.available ? 'Online' : 'Offline'}</span>
                                            <div class="admin-model-provider__endpoint-line admin-model-provider__endpoint-line--header">
                                                <span class="admin-model-provider__endpoint-label">Connection</span>
                                                <code class="admin-model-provider__endpoint">${escapeHtml(provider.endpointUrl || 'No endpoint configured')}</code>
                                            </div>
                                        </div>
                                    </header>
                                    ${provider.error ? `<div class="admin-model-provider__summary"><p class="text-muted admin-model-provider__error">${escapeHtml(provider.error)}</p></div>` : ''}
                                    <div class="admin-model-provider__divider" aria-hidden="true"></div>
                                    <div class="admin-model-list">
                                        ${(() => {
                                            const models = Array.isArray(provider.models) ? provider.models.slice() : [];
                                            const byUsageThenName = (a, b) => {
                                                const requestsDelta = (b.usage?.requests || 0) - (a.usage?.requests || 0);
                                                if (requestsDelta !== 0) return requestsDelta;
                                                return String(a.displayName || a.modelId || '').localeCompare(String(b.displayName || b.modelId || ''));
                                            };
                                            const textModels = models.filter((model) => model.modelType !== 'image').sort(byUsageThenName);
                                            const imageModels = models.filter((model) => model.modelType === 'image').sort(byUsageThenName);
                                            const orderedModels = textModels.concat(imageModels);

                                            const renderRows = (list) => list.map((model) => {
                                                const typeKey = model.modelType === 'image' ? 'image' : 'text';
                                                const key = encodeModelKey(provider.name, model.modelId);
                                                const typeLabel = typeKey === 'image' ? 'Image' : 'Text';
                                                const modelDisplay = String(model.displayName || model.modelId || '');
                                                return `
                                                    <div class="admin-model-row" data-model-row="${key}">
                                                        <div class="admin-model-row__classification">
                                                            <span class="admin-model-type-rail admin-model-type-rail--${typeKey}">${typeLabel}</span>
                                                        </div>
                                                        <div class="admin-model-row__identity">
                                                            <div class="admin-model-row__title-row admin-model-row__title-row--editable" data-model-view="${key}">
                                                                <span class="admin-model-row__display-value">${escapeHtml(modelDisplay)}</span>
                                                                <button type="button" class="admin-model-edit-btn" data-model-edit-toggle="${key}" title="Edit display name" aria-label="Edit display name">&#9998;</button>
                                                            </div>
                                                            <div class="admin-model-row__edit-inline" data-model-edit-inline="${key}" hidden>
                                                                <input type="text" class="form-input form-input--sm admin-model-row__display" data-model-display="${key}" data-original-name="${escapeHtml(modelDisplay)}" value="${escapeHtml(modelDisplay)}">
                                                                <button type="button" class="btn btn-primary btn-sm" data-model-save-name="${key}">Save</button>
                                                                <button type="button" class="btn btn-tonal btn-sm" data-model-edit-cancel="${key}">Cancel</button>
                                                            </div>
                                                            <div class="admin-model-row__meta">
                                                                <span class="admin-model-row__id">${escapeHtml(model.modelId)}</span>
                                                            </div>
                                                        </div>
                                                        <div class="admin-model-row__usage">
                                                            <div class="admin-model-row__usage-grid">
                                                                ${renderSplitValueTile({
                                                                    label: 'Requests',
                                                                    userValue: model.usage?.userRequests || 0,
                                                                    internalValue: model.usage?.internalRequests || 0,
                                                                    className: 'admin-model-row__usage-stat',
                                                                    tileId: `${key}::requests`
                                                                })}
                                                                ${renderSplitValueTile({
                                                                    label: 'Tokens',
                                                                    userValue: model.usage?.userTotalTokens || 0,
                                                                    internalValue: model.usage?.internalTotalTokens || 0,
                                                                    className: 'admin-model-row__usage-stat',
                                                                    tileId: `${key}::tokens`
                                                                })}
                                                                ${renderSplitValueTile({
                                                                    label: 'Errors',
                                                                    userValue: model.usage?.userErrorCount || 0,
                                                                    internalValue: model.usage?.internalErrorCount || 0,
                                                                    className: 'admin-model-row__usage-stat',
                                                                    tileId: `${key}::errors`
                                                                })}
                                                            </div>
                                                            <div class="admin-model-row__usage-actions">
                                                                <button type="button" class="btn btn-tonal btn-sm" data-model-open-stats="${key}">View Stats</button>
                                                            </div>
                                                        </div>
                                                        <div class="admin-model-row__controls">
                                                            <span class="admin-model-row__label admin-model-row__label--lg">Status Controls</span>
                                                            <div class="admin-model-row__status-group">
                                                                <span class="admin-model-row__status-title">Runtime Mode</span>
                                                                <p class="admin-model-row__hint">Controls if this model can be used by backend execution.</p>
                                                                <div class="admin-model-row__statuses">
                                                                    <button type="button" class="admin-status-pill ${model.isActive ? 'admin-status-pill--on' : 'admin-status-pill--off'}" data-model-toggle-active="${key}"><span class="admin-status-pill__dot"></span>${model.isActive ? 'Active' : 'Inactive'}</button>
                                                                </div>
                                                            </div>
                                                            <div class="admin-model-row__status-group">
                                                                <span class="admin-model-row__status-title">Visibility Mode</span>
                                                                <p class="admin-model-row__hint">Controls if users can see this model in the UI.</p>
                                                                <div class="admin-model-row__statuses">
                                                                    <button type="button" class="admin-status-pill ${model.isUserVisible ? 'admin-status-pill--on' : 'admin-status-pill--off'}" data-model-toggle-visible="${key}"><span class="admin-status-pill__dot"></span>${model.isUserVisible ? 'Visible' : 'Hidden'}</button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                `;
                                            }).join('');

                                            return renderRows(orderedModels);
                                        })()}
                                    </div>
                                </article>
                            `).join('')}
                        </div>
                    </section>
                ` : `
                    <section class="admin-card">
                        <div class="admin-card__header admin-models__stats-header">
                            <h3 class="admin-models__stats-title">Model Statistics</h3>
                        </div>
                        <div class="admin-models__toolbar admin-models__toolbar--stats admin-models__toolbar--stats-inline">
                            <div class="admin-models__filters">
                                <div class="admin-models__filter">
                                    <label class="admin-models__label" for="admin-model-days">Window</label>
                                    <select id="admin-model-days" class="form-input form-input--sm">
                                        <option value="7" ${uiState.modelUsageDays === 7 ? 'selected' : ''}>7d</option>
                                        <option value="30" ${uiState.modelUsageDays === 30 ? 'selected' : ''}>30d</option>
                                        <option value="90" ${uiState.modelUsageDays === 90 ? 'selected' : ''}>90d</option>
                                        <option value="365" ${uiState.modelUsageDays === 365 ? 'selected' : ''}>365d</option>
                                    </select>
                                </div>
                                <div class="admin-models__filter">
                                    <label class="admin-models__label" for="admin-model-bucket">Scale</label>
                                    <select id="admin-model-bucket" class="form-input form-input--sm">
                                        <option value="day" ${uiState.modelUsageBucket === 'day' ? 'selected' : ''}>Day</option>
                                        <option value="hour" ${uiState.modelUsageBucket === 'hour' ? 'selected' : ''}>Hour</option>
                                    </select>
                                </div>
                            </div>
                            <button type="button" class="btn btn-tonal btn-sm" id="admin-model-clear-selection">Clear Selection</button>
                        </div>
                        <div class="admin-model-picker-wrap">
                            <div class="admin-model-picker admin-model-picker--centered">
                                ${modelPickerItems || '<p class="text-muted">No models available.</p>'}
                            </div>
                        </div>
                        <div class="admin-model-picker__divider" aria-hidden="true"></div>
                        <div id="admin-model-usage-content">${usageHtml}</div>
                    </section>
                `}
            </div>
        `;

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
                    if (input && input.dataset.originalName) {
                        input.value = input.dataset.originalName;
                    }
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
                if (uiState.selectedModelKey !== nextKey) {
                    uiState.modelUsageMetric = null;
                }
                uiState.selectedModelKey = btn.dataset.modelPick;
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

    async function renderTab(container, tab) {
        if (uiState.activeTab === 'models' && tab !== 'models') {
            adminRealtimeSocket?.emit('admin:model_status:unsubscribe', {});
        }
        uiState.activeTab = tab;
        container.querySelectorAll('.admin-tab').forEach((button) => {
            button.classList.toggle('admin-tab--active', button.dataset.tab === tab);
        });

        const content = container.querySelector('#admin-content');
        if (!content) return;
        content.innerHTML = '';

        if (tab === 'dashboard') {
            try {
                const { data } = await api('/admin/dashboard');
                content.innerHTML = `
                    <div class="card-grid admin-section-top">
                        <div class="card"><div class="admin-stat-value">${data.userCount ?? 0}</div><div class="text-muted">Total Users</div></div>
                        <div class="card"><div class="admin-stat-value">${data.roleCount ?? 0}</div><div class="text-muted">Roles</div></div>
                    </div>
                `;
            } catch (err) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
            }
            return;
        }

        if (tab === 'roles') {
            try {
                const { data } = await api('/roles');
                const roles = data.roles || [];
                const permissionColumns = data.permissionColumns || [];
                content.innerHTML = `
                    <div class="admin-section-top">
                        <p class="text-muted admin-section-note">${roles.length} roles. Click a role to edit.</p>
                        <div class="card-grid">
                            ${roles.map((role) => `
                                <div class="card admin-role-card" data-role-id="${role.id}">
                                    <div class="admin-role-card__name">${escapeHtml(role.name)}</div>
                                    <div class="text-muted admin-role-card__desc">${escapeHtml(role.description || '')}</div>
                                    <div class="admin-role-card__badges">
                                        ${role.is_admin
                                            ? '<span class="badge badge-primary">Admin</span>'
                                            : permissionColumns.filter((perm) => role[perm]).map((perm) => `<span class="badge badge-ghost">${escapeHtml(perm.replace('can_', ''))}</span>`).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                content.querySelectorAll('[data-role-id]').forEach((row) => {
                    row.addEventListener('click', () => showToast('Role editing: use API for now', 'info'));
                });
            } catch (err) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
            }
            return;
        }

        if (tab === 'colors') {
            try {
                await renderColorsTab(content);
            } catch (err) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
            }
            return;
        }

        if (tab === 'models') {
            try {
                await renderModelsTab(content);
                bindModelsRealtime(content);
            } catch (err) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
            }
            return;
        }

        if (tab === 'settings') {
            try {
                const { data } = await api('/admin/config');
                const cfg = data || {};
                const keys = [
                    ['auth.accessTokenExpiryMinutes', 'Access token expiry (minutes)', cfg.auth?.accessTokenExpiryMinutes ?? 60],
                    ['ai.enabled', 'AI enabled', cfg.ai?.enabled ?? true],
                    ['ai.ollamaUrl', 'Ollama URL', cfg.ai?.ollamaUrl ?? ''],
                    ['ai.comfyuiUrl', 'ComfyUI URL', cfg.ai?.comfyuiUrl ?? '']
                ];

                content.innerHTML = `
                    <div class="admin-section-top">
                        <p class="text-muted admin-section-note">Runtime config. Changes apply immediately.</p>
                        <div class="form-group">
                            ${keys.map(([key, label, value]) => `
                                <label class="form-label">${escapeHtml(label)}</label>
                                <input
                                    type="${typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'checkbox' : 'text'}"
                                    class="form-input admin-config-input"
                                    data-config-key="${escapeHtml(key)}"
                                    value="${typeof value === 'boolean' ? '' : escapeHtml(String(value))}"
                                    ${typeof value === 'boolean' && value ? 'checked' : ''}
                                />
                            `).join('')}
                        </div>
                        <button class="btn btn-primary" id="save-settings">Save Settings</button>
                    </div>
                `;

                content.querySelector('#save-settings')?.addEventListener('click', async () => {
                    const settings = {};
                    content.querySelectorAll('[data-config-key]').forEach((input) => {
                        let value = input.type === 'checkbox' ? input.checked : input.value;
                        if (input.type === 'number') value = parseInt(value, 10) || 0;
                        settings[input.dataset.configKey] = value;
                    });
                    try {
                        await api('/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
                        showToast('Settings saved', 'success');
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            } catch (err) {
                content.innerHTML = `<p class="text-danger">${escapeHtml(err.message)}</p>`;
            }
        }
    }

    async function renderAdmin(container) {
        container.innerHTML = `
            <div class="container">
                <h2 class="admin-title">Admin Panel</h2>
                <div class="admin-main-nav">
                    <button class="admin-main-tab admin-tab admin-tab--active" data-tab="dashboard" data-admin-tab>Dashboard</button>
                    <button class="admin-main-tab admin-tab" data-tab="roles" data-admin-tab>Roles & Permissions</button>
                    <button class="admin-main-tab admin-tab" data-tab="colors" data-admin-tab>Color Scheme</button>
                    <button class="admin-main-tab admin-tab" data-tab="models" data-admin-tab>AI Models</button>
                    <button class="admin-main-tab admin-tab" data-tab="settings" data-admin-tab>App Settings</button>
                </div>
                <div id="admin-content"></div>
            </div>
        `;

        container.querySelectorAll('[data-admin-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                renderTab(container, button.dataset.tab);
            });
        });

        await renderTab(container, 'dashboard');
    }

    return { ADMIN_COLOR_KEYS, renderAdmin };
}


