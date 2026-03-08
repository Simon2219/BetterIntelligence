export function parseMetadata(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export function messageRole(message, chat, currentUser) {
    const sender = String(message.senderId || '').trim();
    if (!sender) return 'assistant';
    if (currentUser && String(currentUser.id || '').toUpperCase() === sender.toUpperCase()) return 'user';
    if (sender.startsWith('embed:')) return 'user';
    if (chat?.chatType === 'deployment') {
        const agentId = String(chat.ai_agent_id || chat.agent_id || '').toUpperCase();
        if (agentId && sender.toUpperCase() !== agentId) return 'user';
    }
    return 'assistant';
}

export function createChatMessageRenderer({
    escapeHtml,
    simpleMarkdown,
    formatTimestamp,
    resolveMediaUrl,
    copyIcon
} = {}) {
    return function renderChatMessage(message) {
        const meta = parseMetadata(message.metadata);
        const media = message.media || meta.media || [];
        const mediaUrl = message.mediaUrl || message.media_url;
        const msgType = message.type;
        const mediaItems = media.length ? media : (mediaUrl ? [{ type: msgType || 'image', url: mediaUrl }] : []);
        const isMediaMsg = msgType === 'image' || msgType === 'video' || msgType === 'media' || mediaItems.length > 0;
        const isAssistant = message.role === 'assistant';
        let html = isAssistant ? simpleMarkdown(message.content || '') : escapeHtml(message.content || '');

        mediaItems.forEach((med, idx) => {
            const url = resolveMediaUrl(med.url || med.mediaUrl);
            if (!url) return;
            const safeUrl = escapeHtml(url);
            if (med.type === 'video') {
                html += `<div class="chat-msg__media-thumb chat-msg__media-thumb--video" data-index="${idx}"><video src="${safeUrl}" muted></video></div>`;
                return;
            }
            html += `<img src="${safeUrl}" alt="Media" class="chat-msg__media-thumb chat-msg__image" data-index="${idx}">`;
        });

        if (!html.trim() && !mediaItems.length) return '';
        const ts = formatTimestamp(message.created_at || message.timestamp);
        const actions = isAssistant ? `<div class="chat-msg__actions"><button class="btn-copy-msg" title="Copy">${copyIcon}</button></div>` : '';
        const dataAttrs = isMediaMsg
            ? ` data-msg-type="${escapeHtml(msgType || 'media')}" data-media-url="${escapeHtml(mediaUrl || '')}" data-media="${escapeHtml(JSON.stringify(mediaItems))}"`
            : '';
        return `<div class="chat-msg chat-msg--${message.role}"${dataAttrs}><div class="chat-msg__content">${html}</div>${actions}<span class="chat-msg__time">${ts}</span></div>`;
    };
}
