function isActiveRoute(path, route) {
    return path === route || path.startsWith(`${route}/`);
}

export function buildTopbarHtml({ currentUser, escapeHtml }) {
    const avatarUrl = currentUser?.avatar_url || currentUser?.avatarUrl || '';
    const initial = (currentUser?.display_name || currentUser?.username || 'U')[0];
    return `
        <button class="topbar__logo" type="button" data-route="/agents" title="Go to Agents">
            <span class="topbar__logo-word">Better</span><span class="topbar__logo-word topbar__logo-word--accent">Intelligence</span><span class="topbar__logo-dot">&bull;</span>
        </button>
        <div class="topbar__spacer"></div>
        <div class="topbar__notifications">
            <button class="topbar__icon-btn" id="notifications-btn" type="button" title="Notifications" aria-haspopup="true" aria-label="Notifications">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"></path>
                    <path d="M9 17a3 3 0 0 0 6 0"></path>
                </svg>
                <span id="topbar-notifications-badge" class="topbar__notif-badge topbar__notif-badge--hidden">0</span>
            </button>
            <div class="topbar__dropdown topbar__dropdown--hidden topbar__dropdown--notifications" id="notifications-dropdown">
                <div class="topbar__notifications-list" id="topbar-notifications-list"></div>
            </div>
        </div>
        <div class="topbar__profile">
            <button class="topbar__avatar-btn" id="profile-btn" title="Profile" aria-haspopup="true">
                ${avatarUrl ? `<img class="topbar__avatar" src="${escapeHtml(avatarUrl)}" alt="">` : `<span class="topbar__avatar topbar__avatar--fallback">${escapeHtml(initial)}</span>`}
            </button>
            <div class="topbar__dropdown topbar__dropdown--hidden" id="profile-dropdown">
                <a href="#" data-route="/settings">Settings</a>
                <button type="button" data-action="logout">Logout</button>
            </div>
        </div>
    `;
}

export function buildSidebarHtml({ path, canAccessAdmin }) {
    return `
        <nav class="sidebar__nav">
            <div class="sidebar__section">
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/chat') ? 'sidebar__link--active' : ''}" data-route="/chat">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Chat
                    <span id="chat-unread-badge" class="sidebar__badge sidebar__badge--hidden">0</span>
                </a>
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/agents') ? 'sidebar__link--active' : ''}" data-route="/agents">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>
                    Agents
                </a>
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/agentBuilder') ? 'sidebar__link--active' : ''}" data-route="/agentBuilder">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    Agent Builder
                </a>
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/skills') ? 'sidebar__link--active' : ''}" data-route="/skills">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                    Skills
                </a>
            </div>
            <div class="sidebar__divider"></div>
            <div class="sidebar__section">
                <div class="sidebar__section-label">Community</div>
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/hub') ? 'sidebar__link--active' : ''}" data-route="/hub">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Hub
                </a>
            </div>
            <div class="sidebar__divider"></div>
            <div class="sidebar__section">
                <div class="sidebar__section-label">Tools</div>
                <a href="#" class="sidebar__link ${isActiveRoute(path, '/deploy') ? 'sidebar__link--active' : ''}" data-route="/deploy">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9M8 17l4 4 4-4"/></svg>
                    Deploy
                </a>
            </div>
        </nav>
        <div class="sidebar__footer">
            ${canAccessAdmin ? `
            <a href="#" class="sidebar__link sidebar__link--footer ${isActiveRoute(path, '/admin') ? 'sidebar__link--active' : ''}" data-route="/admin">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                Admin Panel
            </a>
            ` : ''}
        </div>
    `;
}

export function ensureAppShellLayout({ app, main, toastContainer }) {
    let layout = app.querySelector('.app-layout');
    if (!layout) {
        layout = document.createElement('div');
        layout.className = 'app-layout';
        app.insertBefore(layout, main || toastContainer);
    }

    let topbar = layout.querySelector('.topbar');
    if (!topbar) {
        topbar = document.createElement('header');
        topbar.className = 'topbar';
        layout.appendChild(topbar);
    }

    let body = layout.querySelector('.app-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'app-body';
        layout.appendChild(body);
    }

    let sidebarWrap = body.querySelector('.sidebar-wrap');
    if (!sidebarWrap) {
        sidebarWrap = document.createElement('div');
        sidebarWrap.className = 'sidebar-wrap';
        body.insertBefore(sidebarWrap, body.querySelector('.main'));
    }

    let sidebar = sidebarWrap.querySelector('.sidebar');
    if (!sidebar) {
        sidebar = document.createElement('aside');
        sidebar.className = 'sidebar';
        sidebar.id = 'main-sidebar';
        sidebarWrap.appendChild(sidebar);
    }

    return { layout, topbar, body, sidebarWrap, sidebar };
}

export function teardownAppShellLayout(app) {
    const layout = app.querySelector('.app-layout');
    if (!layout) return;
    const main = layout.querySelector('.main');
    if (main) {
        main.classList.remove('main__content');
        app.insertBefore(main, layout);
    }
    layout.remove();
}
