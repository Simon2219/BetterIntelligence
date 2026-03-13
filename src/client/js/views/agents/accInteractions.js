import { openAccMenu, openAccModal } from './accOverlays.js';
import { formatInteger, formatRelativeDate } from './accCharts.js';
import { icon } from '../../utils/dom.js';
import {
    buildAccPanelLayout,
    getColumnStarts,
    getGridMetrics,
    getPanelHeightUnits,
    getPanelSpan,
    layoutItemToPixels,
    measurePanelHeights
} from './accLayout.js';

const SUPPORTS_SCROLL_TIMELINE =
    typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'scroll()');

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
    return panel?.textContent?.trim() || key;
}

function getVisiblePanelKeys(container) {
    const seen = new Set();
    return [...container.querySelectorAll('.agents-panel[data-panel-key]')]
        .map((element) => String(element.dataset.panelKey || '').trim())
        .filter((key) => key && !seen.has(key) && seen.add(key));
}

function getPanelElement(container, key) {
    return container.querySelector(`.agents-panel[data-panel-key="${CSS.escape(String(key || '').trim())}"]`);
}

function setPanelContentHeight(panel, collapsed, { animate = true } = {}) {
    const content = panel?.querySelector('.agents-panel__content');
    const inner = panel?.querySelector('.agents-panel__content-inner');
    if (!content || !inner) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextHeight = collapsed ? 0 : inner.scrollHeight;

    if (!animate || reducedMotion) {
        content.style.height = collapsed ? '0px' : 'auto';
        content.style.opacity = collapsed ? '0' : '1';
        panel.classList.remove('agents-panel--collapsing');
        return;
    }

    const startingHeight = collapsed
        ? (content.offsetHeight || inner.scrollHeight)
        : content.offsetHeight;

    panel.classList.add('agents-panel--collapsing');
    content.style.height = `${startingHeight}px`;
    content.style.opacity = collapsed ? '1' : '0';

    const finish = () => {
        panel.classList.remove('agents-panel--collapsing');
        content.style.height = collapsed ? '0px' : 'auto';
        content.style.opacity = collapsed ? '0' : '1';
        content.removeEventListener('transitionend', finish);
    };

    content.addEventListener('transitionend', finish);

    requestAnimationFrame(() => {
        content.style.height = `${nextHeight}px`;
        content.style.opacity = collapsed ? '0' : '1';
    });
}

function getScrollParent(element) {
    let current = element?.parentElement || null;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY || style.overflow || '';
        if (/(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight + 1) {
            return current;
        }
        current = current.parentElement;
    }
    return window;
}

function getScrollTopForTarget(target) {
    return target === window ? window.scrollY : target.scrollTop;
}

function getTopWithinScrollTarget(element, scrollTarget) {
    const rect = element.getBoundingClientRect();
    if (scrollTarget === window) {
        return rect.top + window.scrollY;
    }
    const targetRect = scrollTarget.getBoundingClientRect();
    return rect.top - targetRect.top + scrollTarget.scrollTop;
}

