const { run, all } = require('../core/query');

module.exports = {
    id: 25,
    name: 'drop_provider_api_key',
    up() {
        const rows = all(`PRAGMA table_info(ai_provider_config)`);
        if (!rows.some(r => r.name === 'api_key')) return;

        run(`CREATE TABLE ai_provider_config_new (
            provider_name TEXT PRIMARY KEY,
            endpoint_url TEXT DEFAULT '',
            default_model TEXT DEFAULT '',
            is_enabled INTEGER DEFAULT 0,
            settings TEXT DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
        run(`INSERT INTO ai_provider_config_new (provider_name, endpoint_url, default_model, is_enabled, settings, updated_at)
             SELECT provider_name, endpoint_url, default_model, is_enabled, settings, updated_at
             FROM ai_provider_config`);
        run(`DROP TABLE ai_provider_config`);
        run(`ALTER TABLE ai_provider_config_new RENAME TO ai_provider_config`);
    }
};
