const { DeploymentMemberRepository } = require('../database');

const MANAGER_PERMISSION_KEYS = [
    'view_chats',
    'manage_chats',
    'manage_config',
    'manage_members'
];

const DEPLOYMENT_ACTIONS = {
    VIEW_CHATS: 'view_chats',
    MANAGE_CHATS: 'manage_chats',
    MANAGE_CONFIG: 'manage_config',
    MANAGE_MEMBERS: 'manage_members',
    VIEW_DEPLOYMENT: 'view_deployment'
};

function toObject(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function isSameUser(a, b) {
    return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

function getFullPermissions() {
    return {
        view_chats: true,
        manage_chats: true,
        manage_config: true,
        manage_members: true
    };
}

function getDefaultManagerPermissions() {
    return {
        view_chats: true,
        manage_chats: false,
        manage_config: false,
        manage_members: false
    };
}

function normalizeManagerPermissions(rawPermissions, role = 'manager') {
    const seed = role === 'admin'
        ? getFullPermissions()
        : getDefaultManagerPermissions();
    const incoming = toObject(rawPermissions);
    const normalized = { ...seed };
    MANAGER_PERMISSION_KEYS.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) {
            normalized[key] = !!incoming[key];
        }
    });
    if (role === 'admin') return getFullPermissions();
    return normalized;
}

function resolveDeploymentAccess(deployment, userId) {
    if (!deployment || !userId) {
        return {
            hasAccess: false,
            role: null,
            permissions: getDefaultManagerPermissions(),
            membership: null
        };
    }

    if (deployment.owner_user_id && isSameUser(deployment.owner_user_id, userId)) {
        return {
            hasAccess: true,
            role: 'owner',
            permissions: getFullPermissions(),
            membership: null
        };
    }

    const membership = DeploymentMemberRepository.getByDeploymentAndUser(deployment.id, userId);
    if (!membership) {
        return {
            hasAccess: false,
            role: null,
            permissions: getDefaultManagerPermissions(),
            membership: null
        };
    }

    const role = membership.role === 'admin' ? 'admin' : 'manager';
    return {
        hasAccess: true,
        role,
        permissions: normalizeManagerPermissions(membership.permissions, role),
        membership
    };
}

function canPerform(access, action) {
    if (!access?.hasAccess) return false;
    if (access.role === 'owner' || access.role === 'admin') return true;

    const permissions = access.permissions || getDefaultManagerPermissions();
    switch (action) {
    case DEPLOYMENT_ACTIONS.VIEW_DEPLOYMENT:
        return true;
    case DEPLOYMENT_ACTIONS.VIEW_CHATS:
        return !!permissions.view_chats || !!permissions.manage_chats;
    case DEPLOYMENT_ACTIONS.MANAGE_CHATS:
        return !!permissions.manage_chats;
    case DEPLOYMENT_ACTIONS.MANAGE_CONFIG:
        return !!permissions.manage_config;
    case DEPLOYMENT_ACTIONS.MANAGE_MEMBERS:
        return !!permissions.manage_members;
    default:
        return false;
    }
}

module.exports = {
    MANAGER_PERMISSION_KEYS,
    DEPLOYMENT_ACTIONS,
    getFullPermissions,
    getDefaultManagerPermissions,
    normalizeManagerPermissions,
    resolveDeploymentAccess,
    canPerform
};

