import { evaluateAgentModelHealth } from '../utils/modelHealth.js';

export function createHubView(deps) {
    const { api, navigate, showToast, getAgentAvatarUrl, escapeHtml } = deps;

function getHubAgentHealth(agent) {
    const health = evaluateAgentModelHealth(agent);
    const cardClass = health.state === 'error'
        ? 'agent-card--model-error'
        : health.state === 'warning'
            ? 'agent-card--model-warning'
            : '';
    const indicator = health.state === 'ok'
        ? `<span class="agent-health-indicator agent-health-indicator--ok" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Ready</span>`
        : health.state === 'warning'
            ? `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`
            : health.state === 'error'
                ? `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`
                : `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
    const notice = health.state === 'warning'
        ? `<div class="agent-model-notice agent-model-notice--warning">${escapeHtml(health.summaryText)}</div>`
        : health.state === 'error'
            ? `<div class="agent-model-notice agent-model-notice--error">${escapeHtml(health.summaryText)}</div>`
            : '';
    return { health, cardClass, indicator, notice };
}

async function renderHub(container, path) {
    const pathOnly = (path || '/hub').split('?')[0];
    const pathClean = pathOnly.replace(/\/$/, '') || '/hub';
    const parts = pathClean.split('/').filter(Boolean);
    const sub = parts[1]; // 'skills' | 'agents'
    const id = parts[2];  // agent id when sub is 'agents'

    if (sub === 'agents' && id) {
        await renderHubAgentDetail(container, id);
        return;
    }
    if (sub === 'agents') {
        await renderHubAgents(container);
        return;
    }
    if (sub === 'skills') {
        await renderHubSkills(container);
        return;
    }
    await renderHubMain(container);
}

async function renderHubMain(container) {
    try {
        const [{ data: skills }, { data: agents }, { data: mySkills }] = await Promise.all([
            api('/hub/skills'),
            api('/agents/hub'),
            api('/skills')
        ]);
        const installed = new Set((mySkills || []).filter(s => s.source === 'installed').map(s => s.slug || s.name));
        const featuredSkills = (skills || []).slice(0, 3);
        const featuredAgents = (agents || []).slice(0, 4);
        const newSkills = (skills || []).slice(0, 6);
        const popularAgents = (agents || []).slice(0, 6);

        container.innerHTML = `
            <div class="container">
                <div class="view-header">
                    <h2 class="view-header__title">Hub</h2>
                    <div class="view-header__actions">
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/skills">Skills</a>
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents">Agents</a>
                    </div>
                </div>
                <section class="hub-section view-section">
                    <h3 class="section-heading">Featured</h3>
                    <div class="hub-featured-grid">
                        ${featuredSkills.length || featuredAgents.length ? `
                            ${featuredSkills.slice(0,2).map(s => `
                                <div class="card hub-card hub-card--skill">
                                    <div class="card-title">${escapeHtml(s.name)}</div>
                                    <div class="card-meta hub-card-meta--sm">${escapeHtml((s.description||'').slice(0,80))}${(s.description||'').length>80?'...':''}</div>
                                    <div class="card-actions">
                                        ${installed.has(s.slug || s.name) ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${s.slug || s.name}">Install</button>`}
                                    </div>
                                </div>
                            `).join('')}
                            ${featuredAgents.slice(0,2).map(a => `
                                ${(() => {
                                    const h = getHubAgentHealth(a);
                                    return `
                                <div class="card hub-card hub-card--agent ${h.cardClass}">
                                    <div class="card-header hub-card-header--tight">
                                        <img class="card-avatar hub-avatar--md" src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt="">
                                        <div>
                                            <div class="card-title hub-title-row">${escapeHtml(a.name)}${h.indicator}</div>
                                            <div class="card-meta hub-tagline--sm">${escapeHtml((a.tagline||'').slice(0,40))}</div>
                                        </div>
                                    </div>
                                    ${h.notice}
                                    <div class="card-actions">
                                        <a href="#" class="btn btn-primary btn-sm" data-route="/chat?agent=${a.id}">Chat</a>
                                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents/${a.id}">Details</a>
                                    </div>
                                </div>
                                    `;
                                })()}
                            `).join('')}
                        ` : '<p class="text-muted">Nothing featured yet.</p>'}
                    </div>
                </section>
                <section class="hub-section view-section">
                    <div class="view-subheader">
                        <h3 class="section-heading">New Skills</h3>
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/skills">View all</a>
                    </div>
                    ${newSkills.length ? `
                    <div class="card-grid">
                        ${newSkills.map(s => `
                            <div class="card">
                                <div class="card-title">${escapeHtml(s.name)}</div>
                                <div class="card-meta">${escapeHtml((s.description||'').slice(0,100))}</div>
                                <div class="card-actions">
                                    ${installed.has(s.slug || s.name) ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${s.slug || s.name}">Install</button>`}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ` : '<p class="text-muted">No skills published yet.</p>'}
                </section>
                <section class="hub-section">
                    <div class="view-subheader">
                        <h3 class="section-heading">Popular Agents</h3>
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents">View all</a>
                    </div>
                    ${popularAgents.length ? `
                    <div class="card-grid">
                        ${popularAgents.map(a => `
                            ${(() => {
                                const h = getHubAgentHealth(a);
                                return `
                            <div class="card agent-card ${h.cardClass}">
                                <div class="card-header">
                                    <img class="card-avatar" src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt="">
                                    <div>
                                        <div class="card-title hub-title-row">${escapeHtml(a.name)}${h.indicator}</div>
                                        <div class="card-meta">${escapeHtml(a.tagline || '')}</div>
                                    </div>
                                </div>
                                ${h.notice}
                                <div class="card-body-meta">${(a.tags||[]).slice(0,3).map(t=>`<span class="badge badge-tag">${escapeHtml(t.name)}</span>`).join(' ')}</div>
                                <div class="card-actions">
                                    <a href="#" class="btn btn-primary" data-route="/chat?agent=${a.id}">Chat</a>
                                    <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents/${a.id}">Details</a>
                                </div>
                            </div>
                                `;
                            })()}
                        `).join('')}
                    </div>
                    ` : '<p class="text-muted">No agents in the hub yet.</p>'}
                </section>
            </div>
        `;
        container.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
        container.querySelectorAll('.btn-install').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api(`/hub/skills/${btn.dataset.slug}/install`, { method: 'POST' });
                    showToast('Skill installed', 'success');
                    renderHub(container, '/hub');
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
    }
}

async function renderHubSkills(container) {
    try {
        const { data: skills } = await api('/hub/skills');
        const { data: mySkills } = await api('/skills');
        const installed = new Set((mySkills || []).filter(s => s.source === 'installed').map(s => s.slug || s.name));
        container.innerHTML = `
            <div class="container">
                <div class="view-header">
                    <h2 class="view-header__title">Skills</h2>
                    <a href="#" class="btn btn-ghost btn-sm btn-chevron btn-chevron--back" data-route="/hub"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Hub</span></a>
                </div>
                ${(skills || []).length ? `
                <div class="card-grid">
                    ${(skills || []).map(s => `
                        <div class="card">
                            <div class="card-title">${escapeHtml(s.name)}</div>
                            <div class="card-meta">${escapeHtml(s.description || '')}</div>
                            <div class="card-actions">
                                ${installed.has(s.slug || s.name) ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${s.slug || s.name}">Install</button>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : '<p class="text-muted">No skills published to the Hub yet.</p>'}
            </div>
        `;
        container.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); }));
        container.querySelectorAll('.btn-install').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api(`/hub/skills/${btn.dataset.slug}/install`, { method: 'POST' });
                    showToast('Skill installed', 'success');
                    renderHub(container, '/hub/skills');
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
    }
}

async function renderHubAgents(container) {
    try {
        const [{ data: agents }, { data: allTags }] = await Promise.all([
            api('/agents/hub'),
            api('/agents/tags').catch(() => ({ data: [] }))
        ]);
        const tagFilter = new URLSearchParams(location.search).get('tag') || '';
        const filtered = !tagFilter ? (agents || []) : (agents || []).filter(a => (a.tags || []).some(t => (t.name || t) === tagFilter));
        container.innerHTML = `
            <div class="container">
                <div class="view-header">
                    <h2 class="view-header__title">Bot Hub</h2>
                    <div class="view-header__actions">
                        ${(allTags || []).length ? `
                        <select id="hub-agent-tag-filter" class="form-input form-input--sm ui-select-compact">
                            <option value="">All tags</option>
                            ${(allTags || []).map(t => `<option value="${escapeHtml(t.name)}" ${t.name === tagFilter ? 'selected' : ''}>${escapeHtml(t.name)} (${t.agent_count ?? 0})</option>`).join('')}
                        </select>
                        ` : ''}
                        <a href="#" class="btn btn-ghost btn-sm btn-chevron btn-chevron--back" data-route="/hub"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Hub</span></a>
                        <a href="#" class="btn btn-ghost" data-route="/agents">My Agents</a>
                    </div>
                </div>
                ${(agents || []).length === 0 ? `
                    <div class="card empty-state">
                        <p class="text-muted">No published agents in the hub yet.</p>
                    </div>
                ` : `
                    ${tagFilter ? `<p class="text-muted view-note">Filtering by tag: <strong>${escapeHtml(tagFilter)}</strong></p>` : ''}
                    <div class="card-grid">
                        ${filtered.map(a => `
                            ${(() => {
                                const h = getHubAgentHealth(a);
                                return `
                            <div class="card agent-card ${h.cardClass}">
                                <div class="card-header">
                                    <img class="card-avatar" src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt="">
                                    <div>
                                        <div class="card-title hub-title-row">${escapeHtml(a.name)}${h.indicator}</div>
                                        <div class="card-meta">${escapeHtml(a.tagline || '')}</div>
                                    </div>
                                </div>
                                ${h.notice}
                                <div class="card-body-meta">${(a.tags||[]).slice(0,3).map(t=>`<span class="badge badge-tag">${escapeHtml(t.name)}</span>`).join(' ')}</div>
                                <div class="card-actions">
                                    <a href="#" class="btn btn-primary" data-route="/chat?agent=${a.id}">Chat</a>
                                    <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents/${a.id}">Details</a>
                                    ${a.isSubscribed ? '<span class="badge hub-badge-success">Subscribed</span>' : `<button class="btn btn-ghost btn-sm btn-hub-sub" data-id="${a.id}">Subscribe</button>`}
                                </div>
                            </div>
                                `;
                            })()}
                        `).join('')}
                    </div>
                `}
            </div>
        `;
        container.querySelector('#hub-agent-tag-filter')?.addEventListener('change', (e) => {
            const v = e.target.value;
            const url = new URL(location.href);
            if (v) url.searchParams.set('tag', v);
            else url.searchParams.delete('tag');
            navigate(url.pathname + url.search);
        });
        container.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); }));
        container.querySelectorAll('.btn-hub-sub').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api(`/agents/${btn.dataset.id}/subscribe`, { method: 'POST' });
                    showToast('Subscribed!', 'success');
                    renderHub(container, '/hub/agents' + (location.search || ''));
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-danger">${escapeHtml(err.message)}</p></div>`;
    }
}

async function renderHubAgentDetail(container, agentId) {
    try {
        const { data: agent } = await api(`/agents/${agentId}`);
        const h = getHubAgentHealth(agent);
        container.innerHTML = `
            <div class="container">
                <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/hub/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Hub</span></a>
                <div class="card ${h.cardClass} hub-detail-card">
                    <div class="card-header">
                        <img class="card-avatar hub-avatar--lg" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                        <div>
                            <div class="card-title hub-title-row hub-title-row--detail">${escapeHtml(agent.name)}${h.indicator}</div>
                            <div class="card-meta">${escapeHtml(agent.tagline || '')}</div>
                        </div>
                    </div>
                    ${h.notice}
                    <div class="card-body-meta hub-detail-meta">
                        ${(agent.tags || []).map(t => `<span class="badge badge-tag">${escapeHtml(t.name)}</span>`).join(' ')}
                        <span class="badge badge-ghost">${escapeHtml(agent.text_provider_display || agent.textProviderDisplayName || agent.text_provider || '')}</span>
                    </div>
                    <div class="card-actions">
                        <a href="#" class="btn btn-primary" data-route="/chat?agent=${agent.id}">Chat</a>
                        ${agent.isSubscribed ? `<button class="btn btn-ghost btn-unsubscribe" data-id="${agent.id}">Unsubscribe</button>` : `<button class="btn btn-primary btn-subscribe" data-id="${agent.id}">Subscribe</button>`}
                        <a href="#" class="btn btn-ghost btn-copy-from-hub" data-id="${agent.id}">Copy to My Agents</a>
                    </div>
                </div>
            </div>
        `;
        container.querySelector('[data-route="/hub/agents"]')?.addEventListener('click', (e) => { e.preventDefault(); navigate('/hub/agents'); });
        container.querySelectorAll('[data-route^="/agents/"]').forEach(el => {
            if (el.dataset.route.includes('/chat')) el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
        container.querySelector('.btn-subscribe')?.addEventListener('click', async () => {
            try {
                await api(`/agents/${agent.id}/subscribe`, { method: 'POST' });
                showToast('Subscribed!', 'success');
                renderHub(container, `/hub/agents/${agentId}`);
            } catch (e) { showToast(e.message, 'error'); }
        });
        container.querySelector('.btn-unsubscribe')?.addEventListener('click', async () => {
            try {
                await api(`/agents/${agent.id}/subscribe`, { method: 'DELETE' });
                showToast('Unsubscribed', 'success');
                renderHub(container, `/hub/agents/${agentId}`);
            } catch (e) { showToast(e.message, 'error'); }
        });
        container.querySelector('.btn-copy-from-hub')?.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify({ copyFrom: agent.id }) });
                showToast('Agent copied!', 'success');
                navigate(`/agents/${data.id}`);
            } catch (err) { showToast(err.message, 'error'); }
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-danger">${escapeHtml(err.message)}</p></div>`;
    }
}

// ─── Deploy ───────────────────────────────────────────────────────────────────

    return { renderHub, renderHubMain, renderHubSkills, renderHubAgents, renderHubAgentDetail };
}

