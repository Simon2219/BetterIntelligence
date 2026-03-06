export const CHAT_SOCKET_EVENTS = [
    'agent:stream',
    'agent:done',
    'agent:media',
    'agent:error',
    'chat:typing',
    'chat:message',
    'disconnect',
    'connect_error'
];

export function clearChatSocketListeners(socket) {
    if (!socket) return;
    CHAT_SOCKET_EVENTS.forEach((eventName) => socket.off(eventName));
}
