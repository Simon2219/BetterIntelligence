const log = require('./Logger')('socket-session');

let ioRef = null;
const userSockets = new Map(); // key: USERID_UPPER -> Map(namespace -> Set(socketId))

function normalizeUserId(userId) {
    return String(userId || '').trim().toUpperCase();
}

function normalizeNamespace(namespace) {
    return String(namespace || '/').trim() || '/';
}

function bindIO(io) {
    ioRef = io;
}

function registerUserSocket(userId, namespace, socketId) {
    const uid = normalizeUserId(userId);
    const nsp = normalizeNamespace(namespace);
    const sid = String(socketId || '').trim();
    if (!uid || !sid) return;

    let byNamespace = userSockets.get(uid);
    if (!byNamespace) {
        byNamespace = new Map();
        userSockets.set(uid, byNamespace);
    }

    let socketSet = byNamespace.get(nsp);
    if (!socketSet) {
        socketSet = new Set();
        byNamespace.set(nsp, socketSet);
    }

    socketSet.add(sid);
}

function unregisterUserSocket(userId, namespace, socketId) {
    const uid = normalizeUserId(userId);
    const nsp = normalizeNamespace(namespace);
    const sid = String(socketId || '').trim();
    if (!uid || !sid) return;

    const byNamespace = userSockets.get(uid);
    if (!byNamespace) return;
    const socketSet = byNamespace.get(nsp);
    if (!socketSet) return;

    socketSet.delete(sid);
    if (!socketSet.size) byNamespace.delete(nsp);
    if (!byNamespace.size) userSockets.delete(uid);
}

function disconnectUserSockets(userId, opts = {}) {
    const uid = normalizeUserId(userId);
    if (!uid || !ioRef) return 0;

    const byNamespace = userSockets.get(uid);
    if (!byNamespace || !byNamespace.size) return 0;

    const allowedNamespaces = Array.isArray(opts.namespaces) && opts.namespaces.length
        ? new Set(opts.namespaces.map((item) => normalizeNamespace(item)))
        : null;

    let disconnected = 0;
    for (const [namespace, socketSet] of byNamespace.entries()) {
        if (allowedNamespaces && !allowedNamespaces.has(namespace)) continue;
        const nsp = ioRef.of(namespace);
        if (!nsp) continue;
        for (const socketId of socketSet) {
            const socket = nsp.sockets.get(socketId);
            if (socket) {
                socket.disconnect(true);
                disconnected += 1;
            }
        }
    }

    if (disconnected > 0) {
        log.info('Disconnected active sockets for user', { userId: uid, disconnected });
    }

    if (!allowedNamespaces) {
        userSockets.delete(uid);
    } else {
        for (const namespace of allowedNamespaces) {
            byNamespace.delete(namespace);
        }
        if (!byNamespace.size) userSockets.delete(uid);
    }

    return disconnected;
}

module.exports = {
    bindIO,
    registerUserSocket,
    unregisterUserSocket,
    disconnectUserSockets
};
