import { renderAccCategoryManager as openAccCategoryManager } from './accCategoryManager.js';
import { bindAccInteractions } from './accInteractions.js';
import { renderAccView } from './accRender.js';
const SUPPORTED_TABS = new Set(['overview', 'library', 'access', 'listings', 'reviews', 'usage']);
const TAB_DEFAULTS = {
    overview: { sort: 'priority', group: 'none', view: 'cards' },
    library: { sort: 'updated', group: 'category', view: 'cards' },
    access: { sort: 'urgency', group: 'source', view: 'cards' },
    listings: { sort: 'updated', group: 'status', view: 'cards' },
    reviews: { sort: 'newest', group: 'status', view: 'cards' },
    usage: { sort: 'cost', group: 'provider', view: 'cards' }
};

const EMPTY_LIBRARY_PAYLOAD = {
    agents: [],
    allTags: [],
    categories: [],
    chats: [],
    hubAgents: []
};

function clampDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 365);
}

function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeSavedViews(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map((view) => ({
            id: String(view?.id || view?.name || '').trim(),
            name: String(view?.name || '').trim(),
            tab: SUPPORTED_TABS.has(String(view?.tab || '').trim().toLowerCase())
                ? String(view.tab).trim().toLowerCase()
                : 'overview',
            query: view?.query && typeof view.query === 'object' ? { ...view.query } : {}
        }))
        .filter((view) => view.id && view.name);
}

function normalizeAccPrefs(source) {
    const prefs = source && typeof source === 'object' ? source : {};
    return {
        defaultTab: SUPPORTED_TABS.has(String(prefs.defaultTab || '').trim().toLowerCase())
            ? String(prefs.defaultTab).trim().toLowerCase()
            : 'overview',
        preferredDateRange: clampDays(prefs.preferredDateRange, 30),
        preferredUsageMetric: ['requests', 'tokens', 'cost'].includes(String(prefs.preferredUsageMetric || '').trim().toLowerCase())
            ? String(prefs.preferredUsageMetric).trim().toLowerCase()
            : 'requests',
        libraryView: ['cards', 'list'].includes(String(prefs.libraryView || '').trim().toLowerCase())
            ? String(prefs.libraryView).trim().toLowerCase()
            : 'cards',
        collapsedWidgets: normalizeArray(prefs.collapsedWidgets),
        collapsedLibraryGroups: normalizeArray(prefs.collapsedLibraryGroups),
        pinnedWidgets: normalizeArray(prefs.pinnedWidgets),
        widgetOrder: normalizeArray(prefs.widgetOrder),
        favoriteSmartCollections: normalizeArray(prefs.favoriteSmartCollections),
        pinnedAgentIds: normalizeArray(prefs.pinnedAgentIds),
        savedViews: normalizeSavedViews(prefs.savedViews),
        lastVisitedAt: prefs.lastVisitedAt || null
    };
}

function getUserPrefs(currentUser) {
    return normalizeAccPrefs(currentUser?.settings?.accControlCenter);
}

