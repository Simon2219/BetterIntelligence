const { run, all, get } = require('../core/query');

function parseLimit(limit, fallback = 120, max = 500) {
    const value = parseInt(limit, 10);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.min(value, max);
}

const DeploymentRepository = {
    create(agentId, slug, ownerUserId = null) {
        run(`INSERT INTO agent_deployments (agent_id, slug, owner_user_id) VALUES (?, ?, ?)`, [agentId, slug, ownerUserId]);
        return get('SELECT * FROM agent_deployments WHERE slug = ?', [slug]);
    },

    getById(id) {
        return get('SELECT * FROM agent_deployments WHERE id = ?', [id]);
    },

    getBySlug(slug) { return get('SELECT * FROM agent_deployments WHERE slug = ?', [slug]); },
    getByAgentId(agentId) { return get('SELECT * FROM agent_deployments WHERE agent_id = ?', [agentId]); },

    listAccessibleByUser(userId, opts = {}) {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) return [];

        const limit = parseLimit(opts.limit, 120, 500);
        const q = String(opts.q || '').trim().toLowerCase();
        const role = String(opts.role || '').trim().toLowerCase();

        const clauses = [
            '(UPPER(d.owner_user_id) = UPPER(?) OR dm.id IS NOT NULL)'
        ];
        const params = [normalizedUserId, normalizedUserId];

        if (q) {
            clauses.push('(LOWER(d.slug) LIKE ? OR LOWER(COALESCE(a.name, \'\')) LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
        }

        if (role === 'owner') {
            clauses.push('UPPER(d.owner_user_id) = UPPER(?)');
            params.push(normalizedUserId);
        } else if (role === 'admin' || role === 'manager') {
            clauses.push('dm.role = ?');
            params.push(role);
        }

        params.push(limit);

        return all(`SELECT
                d.*,
                a.name AS agent_name,
                a.avatar_url AS agent_avatar_url,
                dm.role AS member_role,
                dm.permissions AS member_permissions,
                (
                    SELECT COUNT(*)
                    FROM chats c
                    WHERE c.deployment_id = d.id
                ) AS chat_count,
                (
                    SELECT MAX(COALESCE(c.last_message_at, c.updated_at, c.created_at))
                    FROM chats c
                    WHERE c.deployment_id = d.id
                ) AS last_message_at
            FROM agent_deployments d
            LEFT JOIN ai_agents a ON a.id = d.agent_id
            LEFT JOIN deployment_members dm
                ON dm.deployment_id = d.id
               AND UPPER(dm.user_id) = UPPER(?)
            WHERE ${clauses.join(' AND ')}
            ORDER BY COALESCE(last_message_at, d.updated_at, d.created_at) DESC, d.id DESC
            LIMIT ?`, params);
    },

    update(slug, updates) {
        const allow = ['embed_enabled', 'api_enabled', 'webhook_url', 'api_key_hash'];
        const sets = [];
        const vals = [];
        for (const k of allow) {
            if (updates[k] === undefined) continue;
            sets.push(`${k} = ?`);
            vals.push(updates[k]);
        }
        if (sets.length === 0) return this.getBySlug(slug);
        sets.push("updated_at = datetime('now')");
        vals.push(slug);
        run(`UPDATE agent_deployments SET ${sets.join(', ')} WHERE slug = ?`, vals);
        return this.getBySlug(slug);
    }
};


module.exports = DeploymentRepository;
