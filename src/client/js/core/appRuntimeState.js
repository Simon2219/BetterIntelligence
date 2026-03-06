export function createAppState({ initialPath = '/' } = {}) {
    let currentUser = null;
    let currentView = null;
    let activeSocket = null;
    let accessToken = null;
    let socketClients = null;
    let lastRenderedPath = String(initialPath || '/');

    const chatSummaryInFlight = new Map();
    const chatSummaryCooldownMs = 7000;

    let notificationsLoaded = false;
    let notificationsSocketBound = false;
    let notificationItems = [];
    let notificationUnreadCount = 0;
    const notificationExpandedIds = new Set();

    function getCurrentUser() {
        return currentUser;
    }

    function setCurrentUser(user) {
        currentUser = user || null;
    }

    function getCurrentView() {
        return currentView;
    }

    function setCurrentView(view) {
        currentView = view || null;
    }

    function getActiveSocket() {
        return activeSocket;
    }

    function setActiveSocket(socket) {
        activeSocket = socket || null;
    }

    function getAccessToken() {
        return accessToken;
    }

    function setAccessToken(token) {
        accessToken = token ? String(token) : null;
    }

    function getSocketClients() {
        return socketClients;
    }

    function setSocketClients(clients) {
        socketClients = clients || null;
    }

    function getLastRenderedPath() {
        return lastRenderedPath;
    }

    function setLastRenderedPath(path) {
        lastRenderedPath = String(path || '/');
    }

    function getChatSummaryCooldownMs() {
        return chatSummaryCooldownMs;
    }

    function getChatSummaryStamp(chatId) {
        return chatSummaryInFlight.get(String(chatId || '')) || 0;
    }

    function setChatSummaryStamp(chatId, timestamp) {
        chatSummaryInFlight.set(String(chatId || ''), Number(timestamp) || 0);
    }

    function clearChatSummaryState() {
        chatSummaryInFlight.clear();
    }

    function isNotificationsLoaded() {
        return notificationsLoaded;
    }

    function setNotificationsLoaded(value) {
        notificationsLoaded = value === true;
    }

    function isNotificationsSocketBound() {
        return notificationsSocketBound;
    }

    function setNotificationsSocketBound(value) {
        notificationsSocketBound = value === true;
    }

    function getNotificationItems() {
        return notificationItems.slice();
    }

    function setNotificationItems(items) {
        notificationItems = Array.isArray(items) ? items.slice() : [];
    }

    function getNotificationUnreadCount() {
        return notificationUnreadCount;
    }

    function setNotificationUnreadCount(count) {
        const n = Number(count);
        notificationUnreadCount = Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function getNotificationExpandedIds() {
        return notificationExpandedIds;
    }

    function clearNotificationExpandedIds() {
        notificationExpandedIds.clear();
    }

    function resetNotificationsState() {
        notificationsLoaded = false;
        notificationsSocketBound = false;
        notificationItems = [];
        notificationUnreadCount = 0;
        notificationExpandedIds.clear();
    }

    return {
        getCurrentUser,
        setCurrentUser,
        getCurrentView,
        setCurrentView,
        getActiveSocket,
        setActiveSocket,
        getAccessToken,
        setAccessToken,
        getSocketClients,
        setSocketClients,
        getLastRenderedPath,
        setLastRenderedPath,
        getChatSummaryCooldownMs,
        getChatSummaryStamp,
        setChatSummaryStamp,
        clearChatSummaryState,
        isNotificationsLoaded,
        setNotificationsLoaded,
        isNotificationsSocketBound,
        setNotificationsSocketBound,
        getNotificationItems,
        setNotificationItems,
        getNotificationUnreadCount,
        setNotificationUnreadCount,
        getNotificationExpandedIds,
        clearNotificationExpandedIds,
        resetNotificationsState
    };
}
