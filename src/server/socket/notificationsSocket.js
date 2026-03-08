const notificationService = require('../services/notificationService');
const { authenticateSocket } = require('./socketAuth');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const log = require('../services/Logger')('notifications-socket');

function initNotificationsSocket(io) {
    const nsp = io.of('/notifications');

    nsp.use((socket, next) => authenticateSocket(socket, next, { namespace: '/notifications' }));

    nsp.on('connection', (socket) => {
        const userId = socket.userId;
        socketSessionRegistry.registerUserSocket(userId, '/notifications', socket.id);
        const room = `notifications:user:${String(userId || '').toUpperCase()}`;
        socket.join(room);
        socket.emit('notifications:badge', { unreadCount: notificationService.getUnreadCount(userId) });

        socket.on('notifications:subscribe', () => {
            socket.join(room);
            socket.emit('notifications:badge', { unreadCount: notificationService.getUnreadCount(userId) });
        });

        socket.on('notifications:ack', (data) => {
            const notificationId = String(data?.notificationId || '').trim();
            if (!notificationId) return;
            notificationService.ackNotification(userId, notificationId);
            socket.emit('notifications:badge', { unreadCount: notificationService.getUnreadCount(userId) });
        });

        socket.on('notifications:ack_all', () => {
            notificationService.ackAllNotifications(userId);
            socket.emit('notifications:badge', { unreadCount: notificationService.getUnreadCount(userId) });
        });

        socket.on('disconnect', () => {
            socketSessionRegistry.unregisterUserSocket(userId, '/notifications', socket.id);
            log.debug('Notifications socket disconnected', { userId, socketId: socket.id });
        });
    });
}

module.exports = { initNotificationsSocket };
