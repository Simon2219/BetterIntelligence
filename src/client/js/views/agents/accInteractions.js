import { openAccMenu, openAccModal } from './accOverlays.js';
import { formatInteger, formatRelativeDate } from './accCharts.js';

const PANEL_DRAG_TYPE = 'application/x-acc-panel';
const AGENT_DRAG_TYPE = 'text/plain';
const ACC_QUERY_KEYS = [
    'tab',
    'days',
    'compareDays',
    'metric',
    'q',
    'sort',
    'group',
    'view',
    'collection',
    'status',
    'source',
    'tag',
    'category',
    'panel',
    'savedView',
    'selected'
];

async function persistPreference(saveAccPreferences, patch = {}) {
    if (typeof saveAccPreferences !== 'function') return;
    try {
        await saveAccPreferences(patch);
    } catch {}
}

function getSearchState() {
    return new URL(location.href);
}

function togglePreferenceValue(list = [], value) {
    const set = new Set(Array.isArray(list) ? list.map((item) => String(item)) : []);
    const normalized = String(value || '');
    if (!normalized) return [...set];
    if (set.has(normalized)) set.delete(normalized);
    else set.add(normalized);
    return [...set];
}

function ensureWidgetOrder(widgetOrder = [], key, { moveToFront = false } = {}) {
    const ordered = (Array.isArray(widgetOrder) ? widgetOrder : []).filter(Boolean).map((item) => String(item));
    const filtered = ordered.filter((item) => item !== String(key));
    if (moveToFront) return [String(key), ...filtered];
    return [...filtered, String(key)];
}

function moveItem(list = [], key, targetKey, placeAfter = false) {
    const items = [...list];
    const fromIndex = items.indexOf(String(key));
    const targetIndex = items.indexOf(String(targetKey));
    if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return items;
    const [moved] = items.splice(fromIndex, 1);
    const baseIndex = items.indexOf(String(targetKey));
    const insertIndex = placeAfter ? baseIndex + 1 : baseIndex;
    items.splice(insertIndex, 0, moved);
    return items;
}

function slugifyName(value) {
    const slug = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || `view-${Date.now()}`;
}

function buildCurrentViewQuery() {
    const params = new URLSearchParams(location.search);
    const output = {};
    params.forEach((value, key) => {
        if (key === 'savedView') return;
        output[key] = value;
    });
    return output;
}

function getPanelTitle(container, key) {
    const panel = container.querySelector(`.agents-panel[data-panel-key="${CSS.escape(key)}"] h3`);
    if (panel?.textContent?.trim()) return panel.textContent.trim();
    const dockTile = container.querySelector(`.agents-panel-dock__tile[data-panel-key="${CSS.escape(key)}"] strong`);
    return dockTile?.textContent?.trim() || key;
}

function getVisiblePanelKeys(container) {
    const seen = new Set();
    return [...container.querySelectorAll('.agents-panel-dock__tile[data-panel-key], .agents-panel[data-panel-key]')]
        .map((element) => String(element.dataset.panelKey || '').trim())
        .filter((key) => key && !seen.has(key) && seen.add(key));
}

function buildWidgetOrder(data, visibleKeys = [], nextVisibleKeys = visibleKeys) {
    const existing = Array.isArray(data.preferences?.widgetOrder) ? data.preferences.widgetOrder.map((item) => String(item)) : [];
    const orderedVisible = nextVisibleKeys.map((item) => String(item));
    const visibleSet = new Set(visibleKeys.map((item) => String(item)));
    const rest = existing.filter((item) => !visibleSet.has(item) && !orderedVisible.includes(item));
    return [...orderedVisible, ...rest];
}

