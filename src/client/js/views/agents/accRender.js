import { icon } from '../../utils/dom.js';
import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';
import {
    formatCompactNumber,
    formatCurrency,
    formatInteger,
    formatMetricValue,
    formatPercent,
    formatRelativeDate,
    renderProgressBar,
    renderSparkline,
    renderTrendChart
} from './accCharts.js';
import {
    buildAccPanelLayout,
    getPanelSpan,
    getPanelHeightUnits
} from './accLayout.js';

function renderIcon(name, size = 16) {
    return icon(name, size).outerHTML;
}

function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function esc(value) {
    return escapeAttr(value);
}

function getPrefs(data) {
    return data?.preferences || data?.dashboard?.meta?.preferences || data?.currentUser?.settings?.accControlCenter || {};
}

function isCollapsed(data, key) {
    return (getPrefs(data).collapsedWidgets || []).includes(key);
}

function isPinned(data, key) {
    return (getPrefs(data).pinnedWidgets || []).includes(key);
}

function isCollectionFavorite(data, key) {
    return (getPrefs(data).favoriteSmartCollections || []).includes(key);
}

function isPinnedAgent(data, agentId) {
    return (getPrefs(data).pinnedAgentIds || []).includes(String(agentId));
}

function isCollapsedGroup(data, key) {
    return (getPrefs(data).collapsedLibraryGroups || []).includes(String(key));
}

function isNewerThan(timestamp, cutoff) {
    if (!timestamp || !cutoff) return false;
    const left = new Date(timestamp).getTime();
    const right = new Date(cutoff).getTime();
    return Number.isFinite(left) && Number.isFinite(right) && left > right;
}

function renderToneChip(label, tone = 'default', iconName = '') {
    return `
        <span class="agents-state-chip agents-state-chip--${escapeAttr(tone)}">
            ${iconName ? `<span class="agents-state-chip__icon">${renderIcon(iconName, 14)}</span>` : ''}
            <span>${esc(label)}</span>
        </span>
    `;
}

function renderRefreshStatus(lastUpdatedAt) {
    const relative = formatRelativeDate(lastUpdatedAt);
    return `
        <button type="button" class="agents-control-refresh-status" id="agents-acc-refresh" aria-label="Refresh control center" title="Refresh control center">
            <span class="agents-control-refresh-status__icon">${renderIcon('refreshCw', 16)}</span>
            <span class="agents-control-refresh-status__text">Updated ${esc(relative)}</span>
            <span class="agents-control-refresh-status__hover">Refresh now</span>
        </button>
    `;
}

function formatDeltaForMetric(metric, value) {
    if (metric === 'cost') return formatCurrency(value || 0);
    return formatMetricValue(metric, value || 0);
}

function getMetricCompareSummary(data, { preferUsageSection = false } = {}) {
    const metricKey = data.viewState.metric || 'requests';
    const usageCompare = data.dashboard?.usage?.compareSummary?.[metricKey];
    if (preferUsageSection && usageCompare) {
        return {
            ...usageCompare,
            label: 'vs previous window',
            formattedDelta: formatDeltaForMetric(metricKey, usageCompare.delta || 0),
            currentFormatted: formatMetricValue(metricKey, usageCompare.value || 0),
            previousFormatted: formatMetricValue(metricKey, usageCompare.previousValue || 0),
            currentValue: usageCompare.value || 0,
            previousValue: usageCompare.previousValue || 0
        };
    }

    const currentSummary = preferUsageSection
        ? (data.dashboard?.usage?.summary || {})
        : (data.dashboard?.overview?.usage || data.dashboard?.usage?.summary || {});
    const previousSummary = preferUsageSection
        ? (data.dashboard?.usage?.previousSummary || {})
        : (data.dashboard?.overview?.trend?.compare || data.dashboard?.usage?.previousSummary || {});
    const currentValue = metricKey === 'tokens'
        ? Number(currentSummary.totalTokens || 0)
        : metricKey === 'cost'
            ? Number(currentSummary.estimatedCostUsd || 0)
            : Number(currentSummary.requests || 0);
    const previousValue = metricKey === 'tokens'
        ? Number(previousSummary.totalTokens || 0)
        : metricKey === 'cost'
            ? Number(previousSummary.estimatedCostUsd || 0)
            : Number(previousSummary.requests || 0);
    const delta = currentValue - previousValue;
    return {
        value: currentValue,
        previousValue,
        delta,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        label: 'vs previous window',
        formattedDelta: formatDeltaForMetric(metricKey, delta),
        currentFormatted: formatMetricValue(metricKey, currentValue),
        previousFormatted: formatMetricValue(metricKey, previousValue),
        currentValue,
        previousValue
    };
}

