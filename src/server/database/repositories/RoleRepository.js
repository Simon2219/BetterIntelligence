const { run, all, get } = require('../core/query');


const PERMISSION_COLUMNS = ['can_access_admin', 'can_manage_settings', 'can_manage_roles', 'can_manage_users'];

const RoleRepository = {
    getById(id) { return get('SELECT * FROM roles WHERE id = ?', [id]); },
    getByName(name) { return get('SELECT * FROM roles WHERE LOWER(name) = LOWER(?)', [name]); },
    getAllRoles() { return all('SELECT * FROM roles ORDER BY id'); },
    getRoleCount() {
        const row = get('SELECT COUNT(*) as c FROM roles', []);
        return row?.c ?? 0;
    },
    getPermissionColumns() { return PERMISSION_COLUMNS; },
    hasPermission(role, permission) {
        if (!role) return false;
        if (role.is_admin === 1) return true;
        return role[permission] === 1;
    },
    create(data) {
        const permCols = PERMISSION_COLUMNS.join(', ');
        const permVals = PERMISSION_COLUMNS.map(c => data[c] ? 1 : 0).join(', ');
        run(`INSERT INTO roles (name, description, is_system, is_admin, ${permCols}) VALUES (?, ?, 0, 0, ${permVals})`,
            [data.name, data.description || '']);
        return get('SELECT * FROM roles WHERE id = last_insert_rowid()');
    },
    update(id, data) {
        const allowed = ['name', 'description', 'is_admin', ...PERMISSION_COLUMNS];
        const sets = [];
        const vals = [];
        for (const k of allowed) {
            if (data[k] === undefined) continue;
            let val = data[k];
            if (typeof val === 'boolean') val = val ? 1 : 0;
            sets.push(`${k} = ?`);
            vals.push(val);
        }
        if (sets.length === 0) return this.getById(id);
        vals.push(id);
        run(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, vals);
        return this.getById(id);
    },
    delete(id) {
        const role = this.getById(id);
        if (role?.is_system === 1) throw new Error('Cannot delete system role');
        run('UPDATE users SET role_id = 1 WHERE role_id = ?', [id]);
        run('DELETE FROM roles WHERE id = ?', [id]);
    }
};


module.exports = RoleRepository;
