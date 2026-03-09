/**
 * Generic category repository factory.
 * Produces identical CRUD + assignment repositories for agents and skills.
 */
const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');

function createCategoryRepository(categoryTable, assignmentTable, entityColumn) {
    return {
        list(userId) {
            return all(`SELECT * FROM ${categoryTable} WHERE user_id = ? ORDER BY sort_order, name`, [userId]);
        },
        getById(id) {
            return get(`SELECT * FROM ${categoryTable} WHERE id = ?`, [id]);
        },
        create(userId, name) {
            const id = generateId(8);
            run(`INSERT INTO ${categoryTable} (id, user_id, name, sort_order) VALUES (?, ?, ?, 0)`, [id, userId, name]);
            return get(`SELECT * FROM ${categoryTable} WHERE id = ?`, [id]);
        },
        update(id, data) {
            const cat = get(`SELECT * FROM ${categoryTable} WHERE id = ?`, [id]);
            if (!cat) return null;
            if (data.name !== undefined) run(`UPDATE ${categoryTable} SET name = ? WHERE id = ?`, [data.name, id]);
            return get(`SELECT * FROM ${categoryTable} WHERE id = ?`, [id]);
        },
        delete(id) {
            run(`DELETE FROM ${assignmentTable} WHERE category_id = ?`, [id]);
            run(`DELETE FROM ${categoryTable} WHERE id = ?`, [id]);
        },
        assign(entityId, categoryId) {
            run(`INSERT OR REPLACE INTO ${assignmentTable} (${entityColumn}, category_id, sort_order) VALUES (?, ?, 0)`, [entityId, categoryId]);
        },
        unassign(entityId, categoryId) {
            run(`DELETE FROM ${assignmentTable} WHERE ${entityColumn} = ? AND category_id = ?`, [entityId, categoryId]);
        },
        getEntityCategoryIds(entityId) {
            return all(`SELECT category_id FROM ${assignmentTable} WHERE ${entityColumn} = ?`, [entityId]).map(r => r.category_id);
        },
        getEntityIdsByCategory(categoryId) {
            return all(`SELECT ${entityColumn} FROM ${assignmentTable} WHERE category_id = ? ORDER BY sort_order`, [categoryId]).map(r => r[entityColumn]);
        },
        getEntityCountByCategory(categoryId) {
            const row = get(`SELECT COUNT(*) as c FROM ${assignmentTable} WHERE category_id = ?`, [categoryId]);
            return row?.c ?? 0;
        },
        reorderEntities(categoryId, orderedEntityIds) {
            run(`DELETE FROM ${assignmentTable} WHERE category_id = ?`, [categoryId]);
            orderedEntityIds.forEach((entityId, i) => {
                run(`INSERT INTO ${assignmentTable} (${entityColumn}, category_id, sort_order) VALUES (?, ?, ?)`, [entityId, categoryId, i]);
            });
        },
        updateCategorySortOrder(categoryIdsWithOrder) {
            categoryIdsWithOrder.forEach(({ id, sort_order }) => {
                run(`UPDATE ${categoryTable} SET sort_order = ? WHERE id = ?`, [sort_order, id]);
            });
        }
    };
}

const agentRepo = createCategoryRepository('agent_categories', 'agent_category_assignments', 'agent_id');
const skillRepo = createCategoryRepository('skill_categories', 'skill_library_category_assignments', 'entry_id');

const AgentCategoryRepository = {
    ...agentRepo,
    getAgentCategoryIds: agentRepo.getEntityCategoryIds,
    getAgentIdsByCategory: agentRepo.getEntityIdsByCategory,
    getAgentCountByCategory: agentRepo.getEntityCountByCategory,
    reorderAgents: agentRepo.reorderEntities
};

const SkillCategoryRepository = {
    ...skillRepo,
    getSkillCategoryIds: skillRepo.getEntityCategoryIds,
    getSkillIdsByCategory: skillRepo.getEntityIdsByCategory,
    getSkillCountByCategory: skillRepo.getEntityCountByCategory,
    reorderSkills: skillRepo.reorderEntities
};

module.exports = { AgentCategoryRepository, SkillCategoryRepository };
