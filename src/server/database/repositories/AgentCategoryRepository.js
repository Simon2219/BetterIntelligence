const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const AgentCategoryRepository = {
    list(userId) {
        return all('SELECT * FROM agent_categories WHERE user_id = ? ORDER BY sort_order, name', [userId]);
    },
    getById(id) {
        return get('SELECT * FROM agent_categories WHERE id = ?', [id]);
    },
    create(userId, name) {
        const id = generateId(8);
        run('INSERT INTO agent_categories (id, user_id, name, sort_order) VALUES (?, ?, ?, 0)', [id, userId, name]);
        return get('SELECT * FROM agent_categories WHERE id = ?', [id]);
    },
    update(id, data) {
        const cat = this.getById(id);
        if (!cat) return null;
        if (data.name !== undefined) run('UPDATE agent_categories SET name = ? WHERE id = ?', [data.name, id]);
        return this.getById(id);
    },
    delete(id) {
        run('DELETE FROM agent_category_assignments WHERE category_id = ?', [id]);
        run('DELETE FROM agent_categories WHERE id = ?', [id]);
    },
    assign(agentId, categoryId) {
        run('INSERT OR REPLACE INTO agent_category_assignments (agent_id, category_id, sort_order) VALUES (?, ?, 0)', [agentId, categoryId]);
    },
    unassign(agentId, categoryId) {
        run('DELETE FROM agent_category_assignments WHERE agent_id = ? AND category_id = ?', [agentId, categoryId]);
    },
    getAgentCategoryIds(agentId) {
        return all('SELECT category_id FROM agent_category_assignments WHERE agent_id = ?', [agentId]).map(r => r.category_id);
    },
    getAgentIdsByCategory(categoryId) {
        return all('SELECT agent_id FROM agent_category_assignments WHERE category_id = ? ORDER BY sort_order', [categoryId]).map(r => r.agent_id);
    },
    getAgentCountByCategory(categoryId) {
        const row = get('SELECT COUNT(*) as c FROM agent_category_assignments WHERE category_id = ?', [categoryId]);
        return row?.c ?? 0;
    },
    reorderAgents(categoryId, orderedAgentIds) {
        run('DELETE FROM agent_category_assignments WHERE category_id = ?', [categoryId]);
        orderedAgentIds.forEach((agentId, i) => {
            run('INSERT INTO agent_category_assignments (agent_id, category_id, sort_order) VALUES (?, ?, ?)', [agentId, categoryId, i]);
        });
    },
    updateCategorySortOrder(categoryIdsWithOrder) {
        categoryIdsWithOrder.forEach(({ id, sort_order }) => {
            run('UPDATE agent_categories SET sort_order = ? WHERE id = ?', [sort_order, id]);
        });
    }
};


module.exports = AgentCategoryRepository;
