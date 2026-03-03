const { run, get } = require('../core/query');


const TokenRepository = {
    store(userId, tokenHash, expiresAt) {
        run('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, tokenHash, expiresAt]);
    },
    find(tokenHash) {
        return get("SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')", [tokenHash]);
    },
    revoke(tokenHash) { run('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]); },
    revokeAllForUser(userId) { run('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]); }
};


module.exports = TokenRepository;
