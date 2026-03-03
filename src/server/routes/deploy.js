const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
    DeploymentRepository,
    DeploymentMemberRepository,
    AIAgentRepository,
    ChatRepository,
    HookConfigRepository,
    UserRepository
} = require('../database');
const { authenticate } = require('../middleware/auth');
const HooksService = require('../services/HooksService');
const deploymentAclService = require('../services/deploymentAclService');
const deploymentChatService = require('../services/deploymentChatService');
const deploymentStatsService = require('../services/deploymentStatsService');

const HOOK_EVENTS = ['deploy_request', 'agent_response', 'message_received', 'skill_invoked'];
const { DEPLOYMENT_ACTIONS } = deploymentAclService;

function isSameUser(a, b) {
    return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
}

function toManagerRole(rawRole) {
    return String(rawRole || '').trim().toLowerCase() === 'admin' ? 'admin' : 'manager';
}

function serializeAccess(access) {
    return {
        role: access?.role || null,
        permissions: access?.permissions || deploymentAclService.getDefaultManagerPermissions(),
        isOwner: access?.role === 'owner',
        isAdmin: access?.role === 'admin',
        isManager: access?.role === 'manager',
        hasAccess: !!access?.hasAccess
    };
}

function serializeMember(member) {
    if (!member) return null;
    const userId = member.user_id || member.userId || null;
    const role = String(member.role || '').trim().toLowerCase() || 'manager';
    return {
        userId,
        username: member.username || null,
        displayName: member.display_name || member.displayName || null,
        role,
        permissions: deploymentAclService.normalizeManagerPermissions(member.permissions, role),
        createdBy: member.created_by || member.createdBy || null,
        createdAt: member.created_at || member.createdAt || null,
        updatedAt: member.updated_at || member.updatedAt || null,
        isOwner: role === 'owner'
    };
}

