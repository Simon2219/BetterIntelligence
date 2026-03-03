const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role_id INTEGER NOT NULL DEFAULT 2,
            avatar_url TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            settings TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (role_id) REFERENCES roles(id)
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS ai_agents (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            tagline TEXT DEFAULT '',
            avatar_url TEXT DEFAULT '',
            personality TEXT DEFAULT '{}',
            backstory TEXT DEFAULT '',
            behavior_rules TEXT DEFAULT '{}',
            sample_dialogues TEXT DEFAULT '[]',
            system_prompt TEXT DEFAULT '',
            skills_order TEXT DEFAULT '[]',
            text_provider TEXT DEFAULT 'ollama',
            text_model TEXT DEFAULT '',
            temperature REAL DEFAULT 0.8,
            max_tokens INTEGER DEFAULT 512,
            is_active INTEGER DEFAULT 1,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS ai_prompt_templates (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            category TEXT DEFAULT 'base',
            content TEXT NOT NULL DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS ai_provider_config (
            provider_name TEXT PRIMARY KEY,
            endpoint_url TEXT DEFAULT '',
            api_key TEXT DEFAULT '',
            default_model TEXT DEFAULT '',
            is_enabled INTEGER DEFAULT 0,
            settings TEXT DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
    
        run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
        run('CREATE INDEX IF NOT EXISTS idx_ai_agents_user ON ai_agents(user_id)');
}

module.exports = {
    id: '001',
    name: 'initial',
    up
};
