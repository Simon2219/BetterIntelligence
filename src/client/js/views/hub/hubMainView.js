export async function renderHubMainView({
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
        const [{ data: skills }, { data: agents }] = await Promise.all([
            api('/hub/skills'),
            api('/hub/agents')
        ]);
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
                            ${featuredSkills.slice(0, 2).map((skill) => `
                                <div class="card hub-card hub-card--skill">
                                    <div class="card-title">${escapeHtml(skill.name)}</div>
                                    <div class="card-meta hub-card-meta--sm">${escapeHtml((skill.description || '').slice(0, 80))}${(skill.description || '').length > 80 ? '...' : ''}</div>
                                    <div class="card-actions">
                                        ${skill.isInstalled ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${skill.slug || skill.name}">Install</button>`}
                                    </div>
                                </div>
                            `).join('')}
                            ${featuredAgents.slice(0, 2).map((agent) => {
                                const health = getHubAgentHealth(agent);
                                return `
                                <div class="card hub-card hub-card--agent ${health.cardClass}">
                                    <div class="card-header hub-card-header--tight">
                                        <img class="card-avatar hub-avatar--md" src="${getAgentAvatarUrl(agent, { shape: 'circle' })}" alt="">
                                        <div>
                                            <div class="card-title hub-title-row">${escapeHtml(agent.name)}${health.indicator}</div>
                                            <div class="card-meta hub-tagline--sm">${escapeHtml((agent.tagline || '').slice(0, 40))}</div>
                                        </div>
                                    </div>
                                    ${health.notice}
                                    <div class="card-actions">
                                        <a href="#" class="btn btn-primary btn-sm" data-route="/chat?agent=${agent.id}">Chat</a>
                                        <a href="#" class="btn btn-ghost btn-sm" data-route="/hub/agents/${agent.id}">Details</a>
                                    </div>
                                </div>
                                `;
                            }).join('')}
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
                        ${newSkills.map((skill) => `
                            <div class="card">
                                <div class="card-title">${escapeHtml(skill.name)}</div>
                                <div class="card-meta">${escapeHtml((skill.description || '').slice(0, 100))}</div>
                                <div class="card-actions">
                                    ${skill.isInstalled ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${skill.slug || skill.name}">Install</button>`}
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
                        ${popularAgents.map((agent) => {
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
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                    ` : '<p class="text-muted">No agents in the hub yet.</p>'}
                </section>
            </div>
        `;
        container.querySelectorAll('[data-route]').forEach((el) => {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                navigate(el.dataset.route);
            });
        });
        container.querySelectorAll('.btn-install').forEach((button) => {
            button.addEventListener('click', async () => {
                try {
                    await api(`/hub/skills/${button.dataset.slug}/install`, { method: 'POST' });
                    showToast('Skill installed', 'success');
                    await rerender('/hub');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message)}</p></div>`;
    }
}
