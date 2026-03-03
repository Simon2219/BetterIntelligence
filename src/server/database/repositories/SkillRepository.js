const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const SkillRepository = {
    getById(id) {
        return get('SELECT * FROM skills WHERE id = ?', [id]);
    },
    getBySlug(slug) {
        return get('SELECT * FROM skills WHERE slug = ? LIMIT 1', [slug]);
    },
    create(data) {
        const id = data.id || (data.creatorId ? 'user:' + data.creatorId + ':' + data.slug : generateId(12));
        run(`INSERT INTO skills (id, slug, path, creator_id, visibility, version, hub_published, name, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.slug, data.path, data.creatorId || null, data.visibility || 'private', data.version || '1.0.0',
             data.hubPublished ? 1 : 0, data.name || data.slug, data.description || '']);
        return this.getById(id);
    },
    update(id, updates) {
        const allow = ['visibility', 'hub_published', 'hubPublished', 'name', 'description', 'version', 'path'];
        const sets = [];
        const vals = [];
        for (const [k, v] of Object.entries(updates)) {
            const col = k === 'hubPublished' ? 'hub_published' : k;
            if (!allow.includes(k) && !allow.includes(col)) continue;
            if (v === undefined) continue;
            sets.push(`${col} = ?`);
            vals.push(col === 'hub_published' ? (v ? 1 : 0) : v);
        }
        if (sets.length === 0) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this.getById(id);
    },
    listForUser(userId) {
        if (!userId) return all(`SELECT * FROM skills WHERE path LIKE 'bundled/%' ORDER BY name`);
        return all(`SELECT * FROM skills WHERE path LIKE 'bundled/%' OR creator_id = ? OR path LIKE ? ORDER BY name`,
            [userId, 'installed/' + userId + '/%']);
    },
    listForAgent(agentId) {
        const agent = get('SELECT user_id FROM ai_agents WHERE id = ?', [agentId]);
        if (!agent) return [];
        const rows = all(`SELECT s.* FROM skills s JOIN agent_skills a ON s.id = a.skill_id WHERE a.agent_id = ? ORDER BY a.sort_order`, [agentId]);
        return rows.filter(r => SkillRepository.agentCanUseSkill(agentId, r.id));
    },
    agentCanUseSkill(agentId, skillId) {
        const agent = get('SELECT user_id FROM ai_agents WHERE id = ?', [agentId]);
        const skill = get('SELECT * FROM skills WHERE id = ?', [skillId]);
        if (!agent || !skill) return false;
        if (skill.path.startsWith('bundled/')) return true;
        if (skill.creator_id && skill.creator_id.toUpperCase() === (agent.user_id || '').toUpperCase()) return true;
        if (agent.user_id && skill.path.includes('installed/' + agent.user_id + '/')) return true;
        return false;
    },
    assignToAgent(agentId, skillIds) {
        run('DELETE FROM agent_skills WHERE agent_id = ?', [agentId]);
        const ids = Array.isArray(skillIds) ? skillIds : [];
        for (let i = 0; i < ids.length; i++) {
            const sid = String(ids[i] || '').trim();
            if (!sid) continue;
            run('INSERT INTO agent_skills (agent_id, skill_id, sort_order) VALUES (?, ?, ?)', [agentId, sid, i]);
        }
    },
    getAgentSkillIds(agentId) {
        return all('SELECT skill_id, sort_order FROM agent_skills WHERE agent_id = ? ORDER BY sort_order', [agentId])
            .map(r => r.skill_id);
    },
    listPublicHub() {
        return all(`SELECT * FROM skills WHERE visibility = 'public' AND hub_published = 1 ORDER BY name`);
    }
};


module.exports = SkillRepository;
