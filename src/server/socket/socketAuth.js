const Config = require('../../../config/Config');
const jwtService = require('../services/jwtService');
const { UserRepository, RoleRepository } = require('../database');
const log = require('../services/Logger')('socket-auth');

function normalizeOrigin(value) {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
}

function isOriginAllowed(origin) {
    const allowed = Config.get('security.allowedOrigins', []);
    const allowNoOriginInDev = Config.get('security.allowNoOriginInDev', true) === true;
    if (!origin) return process.env.NODE_ENV !== 'production' && allowNoOriginInDev;

    const normalizedOrigin = normalizeOrigin(origin);
    const list = Array.isArray(allowed) ? allowed : [];
    if (list.includes('*')) return true;
    return list.some((entry) => normalizeOrigin(entry) === normalizedOrigin);
}

function extractSocketToken(socket) {
    const authToken = socket.handshake.auth?.token || null;
    if (authToken) return authToken;

    const allowQuery = Config.get('security.acceptSocketQueryToken', true) === true;
    const queryToken = socket.handshake.query?.token || null;
    if (queryToken && allowQuery) {
        log.warn('Socket auth accepted legacy query token', {
            namespace: socket.nsp?.name || '/',
            origin: socket.handshake.headers?.origin || null
        });
        return queryToken;
    }
    return null;
}

function authenticateSocket(socket, next, opts = {}) {
    const namespace = opts.namespace || socket.nsp?.name || '/';
    const origin = socket.handshake.headers?.origin || null;
    const reject = (reason) => {
        log.warn('Socket handshake rejected', { namespace, origin, reason });
        return next(new Error(reason));
    };

    if (opts.validateOrigin !== false && !isOriginAllowed(origin)) {
        return reject('Origin not allowed');
    }

    const token = extractSocketToken(socket);
    if (!token) return reject('Authentication required');

    const payload = jwtService.verifyAccessToken(token);
    if (!payload) return reject('Invalid token');

    const user = UserRepository.getWithRole(payload.userId);
    if (!user || !user.is_active) return reject('User not found');

    if (opts.requireAdmin) {
        const allowed = RoleRepository.hasPermission(user.role, 'can_access_admin') || !!user.role?.is_admin;
        if (!allowed) return reject('Admin required');
    }

    socket.user = user;
    socket.userId = user.id;
    return next();
}

module.exports = { authenticateSocket };
