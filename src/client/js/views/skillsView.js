export function createSkillsView(deps) {
    const { api, navigate, showToast, escapeHtml } = deps;

function skillCardHtml(s, showActions = false, categories = []) {
    return `
        <div class="card skill-card">
            ${showActions && categories.length ? `
            <button type="button" class="skill-category-arrow" data-skill-id="${s.id}" title="Assign to category" aria-label="Assign category"><span class="ui-chevron" aria-hidden="true"></span></button>
            ` : ''}
            <div class="card-title">${escapeHtml(s.name)}</div>
            <div class="card-meta">${escapeHtml(s.description || '')}</div>
            ${showActions ? `
            <div class="card-actions">
                <span class="badge badge-ghost skill-visibility-badge">${(s.visibility || 'private')}</span>
                <a href="#" class="btn btn-primary btn-sm" data-route="/skills/${encodeURIComponent(s.id || s.slug || s.name)}/edit">Edit</a>
                <button class="btn btn-ghost btn-sm btn-publish" data-slug="${s.slug || s.name}">Publish</button>
            </div>
            ` : '<div class="card-actions"></div>'}
        </div>
    `;
}

async function renderSkills(container, path) {
    const parts = path.split('/').filter(Boolean);
    const isNew = parts[1] === 'new';
    const editSlug = parts[1] && parts[1] !== 'new' ? parts[1] : null;
    if (isNew || editSlug) {
        await renderSkillForm(container, editSlug);
        return;
    }
    try {
        const [{ data: skills }, { data: categories }] = await Promise.all([
            api('/skills'),
            api('/skills/categories').catch(() => ({ data: [] }))
        ]);
        const cats = categories || [];
        const bundled = (skills || []).filter(s => s.source === 'bundled');
        const installed = (skills || []).filter(s => s.source === 'installed');
        const mine = (skills || []).filter(s => s.source === 'workspace');
        const allEditable = [...installed, ...mine];

        const byCategory = {};
        const uncategorized = [];
        for (const s of allEditable) {
            const cid = (s.categoryIds || [])[0];
            if (!cid) uncategorized.push(s);
            else {
                if (!byCategory[cid]) byCategory[cid] = [];
                byCategory[cid].push(s);
            }
        }

        const categorySectionsHtml = cats.map(cat => {
            const items = byCategory[cat.id] || [];
            if (items.length === 0) return '';
            return `
                <details class="collapsible-section" open>
                    <summary class="collapsible-section__header">${escapeHtml(cat.name)} <span class="badge badge-ghost">${items.length}</span></summary>
                    <div class="collapsible-section__body">
                        <div class="card-grid">${items.map(s => skillCardHtml(s, true, cats)).join('')}</div>
                    </div>
                </details>
            `;
        }).join('');

        const uncategorizedSection = uncategorized.length ? `
            <details class="collapsible-section" open>
                <summary class="collapsible-section__header">Uncategorized <span class="badge badge-ghost">${uncategorized.length}</span></summary>
                <div class="collapsible-section__body">
                    <div class="card-grid">${uncategorized.map(s => skillCardHtml(s, true, cats)).join('')}</div>
                </div>
            </details>
        ` : (cats.length ? `
            <details class="collapsible-section">
                <summary class="collapsible-section__header">Uncategorized <span class="badge badge-ghost">0</span></summary>
                <div class="collapsible-section__body"><p class="text-muted">All skills are categorized.</p></div>
            </details>
        ` : '');

        const bundledSection = bundled.length ? `
            <details class="collapsible-section" open>
                <summary class="collapsible-section__header">Bundled <span class="badge badge-ghost">${bundled.length}</span></summary>
                <div class="collapsible-section__body">
                    <div class="card-grid">${bundled.map(s => skillCardHtml(s, false)).join('')}</div>
                </div>
            </details>
        ` : '';

        container.innerHTML = `
            <div class="container">
                <div class="skills-header">
                    <h2 class="skills-header__title">Skills</h2>
                    <div class="skills-header__actions">
                        <button type="button" class="btn btn-ghost btn-sm" id="skills-manage-categories">Categories</button>
                        <a href="#" class="btn btn-primary" data-route="/skills/new">+ Create Skill</a>
                    </div>
                </div>
                ${!skills?.length ? `
                    <div class="card empty-state">
                        <h3>No skills yet</h3>
                        <p>Create a skill or install one from the Hub</p>
                        <a href="#" class="btn btn-primary" data-route="/skills/new">Create Skill</a>
                        <a href="#" class="btn btn-ghost mt-1" data-route="/hub">Browse Hub</a>
                    </div>
                ` : `
                    ${bundledSection}
                    ${categorySectionsHtml}
                    ${uncategorizedSection}
                `}
            </div>
        `;

        container.querySelectorAll('.skill-category-arrow').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const skill = allEditable.find(s => s.id === btn.dataset.skillId);
                const currentCatId = (skill?.categoryIds || [])[0] || '';
                const rect = btn.getBoundingClientRect();
                let pop = document.getElementById('skill-category-popover');
                if (pop) pop.remove();
                pop = document.createElement('div');
                pop.id = 'skill-category-popover';
                pop.className = 'skill-category-popover';
                pop.style.left = `${rect.left}px`;
                pop.style.top = `${rect.bottom + 4}px`;
                pop.innerHTML = cats.length ? [
                    `<button type="button" class="skill-cat-option ${!currentCatId ? 'skill-cat-option--active' : ''}" data-id="">No category</button>`,
                    ...cats.map(c => `<button type="button" class="skill-cat-option ${c.id === currentCatId ? 'skill-cat-option--active' : ''}" data-id="${c.id}">${escapeHtml(c.name)}</button>`)
                ].join('') : '<p class="text-muted skills-category-empty">No categories. Add one first.</p>';
                document.body.appendChild(pop);
                const close = () => { pop.remove(); document.removeEventListener('click', close); };
                setTimeout(() => document.addEventListener('click', close), 0);
                pop.querySelectorAll('.skill-cat-option').forEach(opt => {
                    opt.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const categoryId = opt.dataset.id || null;
                        try {
                            await api(`/skills/${btn.dataset.skillId}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
                            showToast('Category updated', 'success');
                            pop.remove();
                            renderSkills(container, path);
                        } catch (err) { showToast(err.message, 'error'); }
                    });
                });
            });
        });

        container.querySelector('#skills-manage-categories')?.addEventListener('click', () => renderSkillsCategoryManager(container, path, cats));

        container.querySelectorAll('[data-route]').forEach(el => {
            el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route); });
        });
        container.querySelectorAll('.btn-publish').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api('/hub/publish', { method: 'POST', body: JSON.stringify({ slug: btn.dataset.slug }) });
                    showToast('Published to Hub', 'success');
                } catch (err) { showToast(err.message, 'error'); }
                });
        });
    } catch (err) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(err.message)}</p></div>`;
    }
}

async function renderSkillsCategoryManager(container, path, categories) {
    const { showConfirm } = await import('../components/Dialog.js');
    const skillsRes = await api('/skills').catch(() => ({ data: [] }));
    const skills = skillsRes.data || [];
    const byCat = {};
    for (const s of skills) {
        const cid = (s.categoryIds || [])[0];
        if (cid) byCat[cid] = (byCat[cid] || 0) + 1;
    }
    let order = (categories || []).map(c => ({ id: c.id, name: c.name, count: byCat[c.id] || 0 }));
    const refreshList = () => {
        const list = content.querySelector('#category-list');
        list.innerHTML = order.length ? order.map((c, i) => `
            <div class="category-dnd-item" data-id="${c.id}" draggable="true">
                <span class="category-drag-handle">&#9776;</span>
                <input type="text" class="category-name-edit form-input form-input--sm" data-id="${c.id}" value="${escapeHtml(c.name)}" />
                <span class="badge badge-ghost">${c.count} skills</span>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-cat" data-id="${c.id}">Delete</button>
            </div>
        `).join('') : '<p class="text-muted skills-category-empty">No categories. Add one below.</p>';
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
                    bindCategoryHandlers();
                }
            });
        });
        bindCategoryHandlers();
    };
    const bindCategoryHandlers = () => {
        content.querySelectorAll('.category-name-edit').forEach(inp => {
            inp.replaceWith(inp.cloneNode(true));
        });
        content.querySelectorAll('.category-name-edit').forEach(inp => {
            inp.addEventListener('change', async () => {
                const name = inp.value.trim();
                if (!name) return;
                try {
                    await api(`/skills/categories/${inp.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
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
                const ok = await showConfirm({ title: 'Delete Category', message: 'Remove this category? Skills will become uncategorized.', confirmText: 'Delete', danger: true });
                if (!ok) return;
                try {
                    await api(`/skills/categories/${btn.dataset.id}`, { method: 'DELETE' });
                    order = order.filter(x => x.id !== btn.dataset.id);
                    refreshList();
                    showToast('Category deleted', 'success');
                } catch (e) { showToast(e.message, 'error'); }
            });
        });
    };
    const content = document.createElement('div');
    content.className = 'container';
    content.classList.add('skills-manager-modal-content');
    content.innerHTML = `
        <div class="card skills-manager-card">
            <h3 class="skills-manager-title">Manage Skill Categories</h3>
            <p class="text-muted skills-manager-subtitle">Drag to reorder. Click name to edit.</p>
            <div id="category-list" class="skills-manager-list"></div>
            <div class="skills-manager-actions">
                <input type="text" id="new-category-name" class="form-input" placeholder="New category name">
                <button type="button" class="btn btn-primary" id="add-category-btn">Add</button>
            </div>
            <button type="button" class="btn btn-ghost" id="close-category-manager">Done</button>
        </div>
    `;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.classList.add('skills-manager-modal');
    modal.appendChild(content);
    modal.addEventListener('click', (e) => { if (e.target === modal) { saveOrder(); modal.remove(); renderSkills(container, path); } });
    document.body.appendChild(modal);
    const saveOrder = async () => {
        try {
            await api('/skills/categories/reorder', { method: 'PUT', body: JSON.stringify({ order: order.map((o, i) => ({ id: o.id, sort_order: i })) }) });
        } catch (err) {
            console.debug('Failed to persist skills category order', err);
        }
    };
    refreshList();
    content.querySelector('#add-category-btn').addEventListener('click', async () => {
        const name = content.querySelector('#new-category-name').value.trim();
        if (!name) { showToast('Enter a category name', 'error'); return; }
        try {
            const { data } = await api('/skills/categories', { method: 'POST', body: JSON.stringify({ name }) });
            order.push({ id: data.id, name: data.name, count: 0 });
            content.querySelector('#new-category-name').value = '';
            refreshList();
            showToast('Category created', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    });
    content.querySelector('#close-category-manager').addEventListener('click', () => { saveOrder(); modal.remove(); renderSkills(container, path); });
}




async function renderSkillForm(container, slugOrId) {
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
    container.querySelector('[data-route]').addEventListener('click', (e) => { e.preventDefault(); navigate('/skills'); });
    container.querySelector('#skill-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const btn = f.querySelector('button[type="submit"]');
        btn.disabled = true;
        const body = { name: f.name.value, slug: (f.slug?.value || f.name.value).toLowerCase().replace(/\s+/g, '-'), description: f.description?.value || '', instructions: f.instructions?.value || '' };
        if (f.visibility) body.visibility = f.visibility.value;
        try {
            if (skill) await api(`/skills/${encodeURIComponent(skill.id)}`, { method: 'PUT', body: JSON.stringify(body) });
            else await api('/skills', { method: 'POST', body: JSON.stringify(body) });
            showToast(skill ? 'Skill updated' : 'Skill created', 'success');
            navigate('/skills');
        } catch (err) { showToast(err.message, 'error'); btn.disabled = false; }
    });
}

// â”€â”€â”€ Hub â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    return { skillCardHtml, renderSkills, renderSkillsCategoryManager, renderSkillForm };
}
