const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    try { run(`ALTER TABLE ai_provider_models ADD COLUMN is_active INTEGER DEFAULT 1`); } catch (e) { ignoreDuplicateColumnError(e); }
        try { run(`ALTER TABLE ai_provider_models ADD COLUMN is_user_visible INTEGER DEFAULT 1`); } catch (e) { ignoreDuplicateColumnError(e); }
        try { run(`ALTER TABLE ai_provider_models ADD COLUMN is_internal INTEGER DEFAULT 0`); } catch (e) { ignoreDuplicateColumnError(e); }
        try { run(`ALTER TABLE ai_provider_models ADD COLUMN install_path TEXT DEFAULT ''`); } catch (e) { ignoreDuplicateColumnError(e); }
    
        run(`CREATE TABLE IF NOT EXISTS ai_model_usage_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            model_type TEXT DEFAULT 'text',
            user_id TEXT,
            agent_id TEXT,
            chat_id TEXT,
            source TEXT DEFAULT 'chat',
            success INTEGER DEFAULT 1,
            prompt_tokens INTEGER DEFAULT 0,
            completion_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            duration_ms INTEGER,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        )`);
    
        run('CREATE INDEX IF NOT EXISTS idx_ai_model_usage_model_time ON ai_model_usage_events(provider_name, model_id, created_at)');
        run('CREATE INDEX IF NOT EXISTS idx_ai_model_usage_created ON ai_model_usage_events(created_at)');
        run('CREATE INDEX IF NOT EXISTS idx_ai_model_usage_agent ON ai_model_usage_events(agent_id, created_at)');
}

module.exports = {
    id: '021',
    name: 'ai_model_catalog_usage',
    up
};
