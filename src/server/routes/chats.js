/**
 * Chat Routes - chat CRUD, personal chats, deployment chats
 */

const express = require('express');
const router = express.Router();
const {
    ChatRepository,
    AIAgentRepository,
    DeploymentRepository
} = require('../database');
const { authenticate } = require('../middleware/auth');
const log = require('../services/Logger')('chat');
const { generateThreadSummary, sanitizeSummary, MAX_THREAD_SUMMARY_CHARS } = require('../services/chatSummaryService');
const deploymentAclService = require('../services/deploymentAclService');
const deploymentChatService = require('../services/deploymentChatService');
const { hydrateAgentModelAvailability, serializeAgentWithAvailability } = require('../services/agentAvailabilityService');

const { DEPLOYMENT_ACTIONS } = deploymentAclService;

function isSameUser(left, right) {
    return String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase();
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return false;
}

function serializeAgent(agent) {
    if (!agent) return null;
    const hydrated = hydrateAgentModelAvailability(agent, { clone: true });
    return serializeAgentWithAvailability(hydrated);
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

function resolveChatAccess(chat, userId) {
    const isParticipant = chat?.participant_1 && isSameUser(chat.participant_1, userId);
    if (isParticipant) {
        return {
            chatType: 'personal',
            canView: true,
            canManage: true,
            isParticipant: true,
            deployment: null,
            access: null
        };
    }

    if (!chat?.deployment_id) {
        return {
            chatType: 'unknown',
            canView: false,
            canManage: false,
            isParticipant: false,
            deployment: null,
            access: null
        };
    }

    const deployment = DeploymentRepository.getById(chat.deployment_id);
    if (!deployment) {
        return {
            chatType: 'deployment',
            canView: false,
            canManage: false,
            isParticipant: false,
            deployment: null,
            access: null
        };
    }

    const access = deploymentAclService.resolveDeploymentAccess(deployment, userId);
    return {
        chatType: 'deployment',
        canView: deploymentAclService.canPerform(access, DEPLOYMENT_ACTIONS.VIEW_CHATS),
        canManage: deploymentAclService.canPerform(access, DEPLOYMENT_ACTIONS.MANAGE_CHATS),
        isParticipant: false,
        deployment,
        access
    };
}

/**
 * GET /api/chats - List current user's personal chats (enriched with agent info)
 */
router.get('/', authenticate, (req, res) => {
    try {
        const chats = ChatRepository.listForUser(req.user.id);
        const enriched = chats.map((chat) => {
            const agent = chat.ai_agent_id ? AIAgentRepository.getById(chat.ai_agent_id) : null;
            const unreadCount = ChatRepository.getUnreadCount(chat.id, req.user.id);
            return {
                ...chat,
                chatType: 'personal',
                unreadCount,
                hasUnread: unreadCount > 0,
                agent: serializeAgent(agent)
            };
        });
        res.json({ success: true, data: enriched });
    } catch (err) {
        log.error('List error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to list chats' });
    }
});

/**
 * GET /api/chats/deployments - List deployment chats current user can access
 */
router.get('/deployments', authenticate, (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 180;
        const q = String(req.query.q || '').trim();
        const rows = ChatRepository.listDeploymentChatsForUser(req.user.id, { limit, q });
        const chats = rows.map((row) => {
            const owner = isSameUser(row.deployment_owner_user_id, req.user.id);
            const role = owner ? 'owner' : (String(row.member_role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'manager');
            const permissions = deploymentAclService.normalizeManagerPermissions(row.member_permissions, role);
            const access = {
                role,
                permissions,
                hasAccess: true
            };
            if (!deploymentAclService.canPerform(access, DEPLOYMENT_ACTIONS.VIEW_CHATS)) {
                return null;
            }
            const resolvedAgentId = row.deployment_agent_id || row.ai_agent_id || row.agent_id;
            const resolvedAgent = resolvedAgentId ? AIAgentRepository.getById(resolvedAgentId) : null;
            return {
                ...row,
                chatType: 'deployment',
                unreadCount: 0,
                hasUnread: false,
                access: serializeAccess(access),
                deployment: {
                    id: row.deployment_id,
                    slug: row.deployment_slug
                },
                agent: serializeAgent(resolvedAgent || {
                    id: resolvedAgentId,
                    name: row.agent_name || null,
                    avatar_url: row.agent_avatar_url || null
                })
            };
        }).filter(Boolean);
        res.json({ success: true, data: chats });
    } catch (err) {
        log.error('Deployment chats list error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to list deployment chats' });
    }
});