function matchesSearch(agent, query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const text = [
        agent.name,
        agent.tagline,
        agent.text_provider,
        agent.text_model,
        agent.text_provider_display,
        agent.text_model_display,
        ...(agent.tags || []).map((tag) => tag?.name || tag),
        ...(agent.userPrivateTags || []).map((tag) => tag?.name || tag)
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return text.includes(q);
}

function getAgentMetric(metricsMap, agentId) {
    return metricsMap.get(String(agentId)) || null;
}

function getListingStatus(agent) {
    return String(agent?.market?.status || 'unlisted').trim().toLowerCase();
}

function getHealthState(agent) {
    const textModel = String(agent?.text_model || '').trim();
    if (!textModel) return 'unknown';
    const modelStatus = String(agent?.modelStatus?.state || agent?.health?.state || '').trim().toLowerCase();
    return modelStatus || 'ok';
}

function buildAgentComparator(sortKey, metricsMap) {
    return (left, right) => {
        if (sortKey === 'name') {
            return String(left.name || '').localeCompare(String(right.name || ''));
        }
        if (sortKey === 'usage') {
            const leftUsage = getAgentMetric(metricsMap, left.id)?.requests || 0;
            const rightUsage = getAgentMetric(metricsMap, right.id)?.requests || 0;
            return rightUsage - leftUsage || String(left.name || '').localeCompare(String(right.name || ''));
        }
        if (sortKey === 'health') {
            const score = { error: 3, warning: 2, unknown: 1, ok: 0 };
            const diff = (score[getHealthState(right)] || 0) - (score[getHealthState(left)] || 0);
            return diff || String(left.name || '').localeCompare(String(right.name || ''));
        }
        if (sortKey === 'listing') {
            const diff = getListingStatus(left).localeCompare(getListingStatus(right));
            return diff || String(left.name || '').localeCompare(String(right.name || ''));
        }
        return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
            || String(left.name || '').localeCompare(String(right.name || ''));
    };
}

function sortAgents(list, sortKey, metricsMap, prefs) {
    const pinnedIds = new Set((prefs?.pinnedAgentIds || []).map((id) => String(id)));
    const compare = buildAgentComparator(sortKey, metricsMap);
    return [...list].sort((left, right) => {
        const leftPinned = pinnedIds.has(String(left.id));
        const rightPinned = pinnedIds.has(String(right.id));
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        return compare(left, right);
    });
}

function filterCollection(list, collection, prefs, metricsMap) {
    const pinnedIds = new Set((prefs.pinnedAgentIds || []).map((id) => String(id)));
    const topUsedIds = new Set((prefs.topUsedIds || []).map((id) => String(id)));
    return list.filter((agent) => {
        if (!collection) return true;
        if (collection === 'recent') {
            return new Date(agent.updated_at || 0).getTime() >= Date.now() - (14 * 86400000);
        }
        if (collection === 'pinned') {
            return pinnedIds.has(String(agent.id));
        }
        if (collection === 'drafts') {
            return ['draft', 'pending_review', 'unlisted'].includes(getListingStatus(agent));
        }
        if (collection === 'needs_attention') {
            return ['warning', 'error', 'unknown'].includes(getHealthState(agent))
                || ['rejected', 'suspended', 'pending_review'].includes(getListingStatus(agent));
        }
        if (collection === 'top_used') {
            return topUsedIds.has(String(agent.id)) || (getAgentMetric(metricsMap, agent.id)?.requests || 0) > 0;
        }
        if (collection === 'ready_to_publish') {
            return getHealthState(agent) === 'ok' && ['draft', 'pending_review', 'unlisted'].includes(getListingStatus(agent));
        }
        return true;
    });
}

function orderSmartCollections(collections = [], prefs) {
    const favorites = new Set((prefs.favoriteSmartCollections || []).map((item) => String(item)));
    return [...collections].sort((left, right) => {
        const leftFav = favorites.has(String(left.key));
        const rightFav = favorites.has(String(right.key));
        if (leftFav !== rightFav) return leftFav ? -1 : 1;
        return 0;
    });
}

function getGroupSortKey(group) {
    if (group === 'listing') return 'listing';
    if (group === 'health') return 'health';
    if (group === 'provider') return 'name';
    return 'updated';
}

function buildLibraryGroups({ ownAgents, categories, group, categoryFilter, metricsMap, prefs }) {
    const sortKey = getGroupSortKey(group);

    if (group === 'listing') {
        const labels = {
            unlisted: 'Unlisted',
            draft: 'Draft',
            pending_review: 'Pending Review',
            approved: 'Approved',
            published: 'Published',
            rejected: 'Rejected',
            suspended: 'Suspended'
        };
        const grouped = new Map();
        ownAgents.forEach((agent) => {
            const key = getListingStatus(agent);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(agent);
        });
        return [...grouped.entries()].map(([key, items]) => ({
            key,
            label: labels[key] || key,
            items: sortAgents(items, sortKey, metricsMap, prefs),
            categoryId: ''
        }));
    }

    if (group === 'health') {
        const labels = { ok: 'Healthy', warning: 'Partial', error: 'Unavailable', unknown: 'No Model' };
        const grouped = new Map();
        ownAgents.forEach((agent) => {
            const key = getHealthState(agent);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(agent);
        });
        return [...grouped.entries()].map(([key, items]) => ({
            key,
            label: labels[key] || key,
            items: sortAgents(items, sortKey, metricsMap, prefs),
            categoryId: ''
        }));
    }

    if (group === 'provider') {
        const grouped = new Map();
        ownAgents.forEach((agent) => {
            const key = String(agent.text_provider_display || agent.text_provider || 'No provider');
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(agent);
        });
        return [...grouped.entries()].map(([key, items]) => ({
            key,
            label: key,
            items: sortAgents(items, sortKey, metricsMap, prefs),
            categoryId: ''
        }));
    }

    const byCategory = {};
    const uncategorized = [];
    ownAgents.forEach((agent) => {
        const categoryId = (agent.categoryIds || [])[0];
        if (!categoryId) {
            uncategorized.push(agent);
        } else {
            (byCategory[categoryId] = byCategory[categoryId] || []).push(agent);
        }
    });

    const sections = categories
        .filter((category) => !categoryFilter || category.id === categoryFilter)
        .map((category) => ({
            key: category.id,
            label: category.name,
            categoryId: category.id,
            items: sortAgents(byCategory[category.id] || [], sortKey, metricsMap, prefs)
        }));

    if (!categoryFilter) {
        sections.push({
            key: 'uncategorized',
            label: categories.length ? 'Uncategorized' : 'Own Agents',
            categoryId: '',
            items: sortAgents(uncategorized, sortKey, metricsMap, prefs)
        });
    }

    return sections;
}

function buildAccessLookups(access = {}) {
    const requestMap = new Map();
    const grantMap = new Map();

    (access.groups || []).forEach((group) => {
        (group.items || []).forEach((item) => {
            if (group.key === 'incoming_requests' || group.key === 'outgoing_requests') {
                requestMap.set(String(item.id), item);
            } else {
                grantMap.set(String(item.id), item);
            }
        });
    });

    return {
        requestMap,
        grantMap
    };
}

function getLibraryPanelKeys(activeTab) {
    if (activeTab === 'overview') {
        return ['overview-kpis', 'overview-trend', 'overview-alerts', 'overview-recent', 'overview-spotlights', 'overview-cross-surface'];
    }
    if (activeTab === 'library') {
        return ['library-smart', 'library-summary', 'library-groups', 'library-suggested', 'library-bulk'];
    }
    if (activeTab === 'access') {
        return ['access-summary', 'access-near-exhaustion', 'access-my-access', 'access-incoming', 'access-outgoing', 'access-granted'];
    }
    if (activeTab === 'listings') {
        return ['listings-pipeline', 'listings-top', 'listings-highlights', 'listings-stale', 'listings-actions'];
    }
    if (activeTab === 'reviews') {
        return ['reviews-counts', 'reviews-timeline', 'reviews-aging'];
    }
    return ['usage-summary', 'usage-trend', 'usage-breakdown', 'usage-anomalies'];
}

function parseBaseViewState(locationSearch, prefs) {
    const params = new URLSearchParams(locationSearch || '');
    const requestedTab = String(params.get('tab') || prefs.defaultTab || 'overview').trim().toLowerCase();
    const activeTab = SUPPORTED_TABS.has(requestedTab) ? requestedTab : 'overview';
    const tabDefaults = TAB_DEFAULTS[activeTab] || TAB_DEFAULTS.overview;

    return {
        activeTab,
        days: clampDays(params.get('days'), prefs.preferredDateRange),
        compareDays: clampDays(params.get('compareDays'), clampDays(params.get('days'), prefs.preferredDateRange)),
        metric: ['requests', 'tokens', 'cost'].includes(String(params.get('metric') || prefs.preferredUsageMetric || 'requests').trim().toLowerCase())
            ? String(params.get('metric') || prefs.preferredUsageMetric || 'requests').trim().toLowerCase()
            : 'requests',
        q: String(params.get('q') || '').trim(),
        sort: String(params.get('sort') || tabDefaults.sort).trim().toLowerCase(),
        group: String(params.get('group') || tabDefaults.group).trim().toLowerCase(),
        view: String(params.get('view') || (activeTab === 'library' ? prefs.libraryView : null) || tabDefaults.view).trim().toLowerCase(),
        collection: String(params.get('collection') || '').trim().toLowerCase(),
        status: String(params.get('status') || '').trim().toLowerCase(),
        source: String(params.get('source') || '').trim().toLowerCase(),
        tagFilter: String(params.get('tag') || '').trim(),
        categoryFilter: String(params.get('category') || '').trim(),
        panelKey: String(params.get('panel') || '').trim(),
        savedViewId: String(params.get('savedView') || '').trim(),
        selectedIds: String(params.get('selected') || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    };
}

function getAccRequestState({
    locationSearch = '',
    currentUser = null,
    dashboard = null
} = {}) {
    const preferences = normalizeAccPrefs(currentUser?.settings?.accControlCenter || dashboard?.meta?.preferences);
    return applySavedView(parseBaseViewState(locationSearch, preferences), preferences);
}

function getAccDashboardSections(viewState = {}) {
    const activeTab = SUPPORTED_TABS.has(String(viewState.activeTab || '').trim().toLowerCase())
        ? String(viewState.activeTab).trim().toLowerCase()
        : 'overview';
    const sections = new Set(['overview']);
    if (activeTab !== 'overview') sections.add(activeTab);
    return [...sections];
}

function applySavedView(baseState, prefs) {
    const savedView = (prefs.savedViews || []).find((view) => view.id === baseState.savedViewId);
    if (!savedView) return { ...baseState, savedViewId: '', savedView: null };
    const query = savedView.query || {};
    const activeTab = SUPPORTED_TABS.has(String(query.tab || savedView.tab || baseState.activeTab).trim().toLowerCase())
        ? String(query.tab || savedView.tab || baseState.activeTab).trim().toLowerCase()
        : baseState.activeTab;
    const next = {
        ...baseState,
        ...query,
        activeTab
    };
    return {
        ...next,
        savedView
    };
}

function shapeAccData({
    dashboard = null,
    libraryPayload = {},
    currentUser = null,
    locationSearch = '',
    panelMeasurements = {}
} = {}) {
    const preferences = normalizeAccPrefs(currentUser?.settings?.accControlCenter || dashboard?.meta?.preferences);
    const finalViewState = applySavedView(parseBaseViewState(locationSearch, preferences), preferences);
    const metricsMap = new Map(((dashboard?.library?.agentMetrics) || []).map((row) => [String(row.agentId), row]));
    const topUsedIds = ((dashboard?.library?.topUsedAssets) || []).map((item) => String(item.agentId));
    const agentMiniSeries = dashboard?.library?.agentMiniSeries || {};
    const smartCollections = orderSmartCollections(dashboard?.library?.smartCollections || [], preferences);

    const own = (libraryPayload.agents || []).filter((agent) => agent.isOwner);
    const subscribed = (libraryPayload.agents || []).filter((agent) => agent.isSubscribed);
    const ownFilteredBase = own
        .filter((agent) => !finalViewState.tagFilter || (agent.tags || []).some((tag) => (tag.name || tag) === finalViewState.tagFilter))
        .filter((agent) => matchesSearch(agent, finalViewState.q));

    const libraryPrefs = {
        ...preferences,
        topUsedIds
    };

    const ownFiltered = sortAgents(
        filterCollection(ownFilteredBase, finalViewState.collection, libraryPrefs, metricsMap),
        finalViewState.sort,
        metricsMap,
        preferences
    );
    const subscribedFiltered = sortAgents(
        subscribed.filter((agent) => matchesSearch(agent, finalViewState.q)),
        finalViewState.sort,
        metricsMap,
        preferences
    );

    const chatsThisWeek = (libraryPayload.chats || []).filter((chat) => {
        const timestamp = chat.last_message_at || chat.updated_at || chat.created_at;
        return timestamp && new Date(timestamp).getTime() >= Date.now() - (7 * 86400000);
    }).length;

    const suggested = (libraryPayload.hubAgents || [])
        .filter((agent) => !(libraryPayload.agents || []).some((ownedAgent) => ownedAgent.id === agent.id))
        .slice(0, 4);

    const groups = buildLibraryGroups({
        ownAgents: ownFiltered,
        categories: libraryPayload.categories || [],
        group: finalViewState.group,
        categoryFilter: finalViewState.categoryFilter,
        metricsMap,
        prefs: preferences
    });

    const accessLookups = buildAccessLookups(dashboard?.access || {});

    return {
        dashboard: dashboard
            ? {
                ...dashboard,
                meta: {
                    ...(dashboard.meta || {}),
                    preferences
                }
            }
            : null,
        currentUser,
        preferences,
        panelMeasurements,
        viewState: {
            ...finalViewState,
            availablePanels: getLibraryPanelKeys(finalViewState.activeTab)
        },
        lookups: {
            access: accessLookups,
            listings: new Map((dashboard?.listings?.items || []).map((item) => [String(item.id), item])),
            reviews: new Map(Object.entries(dashboard?.reviews?.detailPreview || {}))
        },
        library: {
            ...libraryPayload,
            smartCollections,
            agentMap: new Map((libraryPayload.agents || []).map((agent) => [String(agent.id), agent])),
            own,
            subscribed,
            ownFiltered,
            subscribedFiltered,
            chatsThisWeek,
            suggested,
            groups,
            metricsMap,
            agentMiniSeries
        }
    };
}

function deriveAccData(baseData, {
    locationSearch = location.search,
    currentUser = null,
    dashboard = null,
    libraryPayload = null,
    panelMeasurements = null
} = {}) {
    const nextCurrentUser = currentUser || baseData?.currentUser || null;
    const nextDashboard = dashboard || baseData?.dashboard || null;
    const nextLibraryPayload = libraryPayload || {
        agents: baseData?.library?.agents || [],
        allTags: baseData?.library?.allTags || [],
        categories: baseData?.library?.categories || [],
        chats: baseData?.library?.chats || [],
        hubAgents: baseData?.library?.hubAgents || []
    };
    return shapeAccData({
        dashboard: nextDashboard,
        libraryPayload: nextLibraryPayload,
        currentUser: nextCurrentUser,
        locationSearch,
        panelMeasurements: panelMeasurements || baseData?.panelMeasurements || {}
    });
}

async function fetchAccResources({
    api,
    locationSearch = '',
    currentUser = null,
    sections = null,
    includeLibrary = null
} = {}) {
    const viewState = getAccRequestState({ locationSearch, currentUser });
    const requestedSections = Array.isArray(sections) && sections.length
        ? [...new Set(sections.map((item) => String(item || '').trim().toLowerCase()).filter((item) => SUPPORTED_TABS.has(item)))]
        : getAccDashboardSections(viewState);
    const shouldIncludeLibrary = typeof includeLibrary === 'boolean'
        ? includeLibrary
        : viewState.activeTab === 'library';

    const dashboardUrl = `/agents/dashboard?days=${viewState.days}&compareDays=${viewState.compareDays}&sections=${encodeURIComponent(requestedSections.join(','))}`;
    const dashboardPromise = api(dashboardUrl).catch((err) => { console.warn('ACC dashboard fetch failed', err); return { data: null }; });

    let libraryPayload = EMPTY_LIBRARY_PAYLOAD;

    if (shouldIncludeLibrary) {
        const [{ data: agents }, { data: allTags }, { data: categories }, { data: chats }, { data: hubAgents }] = await Promise.all([
            api('/agents'),
            api('/agents/tags').catch(() => ({ data: [] })),
            api('/agents/categories').catch(() => ({ data: [] })),
            api('/chats').catch(() => ({ data: [] })),
            api('/hub/agents').catch(() => ({ data: [] }))
        ]);
        libraryPayload = {
            agents: agents || [],
            allTags: allTags || [],
            categories: categories || [],
            chats: chats || [],
            hubAgents: hubAgents || []
        };
    }

    const { data: dashboard } = await dashboardPromise;
    return {
        viewState,
        dashboard,
        libraryPayload
    };
}

export function createAccView(deps) {
    const { api, navigate, showToast, getAgentAvatarUrl, escapeHtml, getCurrentUser, setCurrentUser } = deps;
    let _interactionCleanup = null;
    const accState = {
        requestId: 0,
        dashboard: null,
        libraryPayload: EMPTY_LIBRARY_PAYLOAD,
        libraryLoaded: false,
        currentData: null,
        currentSearch: '',
        lastVisitedAt: 0,
        panelMeasurements: {},
        busy: false,
        debounceTimer: null,
        pendingCall: null
    };

    function buildSearch(baseSearch = '', changes = {}, removals = []) {
        const params = new URLSearchParams(String(baseSearch || '').replace(/^\?/, ''));
        removals.forEach((key) => params.delete(key));
        Object.entries(changes || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') params.delete(key);
            else params.set(key, String(value));
        });
        const query = params.toString();
        return query ? `?${query}` : '';
    }

    function replaceSearch(search = '') {
        const next = `${location.pathname}${search}`;
        history.replaceState(history.state, '', next);
        accState.currentSearch = search || '';
    }

    function mergeDashboard(existing, incoming) {
        if (!incoming) return existing || null;
        const merged = existing ? { ...existing } : {};
        if (incoming.meta) merged.meta = incoming.meta;
        Object.entries(incoming).forEach(([key, value]) => {
            if (key === 'meta') return;
            merged[key] = value;
        });
        return merged;
    }

    function invalidateDashboardSections(sections = []) {
        if (!accState.dashboard) return;
        sections.forEach((section) => {
            delete accState.dashboard[section];
        });
    }

    function focusTargetPanel(container, panelKey) {
        const key = String(panelKey || '').trim();
        if (!key) return;
        const target = container.querySelector(`.agents-panel[data-panel-key="${CSS.escape(key)}"]`);
        if (!target) return;
        requestAnimationFrame(() => {
            target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    async function saveAccPreferences(patch = {}) {
        const currentUser = getCurrentUser?.();
        if (!currentUser) return currentUser;
        const settings = currentUser.settings && typeof currentUser.settings === 'object' ? currentUser.settings : {};
        const currentPrefs = settings.accControlCenter && typeof settings.accControlCenter === 'object' ? settings.accControlCenter : {};
        try {
            const nextUser = await api('/users/me', {
                method: 'PUT',
                body: JSON.stringify({
                    settings: {
                        ...settings,
                        accControlCenter: {
                            ...currentPrefs,
                            ...patch
                        }
                    }
                })
            });
            if (nextUser?.data && typeof setCurrentUser === 'function') {
                const merged = {
                    ...currentUser,
                    ...nextUser.data
                };
                setCurrentUser(merged);
                return merged;
            }
            return currentUser;
        } catch (err) {
            showToast('Failed to save preferences', 'error');
            throw err;
        }
    }

    async function markAccVisited() {
        const currentUser = getCurrentUser?.();
        const currentPrefs = currentUser?.settings?.accControlCenter;
        const lastVisitedAt = currentPrefs?.lastVisitedAt ? new Date(currentPrefs.lastVisitedAt).getTime() : 0;
        if (Number.isFinite(lastVisitedAt) && (Date.now() - lastVisitedAt) < 60000) return;
        try {
            await saveAccPreferences({ lastVisitedAt: new Date().toISOString() });
        } catch {}
    }

    async function renderAccCategoryManagerModal(container, categories) {
        await openAccCategoryManager({
            container,
            categories,
            api,
            showToast,
            escapeHtml,
            onDone: async () => {
                await renderAcc(container, location.pathname + location.search);
            }
        });
    }

    function mountAcc(container, data, opts = {}) {
        const scrollTop = opts.preserveScroll ? window.scrollY : 0;
        const activeEl = document.activeElement;
        const restoreSearchFocus = activeEl?.id === 'agents-acc-search-input';
        const searchCursorPos = restoreSearchFocus ? activeEl.selectionStart : null;

        container.innerHTML = renderAccView({
            data,
            escapeHtml,
            getAgentAvatarUrl
        });

        if (_interactionCleanup) { _interactionCleanup(); _interactionCleanup = null; }
        _interactionCleanup = bindAccInteractions({
            container,
            data,
            api,
            navigateRoute: navigate,
            showToast,
            showConfirm: deps.showConfirm,
            refreshAgents: async (refreshOpts = {}) => applyLocalViewState(container, {
                preserveScroll: true,
                refresh: true,
                invalidateSections: refreshOpts.invalidateAll
                    ? null
                    : (refreshOpts.invalidateSections || null),
                invalidateLibrary: !!refreshOpts.invalidateLibrary,
                removals: refreshOpts.removals || [],
                changes: refreshOpts.changes || {}
            }),
            applyLocalViewState: async (stateOpts = {}) => applyLocalViewState(container, stateOpts),
            saveAccPreferences,
            panelMeasurements: accState.panelMeasurements,
            setPanelMeasurements: (nextMeasurements = {}) => {
                accState.panelMeasurements = {
                    ...accState.panelMeasurements,
                    ...nextMeasurements
                };
                if (accState.currentData) {
                    accState.currentData.panelMeasurements = accState.panelMeasurements;
                }
            },
            renderAccCategoryManager: renderAccCategoryManagerModal
        });

        if (opts.preserveScroll) {
            window.scrollTo(0, scrollTop);
        }
        focusTargetPanel(container, data.viewState.panelKey);

        if (restoreSearchFocus) {
            const nextInput = container.querySelector('#agents-acc-search-input');
            if (nextInput) {
                nextInput.focus();
                if (searchCursorPos != null) {
                    try { nextInput.setSelectionRange(searchCursorPos, searchCursorPos); } catch {}
                }
            }
        }
    }

    async function ensureAccData(search, {
        currentUserOverride = null,
        preserveDashboard = true,
        invalidateSections = null,
        invalidateLibrary = false,
        refresh = false
    } = {}) {
        const requestId = ++accState.requestId;
        const currentUser = currentUserOverride || getCurrentUser?.() || null;
        const nextViewState = getAccRequestState({
            locationSearch: search,
            currentUser,
            dashboard: accState.dashboard
        });
        const requestedSections = getAccDashboardSections(nextViewState);

        if (!preserveDashboard) {
            accState.dashboard = null;
        } else if (refresh) {
            if (Array.isArray(invalidateSections) && invalidateSections.length) {
                invalidateDashboardSections(invalidateSections);
            } else {
                accState.dashboard = null;
            }
        } else if (Array.isArray(invalidateSections) && invalidateSections.length) {
            invalidateDashboardSections(invalidateSections);
        }

        if (invalidateLibrary) {
            accState.libraryPayload = EMPTY_LIBRARY_PAYLOAD;
            accState.libraryLoaded = false;
        }

        const shouldLoadLibrary = nextViewState.activeTab === 'library';
        const missingSections = refresh || !accState.dashboard
            ? requestedSections
            : requestedSections.filter((section) => accState.dashboard?.[section] === undefined);
        const shouldFetchLibrary = shouldLoadLibrary && (refresh || !accState.libraryLoaded || invalidateLibrary);

        let fetched = false;
        if (missingSections.length || shouldFetchLibrary || !accState.dashboard?.meta) {
            const { dashboard, libraryPayload } = await fetchAccResources({
                api,
                locationSearch: search,
                currentUser,
                sections: missingSections.length ? missingSections : requestedSections,
                includeLibrary: shouldFetchLibrary
            });
            if (requestId !== accState.requestId) return null;
            accState.dashboard = mergeDashboard(accState.dashboard, dashboard);
            if (shouldFetchLibrary) {
                accState.libraryPayload = libraryPayload || EMPTY_LIBRARY_PAYLOAD;
                accState.libraryLoaded = true;
            } else if (!accState.libraryPayload) {
                accState.libraryPayload = EMPTY_LIBRARY_PAYLOAD;
            }
            fetched = true;
        }

        if (requestId !== accState.requestId) return null;

        accState.currentSearch = search;
        accState.currentData = deriveAccData({
            dashboard: accState.dashboard,
            libraryPayload: accState.libraryPayload || EMPTY_LIBRARY_PAYLOAD,
            currentUser,
            locationSearch: search,
            panelMeasurements: accState.panelMeasurements
        });
        return { data: accState.currentData, fetched };
    }

    async function applyLocalViewStateCore(container, {
        changes = {},
        removals = [],
        preferencePatch = null,
        preserveScroll = true,
        refresh = false,
        invalidateSections = [],
        invalidateLibrary = false
    } = {}) {
        const baseSearch = accState.currentSearch || location.search;
        const nextSearch = buildSearch(baseSearch, changes, removals);
        replaceSearch(nextSearch);

        const currentUser = getCurrentUser?.() || null;
        const nextViewState = getAccRequestState({
            locationSearch: nextSearch,
            currentUser,
            dashboard: accState.dashboard
        });
        const currentViewState = accState.currentData?.viewState || null;
        const daysChanged = !currentViewState || currentViewState.days !== nextViewState.days || currentViewState.compareDays !== nextViewState.compareDays;
        const needsRefresh = refresh || daysChanged;
        const nextInvalidateSections = daysChanged ? null : invalidateSections;
        const result = await ensureAccData(nextSearch, {
            currentUserOverride: null,
            preserveDashboard: !daysChanged,
            invalidateSections: nextInvalidateSections,
            invalidateLibrary,
            refresh: needsRefresh
        });
        if (!result?.data) return;
        mountAcc(container, result.data, { preserveScroll });
        if (result.fetched && (!accState.lastVisitedAt || (Date.now() - accState.lastVisitedAt) > 60000)) {
            accState.lastVisitedAt = Date.now();
            markAccVisited();
        }

        if (preferencePatch && Object.keys(preferencePatch).length) {
            saveAccPreferences(preferencePatch).catch(() => {});
        }
    }

    function applyLocalViewState(container, opts = {}) {
        return new Promise((resolve) => {
            if (accState.debounceTimer) clearTimeout(accState.debounceTimer);
            accState.pendingCall = { container, opts, resolve };
            accState.debounceTimer = setTimeout(async () => {
                accState.debounceTimer = null;
                async function drainQueue() {
                    const pending = accState.pendingCall;
                    accState.pendingCall = null;
                    if (!pending) return;
                    if (accState.busy) return;
                    accState.busy = true;
                    try {
                        await applyLocalViewStateCore(pending.container, pending.opts);
                    } finally {
                        accState.busy = false;
                    }
                    pending.resolve();
                    if (accState.pendingCall) await drainQueue();
                }
                await drainQueue();
            }, 80);
        });
    }

    async function renderAcc(container, path, opts = {}) {
        const pathValue = String(path || location.pathname + location.search);
        const search = pathValue.includes('?') ? pathValue.slice(pathValue.indexOf('?')) : location.search;
        accState.currentSearch = search;
        if (!opts.preserveCache) {
            accState.dashboard = null;
            accState.libraryPayload = EMPTY_LIBRARY_PAYLOAD;
            accState.libraryLoaded = false;
        }
        try {
            const result = await ensureAccData(search, {
                refresh: true,
                invalidateLibrary: true
            });
            if (!result?.data) return;
            mountAcc(container, result.data, opts);
            if (result.fetched) {
                accState.lastVisitedAt = Date.now();
                markAccVisited();
            }
        } catch (error) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message)}</p></div>`;
        }
    }

    return {
        renderAcc
    };
}
