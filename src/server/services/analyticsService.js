/**
 * AnalyticsService - Real-time agent analytics event emitters.
 */
const { safeEmit } = require('./notificationService');

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
    emitAnalyticsSnapshot,
    emitAnalyticsUpdate
};
