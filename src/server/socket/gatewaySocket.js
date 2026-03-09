/**
 * Gateway-style Socket.io handler
 * Events: agent:invoke, agent:stream, agent:done, agent:media, agent:error
 */
const Config = require('../../../config/Config');
const { UserRepository, AIAgentRepository, ChatRepository, AnalyticsRepository } = require('../database');
const HooksService = require('../services/HooksService');
const ProviderRegistry = require('../ai/providers/ProviderRegistry');
const MainAIManager = require('../ai/MainAIManager');
const catalogEntitlementService = require('../services/catalogEntitlementService');
const { authenticateSocket } = require('./socketAuth');
const socketSessionRegistry = require('../services/socketSessionRegistry');
const notificationService = require('../services/notificationService');
const analyticsService = require('../services/analyticsService');
const Logger = require('../services/Logger');
const { isSameUser } = require('../utils/helperFunctions');
const log = Logger('socket');

function resolveUserChatAccess(chatId, userId) {
    const chat = ChatRepository.getById(chatId);
    if (!chat) return { ok: false, error: 'Chat not found', chat: null };
    if (!chat.participant_1 || !isSameUser(chat.participant_1, userId)) {
        return { ok: false, error: 'Access denied', chat: null };
    }
    return { ok: true, error: null, chat };
}

