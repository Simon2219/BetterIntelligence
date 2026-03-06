export function bindAgentsListEvents({
    container,
    data,
    api,
    navigate,
    showToast,
    showConfirm,
    escapeHtml,
    renderAgents,
    renderAgentsCategoryManager
} = {}) {
    const {
        allTags,
        categories,
        categoryFilter,
        agentMap
    } = data;

    container.querySelector('#agent-tag-filter')?.addEventListener('change', (event) => {
        const value = event.target.value;
        const url = new URL(location.href);
        if (value) url.searchParams.set('tag', value);
        else url.searchParams.delete('tag');
        navigate(url.pathname + url.search);
    });

    container.querySelector('#agents-category-arrow')?.addEventListener('click', (event) => {
        event.stopPropagation();
        const btn = event.currentTarget;
        const sub = document.getElementById('agents-category-submenu');
        if (!sub) return;
        const closeSub = () => {
            sub.classList.remove('agents-category-submenu--open');
            document.removeEventListener('click', closeSub);
        };
        if (sub.classList.contains('agents-category-submenu--open')) {
            closeSub();
            return;
        }
        sub.classList.add('agents-category-submenu--open');
        sub.innerHTML = `
            <button type="button" class="agents-submenu-item" data-action="manage">Manage Categories</button>
            <button type="button" class="agents-submenu-item" data-action="filter">Filter by Category</button>
        `;
        sub.style.left = `${btn.getBoundingClientRect().left}px`;
        sub.style.top = `${btn.getBoundingClientRect().bottom + 4}px`;
        setTimeout(() => document.addEventListener('click', closeSub), 0);
        sub.querySelector('[data-action="manage"]').addEventListener('click', (ev) => {
            ev.stopPropagation();
            sub.classList.remove('agents-category-submenu--open');
            document.removeEventListener('click', closeSub);
            renderAgentsCategoryManager(container, categories);
        });
        sub.querySelector('[data-action="filter"]').addEventListener('click', (ev) => {
            ev.stopPropagation();
            sub.classList.remove('agents-category-submenu--open');
            document.removeEventListener('click', closeSub);
            let pop = document.getElementById('agent-filter-category-popover');
            if (pop) pop.remove();
            pop = document.createElement('div');
            pop.id = 'agent-filter-category-popover';
            pop.className = 'agent-category-popover agent-category-popover--wide';
            pop.style.left = `${btn.getBoundingClientRect().left}px`;
            pop.style.top = `${btn.getBoundingClientRect().bottom + 4}px`;
            pop.innerHTML = [
                `<button type="button" class="agent-cat-option ${!categoryFilter ? 'agent-cat-option--active' : ''}" data-id="">All categories</button>`,
                ...categories.map((category) => `<button type="button" class="agent-cat-option ${category.id === categoryFilter ? 'agent-cat-option--active' : ''}" data-id="${category.id}">${escapeHtml(category.name)}</button>`)
            ].join('');
            document.body.appendChild(pop);
            const closePop = () => {
                pop.remove();
                document.removeEventListener('click', closePop);
            };
            setTimeout(() => document.addEventListener('click', closePop), 0);
            pop.querySelectorAll('.agent-cat-option').forEach((opt) => {
                opt.addEventListener('click', (ev2) => {
                    ev2.stopPropagation();
                    const catId = opt.dataset.id || '';
                    const url = new URL(location.href);
                    if (catId) url.searchParams.set('category', catId);
                    else url.searchParams.delete('category');
                    navigate(url.pathname + url.search);
                    pop.remove();
                    document.removeEventListener('click', closePop);
                });
            });
        });
    });

    container.querySelector('#clear-category-filter')?.addEventListener('click', (event) => {
        event.preventDefault();
        const url = new URL(location.href);
        url.searchParams.delete('category');
        navigate(url.pathname + url.search);
    });

    container.querySelectorAll('.agent-category-arrow').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const agentId = btn.dataset.agentId;
            const agent = agentMap.get(agentId);
            const currentCategoryId = (agent?.categoryIds || [])[0] || '';
            const rect = btn.getBoundingClientRect();
            let sub = document.getElementById('agent-card-submenu');
            if (sub) sub.remove();
            sub = document.createElement('div');
            sub.id = 'agent-card-submenu';
            sub.className = 'agent-card-submenu';
            sub.style.left = `${rect.left}px`;
            sub.style.top = `${rect.bottom + 4}px`;
            sub.innerHTML = '<button type="button" class="agent-submenu-item" data-action="change-category">Change Category</button>';
            document.body.appendChild(sub);
            const closeSub = () => {
                sub.remove();
                document.removeEventListener('click', closeSub);
            };
            setTimeout(() => document.addEventListener('click', closeSub), 0);
            sub.querySelector('[data-action="change-category"]').addEventListener('click', (ev) => {
                ev.stopPropagation();
                sub.remove();
                document.removeEventListener('click', closeSub);
                let pop = document.getElementById('agent-category-popover');
                if (pop) pop.remove();
                pop = document.createElement('div');
                pop.id = 'agent-category-popover';
                pop.className = 'agent-category-popover';
                pop.style.left = `${rect.left}px`;
                pop.style.top = `${rect.bottom + 4}px`;
                pop.innerHTML = categories.length
                    ? [
                        `<button type="button" class="agent-cat-option ${!currentCategoryId ? 'agent-cat-option--active' : ''}" data-id="">No category</button>`,
                        ...categories.map((category) => `<button type="button" class="agent-cat-option ${category.id === currentCategoryId ? 'agent-cat-option--active' : ''}" data-id="${category.id}">${escapeHtml(category.name)}</button>`)
                    ].join('')
                    : '<p class="text-muted agent-category-popover__empty">No categories. Add one first.</p>';
                document.body.appendChild(pop);
                const closePop = () => {
                    pop.remove();
                    document.removeEventListener('click', closePop);
                };
                setTimeout(() => document.addEventListener('click', closePop), 0);
                pop.querySelectorAll('.agent-cat-option').forEach((opt) => {
                    opt.addEventListener('click', async (ev2) => {
                        ev2.stopPropagation();
                        const categoryId = opt.dataset.id || null;
                        try {
                            await api(`/agents/${agentId}/category`, {
                                method: 'PUT',
                                body: JSON.stringify({ categoryId })
                            });
                            showToast('Category updated', 'success');
                            pop.remove();
                            document.removeEventListener('click', closePop);
                            renderAgents(container, '/agents');
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    });
                });
            });
        });
    });

    if (categories.length) {
        container.querySelectorAll('.agent-card--draggable').forEach((card) => {
            card.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', card.dataset.agentId);
                event.dataTransfer.effectAllowed = 'move';
                card.classList.add('agent-card-dragging');
            });
            card.addEventListener('dragend', () => card.classList.remove('agent-card-dragging'));
        });
        container.querySelectorAll('.agents-category-drop').forEach((zone) => {
            const cardsEl = zone.querySelector('.agents-category-cards');
            if (!cardsEl) return;
            zone.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                zone.classList.add('agents-category-drop--over');
            });
            zone.addEventListener('dragleave', (event) => {
                if (!zone.contains(event.relatedTarget)) zone.classList.remove('agents-category-drop--over');
            });
            zone.addEventListener('drop', async (event) => {
                event.preventDefault();
                zone.classList.remove('agents-category-drop--over');
                const agentId = event.dataTransfer.getData('text/plain');
                if (!agentId) return;
                const categoryId = zone.dataset.categoryId || null;
                const agent = agentMap.get(agentId);
                if (!agent?.isOwner) return;
                const currentCategoryId = (agent.categoryIds || [])[0] || null;
                if (currentCategoryId === categoryId) return;
                try {
                    await api(`/agents/${agentId}/category`, {
                        method: 'PUT',
                        body: JSON.stringify({ categoryId })
                    });
                    showToast('Agent moved', 'success');
                    renderAgents(container, '/agents');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    container.querySelectorAll('[data-route]').forEach((el) => {
        el.addEventListener('click', (event) => {
            event.preventDefault();
            navigate(el.dataset.route);
        });
    });

    container.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const ok = await showConfirm({
                title: 'Delete Agent',
                message: 'This will permanently delete the agent and all conversations.',
                confirmText: 'Delete',
                cancelText: 'Cancel',
                danger: true
            });
            if (!ok) return;
            try {
                await api(`/agents/${btn.dataset.id}`, { method: 'DELETE' });
                showToast('Agent deleted', 'success');
                renderAgents(container, '/agents');
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });

    container.querySelectorAll('.btn-copy-agent').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            try {
                const { data: created } = await api('/agents', {
                    method: 'POST',
                    body: JSON.stringify({ copyFrom: btn.dataset.id })
                });
                showToast('Agent copied!', 'success');
                navigate(`/agents/${created.id}`);
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    });
}
