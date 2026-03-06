export async function renderHubSkillsView({
    container,
    api,
    navigate,
    showToast,
    escapeHtml,
    rerender
}) {
    try {
        const { data: skills } = await api('/hub/skills');
        const { data: mySkills } = await api('/skills');
        const installed = new Set((mySkills || []).filter((skill) => skill.source === 'installed').map((skill) => skill.slug || skill.name));

        container.innerHTML = `
            <div class="container">
                <div class="view-header">
                    <h2 class="view-header__title">Skills</h2>
                    <a href="#" class="btn btn-ghost btn-sm btn-chevron btn-chevron--back" data-route="/hub"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back to Hub</span></a>
                </div>
                ${(skills || []).length ? `
                <div class="card-grid">
                    ${(skills || []).map((skill) => `
                        <div class="card">
                            <div class="card-title">${escapeHtml(skill.name)}</div>
                            <div class="card-meta">${escapeHtml(skill.description || '')}</div>
                            <div class="card-actions">
                                ${installed.has(skill.slug || skill.name) ? '<span class="badge badge-ghost">Installed</span>' : `<button class="btn btn-primary btn-sm btn-install" data-slug="${skill.slug || skill.name}">Install</button>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : '<p class="text-muted">No skills published to the Hub yet.</p>'}
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
                    await rerender('/hub/skills');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message)}</p></div>`;
    }
}
