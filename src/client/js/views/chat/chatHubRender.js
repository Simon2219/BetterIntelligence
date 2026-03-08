import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';

function renderKindLabel(title, escapeHtml) {
    return `
        <div class="chat-hub__kind-label">
            <span class="chat-hub__kind-label-text">${escapeHtml(title)}</span>
        </div>
    `;
}

function renderSidebarItem(chat, kind, selectedChatId, { escapeHtml, formatSidebarDateTime, getPersonalChatTitle }) {
    const selected = String(chat.id || '').toUpperCase() === String(selectedChatId || '').toUpperCase();
    const unreadCount = Math.max(0, parseInt(chat.unreadCount, 10) || 0);
    const hasUnread = unreadCount > 0;
    const dateStr = formatSidebarDateTime(chat.last_message_at || chat.updated_at || chat.created_at || 0);
    const title = kind === 'deployment'
        ? (chat.deployment?.slug ? `/${chat.deployment.slug}` : 'Deployment Chat')
        : getPersonalChatTitle(chat);

    return `
        <button class="chat-hub__item ${selected ? 'chat-hub__item--selected' : ''} ${hasUnread && !selected ? 'chat-hub__item--unread' : ''}" data-chat-id="${escapeHtml(chat.id)}" data-chat-kind="${kind}">
            <div class="chat-hub__item-info">
                <div class="chat-hub__item-row">
                    <span class="chat-hub__item-title">${escapeHtml(title)}</span>
                    <span class="chat-hub__item-right">
                        <span class="chat-hub__item-date">${escapeHtml(dateStr)}</span>
                        ${hasUnread ? `<span class="chat-hub__item-unread">${unreadCount}</span>` : ''}
                    </span>
                </div>
            </div>
        </button>
    `;
}

function renderGroupModelPills(health, escapeHtml) {
    const models = Array.isArray(health?.models) ? health.models : [];
    if (!models.length) {
        return '<span class="chat-hub__pill chat-hub__pill--model chat-hub__pill--model-unknown">No models</span>';
    }
    return models.map((model) => {
        const providerName = model.providerDisplayName || model.provider || 'Provider';
        const modelName = model.displayName || model.modelId || 'Model';
        const slot = String(model.slot || 'text').toLowerCase() === 'image' ? 'image' : 'text';
        const unavailable = model.isAvailable === false;
        const classes = [
            'chat-hub__pill',
            'chat-hub__pill--model',
            `chat-hub__pill--model-type-${slot}`,
            unavailable ? 'chat-hub__pill--model-unavailable' : ''
        ].filter(Boolean).join(' ');
        return `<span class="${classes}" title="${escapeHtml(`${providerName} - ${modelName}`)}">${escapeHtml(`${providerName} - ${modelName}`)}</span>`;
    }).join('');
}

