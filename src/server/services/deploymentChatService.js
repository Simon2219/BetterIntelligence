const Config = require('../../../config/Config');
const {
    generateId,
    DeploymentRepository,
    AIAgentRepository,
    ChatRepository,
    AnalyticsRepository
} = require('../database');
const ContextBuilder = require('../ai/context/ContextBuilder');
const AIExecution = require('../ai/execution/AIExecution');
const ProviderRegistry = require('../ai/providers/ProviderRegistry');
const HooksService = require('./HooksService');
const realtimeBus = require('./realtimeBus');

const IMAGE_TAG_REGEX = /\[IMAGE:\s*([^\]]+)\]/i;

function createError(statusCode, message) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}

function emitToEmbedRoom(slug, chatId, eventName, payload) {
    const io = realtimeBus.getIO();
    if (!io || !slug || !chatId) return;
    try {
        io.of(`/deploy/${slug}`).to(`deploy:chat:${chatId}`).emit(eventName, payload);
    } catch {
        // no-op: namespace may not have active clients
    }
}

function appendMessage(chatId, message) {
    const id = message.id || generateId(12);
    ChatRepository.addMessage(chatId, { ...message, id });
    return id;
}

function loadDeploymentContextBySlug(slug, opts = {}) {
    const requireEmbedEnabled = opts.requireEmbedEnabled !== false;
    const requireAgentActive = opts.requireAgentActive !== false;

    const dep = DeploymentRepository.getBySlug(slug);
    if (!dep) throw createError(404, 'Deployment not found');
    if (requireEmbedEnabled && !dep.embed_enabled) throw createError(403, 'Embed not enabled');

    const agent = AIAgentRepository.getById(dep.agent_id);
    if (!agent || (requireAgentActive && !agent.is_active)) {
        throw createError(404, 'Agent not found');
    }

    return { dep, agent };
}

function loadDeploymentContextByChatId(chatId) {
    const chat = ChatRepository.getById(chatId);
    if (!chat) throw createError(404, 'Chat not found');
    if (!chat.deployment_id) throw createError(400, 'Chat is not deployment-scoped');

    const dep = DeploymentRepository.getById(chat.deployment_id);
    if (!dep) throw createError(404, 'Deployment not found');

    const agent = AIAgentRepository.getById(dep.agent_id);
    if (!agent) throw createError(404, 'Agent not found');

    return { chat, dep, agent };
}

