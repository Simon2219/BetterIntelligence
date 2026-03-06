export async function renderSkillsCategoryManagerView({
    container,
    path,
    categories,
    api,
    showToast,
    escapeHtml,
    rerender
}) {
    const { showConfirm } = await import('../../components/Dialog.js');
    const skillsRes = await api('/skills').catch(() => ({ data: [] }));
    const skills = skillsRes.data || [];
    const byCat = {};
    for (const skill of skills) {
        const categoryId = (skill.categoryIds || [])[0];
        if (categoryId) byCat[categoryId] = (byCat[categoryId] || 0) + 1;
    }

    let order = (categories || []).map((cat) => ({ id: cat.id, name: cat.name, count: byCat[cat.id] || 0 }));

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

    const saveOrder = async () => {
        try {
            await api('/skills/categories/reorder', {
                method: 'PUT',
                body: JSON.stringify({ order: order.map((item, index) => ({ id: item.id, sort_order: index })) })
            });
        } catch (error) {
            console.debug('Failed to persist skills category order', error);
        }
    };

    const bindCategoryHandlers = () => {
        content.querySelectorAll('.category-name-edit').forEach((inp) => {
            inp.replaceWith(inp.cloneNode(true));
        });
        content.querySelectorAll('.category-name-edit').forEach((inp) => {
            inp.addEventListener('change', async () => {
                const name = inp.value.trim();
                if (!name) return;
                try {
                    await api(`/skills/categories/${inp.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
                    const found = order.find((item) => item.id === inp.dataset.id);
                    if (found) found.name = name;
                    showToast('Category renamed', 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });

        content.querySelectorAll('.btn-delete-cat').forEach((btn) => {
            btn.replaceWith(btn.cloneNode(true));
        });
        content.querySelectorAll('.btn-delete-cat').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const ok = await showConfirm({
                    title: 'Delete Category',
                    message: 'Remove this category? Skills will become uncategorized.',
                    confirmText: 'Delete',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api(`/skills/categories/${btn.dataset.id}`, { method: 'DELETE' });
                    order = order.filter((item) => item.id !== btn.dataset.id);
                    refreshList();
                    showToast('Category deleted', 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    };

    const refreshList = () => {
        const list = content.querySelector('#category-list');
        list.innerHTML = order.length ? order.map((cat) => `
            <div class="category-dnd-item" data-id="${cat.id}" draggable="true">
                <span class="category-drag-handle">&#9776;</span>
                <input type="text" class="category-name-edit form-input form-input--sm" data-id="${cat.id}" value="${escapeHtml(cat.name)}" />
                <span class="badge badge-ghost">${cat.count} skills</span>
                <button type="button" class="btn btn-ghost btn-sm btn-delete-cat" data-id="${cat.id}">Delete</button>
            </div>
        `).join('') : '<p class="text-muted skills-category-empty">No categories. Add one below.</p>';

        list.querySelectorAll('.category-dnd-item').forEach((row) => {
            row.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text', row.dataset.id);
                row.classList.add('category-dragging');
            });
            row.addEventListener('dragend', () => row.classList.remove('category-dragging'));
            row.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            });
            row.addEventListener('drop', (event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text');
                const from = order.findIndex((item) => item.id === id);
                const to = order.findIndex((item) => item.id === row.dataset.id);
                if (from >= 0 && to >= 0 && from !== to) {
                    const [removed] = order.splice(from, 1);
                    order.splice(to, 0, removed);
                    refreshList();
                    bindCategoryHandlers();
                }
            });
        });

        bindCategoryHandlers();
    };

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            saveOrder();
            modal.remove();
            rerender(path);
        }
    });

    document.body.appendChild(modal);
    refreshList();

    content.querySelector('#add-category-btn').addEventListener('click', async () => {
        const name = content.querySelector('#new-category-name').value.trim();
        if (!name) {
            showToast('Enter a category name', 'error');
            return;
        }
        try {
            const { data } = await api('/skills/categories', { method: 'POST', body: JSON.stringify({ name }) });
            order.push({ id: data.id, name: data.name, count: 0 });
            content.querySelector('#new-category-name').value = '';
            refreshList();
            showToast('Category created', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    content.querySelector('#close-category-manager').addEventListener('click', () => {
        saveOrder();
        modal.remove();
        rerender(path);
    });
}