function escTxt(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildAccessDetailHtml(item, accessState, type) {
    const linkedListing = accessState.linkedListings?.[String(item.listingId || item.listing_id || '')];
    const linkedAsset = accessState.linkedAssets?.[`${item.asset_type || item.assetType}:${item.asset_id || item.assetId}`];
    const title = linkedListing?.title || linkedAsset?.title || item.title || (type === 'request' ? 'Access request' : 'Grant');
    return `
        <div class="agents-detail-grid">
            <div class="agents-detail-card">
                <span class="agents-detail-card__label">Item</span>
                <strong>${escTxt(title)}</strong>
                <p>${escTxt(item.note || 'No note provided.')}</p>
            </div>
            <div class="agents-detail-card">
                <span class="agents-detail-card__label">Status</span>
                <strong>${escTxt(item.status || 'active')}</strong>
                <p>${item.ageDays != null ? `${item.ageDays} day${item.ageDays === 1 ? '' : 's'} old` : formatRelativeDate(item.timestamp)}</p>
            </div>
            ${linkedListing ? `
                <div class="agents-detail-card">
                    <span class="agents-detail-card__label">Listing</span>
                    <strong>${escTxt(linkedListing.title)}</strong>
                    <p>${escTxt(linkedListing.visibility || 'private')} | ${escTxt(linkedListing.status || 'draft')}</p>
                </div>
            ` : ''}
            ${linkedAsset ? `
                <div class="agents-detail-card">
                    <span class="agents-detail-card__label">Asset</span>
                    <strong>${escTxt(linkedAsset.assetType)}</strong>
                    <p>${escTxt(linkedAsset.route)}</p>
                </div>
            ` : ''}
        </div>
    `;
}

function isAccRoute(route) {
    try {
        const url = new URL(route, location.origin);
        return url.pathname === '/agents';
    } catch {
        return false;
    }
}

async function openRoute(route, { applyLocalViewState, navigateRoute }) {
    if (!route) return;
    const url = new URL(route, location.origin);
    if (url.pathname !== '/agents') {
        navigateRoute(url.pathname + url.search);
        return;
    }
    const changes = {};
    url.searchParams.forEach((value, key) => {
        changes[key] = value;
    });
    const removals = ACC_QUERY_KEYS.filter((key) => !url.searchParams.has(key));
    await applyLocalViewState({
        changes,
        removals,
        preserveScroll: false
    });
}

async function openListingPreviewModal({ api, listingId, openRoute, showToast }) {
    try {
        const { data: listing } = await api(`/catalog/listings/${listingId}`);
        const modal = openAccModal({
            title: escTxt(listing?.title || 'Listing Preview'),
            subtitle: `${escTxt(listing?.assetType || 'asset')} | ${escTxt(listing?.visibility || 'private')} | ${escTxt(listing?.status || 'draft')}`,
            body: `
                <div class="agents-detail-grid">
                    <div class="agents-detail-card">
                        <span class="agents-detail-card__label">Source</span>
                        <strong>${escTxt(listing?.sourceRoute || 'n/a')}</strong>
                        <p>Open the underlying asset to edit the source content.</p>
                    </div>
                    <div class="agents-detail-card">
                        <span class="agents-detail-card__label">Latest Review</span>
                        <strong>${escTxt(listing?.latestReview?.decision || 'No review yet')}</strong>
                        <p>${escTxt(listing?.latestReview?.reason || 'Nothing submitted or reviewed yet.')}</p>
                    </div>
                    <div class="agents-detail-card">
                        <span class="agents-detail-card__label">Stale Flags</span>
                        <strong>${formatInteger((listing?.staleReasons || []).length)}</strong>
                        <p>${escTxt((listing?.staleReasons || []).join(' | ') || 'No stale flags.')}</p>
                    </div>
                    <div class="agents-detail-card">
                        <span class="agents-detail-card__label">Plans</span>
                        <strong>${formatInteger((listing?.planSummary || []).length)}</strong>
                        <p>${escTxt((listing?.planSummary || []).map((plan) => plan.name || plan.code).join(' | ') || 'No plans configured.')}</p>
                    </div>
                </div>
            `,
            footer: `
                <a href="#" class="btn btn-ghost" data-modal-route="${escTxt(listing?.sourceRoute || '/agents?tab=listings')}">Open Source</a>
                <a href="#" class="btn btn-primary" data-modal-route="/agents?tab=listings&amp;q=${encodeURIComponent(listing?.title || '')}">Open Listings</a>
            `
        });
        modal.modal.querySelectorAll('[data-modal-route]').forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.preventDefault();
                const route = button.dataset.modalRoute;
                modal.close();
                await openRoute(route);
            }, { once: true });
        });
    } catch (error) {
        showToast(error.message || 'Unable to load listing preview', 'error');
    }
}

function openReviewPreviewModal({ item, openRoute }) {
    const modal = openAccModal({
        title: escTxt(item?.title || 'Review Detail'),
        subtitle: `${escTxt(item?.decision || item?.status || 'review')} | ${formatRelativeDate(item?.timestamp)}`,
        body: `
            <div class="agents-detail-grid">
                <div class="agents-detail-card">
                    <span class="agents-detail-card__label">Decision</span>
                    <strong>${escTxt(item?.decision || item?.status || 'review')}</strong>
                    <p>${escTxt(item?.reason || 'No reviewer reason provided.')}</p>
                </div>
                <div class="agents-detail-card">
                    <span class="agents-detail-card__label">Policy</span>
                    <strong>${escTxt(item?.policyVersion || 'Current policy')}</strong>
                    <p>${item?.isBlocked ? 'Public exposure is currently blocked.' : 'Not currently blocked.'}</p>
                </div>
            </div>
        `,
        footer: `
            <a href="#" class="btn btn-primary" data-modal-route="/agents?tab=reviews">Open Reviews</a>
            <a href="#" class="btn btn-ghost" data-modal-route="/agents?tab=listings">Open Listings</a>
        `
    });
    modal.modal.querySelectorAll('[data-modal-route]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            const route = button.dataset.modalRoute;
            modal.close();
            await openRoute(route);
        }, { once: true });
    });
}

function openAccessPreviewModal({ item, accessState, type, openRoute }) {
    const modal = openAccModal({
        title: type === 'request' ? 'Access Request' : 'Grant Detail',
        subtitle: `${item?.status || 'active'} | ${formatRelativeDate(item?.timestamp)}`,
        body: buildAccessDetailHtml(item, accessState, type),
        footer: `
            <a href="#" class="btn btn-primary" data-modal-route="/agents?tab=access">Open Access</a>
        `
    });
    modal.modal.querySelectorAll('[data-modal-route]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            modal.close();
            await openRoute(button.dataset.modalRoute);
        }, { once: true });
    });
}