function bindStickyHeaderTuckIn(container) {
    const header = container?.querySelector('.agents-control-header');
    const menuSlot = header?.querySelector('.agents-control-header__menu-slot');
    const tabRail = header?.querySelector('.agents-control-tab-rail');
    if (!header || !menuSlot || !tabRail) {
        return { cleanup() {} };
    }

    const sentinel = document.createElement('span');
    sentinel.setAttribute('aria-hidden', 'true');
    const shell = header.closest('.agents-control-shell');
    const frame = shell?.parentElement;
    if (frame && frame !== shell) {
        frame.insertBefore(sentinel, shell);
    } else {
        header.parentNode?.insertBefore(sentinel, header);
    }

    const isSingleRowRail = () => {
        const buttons = [...tabRail.querySelectorAll('.agents-control-tab')];
        if (!buttons.length) return false;
        const firstTop = Math.round(buttons[0].offsetTop);
        return buttons.every((button) => Math.abs(Math.round(button.offsetTop) - firstTop) <= 1);
    };

    if (SUPPORTS_SCROLL_TIMELINE) {
        sentinel.className = 'agents-scroll-sentinel';

        const measure = () => {
            header.classList.toggle('agents-control-header--no-tuck', !isSingleRowRail());
            const buttons = [...tabRail.querySelectorAll('.agents-control-tab')];
            const tabHeight = buttons[0]?.getBoundingClientRect().height || 0;
            const travel = Math.max(80, Math.round(tabHeight * 1.05));
            sentinel.style.height = `${travel}px`;
            sentinel.style.marginBottom = `-${travel}px`;
        };

        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => measure())
            : null;
        resizeObserver?.observe(tabRail);
        window.addEventListener('resize', measure);
        measure();

        return {
            cleanup() {
                resizeObserver?.disconnect();
                window.removeEventListener('resize', measure);
                header.classList.remove('agents-control-header--no-tuck');
                sentinel.remove();
            }
        };
    }

    sentinel.style.cssText = 'display:block;height:0;width:0;pointer-events:none;visibility:hidden;';

    const state = {
        startY: 0,
        travel: 96,
        enabled: false,
        rafId: 0,
        scrollTarget: getScrollParent(header)
    };

    function getStickyTop() {
        const top = parseFloat(window.getComputedStyle(header).top || '0');
        return Number.isFinite(top) ? top : 0;
    }

    function applyProgress(nextProgress) {
        const progress = Math.max(0, Math.min(1, nextProgress));
        header.style.setProperty('--agents-sticky-progress', progress.toFixed(4));
        header.classList.toggle('agents-control-header--stuck', progress > 0.001);
    }

    function updateProgress() {
        state.rafId = 0;
        if (!state.enabled) {
            applyProgress(0);
            return;
        }
        const progress = (getScrollTopForTarget(state.scrollTarget) - state.startY) / state.travel;
        applyProgress(progress);
    }

    function queueProgressUpdate() {
        if (state.rafId) return;
        state.rafId = window.requestAnimationFrame(updateProgress);
    }

    function measure() {
        const buttons = [...tabRail.querySelectorAll('.agents-control-tab')];
        const nextScrollTarget = getScrollParent(header);
        if (nextScrollTarget !== state.scrollTarget) {
            state.scrollTarget.removeEventListener('scroll', queueProgressUpdate);
            state.scrollTarget = nextScrollTarget;
            state.scrollTarget.addEventListener('scroll', queueProgressUpdate, { passive: true });
        }
        state.enabled = isSingleRowRail();
        if (!state.enabled) {
            applyProgress(0);
            return;
        }

        const stickyTop = getStickyTop();
        const sentinelDocumentTop = getTopWithinScrollTarget(sentinel, state.scrollTarget);
        const tabHeight = buttons[0]?.getBoundingClientRect().height || 0;
        state.startY = Math.max(0, sentinelDocumentTop - stickyTop);
        state.travel = Math.max(80, Math.round(tabHeight * 1.05));
        queueProgressUpdate();
    }

    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => measure())
        : null;
    resizeObserver?.observe(tabRail);

    state.scrollTarget.addEventListener('scroll', queueProgressUpdate, { passive: true });
    window.addEventListener('resize', measure);
    measure();

    return {
        cleanup() {
            if (state.rafId) {
                window.cancelAnimationFrame(state.rafId);
            }
            resizeObserver?.disconnect();
            state.scrollTarget.removeEventListener('scroll', queueProgressUpdate);
            window.removeEventListener('resize', measure);
            header.classList.remove('agents-control-header--stuck');
            header.style.removeProperty('--agents-sticky-progress');
            sentinel.remove();
        }
    };
}

function updatePanelCollapseDom(container, panelKey, collapsed, { animate = true } = {}) {
    const panel = getPanelElement(container, panelKey);
    if (!panel) return;
    panel.classList.toggle('agents-panel--collapsed', collapsed);
    const content = panel.querySelector('.agents-panel__content');
    content?.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
    const toggleButton = panel.querySelector('[data-acc-toggle-panel-collapse]');
    if (toggleButton) {
        const label = collapsed ? 'Expand panel' : 'Collapse panel';
        toggleButton.setAttribute('aria-label', label);
        toggleButton.setAttribute('title', label);
        toggleButton.innerHTML = icon(collapsed ? 'chevronDown' : 'chevronUp', 16).outerHTML;
    }
    setPanelContentHeight(panel, collapsed, { animate });
}

