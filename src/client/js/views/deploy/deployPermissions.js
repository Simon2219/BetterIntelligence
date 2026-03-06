export const DEPLOY_PERMISSION_KEYS = ['view_chats', 'manage_chats', 'manage_config', 'manage_members'];

export const DEPLOY_PERMISSION_LABELS = {
    view_chats: 'View Chats',
    manage_chats: 'Manage Chats',
    manage_config: 'Manage Config',
    manage_members: 'Manage Members'
};

export function normalizeDeployRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    return (normalized === 'owner' || normalized === 'admin') ? normalized : 'manager';
}

export function fullDeployPermissions() {
    return {
        view_chats: true,
        manage_chats: true,
        manage_config: true,
        manage_members: true
    };
}

export function normalizeDeployPermissions(raw, role) {
    const normalizedRole = normalizeDeployRole(role);
    if (normalizedRole === 'owner' || normalizedRole === 'admin') return fullDeployPermissions();
    const permissions = raw && typeof raw === 'object' ? raw : {};
    return {
        view_chats: permissions.view_chats !== false,
        manage_chats: !!permissions.manage_chats,
        manage_config: !!permissions.manage_config,
        manage_members: !!permissions.manage_members
    };
}

export function deployBadgeClass(role) {
    return `deploy-role-badge deploy-role-badge--${normalizeDeployRole(role)}`;
}

export function deployRoleLabel(role) {
    const normalized = normalizeDeployRole(role);
    return normalized[0].toUpperCase() + normalized.slice(1);
}

export function deploymentCapabilities(access) {
    const role = normalizeDeployRole(access?.role);
    const permissions = normalizeDeployPermissions(access?.permissions, role);
    const isOwnerOrAdmin = role === 'owner' || role === 'admin';
    return {
        role,
        permissions,
        canViewChats: isOwnerOrAdmin || permissions.view_chats || permissions.manage_chats,
        canManageChats: isOwnerOrAdmin || permissions.manage_chats,
        canManageConfig: isOwnerOrAdmin || permissions.manage_config,
        canManageMembers: isOwnerOrAdmin || permissions.manage_members
    };
}
