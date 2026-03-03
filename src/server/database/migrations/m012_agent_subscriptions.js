const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    try { run('ALTER TABLE ai_agents ADD COLUMN hub_published INTEGER DEFAULT 0'); } catch (e) { ignoreDuplicateColumnError(e); }
        run(`CREATE TABLE IF NOT EXISTS agent_subscriptions (
            user_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            subscribed_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, agent_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_agent_subs_user ON agent_subscriptions(user_id)');
        run('CREATE INDEX IF NOT EXISTS idx_agent_subs_agent ON agent_subscriptions(agent_id)');
}

module.exports = {
    id: '012',
    name: 'agent_subscriptions',
    up
};
