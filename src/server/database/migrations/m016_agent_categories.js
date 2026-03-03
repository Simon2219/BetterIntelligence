const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS agent_categories (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        run(`CREATE TABLE IF NOT EXISTS agent_category_assignments (
            agent_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (agent_id, category_id),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES agent_categories(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_agent_categories_user ON agent_categories(user_id)');
        run('CREATE INDEX IF NOT EXISTS idx_agent_category_assignments ON agent_category_assignments(category_id)');
}

module.exports = {
    id: '016',
    name: 'agent_categories',
    up
};
