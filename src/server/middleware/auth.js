const jwtService = require('../services/jwtService');
const { UserSystem } = require('../database/Database');

function extractToken(req) {
    const h = req.headers?.authorization;
    if (h && h.startsWith('Bearer ')) return h.substring(7);
    return req.cookies?.access_token || null;
}

function authenticate(req, res, next) {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });

    const payload = jwtService.verifyAccessToken(token);
    if (!payload) return res.status(401).json({ success: false, error: 'Invalid or expired token' });

    const user = UserSystem.getWithRole(payload.userId);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

    req.user = user;
    next();
}

function optionalAuth(req, res, next) {
    const token = extractToken(req);
    if (token) {
        const payload = jwtService.verifyAccessToken(token);
        if (payload) {
            const user = UserSystem.getWithRole(payload.userId);
            if (user && user.is_active) req.user = user;
        }
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    if (!req.user.role?.is_admin) return res.status(403).json({ success: false, error: 'Admin required' });
    next();
}

module.exports = { authenticate, optionalAuth, requireAdmin };
