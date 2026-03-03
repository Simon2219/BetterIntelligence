const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Config = require('../../../config/Config');
const { TokenRepository } = require('../database');

function getAccessSecret() {
    const secret = Config.get('auth.accessSecret', process.env.JWT_ACCESS_SECRET);
    if (!secret) throw new Error('JWT access secret is not configured');
    return secret;
}

function getRefreshSecret() {
    const secret = Config.get('auth.refreshSecret', process.env.JWT_REFRESH_SECRET);
    if (!secret) throw new Error('JWT refresh secret is not configured');
    return secret;
}

function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function generateTokens(user) {
    const payload = { userId: user.id, username: user.username, roleId: user.role_id, isAdmin: user.role_is_admin === 1 };
    const accessExp = Config.get('auth.accessTokenExpiryMinutes', 15);
    const refreshExp = Config.get('auth.refreshTokenExpiryDays', 30);

    const accessToken = jwt.sign(payload, getAccessSecret(), { expiresIn: `${accessExp}m`, issuer: 'betterintelligence' });
    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, getRefreshSecret(), { expiresIn: `${refreshExp}d`, issuer: 'betterintelligence' });

    TokenRepository.store(user.id, hashToken(refreshToken), new Date(Date.now() + refreshExp * 864e5).toISOString());
    return { accessToken, refreshToken, expiresIn: accessExp * 60 };
}

function verifyAccessToken(token) {
    try { return jwt.verify(token, getAccessSecret(), { issuer: 'betterintelligence' }); }
    catch { return null; }
}

function verifyRefreshToken(token) {
    try {
        const payload = jwt.verify(token, getRefreshSecret(), { issuer: 'betterintelligence' });
        return payload?.type === 'refresh' ? payload : null;
    } catch {
        return null;
    }
}

function refreshTokens(refreshToken, user) {
    try {
        const p = verifyRefreshToken(refreshToken);
        if (!p) return null;
        const stored = TokenRepository.find(hashToken(refreshToken));
        if (!stored) return null;
        TokenRepository.revoke(hashToken(refreshToken));
        return generateTokens(user);
    } catch { return null; }
}

function revokeToken(t) { TokenRepository.revoke(hashToken(t)); }
function revokeAllUserTokens(uid) { TokenRepository.revokeAllForUser(uid); }

module.exports = {
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
    refreshTokens,
    revokeToken,
    revokeAllUserTokens,
    hashToken
};


