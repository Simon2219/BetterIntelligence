import { buildTopbarHtml } from '../../components/AppShellMarkup.js';

export function createTopBarView({
    state,
    navigate,
    logout,
    escapeHtml,
    renderNotificationsUI,
    acknowledgeNotification,
    acknowledgeAllNotifications
} = {}) {
    function renderTopBar(topbar, currentUser) {
        if (!topbar || !currentUser) return;
        if (topbar.dataset.initialized === '1') return;
        topbar.innerHTML = buildTopbarHtml({ currentUser, escapeHtml });
        topbar.dataset.initialized = '1';
    }

    function bindTopBarRouteLinks(root) {
        root.querySelectorAll('[data-route]').forEach((element) => {
            if (element.dataset.routeBound === '1') return;
            element.dataset.routeBound = '1';
            element.addEventListener('click', (event) => {
                event.preventDefault();
                if (element.classList.contains('topbar__logo')) {
                    element.classList.add('topbar__logo--clicked');
                    setTimeout(() => element.classList.remove('topbar__logo--clicked'), 550);
                }
                navigate(element.dataset.route);
            });
        });
    }

    function bindTopBarControls() {
        const notificationsBtn = document.getElementById('notifications-btn');
        const notificationsDropdown = document.getElementById('notifications-dropdown');
        const notificationsList = document.getElementById('topbar-notifications-list');
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');

        if (notificationsBtn && notificationsDropdown && notificationsList && !notificationsBtn.dataset.bound) {
            notificationsBtn.dataset.bound = '1';
            notificationsBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const open = notificationsDropdown.classList.contains('topbar__dropdown--hidden');
                notificationsDropdown.classList.toggle('topbar__dropdown--hidden', !open);
                profileDropdown?.classList.add('topbar__dropdown--hidden');
                if (open) {
                    const close = () => {
                        notificationsDropdown.classList.add('topbar__dropdown--hidden');
                        document.removeEventListener('click', close);
                    };
                    setTimeout(() => document.addEventListener('click', close), 0);
                }
            });

            notificationsList.addEventListener('click', (event) => {
                const readAllBtn = event.target.closest('[data-read-all-notifications]');
                if (readAllBtn) {
                    acknowledgeAllNotifications();
                    return;
                }
                const ackBtn = event.target.closest('[data-ack-notification]');
                if (ackBtn) {
                    const row = ackBtn.closest('[data-notification-id]');
                    if (!row) return;
                    acknowledgeNotification(row.getAttribute('data-notification-id'));
                    return;
                }
                const toggleBtn = event.target.closest('[data-toggle-notification]');
                if (!toggleBtn) return;
                const row = toggleBtn.closest('[data-notification-id]');
                if (!row) return;
                const notificationId = row.getAttribute('data-notification-id');
                if (!notificationId) return;
                const expandedIds = state.getNotificationExpandedIds();
                if (expandedIds.has(notificationId)) expandedIds.delete(notificationId);
                else expandedIds.add(notificationId);
                renderNotificationsUI();
            });
        }

        if (profileBtn && profileDropdown && !profileBtn.dataset.bound) {
            profileBtn.dataset.bound = '1';
            profileBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const open = profileDropdown.classList.contains('topbar__dropdown--hidden');
                profileDropdown.classList.toggle('topbar__dropdown--hidden', !open);
                notificationsDropdown?.classList.add('topbar__dropdown--hidden');
                if (open) {
                    const close = () => {
                        profileDropdown.classList.add('topbar__dropdown--hidden');
                        document.removeEventListener('click', close);
                    };
                    setTimeout(() => document.addEventListener('click', close), 0);
                }
            });
            profileDropdown.querySelector('[data-route="/settings"]')?.addEventListener('click', (event) => {
                event.preventDefault();
                profileDropdown.classList.add('topbar__dropdown--hidden');
                navigate('/settings');
            });
            profileDropdown.querySelector('[data-action="logout"]')?.addEventListener('click', () => {
                profileDropdown.classList.add('topbar__dropdown--hidden');
                logout();
            });
        }
    }

    return {
        renderTopBar,
        bindTopBarRouteLinks,
        bindTopBarControls
    };
}
