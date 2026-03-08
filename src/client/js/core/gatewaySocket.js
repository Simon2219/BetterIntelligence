export function createGatewaySocketController({
    createSocketClients,
    getToken,
    setSocketClients,
    getSocketClients,
    setActiveSocket,
    getCurrentUser,
    setCurrentUser,
    setToken,
    navigate,
    api,
    showToast,
    resetNotificationsState,
    onUnreadCountChanged
} = {}) {
    function handleUnauthorized() {
        setToken?.(null);
        setCurrentUser?.(null);
        destroyActiveSocket();
        navigate?.('/');
    }

    function ensureSocketClients() {
        let clients = getSocketClients?.();
        if (!clients) {
            clients = createSocketClients({
                getToken,
                onTokenInvalid: () => handleUnauthorized()
            });
            setSocketClients?.(clients);
        }
        return clients;
    }

    function destroyActiveSocket() {
        const clients = getSocketClients?.();
        clients?.disconnectAll?.();
        setActiveSocket?.(null);
        resetNotificationsState?.();
    }

    async function updateChatUnreadBadge() {
        if (!getCurrentUser?.()) return;
        try {
            const { data } = await api('/chats/unread-count');
            const count = data?.unreadCount ?? 0;
            onUnreadCountChanged?.(count);
        } catch {}
    }

    function handleGatewayConversationMessage(payload) {
        showToast?.(`New message from ${payload?.agentName || 'Agent'}`, 'info');
        updateChatUnreadBadge();
        window.dispatchEvent(new CustomEvent('bi:conversation:new_message', { detail: payload || {} }));
    }

    function handleGatewayConnectError(err) {
        if (String(err?.message || '').toLowerCase().includes('token')) {
            handleUnauthorized();
        }
    }

    function ensureSocket() {
        const socket = ensureSocketClients()?.getGatewaySocket?.();
        if (!socket) return null;
        setActiveSocket?.(socket);

        socket.off('conversation:new_message', handleGatewayConversationMessage);
        socket.off('connect_error', handleGatewayConnectError);
        socket.on('conversation:new_message', handleGatewayConversationMessage);
        socket.on('connect_error', handleGatewayConnectError);
        return socket;
    }

    function createSocket() {
        return ensureSocket();
    }

    function refreshSocketAuth() {
        const clients = getSocketClients?.();
        clients?.refreshAuth?.();
    }

    function getClients() {
        return ensureSocketClients();
    }

    return {
        ensureSocketClients,
        ensureSocket,
        createSocket,
        destroyActiveSocket,
        updateChatUnreadBadge,
        refreshSocketAuth,
        getSocketClients: getClients,
        handleUnauthorized
    };
}
