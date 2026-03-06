export function renderModelsTabMarkup({
    providers,
    totals,
    usageTotals,
    uiState,
    modelPickerItems,
    usageHtml,
    renderSplitValueTile,
    encodeModelKey,
    escapeHtml,
    formatNumber
}) {
    return `
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

            ${uiState.modelsSubView === 'config'
            ? renderConfigView({ providers, renderSplitValueTile, encodeModelKey, escapeHtml })
            : renderStatsView({ uiState, modelPickerItems, usageHtml })}
        </div>
    `;
}

function renderConfigView({ providers, renderSplitValueTile, encodeModelKey, escapeHtml }) {
    return `
        <section class="admin-card">
            <div class="admin-card__header"><h3>Available Models</h3></div>
            <div class="admin-model-providers">
                ${(providers || []).map((provider) => renderProviderCard({ provider, renderSplitValueTile, encodeModelKey, escapeHtml })).join('')}
            </div>
        </section>
    `;
}

function renderProviderCard({ provider, renderSplitValueTile, encodeModelKey, escapeHtml }) {
    return `
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
                ${renderProviderRows({ provider, renderSplitValueTile, encodeModelKey, escapeHtml })}
            </div>
        </article>
    `;
}

function renderProviderRows({ provider, renderSplitValueTile, encodeModelKey, escapeHtml }) {
    const models = Array.isArray(provider.models) ? provider.models.slice() : [];
    const byUsageThenName = (a, b) => {
        const requestsDelta = (b.usage?.requests || 0) - (a.usage?.requests || 0);
        if (requestsDelta !== 0) return requestsDelta;
        return String(a.displayName || a.modelId || '').localeCompare(String(b.displayName || b.modelId || ''));
    };
    const textModels = models.filter((model) => model.modelType !== 'image').sort(byUsageThenName);
    const imageModels = models.filter((model) => model.modelType === 'image').sort(byUsageThenName);
    const orderedModels = textModels.concat(imageModels);

    return orderedModels.map((model) => {
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
}

function renderStatsView({ uiState, modelPickerItems, usageHtml }) {
    return `
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
    `;
}

