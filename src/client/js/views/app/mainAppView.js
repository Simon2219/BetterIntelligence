import { createMainContentHostView } from './mainAppContentHostView.js';
import { createTopBarView } from './mainAppTopBarView.js';
import { createSidebarView } from './mainAppSidebarView.js';

export function createMainAppView({
    state,
    navigate,
    logout,
    escapeHtml,
    ensureSocket,
    bindNotificationsSocket,
    bootstrapNotifications,
    updateChatUnreadBadge,
    renderNotificationsUI,
    acknowledgeNotification,
    acknowledgeAllNotifications
} = {}) {
    const contentHostView = createMainContentHostView();
    const topBarView = createTopBarView({
        state,
        navigate,
        logout,
        escapeHtml,
        renderNotificationsUI,
        acknowledgeNotification,
        acknowledgeAllNotifications
    });
    const sidebarView = createSidebarView({ navigate });

    function renderMainAppView() {
        const app = document.getElementById('app');
        const main = app.querySelector('.main');
        const toastContainer = document.getElementById('toast-container');
        const currentUser = state.getCurrentUser();

        if (!currentUser) {
            contentHostView.teardownHost(app);
            return;
        }

        const { layout, topbar, body, sidebarWrap, sidebar } = contentHostView.ensureHost({
            app,
            main,
            toastContainer
        });

        topBarView.renderTopBar(topbar, currentUser);
        topBarView.bindTopBarRouteLinks(topbar);
        topBarView.bindTopBarControls();

        const path = location.pathname || '/';
        const canAccessAdmin = currentUser.role?.is_admin || currentUser.role?.can_access_admin;
        sidebarView.renderSidebar(sidebar, { path, canAccessAdmin });
        sidebarView.bindSidebarRouteLinks(sidebar);

        contentHostView.attachMainToBody({ main, body });
        sidebarView.applySidebarSizing(body, sidebarWrap);

        renderNotificationsUI?.();
        ensureSocket?.();
        bindNotificationsSocket?.();
        bootstrapNotifications?.();
        updateChatUnreadBadge?.();
    }

    return {
        renderMainAppView
    };
}
