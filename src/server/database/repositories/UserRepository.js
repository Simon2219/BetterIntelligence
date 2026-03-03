const { run, all, get } = require('../core/query');
const { generateUserId } = require('../core/ids');

const RoleRepository = require('./RoleRepository');

const UserRepository = {
    create(data) {
        const id = generateUserId();
        run(`INSERT INTO users (id, email, username, display_name, password_hash, role_id, avatar_url, bio, settings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, data.email, data.username, data.displayName, data.passwordHash, data.roleId || 2,
             data.avatarUrl || '', data.bio || '', JSON.stringify(data.settings || { theme: 'dark' })]);
        return this.getById(id);
    },

    getById(id) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE UPPER(u.id) = UPPER(?)`, [id]);
    },

    getByEmail(email) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE LOWER(u.email) = LOWER(?)`, [email]);
    },

    getByUsername(username) {
        return get(`SELECT u.*, r.name as role_name, r.is_admin as role_is_admin
            FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE LOWER(u.username) = LOWER(?)`, [username]);
    },

    getWithRole(id) {
        const u = this.getById(id);
        if (!u) return null;
        const role = RoleRepository.getById(u.role_id);
        return { ...u, role };
    },

    update(id, updates) {
        const fieldMap = {
            displayName: 'display_name',
            avatarUrl: 'avatar_url',
            bio: 'bio',
            settings: 'settings'
        };
        const sets = [];
        const vals = [];
        for (const [inputKey, col] of Object.entries(fieldMap)) {
            const value = updates[inputKey] !== undefined ? updates[inputKey] : updates[col];
            if (value === undefined) continue;
            sets.push(`${col} = ?`);
            vals.push(typeof value === 'object' ? JSON.stringify(value) : value);
        }
        if (sets.length === 0) return this.getById(id);
        sets.push("updated_at = datetime('now')");
        vals.push(id);
        run(`UPDATE users SET ${sets.join(', ')} WHERE UPPER(id) = UPPER(?)`, vals);
        return this.getById(id);
    },

    updatePassword(id, passwordHash) {
        run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE UPPER(id) = UPPER(?)", [passwordHash, id]);
    },

    setOnline(id) {
        run(`UPDATE users SET last_seen = datetime('now') WHERE UPPER(id) = UPPER(?)`, [id]);
    },

    getUserCount() {
        const r = get('SELECT COUNT(*) as c FROM users', []);
        return r?.c ?? 0;
    },

    searchByUserIdOrUsername(queryText, limit = 20) {
        const q = String(queryText || '').trim();
        if (!q) return [];
        const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
        const like = `%${q.toLowerCase()}%`;
        const idLike = `%${q.toUpperCase()}%`;
        return all(`SELECT
                u.id,
                u.username,
                u.display_name,
                u.email
            FROM users u
            WHERE UPPER(u.id) = UPPER(?)
               OR UPPER(u.id) LIKE ?
               OR LOWER(u.username) LIKE ?
            ORDER BY
                CASE
                    WHEN UPPER(u.id) = UPPER(?) THEN 0
                    WHEN LOWER(u.username) = LOWER(?) THEN 1
                    ELSE 2
                END,
                LOWER(u.username) ASC
            LIMIT ?`, [q, idLike, like, q, q, cappedLimit]);
    }
};


module.exports = UserRepository;