function renderChatGroup(group, selectedChatId, expanded, { escapeHtml, getAgentAvatarUrl, formatSidebarDateTime, getPersonalChatTitle }) {
    const health = evaluateAgentModelHealth(group.agent || {});
    const healthClass = ['ok', 'warning', 'error', 'unknown'].includes(health.state) ? health.state : 'unknown';
    const deploymentName = String(group.chats?.[0]?.deployment?.name || group.chats?.[0]?.deployment?.slug || '').trim();
    const groupTitle = group.kind === 'deployment'
        ? (deploymentName || group.agent?.name || 'Deployment')
        : (group.agent?.name || 'Agent');
    const issuePill = health.state === 'warning'
        ? `<span class="chat-hub__group-alert chat-hub__group-alert--inline chat-hub__group-alert--warning">${health.unavailableModels}/${health.totalModels} models unavailable</span>`
        : health.state === 'error'
            ? '<span class="chat-hub__group-alert chat-hub__group-alert--inline chat-hub__group-alert--error">All models unavailable</span>'
            : '';
    const chatCountText = `${group.chats.length} ${group.chats.length === 1 ? 'chat' : 'chats'}`;
    return `
        <section class="chat-hub__group ${expanded ? 'chat-hub__group--expanded' : 'chat-hub__group--collapsed'} ${health.state === 'warning' ? 'chat-hub__group--warning' : ''} ${health.state === 'error' ? 'chat-hub__group--error' : ''}" data-group="${escapeHtml(group.id)}">
            <button type="button" class="chat-hub__group-header" data-toggle-group="${escapeHtml(group.id)}" aria-expanded="${expanded ? 'true' : 'false'}">
                <span class="chat-hub__group-rail chat-hub__group-rail--${healthClass}" aria-hidden="true"></span>
                <span class="chat-hub__group-main">
                    <span class="chat-hub__group-head">
                        <img class="chat-hub__group-avatar" src="${getAgentAvatarUrl(group.agent, { shape: 'rect' })}" alt="">
                        <span class="chat-hub__group-identity">
                            <span class="chat-hub__group-title-row">
                                <span class="chat-hub__group-title-main">
                                    <span class="chat-hub__group-name">${escapeHtml(groupTitle)}</span>
                                    ${issuePill}
                                </span>
                                <span class="chat-hub__group-chat-count">${escapeHtml(chatCountText)}</span>
                            </span>
                            <span class="chat-hub__group-activity-line chat-hub__group-activity-line--${healthClass}"></span>
                        </span>
                        <span class="chat-hub__group-flap" aria-hidden="true">
                            <span class="chat-hub__group-chevron ${expanded ? 'chat-hub__group-chevron--expanded' : 'chat-hub__group-chevron--collapsed'}"></span>
                        </span>
                        <span class="chat-hub__group-pills chat-hub__group-pills--top">${renderGroupModelPills(health, escapeHtml)}</span>
                        ${group.unreadCount ? `<span class="chat-hub__group-unread">${group.unreadCount}</span>` : ''}
                    </span>
                </span>
            </button>
            <div class="chat-hub__group-list ${expanded ? '' : 'chat-hub__group-list--collapsed'}" data-group-list="${escapeHtml(group.id)}">
                ${group.chats.map((chat) => renderSidebarItem(chat, group.kind, selectedChatId, { escapeHtml, formatSidebarDateTime, getPersonalChatTitle })).join('')}
            </div>
        </section>
    `;
}

function renderNewChatItem(agent, { escapeHtml, getAgentAvatarUrl }) {
    const health = evaluateAgentModelHealth(agent);
    const healthText = health.state === 'error'
        ? 'All models unavailable'
        : health.state === 'warning'
            ? `${health.unavailableModels}/${health.totalModels} unavailable`
            : health.state === 'ok'
                ? 'Ready'
                : 'No model';
    return `<button type="button" class="chat-hub__new-chat-item" data-agent="${escapeHtml(agent.id)}"><img class="chat-hub__new-chat-avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt=""><span class="chat-hub__new-chat-content"><span class="chat-hub__new-chat-name">${escapeHtml(agent.name || 'Agent')}<span class="chat-hub__new-chat-health chat-hub__new-chat-health--${health.state}">${escapeHtml(healthText)}</span></span><span class="chat-hub__new-chat-meta">${escapeHtml(agent.text_provider_display || agent.textProviderDisplayName || agent.text_provider || 'provider')} - ${escapeHtml(agent.text_model_display || agent.textModelDisplayName || agent.text_model || 'model')}</span></span></button>`;
}

