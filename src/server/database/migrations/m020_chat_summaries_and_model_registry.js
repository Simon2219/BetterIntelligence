const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    try {
            run(`ALTER TABLE chats ADD COLUMN thread_summary TEXT DEFAULT ''`);
        } catch (e) {
            ignoreDuplicateColumnError(e);
        }
    
        run(`CREATE TABLE IF NOT EXISTS ai_provider_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_name TEXT NOT NULL,
            model_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            model_type TEXT DEFAULT 'text',
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            last_seen_at TEXT DEFAULT (datetime('now')),
            UNIQUE(provider_name, model_id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_ai_provider_models_provider ON ai_provider_models(provider_name, model_type)');
}

module.exports = {
    id: '020',
    name: 'chat_summaries_and_model_registry',
    up
};
