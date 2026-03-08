export function createChatCreator({ api, showToast, navigate } = {}) {
    return async function createChatForAgent(agentId, opts = {}) {
        const { replace = false, fallbackPath = '/chat' } = opts;
        try {
            const { data } = await api('/chats', {
                method: 'POST',
                body: JSON.stringify({ agentId, forceNew: true })
            });
            navigate(`/chat/${data.id}`, replace ? { replace: true } : {});
            return data;
        } catch (err) {
            showToast(err.message || 'Failed to open chat', 'error');
            navigate(fallbackPath, replace ? { replace: true } : {});
            throw err;
        }
    };
}
