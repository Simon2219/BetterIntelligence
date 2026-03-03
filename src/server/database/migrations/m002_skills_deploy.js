const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS skill_registry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL,
            path TEXT NOT NULL,
            creator_id TEXT,
            version TEXT DEFAULT '1.0.0',
            hub_published INTEGER DEFAULT 0,
            downloads INTEGER DEFAULT 0,
            rating REAL DEFAULT 0,
            category TEXT DEFAULT 'general',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (creator_id) REFERENCES users(id)
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            user_id TEXT,
            embed_session_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS agent_deployments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            embed_enabled INTEGER DEFAULT 1,
            api_enabled INTEGER DEFAULT 0,
            webhook_url TEXT DEFAULT '',
            api_key_hash TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
        )`);
    
        run(`CREATE TABLE IF NOT EXISTS hook_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT,
            deployment_id INTEGER,
            event TEXT NOT NULL,
            url TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id),
            FOREIGN KEY (deployment_id) REFERENCES agent_deployments(id)
        )`);
    
        run('CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)');
        run('CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)');
        run('CREATE INDEX IF NOT EXISTS idx_deployments_slug ON agent_deployments(slug)');
}

module.exports = {
    id: '002',
    name: 'skills_deploy',
    up
};
