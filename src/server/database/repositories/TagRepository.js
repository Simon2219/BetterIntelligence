const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const TagRepository = {
    getOrCreate(name, createdBy = null) {
        const n = String(name).trim();
        if (!n) return null;
        let tag = get('SELECT * FROM tags WHERE LOWER(name) = LOWER(?) AND (created_by = ? OR (created_by IS NULL AND ? IS NULL))', [n, createdBy, createdBy]);
        if (!tag) {
            const id = generateId(8);
            run('INSERT INTO tags (id, name, created_by) VALUES (?, ?, ?)', [id, n, createdBy]);
            tag = get('SELECT * FROM tags WHERE id = ?', [id]);
        }
        return tag;
    },
    listForUser(userId) {
        return all('SELECT t.*, (SELECT COUNT(*) FROM agent_tags WHERE tag_id = t.id) as agent_count FROM tags t WHERE t.created_by = ? OR (t.created_by IS NULL) ORDER BY t.name', [userId]);
    },
    search(name, userId, limit = 20) {
        if (!name || !String(name).trim()) return this.listForUser(userId).slice(0, limit);
        return all("SELECT t.*, (SELECT COUNT(*) FROM agent_tags WHERE tag_id = t.id) as agent_count FROM tags t WHERE t.name LIKE ? AND (t.created_by = ? OR t.created_by IS NULL) ORDER BY t.name LIMIT ?", ['%' + String(name).trim() + '%', userId, limit]);
    },
    getById(id) {
        return get('SELECT * FROM tags WHERE id = ?', [id]);
    },

    getAgentTagIds(agentId) {
        return all('SELECT tag_id FROM agent_tags WHERE agent_id = ?', [agentId]).map(r => r.tag_id);
    },
    setAgentTags(agentId, tagIds) {
        run('DELETE FROM agent_tags WHERE agent_id = ?', [agentId]);
        for (const tagId of tagIds || []) {
            run('INSERT INTO agent_tags (agent_id, tag_id) VALUES (?, ?)', [agentId, tagId]);
        }
    }
};


module.exports = TagRepository;
