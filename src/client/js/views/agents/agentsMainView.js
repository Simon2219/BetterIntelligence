import { evaluateAgentModelHealth } from '../../utils/modelHealth.js';

export function createAgentsView(deps) {
    const { api, navigate, showToast, showConfirm, getAgentAvatarUrl, escapeHtml, getToken, API_BASE, makeDropZone } = deps;

async function renderAgents(container, path) {
    const parts = path.split('/').filter(Boolean);
    const isNew = parts[1] === 'new';
    const editId = parts[1] && parts[1] !== 'new' ? parts[1] : null;

    if (isNew || editId) {
        await renderAgentForm(container, editId);
        return;
    }

    try {
        const [{ data: agents }, { data: allTags }, { data: agentCategories }, { data: chats }, { data: hubAgents }] = await Promise.all([
            api('/agents'),
            api('/agents/tags').catch(() => ({ data: [] })),
            api('/agents/categories').catch(() => ({ data: [] })),
            api('/chats').catch(() => ({ data: [] })),
            api('/agents/hub').catch(() => ({ data: [] }))
        ]);
        const tagFilter = new URLSearchParams(location.search).get('tag') || '';
        const categoryFilter = new URLSearchParams(location.search).get('category') || '';
        const own = (agents || []).filter(a => a.isOwner);
        const subscribed = (agents || []).filter(a => a.isSubscribed);
        const applyTagFilter = (list) => !tagFilter ? list : list.filter(a => (a.tags || []).some(t => (t.name || t) === tagFilter));
        const ownFiltered = applyTagFilter(own);
        const subFiltered = applyTagFilter(subscribed);
        const agentCats = agentCategories || [];
        const ownByCategory = {};
        const ownUncategorized = [];
        for (const a of ownFiltered) {
            const cid = (a.categoryIds || [])[0];
            if (!cid) ownUncategorized.push(a);
            else { (ownByCategory[cid] = ownByCategory[cid] || []).push(a); }
        }
        const agentMap = new Map((agents || []).map(a => [a.id, a]));
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const chatsThisWeek = (chats || []).filter(c => (c.last_message_at || c.updated_at || c.created_at) && new Date(c.last_message_at || c.updated_at || c.created_at) >= weekAgo).length;
        const suggested = (hubAgents || []).filter(h => !agents?.some(a => a.id === h.id)).slice(0, 3);
        const agentCardHtml = (a) => {
            const health = evaluateAgentModelHealth(a);
            const healthClass = health.state === 'error'
                ? 'agent-card--model-error'
                : health.state === 'warning'
                    ? 'agent-card--model-warning'
                    : '';
            const healthIndicator = health.state === 'ok'
                ? `<span class="agent-health-indicator agent-health-indicator--ok" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Ready</span>`
                : health.state === 'warning'
                    ? `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`
                    : health.state === 'error'
                        ? `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`
                        : `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(health.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
            const healthNotice = health.state === 'warning'
                ? `<div class="agent-model-notice agent-model-notice--warning">${escapeHtml(health.summaryText)}</div>`
                : health.state === 'error'
                    ? `<div class="agent-model-notice agent-model-notice--error">${escapeHtml(health.summaryText)}</div>`
                    : '';
            const textProviderDisplay = a.text_provider_display || a.textProviderDisplayName || a.text_provider || 'provider';
            return `
            <div class="card agent-card agent-card--relative ${a.isOwner && agentCats.length ? 'agent-card--draggable' : ''} ${a.isSubscribed ? 'agent-card--subscribed' : ''} ${healthClass}" data-agent-id="${a.id}" ${a.isOwner && agentCats.length ? 'draggable="true"' : ''}>
                ${a.isOwner && agentCats.length ? `
                <div class="agent-card-menu">
                    <button type="button" class="agent-category-arrow" data-agent-id="${a.id}" title="Options" aria-label="Agent options" aria-haspopup="true"><span class="ui-chevron" aria-hidden="true"></span></button>
                </div>` : ''}
                <div class="card-header">
                    <img class="card-avatar" src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt="">
                    <div class="agent-card-header-main">
                        <div class="agent-card-title-row">
                            <div class="card-title">${escapeHtml(a.name || 'Agent')}</div>
                            ${a.isSubscribed ? '<span class="badge badge-info">Subscribed</span>' : '<span class="badge badge-ghost">Own</span>'}
                            ${healthIndicator}
                        </div>
                        <div class="card-meta">${escapeHtml(a.tagline || a.text_model_display || a.textModelDisplayName || a.text_model || 'No model')}</div>
                    </div>
                </div>
                ${healthNotice}
                <div class="card-body-meta">
                    <span class="badge badge-provider">${escapeHtml(textProviderDisplay)}</span>
                    <span class="badge badge-model">${escapeHtml(a.text_model_display || a.textModelDisplayName || a.text_model || '-')}</span>
                    ${(a.tags || []).slice(0,3).map(t => `<span class="badge badge-tag">${escapeHtml(t.name)}</span>`).join('')}
                    ${(a.userPrivateTags || []).map(t => `<span class="badge private-tag-badge" style="background:${escapeHtml(t.color || '#3b82f6')}">${escapeHtml(t.name)}</span>`).join('')}
                </div>
                <div class="card-actions agent-card-actions">
                    <a href="#" class="btn btn-primary" data-route="/chat?agent=${a.id}">Chat</a>
                    ${a.isOwner ? `
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/agents/${a.id}">Edit</a>
                        <a href="#" class="btn btn-ghost btn-sm" data-route="/agents/${a.id}/analytics">Stats</a>
                        <button class="btn btn-ghost btn-sm btn-delete" data-id="${a.id}">Delete</button>
                    ` : `
                        <a href="#" class="btn btn-ghost btn-sm btn-copy-agent" data-id="${a.id}">Copy</a>
                    `}
                </div>
            </div>
        `;
        };
        container.innerHTML = `
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
                    ${(tagFilter || categoryFilter) ? `<p class="text-muted agents-filter-note">${tagFilter ? `Filtering by tag: <strong>${escapeHtml(tagFilter)}</strong>` : ''}${tagFilter && categoryFilter ? ' | ' : ''}${categoryFilter ? `Filtering by category: <strong>${escapeHtml(agentCats.find(c => c.id === categoryFilter)?.name || 'Selected')}</strong> <a href="#" id="clear-category-filter" class="agents-clear-filter">Clear</a>` : ''}</p>` : ''}
                    <div class="agents-dashboard">
                        <div class="agents-stats-row">
                            <div class="card agents-stat-card">
                                <div class="agents-stat-value agents-stat-value--primary">${(agents || []).length}</div>
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
                                ${(allTags || []).length ? `
                                <select id="agent-tag-filter" class="form-input form-input--sm ui-select-compact">
                                    <option value="">All tags</option>
                                    ${(allTags || []).map(t => `<option value="${escapeHtml(t.name)}" ${t.name === tagFilter ? 'selected' : ''}>${escapeHtml(t.name)} (${t.agent_count ?? 0})</option>`).join('')}
                                </select>
                                ` : ''}
                                ${agentCats.length || ownFiltered.length ? `
                                <div class="agents-category-dropdown">
                                    <button type="button" class="btn btn-ghost agents-category-trigger" id="agents-category-arrow" title="Categories" aria-haspopup="true"><span>Categories</span><span class="ui-chevron" aria-hidden="true"></span></button>
                                    <div id="agents-category-submenu" class="agents-category-submenu"></div>
                                </div>` : ''}
                                <a href="#" class="btn btn-primary" data-route="/agents/new">+ New Agent</a>
                            </div>
                        </div>
                        <div class="agents-categories-grid">
                        ${agentCats.length ? agentCats.filter(cat => !categoryFilter || cat.id === categoryFilter).map(cat => {
                            const items = ownByCategory[cat.id] || [];
                            return `
                        <div class="agents-category agents-category-drop" data-category-id="${cat.id}">
                            <h3 class="agents-category-title">${escapeHtml(cat.name)} <span class="badge badge-ghost">${items.length}</span></h3>
                            <div class="card-grid agent-card-grid agents-category-cards agents-category-dropzone ${!items.length ? 'agents-category-dropzone--empty agents-category-dropzone--tall' : ''}">${items.length ? items.map(agentCardHtml).join('') : '<div class="agents-category-empty-hint">Drop agents here</div>'}</div>
                        </div>`;
                        }).join('') : ''}
                        <div class="agents-section agents-own agents-category agents-category-drop ${categoryFilter && categoryFilter !== '' ? 'agents-section--hidden' : ''}" data-category-id="">
                            <h3 class="agents-category-title">${agentCats.length ? 'Uncategorized' : 'Own Agents'} <span class="badge badge-ghost">${agentCats.length ? ownUncategorized.length : ownFiltered.length}</span></h3>
                            ${(agentCats.length ? ownUncategorized : ownFiltered).length ? `
                            <div class="card-grid agent-card-grid agents-category-cards agents-category-dropzone">${(agentCats.length ? ownUncategorized : ownFiltered).map(agentCardHtml).join('')}</div>
                            ` : agentCats.length ? `
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
                            <h3 class="agents-category-title">Subscribed Agents <span class="badge badge-ghost">${subFiltered.length}</span></h3>
                            ${subFiltered.length ? `
                            <div class="card-grid agent-card-grid">${subFiltered.map(agentCardHtml).join('')}</div>
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
                                ${suggested.map(a => `
                                    ${(() => {
                                        const h = evaluateAgentModelHealth(a);
                                        const indicator = h.state === 'ok'
                                            ? `<span class="agent-health-indicator agent-health-indicator--ok" title="${escapeHtml(h.summaryText)}"><span class="agent-health-indicator__dot"></span>Ready</span>`
                                            : h.state === 'warning'
                                                ? `<span class="agent-health-indicator agent-health-indicator--warning" title="${escapeHtml(h.summaryText)}"><span class="agent-health-indicator__dot"></span>Partial</span>`
                                                : h.state === 'error'
                                                    ? `<span class="agent-health-indicator agent-health-indicator--error" title="${escapeHtml(h.summaryText)}"><span class="agent-health-indicator__dot"></span>Unavailable</span>`
                                                    : `<span class="agent-health-indicator agent-health-indicator--unknown" title="${escapeHtml(h.summaryText)}"><span class="agent-health-indicator__dot"></span>No model</span>`;
                                        return `
                                    <a href="#" class="card agents-suggested-card" data-route="/hub/agents">
                                        <img src="${getAgentAvatarUrl(a, { shape: 'circle' })}" alt="" class="agents-suggested-avatar">
                                        <div class="agents-suggested-main">
                                            <div class="agents-suggested-name">${escapeHtml(a.name || 'Agent')}</div>
                                            <div class="agents-suggested-tagline">${escapeHtml((a.tagline || '').slice(0,40))}${(a.tagline || '').length > 40 ? '...' : ''}</div>
                                            <div class="agents-suggested-health">${indicator}</div>
                                        </div>
                                    </a>
                                        `;
                                    })()}
                                `).join('')}
                                <a href="#" class="btn btn-ghost btn-sm btn-chevron btn-chevron--forward" data-route="/hub"><span>Browse Hub</span><span class="ui-chevron ui-chevron--right" aria-hidden="true"></span></a>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                `}
            </div>
        `;

        container.querySelector('#agent-tag-filter')?.addEventListener('change', (e) => {
            const v = e.target.value;
            const url = new URL(location.href);
            if (v) url.searchParams.set('tag', v);
            else url.searchParams.delete('tag');
            navigate(url.pathname + url.search);
        });
        container.querySelector('#agents-category-arrow')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            const sub = document.getElementById('agents-category-submenu');
            if (!sub) return;
            const closeSub = () => { sub.classList.remove('agents-category-submenu--open'); document.removeEventListener('click', closeSub); };
            if (sub.classList.contains('agents-category-submenu--open')) { closeSub(); return; }
            sub.classList.add('agents-category-submenu--open');
            sub.innerHTML = `
                <button type="button" class="agents-submenu-item" data-action="manage">Manage Categories</button>
                <button type="button" class="agents-submenu-item" data-action="filter">Filter by Category</button>
            `;
            sub.style.left = btn.getBoundingClientRect().left + 'px';
            sub.style.top = (btn.getBoundingClientRect().bottom + 4) + 'px';
            setTimeout(() => document.addEventListener('click', closeSub), 0);
            sub.querySelector('[data-action="manage"]').addEventListener('click', (ev) => { ev.stopPropagation(); sub.classList.remove('agents-category-submenu--open'); document.removeEventListener('click', closeSub); renderAgentsCategoryManager(container, agentCats); });
            sub.querySelector('[data-action="filter"]').addEventListener('click', (ev) => {
                ev.stopPropagation();
                sub.classList.remove('agents-category-submenu--open');
                document.removeEventListener('click', closeSub);
                let pop = document.getElementById('agent-filter-category-popover');
                if (pop) pop.remove();
                pop = document.createElement('div');
                pop.id = 'agent-filter-category-popover';
                pop.className = 'agent-category-popover agent-category-popover--wide';
                pop.style.left = `${btn.getBoundingClientRect().left}px`;
                pop.style.top = `${btn.getBoundingClientRect().bottom + 4}px`;
                pop.innerHTML = [
                    `<button type="button" class="agent-cat-option ${!categoryFilter ? 'agent-cat-option--active' : ''}" data-id="">All categories</button>`,
                    ...(agentCats || []).map(c => `<button type="button" class="agent-cat-option ${c.id === categoryFilter ? 'agent-cat-option--active' : ''}" data-id="${c.id}">${escapeHtml(c.name)}</button>`)
                ].join('');
                document.body.appendChild(pop);
                const closePop = () => { pop.remove(); document.removeEventListener('click', closePop); };
                setTimeout(() => document.addEventListener('click', closePop), 0);
                pop.querySelectorAll('.agent-cat-option').forEach(opt => {
                    opt.addEventListener('click', (ev2) => {
                        ev2.stopPropagation();
                        const catId = opt.dataset.id || '';
                        const url = new URL(location.href);
                        if (catId) url.searchParams.set('category', catId);
                        else url.searchParams.delete('category');
                        navigate(url.pathname + url.search);
                        pop.remove();
                        document.removeEventListener('click', closePop);
                    });
                });
            });
        });
        container.querySelector('#clear-category-filter')?.addEventListener('click', (e) => {
            e.preventDefault();
            const url = new URL(location.href);
            url.searchParams.delete('category');
            navigate(url.pathname + url.search);
        });
        container.querySelectorAll('.agent-category-arrow').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const agentId = btn.dataset.agentId;
                const agent = agentMap.get(agentId);
                const currentCatId = (agent?.categoryIds || [])[0] || '';
                const rect = btn.getBoundingClientRect();
                let sub = document.getElementById('agent-card-submenu');
                if (sub) sub.remove();
                sub = document.createElement('div');
                sub.id = 'agent-card-submenu';
                sub.className = 'agent-card-submenu';
                sub.style.left = `${rect.left}px`;
                sub.style.top = `${rect.bottom + 4}px`;
                sub.innerHTML = `<button type="button" class="agent-submenu-item" data-action="change-category">Change Category</button>`;
                document.body.appendChild(sub);
                const closeSub = () => { sub.remove(); document.removeEventListener('click', closeSub); };
                setTimeout(() => document.addEventListener('click', closeSub), 0);
                sub.querySelector('[data-action="change-category"]').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    sub.remove();
                    document.removeEventListener('click', closeSub);
                    let pop = document.getElementById('agent-category-popover');
                    if (pop) pop.remove();
                    pop = document.createElement('div');
                    pop.id = 'agent-category-popover';
                    pop.className = 'agent-category-popover';
                    pop.style.left = `${rect.left}px`;
                    pop.style.top = `${rect.bottom + 4}px`;
                    pop.innerHTML = agentCats.length ? [
                        `<button type="button" class="agent-cat-option ${!currentCatId ? 'agent-cat-option--active' : ''}" data-id="">No category</button>`,
                        ...agentCats.map(c => `<button type="button" class="agent-cat-option ${c.id === currentCatId ? 'agent-cat-option--active' : ''}" data-id="${c.id}">${escapeHtml(c.name)}</button>`)
                    ].join('') : '<p class="text-muted agent-category-popover__empty">No categories. Add one first.</p>';
                    document.body.appendChild(pop);
                    const closePop = () => { pop.remove(); document.removeEventListener('click', closePop); };
                    setTimeout(() => document.addEventListener('click', closePop), 0);
                    pop.querySelectorAll('.agent-cat-option').forEach(opt => {
                        opt.addEventListener('click', async (ev2) => {
                            ev2.stopPropagation();
                            const categoryId = opt.dataset.id || null;
                            try {
                                await api(`/agents/${agentId}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
                                showToast('Category updated', 'success');
                                pop.remove();
                                document.removeEventListener('click', closePop);
                                renderAgents(container, '/agents');
                            } catch (err) { showToast(err.message, 'error'); }
                        });
                    });
                });
            });
        });
        if (agentCats.length) {
            container.querySelectorAll('.agent-card--draggable').forEach(card => {
                card.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', card.dataset.agentId);
                    e.dataTransfer.effectAllowed = 'move';
                    card.classList.add('agent-card-dragging');
                });
                card.addEventListener('dragend', () => card.classList.remove('agent-card-dragging'));
            });
            container.querySelectorAll('.agents-category-drop').forEach(zone => {
                const cardsEl = zone.querySelector('.agents-category-cards');
                if (!cardsEl) return;
                zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('agents-category-drop--over'); });
                zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('agents-category-drop--over'); });
                zone.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    zone.classList.remove('agents-category-drop--over');
                    const agentId = e.dataTransfer.getData('text/plain');
                    if (!agentId) return;
                    const categoryId = zone.dataset.categoryId || null;
                    const agent = agentMap.get(agentId);
                    if (!agent?.isOwner) return;
                    const currentCatId = (agent.categoryIds || [])[0] || null;
                    if (currentCatId === categoryId) return;
                    try {
                        await api(`/agents/${agentId}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
                        showToast('Agent moved', 'success');
                        renderAgents(container, '/agents');
                    } catch (err) { showToast(err.message, 'error'); }
                });
            });
        }
        container.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await showConfirm({ title: 'Delete Agent', message: 'This will permanently delete the agent and all conversations.', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
                if (!ok) return;
                try {
                    await api(`/agents/${btn.dataset.id}`, { method: 'DELETE' });
                    showToast('Agent deleted', 'success');
                    renderAgents(container, '/agents');
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
        container.querySelectorAll('.btn-copy-agent').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    const { data } = await api('/agents', { method: 'POST', body: JSON.stringify({ copyFrom: btn.dataset.id }) });
                    showToast('Agent copied!', 'success');
                    navigate(`/agents/${data.id}`);
                } catch (err) { showToast(err.message, 'error'); }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
    }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Agent Builder (7-Step) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const PROMPT_TEMPLATES = [
    { label: 'Helpful Assistant', prompt: 'You are a helpful, friendly assistant. Answer questions clearly and concisely. If you don\'t know something, say so honestly.' },
    { label: 'Creative Writer', prompt: 'You are a creative writing assistant. Help users brainstorm ideas, write stories, improve prose, and explore creative possibilities. Be imaginative and encouraging.' },
    { label: 'Code Helper', prompt: 'You are an expert coding assistant. Help users write, debug, and understand code. Explain concepts clearly and provide working examples. Always consider best practices and edge cases.' },
    { label: 'Tutor', prompt: 'You are a patient, knowledgeable tutor. Break down complex concepts into simple terms. Use analogies and examples. Ask follow-up questions to check understanding.' },
];

async function renderAgentForm(container, agentId) {
    let agent = null;
    if (agentId) {
        try {
            const { data } = await api(`/agents/${agentId}`);
            agent = data;
        } catch {
            showToast('Agent not found', 'error');
            navigate('/agents');
            return;
        }
    }

    let step = 1;
    const TOTAL_STEPS = 7;
    let skillIds = [...(agent?.skillIds || [])];
    let behaviorRules = Array.isArray(agent?.behavior_rules?.rules) ? [...agent.behavior_rules.rules] : (Array.isArray(agent?.behavior_rules) ? [...agent.behavior_rules] : []);
    let allowedTopics = agent?.behavior_rules?.allowedTopics || [];
    let blockedTopics = agent?.behavior_rules?.blockedTopics || [];
    let sampleDialogues = Array.isArray(agent?.sample_dialogues) ? [...agent.sample_dialogues] : [];
    const configuredModelStatuses = Array.isArray(agent?.modelStatuses) ? agent.modelStatuses : [];

    let formData = {
        name: agent?.name || '',
        tagline: agent?.tagline || '',
        tagNames: (agent?.tags || []).map(t => t.name || t),
        avatarUrl: agent?.avatar_url || agent?.avatarUrl || '',
        systemPrompt: agent?.system_prompt || '',
        textProvider: agent?.text_provider || 'ollama',
        textProviderDisplay: agent?.text_provider_display || agent?.textProviderDisplayName || agent?.text_provider || 'ollama',
        textModel: agent?.text_model || '',
        textModelDisplay: agent?.text_model_display || agent?.textModelDisplayName || agent?.text_model || '',
        imageProvider: agent?.image_provider || '',
        imageProviderDisplay: agent?.image_provider_display || agent?.imageProviderDisplayName || agent?.image_provider || '',
        imageModel: agent?.image_model || '',
        imageModelDisplay: agent?.image_model_display || agent?.imageModelDisplayName || agent?.image_model || '',
        temperature: agent?.temperature ?? 0.8,
        maxTokens: agent?.max_tokens || 512,
        topP: agent?.top_p ?? 0.9,
        topK: agent?.top_k ?? 40,
        repeatPenalty: agent?.repeat_penalty ?? 1.1,
        presencePenalty: agent?.presence_penalty ?? 0,
        frequencyPenalty: agent?.frequency_penalty ?? 0,
        stopSequences: agent?.stop_sequences || [],
        responseFormat: agent?.response_format || 'auto',
        greetingMessage: agent?.greeting_message || '',
        contextWindow: agent?.context_window ?? 50,
        memoryStrategy: agent?.memory_strategy || 'full',
        formality: agent?.formality ?? 5,
        verbosity: agent?.verbosity ?? 5,
        responseLength: agent?.metadata?.responseLength || 'medium',
        creativityFactuality: agent?.metadata?.creativityFactuality ?? 5,
        roleplayMode: agent?.metadata?.roleplayMode || 'assistant',
        responseDelayMin: agent?.metadata?.responseDelayMin ?? 0,
        responseDelayMax: agent?.metadata?.responseDelayMax ?? 0,
        profanityFilter: agent?.metadata?.profanityFilter || 'allow',
        hubPublished: agent?.hub_published === 1,
    };

    let _providersCache = null;
    let _builderCleanup = null;
    let _builderDirty = false;
    const _tutorialComplete = sessionStorage.getItem('agentBuilderTutorialComplete') === 'true';

    function validateStep(s) {
        if (s === 1 && !formData.name.trim()) return { block: 'Agent name is required' };
        if (s === 2 && !formData.systemPrompt.trim()) return { warn: 'No system prompt set. Your agent may give generic responses.' };
        if (s === 6 && !formData.textProvider) return { warn: 'No text provider selected. The agent will not generate responses.' };
        return {};
    }

    function markDirty() { _builderDirty = true; }
    function onBeforeUnload(e) { if (_builderDirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);
    const _origNavigate = navigate;

    const DEFAULTS = { temperature: 0.8, maxTokens: 512, topP: 0.9, topK: 40, repeatPenalty: 1.1, presencePenalty: 0, frequencyPenalty: 0, contextWindow: 50, formality: 5, verbosity: 5 };

    async function fetchProviders(forceRefresh = false) {
        if (!forceRefresh && _providersCache) return _providersCache;
        try {
            const { data } = await api('/ai/providers');
            _providersCache = data;
            return data;
        } catch {
            return [];
        }
    }

    function normalizeModelOptions(models) {
        return (Array.isArray(models) ? models : [])
            .map((entry) => {
                if (typeof entry === 'string') {
                    const id = entry.trim();
                    if (!id) return null;
                    return { id, displayName: id, isActive: true, isUserVisible: true };
                }
                if (!entry || typeof entry !== 'object') return null;
                const id = String(entry.id || entry.model || entry.name || '').trim();
                if (!id) return null;
                const displayName = String(entry.displayName || entry.display_name || entry.label || entry.name || id).trim() || id;
                return {
                    id,
                    displayName,
                    isActive: entry.isActive !== false,
                    isUserVisible: entry.isUserVisible !== false
                };
            })
            .filter(Boolean);
    }

    function renderStep() {
        const steps = [
            { id: 'identity', title: 'Identity', desc: 'Name & appearance' },
            { id: 'personality', title: 'Personality', desc: 'Prompt & style' },
            { id: 'skills', title: 'Skills', desc: 'Drag & drop pipeline' },
            { id: 'knowledge', title: 'Knowledge', desc: 'Document context' },
            { id: 'behavior', title: 'Behavior', desc: 'Rules & guardrails' },
            { id: 'model', title: 'Model', desc: 'AI providers' },
            { id: 'review', title: 'Review', desc: 'Test & finish' }
        ];
        container.innerHTML = `
            <div class="container">
                <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Agents</span></a>
                <h2 class="agent-builder-title">${agent ? 'Edit Agent' : 'Create New Agent'}</h2>
                <p class="text-muted agent-builder-subtitle">Step ${step} of ${TOTAL_STEPS} &mdash; ${steps[step - 1].desc}${_tutorialComplete ? ' <a href="#" class="builder-tour-link" id="agent-builder-tour">Take tour again</a>' : ''}</p>
                <div class="agent-builder">
                    <div class="agent-builder__stepper">
                        ${steps.map((s, i) => `
                            <button class="stepper-step ${i + 1 === step ? 'stepper-step--active' : ''} ${i + 1 < step ? 'stepper-step--completed' : ''}" data-step="${i + 1}" type="button" ${!_tutorialComplete && i + 1 > step ? 'disabled' : ''}>
                                <div class="stepper-step__number">${i + 1 < step ? '&#10003;' : i + 1}</div>
                                <div class="stepper-step__info">
                                    <div class="stepper-step__label">${s.title}</div>
                                    <div class="stepper-step__desc">${s.desc}</div>
                                </div>
                                ${i < steps.length - 1 ? '<div class="stepper-step__connector"></div>' : ''}
                            </button>
                        `).join('')}
                    </div>
                    <div class="agent-builder__content card">
                        <div id="agent-step-content"></div>
                        <div class="agent-builder__actions">
                            ${step > 1 ? '<button type="button" class="btn btn-ghost" id="agent-back">Back</button>' : '<span></span>'}
                            ${step === TOTAL_STEPS ? `
                                ${agent ? '<button type="button" class="btn btn-ghost" id="agent-save-open">Save & Open Chat</button>' : ''}
                                <button type="button" class="btn btn-primary" id="agent-next">${agent ? 'Save Changes' : 'Save & Open Chat'}</button>
                                ${agent ? '<a href="#" class="btn btn-ghost" id="agent-view-stats">View Stats</a>' : ''}
                            ` : '<button type="button" class="btn btn-primary" id="agent-next">Continue</button>'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/agents'); });
        container.querySelector('#agent-builder-tour')?.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.removeItem('agentBuilderTutorialComplete');
            _tutorialComplete = false;
            renderStep();
        });

        container.querySelectorAll('.stepper-step:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = parseInt(btn.dataset.step, 10);
                if (target !== step) { captureCurrentStep(); step = target; renderStep(); }
            });
        });
        if (!container.dataset.tooltipInit) {
            container.dataset.tooltipInit = '1';
            container.addEventListener('click', (e) => {
                if (e.target.closest('.builder-tooltip__trigger')) {
                    e.preventDefault();
                    const tooltip = e.target.closest('.builder-tooltip');
                    if (tooltip) {
                        tooltip.classList.toggle('builder-tooltip--open');
                        container.querySelectorAll('.builder-tooltip').forEach(t => { if (t !== tooltip) t.classList.remove('builder-tooltip--open'); });
                    }
                } else if (!e.target.closest('.builder-tooltip')) {
                    container.querySelectorAll('.builder-tooltip--open').forEach(t => t.classList.remove('builder-tooltip--open'));
                }
            });
        }

        const content = container.querySelector('#agent-step-content');

        if (step === 1) renderIdentityStep(content);
        else if (step === 2) renderPersonalityStep(content);
        else if (step === 3) renderSkillsStep(content);
        else if (step === 4) renderKnowledgeStep(content);
        else if (step === 5) renderBehaviorStep(content);
        else if (step === 6) renderModelStep(content);
        else renderReviewStep(content);

        container.querySelector('#agent-back')?.addEventListener('click', () => {
            captureCurrentStep();
            step--;
            renderStep();
        });

        container.querySelector('#agent-next').addEventListener('click', async () => {
            captureCurrentStep();
            const warnings = validateStep(step);
            if (warnings.block) { showToast(warnings.block, 'error'); return; }
            if (warnings.warn) showToast(warnings.warn, 'info');
            if (step < TOTAL_STEPS) { step++; renderStep(); return; }
            await saveAgent(agent ? false : true);
        });
        container.querySelector('#agent-save-open')?.addEventListener('click', async () => {
            captureCurrentStep();
            const warnings = validateStep(step);
            if (warnings.block) { showToast(warnings.block, 'error'); return; }
            if (warnings.warn) showToast(warnings.warn, 'info');
            await saveAgent(true);
        });
        container.querySelector('#agent-view-stats')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (_builderDirty) {
                const { showConfirm3 } = await import('../../components/Dialog.js');
                const choice = await showConfirm3({
                    title: 'Unsaved Changes',
                    message: 'You have unsaved changes. Save before viewing stats?',
                    discardText: 'Discard Changes',
                    keepText: 'Keep Editing',
                    saveText: 'Save Changes'
                });
                if (choice === 'save') {
                    await saveAgent(false);
                    navigate(`/agents/${agent.id}/analytics`);
                } else if (choice === 'discard') {
                    cleanupBuilder();
                    navigate(`/agents/${agent.id}/analytics`);
                }
                return;
            }
            navigate(`/agents/${agent.id}/analytics`);
        });

        function handleBuilderKeydown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.key === 'ArrowRight' && step < TOTAL_STEPS) {
                captureCurrentStep();
                const w = validateStep(step);
                if (!w.block) { step++; renderStep(); }
            } else if (e.key === 'ArrowLeft' && step > 1) {
                captureCurrentStep();
                step--;
                renderStep();
            }
        }
        document.addEventListener('keydown', handleBuilderKeydown);
        _builderCleanup = () => document.removeEventListener('keydown', handleBuilderKeydown);
    }

    function captureCurrentStep() {
        if (step === 1) {
            formData.name = container.querySelector('#agent-name')?.value || '';
            formData.tagline = container.querySelector('#agent-tagline')?.value || '';
            formData.avatarUrl = container.querySelector('#agent-avatarUrl')?.value || '';
            const tagList = container.querySelector('#agent-tags-list');
            if (tagList) formData.tagNames = [...tagList.querySelectorAll('.tag-chip')].map(c => c.dataset.value).filter(Boolean);
        } else if (step === 2) {
            formData.systemPrompt = container.querySelector('#agent-systemPrompt')?.value || '';
            formData.temperature = parseFloat(container.querySelector('#agent-temperature')?.value) || 0.8;
            formData.maxTokens = parseInt(container.querySelector('#agent-maxTokens')?.value, 10) || 512;
            formData.greetingMessage = container.querySelector('#agent-greetingMessage')?.value || '';
            formData.responseFormat = container.querySelector('#agent-responseFormat')?.value || 'auto';
            formData.memoryStrategy = container.querySelector('#agent-memoryStrategy')?.value || 'full';
            formData.formality = parseInt(container.querySelector('#agent-formality')?.value, 10) ?? 5;
            formData.verbosity = parseInt(container.querySelector('#agent-verbosity')?.value, 10) ?? 5;
            formData.responseLength = container.querySelector('#agent-responseLength')?.value || 'medium';
            formData.creativityFactuality = parseInt(container.querySelector('#agent-creativityFactuality')?.value, 10) ?? 5;
            formData.roleplayMode = container.querySelector('#agent-roleplayMode')?.value || 'assistant';
            formData.topP = parseFloat(container.querySelector('#agent-topP')?.value) ?? 0.9;
            formData.topK = parseInt(container.querySelector('#agent-topK')?.value, 10) ?? 40;
            formData.repeatPenalty = parseFloat(container.querySelector('#agent-repeatPenalty')?.value) ?? 1.1;
            formData.presencePenalty = parseFloat(container.querySelector('#agent-presencePenalty')?.value) ?? 0;
            formData.frequencyPenalty = parseFloat(container.querySelector('#agent-frequencyPenalty')?.value) ?? 0;
            formData.contextWindow = parseInt(container.querySelector('#agent-contextWindow')?.value, 10) ?? 50;
            const stopEl = container.querySelector('#stop-sequences-list');
            if (stopEl) {
                formData.stopSequences = [...stopEl.querySelectorAll('.tag-chip')].map(c => c.dataset.value).filter(Boolean);
            }
        } else if (step === 5) {
            formData.responseDelayMin = Math.max(0, parseInt(container.querySelector('#agent-responseDelayMin')?.value, 10) || 0);
            formData.responseDelayMax = Math.max(0, parseInt(container.querySelector('#agent-responseDelayMax')?.value, 10) || 0);
            formData.profanityFilter = container.querySelector('#agent-profanityFilter')?.value || 'allow';
        } else if (step === 6) {
            const textProviderSelect = container.querySelector('#agent-textProvider');
            const textModelSelect = container.querySelector('#agent-textModel');
            const imageProviderSelect = container.querySelector('#agent-imageProvider');
            const imageModelSelect = container.querySelector('#agent-imageModel');

            formData.textProvider = textProviderSelect?.value || '';
            formData.textModel = textModelSelect?.value || '';
            formData.imageProvider = imageProviderSelect?.value || '';
            formData.imageModel = imageModelSelect?.value || '';

            formData.textProviderDisplay = textProviderSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.textProvider;
            formData.textModelDisplay = textModelSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.textModel;
            formData.imageProviderDisplay = imageProviderSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.imageProvider;
            formData.imageModelDisplay = imageModelSelect?.selectedOptions?.[0]?.dataset?.displayName || formData.imageModel;
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 1: Identity Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderIdentityStep(content) {
        const avatarSrc = formData.avatarUrl || getAgentAvatarUrl({ name: formData.name || 'A' }, { shape: 'circle' });
        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Agent Identity</h3>
                <p class="builder-section__desc">Choose how your agent looks and introduces itself</p>
            </div>
            <div class="agent-identity-layout">
                <div class="avatar-preview">
                    <img id="avatar-preview-img" src="${avatarSrc}" alt="Avatar" class="avatar-preview__img">
                    <button type="button" class="btn btn-ghost btn-sm" id="agent-avatar-edit">Edit Avatar</button>
                    <input type="file" id="agent-avatar-file" accept="image/jpeg,image/png,image/gif,image/webp" class="agent-avatar-file-input">
                </div>
                <div class="agent-identity-main">
                    <div class="form-group">
                        <label class="form-label">Name <span class="form-required">*</span> <span class="builder-tooltip" data-tip="The display name of your agent. This appears on agent cards and in the chat header."><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">The display name of your agent. This appears on agent cards and in the chat header.</span></span></label>
                        <input type="text" id="agent-name" class="form-input" value="${escapeHtml(formData.name)}" placeholder="e.g. Luna, CodeBot" required maxlength="50">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tagline <span class="form-help" title="Short description on agent cards">?</span></label>
                        <textarea id="agent-tagline" class="form-input" rows="2" placeholder="e.g. Your friendly coding companion" maxlength="200">${escapeHtml(formData.tagline)}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Tags <span class="form-help" title="Tags help others find your agent in the Hub. Start typing to search.">?</span></label>
                        <div class="tag-input-container">
                            <div id="agent-tags-list" class="tag-list">${(formData.tagNames || []).map(t => `<span class="tag-chip" data-value="${escapeHtml(t)}">${escapeHtml(t)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                            <input type="text" id="agent-tags-input" class="form-input form-input--sm agent-tags-input" placeholder="Type to search tags..." autocomplete="off">
                            <div id="agent-tags-dropdown" class="chat-hub__dropdown agent-tags-dropdown"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Avatar URL or upload <span class="form-help" title="Paste image URL or use Edit Avatar to upload">?</span></label>
                        <div class="agent-avatar-url-row">
                            <input type="text" id="agent-avatarUrl" class="form-input agent-avatar-url-input" value="${escapeHtml(formData.avatarUrl)}" placeholder="https://... or upload via Edit Avatar">
                        </div>
                    </div>
                </div>
            </div>
        `;

        const nameEl = content.querySelector('#agent-name');
        const avatarUrlEl = content.querySelector('#agent-avatarUrl');
        const previewImg = content.querySelector('#avatar-preview-img');

        nameEl.addEventListener('input', () => {
            if (!avatarUrlEl.value.trim()) {
                previewImg.src = getAgentAvatarUrl({ name: nameEl.value || 'A' }, { shape: 'circle' });
            }
        });
        avatarUrlEl.addEventListener('input', () => {
            formData.avatarUrl = avatarUrlEl.value.trim();
            previewImg.src = formData.avatarUrl || getAgentAvatarUrl({ name: nameEl.value || 'A' }, { shape: 'circle' });
        });
        const avatarEditBtn = content.querySelector('#agent-avatar-edit');
        const avatarFileInput = content.querySelector('#agent-avatar-file');
        (function setupTags() {
            const tagList = content.querySelector('#agent-tags-list');
            const tagInput = content.querySelector('#agent-tags-input');
            const dropdown = content.querySelector('#agent-tags-dropdown');
            let debounceTimer;
            tagInput?.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                const q = tagInput.value.trim();
                if (!q) { dropdown.style.display = 'none'; return; }
                debounceTimer = setTimeout(async () => {
                    try {
                        const { data: tags } = await api(`/agents/tags?q=${encodeURIComponent(q)}`);
                        if (!tags?.length) { dropdown.style.display = 'none'; return; }
                        dropdown.innerHTML = tags.map(t => `
                            <div class="chat-hub__dropdown-item tag-suggestion-item" data-name="${escapeHtml(t.name)}">
                                <span>${escapeHtml(t.name)}</span>
                                <span class="text-muted tag-suggestion-item__count">${t.agent_count ?? 0} agents</span>
                            </div>
                        `).join('');
                        dropdown.style.display = 'block';
                        dropdown.querySelectorAll('.chat-hub__dropdown-item').forEach(el => {
                            el.addEventListener('click', () => {
                                const name = el.dataset.name;
                                if (!name || [...tagList.querySelectorAll('.tag-chip')].some(c => c.dataset.value === name)) return;
                                const chip = document.createElement('span');
                                chip.className = 'tag-chip';
                                chip.dataset.value = name;
                                chip.innerHTML = `${escapeHtml(name)} <button type="button" class="tag-chip__remove">&times;</button>`;
                                chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
                                tagList.appendChild(chip);
                                tagInput.value = '';
                                dropdown.style.display = 'none';
                            });
                        });
                    } catch { dropdown.style.display = 'none'; }
                }, 200);
            });
            tagInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = dropdown.querySelector('.chat-hub__dropdown-item');
                    if (first) first.click();
                    else if (tagInput.value.trim()) {
                        const name = tagInput.value.trim();
                        if (![...tagList.querySelectorAll('.tag-chip')].some(c => c.dataset.value === name)) {
                            const chip = document.createElement('span');
                            chip.className = 'tag-chip';
                            chip.dataset.value = name;
                            chip.innerHTML = `${escapeHtml(name)} <button type="button" class="tag-chip__remove">&times;</button>`;
                            chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
                            tagList.appendChild(chip);
                        }
                        tagInput.value = '';
                        dropdown.style.display = 'none';
                    }
                } else if (e.key === 'Escape') dropdown.style.display = 'none';
            });
            document.addEventListener('click', (e) => { if (!content.contains(e.target)) dropdown.style.display = 'none'; });
            tagList?.querySelectorAll('.tag-chip__remove').forEach(btn => btn.addEventListener('click', () => btn.closest('.tag-chip')?.remove()));
        })();
        avatarEditBtn?.addEventListener('click', () => avatarFileInput?.click());
        avatarFileInput?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const fd = new FormData();
                fd.append('file', file);
                const token = getToken();
                const res = await fetch(`${API_BASE}/media/upload`, { method: 'POST', body: fd, credentials: 'include', headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.error || res.statusText);
                if (json.data?.url) {
                    const fullUrl = json.data.url.startsWith('http') ? json.data.url : (window.location.origin + json.data.url);
                    formData.avatarUrl = fullUrl;
                    avatarUrlEl.value = fullUrl;
                    previewImg.src = fullUrl;
                }
            } catch (err) { showToast(err.message, 'error'); }
            e.target.value = '';
        });
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 2: Personality (with advanced collapsible sections) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderPersonalityStep(content) {
        const len = (formData.systemPrompt || '').length;
        const stopTags = (formData.stopSequences || []).map(s => `<span class="tag-chip" data-value="${escapeHtml(s)}">${escapeHtml(s)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('');

        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Personality & Behavior</h3>
                <p class="builder-section__desc">Define how your agent thinks and responds</p>
            </div>

            <div class="form-group">
                <label class="form-label">Quick Templates <span class="form-help" title="Click a template to use it as a starting point.">?</span></label>
                <div class="template-chips" id="template-chips">
                    ${PROMPT_TEMPLATES.map((t, i) => `<button type="button" class="chip" data-idx="${i}">${t.label}</button>`).join('')}
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">System Prompt <span class="builder-tooltip" data-tip="The core instructions that shape your agent's personality."><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">The core instructions that shape your agent's personality. Be clear and specific about how the agent should behave.</span></span> <span class="form-char-count" id="prompt-char-count">${len} / 4000</span></label>
                <textarea id="agent-systemPrompt" class="form-input" rows="6" placeholder="You are a helpful assistant..." maxlength="4000">${escapeHtml(formData.systemPrompt)}</textarea>
            </div>

            <details class="collapsible-section" open>
                <summary class="collapsible-section__header">Personality Dimensions</summary>
                <div class="collapsible-section__body">
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Formality <span class="form-help" title="0 = very casual, 10 = extremely formal">?</span></label>
                            <div class="slider-row"><span class="slider-label">Casual</span><input type="range" id="agent-formality" class="form-range" min="0" max="10" step="1" value="${formData.formality}"><span class="slider-label">Formal</span><span id="formality-val" class="form-range-value">${formData.formality}</span><button type="button" class="btn-reset" data-target="agent-formality" data-default="5" title="Reset to default">&circlearrowleft;</button></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Verbosity <span class="form-help" title="0 = terse one-liners, 10 = detailed explanations">?</span></label>
                            <div class="slider-row"><span class="slider-label">Brief</span><input type="range" id="agent-verbosity" class="form-range" min="0" max="10" step="1" value="${formData.verbosity}"><span class="slider-label">Detailed</span><span id="verbosity-val" class="form-range-value">${formData.verbosity}</span><button type="button" class="btn-reset" data-target="agent-verbosity" data-default="5" title="Reset to default">&circlearrowleft;</button></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Response Length <span class="form-help" title="Preferred length of responses">?</span></label>
                            <select id="agent-responseLength" class="form-input">
                                ${['short', 'medium', 'long'].map(v => `<option value="${v}" ${(formData.responseLength || 'medium') === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Creativity vs Factuality <span class="form-help" title="0 = stick to facts, 10 = more creative">?</span></label>
                            <div class="slider-row"><span class="slider-label">Factual</span><input type="range" id="agent-creativityFactuality" class="form-range" min="0" max="10" step="1" value="${formData.creativityFactuality ?? 5}"><span class="slider-label">Creative</span><span id="creativityFactuality-val" class="form-range-value">${formData.creativityFactuality ?? 5}</span></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Mode <span class="form-help" title="Roleplay acts as a character, Assistant is factual">?</span></label>
                            <select id="agent-roleplayMode" class="form-input">
                                ${['assistant', 'roleplay'].map(v => `<option value="${v}" ${(formData.roleplayMode || 'assistant') === v ? 'selected' : ''}>${v === 'assistant' ? 'Assistant (factual)' : 'Roleplay (in-character)'}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Greeting & Response Style</summary>
                <div class="collapsible-section__body">
                    <div class="form-group">
                        <label class="form-label">Greeting Message <span class="form-help" title="Auto-sent as the first message when a new conversation starts. Leave blank for none.">?</span></label>
                        <textarea id="agent-greetingMessage" class="form-input" rows="2" placeholder="Hello! How can I help you today?" maxlength="500">${escapeHtml(formData.greetingMessage)}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Response Format <span class="form-help" title="Controls how the agent formats its responses.">?</span></label>
                            <select id="agent-responseFormat" class="form-input">
                                ${['auto', 'plain', 'markdown', 'json'].map(v => `<option value="${v}" ${formData.responseFormat === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Memory Strategy <span class="form-help" title="How conversation history is managed. 'Full' sends all messages, 'Sliding window' sends recent ones.">?</span></label>
                            <select id="agent-memoryStrategy" class="form-input">
                                ${['full', 'sliding-window', 'summary'].map(v => `<option value="${v}" ${formData.memoryStrategy === v ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Generation Controls</summary>
                <div class="collapsible-section__body">
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Temperature <span class="form-help" title="Controls randomness. Lower = more focused, Higher = more creative.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-temperature" class="form-range" min="0" max="2" step="0.1" value="${formData.temperature}"><span id="temp-value" class="form-range-value">${formData.temperature}</span><button type="button" class="btn-reset" data-target="agent-temperature" data-default="0.8" title="Reset to default">&circlearrowleft;</button></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Max Tokens <span class="form-help" title="Maximum length of each response.">?</span></label>
                            <select id="agent-maxTokens" class="form-input">
                                ${[256, 512, 1024, 2048, 4096].map(v => `<option value="${v}" ${formData.maxTokens === v ? 'selected' : ''}>${v} tokens</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Context Window <span class="form-help" title="Number of history messages sent to the model.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-contextWindow" class="form-range" min="5" max="200" step="5" value="${formData.contextWindow}"><span id="contextWindow-val" class="form-range-value">${formData.contextWindow} msgs</span></div>
                        </div>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Advanced Sampling</summary>
                <div class="collapsible-section__body">
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Top-P <span class="form-help" title="Nucleus sampling: limits to top P% probability mass.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-topP" class="form-range" min="0" max="1" step="0.05" value="${formData.topP}"><span id="topP-val" class="form-range-value">${formData.topP}</span></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Top-K <span class="form-help" title="Limits to top K most probable tokens.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-topK" class="form-range" min="1" max="100" step="1" value="${formData.topK}"><span id="topK-val" class="form-range-value">${formData.topK}</span></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Repeat Penalty <span class="form-help" title="Penalizes repeated tokens. 1.0 = no penalty.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-repeatPenalty" class="form-range" min="0.5" max="2" step="0.05" value="${formData.repeatPenalty}"><span id="repeatPenalty-val" class="form-range-value">${formData.repeatPenalty}</span></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Presence Penalty <span class="form-help" title="Penalizes tokens already present in the text.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-presencePenalty" class="form-range" min="0" max="2" step="0.1" value="${formData.presencePenalty}"><span id="presencePenalty-val" class="form-range-value">${formData.presencePenalty}</span></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Frequency Penalty <span class="form-help" title="Reduces repetition based on token frequency.">?</span></label>
                            <div class="slider-row"><input type="range" id="agent-frequencyPenalty" class="form-range" min="0" max="2" step="0.1" value="${formData.frequencyPenalty}"><span id="frequencyPenalty-val" class="form-range-value">${formData.frequencyPenalty}</span></div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Stop Sequences <span class="form-help" title="Tokens where the model stops generating. Press Enter to add.">?</span></label>
                            <div class="tag-input-container">
                                <div id="stop-sequences-list" class="tag-list">${stopTags}</div>
                                <input type="text" id="stop-seq-input" class="form-input form-input--sm" placeholder="Type and press Enter">
                            </div>
                        </div>
                    </div>
                </div>
            </details>
        `;

        content.querySelectorAll('#template-chips .chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const tmpl = PROMPT_TEMPLATES[parseInt(btn.dataset.idx, 10)];
                const ta = content.querySelector('#agent-systemPrompt');
                ta.value = tmpl.prompt;
                ta.dispatchEvent(new Event('input'));
                content.querySelectorAll('#template-chips .chip').forEach(c => c.classList.remove('chip--active'));
                btn.classList.add('chip--active');
            });
        });

        content.querySelector('#agent-systemPrompt')?.addEventListener('input', (e) => {
            content.querySelector('#prompt-char-count').textContent = e.target.value.length + ' / 4000';
        });

        const sliders = [
            ['agent-temperature', 'temp-value', null],
            ['agent-formality', 'formality-val', null],
            ['agent-verbosity', 'verbosity-val', null],
            ['agent-creativityFactuality', 'creativityFactuality-val', null],
            ['agent-contextWindow', 'contextWindow-val', ' msgs'],
            ['agent-topP', 'topP-val', null],
            ['agent-topK', 'topK-val', null],
            ['agent-repeatPenalty', 'repeatPenalty-val', null],
            ['agent-presencePenalty', 'presencePenalty-val', null],
            ['agent-frequencyPenalty', 'frequencyPenalty-val', null],
        ];
        sliders.forEach(([inputId, valId, suffix]) => {
            content.querySelector(`#${inputId}`)?.addEventListener('input', (e) => {
                const el = content.querySelector(`#${valId}`);
                if (el) el.textContent = e.target.value + (suffix || '');
            });
        });

        content.querySelectorAll('.btn-reset').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = content.querySelector(`#${btn.dataset.target}`);
                if (target) {
                    target.value = btn.dataset.default;
                    target.dispatchEvent(new Event('input'));
                    markDirty();
                }
            });
        });

        content.querySelectorAll('input, textarea, select').forEach(el => el.addEventListener('change', markDirty));

        const stopInput = content.querySelector('#stop-seq-input');
        const stopList = content.querySelector('#stop-sequences-list');
        if (stopInput && stopList) {
            function addStopTag(val) {
                if (!val.trim()) return;
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.dataset.value = val;
                chip.innerHTML = `${escapeHtml(val)} <button type="button" class="tag-chip__remove">&times;</button>`;
                chip.querySelector('.tag-chip__remove').addEventListener('click', () => chip.remove());
                stopList.appendChild(chip);
            }
            stopInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addStopTag(stopInput.value);
                    stopInput.value = '';
                }
            });
            stopList.querySelectorAll('.tag-chip__remove').forEach(btn => {
                btn.addEventListener('click', () => btn.parentElement.remove());
            });
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 3: Skills (Drag & Drop Pipeline) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderSkillsStep(content) {
        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Skills Pipeline <span class="builder-tooltip"><button type="button" class="builder-tooltip__trigger" aria-label="Help">?</button><span class="builder-tooltip__popover">Add skills to give your agent specific capabilities. Drag from Available into Active. Order matters: skills run top to bottom.</span></span></h3>
                <p class="builder-section__desc">Drag skills from the available panel into the active pipeline. Drag within the pipeline to reorder.</p>
            </div>
            <div id="skills-dnd-container"><div class="loading-spinner"></div> Loading skills...</div>
        `;

        (async () => {
            try {
                const [{ data: skills }, { data: categories }] = await Promise.all([
                    api('/skills'),
                    api('/skills/categories').catch(() => ({ data: [] }))
                ]);
                const el = container.querySelector('#skills-dnd-container');
                if (!el) return;
                const cats = categories || [];
                const byCat = {};
                const uncat = [];
                const editable = (skills || []).filter(s => s.source === 'installed' || s.source === 'workspace');
                for (const s of editable) {
                    const cid = (s.categoryIds || [])[0];
                    if (cid) { if (!byCat[cid]) byCat[cid] = []; byCat[cid].push(s); }
                    else uncat.push(s);
                }

                el.innerHTML = `
                    <div class="dnd-layout">
                        <div class="dnd-panel">
                            <h4 class="dnd-panel__title">Available Skills</h4>
                            <div class="dnd-panel__section-label">Search by name or description</div>
                            <input type="text" id="skill-search" class="form-input form-input--sm skill-search" placeholder="Search skills...">
                            <div class="dnd-panel__list" id="available-skills"></div>
                            <div id="skill-preview-panel" class="skill-preview skill-preview--hidden"></div>
                        </div>
                        <div class="dnd-panel dnd-panel--pipeline">
                            <h4 class="dnd-panel__title">Active Skills <span class="badge badge-ghost">${skillIds.length}</span></h4>
                            <div class="dnd-panel__list dnd-dropzone" id="pipeline-skills"></div>
                            <div class="dnd-panel__empty ${skillIds.length ? 'dnd-panel__empty--hidden' : ''}" id="pipeline-empty">Drop skills here...</div>
                        </div>
                    </div>
                `;

                const availableEl = el.querySelector('#available-skills');
                const pipelineEl = el.querySelector('#pipeline-skills');
                const emptyEl = el.querySelector('#pipeline-empty');

                function refreshPipelineUI() {
                    pipelineEl.innerHTML = '';
                    skillIds.forEach((skillId, i) => {
                        const s = skills.find(sk => sk.id === skillId || (sk.slug || sk.name) === skillId);
                        const item = document.createElement('div');
                        item.className = 'dnd-pipeline-item dnd-draggable';
                        item.setAttribute('draggable', 'true');
                        item.dataset.index = i;
                        item.innerHTML = `
                            <span class="dnd-grip">&#x2630;</span>
                            <span class="dnd-pipeline-item__num">${i + 1}</span>
                            <span class="dnd-pipeline-item__name">${escapeHtml(s?.name || skillId)}</span>
                            ${s?.version ? `<span class="badge badge-ghost skills-badge-2xs">${escapeHtml(s.version)}</span>` : ''}
                            <button type="button" class="dnd-pipeline-item__remove" data-skill-id="${escapeHtml(skillId)}">&times;</button>
                        `;
                        item.addEventListener('dragstart', (e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: i, skillId }));
                            item.classList.add('dnd-dragging');
                            requestAnimationFrame(() => item.style.opacity = '0.4');
                        });
                        item.addEventListener('dragend', () => { item.classList.remove('dnd-dragging'); item.style.opacity = ''; });
                        pipelineEl.appendChild(item);
                    });

                    pipelineEl.querySelectorAll('.dnd-pipeline-item__remove').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const id = btn.dataset.skillId;
                            skillIds = skillIds.filter(s => s !== id);
                            refreshAll();
                        });
                    });

                    emptyEl.classList.toggle('dnd-panel__empty--hidden', skillIds.length > 0);
                    el.querySelector('.dnd-panel--pipeline .dnd-panel__title .badge').textContent = skillIds.length;
                }

                function addSkillCard(s, availableEl) {
                    const id = s.id || s.slug || s.name;
                    const inPipeline = skillIds.includes(id);
                    const card = document.createElement('div');
                    card.className = `dnd-available-skill ${inPipeline ? 'dnd-available-skill--used' : ''}`;
                    card.setAttribute('draggable', !inPipeline ? 'true' : 'false');
                    card.dataset.skillName = s.name;
                    card.innerHTML = `
                        <strong>${escapeHtml(s.name)}</strong>
                        <span class="text-muted dnd-available-skill__desc">${escapeHtml(s.description || '')}</span>
                        ${inPipeline ? '<span class="badge badge-ghost skills-badge-xs">in pipeline</span>' : ''}
                    `;
                    if (!inPipeline) {
                        card.addEventListener('dragstart', (e) => {
                            e.dataTransfer.effectAllowed = 'copy';
                            e.dataTransfer.setData('application/json', JSON.stringify({ type: 'add-skill', skillId: id }));
                            card.classList.add('dnd-dragging');
                        });
                        card.addEventListener('dragend', () => card.classList.remove('dnd-dragging'));
                        card.addEventListener('dblclick', () => {
                            if (!skillIds.includes(id)) { skillIds.push(id); refreshAll(); }
                        });
                    }
                    availableEl.appendChild(card);
                }
                function refreshAvailableUI() {
                    availableEl.innerHTML = '';
                    const q = (el.querySelector('#skill-search')?.value || '').toLowerCase();
                    const match = (s) => !q || (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
                    cats.forEach(cat => {
                        const items = (byCat[cat.id] || []).filter(match);
                        if (!items.length) return;
                        const sec = document.createElement('details');
                        sec.className = 'collapsible-section';
                        sec.innerHTML = `<summary class="collapsible-section__header">${escapeHtml(cat.name)} <span class="badge badge-ghost">${items.length}</span></summary><div class="collapsible-section__body"></div>`;
                        items.forEach(s => addSkillCard(s, sec.querySelector('.collapsible-section__body')));
                        availableEl.appendChild(sec);
                    });
                    if (uncat.filter(match).length) {
                        const sec = document.createElement('details');
                        sec.className = 'collapsible-section';
                        sec.open = true;
                        sec.innerHTML = `<summary class="collapsible-section__header">Uncategorized <span class="badge badge-ghost">${uncat.filter(match).length}</span></summary><div class="collapsible-section__body"></div>`;
                        uncat.filter(match).forEach(s => addSkillCard(s, sec.querySelector('.collapsible-section__body')));
                        availableEl.appendChild(sec);
                    }
                }

                function refreshAll() { refreshAvailableUI(); refreshPipelineUI(); }

                makeDropZone(pipelineEl, {
                    onDrop(payload, insertIndex) {
                        if (payload.type === 'add-skill' && payload.skillId && !skillIds.includes(payload.skillId)) {
                            skillIds.splice(insertIndex, 0, payload.skillId);
                            refreshAll();
                        }
                    },
                    onReorder(fromIndex, toIndex) {
                        const [moved] = skillIds.splice(fromIndex, 1);
                        skillIds.splice(toIndex, 0, moved);
                        refreshAll();
                    }
                });

                refreshAll();

                const searchInput = el.querySelector('#skill-search');
                const previewPanel = el.querySelector('#skill-preview-panel');
                searchInput?.addEventListener('input', () => {
                    const q = searchInput.value.toLowerCase();
                    availableEl.querySelectorAll('.collapsible-section').forEach(sec => {
                        let visible = 0;
                        sec.querySelectorAll('.dnd-available-skill').forEach(card => {
                            const name = card.querySelector('strong')?.textContent?.toLowerCase() || '';
                            const desc = card.querySelector('.text-muted')?.textContent?.toLowerCase() || '';
                            const show = !q || name.includes(q) || desc.includes(q);
                            card.style.display = show ? '' : 'none';
                            if (show) visible++;
                        });
                        sec.style.display = visible ? '' : 'none';
                    });
                });
                availableEl.addEventListener('click', (e) => {
                    const card = e.target.closest('.dnd-available-skill');
                    if (!card) return;
                    const name = card.querySelector('strong')?.textContent;
                    const s = skills.find(sk => sk.name === name);
                    if (s && previewPanel) {
                        previewPanel.classList.remove('skill-preview--hidden');
                        previewPanel.innerHTML = `<strong>${escapeHtml(s.name)}</strong> <span class="text-muted">(v${escapeHtml(s.version || '1.0')})</span><br><br>${escapeHtml(s.instructions || s.description || 'No instructions')}`;
                    }
                });
            } catch (err) {
                const el = container.querySelector('#skills-dnd-container');
                if (el) el.innerHTML = `<p class="text-muted">Failed to load skills: ${escapeHtml(err.message)}</p>`;
            }
        })();
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 4: Knowledge Base Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderKnowledgeStep(content) {
        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Knowledge Base</h3>
                <p class="builder-section__desc">Upload documents to give your agent reference material. The agent will search these when answering questions.</p>
            </div>
            ${!agentId ? '<p class="text-muted">Save the agent first, then add knowledge documents here.</p>' : `
                <div class="knowledge-upload-zone" id="knowledge-drop">
                    <div class="knowledge-upload-zone__content">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <p>Drop a .txt, .md, or .csv file here, or enter text below</p>
                        <span class="text-muted knowledge-upload-zone__hint">Max 500KB per document</span>
                    </div>
                </div>
                <div class="form-row knowledge-row-top">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Document Title</label>
                        <input type="text" id="kb-title" class="form-input" placeholder="e.g. Product FAQ">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Content</label>
                    <textarea id="kb-content" class="form-input" rows="6" placeholder="Paste document text here..."></textarea>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="kb-upload-btn">Add Document</button>
                <div id="kb-docs-list" class="knowledge-docs-list"><div class="loading-spinner"></div></div>
            `}
        `;

        if (!agentId) return;

        const docsListEl = content.querySelector('#kb-docs-list');

        async function loadDocs() {
            try {
                const { data: docs } = await api(`/knowledge/${agentId}/documents`);
                if (!docs.length) {
                    docsListEl.innerHTML = '<p class="text-muted knowledge-docs-empty">No documents yet.</p>';
                    return;
                }
                const totalTokens = docs.reduce((s, d) => s + (d.token_count || 0), 0);
                docsListEl.innerHTML = `
                    <p class="text-muted knowledge-docs-summary">Documents (${docs.length}) &mdash; Total context: ~${(totalTokens / 1000).toFixed(1)}k tokens</p>
                    ${docs.map(d => `
                        <div class="knowledge-doc-item">
                            <div class="knowledge-doc-item__info">
                                <strong>${escapeHtml(d.title)}</strong>
                                <span class="text-muted">${d.chunk_count} chunks, ~${(d.token_count / 1000).toFixed(1)}k tokens</span>
                            </div>
                            <button type="button" class="btn btn-ghost btn-sm kb-delete" data-id="${d.id}">&times;</button>
                        </div>
                    `).join('')}
                `;
                docsListEl.querySelectorAll('.kb-delete').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        try {
                            await api(`/knowledge/${agentId}/documents/${btn.dataset.id}`, { method: 'DELETE' });
                            showToast('Document removed', 'success');
                            loadDocs();
                        } catch (err) { showToast(err.message, 'error'); }
                    });
                });
            } catch (err) {
                docsListEl.innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
            }
        }

        content.querySelector('#kb-upload-btn')?.addEventListener('click', async () => {
            const title = content.querySelector('#kb-title')?.value?.trim();
            const text = content.querySelector('#kb-content')?.value?.trim();
            if (!title || !text) { showToast('Title and content required', 'error'); return; }
            if (text.length > 512000) { showToast('Content must be under 500KB', 'error'); return; }
            const btn = content.querySelector('#kb-upload-btn');
            btn.disabled = true;
            btn.textContent = 'Uploading...';
            try {
                await api(`/knowledge/${agentId}/documents`, { method: 'POST', body: JSON.stringify({ title, content: text }) });
                content.querySelector('#kb-title').value = '';
                content.querySelector('#kb-content').value = '';
                showToast(`Document added (~${Math.ceil(text.length / 4)} tokens)`, 'success');
                loadDocs();
            } catch (err) { showToast(err.message, 'error'); }
            btn.disabled = false;
            btn.textContent = 'Add Document';
        });

        const dropZone = content.querySelector('#knowledge-drop');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('knowledge-upload-zone--active'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('knowledge-upload-zone--active'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('knowledge-upload-zone--active');
                const files = e.dataTransfer.files;
                if (files.length) {
                    const file = files[0];
                    const allowed = ['.txt', '.md', '.csv', '.text', '.markdown'];
                    const ext = '.' + file.name.split('.').pop().toLowerCase();
                    if (!allowed.includes(ext) && !file.type.startsWith('text/')) {
                        showToast('Only .txt, .md, and .csv files are supported', 'error');
                        return;
                    }
                    if (file.size > 512000) {
                        showToast('File must be under 500KB', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        content.querySelector('#kb-content').value = ev.target.result;
                        if (!content.querySelector('#kb-title').value) content.querySelector('#kb-title').value = file.name.replace(/\.\w+$/, '');
                    };
                    reader.readAsText(file);
                }
            });
        }

        loadDocs();
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 5: Behavior Rules Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderBehaviorStep(content) {
        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Behavior & Guardrails</h3>
                <p class="builder-section__desc">Define rules, example conversations, and topic guardrails. Drag to reorder priority.</p>
            </div>

            <details class="collapsible-section" open>
                <summary class="collapsible-section__header">Behavior Rules <span class="badge badge-ghost">${behaviorRules.length}</span></summary>
                <div class="collapsible-section__body">
                    <div id="rules-list" class="dnd-rules-list"></div>
                    <div class="add-rule-form">
                        <div class="add-rule-form__row"><label class="add-rule-form__label">When</label><input type="text" id="rule-condition" class="form-input form-input--sm" placeholder="e.g. user asks about pricing"></div>
                        <div class="add-rule-form__row"><label class="add-rule-form__label">Then</label><input type="text" id="rule-action" class="form-input form-input--sm" placeholder="e.g. redirect to /pricing or give specific answer"></div>
                        <button type="button" class="btn btn-primary btn-sm" id="add-rule-btn">+ Add rule</button>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Sample Dialogues <span class="badge badge-ghost">${sampleDialogues.length}</span></summary>
                <div class="collapsible-section__body">
                    <div id="dialogues-list" class="dnd-rules-list"></div>
                    <div class="add-rule-form">
                        <div class="add-rule-form__row"><label class="add-rule-form__label">User says</label><input type="text" id="dialogue-user" class="form-input form-input--sm" placeholder="e.g. What's your return policy?"></div>
                        <div class="add-rule-form__row"><label class="add-rule-form__label">Agent responds</label><input type="text" id="dialogue-assistant" class="form-input form-input--sm" placeholder="e.g. We offer 30-day returns..."></div>
                        <button type="button" class="btn btn-primary btn-sm" id="add-dialogue-btn">+ Add example</button>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Response & Filters</summary>
                <div class="collapsible-section__body">
                    <div class="form-row">
                        <div class="form-group form-group--grow">
                            <label class="form-label">Response Delay (sec) <span class="form-help" title="Simulate typing delay. 0 = no delay">?</span></label>
                            <div class="slider-row"><input type="number" id="agent-responseDelayMin" class="form-input form-input--sm form-input--inline-number" min="0" max="30" value="${formData.responseDelayMin ?? 0}"> <span>to</span> <input type="number" id="agent-responseDelayMax" class="form-input form-input--sm form-input--inline-number" min="0" max="30" value="${formData.responseDelayMax ?? 0}"> sec</div>
                        </div>
                        <div class="form-group form-group--grow">
                            <label class="form-label">Profanity Filter <span class="form-help" title="How to handle profane content">?</span></label>
                            <select id="agent-profanityFilter" class="form-input">
                                ${['allow', 'warn', 'block'].map(v => `<option value="${v}" ${(formData.profanityFilter || 'allow') === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            </details>

            <details class="collapsible-section">
                <summary class="collapsible-section__header">Topic Guardrails</summary>
                <div class="collapsible-section__body">
                    <div class="form-group">
                        <label class="form-label">Allowed Topics <span class="form-help" title="Topics the agent will engage with. Click chips or type to add.">?</span></label>
                        <div class="topic-suggestions">
                            <span class="topic-suggestions__label">Quick add:</span>
                            ${['coding', 'math', 'creative writing', 'recipes', 'travel', 'general'].filter(t => !allowedTopics.includes(t)).map(t => `<button type="button" class="chip topic-chip topic-chip--allow" data-topic="${escapeHtml(t)}">+ ${escapeHtml(t)}</button>`).join('')}
                        </div>
                        <div class="tag-input-container">
                            <div id="allowed-topics-list" class="tag-list">${allowedTopics.map(t => `<span class="tag-chip tag-chip--green" data-value="${escapeHtml(t)}">${escapeHtml(t)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                            <input type="text" id="allowed-topic-input" class="form-input form-input--sm" placeholder="e.g. coding, math">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Blocked Topics <span class="form-help" title="Topics the agent will politely decline. Click chips or type to add.">?</span></label>
                        <div class="topic-suggestions">
                            <span class="topic-suggestions__label">Quick add:</span>
                            ${['politics', 'medical advice', 'legal', 'financial advice', 'personal data'].filter(t => !blockedTopics.includes(t)).map(t => `<button type="button" class="chip topic-chip topic-chip--block" data-topic="${escapeHtml(t)}">+ ${escapeHtml(t)}</button>`).join('')}
                        </div>
                        <div class="tag-input-container">
                            <div id="blocked-topics-list" class="tag-list">${blockedTopics.map(t => `<span class="tag-chip tag-chip--red" data-value="${escapeHtml(t)}">${escapeHtml(t)} <button type="button" class="tag-chip__remove">&times;</button></span>`).join('')}</div>
                            <input type="text" id="blocked-topic-input" class="form-input form-input--sm" placeholder="e.g. politics, medical advice">
                        </div>
                    </div>
                </div>
            </details>
        `;

        function renderRulesList() {
            const list = content.querySelector('#rules-list');
            list.innerHTML = '';
            behaviorRules.forEach((r, i) => {
                const item = document.createElement('div');
                item.className = 'dnd-rule-item dnd-draggable';
                item.setAttribute('draggable', 'true');
                item.dataset.index = i;
                item.innerHTML = `
                    <span class="dnd-grip">&#x2630;</span>
                    <span class="dnd-rule-item__label">IF</span> <span class="dnd-rule-item__text">"${escapeHtml(r.condition || r.when || '')}"</span>
                    <span class="dnd-rule-item__label">THEN</span> <span class="dnd-rule-item__text">"${escapeHtml(r.action || r.then || '')}"</span>
                    <button type="button" class="dnd-pipeline-item__remove" data-i="${i}">&times;</button>
                `;
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: i }));
                    item.classList.add('dnd-dragging');
                    requestAnimationFrame(() => item.style.opacity = '0.4');
                });
                item.addEventListener('dragend', () => { item.classList.remove('dnd-dragging'); item.style.opacity = ''; });
                list.appendChild(item);
            });

            list.querySelectorAll('.dnd-pipeline-item__remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    behaviorRules.splice(parseInt(btn.dataset.i, 10), 1);
                    renderRulesList();
                });
            });

            makeDropZone(list, {
                onReorder(fromIndex, toIndex) {
                    const [moved] = behaviorRules.splice(fromIndex, 1);
                    behaviorRules.splice(toIndex, 0, moved);
                    renderRulesList();
                }
            });
        }

        function renderDialoguesList() {
            const list = content.querySelector('#dialogues-list');
            list.innerHTML = '';
            sampleDialogues.forEach((d, i) => {
                const item = document.createElement('div');
                item.className = 'dnd-rule-item dnd-draggable';
                item.setAttribute('draggable', 'true');
                item.dataset.index = i;
                item.innerHTML = `
                    <span class="dnd-grip">&#x2630;</span>
                    <span class="dnd-rule-item__label">User:</span> <span class="dnd-rule-item__text">"${escapeHtml(d.user || '')}"</span>
                    <span class="dnd-rule-item__arrow" aria-hidden="true"></span>
                    <span class="dnd-rule-item__label">Agent:</span> <span class="dnd-rule-item__text">"${escapeHtml(d.assistant || '')}"</span>
                    <button type="button" class="dnd-pipeline-item__remove" data-i="${i}">&times;</button>
                `;
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'reorder', _reorderIndex: i }));
                    item.classList.add('dnd-dragging');
                    requestAnimationFrame(() => item.style.opacity = '0.4');
                });
                item.addEventListener('dragend', () => { item.classList.remove('dnd-dragging'); item.style.opacity = ''; });
                list.appendChild(item);
            });

            list.querySelectorAll('.dnd-pipeline-item__remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    sampleDialogues.splice(parseInt(btn.dataset.i, 10), 1);
                    renderDialoguesList();
                });
            });

            makeDropZone(list, {
                onReorder(fromIndex, toIndex) {
                    const [moved] = sampleDialogues.splice(fromIndex, 1);
                    sampleDialogues.splice(toIndex, 0, moved);
                    renderDialoguesList();
                }
            });
        }

        renderRulesList();
        renderDialoguesList();

        content.querySelector('#add-rule-btn')?.addEventListener('click', () => {
            const cond = content.querySelector('#rule-condition')?.value?.trim();
            const action = content.querySelector('#rule-action')?.value?.trim();
            if (!cond || !action) { showToast('Both condition and action are required', 'error'); return; }
            behaviorRules.push({ condition: cond, action });
            content.querySelector('#rule-condition').value = '';
            content.querySelector('#rule-action').value = '';
            renderRulesList();
        });

        content.querySelector('#add-dialogue-btn')?.addEventListener('click', () => {
            const u = content.querySelector('#dialogue-user')?.value?.trim();
            const a = content.querySelector('#dialogue-assistant')?.value?.trim();
            if (!u || !a) { showToast('Both user and assistant messages are required', 'error'); return; }
            sampleDialogues.push({ user: u, assistant: a });
            content.querySelector('#dialogue-user').value = '';
            content.querySelector('#dialogue-assistant').value = '';
            renderDialoguesList();
        });

        function setupTagInput(inputId, listId, chipClass, arr) {
            const input = content.querySelector(`#${inputId}`);
            const list = content.querySelector(`#${listId}`);
            if (!input || !list) return;
            function addTag(val) {
                if (!val.trim() || arr.includes(val.trim())) return;
                arr.push(val.trim());
                const chip = document.createElement('span');
                chip.className = `tag-chip ${chipClass}`;
                chip.dataset.value = val.trim();
                chip.innerHTML = `${escapeHtml(val.trim())} <button type="button" class="tag-chip__remove">&times;</button>`;
                chip.querySelector('.tag-chip__remove').addEventListener('click', () => {
                    const idx = arr.indexOf(chip.dataset.value);
                    if (idx >= 0) arr.splice(idx, 1);
                    chip.remove();
                });
                list.appendChild(chip);
            }
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(input.value); input.value = ''; }
            });
            list.querySelectorAll('.tag-chip__remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const val = btn.parentElement.dataset.value;
                    const idx = arr.indexOf(val);
                    if (idx >= 0) arr.splice(idx, 1);
                    btn.parentElement.remove();
                });
            });
        }

        setupTagInput('allowed-topic-input', 'allowed-topics-list', 'tag-chip--green', allowedTopics);
        setupTagInput('blocked-topic-input', 'blocked-topics-list', 'tag-chip--red', blockedTopics);

        content.querySelectorAll('.topic-chip--allow').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.topic;
                if (t && !allowedTopics.includes(t)) {
                    allowedTopics.push(t);
                    const list = content.querySelector('#allowed-topics-list');
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip tag-chip--green';
                    chip.dataset.value = t;
                    chip.innerHTML = `${escapeHtml(t)} <button type="button" class="tag-chip__remove">&times;</button>`;
                    chip.querySelector('.tag-chip__remove').addEventListener('click', () => { allowedTopics = allowedTopics.filter(x => x !== t); chip.remove(); });
                    list.appendChild(chip);
                    btn.hidden = true;
                }
            });
        });
        content.querySelectorAll('.topic-chip--block').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.topic;
                if (t && !blockedTopics.includes(t)) {
                    blockedTopics.push(t);
                    const list = content.querySelector('#blocked-topics-list');
                    const chip = document.createElement('span');
                    chip.className = 'tag-chip tag-chip--red';
                    chip.dataset.value = t;
                    chip.innerHTML = `${escapeHtml(t)} <button type="button" class="tag-chip__remove">&times;</button>`;
                    chip.querySelector('.tag-chip__remove').addEventListener('click', () => { blockedTopics = blockedTopics.filter(x => x !== t); chip.remove(); });
                    list.appendChild(chip);
                    btn.hidden = true;
                }
            });
        });
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 6: Model Configuration Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderModelStep(content) {
        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">AI Model Configuration</h3>
                <p class="builder-section__desc">Choose which AI providers and models power this agent</p>
            </div>
            <div id="model-config"><div class="loading-spinner"></div> Detecting installed providers...</div>
        `;

        (async () => {
            const providers = await fetchProviders(true);
            const el = container.querySelector('#model-config');
            if (!el) return;

            const textProviders = providers.filter(p => p.capabilities?.text);
            const imageProviders = providers.filter(p => p.capabilities?.image);
            const configuredStatuses = Array.isArray(configuredModelStatuses) ? configuredModelStatuses : [];

            el.innerHTML = `
                <div class="provider-status-bar">
                    <div class="provider-status">
                        <span class="status-dot ${providers.some(p => p.capabilities?.text && p.available) ? 'status-dot--online' : 'status-dot--offline'}"></span>
                        Text AI: ${textProviders.length ? textProviders.map((p) => `${p.displayName || p.name} (${p.available ? 'online' : 'offline' + (p.error ? ': ' + p.error : '')})`).join(', ') : 'none configured'}
                    </div>
                    <div class="provider-status">
                        <span class="status-dot ${providers.some(p => p.capabilities?.image && p.available) ? 'status-dot--online' : 'status-dot--offline'}"></span>
                        Image AI: ${imageProviders.length ? imageProviders.map((p) => `${p.displayName || p.name} (${p.available ? 'online' : 'offline' + (p.error ? ': ' + p.error : '')})`).join(', ') : 'none configured'}
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Text Provider <span class="form-help" title="Which backend generates text responses.">?</span></label>
                        <select id="agent-textProvider" class="form-input">
                            <option value="">-- Select --</option>
                            ${textProviders.map((p) => `<option value="${p.name}" data-display-name="${escapeHtml(p.displayName || p.name)}" ${formData.textProvider === p.name ? 'selected' : ''}>${escapeHtml(p.displayName || p.name)}${p.available ? '' : ' (offline)'}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Text Model <span class="form-help" title="The specific model for text generation.">?</span></label>
                        <select id="agent-textModel" class="form-input">
                            <option value="">-- Select provider first --</option>
                        </select>
                        <p id="agent-textModel-empty" class="builder-model-empty" hidden></p>
                        <div id="agent-textModel-status" class="builder-model-status" hidden></div>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group--grow">
                        <label class="form-label">Image Provider <span class="form-help" title="Which backend generates images.">?</span></label>
                        <select id="agent-imageProvider" class="form-input">
                            <option value="">None (text only)</option>
                            ${imageProviders.map((p) => `<option value="${p.name}" data-display-name="${escapeHtml(p.displayName || p.name)}" ${formData.imageProvider === p.name ? 'selected' : ''}>${escapeHtml(p.displayName || p.name)}${p.available ? '' : ' (offline)'}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group form-group--grow">
                        <label class="form-label">Image Model <span class="form-help" title="The checkpoint/model for image generation.">?</span></label>
                        <select id="agent-imageModel" class="form-input">
                            <option value="">-- Select provider first --</option>
                        </select>
                        <p id="agent-imageModel-empty" class="builder-model-empty" hidden></p>
                        <div id="agent-imageModel-status" class="builder-model-status" hidden></div>
                    </div>
                </div>
            `;

            function setInlineHint(hintEl, message = '') {
                if (!hintEl) return;
                hintEl.textContent = message;
                hintEl.hidden = !message;
            }

            function setInlineStatus(statusEl, severity = '', message = '') {
                if (!statusEl) return;
                statusEl.classList.remove('builder-model-status--warning', 'builder-model-status--error');
                if (!message) {
                    statusEl.hidden = true;
                    statusEl.textContent = '';
                    return;
                }
                statusEl.classList.add(severity === 'error' ? 'builder-model-status--error' : 'builder-model-status--warning');
                statusEl.hidden = false;
                statusEl.textContent = message;
            }

            function findConfiguredStatus(slot, providerName, modelId) {
                const slotKey = String(slot || '').trim().toLowerCase();
                const providerKey = String(providerName || '').trim().toLowerCase();
                const modelKey = String(modelId || '').trim();
                if (!slotKey || !providerKey || !modelKey) return null;
                return configuredStatuses.find((entry) =>
                    String(entry?.slot || '').trim().toLowerCase() === slotKey
                    && String(entry?.provider || '').trim().toLowerCase() === providerKey
                    && String(entry?.modelId || '').trim() === modelKey
                ) || null;
            }

            function buildUnavailableMessage(slotLabel, providerLabel, modelLabel, status) {
                const reasons = Array.isArray(status?.reasons) ? status.reasons : [];
                const isInactive = status?.isActive === false || reasons.includes('deactivated');
                const isHidden = status?.isUserVisible === false || reasons.includes('hidden');
                const severity = isInactive ? 'error' : 'warning';
                let reasonText = 'currently unavailable';
                if (isInactive && isHidden) reasonText = 'inactive and hidden';
                else if (isInactive) reasonText = 'inactive';
                else if (isHidden) reasonText = 'hidden';
                const preferredLabel = String(status?.displayName || status?.modelId || modelLabel || '').trim() || 'selected model';
                return {
                    severity,
                    message: `${slotLabel} model "${preferredLabel}" is ${reasonText} for ${providerLabel}.`
                };
            }

            function syncModelStepDisplays() {
                formData.textProvider = textProvSel?.value || '';
                formData.textModel = textModelSel?.value || '';
                formData.imageProvider = imgProvSel?.value || '';
                formData.imageModel = imgModelSel?.value || '';

                formData.textProviderDisplay = textProvSel?.selectedOptions?.[0]?.dataset?.displayName || formData.textProvider;
                formData.textModelDisplay = textModelSel?.selectedOptions?.[0]?.dataset?.displayName || formData.textModel;
                formData.imageProviderDisplay = imgProvSel?.selectedOptions?.[0]?.dataset?.displayName || formData.imageProvider;
                formData.imageModelDisplay = imgModelSel?.selectedOptions?.[0]?.dataset?.displayName || formData.imageModel;
            }

            function populateModelDropdown({ selectEl, providerName, currentValue, slot, emptyEl, statusEl, slotLabel }) {
                const provider = providers.find((entry) => entry.name === providerName);
                const providerLabel = provider?.displayName || provider?.name || providerName || 'selected provider';
                selectEl.innerHTML = '';

                if (!providerName) {
                    selectEl.innerHTML = '<option value="">-- Select provider first --</option>';
                    setInlineHint(emptyEl, '');
                    setInlineStatus(statusEl, '', '');
                    selectEl.disabled = true;
                    return;
                }

                const modelEntries = normalizeModelOptions(provider?.models);
                const defaultModelId = typeof provider?.defaultModel === 'string'
                    ? provider.defaultModel
                    : String(provider?.defaultModel?.id || provider?.defaultModel?.model || '').trim();
                const hasValidDefault = !!defaultModelId && modelEntries.some((m) => m.id === defaultModelId);

                if (!provider || !modelEntries.length) {
                    setInlineHint(emptyEl, `No ${slotLabel.toLowerCase()} models are currently active and visible for ${providerLabel}.`);
                    selectEl.disabled = true;
                    selectEl.innerHTML = '<option value="">-- No models available --</option>';
                    if (currentValue) {
                        const configured = findConfiguredStatus(slot, providerName, currentValue);
                        const unavailable = buildUnavailableMessage(slotLabel, providerLabel, currentValue, configured);
                        setInlineStatus(statusEl, unavailable.severity, unavailable.message);
                    } else {
                        setInlineStatus(statusEl, '', '');
                    }
                    return;
                }

                setInlineHint(emptyEl, '');
                selectEl.disabled = false;

                modelEntries.forEach((modelEntry) => {
                    const opt = document.createElement('option');
                    opt.value = modelEntry.id;
                    opt.textContent = modelEntry.displayName;
                    opt.dataset.displayName = modelEntry.displayName;
                    if (modelEntry.id === currentValue || (!currentValue && hasValidDefault && modelEntry.id === defaultModelId)) opt.selected = true;
                    selectEl.appendChild(opt);
                });
                if (currentValue && !modelEntries.some((m) => m.id === currentValue)) {
                    const configured = findConfiguredStatus(slot, providerName, currentValue);
                    const unavailable = buildUnavailableMessage(slotLabel, providerLabel, currentValue, configured);
                    setInlineStatus(statusEl, unavailable.severity, unavailable.message);
                    if (!selectEl.value && selectEl.options.length > 0) {
                        selectEl.selectedIndex = 0;
                    }
                } else {
                    setInlineStatus(statusEl, '', '');
                }
            }

            const textProvSel = el.querySelector('#agent-textProvider');
            const textModelSel = el.querySelector('#agent-textModel');
            const imgProvSel = el.querySelector('#agent-imageProvider');
            const imgModelSel = el.querySelector('#agent-imageModel');
            const textEmptyEl = el.querySelector('#agent-textModel-empty');
            const imageEmptyEl = el.querySelector('#agent-imageModel-empty');
            const textStatusEl = el.querySelector('#agent-textModel-status');
            const imageStatusEl = el.querySelector('#agent-imageModel-status');

            textModelSel.disabled = true;
            imgModelSel.disabled = true;

            populateModelDropdown({
                selectEl: textModelSel,
                providerName: formData.textProvider,
                currentValue: formData.textModel,
                slot: 'text',
                emptyEl: textEmptyEl,
                statusEl: textStatusEl,
                slotLabel: 'Text'
            });
            populateModelDropdown({
                selectEl: imgModelSel,
                providerName: formData.imageProvider,
                currentValue: formData.imageModel,
                slot: 'image',
                emptyEl: imageEmptyEl,
                statusEl: imageStatusEl,
                slotLabel: 'Image'
            });
            syncModelStepDisplays();

            textProvSel.addEventListener('change', () => {
                populateModelDropdown({
                    selectEl: textModelSel,
                    providerName: textProvSel.value,
                    currentValue: '',
                    slot: 'text',
                    emptyEl: textEmptyEl,
                    statusEl: textStatusEl,
                    slotLabel: 'Text'
                });
                syncModelStepDisplays();
            });
            imgProvSel.addEventListener('change', () => {
                populateModelDropdown({
                    selectEl: imgModelSel,
                    providerName: imgProvSel.value,
                    currentValue: '',
                    slot: 'image',
                    emptyEl: imageEmptyEl,
                    statusEl: imageStatusEl,
                    slotLabel: 'Image'
                });
                syncModelStepDisplays();
            });

            textModelSel.addEventListener('change', () => {
                syncModelStepDisplays();
                populateModelDropdown({
                    selectEl: textModelSel,
                    providerName: textProvSel.value,
                    currentValue: textModelSel.value,
                    slot: 'text',
                    emptyEl: textEmptyEl,
                    statusEl: textStatusEl,
                    slotLabel: 'Text'
                });
                syncModelStepDisplays();
            });

            imgModelSel.addEventListener('change', () => {
                syncModelStepDisplays();
                populateModelDropdown({
                    selectEl: imgModelSel,
                    providerName: imgProvSel.value,
                    currentValue: imgModelSel.value,
                    slot: 'image',
                    emptyEl: imageEmptyEl,
                    statusEl: imageStatusEl,
                    slotLabel: 'Image'
                });
                syncModelStepDisplays();
            });
        })();
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 7: Review Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    function renderReviewStep(content) {
        const name = formData.name || 'Agent';
        const textModel = formData.textModelDisplay || formData.textModel || '(not set)';
        const textProvider = formData.textProviderDisplay || formData.textProvider || '(not set)';
        const imgProvider = formData.imageProviderDisplay || formData.imageProvider || 'none';
        const skillCount = skillIds.length;
        const rulesCount = behaviorRules.length;
        const dialoguesCount = sampleDialogues.length;
        const promptLen = (formData.systemPrompt || '').length;
        const promptPreview = formData.systemPrompt ? formData.systemPrompt.substring(0, 120) + (formData.systemPrompt.length > 120 ? '...' : '') : '(no prompt set)';

        content.innerHTML = `
            <div class="builder-section">
                <h3 class="builder-section__title">Review & ${agent ? 'Save' : 'Create'}</h3>
                <p class="builder-section__desc">Check your agent configuration before ${agent ? 'saving' : 'creating'}</p>
            </div>
            <div class="review-card">
                <div class="review-card__header">
                    <img class="review-card__avatar" src="${formData.avatarUrl || getAgentAvatarUrl({ name: formData.name || 'A' }, { shape: 'circle' })}" alt="">
                    <div>
                        <div class="review-card__name">${escapeHtml(name)}</div>
                        <div class="review-card__tagline">${escapeHtml(formData.tagline || 'No tagline')}</div>
                    </div>
                </div>
                <div class="review-card__grid">
                    <div class="review-card__item"><span class="review-card__label">Text Provider</span><span class="review-card__value">${escapeHtml(textProvider)}</span></div>
                    <div class="review-card__item"><span class="review-card__label">Text Model</span><span class="review-card__value">${escapeHtml(textModel)}</span></div>
                    <div class="review-card__item"><span class="review-card__label">Image Provider</span><span class="review-card__value">${escapeHtml(imgProvider)}</span></div>
                    <div class="review-card__item"><span class="review-card__label">Skills</span><span class="review-card__value">${skillCount} selected</span></div>
                    <div class="review-card__item"><span class="review-card__label">Rules</span><span class="review-card__value">${rulesCount} rules</span></div>
                    <div class="review-card__item"><span class="review-card__label">Dialogues</span><span class="review-card__value">${dialoguesCount} examples</span></div>
                    <div class="review-card__item"><span class="review-card__label">Temperature</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${(formData.temperature || 0) * 100}%"></div></div></div>
                    <div class="review-card__item"><span class="review-card__label">Max Tokens</span><span class="review-card__value">${formData.maxTokens}</span></div>
                    <div class="review-card__item"><span class="review-card__label">Top-P / Top-K</span><span class="review-card__value">${formData.topP} / ${formData.topK}</span></div>
                    <div class="review-card__item"><span class="review-card__label">Formality</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${((formData.formality || 0) / 10) * 100}%"></div></div></div>
                    <div class="review-card__item"><span class="review-card__label">Verbosity</span><div class="review-health-bar"><div class="review-health-bar__fill" style="width:${((formData.verbosity || 0) / 10) * 100}%"></div></div></div>
                    <div class="review-card__item"><span class="review-card__label">Context Window</span><span class="review-card__value">${formData.contextWindow} msgs</span></div>
                    <div class="review-card__item review-card__item--span2">
                        <span class="review-card__label">Capability profile</span>
                        <div class="review-capability-radar">
                            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                <defs><linearGradient id="radarFill" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.4"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.1"/></linearGradient></defs>
                                ${(() => {
                                    const n = 5;
                                    const r = 45;
                                    const cx = 50, cy = 50;
                                    const vals = [
                                        Math.min(1, skillCount / 5),
                                        Math.min(1, rulesCount / 3),
                                        Math.min(1, dialoguesCount / 3),
                                        Math.min(1, (formData.systemPrompt || '').length / 500),
                                        ((formData.formality ?? 5) + (formData.verbosity ?? 5)) / 20
                                    ];
                                    const pts = vals.map((v, i) => {
                                        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                                        return `${cx + r * v * Math.cos(a)},${cy + r * v * Math.sin(a)}`;
                                    }).join(' ');
                                    const gridPts = [0.25, 0.5, 0.75, 1].map(g => vals.map((_, i) => {
                                        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                                        return `${cx + r * g * Math.cos(a)},${cy + r * g * Math.sin(a)}`;
                                    }).join(' '));
                                    const labels = ['Skills', 'Rules', 'Dia.', 'Prompt', 'Flex'];
                                    return `
                                    ${gridPts.map((p, gi) => `<polygon points="${p}" fill="none" stroke="var(--border)" stroke-width="0.5"/>`).join('')}
                                    <polygon points="${pts}" fill="url(#radarFill)" stroke="var(--accent)" stroke-width="1.5"/>
                                    ${labels.map((l, i) => {
                                        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
                                        const x = cx + (r + 8) * Math.cos(a), y = cy + (r + 8) * Math.sin(a);
                                        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="7" fill="var(--text-muted)">${l}</text>`;
                                    }).join('')}
                                    `;
                                })()}
                            </svg>
                            <span class="review-capability-radar__label">Skills &bull; Rules &bull; Dialogues &bull; Prompt &bull; Flexibility</span>
                        </div>
                    </div>
                </div>
                <div class="review-card__prompt">
                    <span class="review-card__label">System Prompt</span>
                    <p class="review-card__prompt-text">${escapeHtml(promptPreview)}</p>
                    <span class="text-muted u-text-xs">${promptLen} chars &middot; ~${Math.ceil(promptLen / 4)} tokens estimated</span>
                </div>
                ${formData.greetingMessage ? `<div class="review-card__prompt"><span class="review-card__label">Greeting</span><p class="review-card__prompt-text">${escapeHtml(formData.greetingMessage)}</p></div>` : ''}
                ${agent ? `
                <div class="agent-review-actions">
                    <input type="checkbox" id="hub-publish" ${formData.hubPublished ? 'checked' : ''}>
                    <label for="hub-publish">Publish to Bot Hub (others can subscribe)</label>
                </div>
                ` : ''}
            </div>
        `;
        content.querySelector('#hub-publish')?.addEventListener('change', (e) => {
            formData.hubPublished = e.target.checked;
        });
        content.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
    }

    async function saveAgent(openChat = false) {
        if (formData.textProvider) {
            try {
                const { data: providers } = await api('/ai/providers');
                const prov = (providers || []).find(p => p.name === formData.textProvider);
                const modelEntries = normalizeModelOptions(prov?.models);
                if (prov && formData.textModel && !modelEntries.some((m) => m.id === formData.textModel)) {
                    const providerLabel = prov.displayName || prov.name || formData.textProvider;
                    showToast(`Model "${formData.textModel}" may not be available for ${providerLabel}. Please select from the list.`, 'warning');
                    step = 6;
                    renderStep();
                    return;
                }
            } catch {}
        }
        const body = {
            name: formData.name,
            tagline: formData.tagline,
            avatarUrl: formData.avatarUrl || '',
            systemPrompt: formData.systemPrompt,
            textProvider: formData.textProvider,
            textModel: formData.textModel,
            imageProvider: formData.imageProvider || '',
            imageModel: formData.imageModel || '',
            temperature: formData.temperature,
            maxTokens: formData.maxTokens,
            skillIds,
            topP: formData.topP,
            topK: formData.topK,
            repeatPenalty: formData.repeatPenalty,
            presencePenalty: formData.presencePenalty,
            frequencyPenalty: formData.frequencyPenalty,
            stopSequences: formData.stopSequences,
            responseFormat: formData.responseFormat,
            greetingMessage: formData.greetingMessage,
            contextWindow: formData.contextWindow,
            memoryStrategy: formData.memoryStrategy,
            formality: formData.formality,
            verbosity: formData.verbosity,
            behaviorRules: { rules: behaviorRules, allowedTopics, blockedTopics },
            sampleDialogues,
            tagNames: formData.tagNames || [],
            hubPublished: formData.hubPublished,
            metadata: {
                responseLength: formData.responseLength,
                creativityFactuality: formData.creativityFactuality,
                roleplayMode: formData.roleplayMode,
                responseDelayMin: formData.responseDelayMin,
                responseDelayMax: formData.responseDelayMax,
                profanityFilter: formData.profanityFilter
            }
        };
        const btn = container.querySelector('#agent-next');
        btn.disabled = true;
        btn.textContent = agent ? 'Saving...' : 'Creating...';
        try {
            if (agent) {
                await api(`/agents/${agent.id}`, { method: 'PUT', body: JSON.stringify(body) });
                sessionStorage.setItem('agentBuilderTutorialComplete', 'true');
                showToast('Agent updated', 'success');
                navigate(openChat ? `/chat?agent=${agent.id}` : '/agents');
            } else {
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify(body) });
                sessionStorage.setItem('agentBuilderTutorialComplete', 'true');
                showToast('Agent created! Opening chat...', 'success');
                navigate(`/chat?agent=${data.id}`);
            }
        } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = agent ? 'Save Changes' : 'Create Agent';
        }
    }

    renderStep();

    const origNavRef = navigate;
    const navOverride = (path) => {
        if (_builderDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
        cleanupBuilder();
        origNavRef(path);
    };
    function cleanupBuilder() {
        _builderDirty = false;
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (_builderCleanup) _builderCleanup();
    }
    container.querySelectorAll('[data-route="/agents"]').forEach(el => {
        el.removeEventListener('click', el._navHandler);
        el._navHandler = (e) => { e.preventDefault(); navOverride('/agents'); };
        el.addEventListener('click', el._navHandler);
    });
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Chat Hub (all conversations) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async function renderAgentsCategoryManager(container, categories) {
    const { showConfirm } = await import('../../components/Dialog.js');
    let order = (categories || []).map(c => ({ id: c.id, name: c.name, count: c.agentCount ?? 0 }));
    const refreshList = () => {
        const list = content.querySelector('#agent-category-list');
        list.innerHTML = order.length ? order.map((c) => `
            <div class="category-dnd-item" data-id="${c.id}" draggable="true">
                <span class="category-drag-handle">&#9776;</span>
                <input type="text" class="category-name-edit form-input form-input--sm" data-id="${c.id}" value="${escapeHtml(c.name)}" />
                <span class="badge badge-ghost">${c.count} agents</span>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-cat" data-id="${c.id}">Delete</button>
            </div>
        `).join('') : '<p class="text-muted agent-category-manager__empty">No categories. Add one below.</p>';
        list.querySelectorAll('.category-dnd-item').forEach(row => {
            row.addEventListener('dragstart', e => { e.dataTransfer.setData('text', row.dataset.id); row.classList.add('category-dragging'); });
            row.addEventListener('dragend', () => row.classList.remove('category-dragging'));
            row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
            row.addEventListener('drop', e => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text');
                const from = order.findIndex(x => x.id === id);
                const to = order.findIndex(x => x.id === row.dataset.id);
                if (from >= 0 && to >= 0 && from !== to) {
                    const [rem] = order.splice(from, 1);
                    order.splice(to, 0, rem);
                    refreshList();
                    bindAgentCategoryHandlers();
                }
            });
        });
        bindAgentCategoryHandlers();
    };
    const bindAgentCategoryHandlers = () => {
        content.querySelectorAll('.category-name-edit').forEach(inp => {
            inp.replaceWith(inp.cloneNode(true));
        });
        content.querySelectorAll('.category-name-edit').forEach(inp => {
            inp.addEventListener('change', async () => {
                const name = inp.value.trim();
                if (!name) return;
                try {
                    await api(`/agents/categories/${inp.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
                    const o = order.find(x => x.id === inp.dataset.id);
                    if (o) o.name = name;
                    showToast('Category renamed', 'success');
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
        content.querySelectorAll('.btn-delete-cat').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
        content.querySelectorAll('.btn-delete-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const ok = await showConfirm({ title: 'Delete Category', message: 'Remove this category? Agents will become uncategorized.', confirmText: 'Delete', danger: true });
                if (!ok) return;
                try {
                    await api(`/agents/categories/${btn.dataset.id}`, { method: 'DELETE' });
                    order = order.filter(x => x.id !== btn.dataset.id);
                    refreshList();
                    showToast('Category deleted', 'success');
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    };
    const content = document.createElement('div');
    content.className = 'container agent-category-manager__content';
    content.innerHTML = `
        <div class="card agent-category-manager__card">
            <h3 class="agent-category-manager__title">Manage Agent Categories</h3>
            <p class="text-muted agent-category-manager__subtitle">Drag to reorder. Click name to edit.</p>
            <div id="agent-category-list" class="agent-category-manager__list"></div>
            <div class="agent-category-manager__actions">
                <input type="text" id="new-agent-category-name" class="form-input agent-category-manager__new-input" placeholder="New category name">
                <button type="button" class="btn btn-primary" id="add-agent-category-btn">Add</button>
            </div>
            <button type="button" class="btn btn-ghost" id="close-agent-category-manager">Done</button>
        </div>
    `;
    const modal = document.createElement('div');
    modal.className = 'agent-category-manager__modal';
    modal.appendChild(content);
    modal.addEventListener('click', (e) => { if (e.target === modal) { saveOrder(); modal.remove(); renderAgents(container, '/agents'); } });
    document.body.appendChild(modal);
    const saveOrder = async () => {
        try {
            await api('/agents/categories/reorder', { method: 'PUT', body: JSON.stringify({ order: order.map((o, i) => ({ id: o.id, sort_order: i })) }) });
        } catch (err) {
            console.debug('Failed to persist agent category order', err);
        }
    };
    refreshList();
    content.querySelector('#add-agent-category-btn').addEventListener('click', async () => {
        const name = content.querySelector('#new-agent-category-name').value.trim();
        if (!name) { showToast('Enter a category name', 'error'); return; }
        try {
            const { data } = await api('/agents/categories', { method: 'POST', body: JSON.stringify({ name }) });
            order.push({ id: data.id, name: data.name, count: 0 });
            content.querySelector('#new-agent-category-name').value = '';
            refreshList();
            showToast('Category created', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    });
    content.querySelector('#close-agent-category-manager').addEventListener('click', () => { saveOrder(); modal.remove(); renderAgents(container, '/agents'); });
}

    return { renderAgents, renderAgentForm, renderAgentsCategoryManager };
}




