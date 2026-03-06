import { confirmDialog, normalizeHex } from '../adminUtils.js';

function palettePreviewSwatches(palette, escapeHtml) {
    const keys = ['bg-primary', 'bg-card', 'accent', 'text-primary'];
    return keys.map((k) => {
        const color = String(palette?.colors?.[k] || '#000000');
        return `<span class="admin-palette__swatch" style="background:${escapeHtml(color)}"></span>`;
    }).join('');
}

function colorInputRow(key, value, escapeHtml) {
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

export async function renderColorsTab({
    content,
    api,
    uiState,
    ADMIN_COLOR_KEYS,
    escapeHtml,
    showToast,
    showConfirm,
    applyAppearance,
    appearanceClient
}) {
    const {
        fetchAdminPalettes,
        createPalette,
        updatePalette,
        deletePalette,
        reorderPalettes,
        updatePaletteAssignments
    } = appearanceClient || {};

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
                <span class="admin-assignment-tile__swatches">${palettePreviewSwatches(palette, escapeHtml)}</span>
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
                                    <span class="admin-palette__swatches">${palettePreviewSwatches(palette, escapeHtml)}</span>
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
                    ${ADMIN_COLOR_KEYS.map((key) => colorInputRow(key, uiState.colorDraft[key] || '#000000', escapeHtml)).join('')}
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
                await renderColorsTab({
                    content,
                    api,
                    uiState,
                    ADMIN_COLOR_KEYS,
                    escapeHtml,
                    showToast,
                    showConfirm,
                    applyAppearance,
                    appearanceClient
                });
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    content.querySelector('#new-palette-toggle')?.addEventListener('click', async () => {
        uiState.showNewPaletteForm = !uiState.showNewPaletteForm;
        if (!uiState.showNewPaletteForm) uiState.newPaletteName = '';
        await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
    });

    content.querySelector('#cancel-create-palette-btn')?.addEventListener('click', async () => {
        uiState.showNewPaletteForm = false;
        uiState.newPaletteName = '';
        await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
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
            await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    content.querySelector('#toggle-palette-list')?.addEventListener('click', async () => {
        uiState.paletteListCollapsed = !uiState.paletteListCollapsed;
        await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
    });

    content.querySelectorAll('[data-select-palette]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const paletteId = btn.dataset.selectPalette;
            if (!paletteId || paletteId === uiState.selectedPaletteId) return;
            uiState.selectedPaletteId = paletteId;
            uiState.colorDraftPaletteId = null;
            await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
        });
    });

    content.querySelectorAll('[data-delete-palette]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const paletteId = btn.dataset.deletePalette;
            if (!paletteId) return;
            const palette = palettes.find((p) => p.id === paletteId);
            const ok = await confirmDialog({
                showConfirm,
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
                await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
            } catch (error) {
                showToast(error.message, 'error');
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
            await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    content.querySelectorAll('[data-theme-btn]').forEach((button) => {
        button.addEventListener('click', async () => {
            uiState.previewTheme = button.dataset.themeBtn === 'light' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', uiState.previewTheme);
            await applyAppearance();
            await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
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
            await renderColorsTab({ content, api, uiState, ADMIN_COLOR_KEYS, escapeHtml, showToast, showConfirm, applyAppearance, appearanceClient });
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}
