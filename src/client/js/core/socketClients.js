export function createSocketClients({ getToken, onTokenInvalid } = {}) {
    const sockets = new Map();

    function tokenAuth(cb) {
        const token = typeof getToken === 'function' ? getToken() : null;
        cb({ token: token || null });
    }

    function normalizeNamespace(namespace) {
        const ns = String(namespace || '/').trim();
        return ns || '/';
    }

    function shouldHandleTokenError(err) {
        const message = String(err?.message || '').toLowerCase();
        return message.includes('token') || message.includes('jwt') || message.includes('unauthorized');
    }

    function getSocket(namespace = '/') {
        const ns = normalizeNamespace(namespace);
        if (typeof io === 'undefined') return null;

        const token = typeof getToken === 'function' ? getToken() : null;
        const existing = sockets.get(ns);

        if (!token) {
            if (existing) {
                existing.disconnect();
                sockets.delete(ns);
            }
            return null;
        }

        if (existing) {
            existing.auth = tokenAuth;
            if (!existing.connected) existing.connect();
            return existing;
        }

        const socket = ns === '/'
            ? io({ auth: tokenAuth })
            : io(ns, { auth: tokenAuth });

        socket.on('connect_error', (err) => {
            if (shouldHandleTokenError(err) && typeof onTokenInvalid === 'function') {
                onTokenInvalid(err);
            }
        });

        sockets.set(ns, socket);
        return socket;
    }

    function disconnect(namespace = '/') {
        const ns = normalizeNamespace(namespace);
        const socket = sockets.get(ns);
        if (!socket) return;
        socket.disconnect();
        sockets.delete(ns);
    }

    function disconnectAll() {
        sockets.forEach((socket) => socket.disconnect());
        sockets.clear();
    }

    function refreshAuth() {
        sockets.forEach((socket) => {
            socket.auth = tokenAuth;
        });
    }

    return {
        getSocket,
        getGatewaySocket: () => getSocket('/'),
        getNotificationsSocket: () => getSocket('/notifications'),
        getAdminSocket: () => getSocket('/admin'),
        getAnalyticsSocket: () => getSocket('/analytics'),
        disconnect,
        disconnectAll,
        refreshAuth
    };
}

