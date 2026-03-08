export function bindHubSidebarControls({
    container,
    groupState,
    setGroupState,
    getSidebarState,
    setSidebarState,
    clampSidebarWidth,
    navigate,
    createChatForAgent
} = {}) {
    container.querySelectorAll('.chat-hub__group').forEach((group) => {
        const list = group.querySelector('.chat-hub__group-list');
        const collapsed = list?.classList.contains('chat-hub__group-list--collapsed') === true;
        group.classList.toggle('chat-hub__group--collapsed', collapsed);
        group.classList.toggle('chat-hub__group--expanded', !collapsed);
    });

    container.querySelectorAll('[data-toggle-group]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-toggle-group');
            if (!id) return;
            const body = container.querySelector(`[data-group-list="${id}"]`);
            const chev = btn.querySelector('.chat-hub__group-chevron');
            const group = btn.closest('.chat-hub__group');
            if (!body || !chev) return;
            const collapsed = body.classList.toggle('chat-hub__group-list--collapsed');
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            chev.classList.toggle('chat-hub__group-chevron--expanded', !collapsed);
            chev.classList.toggle('chat-hub__group-chevron--collapsed', collapsed);
            if (group) {
                group.classList.toggle('chat-hub__group--collapsed', collapsed);
                group.classList.toggle('chat-hub__group--expanded', !collapsed);
            }
            groupState.map[id] = !collapsed;
            setGroupState(groupState);
        });
    });

    const sidebar = container.querySelector('#chat-sidebar');
    const sidebarResizer = container.querySelector('#chat-sidebar-resize');
    const sidebarFlap = container.querySelector('#chat-sidebar-flap');
    const sidebarFlapIcon = container.querySelector('#chat-sidebar-flap-icon');
    const sidebarState = getSidebarState();
    const isMobile = window.matchMedia('(max-width: 52em)').matches;

    const applySidebarState = () => {
        if (!sidebar) return;
        if (isMobile) {
            sidebar.classList.remove('chat-hub__sidebar--collapsed', 'chat-hub__sidebar--resizing');
            sidebar.style.removeProperty('--chat-sidebar-width');
            if (sidebarFlap) sidebarFlap.style.display = 'none';
            if (sidebarResizer) sidebarResizer.style.display = 'none';
            return;
        }

        sidebarState.width = clampSidebarWidth(sidebarState.width);
        sidebar.classList.toggle('chat-hub__sidebar--collapsed', sidebarState.collapsed === true);
        sidebar.style.setProperty('--chat-sidebar-width', `${sidebarState.width}px`);

        if (sidebarFlap) {
            sidebarFlap.style.display = '';
            sidebarFlap.classList.toggle('chat-hub__sidebar-flap--collapsed', sidebarState.collapsed === true);
            sidebarFlap.style.left = `${sidebarState.collapsed ? 0 : (sidebarState.width - 1)}px`;
        }
        sidebarFlapIcon?.classList.toggle('chat-hub__sidebar-flap-icon--collapsed', sidebarState.collapsed === true);
        if (sidebarResizer) sidebarResizer.style.display = '';
    };

    sidebarFlap?.addEventListener('click', () => {
        sidebarState.collapsed = !sidebarState.collapsed;
        setSidebarState(sidebarState);
        applySidebarState();
    });

    sidebarResizer?.addEventListener('mousedown', (event) => {
        if (isMobile || sidebarState.collapsed) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = sidebarState.width;
        sidebar?.classList.add('chat-hub__sidebar--resizing');

        const onMove = (moveEvent) => {
            const width = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
            sidebarState.width = width;
            applySidebarState();
        };
        const onUp = () => {
            sidebar?.classList.remove('chat-hub__sidebar--resizing');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            setSidebarState(sidebarState);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    applySidebarState();

    const newChatWrap = container.querySelector('#chat-new-chat');
    const newChatPanel = container.querySelector('#chat-new-chat-panel');
    const newChatButton = container.querySelector('#new-chat-btn');
    const newChatSearch = container.querySelector('#chat-new-chat-search');
    const newChatList = container.querySelector('#chat-new-chat-list');

    const closeNewChatPanel = () => {
        if (!newChatPanel) return;
        newChatPanel.classList.remove('chat-hub__new-chat-panel--open');
        newChatPanel.setAttribute('aria-hidden', 'true');
        newChatWrap?.classList.remove('chat-hub__new-chat--open');
        newChatButton?.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onOutside);
        document.removeEventListener('keydown', onEscape);
    };
    const openNewChatPanel = () => {
        if (!newChatPanel) return;
        newChatPanel.classList.add('chat-hub__new-chat-panel--open');
        newChatPanel.setAttribute('aria-hidden', 'false');
        newChatWrap?.classList.add('chat-hub__new-chat--open');
        newChatButton?.setAttribute('aria-expanded', 'true');
        setTimeout(() => newChatSearch?.focus(), 120);
        setTimeout(() => {
            document.addEventListener('click', onOutside);
            document.addEventListener('keydown', onEscape);
        }, 0);
    };
    const onOutside = (event) => {
        if (!newChatWrap?.contains(event.target) && !newChatButton?.contains(event.target)) closeNewChatPanel();
    };
    const onEscape = (event) => {
        if (event.key === 'Escape') closeNewChatPanel();
    };

    newChatButton?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (newChatPanel?.classList.contains('chat-hub__new-chat-panel--open')) closeNewChatPanel();
        else openNewChatPanel();
    });

    newChatSearch?.addEventListener('input', () => {
        const q = (newChatSearch.value || '').trim().toLowerCase();
        newChatList?.querySelectorAll('.chat-hub__new-chat-item').forEach((item) => {
            const txt = item.textContent?.toLowerCase() || '';
            item.style.display = !q || txt.includes(q) ? '' : 'none';
        });
    });

    newChatList?.querySelectorAll('.chat-hub__new-chat-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
            closeNewChatPanel();
            try { await createChatForAgent(btn.dataset.agent); } catch {}
        });
    });
}