function openSaveViewModal({ data, applyLocalViewState, saveAccPreferences, showToast }) {
    const modal = openAccModal({
        title: 'Save Current View',
        subtitle: 'Persist this tab, filter, and grouping state for quick reuse.',
        body: `
            <label class="agents-modal-field">
                <span>Name</span>
                <input type="text" class="form-input" id="agents-acc-save-view-name" placeholder="My high-priority reviews">
            </label>
        `,
        footer: `
            <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
            <button type="button" class="btn btn-primary" data-modal-save-view>Save View</button>
        `
    });
    modal.modal.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.close(), { once: true });
    modal.modal.querySelector('[data-modal-save-view]')?.addEventListener('click', async () => {
        const input = modal.modal.querySelector('#agents-acc-save-view-name');
        const name = String(input?.value || '').trim();
        if (!name) {
            input?.focus();
            return;
        }
        const prefs = data.preferences || {};
        const nextView = {
            id: `${slugifyName(name)}-${Date.now().toString(36)}`,
            name,
            tab: data.viewState.activeTab,
            query: buildCurrentViewQuery()
        };
        await persistPreference(saveAccPreferences, {
            savedViews: [...(prefs.savedViews || []), nextView]
        });
        modal.close();
        showToast('Saved view added', 'success');
        await applyLocalViewState({
            changes: { savedView: nextView.id, tab: nextView.tab }
        });
    });
}

function openSavedViewsModal({ data, applyLocalViewState, saveAccPreferences, showToast }) {
    const prefs = data.preferences || {};
    const savedViews = prefs.savedViews || [];
    const modal = openAccModal({
        title: 'Saved Views',
        subtitle: 'Apply or remove saved cockpit states.',
        body: savedViews.length ? `
            <div class="agents-modal-list">
                ${savedViews.map((view) => `
                    <div class="agents-modal-list__item">
                        <div>
                            <strong>${escTxt(view.name)}</strong>
                            <p>${escTxt(view.tab)}</p>
                        </div>
                        <div class="agents-modal-list__actions">
                            <button type="button" class="btn btn-ghost btn-sm" data-acc-apply-saved-view="${escTxt(view.id)}">Apply</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-acc-delete-saved-view="${escTxt(view.id)}">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : '<p class="text-muted">No saved views yet.</p>'
    });

    modal.modal.querySelectorAll('[data-acc-apply-saved-view]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            const viewId = button.dataset.accApplySavedView;
            const view = savedViews.find((entry) => entry.id === viewId);
            if (!view) return;
            modal.close();
            const changes = { ...view.query, savedView: view.id, tab: view.tab || 'overview' };
            const removals = ACC_QUERY_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(changes, key));
            await applyLocalViewState({
                changes,
                removals,
                preserveScroll: false
            });
        });
    });

    modal.modal.querySelectorAll('[data-acc-delete-saved-view]').forEach((button) => {
        button.addEventListener('click', async (event) => {
            event.preventDefault();
            const viewId = button.dataset.accDeleteSavedView;
            const nextSavedViews = savedViews.filter((entry) => entry.id !== viewId);
            await persistPreference(saveAccPreferences, { savedViews: nextSavedViews });
            modal.close();
            showToast('Saved view removed', 'success');
            await applyLocalViewState({
                removals: data.viewState.savedViewId === viewId ? ['savedView'] : []
            });
        });
    });
}

