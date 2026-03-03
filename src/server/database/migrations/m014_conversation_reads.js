const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS conversation_reads (
            user_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            last_read_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, conversation_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_conversation_reads_user ON conversation_reads(user_id)');
}

module.exports = {
    id: '014',
    name: 'conversation_reads',
    up
};
