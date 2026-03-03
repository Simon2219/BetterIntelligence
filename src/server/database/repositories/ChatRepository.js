const { run, all, get } = require('../core/query');
const { transaction } = require('../core/transaction');
const { generateId } = require('../core/ids');


function generateChatId() {
    const len = 12;
    let id;
    do { id = generateId(len); } while (get('SELECT id FROM chats WHERE UPPER(id) = ?', [id]));
    return id;
}

const ChatRepository = {
    create(participant1, participant2, opts = {}) {
        const id = opts.id || generateChatId();
        const isAiChat = opts.isAiChat !== false;
        const aiAgentId = opts.aiAgentId || (isAiChat ? participant2 : null);
        const embedSessionId = opts.embedSessionId || null;
        const deploymentId = opts.deploymentId !== undefined && opts.deploymentId !== null
            ? parseInt(opts.deploymentId, 10)
            : null;
        run(`INSERT INTO chats (id, participant_1, participant_2, embed_session_id, is_ai_chat, ai_agent_id, deployment_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, participant1, participant2, embedSessionId, isAiChat ? 1 : 0, aiAgentId, Number.isFinite(deploymentId) ? deploymentId : null, opts.status || 'accepted']);
        return this.getById(id);
    },

    getById(chatId) {
        return get('SELECT * FROM chats WHERE UPPER(id) = UPPER(?)', [chatId]);
    },

    findChat(userId, agentId, options = {}) {
        const opts = typeof options === 'string'
            ? { embedSessionId: options }
            : (options || {});
        const embedSessionId = opts.embedSessionId || null;
        const deploymentId = opts.deploymentId !== undefined && opts.deploymentId !== null
            ? parseInt(opts.deploymentId, 10)
            : null;

        if (embedSessionId) {
            if (Number.isFinite(deploymentId)) {
                return get(`SELECT * FROM chats
                    WHERE embed_session_id = ? AND ai_agent_id = ? AND deployment_id = ?
                    LIMIT 1`, [embedSessionId, agentId, deploymentId]);
            }
            return get('SELECT * FROM chats WHERE embed_session_id = ? AND ai_agent_id = ? LIMIT 1', [embedSessionId, agentId]);
        }
        return get(`SELECT * FROM chats WHERE UPPER(participant_1) = UPPER(?) AND UPPER(participant_2) = UPPER(?) AND is_ai_chat = 1 LIMIT 1`,
            [userId, agentId]);
    },

    getOrCreate(userId, agentId, opts = {}) {
        let chat = opts.embedSessionId
            ? this.findChat(null, agentId, { embedSessionId: opts.embedSessionId, deploymentId: opts.deploymentId })
            : this.findChat(userId, agentId);
        if (!chat) {
            const created = this.create(userId, agentId, {
                ...opts,
                isAiChat: true,
                aiAgentId: agentId,
                embedSessionId: opts.embedSessionId,
                deploymentId: opts.deploymentId
            });
            chat = this.getById(created.id);
        }
        return chat;
    },

    listForUser(userId) {
        return all(`SELECT c.*,
            c.participant_2 as agent_id,
            c.thread_summary,
            c.thread_summary_message_count,
            c.last_message_preview as last_message,
            (
                SELECT COUNT(*)
                FROM chat_messages m
                WHERE UPPER(m.chat_id) = UPPER(c.id)
            ) as message_count
            FROM chats c
            WHERE UPPER(c.participant_1) = UPPER(?) AND c.is_ai_chat = 1 AND c.ai_agent_id IS NOT NULL
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
            [userId]);
    },

    listForDeployment(deploymentId, opts = {}) {
        const parsedDeploymentId = parseInt(deploymentId, 10);
        if (!Number.isFinite(parsedDeploymentId)) return [];
        const parsedLimit = parseInt(opts.limit, 10);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 250)
            : 80;

        return all(`SELECT c.*,
                c.participant_2 as agent_id,
                c.thread_summary,
                c.thread_summary_message_count,
                c.last_message_preview as last_message
            FROM chats c
            WHERE c.deployment_id = ?
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
            LIMIT ?`, [parsedDeploymentId, limit]);
    },

    listDeploymentChatsForUser(userId, opts = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) return [];

        const parsedLimit = parseInt(opts.limit, 10);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, 300)
            : 180;
        const q = String(opts.q || '').trim().toLowerCase();
        const clauses = [
            '(UPPER(d.owner_user_id) = UPPER(?) OR dm.id IS NOT NULL)'
        ];
        const params = [normalizedUserId, normalizedUserId];

        if (q) {
            clauses.push('(LOWER(d.slug) LIKE ? OR LOWER(COALESCE(a.name, \'\')) LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
        }

        params.push(limit);

        return all(`SELECT
                c.*,
                c.participant_2 AS agent_id,
                c.thread_summary,
                c.thread_summary_message_count,
                c.last_message_preview AS last_message,
                (
                    SELECT COUNT(*)
                    FROM chat_messages m
                    WHERE UPPER(m.chat_id) = UPPER(c.id)
                ) AS message_count,
                d.slug AS deployment_slug,
                d.id AS deployment_id,
                d.agent_id AS deployment_agent_id,
                d.owner_user_id AS deployment_owner_user_id,
                a.name AS agent_name,
                a.avatar_url AS agent_avatar_url,
                dm.role AS member_role,
                dm.permissions AS member_permissions
            FROM chats c
            JOIN agent_deployments d ON d.id = c.deployment_id
            LEFT JOIN deployment_members dm
                ON dm.deployment_id = d.id
               AND UPPER(dm.user_id) = UPPER(?)
            LEFT JOIN ai_agents a ON a.id = d.agent_id
            WHERE c.deployment_id IS NOT NULL
              AND ${clauses.join(' AND ')}
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
            LIMIT ?`, params);
    },

    addMessage(chatId, message) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        transaction(() => {
            const id = message.id || generateId(12);
            const media = JSON.stringify(message.media || []);
            const metadata = JSON.stringify(message.metadata || {});
            run(`INSERT INTO chat_messages (id, chat_id, sender_id, type, content, media, media_url, metadata, created_at, read, read_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, canonicalId, message.senderId, message.type || 'text', message.content || '',
                    media, message.mediaUrl || null, metadata, message.timestamp || new Date().toISOString(),
                    message.read ? 1 : 0, message.readAt || null]);

            let preview, lastType;
            if (message.type === 'media' && message.media?.length) {
                const imgCount = message.media.filter(m => m.type === 'image').length;
                const vidCount = message.media.filter(m => m.type === 'video').length;
                const parts = [];
                if (imgCount) parts.push(`${imgCount} photo${imgCount > 1 ? 's' : ''}`);
                if (vidCount) parts.push(`${vidCount} video${vidCount > 1 ? 's' : ''}`);
                preview = `[${parts.join(', ')}]`;
                lastType = message.media[0]?.type === 'video' ? 'video' : 'image';
            } else if (message.type === 'text') {
                preview = (message.content || '').substring(0, 100);
                lastType = 'text';
            } else {
                preview = `[${message.type}]`;
                lastType = message.type;
            }
            run(`UPDATE chats SET last_message_at = ?, last_message_preview = ?,
                last_message_type = ?, last_message_sender = ?, last_message_read = 0, updated_at = datetime('now')
                WHERE UPPER(id) = UPPER(?)`,
                [message.timestamp || new Date().toISOString(), preview, lastType, message.senderId, canonicalId]);
        });
    },

    getMessages(chatId, limit = null, before = null) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        let sql = `SELECT * FROM chat_messages WHERE UPPER(chat_id) = UPPER(?)`;
        const params = [canonicalId];
        if (before) {
            sql += ` AND created_at < ?`;
            params.push(before);
        }
        sql += ` ORDER BY created_at DESC`;
        if (limit) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }
        const rows = all(sql, params);
        const messages = rows.map(r => ({
            id: r.id,
            chatId: r.chat_id,
            senderId: r.sender_id,
            type: r.type,
            content: r.content || '',
            media: (() => { try { return JSON.parse(r.media || '[]'); } catch { return []; } })(),
            mediaUrl: r.media_url || null,
            metadata: (() => { try { return JSON.parse(r.metadata || '{}'); } catch { return {}; } })(),
            timestamp: r.created_at,
            read: r.read === 1,
            readAt: r.read_at || null
        }));
        return messages.reverse();
    },

    getLatestIncomingMessageForDeploymentChat(chatId) {
        const chat = this.getById(chatId);
        if (!chat || !chat.deployment_id || !chat.ai_agent_id) return null;
        const row = get(`SELECT m.*
            FROM chat_messages m
            JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
            WHERE UPPER(m.chat_id) = UPPER(?)
              AND UPPER(m.sender_id) != UPPER(COALESCE(c.ai_agent_id, ''))
            ORDER BY m.created_at DESC
            LIMIT 1`, [chat.id]);
        if (!row) return null;
        return {
            id: row.id,
            chatId: row.chat_id,
            senderId: row.sender_id,
            type: row.type,
            content: row.content || '',
            media: (() => { try { return JSON.parse(row.media || '[]'); } catch { return []; } })(),
            mediaUrl: row.media_url || null,
            metadata: (() => { try { return JSON.parse(row.metadata || '{}'); } catch { return {}; } })(),
            timestamp: row.created_at,
            read: row.read === 1,
            readAt: row.read_at || null
        };
    },

    getMessageCount(chatId) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        const row = get(`SELECT COUNT(*) as count
            FROM chat_messages
            WHERE UPPER(chat_id) = UPPER(?)`, [canonicalId]);
        return row?.count ?? 0;
    },

    getUnreadCount(chatId, userId) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        const row = get(`SELECT COUNT(*) as count FROM chat_messages
            WHERE UPPER(chat_id) = UPPER(?) AND UPPER(sender_id) != UPPER(?) AND read = 0`,
            [canonicalId, userId]);
        return row?.count ?? 0;
    },

    getUnreadCountForUser(userId) {
        const row = get(`SELECT COUNT(*) as count
            FROM chat_messages m
            JOIN chats c ON UPPER(c.id) = UPPER(m.chat_id)
            WHERE UPPER(c.participant_1) = UPPER(?)
              AND c.is_ai_chat = 1
              AND c.ai_agent_id IS NOT NULL
              AND UPPER(m.sender_id) != UPPER(?)
              AND m.read = 0`, [userId, userId]);
        return row?.count ?? 0;
    },

    markRead(chatId, userId, upToTimestamp) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        const readAt = new Date().toISOString();
        let didChange = false;
        transaction(() => {
            const res = run(`UPDATE chat_messages SET read = 1, read_at = ?
                WHERE UPPER(chat_id) = UPPER(?) AND UPPER(sender_id) != UPPER(?) AND read = 0
                AND (? IS NULL OR created_at <= ?)`,
                [readAt, canonicalId, userId, upToTimestamp, upToTimestamp]);
            if (res?.changes > 0) didChange = true;

            const c = get('SELECT last_message_sender, last_message_at FROM chats WHERE UPPER(id) = UPPER(?)', [canonicalId]);
            if (didChange && c && c.last_message_sender && c.last_message_sender.toUpperCase() !== userId.toUpperCase()) {
                const lastAt = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
                const upTo = upToTimestamp ? new Date(upToTimestamp).getTime() : 0;
                if (upTo >= lastAt) {
                    run('UPDATE chats SET last_message_read = 1 WHERE UPPER(id) = UPPER(?)', [canonicalId]);
                }
            }
        });
    },

    delete(chatId) {
        run('DELETE FROM chat_messages WHERE chat_id = ?', [chatId]);
        run('DELETE FROM chats WHERE UPPER(id) = UPPER(?)', [chatId]);
    },

    setThreadSummary(chatId, summary, messageCount = null) {
        const chat = this.getById(chatId);
        const canonicalId = chat?.id || chatId;
        const resolvedCount = Number.isFinite(messageCount)
            ? Math.max(0, parseInt(messageCount, 10) || 0)
            : this.getMessageCount(canonicalId);
        run(`UPDATE chats
            SET thread_summary = ?, thread_summary_message_count = ?, updated_at = datetime('now')
            WHERE UPPER(id) = UPPER(?)`,
            [String(summary || '').trim(), resolvedCount, canonicalId]);
    }
};


module.exports = ChatRepository;
