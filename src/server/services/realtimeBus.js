const { generateId } = require('../database');
const log = require('./Logger')('realtime');

let ioRef = null;
const notificationsByUser = new Map();
const MAX_NOTIFICATIONS_PER_USER = 200;

function bindIO(io) {
    ioRef = io;
}

function getIO() {
    return ioRef;
}

function safeEmit(namespace, eventName, payload, room = null) {
    if (!ioRef) return;
    const nsp = ioRef.of(namespace);
    if (!nsp) return;
    if (room) {
        nsp.to(room).emit(eventName, payload);
    } else {
        nsp.emit(eventName, payload);
    }
}

function getUserNotifications(userId) {
    const key = String(userId || '').trim().toUpperCase();
    if (!key) return [];
    if (!notificationsByUser.has(key)) notificationsByUser.set(key, []);
    return notificationsByUser.get(key);
}

function getUnreadCount(userId) {
    return getUserNotifications(userId).filter((item) => !item.read).length;
}

function listNotifications(userId, limit = 20) {
    const parsedLimit = Number.parseInt(limit, 10);
    const safeLimit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, MAX_NOTIFICATIONS_PER_USER))
        : 20;
    return getUserNotifications(userId)
        .slice(0, safeLimit)
        .map((entry) => ({
            ...entry,
            meta: entry && typeof entry.meta === 'object' ? { ...entry.meta } : {}
        }));
}

function pushNotification(userId, notification) {
    const list = getUserNotifications(userId);
    list.unshift(notification);
    if (list.length > MAX_NOTIFICATIONS_PER_USER) list.splice(MAX_NOTIFICATIONS_PER_USER);
}

function createNotification({ userId, type, title, body, severity = 'info', meta = {} }) {
    const uid = String(userId || '').trim();
    if (!uid) return null;
    const item = {
        id: `ntf_${generateId(10)}`,
        type: String(type || 'system'),
        title: String(title || 'Notification'),
        body: String(body || ''),
        severity: String(severity || 'info'),
        meta: meta && typeof meta === 'object' ? meta : {},
        createdAt: new Date().toISOString(),
        read: false
    };
    pushNotification(uid, item);
    emitNotification(uid, item);
    return item;
}

function emitNotification(userId, payload) {
    const room = `notifications:user:${String(userId || '').toUpperCase()}`;
    safeEmit('/notifications', 'notifications:new', payload, room);
    emitNotificationBadge(userId);
}

function emitNotificationBadge(userId) {
    const room = `notifications:user:${String(userId || '').toUpperCase()}`;
    safeEmit('/notifications', 'notifications:badge', { unreadCount: getUnreadCount(userId) }, room);
}

function ackNotification(userId, notificationId) {
    const id = String(notificationId || '').trim();
    if (!id) return false;
    const list = getUserNotifications(userId);
    const item = list.find((entry) => entry.id === id);
    if (!item) return false;
    item.read = true;
    emitNotificationBadge(userId);
    return true;
}

function ackAllNotifications(userId) {
    const list = getUserNotifications(userId);
    if (!list.length) return 0;
    let changed = 0;
    for (const item of list) {
        if (!item.read) {
            item.read = true;
            changed += 1;
        }
    }
    if (changed > 0) emitNotificationBadge(userId);
    return changed;
}

function emitAdminModelStatusUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;
    safeEmit('/admin', 'admin:model_status:update', payload, 'admin:model_status');
    const provider = String(payload.providerName || '').trim().toLowerCase();
    const modelId = String(payload.modelId || '').trim();
    if (provider && modelId) {
        safeEmit('/admin', 'admin:model_status:update', payload, `admin:model_status:${provider}:${modelId}`);
    }
}

function emitAdminModelUsageUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;
    safeEmit('/admin', 'admin:model_usage:update', payload, 'admin:model_status');
    const provider = String(payload.providerName || '').trim().toLowerCase();
    const modelId = String(payload.modelId || '').trim();
    if (provider && modelId) {
        safeEmit('/admin', 'admin:model_usage:update', payload, `admin:model_status:${provider}:${modelId}`);
    }
}

function emitAdminProviderStatusUpdate(payload) {
    if (!payload || typeof payload !== 'object') return;
    safeEmit('/admin', 'admin:provider_status:update', payload, 'admin:model_status');
}

function emitAnalyticsSnapshot({ userId, agentId, snapshot }) {
    const uid = String(userId || '').trim().toUpperCase();
    const aid = String(agentId || '').trim().toUpperCase();
    if (!uid || !aid) return;
    safeEmit('/analytics', 'analytics:snapshot', {
        agentId,
        ...snapshot
    }, `analytics:user:${uid}:agent:${aid}`);
}

function emitAnalyticsUpdate({ userId, agentId, totalsDelta, point }) {
    const uid = String(userId || '').trim().toUpperCase();
    const aid = String(agentId || '').trim().toUpperCase();
    if (!uid || !aid) return;
    safeEmit('/analytics', 'analytics:update', {
        agentId,
        totalsDelta: totalsDelta || {},
        point: point || null,
        generatedAt: new Date().toISOString()
    }, `analytics:user:${uid}:agent:${aid}`);
}

module.exports = {
    bindIO,
    getIO,
    createNotification,
    emitNotification,
    listNotifications,
    getUnreadCount,
    ackNotification,
    ackAllNotifications,
    emitNotificationBadge,
    emitAdminModelStatusUpdate,
    emitAdminModelUsageUpdate,
    emitAdminProviderStatusUpdate,
    emitAnalyticsSnapshot,
    emitAnalyticsUpdate
};
