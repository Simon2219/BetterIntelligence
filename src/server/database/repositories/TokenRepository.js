const { run, get } = require('../core/query');


const TokenRepository = {
    store(userId, tokenHash, expiresAt, familyId = null) {
        run(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id) VALUES (?, ?, ?, ?)',
            [userId, tokenHash, expiresAt, familyId]
        );
    },
    find(tokenHash) {
        return get("SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')", [tokenHash]);
    },
    hasActiveFamily(familyId) {
        if (!familyId) return false;
        return !!get("SELECT id FROM refresh_tokens WHERE family_id = ? AND expires_at > datetime('now') LIMIT 1", [familyId]);
    },
    revokeFamily(familyId) {
        if (!familyId) return;
        run('DELETE FROM refresh_tokens WHERE family_id = ?', [familyId]);
    },
    revoke(tokenHash) { run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]); },
    revokeAllForUser(userId) { run('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]); }
};


module.exports = TokenRepository;
