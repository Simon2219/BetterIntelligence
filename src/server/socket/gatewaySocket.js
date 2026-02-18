/**
 * Gateway-style Socket.io handler
 * Events: agent:invoke, agent:stream, agent:done, chat:message, chat:typing, deploy:message, hooks:event
 */
const jwtService = require('../services/jwtService');
const { UserSystem, AIAgentSystem, ConversationSystem, MessageSystem } = require('../database/Database');
const HooksService = require('../services/HooksService');
const log = require('../services/Logger')('socket');

function initGatewaySocket(io) {
    HooksService.init(io);

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) return next(new Error('Authentication required'));
        const payload = jwtService.verifyAccessToken(token);
        if (!payload) return next(new Error('Invalid token'));
        const user = UserSystem.getById(payload.userId);
        if (!user || !user.is_active) return next(new Error('User not found'));
        socket.userId = user.id;
        socket.username = user.username;
        next();
    });

    io.on('connection', (socket) => {
        const userId = socket.userId;
        socket.join(`user:${userId}`);
        log.info('User connected', { userId, socketId: socket.id });

        socket.on('agent:invoke', async (data) => {
            try {
                const { agentId, conversationId, message } = data;
                if (!agentId || !message) {
                    socket.emit('agent:error', { error: 'agentId and message required' });
                    return;
                }
                const agent = AIAgentSystem.getById(agentId);
                if (!agent || (agent.user_id && agent.user_id.toUpperCase() !== userId.toUpperCase())) {
                    socket.emit('agent:error', { error: 'Agent not found' });
                    return;
                }
                let convId = conversationId;
                if (!convId) {
                    const conv = ConversationSystem.create(agentId, userId);
                    convId = conv.id;
                    socket.emit('conversation:created', { conversationId: convId });
                }
                MessageSystem.add(convId, 'user', message);
                HooksService.fire('message_received', { agentId, conversationId: convId, userId, message });

                socket.emit('chat:typing', { agentId, conversationId: convId, isTyping: true });
                socket.emit('agent:stream', { conversationId: convId, chunk: '', done: false });
                MessageSystem.add(convId, 'assistant', '[Streaming placeholder - AI not wired yet]');
                socket.emit('agent:stream', { conversationId: convId, chunk: '[Streaming placeholder - AI not wired yet]', done: true });
                socket.emit('agent:done', { conversationId: convId, response: '[Streaming placeholder - AI not wired yet]' });
                socket.emit('chat:typing', { agentId, conversationId: convId, isTyping: false });
                HooksService.fire('agent_response', { agentId, conversationId: convId, userId, response: '[Placeholder]' });
            } catch (err) {
                log.error('agent:invoke error', { err: err.message });
                socket.emit('agent:error', { error: err.message });
            }
        });

        socket.on('disconnect', () => log.info('User disconnected', { userId, socketId: socket.id }));
    });
}

module.exports = { initGatewaySocket };