async function runAIPipeline(io, socket, chat, userId, message, opts = {}) {
    const chatId = chat.id;
    const agentId = chat.ai_agent_id || chat.participant_2;
    log.info('runAIPipeline start', { chatId, agentId, userId });
    const agent = catalogEntitlementService.getRuntimeAgentForResolvedEntitlement(opts.catalogEntitlement, agentId)
        || AIAgentRepository.getById(agentId);
    if (!agent) {
        const placeholder = 'Agent not found.';
        const assistantMsg = { senderId: agentId || 'assistant', type: 'text', content: placeholder, timestamp: new Date().toISOString() };
        ChatRepository.addMessage(chatId, assistantMsg);
        io.to(`chat:${chatId}`).emit('chat:message', { ...assistantMsg, chatId });
        socket.emit('agent:stream', { conversationId: chatId, chunk: placeholder, done: true });
        socket.emit('agent:done', { conversationId: chatId, response: placeholder });
        socket.emit('chat:typing', { agentId, conversationId: chatId, isTyping: false });
        return;
    }
    const user = UserRepository.getById(userId);
    const now = new Date().toISOString();

    if (!opts.userMsgAlreadyAdded) {
        const userMsg = { senderId: userId, type: 'text', content: message, timestamp: now };
        ChatRepository.addMessage(chatId, userMsg);
        io.to(`chat:${chatId}`).emit('chat:message', { ...userMsg, chatId });
        socket.emit('chat:message', { ...userMsg, chatId });
    }
    socket.emit('chat:typing', { agentId, conversationId: chatId, isTyping: true });

    try {
        AnalyticsRepository.record(agentId, 'invoke', { conversationId: chatId, userId, isNewConv: false });
        analyticsService.emitAnalyticsUpdate({
            userId, agentId,
            totalsDelta: { invokes: 1, messages: 1 },
            point: { type: 'invoke', at: now, chatId }
        });
    } catch {}
    Logger.appendToConversationLog(chatId, `[${now}] [USER] ${message}`);
    Logger.appendToAgentLog(agentId, `[${now}] [INVOKE] conv=${chatId} user=${userId} msg=${message.substring(0, 120)}`);
    HooksService.fire('message_received', { agentId, conversationId: chatId, userId, message });

    const usageContext = {
        source: 'chat',
        userId,
        agentId,
        chatId,
        metadata: catalogEntitlementService.buildUsageMetadata(opts.catalogEntitlement, {
            chatId
        })
    };
    const invokeStart = Date.now();
    const result = await MainAIManager.runAgentPipeline({ agent, user, chatId, message, usageContext });

    if (result.status === 'ai_disabled' || result.status === 'no_provider') {
        const placeholder = '[AI not configured. Enable AI_ENABLED and ensure Ollama is running.]';
        const assistantMsg = { senderId: agentId, type: 'text', content: placeholder, timestamp: new Date().toISOString() };
        ChatRepository.addMessage(chatId, assistantMsg);
        io.to(`chat:${chatId}`).emit('chat:message', { ...assistantMsg, chatId });
        socket.emit('agent:stream', { conversationId: chatId, chunk: placeholder, done: true });
        socket.emit('agent:done', { conversationId: chatId, response: placeholder });
        socket.emit('chat:typing', { agentId, conversationId: chatId, isTyping: false });
        HooksService.fire('agent_response', { agentId, conversationId: chatId, userId, response: placeholder });
        notificationService.createNotification({
            userId, type: 'chat_warning', title: agent?.name || 'Assistant',
            body: 'AI provider is not currently configured.',
            severity: 'warning', meta: { chatId, agentId }
        });
        return;
    }

    if (result.media?.length) {
        const mediaMsg = { senderId: agentId, type: 'media', content: '', media: result.media, timestamp: new Date().toISOString() };
        ChatRepository.addMessage(chatId, { ...mediaMsg });
        io.to(`chat:${chatId}`).emit('chat:message', { ...mediaMsg, chatId });
        socket.emit('agent:media', { conversationId: chatId, media: result.media });
        HooksService.fire('skill_invoked', { agentId, conversationId: chatId, userId, skillName: 'image_gen' });
    }

    const displayText = result.text;
    if (displayText) {
        const assistantMsg = { senderId: agentId, type: 'text', content: displayText, timestamp: new Date().toISOString() };
        ChatRepository.addMessage(chatId, assistantMsg);
        io.to(`chat:${chatId}`).emit('chat:message', { ...assistantMsg, chatId });
        Logger.appendToConversationLog(chatId, `[${new Date().toISOString()}] [ASSISTANT] ${displayText.substring(0, 200)}`);
        Logger.appendToAgentLog(agentId, `[${new Date().toISOString()}] [RESPONSE] conv=${chatId} len=${displayText.length}`);
        socket.emit('agent:stream', { conversationId: chatId, chunk: displayText, done: true });
        socket.emit('agent:done', { conversationId: chatId, response: displayText });
        notificationService.createNotification({
            userId, type: 'chat_message', title: agent?.name || 'Assistant',
            body: displayText.slice(0, 160), severity: 'info', meta: { chatId, agentId }
        });
    } else {
        socket.emit('agent:done', { conversationId: chatId, response: '' });
    }
    socket.emit('chat:typing', { agentId, conversationId: chatId, isTyping: false });
    io.to(`user:${userId}`).emit('conversation:new_message', { conversationId: chatId, agentId, agentName: agent?.name || 'Agent' });
    HooksService.fire('agent_response', { agentId, conversationId: chatId, userId, response: displayText || '[image]' });
    try {
        const promptTokens = result.aiMetadata?.promptTokens || 0;
        const completionTokens = result.aiMetadata?.completionTokens || 0;
        AnalyticsRepository.record(agentId, 'response', {
            conversationId: chatId, userId,
            durationMs: Date.now() - invokeStart,
            promptTokens, completionTokens,
            model: result.aiMetadata?.model
        });
        analyticsService.emitAnalyticsUpdate({
            userId, agentId,
            totalsDelta: { responses: 1, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
            point: { type: 'response', at: new Date().toISOString(), chatId }
        });
    } catch {}
}

function initGatewaySocket(io) {
    HooksService.init(io);

    io.use((socket, next) => authenticateSocket(socket, next, { namespace: '/' }));

    io.on('connection', (socket) => {
        const userId = socket.userId;
        const user = socket.user;
        socketSessionRegistry.registerUserSocket(userId, '/', socket.id);
        socket.join(`user:${userId}`);
        try {
            const userChats = ChatRepository.listForUser(userId);
            for (const c of userChats) {
                socket.join(`chat:${c.id}`);
            }
        } catch (e) { log.debug('Could not join chat rooms', { err: e?.message }); }
        log.info('User connected', { userId, socketId: socket.id });

        socket.on('chat:typing:start', (data) => {
            const { chatId } = data;
            if (!chatId) return;
            const access = resolveUserChatAccess(chatId, userId);
            if (!access.ok) {
                socket.emit('agent:error', { error: access.error, chatId });
                return;
            }
            socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, isTyping: true });
        });
        socket.on('chat:typing:stop', (data) => {
            const { chatId } = data;
            if (!chatId) return;
            const access = resolveUserChatAccess(chatId, userId);
            if (!access.ok) {
                socket.emit('agent:error', { error: access.error, chatId });
                return;
            }
            socket.to(`chat:${chatId}`).emit('chat:typing', { chatId, userId, isTyping: false });
        });
        socket.on('chat:read', (data) => {
            const { chatId, upToTimestamp } = data || {};
            if (!chatId) return;
            const access = resolveUserChatAccess(chatId, userId);
            if (!access.ok) {
                socket.emit('agent:error', { error: access.error, chatId });
                return;
            }
            try {
                ChatRepository.markRead(chatId, userId, upToTimestamp);
                socket.to(`chat:${chatId}`).emit('chat:read:update', { chatId, userId, upToTimestamp });
            } catch (e) { log.debug('chat:read error', { err: e?.message }); }
        });
        socket.on('chat:join', (data) => {
            const { chatId } = data || {};
            if (!chatId) return;
            const access = resolveUserChatAccess(chatId, userId);
            if (!access.ok) {
                socket.emit('agent:error', { error: access.error, chatId });
                return;
            }
            socket.join(`chat:${chatId}`);
        });

        socket.on('chat:send', async (data) => {
            const chatId = data?.chatId;
            let content = data?.content;
            const type = data?.type || 'text';
            const mediaUrl = data?.mediaUrl;
            const media = Array.isArray(data?.media) ? data.media : null;
            const hasMedia = media && media.length > 0;
            const hasMediaUrl = mediaUrl && typeof mediaUrl === 'string';
            log.info('chat:send received', { chatId, contentLen: typeof content === 'string' ? content.length : 0, hasMedia, hasMediaUrl, userId });

            if (!chatId) {
                socket.emit('agent:error', { error: 'chatId required' });
                return;
            }
            if (!content && !hasMedia && !hasMediaUrl) {
                socket.emit('agent:error', { error: 'Content or media required' });
                return;
            }
            if (content != null && (typeof content !== 'string' || content.length > 10000)) {
                socket.emit('agent:error', { error: 'Content must be a string under 10,000 characters' });
                return;
            }
            content = content ?? '';
            const access = resolveUserChatAccess(chatId, userId);
            if (!access.ok) {
                socket.emit('agent:error', { error: access.error, chatId });
                return;
            }
            const chat = access.chat;
            let entitlement;
            try {
                entitlement = catalogEntitlementService.assertUserCanAccessAsset({
                    userId,
                    assetType: 'agent',
                    assetId: chat.ai_agent_id || chat.participant_2,
                    action: 'chat'
                });
            } catch (err) {
                socket.emit('agent:error', { error: err.message || 'Access denied', chatId });
                return;
            }
            const now = new Date().toISOString();
            const userMsg = hasMedia
                ? { senderId: userId, type: 'media', content: '', media, timestamp: now }
                : hasMediaUrl
                    ? { senderId: userId, type: type === 'video' ? 'video' : 'image', content: '', mediaUrl, timestamp: now }
                    : { senderId: userId, type: 'text', content, timestamp: now };
            ChatRepository.addMessage(chatId, userMsg);
            io.to(`chat:${chatId}`).emit('chat:message', { ...userMsg, chatId });
            socket.emit('chat:message', { ...userMsg, chatId });

            const aiContent = hasMedia
                ? content || media.map(m => `[${m.type || 'image'}]`).join(' ')
                : hasMediaUrl
                    ? content || (type === 'video' ? '[video]' : '[image]')
                    : content;
            runAIPipeline(io, socket, chat, userId, aiContent, {
                userMsgAlreadyAdded: true,
                catalogEntitlement: entitlement
            }).catch(err => {
                log.error('chat:send AI pipeline error', { err: err.message, chatId });
                socket.emit('chat:typing', { chatId, conversationId: chatId, isTyping: false });
                socket.emit('agent:error', { error: err.message || 'Failed to process message', chatId, conversationId: chatId });
                notificationService.createNotification({
                    userId,
                    type: 'chat_error',
                    title: 'Chat error',
                    body: err.message || 'Failed to process message',
                    severity: 'error',
                    meta: { chatId }
                });
            });
        });

        socket.on('agent:invoke', async (data) => {
            let chat;
            let agentId;
            try {
                agentId = data?.agentId;
                const message = data?.message;
                const conversationId = data?.conversationId;
                if (!agentId || !message) {
                    socket.emit('agent:error', { error: 'agentId and message required' });
                    return;
                }
                if (typeof message !== 'string' || message.length > 10000) {
                    socket.emit('agent:error', { error: 'Message must be a string under 10,000 characters' });
                    return;
                }
                const agent = AIAgentRepository.getById(agentId);
                if (!agent) {
                    socket.emit('agent:error', { error: 'Agent not found' });
                    return;
                }
                let entitlement;
                try {
                    entitlement = catalogEntitlementService.assertUserCanAccessAsset({
                        userId,
                        assetType: 'agent',
                        assetId: agentId,
                        action: 'chat'
                    });
                } catch (err) {
                    socket.emit('agent:error', { error: err.message || 'Access denied' });
                    return;
                }

                chat = ChatRepository.getOrCreate(userId, agentId);
                const chatId = chat.id;
                const isNewConv = !conversationId;
                if (isNewConv) {
                    socket.emit('conversation:created', { conversationId: chatId });
                    const aiEnabled = Config.get('ai.enabled', false) || process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true';
                    const textProvider = ProviderRegistry.getTextProvider(agent.text_provider);
                    if (aiEnabled && textProvider && agent.greeting_message && agent.greeting_message.trim()) {
                        const greeting = agent.greeting_message.trim();
                        const greetingMsg = { senderId: agentId, type: 'text', content: greeting, timestamp: new Date().toISOString() };
                        ChatRepository.addMessage(chatId, greetingMsg);
                        io.to(`chat:${chatId}`).emit('chat:message', { ...greetingMsg, chatId });
                        socket.emit('agent:stream', { conversationId: chatId, chunk: greeting, done: true });
                        socket.emit('agent:done', { conversationId: chatId, response: greeting, isGreeting: true });
                    }
                }
                await runAIPipeline(io, socket, chat, userId, message, {
                    catalogEntitlement: entitlement
                });
            } catch (err) {
                log.error('agent:invoke error', { err: err.message, stack: err.stack?.substring(0, 300) });
                const errMsg = err.message || 'Unknown error';
                if (chat?.id) Logger.appendToConversationLog(chat.id, `[${new Date().toISOString()}] [ERROR] ${errMsg}`);
                socket.emit('agent:error', { error: errMsg, conversationId: chat?.id || data?.conversationId });
                notificationService.createNotification({
                    userId,
                    type: 'chat_error',
                    title: 'Agent invocation failed',
                    body: errMsg,
                    severity: 'error',
                    meta: { agentId, chatId: chat?.id || null }
                });
                try {
                    if (agentId) {
                        AnalyticsRepository.record(agentId, 'error', { conversationId: chat?.id, error: errMsg.substring(0, 200) });
                        analyticsService.emitAnalyticsUpdate({
                            userId,
                            agentId,
                            totalsDelta: { errors: 1 },
                            point: { type: 'error', at: new Date().toISOString(), chatId: chat?.id || null }
                        });
                    }
                } catch {}
            }
        });

        socket.on('disconnect', () => {
            socketSessionRegistry.unregisterUserSocket(userId, '/', socket.id);
            log.info('User disconnected', { userId, socketId: socket.id });
        });
    });
}

module.exports = { initGatewaySocket };
