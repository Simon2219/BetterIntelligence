const { run } = require('../core/query');

module.exports = {
    id: 24,
    name: 'refresh_token_families',
    up() {
        run(`ALTER TABLE refresh_tokens ADD COLUMN family_id TEXT`);
        run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id)`);
    }
};