function parseBooleanInput(value, fallback = null) {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function serializeDeploymentForList(row, userId) {
    const access = deploymentAclService.resolveDeploymentAccess(row, userId);
    return {
        id: row.id,
        slug: row.slug,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        ownerUserId: row.owner_user_id || null,
        status: {
            embedEnabled: (row.embed_enabled ?? 1) === 1,
            apiEnabled: (row.api_enabled ?? 0) === 1
        },
        activity: {
            chatCount: Number(row.chat_count || 0),
            lastMessageAt: row.last_message_at || null
        },
        agent: {
            id: row.agent_id || null,
            name: row.agent_name || null,
            avatarUrl: row.agent_avatar_url || null
        },
        access: serializeAccess(access)
    };
}

function listMembersWithOwner(deployment) {
    const members = DeploymentMemberRepository.listByDeployment(deployment.id)
        .map((member) => serializeMember(member))
        .filter(Boolean);
    const ownerUserId = deployment.owner_user_id || null;
    const ownerUser = ownerUserId ? UserRepository.getById(ownerUserId) : null;
    const ownerMember = ownerUserId
        ? {
            userId: ownerUserId,
            username: ownerUser?.username || null,
            displayName: ownerUser?.display_name || null,
            role: 'owner',
            permissions: deploymentAclService.getFullPermissions(),
            createdBy: null,
            createdAt: deployment.created_at || null,
            updatedAt: deployment.updated_at || null,
            isOwner: true
        }
        : null;

    const filteredMembers = members.filter((member) => !ownerUserId || !isSameUser(member.userId, ownerUserId));
    return ownerMember ? [ownerMember, ...filteredMembers] : filteredMembers;
}

function loadDeployment(req, res, next) {
    const dep = DeploymentRepository.getBySlug(req.params.slug);
    if (!dep) return res.status(404).json({ success: false, error: 'Deployment not found' });
    req.dep = dep;
    next();
}

function requireDeploymentAction(action) {
    return (req, res, next) => {
        const access = deploymentAclService.resolveDeploymentAccess(req.dep, req.user?.id);
        req.deploymentAccess = access;
        if (!deploymentAclService.canPerform(access, action)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        next();
    };
}

router.get('/', authenticate, (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const role = String(req.query.role || '').trim().toLowerCase();
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
        const rows = DeploymentRepository.listAccessibleByUser(req.user.id, { q, role, limit });
        const deployments = rows.map((row) => serializeDeploymentForList(row, req.user.id));
        res.json({ success: true, data: { deployments } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/check', (req, res) => {
    const dep = DeploymentRepository.getBySlug(req.params.slug);
    res.json({ success: true, available: !dep });
});

router.post('/', authenticate, (req, res) => {
    try {
        const { agentId, slug } = req.body;
        if (!agentId || !slug) return res.status(400).json({ success: false, error: 'agentId and slug required' });
        if (typeof slug !== 'string' || slug.length < 3 || slug.length > 50) return res.status(400).json({ success: false, error: 'Slug must be 3-50 characters' });
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        if (!safeSlug || !/^[a-z0-9]/.test(safeSlug)) return res.status(400).json({ success: false, error: 'Slug must start with a letter or number' });

        const agent = AIAgentRepository.getById(agentId);
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });

        const existing = DeploymentRepository.getBySlug(safeSlug);
        if (existing) return res.status(409).json({ success: false, error: 'Slug taken' });

        const dep = DeploymentRepository.create(agentId, safeSlug, req.user.id);
        res.status(201).json({ success: true, data: dep });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug', (req, res) => {
    const dep = DeploymentRepository.getBySlug(req.params.slug);
    if (!dep) return res.status(404).json({ success: false, error: 'Deployment not found' });
    const agent = AIAgentRepository.getById(dep.agent_id);
    res.json({ success: true, data: { slug: dep.slug, agent: agent ? { name: agent.name } : null } });
});

router.get('/:slug/manage', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.VIEW_DEPLOYMENT), (req, res) => {
    try {
        const dep = req.dep;
        const agent = AIAgentRepository.getById(dep.agent_id);
        const operational = deploymentStatsService.getDeploymentOperationalSummary(dep.id);
        res.json({
            success: true,
            data: {
                deployment: {
                    id: dep.id,
                    slug: dep.slug,
                    ownerUserId: dep.owner_user_id || null,
                    embedEnabled: (dep.embed_enabled ?? 1) === 1,
                    apiEnabled: (dep.api_enabled ?? 0) === 1,
                    webhookUrl: dep.webhook_url || '',
                    createdAt: dep.created_at || null,
                    updatedAt: dep.updated_at || null
                },
                agent: agent ? {
                    id: agent.id,
                    name: agent.name,
                    avatarUrl: agent.avatar_url || '',
                    textProvider: agent.text_provider || '',
                    textModel: agent.text_model || '',
                    imageProvider: agent.image_provider || '',
                    imageModel: agent.image_model || ''
                } : null,
                access: serializeAccess(req.deploymentAccess),
                operational
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/:slug/config', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_CONFIG), (req, res) => {
    try {
        const updates = {};
        const embedEnabled = parseBooleanInput(req.body?.embedEnabled, null);
        const webhookUrl = req.body?.webhookUrl;
        if (embedEnabled !== null) updates.embed_enabled = embedEnabled ? 1 : 0;
        if (webhookUrl !== undefined) updates.webhook_url = String(webhookUrl || '').trim();
        const updated = DeploymentRepository.update(req.dep.slug, updates);
        res.json({
            success: true,
            data: {
                deployment: {
                    id: updated.id,
                    slug: updated.slug,
                    embedEnabled: (updated.embed_enabled ?? 1) === 1,
                    apiEnabled: (updated.api_enabled ?? 0) === 1,
                    webhookUrl: updated.webhook_url || '',
                    updatedAt: updated.updated_at || null
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/stats', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.VIEW_CHATS), (req, res) => {
    try {
        const stats = deploymentStatsService.getDeploymentStats(req.dep.id, {
            days: req.query.days
        });
        res.json({
            success: true,
            data: {
                deploymentId: req.dep.id,
                slug: req.dep.slug,
                ...stats
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/hooks', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_CONFIG), (req, res) => {
    try {
        const hooks = HookConfigRepository.listByDeployment(req.dep.id);
        res.json({ success: true, data: { hooks, access: serializeAccess(req.deploymentAccess) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:slug/hooks', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_CONFIG), (req, res) => {
    try {
        const { event, url, enabled = true } = req.body || {};
        if (!event || !url || typeof url !== 'string') return res.status(400).json({ success: false, error: 'event and url required' });
        if (!HOOK_EVENTS.includes(event)) return res.status(400).json({ success: false, error: `event must be one of: ${HOOK_EVENTS.join(', ')}` });
        try { new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }
        const hook = HookConfigRepository.add(req.dep.id, event, url, enabled);
        HooksService.loadFromDb();
        res.status(201).json({ success: true, data: hook });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:slug/hooks/:id', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_CONFIG), (req, res) => {
    try {
        const hookId = parseInt(req.params.id, 10);
        if (isNaN(hookId)) return res.status(400).json({ success: false, error: 'Invalid hook id' });
        const hook = HookConfigRepository.getById(hookId);
        if (!hook || hook.deployment_id !== req.dep.id) return res.status(404).json({ success: false, error: 'Hook not found' });
        HookConfigRepository.remove(hookId);
        HooksService.loadFromDb();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:slug/api-key', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_CONFIG), (req, res) => {
    try {
        const apiKey = 'bi_' + crypto.randomBytes(24).toString('hex');
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
        DeploymentRepository.update(req.params.slug, { api_key_hash: keyHash, api_enabled: 1 });
        res.json({ success: true, data: { apiKey, message: 'Save this key. It will not be shown again.' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/chats', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.VIEW_CHATS), (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 80;
        const chats = ChatRepository.listForDeployment(req.dep.id, { limit });
        res.json({
            success: true,
            data: {
                chats,
                access: serializeAccess(req.deploymentAccess)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/chats/:chatId/messages', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.VIEW_CHATS), (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });
        if (parseInt(chat.deployment_id, 10) !== parseInt(req.dep.id, 10)) {
            return res.status(404).json({ success: false, error: 'Chat not found' });
        }

        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const before = req.query.before || null;
        const messages = ChatRepository.getMessages(chat.id, limit, before);
        res.json({ success: true, data: { chatId: chat.id, messages } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/members', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_MEMBERS), (req, res) => {
    try {
        const members = listMembersWithOwner(req.dep);
        res.json({
            success: true,
            data: {
                members,
                access: serializeAccess(req.deploymentAccess)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/:slug/member-search', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_MEMBERS), (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q || q.length < 2) {
            return res.json({ success: true, data: { users: [] } });
        }

        const users = UserRepository.searchByUserIdOrUsername(q, 20);
        const existingMembers = listMembersWithOwner(req.dep);
        const existingIds = new Set(existingMembers.map((member) => String(member.userId || '').toUpperCase()).filter(Boolean));
        const ownerId = String(req.dep.owner_user_id || '').toUpperCase();

        const results = users.map((user) => {
            const userId = String(user.id || '');
            const upperUserId = userId.toUpperCase();
            return {
                userId,
                username: user.username || '',
                displayName: user.display_name || '',
                email: user.email || '',
                isOwner: !!ownerId && upperUserId === ownerId,
                isMember: existingIds.has(upperUserId)
            };
        });

        res.json({ success: true, data: { users: results } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:slug/members', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_MEMBERS), (req, res) => {
    try {
        const userId = String(req.body?.userId || '').trim();
        if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
        if (req.dep.owner_user_id && isSameUser(req.dep.owner_user_id, userId)) {
            return res.status(400).json({ success: false, error: 'Owner is managed separately and cannot be added as a member' });
        }

        const user = UserRepository.getById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const role = toManagerRole(req.body?.role);
        const permissions = deploymentAclService.normalizeManagerPermissions(req.body?.permissions || {}, role);
        DeploymentMemberRepository.upsertMember({
            deploymentId: req.dep.id,
            userId,
            role,
            permissions,
            createdBy: req.user.id
        });
        const enriched = DeploymentMemberRepository.getByDeploymentAndUser(req.dep.id, userId);
        res.status(201).json({ success: true, data: serializeMember(enriched) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/:slug/members/:userId', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_MEMBERS), (req, res) => {
    try {
        const targetUserId = String(req.params.userId || '').trim();
        if (!targetUserId) return res.status(400).json({ success: false, error: 'userId required' });
        if (req.dep.owner_user_id && isSameUser(req.dep.owner_user_id, targetUserId)) {
            return res.status(400).json({ success: false, error: 'Owner permissions cannot be modified from members endpoint' });
        }

        const existing = DeploymentMemberRepository.getByDeploymentAndUser(req.dep.id, targetUserId);
        if (!existing) return res.status(404).json({ success: false, error: 'Member not found' });

        const role = req.body?.role ? toManagerRole(req.body.role) : toManagerRole(existing.role);
        const sourcePermissions = req.body?.permissions !== undefined
            ? req.body.permissions
            : existing.permissions;
        const permissions = deploymentAclService.normalizeManagerPermissions(sourcePermissions, role);

        DeploymentMemberRepository.upsertMember({
            deploymentId: req.dep.id,
            userId: targetUserId,
            role,
            permissions,
            createdBy: req.user.id
        });
        const enriched = DeploymentMemberRepository.getByDeploymentAndUser(req.dep.id, targetUserId);
        res.json({ success: true, data: serializeMember(enriched) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:slug/members/:userId', authenticate, loadDeployment, requireDeploymentAction(DEPLOYMENT_ACTIONS.MANAGE_MEMBERS), (req, res) => {
    try {
        const targetUserId = String(req.params.userId || '').trim();
        if (!targetUserId) return res.status(400).json({ success: false, error: 'userId required' });
        if (req.dep.owner_user_id && isSameUser(req.dep.owner_user_id, targetUserId)) {
            return res.status(400).json({ success: false, error: 'Owner cannot be removed from deployment' });
        }
        const removed = DeploymentMemberRepository.removeMember(req.dep.id, targetUserId);
        if (!removed) return res.status(404).json({ success: false, error: 'Member not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/:slug/chat', async (req, res) => {
    try {
        const slug = String(req.params.slug || '').trim();
        const message = String(req.body?.message || '').trim();
        const conversationId = String(req.body?.conversationId || '').trim() || null;
        if (!message) return res.status(400).json({ success: false, error: 'message required' });
        if (message.length > 10000) return res.status(400).json({ success: false, error: 'Message too long (max 10,000 characters)' });

        const resolved = deploymentChatService.resolveOrCreateEmbedConversation({
            slug,
            conversationId,
            embedSessionId: `rest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        });
        const result = await deploymentChatService.handleEmbedUserMessage({
            dep: resolved.dep,
            agent: resolved.agent,
            chat: resolved.chat,
            embedSessionId: resolved.chat.embed_session_id || `rest-${resolved.chat.id}`,
            message,
            source: 'embed-rest',
            emitToEmbed: true
        });
        res.json({ success: true, data: result });
    } catch (err) {
        const status = Number(err.statusCode || 500);
        res.status(status).json({ success: false, error: err.message });
    }
});

module.exports = router;
