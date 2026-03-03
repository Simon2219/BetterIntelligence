const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS knowledge_documents (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            title TEXT NOT NULL,
            source TEXT DEFAULT '',
            content TEXT DEFAULT '',
            chunk_count INTEGER DEFAULT 0,
            token_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE
        )`);
        run(`CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            token_count INTEGER DEFAULT 0,
            FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_knowledge_docs_agent ON knowledge_documents(agent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(document_id)');
}

module.exports = {
    id: '006',
    name: 'knowledge_base',
    up
};
