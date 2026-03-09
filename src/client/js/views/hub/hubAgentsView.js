export async function renderHubAgentsView({
    container,
    api,
    navigate,
    showToast,
    getAgentAvatarUrl,
    escapeHtml,
    getHubAgentHealth,
    rerender
}) {
    try {
        const [{ data: agents }, { data: allTags }] = await Promise.all([
            api('/hub/agents'),
            api('/hub/agents/tags').catch(() => ({ data: [] }))
        ]);
        const tagFilter = new URLSearchParams(location.search).get('tag') || '';
        const filtered = !tagFilter
            ? (agents || [])
            : (agents || []).filter((agent) => (agent.tags || []).some((tag) => (tag.name || tag) === tagFilter));

        container.innerHTML = `
            <div class="container">
                <div class="view-header">
                    <h2 class="view-header__title">Hub</h2>
                    <div class="view-header__actions">
                        ${(allTags || []).length ? `
                        <select id="hub-agent-tag-filter" class="form-input form-input--sm ui-select-compact">
                            <option value="">All tags</option>
                            ${(allTags || []).map((tag) => `<option value="${escapeHtml(tag.name)}" ${tag.name === tagFilter ? 'selected' : ''}>${escapeHtml(tag.name)} (${tag.agent_count ?? 0})</option>`).join('')}
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
                        ${filtered.map((agent) => {
                            const health = getHubAgentHealth(agent);
                            return `
                            <div class="card agent-card ${health.cardClass}">
                                <div class="card-header">
                                    <img class="card-avatar" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                                    <div>
                                        <div class="card-title hub-title-row">${escapeHtml(agent.name)}${health.indicator}</div>
                                        <div class="card-meta">${escapeHtml(agent.tagline || '')}</div>
                                    </div>
                                </div>
                                ${health.notice}
                                <div class="card-body-meta">${(agent.tags || []).slice(0, 3).map((tag) => `<span class="badge badge-tag">${escapeHtml(tag.name)}</span>`).join(' ')}</div>
                                <div class="card-actions">
                                    <a href="#" class="btn btn-primary" data-route="/chat?agent=${agent.id}">Chat</a>
                                    <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents/${agent.id}">Details</a>
                                    ${agent.isSubscribed ? '<span class="badge hub-badge-success">Subscribed</span>' : `<button class="btn btn-ghost btn-sm btn-hub-sub" data-id="${agent.id}">Subscribe</button>`}
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;

        container.querySelector('#hub-agent-tag-filter')?.addEventListener('change', (event) => {
            const value = event.target.value;
            const url = new URL(location.href);
            if (value) url.searchParams.set('tag', value);
            else url.searchParams.delete('tag');
            navigate(url.pathname + url.search);
        });

        container.querySelectorAll('[data-route]').forEach((el) => {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                navigate(el.dataset.route);
            });
        });

        container.querySelectorAll('.btn-hub-sub').forEach((button) => {
            button.addEventListener('click', async () => {
                try {
                    await api(`/hub/agents/${button.dataset.id}/subscribe`, { method: 'POST' });
                    showToast('Subscribed!', 'success');
                    await rerender('/hub/agents' + (location.search || ''));
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-danger">${escapeHtml(error.message)}</p></div>`;
    }
}
