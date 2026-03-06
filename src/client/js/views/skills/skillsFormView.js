export async function renderSkillsFormView({
    container,
    slugOrId,
    api,
    navigate,
    showToast,
    escapeHtml
}) {
    let skill = null;
    if (slugOrId) {
        try {
            const { data } = await api(`/skills/${encodeURIComponent(slugOrId)}`);
            skill = data;
        } catch {
            showToast('Skill not found', 'error');
            navigate('/skills');
            return;
        }
    }

    container.innerHTML = `
        <div class="container">
            <a href="#" class="btn btn-ghost btn-chevron btn-chevron--back" data-route="/skills"><span class="ui-chevron ui-chevron--left" aria-hidden="true"></span><span>Back</span></a>
            <div class="card mt-2 skills-form-card">
                <h3>${skill ? 'Edit Skill' : 'Create Skill'}</h3>
                <form id="skill-form" class="mt-2">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input type="text" name="name" class="form-input" value="${escapeHtml(skill?.name || '')}" placeholder="Web Search" required ${skill ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Slug</label>
                        <input type="text" name="slug" class="form-input" value="${escapeHtml(skill?.slug || skill?.name || '')}" placeholder="web-search" required ${skill ? 'readonly' : ''}>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Description</label>
                        <input type="text" name="description" class="form-input" value="${escapeHtml(skill?.description || '')}" placeholder="Brief description">
                    </div>
                    ${skill ? `
                    <div class="form-group">
                        <label class="form-label">Visibility</label>
                        <select name="visibility" class="form-input">
                            <option value="private" ${(skill?.visibility || 'private') === 'private' ? 'selected' : ''}>Private</option>
                            <option value="public" ${skill?.visibility === 'public' ? 'selected' : ''}>Public</option>
                        </select>
                        <span class="text-muted analytics-stat-caption">Private: only you. Public: can be published to Hub.</span>
                    </div>
                    ` : `
                    <div class="form-group">
                        <label class="form-label">Visibility</label>
                        <select name="visibility" class="form-input">
                            <option value="private" selected>Private</option>
                            <option value="public">Public</option>
                        </select>
                        <span class="text-muted analytics-stat-caption">Private: only you. Public: can be published to Hub.</span>
                    </div>
                    `}
                    <div class="form-group">
                        <label class="form-label">Instructions (markdown)</label>
                        <textarea name="instructions" class="form-input" rows="6" placeholder="When the user asks about X, do Y...">${escapeHtml(skill?.instructions || '')}</textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">${skill ? 'Save' : 'Create'}</button>
                </form>
            </div>
        </div>
    `;

    container.querySelector('[data-route]').addEventListener('click', (event) => {
        event.preventDefault();
        navigate('/skills');
    });

    container.querySelector('#skill-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.target;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        const body = {
            name: form.name.value,
            slug: (form.slug?.value || form.name.value).toLowerCase().replace(/\s+/g, '-'),
            description: form.description?.value || '',
            instructions: form.instructions?.value || ''
        };
        if (form.visibility) body.visibility = form.visibility.value;

        try {
            if (skill) {
                await api(`/skills/${encodeURIComponent(skill.id)}`, { method: 'PUT', body: JSON.stringify(body) });
            } else {
                await api('/skills', { method: 'POST', body: JSON.stringify(body) });
            }
            showToast(skill ? 'Skill updated' : 'Skill created', 'success');
            navigate('/skills');
        } catch (error) {
            showToast(error.message, 'error');
            button.disabled = false;
        }
    });
}
