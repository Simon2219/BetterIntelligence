const { run, all, get } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            participant_1 TEXT,
            participant_2 TEXT NOT NULL,
            embed_session_id TEXT,
            is_ai_chat INTEGER DEFAULT 1,
            ai_agent_id TEXT,
            status TEXT DEFAULT 'accepted',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            last_message_at TEXT,
            last_message_preview TEXT DEFAULT '',
            last_message_type TEXT DEFAULT 'text',
            last_message_sender TEXT DEFAULT '',
            last_message_read INTEGER DEFAULT 0,
            FOREIGN KEY (participant_1) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id) ON DELETE SET NULL
        )`);
        run(`CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'text',
            content TEXT DEFAULT '',
            media TEXT DEFAULT '[]',
            media_url TEXT,
            metadata TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            read_at TEXT,
            FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_chats_p1 ON chats(participant_1)');
        run('CREATE INDEX IF NOT EXISTS idx_chats_p2 ON chats(participant_2)');
        run('CREATE INDEX IF NOT EXISTS idx_chats_embed ON chats(embed_session_id)');
        run('CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(last_message_at)');
        run('CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id)');
        run('CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created ON chat_messages(chat_id, created_at)');
    
        const convTable = get("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'");
        if (convTable) {
            const convs = all('SELECT * FROM conversations');
            for (const c of convs) {
                const chatId = c.id;
                run(`INSERT OR IGNORE INTO chats (id, participant_1, participant_2, embed_session_id, is_ai_chat, ai_agent_id, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, 'accepted', ?, ?)`,
                    [chatId, c.user_id || null, c.agent_id, c.embed_session_id || null, c.agent_id, c.created_at || new Date().toISOString(), c.updated_at || new Date().toISOString()]);
                const msgs = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [c.id]);
                let lastAt = null, lastPreview = '', lastType = 'text', lastSender = '', lastRead = 0;
                for (const m of msgs) {
                    const senderId = m.role === 'user' ? (c.user_id || ('embed:' + (c.embed_session_id || 'anon'))) : c.agent_id;
                    run(`INSERT OR IGNORE INTO chat_messages (id, chat_id, sender_id, type, content, metadata, created_at, read, read_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
                        [m.id, chatId, senderId, 'text', m.content || '', m.metadata || '{}', m.created_at || new Date().toISOString()]);
                    lastAt = m.created_at;
                    lastPreview = (m.content || '').substring(0, 100);
                    lastType = 'text';
                    lastSender = senderId;
                }
                if (lastAt) {
                    run(`UPDATE chats SET last_message_at = ?, last_message_preview = ?, last_message_type = ?, last_message_sender = ?, updated_at = ? WHERE id = ?`,
                        [lastAt, lastPreview, lastType, lastSender, lastAt, chatId]);
                }
            }
        }
}

module.exports = {
    id: '018',
    name: 'chats_realchat',
    up
};
