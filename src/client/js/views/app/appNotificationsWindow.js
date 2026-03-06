import { renderNotificationsListHtml } from '../../components/NotificationsMarkup.js';

export function createAppNotificationsWindow({
    api,
    escapeHtml,
    showToast,
    ensureSocketClients,
    state
} = {}) {
    function renderNotificationsUI() {
        const unreadCount = state.getNotificationUnreadCount();
        const items = state.getNotificationItems();
        const expandedIds = state.getNotificationExpandedIds();

        const badge = document.getElementById('topbar-notifications-badge');
        if (badge) {
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.classList.toggle('topbar__notif-badge--hidden', unreadCount <= 0);
        }

        const list = document.getElementById('topbar-notifications-list');
        if (!list) return;
        list.innerHTML = renderNotificationsListHtml({
            items,
            expandedIds,
            escapeHtml
        });
    }

    function setNotificationsState(payload) {
        const notifications = Array.isArray(payload?.notifications) ? payload.notifications : null;
        if (notifications) state.setNotificationItems(notifications);
        if (Number.isFinite(Number(payload?.unreadCount))) {
            state.setNotificationUnreadCount(Number(payload.unreadCount));
        }
        renderNotificationsUI();
    }

    async function bootstrapNotifications() {
        if (!state.getCurrentUser() || state.isNotificationsLoaded()) return;
        state.setNotificationsLoaded(true);
        try {
            const { data } = await api('/users/me/notifications?limit=20');
            setNotificationsState({
                notifications: data?.notifications || [],
                unreadCount: data?.unreadCount || 0
            });
        } catch {
            state.setNotificationsLoaded(false);
        }
    }

    async function acknowledgeNotification(notificationId) {
        const id = String(notificationId || '').trim();
        if (!id) return;
        try {
            const { data } = await api(`/users/me/notifications/${encodeURIComponent(id)}/ack`, { method: 'POST' });
            state.setNotificationItems(
                state.getNotificationItems().map((item) => (item.id === id ? { ...item, read: true } : item))
            );
            if (Number.isFinite(Number(data?.unreadCount))) {
                state.setNotificationUnreadCount(Number(data.unreadCount));
            }
            renderNotificationsUI();
            ensureSocketClients()?.getNotificationsSocket?.()?.emit('notifications:ack', { notificationId: id });
        } catch (err) {
            showToast?.(err.message || 'Failed to acknowledge notification', 'error');
        }
    }

    async function acknowledgeAllNotifications() {
        try {
            const { data } = await api('/users/me/notifications/read-all', { method: 'POST' });
            state.setNotificationItems(state.getNotificationItems().map((item) => ({ ...item, read: true })));
            if (Number.isFinite(Number(data?.unreadCount))) {
                state.setNotificationUnreadCount(Number(data.unreadCount));
            }
            renderNotificationsUI();
            ensureSocketClients()?.getNotificationsSocket?.()?.emit('notifications:ack_all', {});
        } catch (err) {
            showToast?.(err.message || 'Failed to mark notifications as read', 'error');
        }
    }

    function bindNotificationsSocket() {
        if (!state.getCurrentUser()) return;
        const socket = ensureSocketClients()?.getNotificationsSocket?.();
        if (!socket || state.isNotificationsSocketBound()) return;

        state.setNotificationsSocketBound(true);
        socket.on('connect', () => socket.emit('notifications:subscribe', {}));
        socket.on('notifications:new', (payload) => {
            if (!payload || !payload.id) return;
            state.setNotificationItems(
                [payload, ...state.getNotificationItems().filter((item) => item.id !== payload.id)].slice(0, 20)
            );
            if (payload.read !== true) {
                state.setNotificationUnreadCount(state.getNotificationUnreadCount() + 1);
            }
            renderNotificationsUI();
        });
        socket.on('notifications:badge', (payload) => {
            if (!payload) return;
            const unread = Number(payload.unreadCount);
            if (Number.isFinite(unread)) {
                state.setNotificationUnreadCount(unread);
                renderNotificationsUI();
            }
        });
        socket.emit('notifications:subscribe', {});
    }

    return {
        renderNotificationsUI,
        setNotificationsState,
        bootstrapNotifications,
        acknowledgeNotification,
        acknowledgeAllNotifications,
        bindNotificationsSocket
    };
}
