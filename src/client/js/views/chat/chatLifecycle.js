export function getChatRouteId(pathLike) {
    const pathname = String(pathLike || '').split('?')[0];
    const match = pathname.match(/^\/chat\/([^/]+)$/);
    if (!match?.[1]) return null;
    const id = decodeURIComponent(match[1]).trim();
    if (!id || id.toLowerCase() === 'new') return null;
    return id;
}

export function createChatSummaryOnCloseTrigger({
    getCurrentUser,
    getChatSummaryStamp,
    setChatSummaryStamp,
    getChatSummaryCooldownMs,
    api
} = {}) {
    return function triggerChatSummaryOnClose(fromPathLike, toPathLike) {
        if (!getCurrentUser?.()) return;
        const fromChatId = getChatRouteId(fromPathLike);
        if (!fromChatId) return;
        const toChatId = getChatRouteId(toPathLike);
        if (toChatId && toChatId.toUpperCase() === fromChatId.toUpperCase()) return;

        const now = Date.now();
        const last = getChatSummaryStamp?.(fromChatId) || 0;
        const cooldownMs = getChatSummaryCooldownMs?.() || 7000;
        if (now - last < cooldownMs) return;
        setChatSummaryStamp?.(fromChatId, now);

        api?.(`/chats/${encodeURIComponent(fromChatId)}/summary`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'user_close' })
        }).catch((err) => {
            console.debug('Chat summary on close failed', {
                chatId: fromChatId,
                err: err?.message || String(err)
            });
        });
    };
}
