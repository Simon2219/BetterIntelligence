const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS agent_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_analytics_agent ON agent_analytics(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_analytics_type ON agent_analytics(event_type)');
        run('CREATE INDEX IF NOT EXISTS idx_analytics_created ON agent_analytics(created_at)');
}

module.exports = {
    id: '007',
    name: 'agent_analytics',
    up
};
