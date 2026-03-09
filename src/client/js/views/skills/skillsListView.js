export async function renderSkillsListView({
    container,
    path,
    api,
    navigate,
    showToast,
    escapeHtml,
    skillCardHtml,
    openCategoryManager,
    rerender
}) {
    try {
        const [{ data: skills }, { data: categories }] = await Promise.all([
            api('/skills'),
            api('/skills/categories').catch(() => ({ data: [] }))
        ]);
        const cats = categories || [];
        const bundled = (skills || []).filter((skill) => skill.source === 'bundled');
        const installed = (skills || []).filter((skill) => skill.source === 'installed');
        const mine = (skills || []).filter((skill) => skill.source === 'workspace');
        const allEditable = [...installed, ...mine];

        const byCategory = {};
        const uncategorized = [];
        for (const skill of allEditable) {
            const categoryId = (skill.categoryIds || [])[0];
            if (!categoryId) uncategorized.push(skill);
            else {
                if (!byCategory[categoryId]) byCategory[categoryId] = [];
                byCategory[categoryId].push(skill);
            }
        }

        const categorySectionsHtml = cats.map((cat) => {
            const items = byCategory[cat.id] || [];
            if (items.length === 0) return '';
            return `
                <details class="collapsible-section" open>
                    <summary class="collapsible-section__header">${escapeHtml(cat.name)} <span class="badge badge-ghost">${items.length}</span></summary>
                    <div class="collapsible-section__body">
                        <div class="card-grid">${items.map((skill) => skillCardHtml(skill, escapeHtml, true, cats)).join('')}</div>
                    </div>
                </details>
            `;
        }).join('');

        const uncategorizedSection = uncategorized.length ? `
            <details class="collapsible-section" open>
                <summary class="collapsible-section__header">Uncategorized <span class="badge badge-ghost">${uncategorized.length}</span></summary>
                <div class="collapsible-section__body">
                    <div class="card-grid">${uncategorized.map((skill) => skillCardHtml(skill, escapeHtml, true, cats)).join('')}</div>
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
                    <div class="card-grid">${bundled.map((skill) => skillCardHtml(skill, escapeHtml, false)).join('')}</div>
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

        container.querySelectorAll('.skill-category-arrow').forEach((button) => {
            button.addEventListener('click', async (event) => {
                event.stopPropagation();
                const skill = allEditable.find((item) => item.id === button.dataset.skillId);
                const currentCatId = (skill?.categoryIds || [])[0] || '';
                const rect = button.getBoundingClientRect();
                let pop = document.getElementById('skill-category-popover');
                if (pop) pop.remove();
                pop = document.createElement('div');
                pop.id = 'skill-category-popover';
                pop.className = 'skill-category-popover';
                pop.style.left = `${rect.left}px`;
                pop.style.top = `${rect.bottom + 4}px`;
                pop.innerHTML = cats.length ? [
                    `<button type="button" class="skill-cat-option ${!currentCatId ? 'skill-cat-option--active' : ''}" data-id="">No category</button>`,
                    ...cats.map((cat) => `<button type="button" class="skill-cat-option ${cat.id === currentCatId ? 'skill-cat-option--active' : ''}" data-id="${cat.id}">${escapeHtml(cat.name)}</button>`)
                ].join('') : '<p class="text-muted skills-category-empty">No categories. Add one first.</p>';
                document.body.appendChild(pop);
                const close = () => {
                    pop.remove();
                    document.removeEventListener('click', close);
                };
                setTimeout(() => document.addEventListener('click', close), 0);
                pop.querySelectorAll('.skill-cat-option').forEach((opt) => {
                    opt.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const categoryId = opt.dataset.id || null;
                        try {
                            await api(`/skills/${button.dataset.skillId}/category`, { method: 'PUT', body: JSON.stringify({ categoryId }) });
                            showToast('Category updated', 'success');
                            pop.remove();
                            await rerender(path);
                        } catch (error) {
                            showToast(error.message, 'error');
                        }
                    });
                });
            });
        });

        container.querySelector('#skills-manage-categories')?.addEventListener('click', () => openCategoryManager(cats));

        container.querySelectorAll('[data-route]').forEach((el) => {
            el.addEventListener('click', (event) => {
                event.preventDefault();
                navigate(el.dataset.route);
            });
        });

        container.querySelectorAll('.btn-publish').forEach((button) => {
            button.addEventListener('click', async () => {
                try {
                    const skill = mine.find((item) => item.id === button.dataset.skillId || item.slug === button.dataset.slug);
                    if (!skill) throw new Error('Skill not found');
                    let listingId = skill.market?.listingId || null;
                    if (!listingId) {
                        const created = await api('/catalog/skills', {
                            method: 'POST',
                            body: JSON.stringify({
                                assetId: skill.skillId || skill.id,
                                title: skill.name,
                                summary: skill.description || '',
                                description: skill.description || '',
                                visibility: skill.visibility === 'public' ? 'public' : 'private'
                            })
                        });
                        listingId = created?.data?.id || created?.data?.listingId || null;
                    } else {
                        await api(`/catalog/skills/${encodeURIComponent(listingId)}/revisions`, {
                            method: 'POST',
                            body: JSON.stringify({
                                title: skill.name,
                                summary: skill.description || '',
                                description: skill.description || ''
                            })
                        });
                    }
                    await api(`/catalog/skills/${encodeURIComponent(listingId)}/submit`, { method: 'POST', body: JSON.stringify({}) });
                    showToast('Listing created and submitted for review', 'success');
                    await rerender(path);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    } catch (error) {
        container.innerHTML = `<div class="container"><p class="text-muted">${escapeHtml(error.message)}</p></div>`;
    }
}
