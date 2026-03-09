const jwtService = require('../services/jwtService');
const { UserRepository, RoleRepository } = require('../database');

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

    const user = UserRepository.getWithRole(payload.userId);
    if (!user) return res.status(401).json({ success: false, error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ success: false, error: 'Account deactivated' });

    req.user = user;
    next();
}

function authenticateOptional(req, res, next) {
    const token = extractToken(req);
    if (!token) return next();

    const payload = jwtService.verifyAccessToken(token);
    if (!payload?.userId) return next();

    const user = UserRepository.getWithRole(payload.userId);
    if (!user || !user.is_active) return next();

    req.user = user;
    next();
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
        if (RoleRepository.hasPermission(req.user.role, permission)) return next();
        return res.status(403).json({ success: false, error: 'Permission denied' });
    };
}

function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    if (RoleRepository.hasPermission(req.user.role, 'can_access_admin') || req.user.role?.is_admin) return next();
    return res.status(403).json({ success: false, error: 'Admin required' });
}

module.exports = { authenticate, authenticateOptional, requirePermission, requireAdmin };

