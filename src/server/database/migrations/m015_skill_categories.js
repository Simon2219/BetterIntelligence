const { run } = require('../core/query');

function up() {
    run(`CREATE TABLE IF NOT EXISTS skill_categories (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);
        run(`CREATE TABLE IF NOT EXISTS skill_category_assignments (
            skill_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (skill_id, category_id),
            FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES skill_categories(id) ON DELETE CASCADE
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_skill_categories_user ON skill_categories(user_id)');
}

module.exports = {
    id: '015',
    name: 'skill_categories',
    up
};