function renderHealthIndicator(health, escapeHtml) {
    if (health.state === 'ok') return renderToneChip('Ready', 'success', 'sparkles');
    if (health.state === 'warning') return `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`;
    if (health.state === 'error') return `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`;
    return `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
}

function getOrderedPanels(panels, data) {
    const prefs = getPrefs(data);
    const pinned = new Set((prefs.pinnedWidgets || []).map((item) => String(item)));
    const orderMap = new Map((prefs.widgetOrder || []).map((item, index) => [String(item), index]));
    return [...panels].sort((left, right) => {
        const leftPinned = pinned.has(left.key);
        const rightPinned = pinned.has(right.key);
        if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
        const leftIndex = orderMap.has(left.key) ? orderMap.get(left.key) : Number.MAX_SAFE_INTEGER;
        const rightIndex = orderMap.has(right.key) ? orderMap.get(right.key) : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return (left.order || 0) - (right.order || 0);
    });
}

function getPanelDestinationRoute(panel) {
    const route = String(panel?.destinationRoute || '').trim();
    if (!route) return '';
    try {
        const url = new URL(route, location.origin);
        if (url.pathname === '/agents') return '';
        return `${url.pathname}${url.search}`;
    } catch {
        return route.startsWith('/agents') ? '' : route;
    }
}

function renderPanelCard(panel, data) {
    const collapsed = isCollapsed(data, panel.key);
    const pinned = isPinned(data, panel.key);
    const span = getPanelSpan({
        span: panel.span || (String(panel.className || '').includes('agents-panel--wide') ? 8 : 4)
    });
    const title = panel.title || 'Panel';
    const subtitle = panel.subtitle ? `<p class="text-muted">${panel.subtitle}</p>` : '';
    const summary = panel.summary ? `<span class="agents-panel-summary">${panel.summary}</span>` : '';
    const destinationRoute = getPanelDestinationRoute(panel);
    const layoutItem = data.panelLayout?.byKey?.get(panel.key);
    const style = layoutItem
        ? `style="grid-column:${layoutItem.x + 1} / span ${layoutItem.w};grid-row:${layoutItem.y + 1} / span ${layoutItem.h};"`
        : '';
    return `
        <section class="card agents-panel ${panel.className || ''} ${pinned ? 'agents-panel--pinned' : ''} ${collapsed ? 'agents-panel--collapsed' : ''} ${data.viewState.panelKey === panel.key ? 'agents-panel--targeted' : ''}" data-panel-key="${panel.key}" data-panel-pinned="${pinned ? 'true' : 'false'}" data-panel-span="${span}" data-panel-collapsed="${collapsed ? 'true' : 'false'}" data-panel-partition="${pinned ? 'pinned' : 'unpinned'}" ${style}>
            <div class="agents-panel__header" data-acc-panel-drag-surface>
                <div class="agents-panel__header-main">
                    <span class="agents-panel__drag-cue" aria-hidden="true">${renderIcon('grip', 16)}</span>
                    <div class="agents-panel__titles">
                        <div class="agents-panel__title-row">
                            <h3>${title}</h3>
                            ${pinned ? `
                                <button
                                    type="button"
                                    class="agents-panel-pin-pill"
                                    data-acc-toggle-panel-pin="${panel.key}"
                                    aria-label="Unpin panel"
                                    title="Unpin panel"
                                >
                                    ${renderIcon('pin', 13)}
                                    <span>Pinned</span>
                                </button>
                            ` : ''}
                        </div>
                        ${subtitle}
                    </div>
                </div>
                <div class="agents-panel__action-segment">
                    <button
                        type="button"
                        class="agents-icon-button agents-panel__action-button"
                        data-acc-toggle-panel-collapse="${panel.key}"
                        aria-label="${collapsed ? 'Expand panel' : 'Collapse panel'}"
                        title="${collapsed ? 'Expand panel' : 'Collapse panel'}"
                    >${renderIcon(collapsed ? 'chevronDown' : 'chevronUp', 16)}</button>
                    ${destinationRoute ? `<a href="#" class="agents-icon-button agents-panel__action-button" data-route="${escapeAttr(destinationRoute)}" aria-label="Open destination" title="Open destination">${renderIcon('externalLink', 15)}</a>` : ''}
                    <button type="button" class="agents-icon-button agents-panel__action-button" data-acc-panel-menu="${panel.key}" aria-label="Panel actions" title="Panel actions">${renderIcon('moreHorizontal', 16)}</button>
                </div>
            </div>
            <div class="agents-panel__content" aria-hidden="${collapsed ? 'true' : 'false'}" ${collapsed ? 'style="height:0px;"' : ''}>
                <div class="agents-panel__content-inner">
                    <div class="agents-panel__body">${panel.body}</div>
                    ${summary}
                </div>
            </div>
        </section>
    `;
}

function renderPanelLayout(panels, data) {
    const ordered = getOrderedPanels(panels, data);
    const measurements = data.panelMeasurements || {};
    const specs = ordered.map((panel) => ({
        key: panel.key,
        span: panel.span || (String(panel.className || '').includes('agents-panel--wide') ? 8 : 4),
        collapsed: isCollapsed(data, panel.key),
        partition: isPinned(data, panel.key) ? 'pinned' : 'unpinned',
        measurements,
        estimatedHeightUnits: getPanelHeightUnits({
            key: panel.key,
            span: panel.span || (String(panel.className || '').includes('agents-panel--wide') ? 8 : 4),
            collapsed: isCollapsed(data, panel.key)
        }, measurements)
    }));
    const panelLayout = buildAccPanelLayout(specs);
    data.panelLayout = panelLayout;
    return `
        <div class="agents-dashboard-grid" style="--agents-grid-total-rows:${panelLayout.totalRows};">
            ${ordered.map((panel) => renderPanelCard(panel, data)).join('')}
        </div>
    `;
}

function renderTabNav(activeTab, escapeHtml) {
    const tabs = [
        ['overview', 'Overview', 'layoutGrid'],
        ['library', 'Library', 'folder'],
        ['access', 'Access', 'shield'],
        ['listings', 'Listings', 'layers'],
        ['reviews', 'Reviews', 'clipboardList'],
        ['usage', 'Usage', 'activity']
    ];
    return `
        <div class="agents-control-tab-rail" role="tablist" aria-label="Agent Control Center sections">
              ${tabs.map(([tab, label, iconName]) => `
                  <button
                      type="button"
                      class="agents-control-tab ${activeTab === tab ? 'agents-control-tab--active' : ''}"
                      data-agents-tab="${escapeHtml(tab)}"
                      data-tab-style="${escapeHtml(tab)}"
                      role="tab"
                      aria-label="${escapeAttr(label)}"
                      aria-selected="${activeTab === tab ? 'true' : 'false'}"
                      title="${escapeAttr(label)}"
                  >
                      <span class="agents-control-tab__icon">${renderIcon(iconName, 19)}</span>
                      <span class="agents-control-tab__label">${escapeHtml(label)}</span>
                  </button>
              `).join('')}
        </div>
    `;
}

function renderSavedViewControl(data) {
    const prefs = getPrefs(data);
    const savedViews = prefs.savedViews || [];
    const currentSavedViewId = data.viewState.savedViewId;
    const current = savedViews.find((view) => view.id === currentSavedViewId);
    return `
        <button type="button" class="agents-control-utility-button agents-control-utility-button--saved" id="agents-acc-saved-views-menu" aria-label="Saved views" title="Saved views">
            ${renderIcon('star', 15)}
            <span>${esc(current ? current.name : 'Saved Views')}</span>
            ${renderIcon('chevronDown', 14)}
        </button>
    `;
}

function renderHeaderSearchPlaceholder(viewState) {
    return viewState.activeTab === 'library'
        ? 'Search agents, tags, providers...'
        : viewState.activeTab === 'usage'
            ? 'Search models, providers, assets...'
            : 'Search this tab...';
}

function renderContextControls(viewState) {
    if (viewState.activeTab === 'library') {
        return `
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="sort">
                ${[['updated', 'Recently updated'], ['usage', 'Most used'], ['name', 'Name'], ['health', 'Health'], ['listing', 'Listing state']].map(([value, label]) => `<option value="${value}" ${viewState.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="group">
                ${[['category', 'Group: Category'], ['listing', 'Group: Listing'], ['health', 'Group: Health'], ['provider', 'Group: Provider']].map(([value, label]) => `<option value="${value}" ${viewState.group === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="view">
                ${[['cards', 'Cards'], ['list', 'Compact list']].map(([value, label]) => `<option value="${value}" ${viewState.view === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        `;
    }

    if (viewState.activeTab === 'access') {
        return `
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="sort">
                ${[['urgency', 'Urgency'], ['newest', 'Newest'], ['oldest', 'Oldest']].map(([value, label]) => `<option value="${value}" ${viewState.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="source">
                ${[['', 'All sources'], ['manual', 'Manual'], ['legacy_subscription', 'Legacy'], ['access_request', 'Requests'], ['bundle_grant', 'Bundle']].map(([value, label]) => `<option value="${value}" ${viewState.source === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        `;
    }

    if (viewState.activeTab === 'listings' || viewState.activeTab === 'reviews') {
        return `
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="status">
                ${[['', 'All statuses'], ['draft', 'Draft'], ['pending_review', 'Pending'], ['approved', 'Approved'], ['published', 'Published'], ['rejected', 'Rejected'], ['suspended', 'Suspended']].map(([value, label]) => `<option value="${value}" ${viewState.status === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        `;
    }

    if (viewState.activeTab === 'usage') {
        return `
            <div class="agents-segmented-control" role="group" aria-label="Usage metric">
                ${[['requests', 'Requests'], ['tokens', 'Tokens'], ['cost', 'Hosted Cost']].map(([value, label]) => `
                    <button type="button" class="agents-segmented-control__button ${viewState.metric === value ? 'agents-segmented-control__button--active' : ''}" data-acc-metric="${value}">${label}</button>
                `).join('')}
            </div>
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="group">
                ${[['provider', 'Group: Provider'], ['model', 'Group: Model'], ['asset', 'Group: Asset']].map(([value, label]) => `<option value="${value}" ${viewState.group === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        `;
    }

    return '';
}

function renderTimeframeSelect(viewState) {
    return `
        <label class="agents-control-select-shell agents-control-select-shell--timeframe">
            <span class="agents-control-select-shell__label">Window</span>
            <select class="form-input form-input--sm agents-control-select-shell__select" data-acc-param="days" aria-label="Timeframe">
                ${[7, 30, 90].map((days) => `<option value="${days}" ${viewState.days === days ? 'selected' : ''}>${days}d</option>`).join('')}
            </select>
            <span class="agents-control-select-shell__icon">${renderIcon('chevronDown', 14)}</span>
        </label>
    `;
}

function renderTopBar(data, escapeHtml) {
    const meta = data.dashboard?.meta || {};
    const viewState = data.viewState;
    const contextControls = renderContextControls(viewState);
    return `
        <div class="agents-control-header">
            <div class="agents-control-header__top">
                <div class="agents-control-header__title-block">
                    <h1 class="agents-control-title">Agent Control Center</h1>
                    <p class="agents-control-description">Operate agents, listings, access, and usage from one place.</p>
                </div>
                <div class="agents-control-header__controls">
                    ${renderSavedViewControl(data)}
                    <button type="button" class="agents-control-utility-button" data-acc-open-panel-customize aria-label="Panel options" title="Panel options">
                        ${renderIcon('sliders', 15)}
                        <span>Panels</span>
                    </button>
                    ${renderRefreshStatus(meta.lastUpdatedAt)}
                    <form class="agents-control-search" id="agents-acc-search-form">
                        <input id="agents-acc-search-input" class="form-input form-input--sm agents-control-search__input" type="search" value="${escapeHtml(viewState.q)}" placeholder="${escapeHtml(renderHeaderSearchPlaceholder(viewState))}">
                        <button type="submit" class="agents-control-search__submit" aria-label="Search" title="Search">${renderIcon('search', 16)}</button>
                    </form>
                    ${renderTimeframeSelect(viewState)}
                    <a href="#" class="btn btn-primary agents-control-header__create" data-route="/agentBuilder">Create Agent</a>
                </div>
            </div>
            <div class="agents-control-header__context">
                <div class="agents-control-header__context-slot">
                    ${contextControls || '<div class="agents-control-header__context-empty" aria-hidden="true"></div>'}
                </div>
            </div>
            <div class="agents-control-header__menu-slot">
                ${renderTabNav(viewState.activeTab, escapeHtml)}
            </div>
        </div>
    `;
}

function renderKpiCards(kpis = {}) {
    return `
        <div class="agents-kpi-grid">
            ${Object.values(kpis).map((kpi) => `
                <a href="#" class="card agents-kpi-card" data-route="${escapeAttr(kpi.route || '/agents')}">
                    <span class="agents-kpi-card__label">${esc(kpi.label)}</span>
                    <strong>${formatCompactNumber(kpi.value)}</strong>
                    <span class="agents-kpi-card__delta agents-kpi-card__delta--${escapeAttr(kpi.direction || 'flat')}">
                        ${kpi.delta > 0 ? '+' : ''}${formatCompactNumber(kpi.delta || 0)} | ${esc(kpi.deltaLabel || 'No change')}
                    </span>
                </a>
            `).join('')}
        </div>
    `;
}

function renderAlertList(alerts = []) {
    if (!alerts.length) return '<p class="text-muted">No urgent actions right now.</p>';
    return `
        <div class="agents-alert-stack">
            ${alerts.map((alert) => `
                <a href="#" class="agents-alert-card agents-alert-card--${escapeAttr(alert.severity || 'info')}" data-route="${escapeAttr(alert.route || '/agents')}">
                    <div class="agents-alert-card__icon">${renderIcon('alertTriangle', 16)}</div>
                    <div class="agents-alert-card__content">
                        <strong>${esc(alert.title)}</strong>
                        <span>${esc(alert.description || 'Open to investigate.')}</span>
                    </div>
                </a>
            `).join('')}
        </div>
    `;
}

function renderRecentItems(items = [], data) {
    const lastVisitedAt = getPrefs(data).lastVisitedAt;
    if (!items.length) return '<p class="text-muted">No recent changes yet.</p>';
    return items.map((item) => `
        <a href="#" class="agents-feed-row ${isNewerThan(item.timestamp, lastVisitedAt) ? 'agents-feed-row--new' : ''}" data-route="${escapeAttr(item.route || '/agents')}">
            <div class="agents-feed-row__content">
                <strong>${esc(item.title)}</strong>
                <p>${esc(item.description || 'Updated')}</p>
            </div>
            <span>${formatRelativeDate(item.timestamp)}</span>
        </a>
    `).join('');
}

function matchesQuery(value, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return String(value || '').toLowerCase().includes(q);
}

function renderSpotlights(spotlights = {}) {
    const cards = [
        ...(spotlights.topUsedAssets || []).slice(0, 1).map((asset) => `
            <a href="#" class="agents-highlight-card agents-highlight-card--success" data-route="${escapeAttr(asset.route || `/agentBuilder/${asset.agentId}`)}">
                <span>Top used</span>
                <strong>${esc(asset.title)}</strong>
                <small>${formatCompactNumber(asset.requests || 0)} requests in range</small>
            </a>
        `),
        spotlights.fastestGrowingListing ? `
            <button type="button" class="agents-highlight-card agents-highlight-card--accent" data-acc-open-listing="${escapeAttr(spotlights.fastestGrowingListing.listingId)}">
                <span>Fastest listing</span>
                <strong>${esc(spotlights.fastestGrowingListing.title)}</strong>
                <small>${formatCompactNumber(spotlights.fastestGrowingListing.requests || 0)} requests</small>
            </button>
        ` : '',
        spotlights.highestCostModel ? `
            <a href="#" class="agents-highlight-card agents-highlight-card--warning" data-route="/agents?tab=usage&metric=cost">
                <span>Highest cost model</span>
                <strong>${esc(spotlights.highestCostModel.modelId)}</strong>
                <small>${formatCurrency(spotlights.highestCostModel.estimatedCostUsd)}</small>
            </a>
        ` : '',
        ...(spotlights.leastHealthyAssets || []).slice(0, 2).map((asset) => `
            <a href="#" class="agents-highlight-card agents-highlight-card--danger" data-route="${escapeAttr(asset.route)}">
                <span>Needs attention</span>
                <strong>${esc(asset.title)}</strong>
                <small>${esc(asset.health?.summary || 'Model warning')}</small>
            </a>
        `)
    ].filter(Boolean);
    return cards.length ? `<div class="agents-highlight-grid">${cards.join('')}</div>` : '<p class="text-muted">No highlights yet.</p>';
}

function renderCrossSurfaceCard(title, metric, subtext, route, tone = 'default') {
    return `
        <a href="#" class="agents-cross-card agents-cross-card--${escapeAttr(tone)}" data-route="${escapeAttr(route)}">
            <span>${esc(title)}</span>
            <strong>${esc(metric)}</strong>
            <small>${esc(subtext)}</small>
        </a>
    `;
}

function renderOverviewTab(data, escapeHtml) {
    const overview = data.dashboard?.overview || {};
    const usageCompare = getMetricCompareSummary(data, { preferUsageSection: false });
    const panels = [
        {
            key: 'overview-kpis',
            title: 'Snapshot',
            summary: `${Object.keys(overview.kpis || {}).length} cards`,
            panelRoute: overview.panelRoutes?.kpis || '/agents?tab=overview',
            body: renderKpiCards(overview.kpis || {})
        },
        {
            key: 'overview-trend',
            title: 'Hosted Trend',
            subtitle: usageCompare.label ? `${usageCompare.label}: ${usageCompare.direction === 'down' ? '' : '+'}${usageCompare.formattedDelta || '0'}` : 'Requests, tokens, and hosted cost',
            summary: usageCompare.currentFormatted,
            className: 'agents-panel--wide',
            panelRoute: overview.panelRoutes?.trend || '/agents?tab=usage',
            body: `
                <div class="agents-chart-shell">
                    <div class="agents-chart-shell__toolbar">
                        <div class="agents-segmented-control" role="group" aria-label="Overview trend metric">
                            ${[['requests', 'Requests'], ['tokens', 'Tokens'], ['cost', 'Hosted Cost']].map(([value, label]) => `
                                <button type="button" class="agents-segmented-control__button ${data.viewState.metric === value ? 'agents-segmented-control__button--active' : ''}" data-acc-metric="${value}">${label}</button>
                            `).join('')}
                        </div>
                        <div class="agents-chart-shell__legend">
                            <span>${renderIcon('sparkles', 14)} Current ${usageCompare.currentFormatted}</span>
                            <span>${renderIcon('info', 14)} Prior ${usageCompare.previousFormatted}</span>
                        </div>
                    </div>
                    ${renderTrendChart(overview.trend?.points || [], data.viewState.metric, { escapeHtml, title: 'Usage trend', compareSummary: usageCompare })}
                </div>
            `
        },
        {
            key: 'overview-alerts',
            title: 'Attention Rail',
            subtitle: 'Urgent items across usage, review, and runtime health.',
            summary: `${formatInteger((overview.alerts || []).length)} alerts`,
            panelRoute: overview.panelRoutes?.alerts || '/agents?tab=overview',
            body: renderAlertList(overview.alerts || [])
        },
        {
            key: 'overview-recent',
            title: 'Recent Activity',
            subtitle: 'What changed since your last visit.',
            summary: `${formatInteger((overview.recentActivity || []).length)} recent items`,
            panelRoute: overview.panelRoutes?.recent || '/agents?tab=overview',
            body: `<div class="agents-feed-list">${renderRecentItems(overview.recentActivity || [], data)}</div>`
        },
        {
            key: 'overview-spotlights',
            title: 'Highlights',
            subtitle: 'Fast movers, cost spikes, and assets needing action.',
            summary: 'Performance and attention',
            panelRoute: overview.panelRoutes?.highlights || '/agents?tab=overview',
            className: 'agents-panel--wide',
            body: renderSpotlights(overview.spotlights || {})
        },
        {
            key: 'overview-cross-surface',
            title: 'Federated Summary',
            subtitle: 'Jump into related workflow hubs without duplicating them here.',
            summary: 'Deploy, Skills, Hub',
            panelRoute: overview.panelRoutes?.federation || '/agents?tab=overview',
            body: `
                <div class="agents-cross-grid">
                    ${renderCrossSurfaceCard(
                        'Deployments',
                        formatInteger(overview.crossSurface?.deployments?.count || 0),
                        `${formatInteger(overview.crossSurface?.deployments?.unhealthyCount || 0)} unhealthy | ${formatInteger(overview.crossSurface?.deployments?.sponsorRiskCount || 0)} sponsor risk`,
                        overview.crossSurface?.deployments?.route || '/deploy',
                        'warning'
                    )}
                    ${renderCrossSurfaceCard(
                        'Skills',
                        formatInteger((overview.crossSurface?.skills?.workspaceCount || 0) + (overview.crossSurface?.skills?.installedCount || 0)),
                        `${formatInteger(overview.crossSurface?.skills?.workspaceCount || 0)} workspace | ${formatInteger(overview.crossSurface?.skills?.publishedCount || 0)} published`,
                        overview.crossSurface?.skills?.route || '/skills',
                        'accent'
                    )}
                    ${renderCrossSurfaceCard(
                        'Hub',
                        formatInteger(overview.crossSurface?.hub?.publicExposureCount || 0),
                        `${formatInteger(overview.crossSurface?.hub?.approvedExposureCount || 0)} live public listings`,
                        overview.crossSurface?.hub?.route || '/hub',
                        'success'
                    )}
                </div>
            `
        }
    ];
    return renderPanelLayout(panels, data);
}

function renderQuotaItems(items = [], linkedAssets = {}) {
    if (!items.length) return '<p class="text-muted">No quota pressure right now.</p>';
    return items.slice(0, 6).map((item) => {
        const linked = linkedAssets[`${item.asset_type || item.assetType}:${item.asset_id || item.assetId}`] || null;
        return `
            <button type="button" class="agents-row-card agents-row-card--button" data-acc-open-grant="${escapeAttr(item.id)}">
                <div>
                    <strong>${esc(linked?.title || item.title)}</strong>
                    <p>${esc(item.metricKey.replace(/^monthly_/, '').replace(/_/g, ' '))}</p>
                </div>
                <div class="agents-row-card__progress">
                    ${renderProgressBar({
                        percent: item.percentUsed,
                        tone: item.exhausted ? 'danger' : item.percentUsed >= 95 ? 'warning' : 'accent',
                        label: '',
                        detail: `${formatInteger(item.remaining)} left`
                    })}
                </div>
            </button>
        `;
    }).join('');
}

function renderAccessGroupItems(items = [], access, type) {
    if (!items.length) return '<p class="text-muted">Nothing pending here.</p>';
    return items.slice(0, 8).map((item) => {
        const linkedListing = access.linkedListings?.[String(item.listingId || item.listing_id || '')];
        const linkedAsset = access.linkedAssets?.[`${item.asset_type || item.assetType}:${item.asset_id || item.assetId}`];
        const label = linkedListing?.title || linkedAsset?.title || item.title;
        const actionAttr = type === 'request' ? `data-acc-open-request="${escapeAttr(item.id)}"` : `data-acc-open-grant="${escapeAttr(item.id)}"`;
        return `
            <button type="button" class="agents-row-card agents-row-card--button" ${actionAttr}>
                <div class="agents-row-card__main">
                    <strong>${esc(label)}</strong>
                    <p>${esc(item.note || linkedAsset?.route || 'No note provided.')}</p>
                </div>
                <div class="agents-row-card__meta">
                    <span class="agents-pill">${esc(item.status || 'active')}</span>
                    <span>${item.ageDays != null ? `${item.ageDays}d` : formatRelativeDate(item.timestamp)}</span>
                </div>
            </button>
        `;
    }).join('');
}

function renderAccessTab(data, escapeHtml) {
    const access = data.dashboard?.access || {};
    const query = data.viewState.q;
    const source = data.viewState.source;
    const filterItems = (items = []) => items.filter((item) => {
        const sourceValue = String(item.grant_type || item.source || item.status || '').toLowerCase();
        if (source && sourceValue !== source) return false;
        return matchesQuery([item.title, item.note, item.requesterUserId, item.asset_type, item.assetId].filter(Boolean).join(' '), query);
    });
    const quotaSummary = (access.quotaSummary || []).map((item) => renderProgressBar({
        percent: item.percentUsed,
        label: item.metricKey.replace(/^monthly_/, '').replace(/_/g, ' '),
        detail: `${formatInteger(item.used)} / ${formatInteger(item.limit)}`,
        tone: item.percentUsed >= 95 ? 'warning' : item.percentUsed >= 80 ? 'accent' : 'default'
    })).join('');

    const panels = [
        {
            key: 'access-summary',
            title: 'Quota Summary',
            summary: `${formatInteger((access.quotaSummary || []).length)} tracked limits`,
            body: quotaSummary || '<p class="text-muted">No quotas configured.</p>'
        },
        {
            key: 'access-near-exhaustion',
            title: 'Near Exhaustion',
            subtitle: 'Items at or above warning thresholds.',
            summary: `${formatInteger((access.nearExhaustion || []).length)} hot`,
            className: 'agents-panel--wide',
            body: renderQuotaItems(access.nearExhaustion || [], access.linkedAssets || {})
        },
        {
            key: 'access-my-access',
            title: 'My Access',
            summary: `${formatInteger(access.groups?.find((group) => group.key === 'my_access')?.count || 0)} active`,
            body: renderAccessGroupItems(filterItems(access.groups?.find((group) => group.key === 'my_access')?.items || []), access, 'grant')
        },
        {
            key: 'access-incoming',
            title: 'Incoming Requests',
            summary: `${formatInteger(access.groups?.find((group) => group.key === 'incoming_requests')?.count || 0)} incoming`,
            body: renderAccessGroupItems(filterItems(access.groups?.find((group) => group.key === 'incoming_requests')?.items || []), access, 'request')
        },
        {
            key: 'access-outgoing',
            title: 'Outgoing Requests',
            summary: `${formatInteger(access.groups?.find((group) => group.key === 'outgoing_requests')?.count || 0)} outgoing`,
            body: renderAccessGroupItems(filterItems(access.groups?.find((group) => group.key === 'outgoing_requests')?.items || []), access, 'request')
        },
        {
            key: 'access-granted',
            title: 'Granted By Me',
            summary: `${formatInteger(access.groups?.find((group) => group.key === 'granted_by_me')?.count || 0)} active grants`,
            body: renderAccessGroupItems(filterItems(access.groups?.find((group) => group.key === 'granted_by_me')?.items || []), access, 'grant')
        }
    ];

    return renderPanelLayout(panels, data);
}

function renderListingRows(rows = []) {
    if (!rows.length) return '<p class="text-muted">No listings match the current view.</p>';
    return rows.map((listing) => `
        <article class="agents-row-card agents-row-card--listing">
            <a href="#" class="agents-row-card__main agents-row-card__main--link" data-route="${escapeAttr(listing.sourceRoute || listing.route || `/agents?tab=listings&q=${encodeURIComponent(listing.title || '')}`)}">
                <strong>${esc(listing.title)}</strong>
                <p>${esc(listing.assetType || listing.asset_type || 'asset')} | ${esc(listing.visibility || 'private')}</p>
            </a>
            <div class="agents-row-card__meta">
                <span>${formatCompactNumber(listing.requests || 0)} req</span>
                <span>${formatCurrency(listing.estimatedCostUsd || 0)}</span>
                <span class="agents-pill">${esc(listing.status || 'draft')}</span>
            </div>
            <div class="agents-row-card__actions">
                <button type="button" class="agents-icon-button" data-acc-open-listing="${escapeAttr(listing.id || listing.listingId)}" aria-label="Preview listing" title="Preview listing">${renderIcon('eye', 15)}</button>
            </div>
        </article>
    `).join('');
}

function renderListingsTab(data) {
    const listings = data.dashboard?.listings || {};
    const pipeline = listings.pipeline || {};
    const filteredTop = (listings.topListings || []).filter((item) => (!data.viewState.status || String(item.status || '').toLowerCase() === data.viewState.status) && matchesQuery(item.title, data.viewState.q));
    const filteredStale = (listings.stale || []).filter((item) => (!data.viewState.status || String(item.status || '').toLowerCase() === data.viewState.status) && matchesQuery([item.title, (item.reasons || []).join(' ')].join(' '), data.viewState.q));
    const filteredHighlights = (listings.highlights || []).filter((item) => matchesQuery([item.title, item.description].join(' '), data.viewState.q));

    const panels = [
        {
            key: 'listings-pipeline',
            title: 'Listing Pipeline',
            summary: `${Object.values(pipeline).reduce((sum, value) => sum + Number(value || 0), 0)} items`,
            body: `<div class="agents-stat-badges">${Object.entries(pipeline).map(([key, value]) => `<span class="agents-stat-badge"><strong>${formatInteger(value)}</strong>${key.replace(/_/g, ' ')}</span>`).join('')}</div>`
        },
        {
            key: 'listings-top',
            title: 'Top Listings',
            subtitle: 'Most active by requests and hosted cost.',
            summary: `${formatInteger(filteredTop.length)} shown`,
            className: 'agents-panel--wide',
            body: renderListingRows(filteredTop)
        },
        {
            key: 'listings-highlights',
            title: 'Highlights',
            summary: `${formatInteger(filteredHighlights.length)} highlights`,
            body: renderListingRows(filteredHighlights)
        },
        {
            key: 'listings-stale',
            title: 'Needs Action',
            subtitle: 'Missing metadata, plans, or approvals.',
            summary: `${formatInteger(filteredStale.length)} stale`,
            body: renderListingRows(filteredStale)
        },
        {
            key: 'listings-actions',
            title: 'Quick Actions',
            summary: 'Create, update, publish',
            body: `
                <div class="agents-action-stack">
                    <a href="#" class="agents-action-tile agents-action-tile--primary" data-route="/agentBuilder">
                        ${renderIcon('sparkles', 16)}
                        <div><strong>Create Agent</strong><span>Start a new agent draft.</span></div>
                    </a>
                    <a href="#" class="agents-action-tile" data-route="/skills">
                        ${renderIcon('settings', 16)}
                        <div><strong>Open Skills</strong><span>Manage local skill workspace and publishing entrypoints.</span></div>
                    </a>
                    <a href="#" class="agents-action-tile" data-route="/hub">
                        ${renderIcon('externalLink', 16)}
                        <div><strong>View Hub</strong><span>See your public-facing discovery experience.</span></div>
                    </a>
                </div>
            `
        }
    ];

    return renderPanelLayout(panels, data);
}

function renderReviewsTab(data) {
    const reviews = data.dashboard?.reviews || {};
    const timeline = (reviews.timeline || []).filter((item) => (!data.viewState.status || String(item.status || item.decision || '').toLowerCase() === data.viewState.status) && matchesQuery([item.title, item.reason, item.decision].join(' '), data.viewState.q));

    const panels = [
        {
            key: 'reviews-counts',
            title: 'Review Summary',
            summary: `${formatInteger((reviews.timeline || []).length)} events`,
            body: `<div class="agents-stat-badges">${Object.entries(reviews.counts || {}).map(([key, value]) => `<span class="agents-stat-badge"><strong>${formatInteger(value)}</strong>${key}</span>`).join('')}</div>`
        },
        {
            key: 'reviews-timeline',
            title: 'Creator Review Timeline',
            subtitle: 'Queue changes, review decisions, and blocked states.',
            summary: `${formatInteger(timeline.length)} visible`,
            className: 'agents-panel--wide',
            body: timeline.length ? `
                <div class="agents-timeline">
                    ${timeline.map((item) => `
                        <button type="button" class="agents-timeline__item ${item.isBlocked ? 'agents-timeline__item--blocked' : ''}" data-acc-open-review="${escapeAttr(item.id)}">
                            <div class="agents-timeline__content">
                                <strong>${esc(item.title)}</strong>
                                <p>${esc(String(item.decision || 'review').replace(/_/g, ' '))}${item.reason ? ` | ${esc(item.reason)}` : ''}</p>
                            </div>
                            <span>${formatRelativeDate(item.timestamp)}</span>
                        </button>
                    `).join('')}
                </div>
            ` : '<p class="text-muted">No review events for this filter.</p>'
        },
        {
            key: 'reviews-aging',
            title: 'Time In Queue',
            summary: `${formatInteger(reviews.aging?.oldestPendingDays || 0)}d oldest`,
            body: `<div class="agents-stat-badges">${Object.entries(reviews.aging?.queue || {}).map(([key, value]) => `<span class="agents-stat-badge"><strong>${formatInteger(value)}</strong>${key}</span>`).join('')}<span class="agents-stat-badge"><strong>${formatInteger(reviews.aging?.oldestPendingDays || 0)}</strong>oldest pending days</span></div>`
        }
    ];

    return renderPanelLayout(panels, data);
}

function renderUsageBreakdown(viewState, usage) {
    const source = viewState.group === 'asset'
        ? (usage.assetBreakdown || [])
        : viewState.group === 'model'
            ? (usage.modelBreakdown || [])
            : (usage.providerBreakdown || []);
    const filtered = source.filter((row) => matchesQuery([row.agentName, row.modelId, row.providerName, row.key].join(' '), viewState.q));
    if (!filtered.length) return '<p class="text-muted">No breakdown data yet.</p>';
    return filtered.slice(0, 10).map((row) => `
        <a href="#" class="agents-row-card" data-route="${escapeAttr(row.route || '/agents?tab=usage')}">
            <div class="agents-row-card__main">
                <strong>${esc(row.agentName || row.modelId || row.providerName || row.key)}</strong>
                <p>${esc(row.providerName ? `${row.providerName}${row.modelId ? ` / ${row.modelId}` : ''}` : row.key)}</p>
            </div>
            <div class="agents-row-card__meta">
                <span>${formatMetricValue(viewState.metric, viewState.metric === 'cost' ? row.estimatedCostUsd : viewState.metric === 'tokens' ? row.totalTokens : row.requests)}</span>
                <span>${formatPercent(row.errorRate || 0)} err</span>
            </div>
        </a>
    `).join('');
}

function renderUsageTab(data, escapeHtml) {
    const usage = data.dashboard?.usage || {};
    const summary = usage.summary || {};
    const compareSummary = getMetricCompareSummary(data, { preferUsageSection: true });

    const panels = [
        {
            key: 'usage-summary',
            title: 'Usage Summary',
            summary: compareSummary.label ? `${compareSummary.label}: ${compareSummary.formattedDelta || '0'}` : 'Current period',
            body: `
                <div class="agents-usage-summary-grid">
                    <div class="agents-usage-summary-card">
                        <span>Requests</span>
                        <strong>${formatInteger(summary.requests || 0)}</strong>
                    </div>
                    <div class="agents-usage-summary-card">
                        <span>Tokens</span>
                        <strong>${formatCompactNumber(summary.totalTokens || 0)}</strong>
                    </div>
                    <div class="agents-usage-summary-card">
                        <span>Hosted Cost</span>
                        <strong>${formatCurrency(summary.estimatedCostUsd || 0)}</strong>
                    </div>
                    <div class="agents-usage-summary-card">
                        <span>Error Rate</span>
                        <strong>${formatPercent(summary.errorRate || 0)}</strong>
                    </div>
                </div>
            `
        },
        {
            key: 'usage-trend',
            title: 'Interactive Usage Trend',
            subtitle: compareSummary.label ? `${compareSummary.label}: ${compareSummary.direction === 'down' ? '' : '+'}${compareSummary.formattedDelta || '0'}` : 'Requests, tokens, and hosted cost',
            summary: formatMetricValue(data.viewState.metric, compareSummary.currentValue || 0),
            className: 'agents-panel--wide',
            body: `
                <div class="agents-chart-shell">
                    <div class="agents-chart-shell__toolbar">
                        <div class="agents-segmented-control" role="group" aria-label="Usage metric">
                            ${[['requests', 'Requests'], ['tokens', 'Tokens'], ['cost', 'Hosted Cost']].map(([value, label]) => `
                                <button type="button" class="agents-segmented-control__button ${data.viewState.metric === value ? 'agents-segmented-control__button--active' : ''}" data-acc-metric="${value}">${label}</button>
                            `).join('')}
                        </div>
                        <div class="agents-chart-shell__legend">
                            <span>${renderIcon('sparkles', 14)} ${compareSummary.label || 'Compare window'}</span>
                            <span>${renderIcon('copy', 14)} ${compareSummary.formattedDelta || '$0'}</span>
                        </div>
                    </div>
                    ${renderTrendChart(usage.timeseries || [], data.viewState.metric, { escapeHtml, title: 'Usage trend', compareSummary })}
                </div>
            `
        },
        {
            key: 'usage-breakdown',
            title: 'Breakdown',
            subtitle: 'Provider, model, or asset slices based on the current grouping.',
            summary: `${formatInteger((data.viewState.group === 'asset' ? usage.assetBreakdown : data.viewState.group === 'model' ? usage.modelBreakdown : usage.providerBreakdown || []).length || 0)} rows`,
            className: 'agents-panel--wide',
            body: renderUsageBreakdown(data.viewState, usage)
        },
        {
            key: 'usage-anomalies',
            title: 'Anomalies',
            subtitle: 'Spikes, drops, and degraded provider/model health.',
            summary: `${formatInteger((usage.anomalies || []).length)} anomalies`,
            body: renderAlertList(usage.anomalies || [])
        }
    ];

    return renderPanelLayout(panels, data);
}

function renderMiniTrend(series = []) {
    if (!series.length) return '';
    return `<div class="agents-agent-card__trend">${renderSparkline(series, 'requests', { strokeClass: 'agents-sparkline__path agents-sparkline__path--mini' })}</div>`;
}

function renderAgentCard(agent, data, { escapeHtml, getAgentAvatarUrl }) {
    const health = evaluateAgentModelHealth(agent);
    const metrics = data.library.metricsMap.get(String(agent.id));
    const miniSeries = data.library.agentMiniSeries?.[String(agent.id)] || [];
    const lastVisitedAt = getPrefs(data).lastVisitedAt;
    const selected = data.viewState.selectedIds.includes(String(agent.id));
    const pinned = isPinnedAgent(data, agent.id);
    const canOpenHub = agent.market?.visibility === 'public';
    const healthTone = health.state === 'error' ? 'danger' : health.state === 'warning' ? 'warning' : 'default';
    return `
        <article class="card agent-card agent-card--acc ${agent.isSubscribed ? 'agent-card--subscribed' : ''} ${pinned ? 'agent-card--accent' : ''} ${selected ? 'agent-card--selected' : ''} ${agent.isOwner ? 'agent-card--draggable' : ''}" data-agent-id="${escapeAttr(agent.id)}" draggable="${agent.isOwner ? 'true' : 'false'}">
            <div class="agent-card__top">
                <label class="agents-select-toggle" title="Select agent">
                    <input type="checkbox" class="agents-select-toggle__input" data-agent-select="${escapeAttr(agent.id)}" ${selected ? 'checked' : ''}>
                    <span class="agents-select-toggle__box"></span>
                </label>
                <img class="card-avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                <div class="agent-card-header-main">
                    <div class="agent-card-title-row">
                        <div class="card-title">${escapeHtml(agent.name || 'Agent')}</div>
                        ${renderHealthIndicator(health, escapeHtml)}
                        ${agent.market?.status ? renderToneChip(escapeHtml(agent.market.status.replace(/_/g, ' ')), healthTone, agent.market.status === 'pending_review' ? 'info' : '') : ''}
                        ${isNewerThan(agent.updated_at, lastVisitedAt) ? renderToneChip('New', 'accent', 'sparkles') : ''}
                    </div>
                    <div class="card-meta">${escapeHtml(agent.tagline || agent.text_model_display || agent.text_model || 'No model')}</div>
                </div>
                <button type="button" class="agents-icon-button ${pinned ? 'agents-icon-button--active' : ''}" data-pin-agent="${escapeAttr(agent.id)}" aria-label="${pinned ? 'Unpin agent' : 'Pin agent'}" title="${pinned ? 'Unpin agent' : 'Pin agent'}">${renderIcon('pin', 15)}</button>
                <button type="button" class="agents-icon-button" data-agent-menu="${escapeAttr(agent.id)}" aria-label="Agent actions" title="Agent actions">${renderIcon('moreHorizontal', 16)}</button>
            </div>
            <div class="agent-card__chips">
                <span class="badge badge-provider">${escapeHtml(agent.text_provider_display || agent.text_provider || 'provider')}</span>
                <span class="badge badge-model">${escapeHtml(agent.text_model_display || agent.text_model || '-')}</span>
                ${(agent.tags || []).slice(0, 3).map((tag) => `<span class="badge badge-tag">${escapeHtml(tag.name || tag)}</span>`).join('')}
            </div>
            ${metrics ? `
                <div class="agents-agent-metrics">
                    <div><strong>${formatCompactNumber(metrics.requests)}</strong><span>requests</span></div>
                    <div><strong>${formatCurrency(metrics.estimatedCostUsd)}</strong><span>cost</span></div>
                    <div><strong>${formatRelativeDate(metrics.lastUsedAt)}</strong><span>last used</span></div>
                </div>
            ` : '<p class="text-muted agents-agent-metrics__empty">No hosted usage yet.</p>'}
            ${miniSeries.length ? renderMiniTrend(miniSeries) : ''}
            <div class="agent-card__footer">
                <a href="#" class="agents-quick-action agents-quick-action--primary" data-route="/chat?agent=${escapeAttr(agent.id)}" title="Open chat">${renderIcon('sparkles', 14)}<span>Chat</span></a>
                <a href="#" class="agents-quick-action" data-route="/agentBuilder/${escapeAttr(agent.id)}" title="Open editor">${renderIcon('settings', 14)}<span>Edit</span></a>
                <a href="#" class="agents-quick-action" data-route="/agents/${escapeAttr(agent.id)}/analytics" title="View analytics">${renderIcon('panelTop', 14)}<span>Stats</span></a>
            </div>
        </article>
    `;
}

function renderAgentListRow(agent, data, helpers) {
    const metrics = data.library.metricsMap.get(String(agent.id));
    const pinned = isPinnedAgent(data, agent.id);
    const selected = data.viewState.selectedIds.includes(String(agent.id));
    const miniSeries = data.library.agentMiniSeries?.[String(agent.id)] || [];
    return `
        <article class="agents-compact-row ${selected ? 'agents-compact-row--selected' : ''} ${pinned ? 'agents-compact-row--pinned' : ''}" data-agent-id="${escapeAttr(agent.id)}" draggable="${agent.isOwner ? 'true' : 'false'}">
            <label class="agents-select-toggle" title="Select agent">
                <input type="checkbox" class="agents-select-toggle__input" data-agent-select="${escapeAttr(agent.id)}" ${selected ? 'checked' : ''}>
                <span class="agents-select-toggle__box"></span>
            </label>
            <a href="#" class="agents-compact-row__link" data-route="/agentBuilder/${escapeAttr(agent.id)}">
                <div class="agents-compact-row__primary">
                    <strong>${helpers.escapeHtml(agent.name || 'Agent')}</strong>
                    ${pinned ? renderToneChip('Pinned', 'accent', 'pin') : ''}
                </div>
                <span>${helpers.escapeHtml(agent.market?.status || 'unlisted')}</span>
                <span>${formatCompactNumber(metrics?.requests || 0)} req</span>
                <span>${formatCurrency(metrics?.estimatedCostUsd || 0)}</span>
                <span>${formatRelativeDate(agent.updated_at)}</span>
            </a>
            <div class="agents-compact-row__actions">
                ${miniSeries.length ? `<div class="agents-compact-row__spark">${renderSparkline(miniSeries, 'requests', { strokeClass: 'agents-sparkline__path agents-sparkline__path--mini' })}</div>` : ''}
                <button type="button" class="agents-icon-button ${pinned ? 'agents-icon-button--active' : ''}" data-pin-agent="${escapeAttr(agent.id)}" aria-label="${pinned ? 'Unpin agent' : 'Pin agent'}" title="${pinned ? 'Unpin agent' : 'Pin agent'}">${renderIcon('pin', 15)}</button>
                <button type="button" class="agents-icon-button" data-agent-menu="${escapeAttr(agent.id)}" aria-label="Agent actions" title="Agent actions">${renderIcon('moreHorizontal', 16)}</button>
            </div>
        </article>
    `;
}

function renderLibrarySelectionTray(data) {
    const selectedIds = data.viewState.selectedIds;
    const selectedAgents = data.library.ownFiltered.filter((agent) => selectedIds.includes(String(agent.id)));
    const hasSelection = selectedAgents.length > 0;
    return `
        <div class="agents-selection-tray ${hasSelection ? 'agents-selection-tray--active' : ''}">
            <div class="agents-selection-tray__summary">
                <strong>${formatInteger(selectedAgents.length)}</strong>
                <span>${selectedAgents.length === 1 ? 'agent selected' : 'agents selected'}</span>
            </div>
            <div class="agents-selection-tray__actions">
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-action="select-all">Select All Visible</button>
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-action="analytics" ${hasSelection ? '' : 'disabled'}>Analytics</button>
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-action="listings" ${hasSelection ? '' : 'disabled'}>Listings</button>
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-action="deploy" ${hasSelection ? '' : 'disabled'}>Deploy</button>
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-action="clear" ${hasSelection ? '' : 'disabled'}>Clear</button>
                <button type="button" class="btn btn-ghost btn-sm" data-acc-bulk-menu ${hasSelection ? '' : 'disabled'}>${renderIcon('moreHorizontal', 14)}<span>More</span></button>
            </div>
        </div>
    `;
}

function renderSmartCollections(data) {
    const smartCollections = data.library.smartCollections || [];
    if (!smartCollections.length) return '<p class="text-muted">No smart collections yet.</p>';
    return `
        <div class="agents-collection-grid">
            ${smartCollections.map((collection) => `
                <div class="agents-collection-card ${data.viewState.collection === collection.key ? 'agents-collection-card--active' : ''} ${isCollectionFavorite(data, collection.key) ? 'agents-collection-card--favorite' : ''}">
                    <button type="button" class="agents-collection-card__main" data-smart-collection="${escapeAttr(collection.key)}">
                        <strong>${collection.label}</strong>
                        <span>${formatInteger(collection.count)}</span>
                    </button>
                    <button type="button" class="agents-icon-button ${isCollectionFavorite(data, collection.key) ? 'agents-icon-button--active' : ''}" data-acc-favorite-collection="${escapeAttr(collection.key)}" aria-label="${isCollectionFavorite(data, collection.key) ? 'Unfavorite collection' : 'Favorite collection'}" title="${isCollectionFavorite(data, collection.key) ? 'Unfavorite collection' : 'Favorite collection'}">
                        ${renderIcon('star', 15)}
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

function renderLibraryWorkspaceToolbar(data, escapeHtml) {
    const tags = data.library.allTags || [];
    const categories = data.library.categories || [];
    return `
        <div class="agents-library-workspace__toolbar">
            ${tags.length ? `
                <select id="agent-tag-filter" class="form-input form-input--sm ui-select-compact">
                    <option value="">All tags</option>
                    ${tags.map((tag) => `<option value="${escapeAttr(tag.name || tag)}" ${String(tag.name || tag) === data.viewState.tagFilter ? 'selected' : ''}>${escapeHtml(tag.name || tag)}</option>`).join('')}
                </select>
            ` : ''}
            <select class="form-input form-input--sm ui-select-compact" data-acc-param="category">
                <option value="">All categories</option>
                ${categories.map((category) => `<option value="${escapeAttr(category.id)}" ${category.id === data.viewState.categoryFilter ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-ghost btn-sm" data-acc-open-category-manager>${renderIcon('settings', 14)}<span>Manage Categories</span></button>
        </div>
    `;
}

function renderLibraryGroup(group, data, escapeHtml, getAgentAvatarUrl) {
    const collapsed = isCollapsedGroup(data, group.key);
    const isCategoryGroup = data.viewState.group === 'category';
    return `
        <section class="agents-library-group ${isCategoryGroup ? 'agents-library-group--droppable' : ''} ${collapsed ? 'agents-library-group--collapsed' : ''}" ${isCategoryGroup ? `data-category-id="${escapeAttr(group.categoryId ?? '')}"` : ''} data-library-group="${escapeAttr(group.key)}">
            <header class="agents-library-group__header">
                <button type="button" class="agents-library-group__toggle" data-acc-toggle-group="${escapeAttr(group.key)}" aria-expanded="${collapsed ? 'false' : 'true'}">
                    ${renderIcon(collapsed ? 'chevronDown' : 'chevronUp', 15)}
                    <span>${escapeHtml(group.label)}</span>
                </button>
                <div class="agents-library-group__meta">
                    <span class="agents-pill">${formatInteger(group.items.length)}</span>
                </div>
            </header>
            ${collapsed ? '' : `
                <div class="${data.viewState.view === 'list' ? 'agents-compact-list' : 'card-grid agent-card-grid'}">
                    ${group.items.length
        ? group.items.map((agent) => data.viewState.view === 'list'
            ? renderAgentListRow(agent, data, { escapeHtml })
            : renderAgentCard(agent, data, { escapeHtml, getAgentAvatarUrl })).join('')
        : '<p class="text-muted">No agents in this group.</p>'}
                </div>
            `}
        </section>
    `;
}

function renderLibrarySuggested(library, escapeHtml, getAgentAvatarUrl) {
    return library.suggested.length ? `
        <div class="agents-suggested-list">
            ${library.suggested.map((agent) => `
                <a href="#" class="card agents-suggested-card" data-route="/hub/agents/${escapeAttr(agent.id)}">
                    <img src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="" class="agents-suggested-avatar">
                    <div>
                        <strong>${escapeHtml(agent.name || 'Agent')}</strong>
                        <p>${escapeHtml(agent.tagline || 'Open in Hub')}</p>
                    </div>
                </a>
            `).join('')}
        </div>
    ` : '<p class="text-muted">No new hub suggestions right now.</p>';
}

function renderLibraryTab(data, escapeHtml, getAgentAvatarUrl) {
    const library = data.library;
    const panels = [
        {
            key: 'library-smart',
            title: 'Smart Collections',
            subtitle: 'Pin favorites and jump straight into high-signal subsets.',
            summary: `${formatInteger((library.smartCollections || []).length)} collections`,
            className: 'agents-panel--wide',
            body: renderSmartCollections(data)
        },
        {
            key: 'library-summary',
            title: 'Library Summary',
            summary: `${formatInteger(data.dashboard?.library?.summary?.ownAgents || library.own.length)} own`,
            body: `
                <div class="agents-stat-badges">
                    <span class="agents-stat-badge"><strong>${formatInteger(data.dashboard?.library?.summary?.ownAgents || library.own.length)}</strong>own</span>
                    <span class="agents-stat-badge"><strong>${formatInteger(library.subscribed.length)}</strong>subscribed</span>
                    <span class="agents-stat-badge"><strong>${formatInteger(library.chatsThisWeek || 0)}</strong>chats this week</span>
                    <span class="agents-stat-badge"><strong>${formatInteger(data.dashboard?.library?.healthCounts?.warning || 0)}</strong>warnings</span>
                </div>
            `
        },
        {
            key: 'library-bulk',
            title: 'Selection Tray',
            subtitle: 'Work across multiple owned agents without leaving the ACC.',
            summary: `${formatInteger(data.viewState.selectedIds.length)} selected`,
            className: 'agents-panel--wide',
            body: renderLibrarySelectionTray(data)
        },
        {
            key: 'library-groups',
            title: 'Agent Workspace',
            subtitle: 'Pinned agents rise to the top inside each collection and group.',
            summary: `${formatInteger(library.groups.length)} groups`,
            className: 'agents-panel--wide',
            body: `
                <div class="agents-library-workspace">
                    ${renderLibraryWorkspaceToolbar(data, escapeHtml)}
                    ${library.groups.length
        ? library.groups.map((group) => renderLibraryGroup(group, data, escapeHtml, getAgentAvatarUrl)).join('')
        : '<div class="agents-empty-card"><strong>No agents match the current filters.</strong><p>Try clearing filters, opening another smart collection, or creating a new agent.</p><div class="agents-empty-actions"><a href="#" class="btn btn-primary" data-route="/agentBuilder">Create Agent</a><button type="button" class="btn btn-ghost" data-acc-clear-library-filters>Clear Filters</button></div></div>'}
                </div>
            `
        },
        {
            key: 'library-suggested',
            title: 'Suggested From Hub',
            subtitle: 'Summary-only discovery. Full public browsing still lives in Hub.',
            summary: `${formatInteger(library.suggested.length)} suggestions`,
            body: renderLibrarySuggested(library, escapeHtml, getAgentAvatarUrl)
        }
    ];

    return renderPanelLayout(panels, data);
}

export function renderAccView({ data, escapeHtml, getAgentAvatarUrl } = {}) {
    const tabBody = data.viewState.activeTab === 'overview'
        ? renderOverviewTab(data, escapeHtml)
        : data.viewState.activeTab === 'library'
            ? renderLibraryTab(data, escapeHtml, getAgentAvatarUrl)
            : data.viewState.activeTab === 'access'
                ? renderAccessTab(data, escapeHtml)
                : data.viewState.activeTab === 'listings'
                    ? renderListingsTab(data)
                    : data.viewState.activeTab === 'reviews'
                        ? renderReviewsTab(data)
                        : renderUsageTab(data, escapeHtml);

    return `
        <div class="container agents-control-frame">
            <div class="agents-control-shell">
                ${renderTopBar(data, escapeHtml)}
                ${tabBody}
            </div>
        </div>
    `;
}