async function togglePanelCollapsedState({
    container,
    data,
    panelKey,
    saveAccPreferences,
    reflowPanelLayout,
    collapsed
}) {
    const nextCollapsed = collapsed === undefined
        ? togglePreferenceValue(data.preferences?.collapsedWidgets || [], panelKey)
        : (collapsed
            ? [...new Set([...(data.preferences?.collapsedWidgets || []), String(panelKey)])]
            : (data.preferences?.collapsedWidgets || []).filter((item) => String(item) !== String(panelKey)));

    if (data.preferences) {
        data.preferences.collapsedWidgets = nextCollapsed;
    }
    updatePanelCollapseDom(container, panelKey, nextCollapsed.includes(String(panelKey)), { animate: true });
    reflowPanelLayout?.(panelKey);
    await persistPreference(saveAccPreferences, { collapsedWidgets: nextCollapsed });
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

function openSavedViewsMenu(anchor, { data, applyLocalViewState, saveAccPreferences, showToast }) {
    const savedViews = data.preferences?.savedViews || [];
    const items = savedViews.map((view) => ({
        label: view.name,
        iconName: view.id === data.viewState.savedViewId ? 'star' : 'eye',
        onSelect: async () => {
            const changes = { ...view.query, savedView: view.id, tab: view.tab || 'overview' };
            const removals = ACC_QUERY_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(changes, key));
            await applyLocalViewState({
                changes,
                removals,
                preserveScroll: false
            });
        }
    }));

    if (items.length) items.push({ separator: true });

    items.push(
        {
            label: 'Save Current View',
            iconName: 'copy',
            onSelect: () => openSaveViewModal({ data, applyLocalViewState, saveAccPreferences, showToast })
        },
        {
            label: 'Manage Saved Views',
            iconName: 'settings',
            onSelect: () => openSavedViewsModal({ data, applyLocalViewState, saveAccPreferences, showToast })
        }
    );

    openAccMenu(anchor, items, { align: 'right' });
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
            const widgetOrder = nextPinned.includes(key)
                ? ensureWidgetOrder(prefs.widgetOrder || [], key, { moveToFront: true })
                : (prefs.widgetOrder || []);
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

function openPanelMenu(anchor, {
    container,
    panelKey,
    data,
    applyLocalViewState,
    saveAccPreferences
}) {
    const prefs = data.preferences || {};
    const pinned = (prefs.pinnedWidgets || []).includes(panelKey);
    const collapsed = (prefs.collapsedWidgets || []).includes(panelKey);
    const items = [];
    if (!pinned) {
        items.push({
            label: 'Pin Panel',
            iconName: 'pin',
            onSelect: async () => {
                const nextPinned = togglePreferenceValue(prefs.pinnedWidgets || [], panelKey);
                const widgetOrder = ensureWidgetOrder(prefs.widgetOrder || [], panelKey, { moveToFront: true });
                await applyLocalViewState({
                    preferencePatch: { pinnedWidgets: nextPinned, widgetOrder }
                });
            }
        });
    }
    items.push(
        pinned ? { separator: true } : null,
        {
            label: collapsed ? 'Expand Panel' : 'Collapse Panel',
            iconName: collapsed ? 'chevronDown' : 'chevronUp',
            onSelect: async () => {
                await togglePanelCollapsedState({
                    container,
                    data,
                    panelKey,
                    saveAccPreferences
                });
            }
        },
        {
            label: 'Customize Panels',
            iconName: 'settings',
            onSelect: () => openPanelCustomizeModal({ container, data, applyLocalViewState })
        }
    );
    openAccMenu(anchor, items.filter(Boolean));
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

function bindPanelDragAndDrop({ container, data, saveAccPreferences, panelMeasurements = {}, setPanelMeasurements }) {
    const grid = container.querySelector('.agents-dashboard-grid');
    if (!grid) return { cleanup() {}, reflowPanelLayout() {}, finalizeLayout() {} };
    const interactiveSelector = 'button, a, input, select, textarea, [role="button"], [data-route]';
    const placeholderKey = '__panel_placeholder__';
    let measurements = { ...(panelMeasurements || {}) };
    let currentLayout = null;
    let dragState = null;

    function getPinnedSet() {
        return new Set((data.preferences?.pinnedWidgets || []).map((item) => String(item)));
    }

    function getPartitionForKey(key) {
        return getPinnedSet().has(String(key || '').trim()) ? 'pinned' : 'unpinned';
    }

    function getPanelElements() {
        return [...grid.querySelectorAll('.agents-panel[data-panel-key]')].filter((panel) => String(panel.dataset.panelKey || '') !== placeholderKey);
    }

    function updateMeasurementCache(panels = getPanelElements()) {
        const next = { ...measurements };
        const changed = {};
        panels.forEach((panel) => {
            const key = String(panel.dataset.panelKey || '').trim();
            if (!key) return;
            const measured = measurePanelHeights(panel);
            const previous = next[key];
            if (!previous || previous.collapsedUnits !== measured.collapsedUnits || previous.expandedUnits !== measured.expandedUnits) {
                next[key] = measured;
                changed[key] = measured;
            }
        });
        measurements = next;
        if (Object.keys(changed).length && typeof setPanelMeasurements === 'function') {
            setPanelMeasurements(changed);
        }
        return measurements;
    }

    function createPanelSpec(panel) {
        const key = String(panel.dataset.panelKey || '').trim();
        return {
            key,
            span: getPanelSpan(panel),
            collapsed: panel.classList.contains('agents-panel--collapsed'),
            partition: getPartitionForKey(key),
            measurements
        };
    }

    function getOrderedSpecs({ excludeKey = '' } = {}) {
        const pinned = [];
        const unpinned = [];
        getPanelElements()
            .filter((panel) => String(panel.dataset.panelKey || '').trim() !== String(excludeKey || '').trim())
            .forEach((panel) => {
                const spec = createPanelSpec(panel);
                if (spec.partition === 'pinned') pinned.push(spec);
                else unpinned.push(spec);
            });
        return [...pinned, ...unpinned];
    }

    function buildRuntimeLayout(specs, options = {}) {
        return buildAccPanelLayout(specs, { ...options, measurements });
    }

    function applyLayout(layout, placeholderEl = null) {
        currentLayout = layout;
        const elements = new Map(getPanelElements().map((panel) => [String(panel.dataset.panelKey || '').trim(), panel]));
        if (placeholderEl) elements.set(placeholderKey, placeholderEl);
        layout.items.forEach((item) => {
            if (dragState?.active && item.key === dragState.key) return;
            const element = elements.get(item.key);
            if (!element) return;
            element.style.gridColumn = `${item.x + 1} / span ${item.w}`;
            element.style.gridRow = `${item.y + 1} / span ${item.h}`;
            element.dataset.layoutX = String(item.x);
            element.dataset.layoutY = String(item.y);
            element.dataset.layoutW = String(item.w);
            element.dataset.layoutH = String(item.h);
        });
        grid.style.setProperty('--agents-grid-total-rows', String(layout.totalRows || 1));
    }

    function reorderPanelsInDom(orderedKeys) {
        const elementMap = new Map(getPanelElements().map((panel) => [String(panel.dataset.panelKey || '').trim(), panel]));
        const fragment = document.createDocumentFragment();
        orderedKeys.forEach((key) => {
            const element = elementMap.get(String(key));
            if (element) fragment.appendChild(element);
        });
        grid.appendChild(fragment);
    }

    function persistOrder(orderedKeys) {
        const existing = Array.isArray(data.preferences?.widgetOrder) ? data.preferences.widgetOrder.map((item) => String(item)) : [];
        const visibleSet = new Set(orderedKeys.map((item) => String(item)));
        const finalOrder = [...orderedKeys.map((item) => String(item)), ...existing.filter((item) => !visibleSet.has(item))];
        if (data.preferences) data.preferences.widgetOrder = finalOrder;
        if (typeof saveAccPreferences === 'function') {
            saveAccPreferences({ widgetOrder: finalOrder }).catch((err) => console.warn('Panel drag: failed to persist widget order', err));
        }
    }

    function createPlaceholderElement() {
        const placeholder = document.createElement('div');
        placeholder.className = `card agents-panel agents-panel--placeholder ${dragState.span === 8 ? 'agents-panel--wide' : ''}`;
        placeholder.dataset.panelKey = placeholderKey;
        placeholder.dataset.panelSpan = String(dragState.span);
        placeholder.dataset.panelPartition = dragState.partition;
        return placeholder;
    }

    function resetDraggedPanelStyles(panel) {
        if (!panel) return;
        panel.classList.remove('agents-panel--dragging');
        panel.style.position = '';
        panel.style.left = '';
        panel.style.top = '';
        panel.style.width = '';
        panel.style.height = '';
        panel.style.zIndex = '';
        panel.style.pointerEvents = '';
        panel.style.transform = '';
    }

    function updateDraggedPanelPosition(clientX, clientY) {
        if (!dragState?.active) return;
        dragState.panel.style.left = `${clientX - dragState.offsetX}px`;
        dragState.panel.style.top = `${clientY - dragState.offsetY}px`;
    }

    function deriveOrderedKeysFromLayout(layout, draggedKey = '') {
        return [...layout.items]
            .sort((left, right) => {
                if (left.partition !== right.partition) return left.partition === 'pinned' ? -1 : 1;
                if (left.y !== right.y) return left.y - right.y;
                if (left.x !== right.x) return left.x - right.x;
                return String(left.key).localeCompare(String(right.key));
            })
            .map((item) => item.key === placeholderKey ? draggedKey : item.key)
            .filter(Boolean);
    }

    function getPlaceholderHeightUnits() {
        return getPanelHeightUnits({
            key: placeholderKey,
            collapsed: dragState.collapsed,
            span: dragState.span
        }, {
            ...measurements,
            [placeholderKey]: dragState.measurement
        });
    }

    function getDesiredSlot(clientX, clientY, partitionBounds) {
        const gridRect = grid.getBoundingClientRect();
        const metrics = getGridMetrics(gridRect);
        const rowSize = metrics.rowHeight + metrics.gap;
        const desiredLeft = clientX - dragState.offsetX;
        const desiredTop = clientY - dragState.offsetY;
        const x = getColumnStarts(dragState.span).reduce((bestColumn, column) => {
            const columnLeft = gridRect.left + (column * (metrics.columnWidth + metrics.gap));
            const bestLeft = gridRect.left + (bestColumn * (metrics.columnWidth + metrics.gap));
            return Math.abs(columnLeft - desiredLeft) < Math.abs(bestLeft - desiredLeft) ? column : bestColumn;
        }, 0);
        return {
            gridRect,
            desiredLeft,
            desiredTop,
            x,
            y: Math.max(partitionBounds.startRow, Math.round((desiredTop - gridRect.top) / rowSize))
        };
    }

    function buildPreviewForSlot(specs, x, y) {
        const layout = buildRuntimeLayout(specs, {
            lockedItems: [{
                key: placeholderKey,
                partition: dragState.partition,
                x,
                y,
                span: dragState.span,
                h: getPlaceholderHeightUnits()
            }],
            partitionStartRows: dragState.partition === 'unpinned' ? { unpinned: y } : { pinned: 0 }
        });
        return { x, y, layout, orderedKeys: deriveOrderedKeysFromLayout(layout, dragState.key) };
    }

    function choosePreview(clientX, clientY) {
        const specs = getOrderedSpecs({ excludeKey: dragState.key });
        const baseLayout = buildRuntimeLayout(specs);
        const bounds = baseLayout.partitionBounds[dragState.partition];
        const desired = getDesiredSlot(clientX, clientY, bounds);
        const allowedColumns = getColumnStarts(dragState.span);
        const rowStart = Math.max(bounds.startRow, desired.y - 2);
        const rowEnd = Math.max(bounds.endRow + 4, desired.y + 4);
        let best = null;

        for (let row = rowStart; row <= rowEnd; row += 1) {
            for (const column of allowedColumns) {
                const preview = buildPreviewForSlot(specs, column, row);
                const placeholderItem = preview.layout.byKey.get(placeholderKey);
                const rect = layoutItemToPixels(placeholderItem, desired.gridRect);
                const score = (Math.abs(column - desired.x) * 120) + (Math.abs(row - desired.y) * 40) + (Math.abs(rect.left - desired.desiredLeft) * 0.08) + (Math.abs(rect.top - desired.desiredTop) * 0.08);
                if (!best || score < best.score) best = { score, preview };
            }
        }

        return best?.preview || buildPreviewForSlot(specs, desired.x, desired.y);
    }

    function finalizeLayout() {
        updateMeasurementCache();
        const layout = buildRuntimeLayout(getOrderedSpecs());
        applyLayout(layout);
        return layout;
    }

    function reflowPanelLayout(panelKey) {
        updateMeasurementCache();
        const specs = getOrderedSpecs();
        const anchorIndex = specs.findIndex((spec) => spec.key === String(panelKey));
        const baseLayout = currentLayout || buildRuntimeLayout(specs);
        const anchorSpec = specs[anchorIndex];
        const anchorItem = anchorSpec ? baseLayout.byKey.get(anchorSpec.key) : null;
        if (!anchorSpec || !anchorItem) return finalizeLayout();

        const lockedItems = [];
        const remainingSpecs = [];
        specs.forEach((spec, index) => {
            const item = baseLayout.byKey.get(spec.key);
            if (!item) return;
            if (spec.partition !== anchorSpec.partition) {
                if (anchorSpec.partition === 'unpinned' && spec.partition === 'pinned') {
                    lockedItems.push({ key: spec.key, partition: spec.partition, x: item.x, y: item.y, span: item.w, h: item.h });
                } else if (anchorSpec.partition === 'pinned' && spec.partition === 'unpinned') {
                    remainingSpecs.push(spec);
                }
                return;
            }
            if (index < anchorIndex) {
                lockedItems.push({ key: spec.key, partition: spec.partition, x: item.x, y: item.y, span: item.w, h: item.h });
                return;
            }
            if (spec.key === anchorSpec.key) {
                lockedItems.push({ key: spec.key, partition: spec.partition, x: anchorItem.x, y: anchorItem.y, span: anchorItem.w, h: getPanelHeightUnits(anchorSpec, measurements) });
                return;
            }
            remainingSpecs.push(spec);
        });

        const layout = buildRuntimeLayout(remainingSpecs, {
            lockedItems,
            partitionStartRows: anchorSpec.partition === 'pinned' ? { pinned: anchorItem.y } : { unpinned: anchorItem.y }
        });
        applyLayout(layout);
        return layout;
    }

    function finishDrag(cancelled = false) {
        if (!dragState) return;
        const state = dragState;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        window.removeEventListener('resize', onResize);
        document.body.classList.remove('agents-panels--dragging');
        if (!cancelled && state.active && state.preview) {
            reorderPanelsInDom(state.preview.orderedKeys);
            persistOrder(state.preview.orderedKeys);
        }
        state.placeholder?.remove();
        resetDraggedPanelStyles(state.panel);
        if (state.panel?.releasePointerCapture && state.pointerId != null) {
            try { state.panel.releasePointerCapture(state.pointerId); } catch {}
        }
        dragState = null;
        finalizeLayout();
    }

    function startDrag() {
        if (!dragState || dragState.active) return;
        dragState.active = true;
        dragState.placeholder = createPlaceholderElement();
        grid.appendChild(dragState.placeholder);
        dragState.panel.classList.add('agents-panel--dragging');
        dragState.panel.style.position = 'fixed';
        dragState.panel.style.left = `${dragState.rect.left}px`;
        dragState.panel.style.top = `${dragState.rect.top}px`;
        dragState.panel.style.width = `${dragState.rect.width}px`;
        dragState.panel.style.height = `${dragState.rect.height}px`;
        dragState.panel.style.zIndex = '40';
        dragState.panel.style.pointerEvents = 'none';
        document.body.classList.add('agents-panels--dragging');
        dragState.preview = choosePreview(dragState.lastX, dragState.lastY);
        applyLayout(dragState.preview.layout, dragState.placeholder);
        updateDraggedPanelPosition(dragState.lastX, dragState.lastY);
    }

    function onPointerMove(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        dragState.lastX = event.clientX;
        dragState.lastY = event.clientY;
        if (!dragState.active) {
            if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 6) return;
            startDrag();
        }
        event.preventDefault();
        updateDraggedPanelPosition(event.clientX, event.clientY);
        const preview = choosePreview(event.clientX, event.clientY);
        if (!dragState.preview || preview.x !== dragState.preview.x || preview.y !== dragState.preview.y) {
            dragState.preview = preview;
            applyLayout(preview.layout, dragState.placeholder);
        }
    }

    function onPointerUp(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        finishDrag(false);
    }

    function onResize() {
        if (dragState?.active) {
            dragState.preview = choosePreview(dragState.lastX, dragState.lastY);
            applyLayout(dragState.preview.layout, dragState.placeholder);
            return;
        }
        finalizeLayout();
    }

    function onPointerDown(event) {
        if (event.button !== 0) return;
        const header = event.target.closest('.agents-panel__header');
        if (!header || !grid.contains(header) || event.target.closest(interactiveSelector)) return;
        const panel = header.closest('.agents-panel[data-panel-key]');
        if (!panel || panel.classList.contains('agents-panel--collapsing')) return;
        updateMeasurementCache();
        const key = String(panel.dataset.panelKey || '').trim();
        const rect = panel.getBoundingClientRect();
        dragState = {
            key,
            panel,
            partition: getPartitionForKey(key),
            span: getPanelSpan(panel),
            collapsed: panel.classList.contains('agents-panel--collapsed'),
            measurement: measurements[key] || measurePanelHeights(panel),
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            rect,
            active: false,
            placeholder: null,
            preview: null
        };
        if (panel.setPointerCapture) {
            try { panel.setPointerCapture(event.pointerId); } catch {}
        }
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('resize', onResize);
    }

    updateMeasurementCache();
    finalizeLayout();
    grid.addEventListener('pointerdown', onPointerDown);
    return {
        cleanup() {
            grid.removeEventListener('pointerdown', onPointerDown);
            finishDrag(true);
            window.removeEventListener('resize', onResize);
        },
        reflowPanelLayout,
        finalizeLayout
    };
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
    panelMeasurements,
    setPanelMeasurements,
    renderAccCategoryManager
} = {}) {
    const categories = data.library?.categories || [];
    const agentMap = data.library?.agentMap || new Map();
    const openAccRoute = (route) => openRoute(route, { applyLocalViewState, navigateRoute });
    const goToRoute = (route) => (isAccRoute(route) ? openAccRoute(route) : navigateRoute(route));
    const panelLayoutController = bindPanelDragAndDrop({
        container,
        data,
        saveAccPreferences,
        panelMeasurements,
        setPanelMeasurements
    });
    const stickyHeaderController = bindStickyHeaderTuckIn(container);

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
        const panelCollapse = event.target.closest('[data-acc-toggle-panel-collapse]');
        const panelPin = event.target.closest('[data-acc-toggle-panel-pin]');
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
        const openSavedViews = event.target.closest('#agents-acc-saved-views-menu');
        const openPanelCustomize = event.target.closest('[data-acc-open-panel-customize]');
        const openCategoryManager = event.target.closest('[data-acc-open-category-manager]');
        const clearLibraryFilters = event.target.closest('[data-acc-clear-library-filters]');
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

        if (refreshButton) {
            event.preventDefault();
            location.reload();
            return;
        }

        if (panelMenu) {
            event.preventDefault();
            openPanelMenu(panelMenu, {
                container,
                panelKey: panelMenu.dataset.accPanelMenu,
                data,
                applyLocalViewState,
                saveAccPreferences
            });
            return;
        }

        if (panelCollapse) {
            event.preventDefault();
            const key = String(panelCollapse.dataset.accTogglePanelCollapse || '').trim();
            await togglePanelCollapsedState({
                container,
                data,
                panelKey: key,
                saveAccPreferences,
                reflowPanelLayout: panelLayoutController.reflowPanelLayout
            });
            return;
        }

        if (panelPin) {
            event.preventDefault();
            const key = String(panelPin.dataset.accTogglePanelPin || '').trim();
            const isPinned = (data.preferences?.pinnedWidgets || []).includes(key);
            const nextPinned = togglePreferenceValue(data.preferences?.pinnedWidgets || [], key);
            await applyLocalViewState({
                preferencePatch: {
                    pinnedWidgets: nextPinned,
                    widgetOrder: isPinned
                        ? (data.preferences?.widgetOrder || [])
                        : ensureWidgetOrder(data.preferences?.widgetOrder || [], key, { moveToFront: true })
                }
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
            openSavedViewsMenu(openSavedViews, { data, applyLocalViewState, saveAccPreferences, showToast });
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

    container.querySelectorAll('.agents-panel[data-panel-key]').forEach((panel) => {
        updatePanelCollapseDom(container, panel.dataset.panelKey, panel.classList.contains('agents-panel--collapsed'), { animate: false });
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
        stickyHeaderController.cleanup?.();
        panelLayoutController.cleanup?.();
    };
}
