const { authenticateSocket } = require('./socketAuth');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const log = require('../services/Logger')('admin-socket');

function normalizeProvider(providerName) {
    return String(providerName || '').trim().toLowerCase();
}

function normalizeModel(modelId) {
    return String(modelId || '').trim();
}

function initAdminSocket(io) {
    const nsp = io.of('/admin');

    nsp.use((socket, next) => authenticateSocket(socket, next, { namespace: '/admin', requireAdmin: true }));

    nsp.on('connection', (socket) => {
        socketSessionRegistry.registerUserSocket(socket.userId, '/admin', socket.id);
        socket.join('admin:model_status');

        socket.on('admin:model_status:subscribe', (payload) => {
            const providerName = normalizeProvider(payload?.providerName);
            const modelId = normalizeModel(payload?.modelId);
            if (providerName && modelId) {
                socket.join(`admin:model_status:${providerName}:${modelId}`);
            } else {
                socket.join('admin:model_status');
            }
        });

        socket.on('admin:model_status:unsubscribe', (payload) => {
            const providerName = normalizeProvider(payload?.providerName);
            const modelId = normalizeModel(payload?.modelId);
            if (providerName && modelId) {
                socket.leave(`admin:model_status:${providerName}:${modelId}`);
            } else {
                socket.leave('admin:model_status');
            }
        });

        socket.on('disconnect', () => {
            socketSessionRegistry.unregisterUserSocket(socket.userId, '/admin', socket.id);
            log.debug('Admin socket disconnected', { userId: socket.userId, socketId: socket.id });
        });
    });
}

module.exports = { initAdminSocket };
