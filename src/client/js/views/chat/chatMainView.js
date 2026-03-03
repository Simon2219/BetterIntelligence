import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';

export function createChatView(deps) {
    const {
        api,
        navigate,
        showToast,
        getAgentAvatarUrl,
        escapeHtml,
        createSocket,
        clearChatSocketListeners,
        updateChatUnreadBadge,
        showMediaUploadPreview,
        showMediaViewer,
        icon,
        getToken,
        API_BASE,
        getCurrentUser
    } = deps;

    const summaryHydrationInFlight = new Set();
    const summaryHydrationStamp = new Map();
    let liveUnreadEventHandler = null;
    const SIDEBAR_SUMMARY_MAX_CHARS = 30;

    function clampSidebarWidth(value) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n)) return 320;
        return Math.max(300, Math.min(520, n));
    }

    function getGroupState() {
        const userId = String(getCurrentUser()?.id || 'anon').toUpperCase();
        const key = `chat_groups_${userId}`;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : {};
            return { key, map: parsed && typeof parsed === 'object' ? parsed : {} };
        } catch {
            return { key, map: {} };
        }
    }

    function setGroupState(state) {
        if (!state?.key) return;
        try {
            localStorage.setItem(state.key, JSON.stringify(state.map || {}));
        } catch {}
    }

    function getSidebarState() {
        const userId = String(getCurrentUser()?.id || 'anon').toUpperCase();
        const key = `chat_sidebar_ui_${userId}`;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { key, width: 320, collapsed: false };
            const parsed = JSON.parse(raw);
            return {
                key,
                width: clampSidebarWidth(parsed?.width),
                collapsed: parsed?.collapsed === true
            };
        } catch {
            return { key, width: 320, collapsed: false };
        }
    }

    function setSidebarState(state) {
        if (!state?.key) return;
        try {
            localStorage.setItem(state.key, JSON.stringify({
                width: clampSidebarWidth(state.width),
                collapsed: state.collapsed === true
            }));
        } catch {}
    }

    function parseMetadata(value) {
        if (!value) return {};
        if (typeof value === 'object') return value;
        try { return JSON.parse(value || '{}'); } catch { return {}; }
    }

    function simpleMarkdown(text) {
        let html = escapeHtml(String(text || ''));
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function formatTimestamp(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getLocaleDateOrder() {
        try {
            const parts = new Intl.DateTimeFormat(undefined, {
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date(2026, 10, 25));
            const monthIdx = parts.findIndex((p) => p.type === 'month');
            const dayIdx = parts.findIndex((p) => p.type === 'day');
            if (monthIdx === -1 || dayIdx === -1) return 'MD';
            return dayIdx < monthIdx ? 'DM' : 'MD';
        } catch {
            return 'MD';
        }
    }

    function isLocale12Hour() {
        try {
            const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
            if (typeof resolved.hour12 === 'boolean') return resolved.hour12;
            const hc = String(resolved.hourCycle || '').toLowerCase();
            return hc === 'h11' || hc === 'h12';
        } catch {
            return true;
        }
    }

    const sidebarDateOrder = getLocaleDateOrder();
    const sidebarUse12Hour = isLocale12Hour();

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatSidebarDateTime(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const month = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        const datePart = sidebarDateOrder === 'DM' ? `${day}/${month}` : `${month}/${day}`;
        const timePart = d.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: sidebarUse12Hour
        });
        return `${datePart} ${timePart}`;
    }

    function resolveMediaUrl(url) {
        if (!url) return '';
        return url.startsWith('/') ? url : `/media/${url}`;
    }

    function messageRole(m, chat, currentUser) {
        const sender = String(m.senderId || '').trim();
        if (!sender) return 'assistant';
        if (currentUser && String(currentUser.id || '').toUpperCase() === sender.toUpperCase()) return 'user';
        if (sender.startsWith('embed:')) return 'user';
        if (chat?.chatType === 'deployment') {
            const agentId = String(chat.ai_agent_id || chat.agent_id || '').toUpperCase();
            if (agentId && sender.toUpperCase() !== agentId) return 'user';
        }
        return 'assistant';
    }

    function renderChatMessage(m) {
        const meta = parseMetadata(m.metadata);
        const media = m.media || meta.media || [];
        const mediaUrl = m.mediaUrl || m.media_url;
        const msgType = m.type;
        const mediaItems = media.length ? media : (mediaUrl ? [{ type: msgType || 'image', url: mediaUrl }] : []);
        const isMediaMsg = msgType === 'image' || msgType === 'video' || msgType === 'media' || mediaItems.length > 0;
        const isAssistant = m.role === 'assistant';
        let html = isAssistant ? simpleMarkdown(m.content || '') : escapeHtml(m.content || '');

        mediaItems.forEach((med, idx) => {
            const url = resolveMediaUrl(med.url || med.mediaUrl);
            if (!url) return;
            if (med.type === 'video') html += `<div class="chat-msg__media-thumb chat-msg__media-thumb--video" data-index="${idx}"><video src="${url}" muted></video></div>`;
            else html += `<img src="${url}" alt="Media" class="chat-msg__media-thumb chat-msg__image" data-index="${idx}">`;
        });

        if (!html.trim() && !mediaItems.length) return '';
        const ts = formatTimestamp(m.created_at || m.timestamp);
        const actions = isAssistant ? `<div class="chat-msg__actions"><button class="btn-copy-msg" title="Copy">${copyIcon}</button></div>` : '';
        const dataAttrs = isMediaMsg ? ` data-msg-type="${escapeHtml(msgType || 'media')}" data-media-url="${escapeHtml(mediaUrl || '')}" data-media="${escapeHtml(JSON.stringify(mediaItems))}"` : '';
        return `<div class="chat-msg chat-msg--${m.role}"${dataAttrs}><div class="chat-msg__content">${html}</div>${actions}<span class="chat-msg__time">${ts}</span></div>`;
    }

    function sortByRecent(left, right) {
        const l = new Date(left.last_message_at || left.updated_at || left.created_at || 0).getTime();
        const r = new Date(right.last_message_at || right.updated_at || right.created_at || 0).getTime();
        return r - l;
    }

    function shouldRefreshShortSummary(chat) {
        const msgCount = parseInt(chat?.message_count, 10) || 0;
        const summaryCount = parseInt(chat?.thread_summary_message_count, 10) || 0;
        return msgCount > 0 && msgCount <= 5 && summaryCount < msgCount;
    }

    function needsSummaryHydration(chat) {
        const hasSummary = String(chat?.thread_summary || '').trim().length > 0;
        if (!hasSummary) return true;
        return shouldRefreshShortSummary(chat);
    }

    function groupChatsByAgent(chats, kind) {
        const groups = new Map();
        chats.forEach((chat) => {
            const agent = chat.agent || {};
            const rawAgentId = agent.id || chat.ai_agent_id || chat.agent_id || 'unknown';
            const groupId = `${kind}:${String(rawAgentId).toUpperCase()}`;
            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    kind,
                    agent,
                    chats: [],
                    unreadCount: 0,
                    latest: 0
                });
            }
            const group = groups.get(groupId);
            if ((!group.agent?.id || !group.agent?.name) && agent) group.agent = agent;
            group.chats.push(chat);
            group.unreadCount += Math.max(0, parseInt(chat.unreadCount, 10) || 0);
            const ts = new Date(chat.last_message_at || chat.updated_at || chat.created_at || 0).getTime();
            if (!Number.isNaN(ts)) group.latest = Math.max(group.latest, ts);
        });
        return [...groups.values()]
            .map((group) => ({ ...group, chats: group.chats.slice().sort(sortByRecent) }))
            .sort((a, b) => b.latest - a.latest);
    }

    function getPersonalChatTitle(chat) {
        const title = String(chat?.title || '').trim();
        if (title && title.toLowerCase() !== 'conversation') return title;
        const summary = String(chat?.thread_summary || '').trim();
        if (summary) return summary.slice(0, SIDEBAR_SUMMARY_MAX_CHARS);
        const lastPreview = String(chat?.last_message_preview || chat?.last_message || '').trim();
        if (lastPreview) return lastPreview.slice(0, SIDEBAR_SUMMARY_MAX_CHARS);
        const msgCount = parseInt(chat?.message_count, 10) || 0;
        if (msgCount <= 1) return 'New conversation';
        const shortId = String(chat?.id || '').slice(-4).toUpperCase();
        return shortId ? `Chat ${shortId}` : 'Chat thread';
    }

    function renderSidebarItem(chat, kind, selectedChatId) {
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

    function normalizeId(value) {
        return String(value || '').trim().toUpperCase();
    }

    function findChatItem(container, chatId) {
        const targetId = normalizeId(chatId);
        if (!targetId) return null;
        return [...container.querySelectorAll('.chat-hub__item[data-chat-id]')]
            .find((node) => normalizeId(node.getAttribute('data-chat-id')) === targetId) || null;
    }

    function setItemUnreadBadge(item, count) {
        const nextCount = Math.max(0, parseInt(count, 10) || 0);
        const right = item.querySelector('.chat-hub__item-right') || item.querySelector('.chat-hub__item-row');
        if (!right) return;
        let badge = right.querySelector('.chat-hub__item-unread');
        if (nextCount <= 0) {
            badge?.remove();
            item.classList.remove('chat-hub__item--unread');
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-hub__item-unread';
            right.appendChild(badge);
        }
        badge.textContent = String(nextCount);
        item.classList.add('chat-hub__item--unread');
    }

    function incrementGroupUnread(item, delta = 1) {
        const groupHeaderHead = item
            .closest('.chat-hub__group')
            ?.querySelector('.chat-hub__group-head');
        if (!groupHeaderHead) return;
        let badge = groupHeaderHead.querySelector('.chat-hub__group-unread');
        const current = badge ? (parseInt(badge.textContent || '0', 10) || 0) : 0;
        const next = Math.max(0, current + delta);
        if (next <= 0) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'chat-hub__group-unread';
            groupHeaderHead.appendChild(badge);
        }
        badge.textContent = String(next);
    }

    function installLiveUnreadUpdates(container, selectedChatId) {
        if (liveUnreadEventHandler) {
            window.removeEventListener('bi:conversation:new_message', liveUnreadEventHandler);
            liveUnreadEventHandler = null;
        }

        liveUnreadEventHandler = async (event) => {
            if (!container || !document.body.contains(container)) return;
            const payload = event?.detail || {};
            const incomingChatId = payload.conversationId || payload.chatId;
            if (!incomingChatId) return;

            const incomingId = normalizeId(incomingChatId);
            const selectedId = normalizeId(selectedChatId);
            if (incomingId && selectedId && incomingId === selectedId) return;

            const item = findChatItem(container, incomingChatId);
            if (!item) {
                try {
                    await renderChatHub(container, selectedChatId);
                } catch {}
                return;
            }

            const badge = item.querySelector('.chat-hub__item-unread');
            const current = parseInt(badge?.textContent || '0', 10) || 0;
            setItemUnreadBadge(item, current + 1);
            incrementGroupUnread(item, 1);
        };

        window.addEventListener('bi:conversation:new_message', liveUnreadEventHandler);
    }

    function renderGroupModelPills(health) {
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

    function renderChatGroup(group, selectedChatId, expanded) {
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
                            <span class="chat-hub__group-pills chat-hub__group-pills--top">${renderGroupModelPills(health)}</span>
                            ${group.unreadCount ? `<span class="chat-hub__group-unread">${group.unreadCount}</span>` : ''}
                        </span>
                    </span>
                </button>
                <div class="chat-hub__group-list ${expanded ? '' : 'chat-hub__group-list--collapsed'}" data-group-list="${escapeHtml(group.id)}">
                    ${group.chats.map((chat) => renderSidebarItem(chat, group.kind, selectedChatId)).join('')}
                </div>
            </section>
        `;
    }

    function renderKindLabel(title) {
        return `
            <div class="chat-hub__kind-label">
                <span class="chat-hub__kind-label-text">${escapeHtml(title)}</span>
            </div>
        `;
    }

    async function renderChatHub(container, selectedChatId = null) {
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

            const personalHtml = personalGroups.length
                ? personalGroups.map((group) => renderChatGroup(group, selectedChatId, groupState.map[group.id] !== false)).join('')
                : '<p class="chat-hub__empty-list">No personal chats yet.</p>';
            const deploymentHtml = deploymentGroups.length
                ? deploymentGroups.map((group) => renderChatGroup(group, selectedChatId, groupState.map[group.id] !== false)).join('')
                : '<p class="chat-hub__empty-list">No deployment chats available.</p>';
            const sections = [];
            if (hasPersonal) sections.push({ key: 'personal', title: 'Personal Chats', body: personalHtml });
            if (hasDeployment) sections.push({ key: 'deployment', title: 'Deployment Chats', body: deploymentHtml });

            const sidebarListHtml = sections.length
                ? sections.map((section) => {
                    return `
                        <section class="chat-hub__section" data-chat-kind-section="${escapeHtml(section.key)}">
                            ${renderKindLabel(section.title)}
                            <div class="chat-hub__section-body">
                                ${section.body}
                            </div>
                        </section>
                    `;
                }).join('')
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
                                    ${chatableAgents.length ? chatableAgents.map((a) => {
        const health = evaluateAgentModelHealth(a);
        const healthText = health.state === 'error'
            ? 'All models unavailable'
            : health.state === 'warning'
                ? `${health.unavailableModels}/${health.totalModels} unavailable`
                : health.state === 'ok'
                    ? 'Ready'
                    : 'No model';
        return `<button type="button" class="chat-hub__new-chat-item" data-agent="${escapeHtml(a.id)}"><img class="chat-hub__new-chat-avatar" src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt=""><span class="chat-hub__new-chat-content"><span class="chat-hub__new-chat-name">${escapeHtml(a.name || 'Agent')}<span class="chat-hub__new-chat-health chat-hub__new-chat-health--${health.state}">${escapeHtml(healthText)}</span></span><span class="chat-hub__new-chat-meta">${escapeHtml(a.text_provider_display || a.textProviderDisplayName || a.text_provider || 'provider')} - ${escapeHtml(a.text_model_display || a.textModelDisplayName || a.text_model || 'model')}</span></span></button>`;
    }).join('') : '<p class="chat-hub__new-chat-empty">No agents available.</p>'}
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
                        ${!selectedChatId ? `<div class="chat-hub__empty"><div class="chat-hub__empty-content"><h3>Select a chat</h3><p class="text-muted">Choose a conversation from the sidebar, or create a new one.</p></div></div>` : ''}
                    </div>
                </div>
            `;

            container.querySelectorAll('.chat-hub__item').forEach((btn) => {
                btn.addEventListener('click', () => {
                    navigate(`/chat/${btn.dataset.chatId}`);
                });
            });

            container.querySelectorAll('.chat-hub__group').forEach((group) => {
                const list = group.querySelector('.chat-hub__group-list');
                const collapsed = list?.classList.contains('chat-hub__group-list--collapsed') === true;
                group.classList.toggle('chat-hub__group--collapsed', collapsed);
                group.classList.toggle('chat-hub__group--expanded', !collapsed);
            });

            const summaryJobs = normalizedPersonalChats
                .filter((chat) => needsSummaryHydration(chat))
                .map((chat) => ({
                    chatId: String(chat.id || '').trim(),
                    msgCount: parseInt(chat.message_count, 10) || 0,
                    force: shouldRefreshShortSummary(chat)
                }))
                .filter((job) => job.chatId)
                .filter((job) => {
                    if (summaryHydrationInFlight.has(job.chatId)) return false;
                    const lastStamp = summaryHydrationStamp.get(job.chatId) || 0;
                    return job.msgCount > lastStamp || lastStamp === 0;
                })
                .slice(0, 2);

            if (summaryJobs.length) {
                summaryJobs.forEach((job) => summaryHydrationInFlight.add(job.chatId));
                Promise.allSettled(summaryJobs.map((job) => api(`/chats/${encodeURIComponent(job.chatId)}/summary`, {
                    method: 'POST',
                    body: JSON.stringify({
                        reason: 'sidebar_preview',
                        force: job.force
                    })
                }))).then((results) => {
                    let shouldRefresh = false;
                    results.forEach((result, idx) => {
                        const job = summaryJobs[idx];
                        summaryHydrationInFlight.delete(job.chatId);
                        const resolvedCount = result.status === 'fulfilled'
                            ? parseInt(result.value?.data?.summaryMessageCount, 10) || job.msgCount
                            : job.msgCount;
                        summaryHydrationStamp.set(job.chatId, Math.max(job.msgCount, resolvedCount));
                        if (result.status === 'fulfilled' && String(result.value?.data?.summary || '').trim()) shouldRefresh = true;
                    });
                    if (shouldRefresh && container.isConnected) {
                        renderChatHub(container, selectedChatId).catch(() => {});
                    }
                }).catch(() => {
                    summaryJobs.forEach((job) => summaryHydrationInFlight.delete(job.chatId));
                });
            }

            container.querySelectorAll('[data-toggle-group]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-toggle-group');
                    if (!id) return;
                    const body = container.querySelector(`[data-group-list="${id}"]`);
                    const chev = btn.querySelector('.chat-hub__group-chevron');
                    const group = btn.closest('.chat-hub__group');
                    if (!body || !chev) return;
                    const collapsed = body.classList.toggle('chat-hub__group-list--collapsed');
                    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                    chev.classList.toggle('chat-hub__group-chevron--expanded', !collapsed);
                    chev.classList.toggle('chat-hub__group-chevron--collapsed', collapsed);
                    if (group) {
                        group.classList.toggle('chat-hub__group--collapsed', collapsed);
                        group.classList.toggle('chat-hub__group--expanded', !collapsed);
                    }
                    groupState.map[id] = !collapsed;
                    setGroupState(groupState);
                });
            });

            const sidebar = container.querySelector('#chat-sidebar');
            const sidebarResizer = container.querySelector('#chat-sidebar-resize');
            const sidebarFlap = container.querySelector('#chat-sidebar-flap');
            const sidebarFlapIcon = container.querySelector('#chat-sidebar-flap-icon');
            const sidebarState = getSidebarState();
            const isMobile = window.matchMedia('(max-width: 52em)').matches;

            const applySidebarState = () => {
                if (!sidebar) return;
                if (isMobile) {
                    sidebar.classList.remove('chat-hub__sidebar--collapsed', 'chat-hub__sidebar--resizing');
                    sidebar.style.removeProperty('--chat-sidebar-width');
                    if (sidebarFlap) sidebarFlap.style.display = 'none';
                    if (sidebarResizer) sidebarResizer.style.display = 'none';
                    return;
                }

                sidebarState.width = clampSidebarWidth(sidebarState.width);
                sidebar.classList.toggle('chat-hub__sidebar--collapsed', sidebarState.collapsed === true);
                sidebar.style.setProperty('--chat-sidebar-width', `${sidebarState.width}px`);

                if (sidebarFlap) {
                    sidebarFlap.style.display = '';
                    sidebarFlap.classList.toggle('chat-hub__sidebar-flap--collapsed', sidebarState.collapsed === true);
                    sidebarFlap.style.left = `${sidebarState.collapsed ? 0 : (sidebarState.width - 1)}px`;
                }
                sidebarFlapIcon?.classList.toggle('chat-hub__sidebar-flap-icon--collapsed', sidebarState.collapsed === true);
                if (sidebarResizer) sidebarResizer.style.display = '';
            };

            sidebarFlap?.addEventListener('click', () => {
                sidebarState.collapsed = !sidebarState.collapsed;
                setSidebarState(sidebarState);
                applySidebarState();
            });

            sidebarResizer?.addEventListener('mousedown', (event) => {
                if (isMobile || sidebarState.collapsed) return;
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = sidebarState.width;
                sidebar?.classList.add('chat-hub__sidebar--resizing');

                const onMove = (moveEvent) => {
                    const width = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
                    sidebarState.width = width;
                    applySidebarState();
                };
                const onUp = () => {
                    sidebar?.classList.remove('chat-hub__sidebar--resizing');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    setSidebarState(sidebarState);
                };

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });

            applySidebarState();

            const newChatWrap = container.querySelector('#chat-new-chat');
            const newChatPanel = container.querySelector('#chat-new-chat-panel');
            const newChatButton = container.querySelector('#new-chat-btn');
            const newChatSearch = container.querySelector('#chat-new-chat-search');
            const newChatList = container.querySelector('#chat-new-chat-list');

            const closeNewChatPanel = () => {
                if (!newChatPanel) return;
                newChatPanel.classList.remove('chat-hub__new-chat-panel--open');
                newChatPanel.setAttribute('aria-hidden', 'true');
                newChatWrap?.classList.remove('chat-hub__new-chat--open');
                newChatButton?.setAttribute('aria-expanded', 'false');
                document.removeEventListener('click', onOutside);
                document.removeEventListener('keydown', onEscape);
            };
            const openNewChatPanel = () => {
                if (!newChatPanel) return;
                newChatPanel.classList.add('chat-hub__new-chat-panel--open');
                newChatPanel.setAttribute('aria-hidden', 'false');
                newChatWrap?.classList.add('chat-hub__new-chat--open');
                newChatButton?.setAttribute('aria-expanded', 'true');
                setTimeout(() => newChatSearch?.focus(), 120);
                setTimeout(() => {
                    document.addEventListener('click', onOutside);
                    document.addEventListener('keydown', onEscape);
                }, 0);
            };
            const onOutside = (event) => {
                if (!newChatWrap?.contains(event.target) && !newChatButton?.contains(event.target)) closeNewChatPanel();
            };
            const onEscape = (event) => {
                if (event.key === 'Escape') closeNewChatPanel();
            };

            newChatButton?.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (newChatPanel?.classList.contains('chat-hub__new-chat-panel--open')) closeNewChatPanel();
                else openNewChatPanel();
            });

            newChatSearch?.addEventListener('input', () => {
                const q = (newChatSearch.value || '').trim().toLowerCase();
                newChatList?.querySelectorAll('.chat-hub__new-chat-item').forEach((item) => {
                    const txt = item.textContent?.toLowerCase() || '';
                    item.style.display = !q || txt.includes(q) ? '' : 'none';
                });
            });

            newChatList?.querySelectorAll('.chat-hub__new-chat-item').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    try {
                        const { data } = await api('/chats', { method: 'POST', body: JSON.stringify({ agentId: btn.dataset.agent, forceNew: true }) });
                        closeNewChatPanel();
                        navigate(`/chat/${data.id}`);
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
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
    }

    async function renderChatView(container, chatId) {
        const currentUser = getCurrentUser();
        try {
            const [{ data: chat }, { data: messagesData }] = await Promise.all([
                api(`/chats/${chatId}`),
                api(`/chats/${chatId}/messages`)
            ]);
            const messages = messagesData?.messages || messagesData || [];

            if (currentUser) {
                api(`/chats/${chatId}/read`, { method: 'PUT', body: JSON.stringify({}) }).catch(() => {});
            }

            const chatAgent = chat.agent || null;
            let agent = chatAgent ? { ...chatAgent } : null;
            const agentId = chat.ai_agent_id || chat.agent_id || chatAgent?.id || null;
            if (agentId) {
                const fullAgent = await api(`/agents/${agentId}`).then((r) => r.data).catch(() => null);
                if (fullAgent) {
                    agent = { ...(agent || {}), ...fullAgent };
                }
            }
            if (!agent) agent = chatAgent || null;

            const modelHealth = evaluateAgentModelHealth(agent || {});
            const modelHealthChip = modelHealth.state === 'ok'
                ? `<span class="agent-chat__health-chip agent-chat__health-chip--ok" title="${escapeHtml(modelHealth.summaryText)}">Ready</span>`
                : modelHealth.state === 'warning'
                    ? `<span class="agent-chat__health-chip agent-chat__health-chip--warning" title="${escapeHtml(modelHealth.summaryText)}">Partial</span>`
                    : modelHealth.state === 'error'
                        ? `<span class="agent-chat__health-chip agent-chat__health-chip--error" title="${escapeHtml(modelHealth.summaryText)}">Unavailable</span>`
                        : `<span class="agent-chat__health-chip agent-chat__health-chip--unknown" title="${escapeHtml(modelHealth.summaryText)}">No model</span>`;
            const modelHealthBanner = modelHealth.state === 'warning'
                ? `<div class="agent-chat__model-status agent-chat__model-status--warning">${escapeHtml(modelHealth.summaryText)}. Some capabilities may fail.</div>`
                : modelHealth.state === 'error'
                    ? `<div class="agent-chat__model-status agent-chat__model-status--error">${escapeHtml(modelHealth.summaryText)}. This agent cannot respond until a model is active and visible.</div>`
                    : '';

            const normalizedMessages = messages.map((m) => {
                const meta = parseMetadata(m.metadata);
                if (m.media && Array.isArray(m.media)) meta.media = m.media;
                return {
                    ...m,
                    role: messageRole(m, chat, currentUser),
                    content: m.content,
                    created_at: m.timestamp || m.created_at,
                    metadata: meta,
                    type: m.type,
                    mediaUrl: m.media_url || m.mediaUrl,
                    media: m.media
                };
            });

            const isDeploymentChat = String(chat.chatType || '').toLowerCase() === 'deployment';
            const deploymentLabel = isDeploymentChat
                ? `<span class="chat-thread-tag">/${escapeHtml(chat.deployment?.slug || 'deployment')} · ${escapeHtml(chat.access?.role || 'member')}</span>`
                : '';

            container.innerHTML = `
                <div class="agent-chat">
                    <div class="agent-chat__header">
                        <img class="agent-chat__avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                        <div class="agent-chat__info">
                            <div class="agent-chat__name">${escapeHtml(agent?.name || 'Agent')} ${deploymentLabel}</div>
                            <div class="agent-chat__meta-row">
                                <div class="agent-chat__meta">${escapeHtml(agent?.text_model_display || agent?.textModelDisplayName || agent?.text_model || agent?.text_provider_display || agent?.textProviderDisplayName || agent?.text_provider || '-')}</div>
                                ${modelHealthChip}
                            </div>
                        </div>
                    </div>
                    ${modelHealthBanner}
                    <div class="agent-chat__messages-wrap">
                        <div class="agent-chat__messages" id="chat-msgs">
                            ${normalizedMessages.length ? normalizedMessages.map((m) => renderChatMessage(m)).join('') : '<div class="agent-chat__empty-msg"><p>Start a conversation with <strong>' + escapeHtml(agent?.name || 'Agent') + '</strong></p></div>'}
                        </div>
                        <div class="agent-chat__scrollbar" id="chat-scrollbar" aria-hidden="true">
                            <div class="agent-chat__scroll-track" id="chat-scroll-track">
                                <button type="button" class="agent-chat__scroll-thumb" id="chat-scroll-thumb" title="Scroll chat"></button>
                                <span class="agent-chat__scroll-label" id="chat-scroll-label"></span>
                            </div>
                            <button type="button" class="agent-chat__scroll-jump" id="chat-scroll-jump" title="Jump to latest message" aria-label="Jump to latest message">
                                <span class="agent-chat__scroll-jump-icon" aria-hidden="true"></span>
                            </button>
                        </div>
                    </div>
                    <div id="chat-typing" class="agent-chat__typing" hidden>
                        <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                        <span>${escapeHtml(agent?.name || 'Agent')} is thinking...</span>
                    </div>
                    <div id="chat-error" class="agent-chat__error" hidden></div>
                    <div class="agent-chat__input ${isDeploymentChat ? 'agent-chat__input--deploy' : ''}">
                        ${isDeploymentChat ? '' : '<input type="file" id="chat-attach" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" multiple class="u-hidden"><button id="chat-attach-btn" class="btn btn-ghost btn-sm" title="Attach image or video" type="button"></button>'}
                        <input type="text" id="chat-input" class="form-input" placeholder="${isDeploymentChat ? 'Type a manual message or generation prompt...' : 'Type a message...'}" autocomplete="off">
                        ${isDeploymentChat ? '<button id="chat-send-manual" class="btn btn-primary">Send Manual</button><button id="chat-send-generate" class="btn btn-tonal">Generate Response</button>' : '<button id="chat-regen" class="btn btn-ghost btn-sm" title="Regenerate last response" hidden>&#x21bb;</button><button id="chat-send" class="btn btn-primary">Send</button>'}
                    </div>
                </div>
            `;

            const msgEl = container.querySelector('#chat-msgs');
            const inputEl = container.querySelector('#chat-input');
            const typingEl = container.querySelector('#chat-typing');
            const errorEl = container.querySelector('#chat-error');
            const scrollChromeEl = container.querySelector('#chat-scrollbar');
            const scrollTrackEl = container.querySelector('#chat-scroll-track');
            const scrollThumbEl = container.querySelector('#chat-scroll-thumb');
            const scrollLabelEl = container.querySelector('#chat-scroll-label');
            const scrollJumpEl = container.querySelector('#chat-scroll-jump');
            let scrollChromeHideTimer = null;
            let isDraggingThumb = false;
            let dragStartY = 0;
            let dragStartTop = 0;

            function formatIndexLabel(messageIndex, totalMessages) {
                if (!totalMessages) return '';
                const idx = new Intl.NumberFormat().format(messageIndex);
                const total = new Intl.NumberFormat().format(totalMessages);
                return `${idx}/${total}`;
            }

            function revealScrollChrome() {
                if (!scrollChromeEl) return;
                scrollChromeEl.classList.add('agent-chat__scrollbar--active');
                if (scrollChromeHideTimer) clearTimeout(scrollChromeHideTimer);
                scrollChromeHideTimer = setTimeout(() => {
                    if (!isDraggingThumb) {
                        scrollChromeEl.classList.remove('agent-chat__scrollbar--active');
                    }
                }, 900);
            }

            function resolveMessageIndex() {
                const messages = [...msgEl.querySelectorAll('.chat-msg')];
                const total = messages.length;
                if (!total) return { index: 0, total: 0 };
                const maxScroll = Math.max(1, msgEl.scrollHeight - msgEl.clientHeight);
                const ratio = Math.max(0, Math.min(1, msgEl.scrollTop / maxScroll));
                const index = Math.max(1, Math.min(total, Math.round(ratio * (total - 1)) + 1));
                return { index, total };
            }

            function syncScrollChrome(visible = false) {
                if (!scrollChromeEl || !scrollTrackEl || !scrollThumbEl || !scrollLabelEl || !scrollJumpEl) return;
                const trackHeight = scrollTrackEl.clientHeight || msgEl.clientHeight || 0;
                const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
                const hasOverflow = maxScroll > 0;
                scrollChromeEl.classList.toggle('agent-chat__scrollbar--hidden', !hasOverflow);
                if (!hasOverflow) {
                    scrollLabelEl.textContent = '';
                    return;
                }

                const ratio = msgEl.clientHeight / Math.max(msgEl.scrollHeight, 1);
                const thumbHeight = Math.max(trackHeight * ratio, Math.min(trackHeight * 0.3, 40));
                const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
                const progress = maxScroll > 0 ? Math.max(0, Math.min(1, msgEl.scrollTop / maxScroll)) : 0;
                const thumbTop = progress * maxThumbTop;

                scrollThumbEl.style.height = `${thumbHeight}px`;
                scrollThumbEl.style.transform = `translateY(${thumbTop}px)`;
                scrollLabelEl.style.transform = `translateY(${thumbTop}px)`;

                const { index, total } = resolveMessageIndex();
                scrollLabelEl.textContent = formatIndexLabel(index, total);
                scrollJumpEl.classList.toggle('agent-chat__scroll-jump--visible', msgEl.scrollTop < maxScroll - 8);

                if (visible) revealScrollChrome();
            }

            function onThumbDragMove(clientY) {
                if (!isDraggingThumb || !scrollTrackEl) return;
                const trackHeight = scrollTrackEl.clientHeight || 0;
                const thumbHeight = scrollThumbEl.getBoundingClientRect().height || 0;
                const maxThumbTop = Math.max(trackHeight - thumbHeight, 0);
                const nextTop = Math.max(0, Math.min(maxThumbTop, dragStartTop + (clientY - dragStartY)));
                const progress = maxThumbTop > 0 ? nextTop / maxThumbTop : 0;
                const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
                msgEl.scrollTop = progress * maxScroll;
                syncScrollChrome(true);
            }

            scrollThumbEl?.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                isDraggingThumb = true;
                dragStartY = event.clientY;
                const thumbTransform = scrollThumbEl.style.transform || '';
                const match = thumbTransform.match(/translateY\\(([-\\d.]+)px\\)/);
                dragStartTop = match ? parseFloat(match[1]) : 0;
                scrollThumbEl.setPointerCapture?.(event.pointerId);
                revealScrollChrome();
            });

            scrollThumbEl?.addEventListener('pointermove', (event) => {
                if (!isDraggingThumb) return;
                onThumbDragMove(event.clientY);
            });

            scrollThumbEl?.addEventListener('pointerup', (event) => {
                if (!isDraggingThumb) return;
                isDraggingThumb = false;
                scrollThumbEl?.releasePointerCapture?.(event.pointerId);
                syncScrollChrome(true);
            });

            scrollThumbEl?.addEventListener('pointercancel', (event) => {
                if (!isDraggingThumb) return;
                isDraggingThumb = false;
                scrollThumbEl?.releasePointerCapture?.(event.pointerId);
                syncScrollChrome(true);
            });

            scrollTrackEl?.addEventListener('click', (event) => {
                if (!scrollTrackEl || event.target === scrollThumbEl) return;
                const rect = scrollTrackEl.getBoundingClientRect();
                const y = event.clientY - rect.top;
                const ratio = rect.height > 0 ? Math.max(0, Math.min(1, y / rect.height)) : 0;
                const maxScroll = Math.max(0, msgEl.scrollHeight - msgEl.clientHeight);
                msgEl.scrollTop = ratio * maxScroll;
                syncScrollChrome(true);
            });

            scrollJumpEl?.addEventListener('click', () => {
                msgEl.scrollTop = msgEl.scrollHeight;
                syncScrollChrome(true);
            });

            msgEl.scrollTop = msgEl.scrollHeight;
            syncScrollChrome();
            requestAnimationFrame(() => syncScrollChrome());

            if (isDeploymentChat) {
                const canManage = !!(chat.access?.isOwner || chat.access?.isAdmin || chat.access?.permissions?.manage_chats);
                if (!canManage) {
                    inputEl.disabled = true;
                    container.querySelector('#chat-send-manual')?.setAttribute('disabled', 'disabled');
                    container.querySelector('#chat-send-generate')?.setAttribute('disabled', 'disabled');
                }

                const manualBtn = container.querySelector('#chat-send-manual');
                const generateBtn = container.querySelector('#chat-send-generate');
                const buttons = [manualBtn, generateBtn].filter(Boolean);

                async function runOperator(mode) {
                    const text = String(inputEl.value || '').trim();
                    if (mode === 'manual' && !text) {
                        showToast('Manual message cannot be empty', 'error');
                        return;
                    }

                    buttons.forEach((b) => { b.disabled = true; });
                    errorEl.hidden = true;
                    try {
                        await api(`/chats/${encodeURIComponent(chat.id)}/operator-reply`, {
                            method: 'POST',
                            body: JSON.stringify({
                                mode,
                                content: text || undefined,
                                useLatestUserMessage: mode === 'generate' && !text
                            })
                        });
                        if (inputEl) inputEl.value = '';
                        await renderChatView(container, chatId);
                    } catch (err) {
                        errorEl.textContent = err.message || 'Failed to send operator action';
                        errorEl.hidden = false;
                        setTimeout(() => { errorEl.hidden = true; }, 8000);
                    } finally {
                        buttons.forEach((b) => { b.disabled = false; });
                    }
                }

                manualBtn?.addEventListener('click', () => runOperator('manual'));
                generateBtn?.addEventListener('click', () => runOperator('generate'));
                inputEl?.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        runOperator('manual');
                    }
                });
            } else {
                const sendBtn = container.querySelector('#chat-send');
                const regenBtn = container.querySelector('#chat-regen');
                const attachBtn = container.querySelector('#chat-attach-btn');
                const attachInput = container.querySelector('#chat-attach');
                const isModelUnavailable = modelHealth.state === 'error';

                let autoScroll = true;
                let lastUserMessage = normalizedMessages.filter((m) => m.role === 'user').pop()?.content || '';

                function setComposerEnabled(enabled) {
                    const allowInput = enabled && !isModelUnavailable;
                    sendBtn.disabled = !allowInput;
                    inputEl.disabled = !allowInput;
                    if (attachBtn) {
                        attachBtn.disabled = !allowInput;
                        attachBtn.classList.toggle('is-disabled', !allowInput);
                    }
                }

                const socket = createSocket();
                if (socket) {
                    clearChatSocketListeners(socket);
                    socket.emit('chat:join', { chatId });

                    socket.on('agent:stream', (d) => {
                        if ((d.conversationId || d.chatId) === chatId && d.chunk) {
                            let last = msgEl.querySelector('.msg--streaming');
                            if (!last) {
                                last = document.createElement('div');
                                last.className = 'chat-msg chat-msg--assistant msg--streaming';
                                last.innerHTML = '<div class="chat-msg__content"></div>';
                                msgEl.appendChild(last);
                            }
                            const node = last.querySelector('.chat-msg__content');
                            node.textContent = (node.textContent || '') + d.chunk;
                            if (autoScroll) msgEl.scrollTop = msgEl.scrollHeight;
                        }
                    });

                    socket.on('agent:done', (d) => {
                        if ((d.conversationId || d.chatId) !== chatId) return;
                        const stream = msgEl.querySelector('.msg--streaming');
                        if (stream) {
                            stream.classList.remove('msg--streaming');
                            stream.innerHTML += `<div class="chat-msg__actions"><button class="btn-copy-msg" title="Copy">${copyIcon}</button></div><span class="chat-msg__time">${formatTimestamp(new Date().toISOString())}</span>`;
                        }
                        typingEl.hidden = true;
                        setComposerEnabled(true);
                        regenBtn.hidden = false;
                        if (!isModelUnavailable) inputEl.focus();
                        if (autoScroll) msgEl.scrollTop = msgEl.scrollHeight;
                    });

                    socket.on('agent:media', (d) => {
                        if ((d.conversationId || d.chatId) !== chatId || !d.media) return;
                        d.media.filter((m) => m.type === 'image' && m.url).forEach((m, idx) => {
                            const mediaItems = [{ type: 'image', url: m.url }];
                            const wrap = document.createElement('div');
                            wrap.className = 'chat-msg chat-msg--assistant';
                            wrap.dataset.msgType = 'image';
                            wrap.dataset.mediaUrl = m.url;
                            wrap.dataset.media = JSON.stringify(mediaItems);
                            const url = (m.url || '').startsWith('/') ? m.url : `/media/${m.url}`;
                            wrap.innerHTML = `<div class="chat-msg__content"><img src="${escapeHtml(url)}" alt="Generated image" class="chat-msg__media-thumb chat-msg__image" data-index="${idx}"></div>`;
                            msgEl.appendChild(wrap);
                        });
                        if (autoScroll) msgEl.scrollTop = msgEl.scrollHeight;
                    });

                    socket.on('agent:error', (d) => {
                        typingEl.hidden = true;
                        setComposerEnabled(true);
                        errorEl.textContent = d.error || 'Something went wrong';
                        errorEl.hidden = false;
                        setTimeout(() => { errorEl.hidden = true; }, 8000);
                    });

                    socket.on('chat:typing', (d) => {
                        if ((d.conversationId || d.chatId) === chatId) typingEl.hidden = !d.isTyping;
                    });

                    socket.on('disconnect', () => {
                        typingEl.hidden = true;
                        setComposerEnabled(true);
                    });

                    socket.on('connect_error', () => {
                        typingEl.hidden = true;
                        setComposerEnabled(true);
                        errorEl.textContent = 'Connection failed. Please refresh to try again.';
                        errorEl.hidden = false;
                        setTimeout(() => { errorEl.hidden = true; }, 8000);
                    });
                }

                async function sendMessage() {
                    if (isModelUnavailable) {
                        showToast('This agent cannot respond until at least one model is active and visible.', 'warning');
                        return;
                    }
                    const t = inputEl.value.trim();
                    if (!t) return;

                    const userEl = document.createElement('div');
                    userEl.className = 'chat-msg chat-msg--user';
                    userEl.innerHTML = `<div class="chat-msg__content">${escapeHtml(t)}</div>`;
                    msgEl.querySelector('.agent-chat__empty-msg')?.remove();
                    msgEl.appendChild(userEl);
                    inputEl.value = '';
                    msgEl.scrollTop = msgEl.scrollHeight;
                    errorEl.hidden = true;

                    lastUserMessage = t;
                    if (socket) {
                        if (!socket.connected) socket.connect();
                        setComposerEnabled(false);
                        typingEl.hidden = false;
                        socket.emit('chat:send', { chatId, content: t });
                    } else {
                        showToast('Socket not connected', 'error');
                    }
                }

                sendBtn.addEventListener('click', sendMessage);
                inputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
                if (!isModelUnavailable) inputEl.focus();
                setComposerEnabled(true);

                if (attachBtn && attachInput) {
                    attachBtn.appendChild(icon('paperclip', 20));
                    attachBtn.addEventListener('click', () => {
                        if (isModelUnavailable) return;
                        attachInput.click();
                    });
                    attachInput.addEventListener('change', async (e) => {
                        if (isModelUnavailable) {
                            e.target.value = '';
                            showToast('This agent cannot respond until at least one model is active and visible.', 'warning');
                            return;
                        }
                        const files = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
                        e.target.value = '';
                        if (!files.length) return;
                        showMediaUploadPreview({
                            items: files,
                            title: 'Preview',
                            confirmLabel: 'Send',
                            allowCrop: files.length === 1 && files[0].type.startsWith('image/'),
                            onConfirm: async (results) => {
                                const media = [];
                                try {
                                    for (const r of results) {
                                        if (r.type === 'video' && r.file) {
                                            const formData = new FormData();
                                            formData.append('file', r.file);
                                            formData.append('chatId', chatId);
                                            const res = await fetch(`${API_BASE}/media/upload`, {
                                                method: 'POST',
                                                headers: { Authorization: `Bearer ${getToken()}` },
                                                body: formData,
                                                credentials: 'include'
                                            });
                                            const data = await res.json();
                                            if (data.success && data.data?.url) media.push({ type: 'video', url: data.data.url });
                                        } else if (r.type === 'image') {
                                            if (r.dataUrl) {
                                                const res = await fetch(`${API_BASE}/media/capture`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                                                    body: JSON.stringify({ imageData: r.dataUrl, chatId, mimeType: 'image/jpeg' }),
                                                    credentials: 'include'
                                                });
                                                const data = await res.json();
                                                if (data.success && data.data?.url) media.push({ type: 'image', url: data.data.url });
                                            } else if (r.file) {
                                                const formData = new FormData();
                                                formData.append('file', r.file);
                                                formData.append('chatId', chatId);
                                                const res = await fetch(`${API_BASE}/media/upload`, {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${getToken()}` },
                                                    body: formData,
                                                    credentials: 'include'
                                                });
                                                const data = await res.json();
                                                if (data.success && data.data?.url) media.push({ type: 'image', url: data.data.url });
                                            }
                                        }
                                    }
                                    if (media.length && socket) socket.emit('chat:send', { chatId, content: '', media });
                                    else showToast('Upload failed', 'error');
                                } catch (err) {
                                    showToast(err.message || 'Upload failed', 'error');
                                }
                            },
                            onCancel: () => {}
                        });
                    });
                }

                msgEl.addEventListener('scroll', () => {
                    const atBottom = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 60;
                    autoScroll = atBottom;
                    syncScrollChrome(true);
                });

                msgEl.addEventListener('click', (e) => {
                    const copyBtn = e.target.closest('.btn-copy-msg');
                    if (copyBtn) {
                        const contentNode = copyBtn.closest('.chat-msg')?.querySelector('.chat-msg__content');
                        if (contentNode) navigator.clipboard.writeText(contentNode.textContent || '').then(() => showToast('Copied', 'success'));
                        return;
                    }
                    const mediaThumb = e.target.closest('.chat-msg__media-thumb, .chat-msg__image');
                    if (!mediaThumb) return;
                    const msg = mediaThumb.closest('.chat-msg');
                    const idx = parseInt(mediaThumb.dataset.index || '0', 10);
                    let msgData = {
                        type: msg?.dataset?.msgType || 'image',
                        mediaUrl: msg?.dataset?.mediaUrl || '',
                        media: (() => { try { return JSON.parse(msg?.dataset?.media || '[]'); } catch { return []; } })()
                    };
                    if (!msgData.media?.length && msgData.mediaUrl) msgData.media = [{ type: msgData.type, url: msgData.mediaUrl }];
                    if (!msgData.media?.length && mediaThumb.src) msgData.media = [{ type: 'image', url: mediaThumb.src.replace(/^https?:\/\/[^/]+/, '') }];
                    if (msgData.media?.length) showMediaViewer(msgData, idx);
                });

                regenBtn?.addEventListener('click', () => {
                    if (!lastUserMessage || !socket) return;
                    inputEl.value = lastUserMessage;
                    sendMessage();
                });
            }
        } catch (err) {
            container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
        }
    }

    const copyIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    return { renderChatHub, renderChatView, renderChatMessage };
}


