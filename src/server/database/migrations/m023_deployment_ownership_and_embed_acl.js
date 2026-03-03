const { run, all } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function columnExists(tableName, columnName) {
    const rows = all(`PRAGMA table_info(${tableName})`);
    return rows.some((row) => String(row.name || '').toLowerCase() === String(columnName || '').toLowerCase());
}

function addColumnIfMissing(tableName, columnName, sql) {
    if (columnExists(tableName, columnName)) return;
    try {
        run(sql);
    } catch (err) {
        ignoreDuplicateColumnError(err);
    }
}

function up() {
    addColumnIfMissing('agent_deployments', 'owner_user_id', 'ALTER TABLE agent_deployments ADD COLUMN owner_user_id TEXT');
    addColumnIfMissing('chats', 'deployment_id', 'ALTER TABLE chats ADD COLUMN deployment_id INTEGER');

    run(`CREATE TABLE IF NOT EXISTS deployment_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deployment_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
        permissions TEXT NOT NULL DEFAULT '{}',
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deployment_id) REFERENCES agent_deployments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (deployment_id, user_id)
    )`);

    run(`UPDATE agent_deployments
        SET owner_user_id = (
            SELECT a.user_id
            FROM ai_agents a
            WHERE a.id = agent_deployments.agent_id
        )
        WHERE (owner_user_id IS NULL OR TRIM(owner_user_id) = '')`);

    run(`UPDATE chats
        SET deployment_id = (
            SELECT d.id
            FROM agent_deployments d
            WHERE d.agent_id = chats.ai_agent_id
            LIMIT 1
        )
        WHERE deployment_id IS NULL
          AND participant_1 IS NULL
          AND ai_agent_id IS NOT NULL
          AND (
              SELECT COUNT(*)
              FROM agent_deployments d2
              WHERE d2.agent_id = chats.ai_agent_id
          ) = 1`);

    run('CREATE INDEX IF NOT EXISTS idx_agent_deployments_owner ON agent_deployments(owner_user_id)');
    run('CREATE INDEX IF NOT EXISTS idx_chats_deployment ON chats(deployment_id)');
    run('CREATE INDEX IF NOT EXISTS idx_deployment_members_deployment ON deployment_members(deployment_id)');
    run('CREATE INDEX IF NOT EXISTS idx_deployment_members_user ON deployment_members(user_id)');
}

module.exports = {
    id: '023',
    name: 'deployment_ownership_and_embed_acl',
    up
};