/**
 * GET /api/chats/unread-count - Total unread count across personal chats
 */
router.get('/unread-count', authenticate, (req, res) => {
    try {
        const unreadCount = ChatRepository.getUnreadCountForUser(req.user.id);
        res.json({ success: true, data: { unreadCount } });
    } catch (err) {
        log.error('Unread count error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to get unread count' });
    }
});

/**
 * POST /api/chats - Create personal chat with an agent
 */
router.post('/', authenticate, (req, res) => {
    try {
        const { agentId, forceNew } = req.body;
        if (!agentId) return res.status(400).json({ success: false, error: 'agentId required' });
        const agent = AIAgentRepository.getById(agentId);
        if (!agent) return res.status(404).json({ success: false, error: 'Agent not found' });
        const chat = forceNew
            ? ChatRepository.create(req.user.id, agentId, { isAiChat: true, aiAgentId: agentId })
            : ChatRepository.getOrCreate(req.user.id, agentId);
        res.json({ success: true, data: chat });
    } catch (err) {
        log.error('Create error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to create chat' });
    }
});

/**
 * POST /api/chats/:chatId/operator-reply - Deployment chat operator actions
 */
router.post('/:chatId/operator-reply', authenticate, async (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const access = resolveChatAccess(chat, req.user.id);
        if (access.chatType !== 'deployment') {
            return res.status(400).json({ success: false, error: 'operator-reply is only available for deployment chats' });
        }
        if (!access.canManage) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const result = await deploymentChatService.sendOperatorReply({
            chatId: chat.id,
            operatorUserId: req.user.id,
            mode: req.body?.mode,
            content: req.body?.content,
            useLatestUserMessage: parseBoolean(req.body?.useLatestUserMessage)
        });
        res.json({ success: true, data: result });
    } catch (err) {
        const status = Number(err.statusCode || 500);
        res.status(status).json({ success: false, error: err.message || 'Failed to process operator reply' });
    }
});

/**
 * GET /api/chats/:chatId - Get chat by ID (personal participant or deployment ACL)
 */
router.get('/:chatId', authenticate, (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const resolved = resolveChatAccess(chat, req.user.id);
        if (!resolved.canView) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const agent = chat.ai_agent_id ? AIAgentRepository.getById(chat.ai_agent_id) : null;
        res.json({
            success: true,
            data: {
                ...chat,
                chatType: resolved.chatType,
                access: resolved.access ? serializeAccess(resolved.access) : null,
                deployment: resolved.deployment ? {
                    id: resolved.deployment.id,
                    slug: resolved.deployment.slug
                } : null,
                agent: serializeAgent(agent)
            }
        });
    } catch (err) {
        log.error('Get chat error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to get chat' });
    }
});

/**
 * GET /api/chats/:chatId/messages - Get chat messages
 */
router.get('/:chatId/messages', authenticate, (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const resolved = resolveChatAccess(chat, req.user.id);
        if (!resolved.canView) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;
        const before = req.query.before || null;
        const messages = ChatRepository.getMessages(chat.id, limit, before);
        res.json({
            success: true,
            data: {
                chatId: chat.id,
                chatType: resolved.chatType,
                messages
            }
        });
    } catch (err) {
        log.error('Get messages error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to get messages' });
    }
});

/**
 * PUT /api/chats/:chatId/read - Mark messages as read
 */
router.put('/:chatId/read', authenticate, (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const resolved = resolveChatAccess(chat, req.user.id);
        if (!resolved.canView) return res.status(403).json({ success: false, error: 'Access denied' });

        const { upToTimestamp } = req.body;
        ChatRepository.markRead(chat.id, req.user.id, upToTimestamp || null);
        res.json({ success: true });
    } catch (err) {
        log.error('Mark read error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to mark as read' });
    }
});

