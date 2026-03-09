/**
 * Deploy namespace - Anonymous embed chat via /deploy/:slug
 */
const deploymentChatService = require('../services/deploymentChatService');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const notificationService = require('../services/notificationService');
const log = require('../services/Logger')('deploy');

function initDeploySocket(io) {
    io.of(/^\/deploy\/[\w-]+$/).on('connection', (socket) => {
        const nsp = socket.nsp.name;
        const slug = nsp.replace('/deploy/', '');

        let context;
        try {
            context = deploymentChatService.loadDeploymentContextBySlug(slug, {
                requireEmbedEnabled: true,
                requireAgentActive: true
            });
        } catch (err) {
            socket.emit('agent:error', { error: err.message || 'Deployment not available' });
            socket.disconnect(true);
            return;
        }

        socket.dep = context.dep;
        socket.agent = context.agent;
        socket.embedSessionId = socket.id;

        const initialEntitlement = catalogEntitlementService.resolveDeploymentEntitlement({
            deployment: context.dep
        });
        if (!initialEntitlement.allowed) {
            socket.emit('agent:error', {
                error: initialEntitlement.reason === 'quota_exhausted'
                    ? 'Quota exceeded'
                    : 'Deployment is not available for anonymous embed access'
            });
            socket.disconnect(true);
            return;
        }

        log.info('Embed connected', { slug, sessionId: socket.embedSessionId });

        socket.on('deploy:message', async (data) => {
            let chatId = null;
            try {
                const message = String(data?.message || '').trim();
                if (!message) {
                    socket.emit('agent:error', { error: 'message required' });
                    return;
                }
                if (message.length > 10000) {
                    socket.emit('agent:error', { error: 'Message must be under 10,000 characters' });
                    return;
                }

                const resolved = deploymentChatService.resolveOrCreateEmbedConversation({
                    slug,
                    conversationId: data?.conversationId,
                    embedSessionId: socket.embedSessionId
                });
                const entitlement = catalogEntitlementService.resolveDeploymentEntitlement({
                    deployment: resolved.dep
                });
                if (!entitlement.allowed) {
                    socket.emit('agent:error', {
                        error: entitlement.reason === 'quota_exhausted' ? 'Quota exceeded' : 'Deployment access denied'
                    });
                    return;
                }
                chatId = resolved.chat.id;
                socket.join(`deploy:chat:${chatId}`);
                if ((data?.conversationId || null) !== chatId) {
                    socket.emit('conversation:created', { conversationId: chatId });
                }

                socket.emit('chat:typing', { conversationId: chatId, isTyping: true });
                await deploymentChatService.handleEmbedUserMessage({
                    dep: resolved.dep,
                    agent: resolved.agent,
                    chat: resolved.chat,
                    embedSessionId: socket.embedSessionId,
                    message,
                    source: 'embed-socket',
                    emitToEmbed: true,
                    catalogEntitlement: entitlement
                });
            } catch (err) {
                log.error('deploy:message error', { err: err.message });
                socket.emit('agent:error', { error: err.message || 'Deployment message failed' });
                notificationService.createNotification({
                    userId: socket.agent?.user_id,
                    type: 'deploy_error',
                    title: `Deploy error: ${socket.agent?.name || slug}`,
                    body: err.message || 'Deployment message failed',
                    severity: 'error',
                    meta: { deploymentSlug: slug, chatId: chatId || null }
                });
            } finally {
                socket.emit('chat:typing', { conversationId: chatId, isTyping: false });
            }
        });

        socket.on('disconnect', () => {
            log.info('Embed disconnected', { slug, sessionId: socket.embedSessionId });
        });
    });
}

module.exports = { initDeploySocket };
