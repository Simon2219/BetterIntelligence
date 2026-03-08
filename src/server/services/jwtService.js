const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Config = require('../../../config/Config');
const { TokenRepository } = require('../database');
const log = require('./Logger')('jwt');

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

function generateFamilyId() {
    return crypto.randomUUID();
}

function generateTokens(user, familyId = null) {
    const payload = { userId: user.id, username: user.username, roleId: user.role_id, isAdmin: user.role_is_admin === 1 };
    const accessExp = Config.get('auth.accessTokenExpiryMinutes', 15);
    const refreshExp = Config.get('auth.refreshTokenExpiryDays', 30);

    const family = familyId || generateFamilyId();
    const accessToken = jwt.sign(payload, getAccessSecret(), { expiresIn: `${accessExp}m`, issuer: 'betterintelligence' });
    const refreshToken = jwt.sign(
        { userId: user.id, type: 'refresh', familyId: family },
        getRefreshSecret(),
        { expiresIn: `${refreshExp}d`, issuer: 'betterintelligence' }
    );

    TokenRepository.store(user.id, hashToken(refreshToken), new Date(Date.now() + refreshExp * 864e5).toISOString(), family);
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

        const hash = hashToken(refreshToken);
        const stored = TokenRepository.find(hash);

        if (!stored) {
            const familyId = p.familyId;
            if (familyId && TokenRepository.hasActiveFamily(familyId)) {
                log.warn('Refresh token reuse detected — revoking family', { userId: p.userId, familyId });
                TokenRepository.revokeFamily(familyId);
            }
            return null;
        }

        const familyId = stored.family_id || p.familyId;
        TokenRepository.revoke(hash);
        return generateTokens(user, familyId);
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
