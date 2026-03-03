const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_by TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )`);
        run('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_user ON tags(name, created_by)');
        run(`CREATE TABLE IF NOT EXISTS agent_tags (
            agent_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (agent_id, tag_id),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_agent_tags_agent ON agent_tags(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_agent_tags_tag ON agent_tags(tag_id)');
}

module.exports = {
    id: '013',
    name: 'tags',
    up
};
