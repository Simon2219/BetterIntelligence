const { run } = require('../core/query');
const { ignoreDuplicateColumnError } = require('./helpers');

function up() {
    const cols = [
            ['description', "TEXT DEFAULT ''"],
            ['is_system', 'INTEGER DEFAULT 0'],
            ['can_access_admin', 'INTEGER DEFAULT 0'],
            ['can_manage_settings', 'INTEGER DEFAULT 0'],
            ['can_manage_roles', 'INTEGER DEFAULT 0'],
            ['can_manage_users', 'INTEGER DEFAULT 0']
        ];
        for (const [name, def] of cols) {
            try { run(`ALTER TABLE roles ADD COLUMN ${name} ${def}`); } catch (e) { ignoreDuplicateColumnError(e); }
        }
        run("UPDATE roles SET can_access_admin = 1, can_manage_settings = 1, can_manage_roles = 1, can_manage_users = 1 WHERE is_admin = 1");
        run("UPDATE roles SET is_system = 1 WHERE id IN (1, 2)");
}

module.exports = {
    id: '011',
    name: 'roles_permissions',
    up
};
