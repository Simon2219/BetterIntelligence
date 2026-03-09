const { authenticateSocket } = require('./socketAuth');
const { AIAgentRepository, AnalyticsRepository, RoleRepository } = require('../database');
const analyticsService = require('../services/analyticsService');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const log = require('../services/Logger')('analytics-socket');

function normalizeAgentId(agentId) {
    return String(agentId || '').trim().toUpperCase();
}

function toWindowDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, 3650);
}

function canAccessAgent(userId, agent) {
    if (!agent) return false;
    const owner = String(agent.user_id || '').trim().toUpperCase();
    const uid = String(userId || '').trim().toUpperCase();
    return !!owner && owner === uid;
}

function analyticsRoom(userId, agentId) {
    return `analytics:user:${String(userId || '').trim().toUpperCase()}:agent:${normalizeAgentId(agentId)}`;
}

function initAnalyticsSocket(io) {
    const nsp = io.of('/analytics');
    nsp.use((socket, next) => authenticateSocket(socket, next, { namespace: '/analytics' }));

    nsp.on('connection', (socket) => {
        socketSessionRegistry.registerUserSocket(socket.userId, '/analytics', socket.id);
        socket.data.analyticsRooms = new Set();

        socket.on('analytics:subscribe', (payload) => {
            try {
                const agentId = normalizeAgentId(payload?.agentId);
                if (!agentId) return;
                const agent = AIAgentRepository.getById(agentId);
                const canAccess = canAccessAgent(socket.userId, agent)
                    || RoleRepository.hasPermission(socket.user?.role, 'can_access_admin')
                    || RoleRepository.hasPermission(socket.user?.role, 'can_manage_marketplace');
                if (!canAccess) {
                    socket.emit('analytics:error', { error: 'Access denied', agentId });
                    return;
                }
                const windowDays = toWindowDays(payload?.windowDays, 30);
                const scale = payload?.scale === 'hour' ? 'hour' : 'day';
                const room = analyticsRoom(socket.userId, agentId);
                socket.join(room);
                socket.data.analyticsRooms.add(room);

                const totals = AnalyticsRepository.getStats(agentId, windowDays);
                analyticsService.emitAnalyticsSnapshot({
                    userId: socket.userId,
                    agentId,
                    snapshot: {
                        totals,
                        timeseries: totals?.daily || [],
                        scale,
                        windowDays,
                        generatedAt: new Date().toISOString()
                    }
                });
            } catch (err) {
                socket.emit('analytics:error', { error: err.message || 'Failed to subscribe' });
            }
        });

        socket.on('analytics:unsubscribe', (payload) => {
            const agentId = normalizeAgentId(payload?.agentId);
            if (!agentId) return;
            const room = analyticsRoom(socket.userId, agentId);
            socket.leave(room);
            socket.data.analyticsRooms.delete(room);
        });

        socket.on('disconnect', () => {
            socketSessionRegistry.unregisterUserSocket(socket.userId, '/analytics', socket.id);
            log.debug('Analytics socket disconnected', { userId: socket.userId, socketId: socket.id });
        });
    });
}

module.exports = { initAnalyticsSocket };