export function createHubRenderer({
    api,
    navigate,
    showToast,
    escapeHtml,
    getAgentAvatarUrl,
    createChatForAgent,
    sortByRecent,
    groupChatsByAgent,
    getPersonalChatTitle,
    formatSidebarDateTime,
    getGroupState,
    setGroupState,
    getSidebarState,
    setSidebarState,
    clampSidebarWidth,
    updateChatUnreadBadge,
    installLiveUnreadUpdates,
    hydrateSidebarSummaries,
    bindHubSidebarControls,
    renderChatView
} = {}) {
    return async function renderChatHub(container, selectedChatId = null) {
        try {
            const [agentsRes, personalRes, deploymentRes] = await Promise.all([
                api('/agents').catch(() => ({ data: [] })),
                api('/chats').catch(() => ({ data: [] })),
                api('/chats/deployments').catch(() => ({ data: [] }))
            ]);

            const agents = agentsRes?.data || [];
            const personalChats = (personalRes?.data || []).slice().sort(sortByRecent);
            const deploymentChats = (deploymentRes?.data || []).slice().sort(sortByRecent);
            const chatableAgents = agents.filter((a) => a.isOwner || a.isSubscribed);
            const normalizedPersonalChats = personalChats.map((chat) => {
                if (String(chat.id || '').toUpperCase() === String(selectedChatId || '').toUpperCase()) {
                    return { ...chat, unreadCount: 0, hasUnread: false };
                }
                return chat;
            });
            const personalGroups = groupChatsByAgent(normalizedPersonalChats, 'personal');
            const deploymentGroups = groupChatsByAgent(deploymentChats, 'deployment');
            const hasPersonal = personalGroups.length > 0;
            const hasDeployment = deploymentGroups.length > 0;
            const groupState = getGroupState();

            const context = { escapeHtml, getAgentAvatarUrl, formatSidebarDateTime, getPersonalChatTitle };
            const personalHtml = personalGroups.length
                ? personalGroups.map((group) => renderChatGroup(group, selectedChatId, groupState.map[group.id] !== false, context)).join('')
                : '<p class="chat-hub__empty-list">No personal chats yet.</p>';
            const deploymentHtml = deploymentGroups.length
                ? deploymentGroups.map((group) => renderChatGroup(group, selectedChatId, groupState.map[group.id] !== false, context)).join('')
                : '<p class="chat-hub__empty-list">No deployment chats available.</p>';
            const sections = [];
            if (hasPersonal) sections.push({ key: 'personal', title: 'Personal Chats', body: personalHtml });
            if (hasDeployment) sections.push({ key: 'deployment', title: 'Deployment Chats', body: deploymentHtml });

            const sidebarListHtml = sections.length
                ? sections.map((section) => `
                        <section class="chat-hub__section" data-chat-kind-section="${escapeHtml(section.key)}">
                            ${renderKindLabel(section.title, escapeHtml)}
                            <div class="chat-hub__section-body">
                                ${section.body}
                            </div>
                        </section>
                    `).join('')
                : '<p class="chat-hub__empty-list">No chats yet.</p>';

            container.innerHTML = `
                <div class="chat-hub">
                    <div class="chat-hub__sidebar" id="chat-sidebar">
                        <div class="chat-hub__sidebar-header">
                            <h3>Chats</h3>
                            <div class="chat-hub__sidebar-actions">
                                <button class="btn btn-primary btn-sm" id="new-chat-btn" aria-expanded="false" aria-controls="chat-new-chat-panel">+ New</button>
                            </div>
                        </div>
                        <div class="chat-hub__new-chat" id="chat-new-chat">
                            <div class="chat-hub__new-chat-panel" id="chat-new-chat-panel" aria-hidden="true">
                                <div class="chat-hub__new-chat-search-wrap">
                                    <input type="text" class="form-input form-input--sm chat-hub__new-chat-search" id="chat-new-chat-search" placeholder="Search agents...">
                                </div>
                                <div class="chat-hub__new-chat-list" id="chat-new-chat-list">
                                    ${chatableAgents.length
            ? chatableAgents.map((a) => renderNewChatItem(a, { escapeHtml, getAgentAvatarUrl })).join('')
            : '<p class="chat-hub__new-chat-empty">No agents available.</p>'}
                                </div>
                            </div>
                        </div>
                        <div class="chat-hub__list" id="conv-list">${sidebarListHtml}</div>
                        <div class="chat-hub__sidebar-resize" id="chat-sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Resize chat sidebar"></div>
                    </div>
                    <button type="button" class="chat-hub__sidebar-flap" id="chat-sidebar-flap" aria-label="Collapse chat sidebar">
                        <span class="chat-hub__sidebar-flap-icon" id="chat-sidebar-flap-icon"></span>
                    </button>
                    <div class="chat-hub__main" id="chat-hub-main">
                        ${!selectedChatId ? '<div class="chat-hub__empty"><div class="chat-hub__empty-content"><h3>Select a chat</h3><p class="text-muted">Choose a conversation from the sidebar, or create a new one.</p></div></div>' : ''}
                    </div>
                </div>
            `;

            container.querySelectorAll('.chat-hub__item').forEach((btn) => {
                btn.addEventListener('click', () => {
                    navigate(`/chat/${btn.dataset.chatId}`);
                });
            });

            bindHubSidebarControls({
                container,
                groupState,
                setGroupState,
                getSidebarState,
                setSidebarState,
                clampSidebarWidth,
                navigate,
                createChatForAgent
            });

            hydrateSidebarSummaries({
                chats: normalizedPersonalChats,
                container,
                selectedChatId
            });

            updateChatUnreadBadge();
            installLiveUnreadUpdates(container, selectedChatId);

            if (selectedChatId && selectedChatId !== 'new') {
                const main = container.querySelector('#chat-hub-main');
                if (main) {
                    await renderChatView(main, selectedChatId);
                    if (window.matchMedia('(max-width: 52em)').matches) {
                        main.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
        } catch (err) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
        }
    };
}
