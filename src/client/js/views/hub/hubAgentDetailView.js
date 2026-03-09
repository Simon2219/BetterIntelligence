function renderPersonalityProfile(profile, escapeHtml) {
    const axes = Array.isArray(profile?.axes) ? profile.axes.slice(0, 5) : [];
    if (!axes.length) return '';
    const count = axes.length;
    const radius = 44;
    const centerX = 50;
    const centerY = 50;
    const points = axes.map((axis, index) => {
        const value = Math.max(0, Math.min(1, Number(axis.value || 0) / 10));
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        return `${centerX + radius * value * Math.cos(angle)},${centerY + radius * value * Math.sin(angle)}`;
    }).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map((ratio) => axes.map((_, index) => {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        return `${centerX + radius * ratio * Math.cos(angle)},${centerY + radius * ratio * Math.sin(angle)}`;
    }).join(' '));
    return `
        <div class="hub-personality-card">
            <div class="hub-personality-card__header">
                <div>
                    <div class="hub-personality-card__title">Personality Profile</div>
                    <div class="hub-personality-card__meta">${escapeHtml(profile.summary || 'Derived from the saved builder settings')}</div>
                </div>
            </div>
            <div class="hub-personality-card__body">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    ${grid.map((gridPoints) => `<polygon points="${gridPoints}" fill="none" stroke="var(--border)" stroke-width="0.5"></polygon>`).join('')}
                    <polygon points="${points}" fill="color-mix(in srgb, var(--accent) 24%, transparent)" stroke="var(--accent)" stroke-width="1.5"></polygon>
                    ${axes.map((axis, index) => {
                        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                        const x = centerX + (radius + 10) * Math.cos(angle);
                        const y = centerY + (radius + 10) * Math.sin(angle);
                        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="6.5" fill="var(--text-muted)">${escapeHtml(axis.label)}</text>`;
                    }).join('')}
                </svg>
                <div class="hub-personality-card__traits">
                    ${axes.map((axis) => `<span class="badge badge-ghost">${escapeHtml(axis.label)} ${Math.round(Number(axis.value || 0))}/10</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

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
        const { data: agent } = await api(`/hub/agents/${agentId}`);
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
                        ${agent.creator?.displayName ? `<span class="badge badge-ghost">By ${escapeHtml(agent.creator.displayName)}</span>` : ''}
                    </div>
                    ${agent.creator?.bio ? `<p class="hub-detail-bio">${escapeHtml(agent.creator.bio)}</p>` : ''}
                    <div class="card-actions">
                        <a href="#" class="btn btn-primary" data-route="/chat?agent=${agent.id}">Chat</a>
                        ${agent.isSubscribed ? `<button class="btn btn-ghost btn-unsubscribe" data-id="${agent.id}">Unsubscribe</button>` : `<button class="btn btn-primary btn-subscribe" data-id="${agent.id}">Subscribe</button>`}
                        <a href="#" class="btn btn-ghost btn-copy-from-hub" data-id="${agent.id}">Copy to My Agents</a>
                    </div>
                    ${renderPersonalityProfile(agent.personalityProfile, escapeHtml)}
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
                await api(`/hub/agents/${agent.id}/subscribe`, { method: 'POST' });
                showToast('Subscribed!', 'success');
                await rerender(`/hub/agents/${agentId}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });

        container.querySelector('.btn-unsubscribe')?.addEventListener('click', async () => {
            try {
                await api(`/hub/agents/${agent.id}/subscribe`, { method: 'DELETE' });
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
                navigate(`/agentBuilder/${data.id}`);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-danger">${escapeHtml(error.message)}</p></div>`;
    }
}
