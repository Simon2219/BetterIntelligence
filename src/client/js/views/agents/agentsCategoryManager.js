export async function renderAgentsCategoryManager({
    container,
    categories = [],
    api,
    showToast,
    escapeHtml,
    onDone
} = {}) {
    const { showConfirm } = await import('../../components/Dialog.js');
    let order = (categories || []).map((category) => ({
        id: category.id,
        name: category.name,
        count: category.agentCount ?? 0
    }));

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

    const bindAgentCategoryHandlers = () => {
        content.querySelectorAll('.category-name-edit').forEach((input) => {
            input.replaceWith(input.cloneNode(true));
        });
        content.querySelectorAll('.category-name-edit').forEach((input) => {
            input.addEventListener('change', async () => {
                const name = input.value.trim();
                if (!name) return;
                try {
                    await api(`/agents/categories/${input.dataset.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ name })
                    });
                    const found = order.find((item) => item.id === input.dataset.id);
                    if (found) found.name = name;
                    showToast('Category renamed', 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });

        content.querySelectorAll('.btn-delete-cat').forEach((button) => {
            button.replaceWith(button.cloneNode(true));
        });
        content.querySelectorAll('.btn-delete-cat').forEach((button) => {
            button.addEventListener('click', async () => {
                const ok = await showConfirm({
                    title: 'Delete Category',
                    message: 'Remove this category? Agents will become uncategorized.',
                    confirmText: 'Delete',
                    danger: true
                });
                if (!ok) return;
                try {
                    await api(`/agents/categories/${button.dataset.id}`, { method: 'DELETE' });
                    order = order.filter((item) => item.id !== button.dataset.id);
                    refreshList();
                    showToast('Category deleted', 'success');
                } catch (error) {
                    showToast(error.message, 'error');
                }
            });
        });
    };

    const refreshList = () => {
        const list = content.querySelector('#agent-category-list');
        list.innerHTML = order.length
            ? order.map((category) => `
                <div class="category-dnd-item" data-id="${category.id}" draggable="true">
                    <span class="category-drag-handle">&#9776;</span>
                    <input type="text" class="category-name-edit form-input form-input--sm" data-id="${category.id}" value="${escapeHtml(category.name)}" />
                    <span class="badge badge-ghost">${category.count} agents</span>
                    <button type="button" class="btn btn-ghost btn-sm btn-delete-cat" data-id="${category.id}">Delete</button>
                </div>
            `).join('')
            : '<p class="text-muted agent-category-manager__empty">No categories. Add one below.</p>';

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
                const fromIndex = order.findIndex((item) => item.id === id);
                const toIndex = order.findIndex((item) => item.id === row.dataset.id);
                if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
                const [removed] = order.splice(fromIndex, 1);
                order.splice(toIndex, 0, removed);
                refreshList();
                bindAgentCategoryHandlers();
            });
        });

        bindAgentCategoryHandlers();
    };

    const modal = document.createElement('div');
    modal.className = 'agent-category-manager__modal';
    modal.appendChild(content);
    document.body.appendChild(modal);

    const saveOrder = async () => {
        try {
            await api('/agents/categories/reorder', {
                method: 'PUT',
                body: JSON.stringify({
                    order: order.map((entry, index) => ({ id: entry.id, sort_order: index }))
                })
            });
        } catch (error) {
            console.debug('Failed to persist agent category order', error);
        }
    };

    const closeAndRefresh = async () => {
        await saveOrder();
        modal.remove();
        if (typeof onDone === 'function') {
            await onDone();
        }
    };

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeAndRefresh();
        }
    });

    content.querySelector('#add-agent-category-btn').addEventListener('click', async () => {
        const input = content.querySelector('#new-agent-category-name');
        const name = input.value.trim();
        if (!name) {
            showToast('Enter a category name', 'error');
            return;
        }
        try {
            const { data } = await api('/agents/categories', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            order.push({ id: data.id, name: data.name, count: 0 });
            input.value = '';
            refreshList();
            showToast('Category created', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    content.querySelector('#close-agent-category-manager').addEventListener('click', () => {
        closeAndRefresh();
    });

    refreshList();
}
