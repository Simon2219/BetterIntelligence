import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';

function renderHealthIndicator(health, escapeHtml) {
    if (health.state === 'ok') {
        return `<span class="agent-health-indicator agent-health-indicator--ok" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Ready</span>`;
    }
    if (health.state === 'warning') {
        return `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`;
    }
    if (health.state === 'error') {
        return `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`;
    }
    return `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
}

function renderHealthNotice(health, escapeHtml) {
    if (health.state === 'warning') {
        return `<div class="agent-model-notice agent-model-notice--warning">${escapeHtml(health.summaryText)}</div>`;
    }
    if (health.state === 'error') {
        return `<div class="agent-model-notice agent-model-notice--error">${escapeHtml(health.summaryText)}</div>`;
    }
    return '';
}

function renderAgentCard(agent, categories, { escapeHtml, getAgentAvatarUrl }) {
    const health = evaluateAgentModelHealth(agent);
    const healthClass = health.state === 'error'
        ? 'agent-card--model-error'
        : health.state === 'warning'
            ? 'agent-card--model-warning'
            : '';
    const textProviderDisplay = agent.text_provider_display || agent.textProviderDisplayName || agent.text_provider || 'provider';

    return `
        <div class="card agent-card agent-card--relative ${agent.isOwner && categories.length ? 'agent-card--draggable' : ''} ${agent.isSubscribed ? 'agent-card--subscribed' : ''} ${healthClass}" data-agent-id="${agent.id}" ${agent.isOwner && categories.length ? 'draggable="true"' : ''}>
            ${agent.isOwner && categories.length ? `
            <div class="agent-card-menu">
                <button type="button" class="agent-category-arrow" data-agent-id="${agent.id}" title="Options" aria-label="Agent options" aria-haspopup="true"><span class="ui-chevron" aria-hidden="true"></span></button>
            </div>` : ''}
            <div class="card-header">
                <img class="card-avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                <div class="agent-card-header-main">
                    <div class="agent-card-title-row">
                        <div class="card-title">${escapeHtml(agent.name || 'Agent')}</div>
                        ${agent.isSubscribed ? '<span class="badge badge-info">Subscribed</span>' : '<span class="badge badge-ghost">Own</span>'}
                        ${renderHealthIndicator(health, escapeHtml)}
                    </div>
                    <div class="card-meta">${escapeHtml(agent.tagline || agent.text_model_display || agent.textModelDisplayName || agent.text_model || 'No model')}</div>
                </div>
            </div>
            ${renderHealthNotice(health, escapeHtml)}
            <div class="card-body-meta">
                <span class="badge badge-provider">${escapeHtml(textProviderDisplay)}</span>
                <span class="badge badge-model">${escapeHtml(agent.text_model_display || agent.textModelDisplayName || agent.text_model || '-')}</span>
                ${(agent.tags || []).slice(0, 3).map((tag) => `<span class="badge badge-tag">${escapeHtml(tag.name)}</span>`).join('')}
                ${(agent.userPrivateTags || []).map((tag) => `<span class="badge private-tag-badge" style="background:${escapeHtml(tag.color || '#3b82f6')}">${escapeHtml(tag.name)}</span>`).join('')}
            </div>
            <div class="card-actions agent-card-actions">
                <a href="#" class="btn btn-primary" data-route="/chat?agent=${agent.id}">Chat</a>
                ${agent.isOwner ? `
                    <a href="#" class="btn btn-ghost btn-sm" data-route="/agents/${agent.id}">Edit</a>
                    <a href="#" class="btn btn-ghost btn-sm" data-route="/agents/${agent.id}/analytics">Stats</a>
                    <button class="btn btn-ghost btn-sm btn-delete" data-id="${agent.id}">Delete</button>
                ` : `
                    <a href="#" class="btn btn-ghost btn-sm btn-copy-agent" data-id="${agent.id}">Copy</a>
                `}
            </div>
        </div>
    `;
}

function renderSuggestedCard(agent, { escapeHtml, getAgentAvatarUrl }) {
    const health = evaluateAgentModelHealth(agent);
    return `
        <a href="#" class="card agents-suggested-card" data-route="/hub/agents">
            <img src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="" class="agents-suggested-avatar">
            <div class="agents-suggested-main">
                <div class="agents-suggested-name">${escapeHtml(agent.name || 'Agent')}</div>
                <div class="agents-suggested-tagline">${escapeHtml((agent.tagline || '').slice(0, 40))}${(agent.tagline || '').length > 40 ? '...' : ''}</div>
                <div class="agents-suggested-health">${renderHealthIndicator(health, escapeHtml)}</div>
            </div>
        </a>
    `;
}

export function renderAgentsListView({
    data,
    escapeHtml,
    getAgentAvatarUrl
} = {}) {
    const {
        agents,
        allTags,
        categories,
        tagFilter,
        categoryFilter,
        ownFiltered,
        subscribedFiltered,
        ownByCategory,
        ownUncategorized,
        chatsThisWeek,
        suggested
    } = data;

    const cardHelpers = { escapeHtml, getAgentAvatarUrl };
    const categorySections = categories
        .filter((category) => !categoryFilter || category.id === categoryFilter)
        .map((category) => {
            const items = ownByCategory[category.id] || [];
            return `
                <div class="agents-category agents-category-drop" data-category-id="${category.id}">
                    <h3 class="agents-category-title">${escapeHtml(category.name)} <span class="badge badge-ghost">${items.length}</span></h3>
                    <div class="card-grid agent-card-grid agents-category-cards agents-category-dropzone ${!items.length ? 'agents-category-dropzone--empty agents-category-dropzone--tall' : ''}">${items.length ? items.map((agent) => renderAgentCard(agent, categories, cardHelpers)).join('') : '<div class="agents-category-empty-hint">Drop agents here</div>'}</div>
                </div>
            `;
        }).join('');

    return `
        <div class="container">
            ${!agents?.length ? `
                <div class="card empty-state">
                    <div class="empty-state-icon">&#x1F916;</div>
                    <h3>No agents yet</h3>
                    <p>Create your first AI agent or browse the Hub</p>
                    <div class="agents-empty-actions">
                        <a href="#" class="btn btn-primary" data-route="/agents/new">Create Agent</a>
                        <a href="#" class="btn btn-ghost" data-route="/hub">Browse Hub</a>
                    </div>
                </div>
            ` : `
                ${(tagFilter || categoryFilter) ? `<p class="text-muted agents-filter-note">${tagFilter ? `Filtering by tag: <strong>${escapeHtml(tagFilter)}</strong>` : ''}${tagFilter && categoryFilter ? ' | ' : ''}${categoryFilter ? `Filtering by category: <strong>${escapeHtml(categories.find((c) => c.id === categoryFilter)?.name || 'Selected')}</strong> <a href="#" id="clear-category-filter" class="agents-clear-filter">Clear</a>` : ''}</p>` : ''}
                <div class="agents-dashboard">
                    <div class="agents-stats-row">
                        <div class="card agents-stat-card">
                            <div class="agents-stat-value agents-stat-value--primary">${agents.length}</div>
                            <div class="agents-stat-label">Total Agents</div>
                        </div>
                        <div class="card agents-stat-card">
                            <div class="agents-stat-value agents-stat-value--secondary">${chatsThisWeek}</div>
                            <div class="agents-stat-label">Chats This Week</div>
                        </div>
                    </div>
                    <div class="agents-toolbar">
                        <h2 class="agents-toolbar__title">My Agents</h2>
                        <div class="agents-toolbar__actions">
                            ${allTags.length ? `
                            <select id="agent-tag-filter" class="form-input form-input--sm ui-select-compact">
                                <option value="">All tags</option>
                                ${allTags.map((tag) => `<option value="${escapeHtml(tag.name)}" ${tag.name === tagFilter ? 'selected' : ''}>${escapeHtml(tag.name)} (${tag.agent_count ?? 0})</option>`).join('')}
                            </select>
                            ` : ''}
                            ${categories.length || ownFiltered.length ? `
                            <div class="agents-category-dropdown">
                                <button type="button" class="btn btn-ghost agents-category-trigger" id="agents-category-arrow" title="Categories" aria-haspopup="true"><span>Categories</span><span class="ui-chevron" aria-hidden="true"></span></button>
                                <div id="agents-category-submenu" class="agents-category-submenu"></div>
                            </div>` : ''}
                            <a href="#" class="btn btn-primary" data-route="/agents/new">+ New Agent</a>
                        </div>
                    </div>
                    <div class="agents-categories-grid">
                        ${categories.length ? categorySections : ''}
                        <div class="agents-section agents-own agents-category agents-category-drop ${categoryFilter && categoryFilter !== '' ? 'agents-section--hidden' : ''}" data-category-id="">
                            <h3 class="agents-category-title">${categories.length ? 'Uncategorized' : 'Own Agents'} <span class="badge badge-ghost">${categories.length ? ownUncategorized.length : ownFiltered.length}</span></h3>
                            ${(categories.length ? ownUncategorized : ownFiltered).length ? `
                                <div class="card-grid agent-card-grid agents-category-cards agents-category-dropzone">${(categories.length ? ownUncategorized : ownFiltered).map((agent) => renderAgentCard(agent, categories, cardHelpers)).join('')}</div>
                            ` : categories.length ? `
                                <div class="card-grid agent-card-grid agents-category-cards agents-category-dropzone agents-category-dropzone--empty agents-category-dropzone--tall"><div class="agents-category-empty-hint">Drop agents here</div></div>
                            ` : `
                                <div class="agents-empty-hint">
                                    <div class="agents-empty-icon">&#x1F916;</div>
                                    <p>No own agents yet. Create your first agent or browse the Hub to subscribe.</p>
                                    <div class="agents-empty-actions agents-empty-actions--top">
                                        <a href="#" class="btn btn-primary" data-route="/agents/new">Create Agent</a>
                                        <a href="#" class="btn btn-ghost" data-route="/hub">Browse Hub</a>
                                    </div>
                                </div>
                            `}
                        </div>
                    </div>
                    <div class="agents-section agents-subscribed">
                        <h3 class="agents-category-title">Subscribed Agents <span class="badge badge-ghost">${subscribedFiltered.length}</span></h3>
                        ${subscribedFiltered.length ? `
                            <div class="card-grid agent-card-grid">${subscribedFiltered.map((agent) => renderAgentCard(agent, categories, cardHelpers)).join('')}</div>
                        ` : `
                            <div class="agents-empty-hint">
                                <div class="agents-empty-icon">&#x1F517;</div>
                                <p>No subscribed agents. Browse the Hub to discover and subscribe to agents.</p>
                                <a href="#" class="btn btn-ghost agents-link-top" data-route="/hub">Browse Hub</a>
                            </div>
                        `}
                    </div>
                    ${suggested.length ? `
                    <div class="agents-suggested">
                        <h3 class="agents-suggested-title">Suggested from Hub</h3>
                        <div class="agents-suggested-list">
                            ${suggested.map((agent) => renderSuggestedCard(agent, cardHelpers)).join('')}
                            <a href="#" class="btn btn-ghost btn-sm btn-chevron btn-chevron--forward" data-route="/hub"><span>Browse Hub</span><span class="ui-chevron ui-chevron--right" aria-hidden="true"></span></a>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `}
        </div>
    `;
}