/**
 * POST /api/chats/:chatId/summary - Generate and persist one-line thread summary
 */
router.post('/:chatId/summary', authenticate, async (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const resolved = resolveChatAccess(chat, req.user.id);
        if (!resolved.canView) return res.status(403).json({ success: false, error: 'Access denied' });

        const MIN_MESSAGES_BETWEEN_SUMMARIES = 50;
        const SHORT_THREAD_DYNAMIC_LIMIT = 5;
        const forceRegenerate = req.body?.force === true;
        const agent = chat.ai_agent_id ? AIAgentRepository.getById(chat.ai_agent_id) : null;
        const currentMessageCount = ChatRepository.getMessageCount(chat.id);
        const existingSummary = String(chat.thread_summary || '').trim();
        const summaryMessageCount = parseInt(chat.thread_summary_message_count, 10) || 0;
        const shortThreadNeedsRefresh = currentMessageCount > 0
            && currentMessageCount <= SHORT_THREAD_DYNAMIC_LIMIT
            && summaryMessageCount < currentMessageCount;
        const shouldRegenerate = forceRegenerate
            || !existingSummary
            || shortThreadNeedsRefresh
            || (currentMessageCount - summaryMessageCount) >= MIN_MESSAGES_BETWEEN_SUMMARIES;

        if (!shouldRegenerate) {
            return res.json({
                success: true,
                data: {
                    chatId: chat.id,
                    summary: existingSummary,
                    updated: false,
                    messageCount: currentMessageCount,
                    summaryMessageCount,
                    regenerateAfter: MIN_MESSAGES_BETWEEN_SUMMARIES,
                    shortThreadDynamicLimit: SHORT_THREAD_DYNAMIC_LIMIT
                }
            });
        }

        const messages = ChatRepository.getMessages(chat.id, 60);

        let summary = '';
        if (agent && messages.length >= 2) {
            try {
                summary = await generateThreadSummary({ agent, messages });
            } catch (err) {
                log.warn('Thread summary AI generation failed', { chatId: chat.id, err: err.message });
            }
        }

        if (!summary) {
            const latestText = [...messages]
                .reverse()
                .map((message) => String(message.content || '').trim())
                .find(Boolean);
            if (existingSummary) {
                summary = existingSummary;
            } else if (messages.length <= 1) {
                summary = 'New conversation';
            } else if (latestText) {
                summary = latestText;
            } else {
                summary = `Conversation with ${String(agent?.name || 'agent').trim()}`;
            }
        }

        summary = sanitizeSummary(summary) || `Conversation ${String(chat.id || '').slice(-4).toUpperCase() || ''}`.trim().slice(0, MAX_THREAD_SUMMARY_CHARS);

        ChatRepository.setThreadSummary(chat.id, summary, currentMessageCount);
        res.json({
            success: true,
            data: {
                chatId: chat.id,
                summary,
                updated: true,
                messageCount: currentMessageCount,
                summaryMessageCount: currentMessageCount,
                regenerateAfter: MIN_MESSAGES_BETWEEN_SUMMARIES,
                shortThreadDynamicLimit: SHORT_THREAD_DYNAMIC_LIMIT
            }
        });
    } catch (err) {
        log.error('Generate summary error', { err: err.message, chatId: req.params.chatId });
        res.status(500).json({ success: false, error: 'Failed to generate summary' });
    }
});

/**
 * DELETE /api/chats/:chatId - Delete personal chat only
 */
router.delete('/:chatId', authenticate, (req, res) => {
    try {
        const chat = ChatRepository.getById(req.params.chatId);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });
        if (!chat.participant_1) return res.status(403).json({ success: false, error: 'Deployment chats cannot be deleted via this endpoint' });
        if (!isSameUser(chat.participant_1, req.user.id)) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        ChatRepository.delete(chat.id);
        res.json({ success: true });
    } catch (err) {
        log.error('Delete error', { err: err.message });
        res.status(500).json({ success: false, error: 'Failed to delete chat' });
    }
});

module.exports = router;
