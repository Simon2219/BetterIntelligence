const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS user_private_tags (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#3b82f6',
            style TEXT DEFAULT 'pill',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        run(`CREATE TABLE IF NOT EXISTS user_agent_tag_assignments (
            user_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (user_id, agent_id, tag_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES user_private_tags(id) ON DELETE CASCADE
        )`);
        run(`CREATE TABLE IF NOT EXISTS user_skill_tag_assignments (
            user_id TEXT NOT NULL,
            skill_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (user_id, skill_id, tag_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES user_private_tags(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_user_private_tags_user ON user_private_tags(user_id)');
}

module.exports = {
    id: '017',
    name: 'user_private_tags',
    up
};