function resolveOrCreateEmbedConversation({ slug, conversationId, embedSessionId }) {
    const { dep, agent } = loadDeploymentContextBySlug(slug, {
        requireEmbedEnabled: true,
        requireAgentActive: true
    });

    const requestedConversationId = String(conversationId || '').trim();
    let chat = requestedConversationId ? ChatRepository.getById(requestedConversationId) : null;
    const isValidRequestedChat = !!(
        chat &&
        parseInt(chat.deployment_id, 10) === parseInt(dep.id, 10) &&
        String(chat.ai_agent_id || '').trim() === String(dep.agent_id || '').trim()
    );

    if (!isValidRequestedChat) {
        const sessionId = String(embedSessionId || `embed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
        chat = ChatRepository.getOrCreate(null, dep.agent_id, {
            embedSessionId: sessionId,
            deploymentId: dep.id
        });
    }

    return { dep, agent, chat };
}

async function runAIPipeline({ dep, agent, chat, prompt, usageSource, assistantMetadata = {}, emitToEmbed = true }) {
    const resultMessageIds = [];
    const safePrompt = String(prompt || '').trim();

    const aiEnabled = Config.get('ai.enabled', false) || process.env.AI_ENABLED === '1' || process.env.AI_ENABLED === 'true';
    const textProvider = ProviderRegistry.getTextProvider(agent.text_provider);
    if (!aiEnabled || !textProvider) {
        const fallback = '[AI not configured]';
        const fallbackId = appendMessage(chat.id, {
            senderId: agent.id,
            type: 'text',
            content: fallback,
            timestamp: new Date().toISOString(),
            metadata: { ...assistantMetadata, source: assistantMetadata.source || 'ai_unavailable' }
        });
        resultMessageIds.push(fallbackId);
        if (emitToEmbed) {
            emitToEmbedRoom(dep.slug, chat.id, 'agent:stream', { conversationId: chat.id, chunk: fallback, done: true });
            emitToEmbedRoom(dep.slug, chat.id, 'agent:done', { conversationId: chat.id, response: fallback });
        }
        return { text: fallback, media: [], messageIds: resultMessageIds, status: 'unavailable' };
    }

    const invokeStart = Date.now();
    let textResult;
    try {
        const { systemPrompt, messages } = ContextBuilder.buildTextContext(agent, null, chat.id, safePrompt);
        textResult = await AIExecution.executeText({
            agent,
            systemPrompt,
            messages,
            usageContext: {
                source: usageSource || 'embed',
                agentId: agent.id,
                chatId: chat.id
            }
        });
    } catch (err) {
        const fallbackError = `[AI temporarily unavailable: ${err.message || 'model or service not ready'}]`;
        const fallbackId = appendMessage(chat.id, {
            senderId: agent.id,
            type: 'text',
            content: fallbackError,
            timestamp: new Date().toISOString(),
            metadata: { ...assistantMetadata, source: 'ai_error', error: true }
        });
        resultMessageIds.push(fallbackId);
        if (emitToEmbed) {
            emitToEmbedRoom(dep.slug, chat.id, 'agent:stream', { conversationId: chat.id, chunk: fallbackError, done: true });
            emitToEmbedRoom(dep.slug, chat.id, 'agent:done', { conversationId: chat.id, response: fallbackError });
        }
        try {
            AnalyticsRepository.record(agent.id, 'error', {
                conversationId: chat.id,
                source: usageSource || 'embed',
                error: String(err.message || '').substring(0, 200)
            });
        } catch {}
        return { text: fallbackError, media: [], messageIds: resultMessageIds, status: 'error', error: err };
    }

    let displayText = String(textResult.text || '');
    const media = [];
    const imageMatch = displayText.match(IMAGE_TAG_REGEX);
    const imageDescription = imageMatch?.[1]?.trim();
    if (imageDescription && imageDescription.length >= 2 && agent.image_provider && ProviderRegistry.getImageProvider(agent.image_provider)) {
        try {
            const imagePrompt = ContextBuilder.buildImagePrompt(imageDescription, agent);
            const imgResult = await AIExecution.executeImage({
                agent,
                conversationId: chat.id,
                prompt: imagePrompt,
                usageContext: {
                    source: `${usageSource || 'embed'}-image`,
                    agentId: agent.id,
                    chatId: chat.id
                }
            });
            const mediaId = appendMessage(chat.id, {
                senderId: agent.id,
                type: 'media',
                content: '',
                media: imgResult.media,
                timestamp: new Date().toISOString(),
                metadata: { ...assistantMetadata, source: 'ai_generated_media' }
            });
            resultMessageIds.push(mediaId);
            media.push(...(imgResult.media || []));
            if (emitToEmbed) {
                emitToEmbedRoom(dep.slug, chat.id, 'agent:media', { conversationId: chat.id, media: imgResult.media });
            }
        } catch {
            // Keep text response even if image generation fails.
        }
    }

    displayText = displayText.replace(IMAGE_TAG_REGEX, '').trim();
    if (displayText) {
        const textId = appendMessage(chat.id, {
            senderId: agent.id,
            type: 'text',
            content: displayText,
            timestamp: new Date().toISOString(),
            metadata: { ...assistantMetadata, source: assistantMetadata.source || 'ai_generated' }
        });
        resultMessageIds.push(textId);
        if (emitToEmbed) {
            emitToEmbedRoom(dep.slug, chat.id, 'agent:stream', { conversationId: chat.id, chunk: displayText, done: true });
            emitToEmbedRoom(dep.slug, chat.id, 'agent:done', { conversationId: chat.id, response: displayText });
        }
    } else if (emitToEmbed) {
        emitToEmbedRoom(dep.slug, chat.id, 'agent:done', { conversationId: chat.id, response: '' });
    }

    try {
        AnalyticsRepository.record(agent.id, 'response', {
            conversationId: chat.id,
            source: usageSource || 'embed',
            durationMs: Date.now() - invokeStart,
            promptTokens: textResult.aiMetadata?.promptTokens || 0,
            completionTokens: textResult.aiMetadata?.completionTokens || 0
        });
    } catch {}

    return {
        text: displayText,
        media,
        messageIds: resultMessageIds,
        status: 'ok',
        aiMetadata: textResult.aiMetadata
    };
}

async function handleEmbedUserMessage({ dep, agent, chat, embedSessionId, message, source = 'embed-rest', emitToEmbed = true }) {
    const safeMessage = String(message || '').trim();
    if (!safeMessage) throw createError(400, 'message required');
    if (safeMessage.length > 10000) throw createError(400, 'Message too long (max 10,000 characters)');

    const userMessageId = appendMessage(chat.id, {
        senderId: `embed:${String(embedSessionId || chat.embed_session_id || chat.id)}`,
        type: 'text',
        content: safeMessage,
        timestamp: new Date().toISOString(),
        metadata: { source: 'embed_user' }
    });

    try {
        AnalyticsRepository.record(agent.id, 'invoke', {
            conversationId: chat.id,
            source
        });
    } catch {}
    HooksService.fire('deploy_request', {
        agentId: agent.id,
        deploymentId: dep.id,
        slug: dep.slug,
        message: safeMessage
    });

    const aiResult = await runAIPipeline({
        dep,
        agent,
        chat,
        prompt: safeMessage,
        usageSource: source,
        emitToEmbed
    });

    HooksService.fire('agent_response', {
        agentId: agent.id,
        conversationId: chat.id,
        response: aiResult.text || '[image]'
    });

    return {
        conversationId: chat.id,
        response: aiResult.text,
        mode: 'embed',
        messageIds: [userMessageId, ...aiResult.messageIds],
        status: aiResult.status
    };
}

async function sendOperatorReply({ chatId, operatorUserId, mode, content, useLatestUserMessage = false }) {
    const { chat, dep, agent } = loadDeploymentContextByChatId(chatId);
    const normalizedMode = String(mode || '').trim().toLowerCase();
    if (!['manual', 'generate'].includes(normalizedMode)) {
        throw createError(400, 'mode must be "manual" or "generate"');
    }

    const trimmedContent = String(content || '').trim();
    const messageIds = [];

    if (normalizedMode === 'manual') {
        if (!trimmedContent) throw createError(400, 'content is required for manual mode');
        if (trimmedContent.length > 10000) throw createError(400, 'content too long (max 10,000 characters)');

        const manualId = appendMessage(chat.id, {
            senderId: agent.id,
            type: 'text',
            content: trimmedContent,
            timestamp: new Date().toISOString(),
            metadata: {
                source: 'operator_manual',
                operatorUserId: String(operatorUserId || '')
            }
        });
        messageIds.push(manualId);
        emitToEmbedRoom(dep.slug, chat.id, 'agent:stream', { conversationId: chat.id, chunk: trimmedContent, done: true });
        emitToEmbedRoom(dep.slug, chat.id, 'agent:done', { conversationId: chat.id, response: trimmedContent });
        return {
            chatId: chat.id,
            mode: 'manual',
            status: 'ok',
            messageIds
        };
    }

    let prompt = trimmedContent;
    if (!prompt && useLatestUserMessage) {
        prompt = String(ChatRepository.getLatestIncomingMessageForDeploymentChat(chat.id)?.content || '').trim();
    }
    if (!prompt) throw createError(400, 'No prompt available to generate response');

    if (trimmedContent) {
        const operatorPromptId = appendMessage(chat.id, {
            senderId: String(operatorUserId || 'operator'),
            type: 'text',
            content: trimmedContent,
            timestamp: new Date().toISOString(),
            metadata: {
                source: 'operator_generate_prompt',
                operatorUserId: String(operatorUserId || '')
            }
        });
        messageIds.push(operatorPromptId);
    }

    try {
        AnalyticsRepository.record(agent.id, 'invoke', {
            conversationId: chat.id,
            source: 'deploy-operator-generate',
            userId: String(operatorUserId || null)
        });
    } catch {}
    HooksService.fire('message_received', {
        agentId: agent.id,
        conversationId: chat.id,
        userId: String(operatorUserId || ''),
        message: prompt
    });

    const aiResult = await runAIPipeline({
        dep,
        agent,
        chat,
        prompt,
        usageSource: 'deploy-operator-generate',
        assistantMetadata: {
            source: 'operator_generated',
            operatorUserId: String(operatorUserId || '')
        },
        emitToEmbed: true
    });
    messageIds.push(...aiResult.messageIds);

    HooksService.fire('agent_response', {
        agentId: agent.id,
        conversationId: chat.id,
        response: aiResult.text || '[image]'
    });

    return {
        chatId: chat.id,
        mode: 'generate',
        status: aiResult.status,
        response: aiResult.text,
        messageIds
    };
}

module.exports = {
    loadDeploymentContextBySlug,
    loadDeploymentContextByChatId,
    resolveOrCreateEmbedConversation,
    handleEmbedUserMessage,
    sendOperatorReply
};

