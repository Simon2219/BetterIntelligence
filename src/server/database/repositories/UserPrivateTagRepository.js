const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const UserPrivateTagRepository = {
    list(userId) {
        return all('SELECT * FROM user_private_tags WHERE user_id = ? ORDER BY name', [userId]);
    },
    getById(id) {
        return get('SELECT * FROM user_private_tags WHERE id = ?', [id]);
    },
    create(userId, data) {
        const id = generateId(8);
        run('INSERT INTO user_private_tags (id, user_id, name, color, style) VALUES (?, ?, ?, ?, ?)',
            [id, userId, data.name || 'Tag', data.color || '#3b82f6', data.style || 'pill']);
        return get('SELECT * FROM user_private_tags WHERE id = ?', [id]);
    },
    update(id, userId, data) {
        const tag = this.getById(id);
        if (!tag || tag.user_id.toUpperCase() !== userId.toUpperCase()) return null;
        const updates = [];
        const vals = [];
        if (data.name !== undefined) { updates.push('name = ?'); vals.push(data.name); }
        if (data.color !== undefined) { updates.push('color = ?'); vals.push(data.color); }
        if (data.style !== undefined) { updates.push('style = ?'); vals.push(data.style); }
        if (updates.length === 0) return tag;
        vals.push(id);
        run(`UPDATE user_private_tags SET ${updates.join(', ')} WHERE id = ?`, vals);
        return get('SELECT * FROM user_private_tags WHERE id = ?', [id]);
    },
    delete(id, userId) {
        const tag = this.getById(id);
        if (!tag || tag.user_id.toUpperCase() !== userId.toUpperCase()) return false;
        run('DELETE FROM user_agent_tag_assignments WHERE tag_id = ?', [id]);
        run('DELETE FROM user_skill_tag_assignments WHERE tag_id = ?', [id]);
        run('DELETE FROM user_private_tags WHERE id = ?', [id]);
        return true;
    },
    assignToAgent(userId, agentId, tagId) {
        run('INSERT OR IGNORE INTO user_agent_tag_assignments (user_id, agent_id, tag_id) VALUES (?, ?, ?)', [userId, agentId, tagId]);
    },
    unassignFromAgent(userId, agentId, tagId) {
        run('DELETE FROM user_agent_tag_assignments WHERE user_id = ? AND agent_id = ? AND tag_id = ?', [userId, agentId, tagId]);
    },
    assignToSkill(userId, skillId, tagId) {
        run('INSERT OR IGNORE INTO user_skill_tag_assignments (user_id, skill_id, tag_id) VALUES (?, ?, ?)', [userId, skillId, tagId]);
    },
    unassignFromSkill(userId, skillId, tagId) {
        run('DELETE FROM user_skill_tag_assignments WHERE user_id = ? AND skill_id = ? AND tag_id = ?', [userId, skillId, tagId]);
    },
    getAgentPrivateTags(userId, agentId) {
        const rows = all('SELECT t.* FROM user_private_tags t JOIN user_agent_tag_assignments a ON t.id = a.tag_id WHERE a.user_id = ? AND a.agent_id = ?', [userId, agentId]);
        return rows;
    },
    getSkillPrivateTags(userId, skillId) {
        const rows = all('SELECT t.* FROM user_private_tags t JOIN user_skill_tag_assignments s ON t.id = s.tag_id WHERE s.user_id = ? AND s.skill_id = ?', [userId, skillId]);
        return rows;
    }
};


module.exports = UserPrivateTagRepository;
