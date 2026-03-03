const { run, all, get } = require('../core/query');
const { generateId } = require('../core/ids');


const SkillCategoryRepository = {
    list(userId) {
        return all('SELECT * FROM skill_categories WHERE user_id = ? ORDER BY sort_order, name', [userId]);
    },
    getById(id) {
        return get('SELECT * FROM skill_categories WHERE id = ?', [id]);
    },
    create(userId, name) {
        const id = generateId(8);
        run('INSERT INTO skill_categories (id, user_id, name, sort_order) VALUES (?, ?, ?, 0)', [id, userId, name]);
        return get('SELECT * FROM skill_categories WHERE id = ?', [id]);
    },
    update(id, data) {
        const cat = this.getById(id);
        if (!cat) return null;
        if (data.name !== undefined) run('UPDATE skill_categories SET name = ? WHERE id = ?', [data.name, id]);
        return this.getById(id);
    },
    delete(id) {
        run('DELETE FROM skill_category_assignments WHERE category_id = ?', [id]);
        run('DELETE FROM skill_categories WHERE id = ?', [id]);
    },
    assign(skillId, categoryId) {
        run('INSERT OR REPLACE INTO skill_category_assignments (skill_id, category_id, sort_order) VALUES (?, ?, 0)', [skillId, categoryId]);
    },
    unassign(skillId, categoryId) {
        run('DELETE FROM skill_category_assignments WHERE skill_id = ? AND category_id = ?', [skillId, categoryId]);
    },
    getSkillCategoryIds(skillId) {
        return all('SELECT category_id FROM skill_category_assignments WHERE skill_id = ?', [skillId]).map(r => r.category_id);
    },
    getSkillIdsByCategory(categoryId) {
        return all('SELECT skill_id FROM skill_category_assignments WHERE category_id = ? ORDER BY sort_order', [categoryId]).map(r => r.skill_id);
    },
    getSkillCountByCategory(categoryId) {
        const row = get('SELECT COUNT(*) as c FROM skill_category_assignments WHERE category_id = ?', [categoryId]);
        return row?.c ?? 0;
    },
    reorderSkills(categoryId, orderedSkillIds) {
        run('DELETE FROM skill_category_assignments WHERE category_id = ?', [categoryId]);
        orderedSkillIds.forEach((skillId, i) => {
            run('INSERT INTO skill_category_assignments (skill_id, category_id, sort_order) VALUES (?, ?, ?)', [skillId, categoryId, i]);
        });
    },
    updateCategorySortOrder(categoryIdsWithOrder) {
        categoryIdsWithOrder.forEach(({ id, sort_order }) => {
            run('UPDATE skill_categories SET sort_order = ? WHERE id = ?', [sort_order, id]);
        });
    }
};


module.exports = SkillCategoryRepository;
