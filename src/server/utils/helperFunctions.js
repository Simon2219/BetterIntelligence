/**
 * Shared utility functions used across routes, sockets, and server.js.
 */
const Config = require('../../../config/Config');

function isSameUser(left, right) {
    return String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase();
}

function parseBoolean(value, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function sanitizeUser(u) {
    if (!u) return null;
    const { password_hash, ...safe } = u;
    try { safe.settings = JSON.parse(safe.settings || '{}'); } catch { safe.settings = {}; }
    return safe;
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return 'Password is required';
    if (password.length > 128) return 'Password must be 128 characters or fewer';
    const minLen = Config.get('auth.passwordMinLength', 8);
    if (password.length < minLen) return `Password min ${minLen} chars`;
    if (Config.get('auth.passwordRequireUppercase') && !/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter';
    }
    if (Config.get('auth.passwordRequireNumber') && !/\d/.test(password)) {
        return 'Password must contain at least one number';
    }
    return null;
}

function isAgentOwner(agent, userId) {
    if (!agent || !agent.user_id || !userId) return false;
    return String(agent.user_id).trim().toUpperCase() === String(userId).trim().toUpperCase();
}

function normalizeOrigin(value) {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
}

function buildOriginMatcher(origins, opts = {}) {
    const allowNoOrigin = opts.allowNoOrigin !== false;
    const list = (Array.isArray(origins) ? origins : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    const any = list.includes('*');
    const normalized = new Set(list.map((item) => normalizeOrigin(item)));
    return (origin, cb) => {
        if (!origin) return cb(null, allowNoOrigin);
        if (any) return cb(null, true);
        return cb(null, normalized.has(normalizeOrigin(origin)));
    };
}

module.exports = {
    isSameUser,
    parseBoolean,
    sanitizeUser,
    validatePassword,
    isAgentOwner,
    normalizeOrigin,
    buildOriginMatcher
};
