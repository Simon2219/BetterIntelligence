export function createAnalyticsView(deps) {
    const { api, navigate, showToast, getAgentAvatarUrl, escapeHtml, getSocketClients } = deps;
    let analyticsSocket = null;
    let analyticsSocketBound = false;
    let analyticsSubscriptionAgentId = null;
    let analyticsSubscriptionKey = null;
    let analyticsRefreshTimer = null;
    let analyticsRealtimeContainer = null;
    let analyticsRealtimeDays = 30;

    function normalizeAgentId(value) {
        return String(value || '').trim().toUpperCase();
    }

    function scheduleRealtimeRefresh(container, agentId, days) {
        if (analyticsRefreshTimer) window.clearTimeout(analyticsRefreshTimer);
        analyticsRefreshTimer = window.setTimeout(() => {
            renderAnalytics(container, agentId, days);
        }, 350);
    }

    function bindAnalyticsRealtime(container, agentId, days) {
        if (typeof getSocketClients !== 'function') return;
        const clients = getSocketClients();
        const socket = clients?.getAnalyticsSocket?.();
        if (!socket) return;

        if (analyticsSocket !== socket) {
            analyticsSocket = socket;
            analyticsSocketBound = false;
            analyticsSubscriptionAgentId = null;
            analyticsSubscriptionKey = null;
        }

        if (!analyticsSocketBound) {
            analyticsSocketBound = true;
            socket.on('analytics:snapshot', (payload) => {
                if (normalizeAgentId(payload?.agentId) !== normalizeAgentId(analyticsSubscriptionAgentId)) return;
                if (!analyticsRealtimeContainer || !analyticsSubscriptionAgentId) return;
                scheduleRealtimeRefresh(analyticsRealtimeContainer, analyticsSubscriptionAgentId, analyticsRealtimeDays);
            });
            socket.on('analytics:update', (payload) => {
                if (normalizeAgentId(payload?.agentId) !== normalizeAgentId(analyticsSubscriptionAgentId)) return;
                if (!analyticsRealtimeContainer || !analyticsSubscriptionAgentId) return;
                scheduleRealtimeRefresh(analyticsRealtimeContainer, analyticsSubscriptionAgentId, analyticsRealtimeDays);
            });
            socket.on('connect', () => {
                if (!analyticsSubscriptionAgentId) return;
                socket.emit('analytics:subscribe', { agentId: analyticsSubscriptionAgentId, windowDays: analyticsRealtimeDays, scale: 'day' });
            });
        }

        analyticsRealtimeContainer = container;
        analyticsRealtimeDays = days;
        if (analyticsSubscriptionAgentId && normalizeAgentId(analyticsSubscriptionAgentId) !== normalizeAgentId(agentId)) {
            socket.emit('analytics:unsubscribe', { agentId: analyticsSubscriptionAgentId });
        }
        analyticsSubscriptionAgentId = agentId;

        const nextKey = `${normalizeAgentId(agentId)}:${days}`;
        if (analyticsSubscriptionKey !== nextKey) {
            analyticsSubscriptionKey = nextKey;
            socket.emit('analytics:subscribe', { agentId, windowDays: days, scale: 'day' });
        }
    }

    async function renderAnalytics(container, agentId, days = 30) {
        try {
            const [{ data: agent }, { data: stats }] = await Promise.all([
                api(`/agents/${agentId}`),
                api(`/analytics/${agentId}?days=${days}`)
            ]);

            const maxTokenDay = stats.tokenUsage.reduce((m, d) => Math.max(m, (d.prompt_tokens || 0) + (d.completion_tokens || 0)), 1);
            const maxDailyConv = stats.dailyConversations?.reduce((m, d) => Math.max(m, d.c || 0), 1) || 1;
            const totalTokens = stats.tokenUsage.reduce((s, d) => s + (d.prompt_tokens || 0) + (d.completion_tokens || 0), 0);

            container.innerHTML = `
                <div class="container">
                    <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Agents</span></a>
                    <div class="analytics-header">
                        <img src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="" class="analytics-header__avatar">
                        <div>
                            <h2 class="analytics-header__title">${escapeHtml(agent.name)} &mdash; Analytics</h2>
                            <p class="text-muted analytics-header__meta">Last ${days} days</p>
                        </div>
                        <button class="btn btn-ghost btn-sm analytics-header__actions" id="copy-stats" title="Copy stats to clipboard">Copy Stats</button>
                    </div>

                    <div class="analytics-period-selector">
                        ${[7, 30, 90].map(d => `<button class="analytics-period-btn ${d === days ? 'analytics-period-btn--active' : ''}" data-days="${d}">${d}d</button>`).join('')}
                    </div>

                    <div class="analytics-cards">
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.conversations}</div>
                            <div class="analytics-card__label">Conversations</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.messages}</div>
                            <div class="analytics-card__label">Messages</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${totalTokens.toLocaleString()}</div>
                            <div class="analytics-card__label">Total Tokens</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.errors} <span class="analytics-stat-caption">(${stats.errorRate}%)</span></div>
                            <div class="analytics-card__label">Errors</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.avgResponseTimeMs ? (stats.avgResponseTimeMs / 1000).toFixed(1) + 's' : '-'}</div>
                            <div class="analytics-card__label">Avg Response</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.p50ResponseMs ? (stats.p50ResponseMs / 1000).toFixed(1) + 's' : '-'}</div>
                            <div class="analytics-card__label">p50 Response</div>
                        </div>
                        <div class="analytics-card">
                            <div class="analytics-card__value">${stats.p95ResponseMs ? (stats.p95ResponseMs / 1000).toFixed(1) + 's' : '-'}</div>
                            <div class="analytics-card__label">p95 Response</div>
                        </div>
                    </div>

                    ${stats.dailyConversations?.length ? `
                        <div class="card analytics-panel analytics-panel--lg">
                            <h4 class="analytics-panel__title">Daily Conversations</h4>
                            <div class="analytics-chart">
                                ${stats.dailyConversations.map(d => {
        const pct = Math.max(4, (d.c / maxDailyConv) * 100);
        const label = d.day.split('-').slice(1).join('/');
        return `<div class="analytics-chart__bar-group">
                                        <div class="analytics-chart__bar" style="height:${pct}%;background:var(--success)" title="${d.c} conversations on ${d.day}"></div>
                                        <span class="analytics-chart__label">${label}</span>
                                    </div>`;
    }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${stats.tokenUsage.length ? `
                        <div class="card analytics-panel">
                            <h4 class="analytics-panel__title">Token Usage</h4>
                            <div class="analytics-chart">
                                ${stats.tokenUsage.map(d => {
        const total = (d.prompt_tokens || 0) + (d.completion_tokens || 0);
        const pct = Math.max(4, (total / maxTokenDay) * 100);
        const label = d.day.split('-').slice(1).join('/');
        return `<div class="analytics-chart__bar-group">
                                        <div class="analytics-chart__bar" style="height:${pct}%" title="${total} tokens on ${d.day}"></div>
                                        <span class="analytics-chart__label">${label}</span>
                                    </div>`;
    }).join('')}
                            </div>
                        </div>
                    ` : '<p class="text-muted analytics-panel--lg">No token usage data yet.</p>'}

                    ${stats.byType.length ? `
                        <div class="card analytics-panel">
                            <h4 class="analytics-panel__title">Events by Type</h4>
                            ${stats.byType.map(e => `
                                <div class="analytics-list-item">
                                    <span>${escapeHtml(e.event_type)}</span>
                                    <span class="badge badge-ghost">${e.c}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
            container.querySelectorAll('.analytics-period-btn').forEach(btn => {
                btn.addEventListener('click', () => renderAnalytics(container, agentId, parseInt(btn.dataset.days, 10)));
            });
            container.querySelector('#copy-stats')?.addEventListener('click', () => {
                const text = `${agent.name} Analytics (${days}d)\nConversations: ${stats.conversations}\nMessages: ${stats.messages}\nTokens: ${totalTokens}\nErrors: ${stats.errors} (${stats.errorRate}%)\nAvg Response: ${(stats.avgResponseTimeMs / 1000).toFixed(1)}s\np50: ${(stats.p50ResponseMs / 1000).toFixed(1)}s, p95: ${(stats.p95ResponseMs / 1000).toFixed(1)}s`;
                navigator.clipboard.writeText(text).then(() => showToast('Stats copied', 'success'));
            });

            bindAnalyticsRealtime(container, agentId, days);
        } catch (err) {
            container.innerHTML = `<div class="container"><a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back</span></a><p class="text-muted mt-2">${escapeHtml(err.message)}</p></div>`;
            container.querySelector('[data-route]')?.addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
        }
    }

    return { renderAnalytics };
}