function openPanelCustomizeModal({ container, data, applyLocalViewState }) {
    const panelKeys = getVisiblePanelKeys(container);
    const prefs = data.preferences || {};
    const modal = openAccModal({
        title: 'Panel Customization',
        subtitle: 'Pin or collapse panels for this cockpit view.',
        body: `
            <div class="agents-modal-list">
                ${panelKeys.map((key) => `
                    <div class="agents-modal-list__item">
                        <div>
                            <strong>${getPanelTitle(container, key)}</strong>
                            <p>${key}</p>
                        </div>
                        <div class="agents-modal-list__actions">
                            <button type="button" class="btn btn-ghost btn-sm" data-acc-modal-toggle-pin="${key}">${(prefs.pinnedWidgets || []).includes(key) ? 'Unpin' : 'Pin'}</button>
                            <button type="button" class="btn btn-ghost btn-sm" data-acc-modal-toggle-collapse="${key}">${(prefs.collapsedWidgets || []).includes(key) ? 'Expand' : 'Collapse'}</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `
    });

    modal.modal.querySelectorAll('[data-acc-modal-toggle-pin]').forEach((button) => {
        button.addEventListener('click', async () => {
            const key = button.dataset.accModalTogglePin;
            const nextPinned = togglePreferenceValue(prefs.pinnedWidgets || [], key);
            const widgetOrder = ensureWidgetOrder(prefs.widgetOrder || [], key, { moveToFront: nextPinned.includes(key) });
            modal.close();
            await applyLocalViewState({
                preferencePatch: { pinnedWidgets: nextPinned, widgetOrder }
            });
        });
    });

    modal.modal.querySelectorAll('[data-acc-modal-toggle-collapse]').forEach((button) => {
        button.addEventListener('click', async () => {
            const key = button.dataset.accModalToggleCollapse;
            const nextCollapsed = togglePreferenceValue(prefs.collapsedWidgets || [], key);
            modal.close();
            await applyLocalViewState({
                preferencePatch: { collapsedWidgets: nextCollapsed }
            });
        });
    });
}

async function openBulkMoveCategoryModal({ categories, saveAction }) {
    const modal = openAccModal({
        title: 'Move Agents To Category',
        subtitle: 'Choose the target category for the selected agents.',
        body: `
            <label class="agents-modal-field">
                <span>Category</span>
                <select class="form-input" id="agents-acc-bulk-category">
                    <option value="__none__">No category</option>
                    ${categories.map((category) => `<option value="${escTxt(category.id)}">${escTxt(category.name)}</option>`).join('')}
                </select>
            </label>
        `,
        footer: `
            <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
            <button type="button" class="btn btn-primary" data-modal-submit>Move</button>
        `
    });
    modal.modal.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.close(), { once: true });
    modal.modal.querySelector('[data-modal-submit]')?.addEventListener('click', async () => {
        const value = modal.modal.querySelector('#agents-acc-bulk-category')?.value;
        await saveAction(value === '__none__' ? null : value);
        modal.close();
    });
}

async function handleBulkAction(action, {
    data,
    api,
    navigateRoute,
    showToast,
    showConfirm,
    refreshAgents
}) {
    const agentMap = data.library.agentMap || new Map();
    const selectedIds = [...new Set((data.viewState.selectedIds || []).map((id) => String(id)).filter((id) => agentMap.get(id)?.isOwner))];
    const selectedAgents = selectedIds.map((id) => agentMap.get(id)).filter(Boolean);

    if (action === 'select-all') {
        const ids = (data.library.ownFiltered || []).map((agent) => String(agent.id));
        await refreshAgents({
            changes: { selected: ids.join(',') },
            removals: ids.length ? [] : ['selected'],
            invalidateSections: []
        });
        return;
    }

    if (action === 'clear') {
        await refreshAgents({
            removals: ['selected'],
            invalidateSections: []
        });
        return;
    }

    if (!selectedIds.length) {
        showToast('Select at least one owned agent first', 'error');
        return;
    }

    if (action === 'analytics') {
        navigateRoute(selectedIds.length === 1 ? `/agents/${selectedIds[0]}/analytics` : '/agents?tab=usage');
        return;
    }

    if (action === 'listings') {
        navigateRoute(selectedAgents.length === 1 ? `/agents?tab=listings&q=${encodeURIComponent(selectedAgents[0].name || '')}` : '/agents?tab=listings');
        return;
    }

    if (action === 'deploy') {
        navigateRoute('/deploy');
        return;
    }

    if (action === 'copy') {
        try {
            await Promise.all(selectedIds.map((agentId) => api('/agents', {
                method: 'POST',
                body: JSON.stringify({ copyFrom: agentId })
            })));
            showToast(`Copied ${selectedIds.length} agent${selectedIds.length === 1 ? '' : 's'}`, 'success');
            await refreshAgents({
                removals: ['selected'],
                invalidateAll: true,
                invalidateLibrary: true
            });
        } catch (err) {
            showToast(err.message || 'Bulk copy failed', 'error');
        }
        return;
    }

    if (action === 'move-category') {
        await openBulkMoveCategoryModal({
            categories: data.library.categories || [],
            saveAction: async (categoryId) => {
                try {
                    await Promise.all(selectedIds.map((agentId) => api(`/agents/${agentId}/category`, {
                        method: 'PUT',
                        body: JSON.stringify({ categoryId })
                    })));
                    showToast(`Moved ${selectedIds.length} agent${selectedIds.length === 1 ? '' : 's'}`, 'success');
                    await refreshAgents({
                        removals: ['selected'],
                        invalidateAll: true,
                        invalidateLibrary: true
                    });
                } catch (err) {
                    showToast(err.message || 'Bulk category move failed', 'error');
                }
            }
        });
        return;
    }

    if (action === 'delete') {
        const ok = await showConfirm({
            title: 'Delete Agents',
            message: `This will permanently delete ${selectedIds.length} agent${selectedIds.length === 1 ? '' : 's'} and all conversations.`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            danger: true
        });
        if (!ok) return;
        try {
            await Promise.all(selectedIds.map((agentId) => api(`/agents/${agentId}`, { method: 'DELETE' })));
            showToast(`Deleted ${selectedIds.length} agent${selectedIds.length === 1 ? '' : 's'}`, 'success');
            await refreshAgents({
                removals: ['selected'],
                invalidateAll: true,
                invalidateLibrary: true
            });
        } catch (err) {
            showToast(err.message || 'Bulk delete failed', 'error');
        }
    }
}

function openBulkMenu(anchor, context) {
    openAccMenu(anchor, [
        {
            label: 'Copy Selected',
            iconName: 'copy',
            onSelect: () => handleBulkAction('copy', context)
        },
        {
            label: 'Move Category',
            iconName: 'settings',
            onSelect: () => handleBulkAction('move-category', context)
        },
        { separator: true },
        {
            label: 'Delete Selected',
            iconName: 'alertTriangle',
            danger: true,
            onSelect: () => handleBulkAction('delete', context)
        }
    ]);
}

async function movePanelByStep({ container, data, panelKey, step = -1, applyLocalViewState }) {
    const visibleKeys = getVisiblePanelKeys(container);
    const currentIndex = visibleKeys.indexOf(String(panelKey));
    if (currentIndex === -1) return;
    const targetIndex = Math.max(0, Math.min(visibleKeys.length - 1, currentIndex + step));
    if (targetIndex === currentIndex) return;
    const nextVisible = [...visibleKeys];
    const [moved] = nextVisible.splice(currentIndex, 1);
    nextVisible.splice(targetIndex, 0, moved);
    await applyLocalViewState({
        preferencePatch: {
            widgetOrder: buildWidgetOrder(data, visibleKeys, nextVisible)
        }
    });
}

function openPanelMenu(anchor, {
    container,
    panelKey,
    data,
    applyLocalViewState,
    showToast
}) {
    const prefs = data.preferences || {};
    const pinned = (prefs.pinnedWidgets || []).includes(panelKey);
    const collapsed = (prefs.collapsedWidgets || []).includes(panelKey);
    openAccMenu(anchor, [
        {
            label: pinned ? 'Unpin Panel' : 'Pin Panel',
            iconName: 'pin',
            onSelect: async () => {
                const nextPinned = togglePreferenceValue(prefs.pinnedWidgets || [], panelKey);
                const widgetOrder = ensureWidgetOrder(prefs.widgetOrder || [], panelKey, { moveToFront: nextPinned.includes(panelKey) });
                await applyLocalViewState({
                    preferencePatch: { pinnedWidgets: nextPinned, widgetOrder }
                });
            }
        },
        {
            label: collapsed ? 'Expand Panel' : 'Collapse Panel',
            iconName: collapsed ? 'chevronDown' : 'chevronUp',
            onSelect: async () => {
                const nextCollapsed = togglePreferenceValue(prefs.collapsedWidgets || [], panelKey);
                await applyLocalViewState({
                    preferencePatch: { collapsedWidgets: nextCollapsed }
                });
            }
        },
        { separator: true },
        {
            label: 'Move Earlier',
            iconName: 'chevronUp',
            onSelect: () => movePanelByStep({ container, data, panelKey, step: -1, applyLocalViewState })
        },
        {
            label: 'Move Later',
            iconName: 'chevronDown',
            onSelect: () => movePanelByStep({ container, data, panelKey, step: 1, applyLocalViewState })
        },
        { separator: true },
        {
            label: 'Copy Panel Link',
            iconName: 'copy',
            onSelect: async () => {
                const url = getSearchState();
                url.searchParams.set('panel', panelKey);
                try {
                    await navigator.clipboard.writeText(url.toString());
                    showToast('Panel link copied', 'success');
                } catch (err) {
                    showToast(err.message || 'Copy failed', 'error');
                }
            }
        },
        {
            label: 'Customize Panels',
            iconName: 'settings',
            onSelect: () => openPanelCustomizeModal({ container, data, applyLocalViewState })
        }
    ]);
}

function openAgentMenu(anchor, agent, context) {
    const { data, api, navigateRoute, showToast, showConfirm, applyLocalViewState, refreshAgents } = context;
    const pinned = (data.preferences?.pinnedAgentIds || []).includes(String(agent.id));
    const items = [
        {
            label: pinned ? 'Unpin Agent' : 'Pin Agent',
            iconName: 'pin',
            onSelect: async () => {
                const nextPinned = togglePreferenceValue(data.preferences?.pinnedAgentIds || [], agent.id);
                await applyLocalViewState({
                    preferencePatch: { pinnedAgentIds: nextPinned }
                });
            }
        },
        { label: 'Open Chat', iconName: 'sparkles', onSelect: () => navigateRoute(`/chat?agent=${agent.id}`) },
        { label: 'Open Editor', iconName: 'settings', onSelect: () => navigateRoute(`/agentBuilder/${agent.id}`) },
        { label: 'Open Analytics', iconName: 'panelTop', onSelect: () => navigateRoute(`/agents/${agent.id}/analytics`) },
        { label: 'Open Listing View', iconName: 'eye', onSelect: () => navigateRoute(`/agents?tab=listings&q=${encodeURIComponent(agent.name || '')}`) },
        { label: 'Open Deploy', iconName: 'externalLink', onSelect: () => navigateRoute('/deploy') }
    ];
    if (agent.market?.visibility === 'public') {
        items.push({ label: 'Open In Hub', iconName: 'externalLink', onSelect: () => navigateRoute(`/hub/agents/${agent.id}`) });
    }
    items.push({ separator: true });
    items.push({
        label: 'Copy Agent',
        iconName: 'copy',
        onSelect: async () => {
            try {
                const { data: created } = await api('/agents', {
                    method: 'POST',
                    body: JSON.stringify({ copyFrom: agent.id })
                });
                showToast('Agent copied', 'success');
                navigateRoute(`/agentBuilder/${created.id}`);
            } catch (err) {
                showToast(err.message || 'Copy failed', 'error');
            }
        }
    });
    if (agent.isOwner) {
        items.push({
            label: 'Delete Agent',
            iconName: 'alertTriangle',
            danger: true,
            onSelect: async () => {
                const ok = await showConfirm({
                    title: 'Delete Agent',
                    message: 'This will permanently delete the agent and all conversations.',
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api(`/agents/${agent.id}`, { method: 'DELETE' });
                    showToast('Agent deleted', 'success');
                    await refreshAgents({
                        invalidateAll: true,
                        invalidateLibrary: true
                    });
                } catch (err) {
                    showToast(err.message || 'Delete failed', 'error');
                }
            }
        });
    }
    openAccMenu(anchor, items);
}

function bindPanelDragAndDrop({ container, data, applyLocalViewState, saveAccPreferences }) {
    const grid = container.querySelector('.agents-dashboard-grid');
    if (!grid) return;
    let draggedKey = null;
    let draggedEl = null;

    const clearVisualState = () => {
        container.querySelectorAll('.agents-panel--drop-target, .agents-panel-dock__tile--drop-target, .agents-panel--dragging, .agents-panel-dock__tile--dragging, .agents-panel--reordering')
            .forEach((el) => {
                el.classList.remove('agents-panel--drop-target', 'agents-panel-dock__tile--drop-target', 'agents-panel--dragging', 'agents-panel-dock__tile--dragging', 'agents-panel--reordering');
            });
    };

    const findPanelByKey = (key) =>
        container.querySelector(`.agents-panel[data-panel-key="${CSS.escape(key)}"], .agents-panel-dock__tile[data-panel-key="${CSS.escape(key)}"]`);

    const elements = container.querySelectorAll('.agents-panel[data-panel-key], .agents-panel-dock__tile[data-panel-key]');
    elements.forEach((element) => {
        element.addEventListener('dragstart', (event) => {
            draggedKey = String(element.dataset.panelKey || '').trim();
            draggedEl = element;
            event.dataTransfer.setData(PANEL_DRAG_TYPE, draggedKey);
            event.dataTransfer.effectAllowed = 'move';
            requestAnimationFrame(() => {
                element.classList.add(element.classList.contains('agents-panel-dock__tile') ? 'agents-panel-dock__tile--dragging' : 'agents-panel--dragging');
            });
        });

        element.addEventListener('dragend', () => {
            clearVisualState();
            if (draggedEl) {
                draggedEl.classList.remove('agents-panel--reordering');
            }
            draggedKey = null;
            draggedEl = null;

            const visibleKeys = getVisiblePanelKeys(container);
            const prefs = data.preferences || {};
            const existing = Array.isArray(prefs.widgetOrder) ? prefs.widgetOrder.map((i) => String(i)) : [];
            const visibleSet = new Set(visibleKeys);
            const rest = existing.filter((i) => !visibleSet.has(i) && !visibleKeys.includes(i));
            const finalOrder = [...visibleKeys, ...rest];
            if (typeof saveAccPreferences === 'function') {
                saveAccPreferences({ widgetOrder: finalOrder }).catch((err) => {
                    console.warn('Panel drag: failed to persist widget order', err);
                });
            }
        });

        element.addEventListener('dragover', (event) => {
            if (!draggedKey || !draggedEl) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const targetKey = String(element.dataset.panelKey || '').trim();
            if (!targetKey || targetKey === draggedKey) return;

            const rect = element.getBoundingClientRect();
            const useHorizontal = rect.width > rect.height * 1.2;
            const placeAfter = useHorizontal
                ? event.clientX > (rect.left + (rect.width / 2))
                : event.clientY > (rect.top + (rect.height / 2));

            const parent = element.parentNode;
            if (!parent) return;

            grid.querySelectorAll('.agents-panel').forEach((p) => p.classList.add('agents-panel--reordering'));

            if (placeAfter) {
                if (element.nextElementSibling !== draggedEl) {
                    parent.insertBefore(draggedEl, element.nextElementSibling);
                }
            } else {
                if (element.previousElementSibling !== draggedEl) {
                    parent.insertBefore(draggedEl, element);
                }
            }

            container.querySelectorAll('.agents-panel--drop-target, .agents-panel-dock__tile--drop-target')
                .forEach((el) => el.classList.remove('agents-panel--drop-target', 'agents-panel-dock__tile--drop-target'));
            element.classList.add(element.classList.contains('agents-panel-dock__tile') ? 'agents-panel-dock__tile--drop-target' : 'agents-panel--drop-target');
        });

        element.addEventListener('dragleave', () => {
            element.classList.remove('agents-panel--drop-target', 'agents-panel-dock__tile--drop-target');
        });

        element.addEventListener('drop', (event) => {
            event.preventDefault();
            clearVisualState();
        });
    });
}

function bindAgentDragAndDrop({ container, categories, agentMap, api, showToast, refreshAgents }) {
    if (!categories.length) return;

    container.querySelectorAll('.agent-card--draggable, .agents-compact-row[draggable="true"]').forEach((card) => {
        card.addEventListener('dragstart', (event) => {
            const agentId = String(card.dataset.agentId || '').trim();
            if (!agentId) return;
            event.dataTransfer.setData(AGENT_DRAG_TYPE, agentId);
            event.dataTransfer.effectAllowed = 'move';
            card.classList.add('agent-card-dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('agent-card-dragging'));
    });

    container.querySelectorAll('.agents-library-group--droppable').forEach((zone) => {
        zone.addEventListener('dragover', (event) => {
            if (!event.dataTransfer.types.includes(AGENT_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            zone.classList.add('agents-library-group--over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('agents-library-group--over');
        });
        zone.addEventListener('drop', async (event) => {
            event.preventDefault();
            zone.classList.remove('agents-library-group--over');
            const agentId = event.dataTransfer.getData(AGENT_DRAG_TYPE);
            const categoryId = zone.dataset.categoryId || null;
            const agent = agentMap.get(String(agentId));
            if (!agent?.isOwner) return;
            const currentCategoryId = (agent.categoryIds || [])[0] || null;
            if (currentCategoryId === categoryId) return;
            try {
                await api(`/agents/${agentId}/category`, {
                    method: 'PUT',
                    body: JSON.stringify({ categoryId })
                });
                showToast('Agent moved', 'success');
                await refreshAgents({
                    invalidateAll: true,
                    invalidateLibrary: true
                });
            } catch (err) {
                showToast(err.message || 'Move failed', 'error');
            }
        });
    });
}

export function bindAccInteractions({
    container,
    data,
    api,
    navigateRoute,
    showToast,
    showConfirm,
    refreshAgents,
    applyLocalViewState,
    saveAccPreferences,
    renderAccCategoryManager
} = {}) {
    const categories = data.library?.categories || [];
    const agentMap = data.library?.agentMap || new Map();
    const openAccRoute = (route) => openRoute(route, { applyLocalViewState, navigateRoute });
    const goToRoute = (route) => (isAccRoute(route) ? openAccRoute(route) : navigateRoute(route));

    let searchDebounce = null;
    container.addEventListener('submit', async (event) => {
        if (event.target?.id !== 'agents-acc-search-form') return;
        event.preventDefault();
        if (searchDebounce) clearTimeout(searchDebounce);
        const value = container.querySelector('#agents-acc-search-input')?.value || '';
        await applyLocalViewState({
            changes: { q: value },
            removals: value ? [] : ['q']
        });
    });

    container.addEventListener('input', (event) => {
        if (event.target?.id !== 'agents-acc-search-input') return;
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(async () => {
            const value = event.target.value || '';
            await applyLocalViewState({
                changes: { q: value },
                removals: value ? [] : ['q']
            });
        }, 300);
    });

    container.addEventListener('change', async (event) => {
        const input = event.target;
        if (input.matches('[data-acc-param]')) {
            const key = String(input.dataset.accParam || '').trim();
            const value = 'value' in input ? input.value : input.dataset.accValue;
            if (key === 'days') {
                await applyLocalViewState({
                    changes: { days: value, compareDays: value },
                    preferencePatch: { preferredDateRange: parseInt(value, 10) || 30 },
                    preserveScroll: false
                });
                return;
            }
            if (key === 'metric') {
                await applyLocalViewState({
                    changes: { [key]: value },
                    removals: !value ? [key] : [],
                    preferencePatch: { preferredUsageMetric: value }
                });
                return;
            }
            if (key === 'view' && data.viewState.activeTab === 'library') {
                await applyLocalViewState({
                    changes: { [key]: value },
                    removals: !value ? [key] : [],
                    preferencePatch: { libraryView: value }
                });
                return;
            }
            await applyLocalViewState({
                changes: { [key]: value },
                removals: !value ? [key] : []
            });
            return;
        }

        if (input.matches('[data-agent-select]')) {
            const agentId = String(input.dataset.agentSelect || '').trim();
            if (!agentId) return;
            const selected = new Set((data.viewState.selectedIds || []).map((id) => String(id)));
            if (input.checked) selected.add(agentId);
            else selected.delete(agentId);
            await applyLocalViewState({
                changes: { selected: [...selected].join(',') },
                removals: selected.size ? [] : ['selected']
            });
            return;
        }

        if (input.id === 'agent-tag-filter') {
            await applyLocalViewState({
                changes: { tag: input.value || '' },
                removals: !input.value ? ['tag'] : []
            });
        }
    });

    container.addEventListener('click', async (event) => {
        const routeEl = event.target.closest('[data-route]');
        const panelMenu = event.target.closest('[data-acc-panel-menu]');
        const panelCollapse = event.target.closest('[data-acc-collapse-panel]');
        const refreshPanel = event.target.closest('[data-refresh-dashboard-panel]');
        const tabButton = event.target.closest('[data-agents-tab]');
        const metricButton = event.target.closest('[data-acc-metric]');
        const smartCollection = event.target.closest('[data-smart-collection]');
        const favoriteCollection = event.target.closest('[data-acc-favorite-collection]');
        const pinAgentButton = event.target.closest('[data-pin-agent]');
        const agentMenu = event.target.closest('[data-agent-menu]');
        const bulkButton = event.target.closest('[data-acc-bulk-action]');
        const bulkMenu = event.target.closest('[data-acc-bulk-menu]');
        const openListing = event.target.closest('[data-acc-open-listing]');
        const openReview = event.target.closest('[data-acc-open-review]');
        const openRequest = event.target.closest('[data-acc-open-request]');
        const openGrant = event.target.closest('[data-acc-open-grant]');
        const toggleGroup = event.target.closest('[data-acc-toggle-group]');
        const openSavedViews = event.target.closest('#agents-acc-open-saved-views');
        const saveView = event.target.closest('#agents-acc-save-view');
        const openPanelCustomize = event.target.closest('[data-acc-open-panel-customize]');
        const openCategoryManager = event.target.closest('[data-acc-open-category-manager]');
        const clearLibraryFilters = event.target.closest('[data-acc-clear-library-filters]');
        const copyLink = event.target.closest('#agents-acc-copy-link');
        const refreshButton = event.target.closest('#agents-acc-refresh');

        if (tabButton) {
            event.preventDefault();
            const nextTab = String(tabButton.dataset.agentsTab || '').trim();
            if (!nextTab || nextTab === data.viewState.activeTab) return;
            await applyLocalViewState({
                changes: { tab: nextTab },
                removals: nextTab === 'library' ? ['panel'] : ['tag', 'category', 'collection', 'selected', 'panel'],
                preferencePatch: { defaultTab: nextTab },
                preserveScroll: false
            });
            return;
        }

        if (metricButton) {
            event.preventDefault();
            const metric = String(metricButton.dataset.accMetric || '').trim();
            if (!metric) return;
            await applyLocalViewState({
                changes: { metric },
                preferencePatch: { preferredUsageMetric: metric }
            });
            return;
        }

        if (copyLink) {
            event.preventDefault();
            try {
                await navigator.clipboard.writeText(location.href);
                showToast('Control center link copied', 'success');
            } catch (err) {
                showToast(err.message || 'Copy failed', 'error');
            }
            return;
        }

        if (refreshButton) {
            event.preventDefault();
            await refreshAgents({
                invalidateAll: true,
                invalidateLibrary: data.viewState.activeTab === 'library'
            });
            return;
        }

        if (refreshPanel) {
            event.preventDefault();
            const section = String(data.viewState.activeTab || 'overview');
            await refreshAgents({
                invalidateSections: section === 'overview' ? ['overview'] : ['overview', section],
                invalidateLibrary: section === 'library'
            });
            return;
        }

        if (panelMenu) {
            event.preventDefault();
            openPanelMenu(panelMenu, {
                container,
                panelKey: panelMenu.dataset.accPanelMenu,
                data,
                applyLocalViewState,
                showToast
            });
            return;
        }

        if (panelCollapse) {
            event.preventDefault();
            const key = String(panelCollapse.dataset.accCollapsePanel || '').trim();
            const nextCollapsed = togglePreferenceValue(data.preferences?.collapsedWidgets || [], key);
            await applyLocalViewState({
                preferencePatch: { collapsedWidgets: nextCollapsed }
            });
            return;
        }

        if (smartCollection) {
            event.preventDefault();
            await applyLocalViewState({
                changes: { tab: 'library', collection: smartCollection.dataset.smartCollection },
                removals: ['savedView'],
                preserveScroll: false
            });
            return;
        }

        if (favoriteCollection) {
            event.preventDefault();
            const collectionKey = String(favoriteCollection.dataset.accFavoriteCollection || '').trim();
            const next = togglePreferenceValue(data.preferences?.favoriteSmartCollections || [], collectionKey);
            await applyLocalViewState({
                preferencePatch: { favoriteSmartCollections: next }
            });
            return;
        }

        if (pinAgentButton) {
            event.preventDefault();
            const agentId = String(pinAgentButton.dataset.pinAgent || '').trim();
            const nextPinned = togglePreferenceValue(data.preferences?.pinnedAgentIds || [], agentId);
            await applyLocalViewState({
                preferencePatch: { pinnedAgentIds: nextPinned }
            });
            return;
        }

        if (agentMenu) {
            event.preventDefault();
            const agent = agentMap.get(String(agentMenu.dataset.agentMenu || '').trim());
            if (!agent) return;
            openAgentMenu(agentMenu, agent, {
                data,
                api,
                navigateRoute: goToRoute,
                showToast,
                showConfirm,
                applyLocalViewState,
                refreshAgents
            });
            return;
        }

        if (bulkButton) {
            event.preventDefault();
            await handleBulkAction(bulkButton.dataset.accBulkAction, {
                data,
                api,
                navigateRoute: goToRoute,
                showToast,
                showConfirm,
                refreshAgents
            });
            return;
        }

        if (bulkMenu) {
            event.preventDefault();
            openBulkMenu(bulkMenu, {
                data,
                api,
                navigateRoute: goToRoute,
                showToast,
                showConfirm,
                refreshAgents
            });
            return;
        }

        if (openListing) {
            event.preventDefault();
            await openListingPreviewModal({
                api,
                listingId: openListing.dataset.accOpenListing,
                openRoute: openAccRoute,
                showToast
            });
            return;
        }

        if (openReview) {
            event.preventDefault();
            const item = data.lookups?.reviews?.get(String(openReview.dataset.accOpenReview || '').trim())
                || (data.dashboard?.reviews?.timeline || []).find((entry) => String(entry.id) === String(openReview.dataset.accOpenReview || '').trim());
            if (item) openReviewPreviewModal({ item, openRoute: openAccRoute });
            return;
        }

        if (openRequest) {
            event.preventDefault();
            const item = data.lookups?.access?.requestMap?.get(String(openRequest.dataset.accOpenRequest || '').trim());
            if (item) openAccessPreviewModal({ item, accessState: data.dashboard?.access || {}, type: 'request', openRoute: openAccRoute });
            return;
        }

        if (openGrant) {
            event.preventDefault();
            const item = data.lookups?.access?.grantMap?.get(String(openGrant.dataset.accOpenGrant || '').trim())
                || (data.dashboard?.access?.nearExhaustion || []).find((entry) => String(entry.id) === String(openGrant.dataset.accOpenGrant || '').trim());
            if (item) openAccessPreviewModal({ item, accessState: data.dashboard?.access || {}, type: 'grant', openRoute: openAccRoute });
            return;
        }

        if (toggleGroup) {
            event.preventDefault();
            const groupKey = String(toggleGroup.dataset.accToggleGroup || '').trim();
            const nextGroups = togglePreferenceValue(data.preferences?.collapsedLibraryGroups || [], groupKey);
            await applyLocalViewState({
                preferencePatch: { collapsedLibraryGroups: nextGroups }
            });
            return;
        }

        if (openSavedViews) {
            event.preventDefault();
            openSavedViewsModal({ data, applyLocalViewState, saveAccPreferences, showToast });
            return;
        }

        if (saveView) {
            event.preventDefault();
            openSaveViewModal({ data, applyLocalViewState, saveAccPreferences, showToast });
            return;
        }

        if (openPanelCustomize) {
            event.preventDefault();
            openPanelCustomizeModal({ container, data, applyLocalViewState });
            return;
        }

        if (openCategoryManager) {
            event.preventDefault();
            await renderAccCategoryManager(container, categories);
            return;
        }

        if (clearLibraryFilters) {
            event.preventDefault();
            await applyLocalViewState({
                changes: { tab: 'library' },
                removals: ['q', 'tag', 'category', 'collection', 'selected', 'savedView'],
                preserveScroll: false
            });
            return;
        }

        if (routeEl) {
            event.preventDefault();
            const route = routeEl.dataset.route;
            if (isAccRoute(route)) {
                await openAccRoute(route);
            } else {
                goToRoute(route);
            }
        }
    });

    bindPanelDragAndDrop({
        container,
        data,
        applyLocalViewState,
        saveAccPreferences
    });

    bindAgentDragAndDrop({
        container,
        categories,
        agentMap,
        api,
        showToast,
        refreshAgents
    });

    return () => {
        if (searchDebounce) clearTimeout(searchDebounce);
    };
}
