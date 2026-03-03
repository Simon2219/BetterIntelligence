const { run, all, get } = require('../core/query');

function parsePermissions(rawPermissions) {
    if (!rawPermissions) return {};
    if (typeof rawPermissions === 'object') return rawPermissions;
    try {
        const parsed = JSON.parse(rawPermissions);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        ...row,
        permissions: parsePermissions(row.permissions)
    };
}

const DeploymentMemberRepository = {
    getByDeploymentAndUser(deploymentId, userId) {
        const row = get(`SELECT *
            FROM deployment_members
            WHERE deployment_id = ? AND UPPER(user_id) = UPPER(?)`, [deploymentId, userId]);
        return mapRow(row);
    },

    listByDeployment(deploymentId) {
        const rows = all(`SELECT dm.*, u.username, u.display_name
            FROM deployment_members dm
            LEFT JOIN users u ON UPPER(u.id) = UPPER(dm.user_id)
            WHERE dm.deployment_id = ?
            ORDER BY CASE WHEN dm.role = 'admin' THEN 0 ELSE 1 END, dm.created_at ASC`, [deploymentId]);
        return rows.map(mapRow);
    },

    upsertMember({ deploymentId, userId, role, permissions, createdBy = null }) {
        const existing = this.getByDeploymentAndUser(deploymentId, userId);
        const normalizedRole = role === 'admin' ? 'admin' : 'manager';
        const encodedPermissions = JSON.stringify(permissions && typeof permissions === 'object' ? permissions : {});

        if (existing) {
            run(`UPDATE deployment_members
                SET role = ?, permissions = ?, updated_at = datetime('now')
                WHERE id = ?`, [normalizedRole, encodedPermissions, existing.id]);
        } else {
            run(`INSERT INTO deployment_members (
                deployment_id, user_id, role, permissions, created_by
            ) VALUES (?, ?, ?, ?, ?)`, [deploymentId, userId, normalizedRole, encodedPermissions, createdBy]);
        }
        return this.getByDeploymentAndUser(deploymentId, userId);
    },

    removeMember(deploymentId, userId) {
        const existing = this.getByDeploymentAndUser(deploymentId, userId);
        if (!existing) return false;
        const result = run(`DELETE FROM deployment_members
            WHERE deployment_id = ? AND UPPER(user_id) = UPPER(?)`, [deploymentId, userId]);
        return (result?.changes || 0) > 0;
    }
};

module.exports = DeploymentMemberRepository;

