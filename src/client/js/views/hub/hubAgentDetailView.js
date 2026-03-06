export async function renderHubAgentDetailView({
    container,
    agentId,
    api,
    navigate,
    showToast,
    getAgentAvatarUrl,
    escapeHtml,
    getHubAgentHealth,
    rerender
}) {
    try {
        const { data: agent } = await api(`/agents/${agentId}`);
        const health = getHubAgentHealth(agent);

        container.innerHTML = `
            <div class="container">
                <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/hub/agents"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Hub</span></a>
                <div class="card ${health.cardClass} hub-detail-card">
                    <div class="card-header">
                        <img class="card-avatar hub-avatar--lg" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                        <div>
                            <div class="card-title hub-title-row hub-title-row--detail">${escapeHtml(agent.name)}${health.indicator}</div>
                            <div class="card-meta">${escapeHtml(agent.tagline || '')}</div>
                        </div>
                    </div>
                    ${health.notice}
                    <div class="card-body-meta hub-detail-meta">
                        ${(agent.tags || []).map((tag) => `<span class="badge badge-tag">${escapeHtml(tag.name)}</span>`).join(' ')}
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

        container.querySelectorAll('[data-route]').forEach((el) => {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                navigate(el.dataset.route);
            });
        });

        container.querySelector('.btn-subscribe')?.addEventListener('click', async () => {
            try {
                await api(`/agents/${agent.id}/subscribe`, { method: 'POST' });
                showToast('Subscribed!', 'success');
                await rerender(`/hub/agents/${agentId}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });

        container.querySelector('.btn-unsubscribe')?.addEventListener('click', async () => {
            try {
                await api(`/agents/${agent.id}/subscribe`, { method: 'DELETE' });
                showToast('Unsubscribed', 'success');
                await rerender(`/hub/agents/${agentId}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });

        container.querySelector('.btn-copy-from-hub')?.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                const { data } = await api('/agents', { method: 'POST', body: JSON.stringify({ copyFrom: agent.id }) });
                showToast('Agent copied!', 'success');
                navigate(`/agents/${data.id}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-danger">${escapeHtml(error.message)}</p></div>`;
    }
}
