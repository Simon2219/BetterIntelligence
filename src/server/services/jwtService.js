const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Config = require('../../../config/Config');
const { TokenSystem } = require('../database/Database');

function getAccessSecret() { return Config.get('auth.accessSecret', process.env.JWT_ACCESS_SECRET || 'bi-fallback'); }
function getRefreshSecret() { return Config.get('auth.refreshSecret', process.env.JWT_REFRESH_SECRET || 'bi-refresh'); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function generateTokens(user) {
    const payload = { userId: user.id, username: user.username, roleId: user.role_id, isAdmin: user.role_is_admin === 1 };
    const accessExp = Config.get('auth.accessTokenExpiryMinutes', 15);
    const refreshExp = Config.get('auth.refreshTokenExpiryDays', 30);

    const accessToken = jwt.sign(payload, getAccessSecret(), { expiresIn: `${accessExp}m`, issuer: 'betterintelligence' });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, getRefreshSecret(), { expiresIn: `${refreshExp}d`, issuer: 'betterintelligence' });

    TokenSystem.store(user.id, hashToken(refreshToken), new Date(Date.now() + refreshExp * 864e5).toISOString());
    return { accessToken, refreshToken, expiresIn: accessExp * 60 };
}

function verifyAccessToken(token) {
    try { return jwt.verify(token, getAccessSecret(), { issuer: 'betterintelligence' }); }
    catch { return null; }
}

function refreshTokens(refreshToken, user) {
    try {
        const p = jwt.verify(refreshToken, getRefreshSecret(), { issuer: 'betterintelligence' });
        if (p.type !== 'refresh') return null;
        const stored = TokenSystem.find(hashToken(refreshToken));
        if (!stored) return null;
        TokenSystem.revoke(hashToken(refreshToken));
        return generateTokens(user);
    } catch { return null; }
}

function revokeToken(t) { TokenSystem.revoke(hashToken(t)); }
function revokeAllUserTokens(uid) { TokenSystem.revokeAllForUser(uid); }

module.exports = { generateTokens, verifyAccessToken, refreshTokens, revokeToken, revokeAllUserTokens, hashToken };
